#!/usr/bin/env python3
"""
Process Second Brain notes for optimal memex indexing:
1. Strip Notion UUID suffixes from filenames (and folders)
2. Convert inline metadata to YAML frontmatter (memory + interview files)
3. Remove broken Notion internal links
"""

import os
import re
import shutil
from pathlib import Path
from collections import defaultdict

VAULT = Path("/Users/evan/Documents/Second Brain")
UUID_PAT = re.compile(r' [0-9a-f]{32}(?=\.md$|$)', re.IGNORECASE)
NOTION_LINK_PAT = re.compile(r'\s*\(https://www\.notion\.so/[^\)]+\)', re.IGNORECASE)
KOREAN_DATE_PAT = re.compile(r'(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일')

DRY_RUN = False


# ─── Helpers ─────────────────────────────────────────────────────────────────

def strip_uuid(name: str) -> str:
    return UUID_PAT.sub('', name)


def parse_korean_date(text: str) -> str | None:
    m = KOREAN_DATE_PAT.search(text)
    if not m:
        return None
    y, mo, d = m.group(1), m.group(2).zfill(2), m.group(3).zfill(2)
    return f"{y}-{mo}-{d}"


def extract_inline_meta(lines: list[str]) -> tuple[dict, list[str]]:
    """Pull 기록일/태그/면접일자/회사/관련 인물 lines out of body, return (meta, remaining_lines)."""
    meta: dict[str, str] = {}
    remaining: list[str] = []

    FIELDS = {
        '기록일': 'date',
        '면접일자': 'date',
        '태그': 'tags',
        '회사': 'company',
        '관련 인물': 'related_person',
    }

    for line in lines:
        matched = False
        for kor, key in FIELDS.items():
            if line.startswith(f'{kor}:'):
                value = line[len(kor) + 1:].strip()
                # Strip Notion links embedded in the value
                value = NOTION_LINK_PAT.sub('', value).strip()
                if value:
                    if key == 'date':
                        parsed = parse_korean_date(value)
                        meta[key] = parsed if parsed else value
                    elif key == 'tags':
                        meta[key] = value
                    else:
                        meta[key] = value
                matched = True
                break
        if not matched:
            remaining.append(line)

    return meta, remaining


def build_frontmatter(meta: dict, extra: dict | None = None) -> str:
    lines = ['---']
    if extra:
        meta = {**extra, **meta}
    for k, v in meta.items():
        if k == 'tags':
            tags = [t.strip() for t in v.split(',')]
            lines.append(f'tags: [{", ".join(tags)}]')
        else:
            lines.append(f'{k}: {v}')
    lines.append('---')
    return '\n'.join(lines)


def process_content(content: str, category: str | None = None) -> str:
    """Add frontmatter and clean Notion links from file content."""
    # Already has frontmatter — add title if missing, then clean Notion links
    if content.lstrip().startswith('---'):
        cleaned = NOTION_LINK_PAT.sub('', content)
        # If frontmatter has no title, inject it from H1
        fm_end = cleaned.index('\n---', 3) if '\n---' in cleaned[3:] else -1
        if fm_end != -1:
            fm_block = cleaned[3:fm_end]
            if not re.search(r'^title:', fm_block, re.MULTILINE):
                h1 = re.search(r'^#\s+(.+)$', cleaned[fm_end:], re.MULTILINE)
                if h1:
                    title_line = f'title: {h1.group(1).strip()}'
                    cleaned = cleaned[:3] + '\n' + title_line + fm_block + cleaned[fm_end:]
        return cleaned

    lines = content.split('\n')

    # Pull out H1 title if present
    title_line = None
    body_lines = []
    for line in lines:
        if title_line is None and line.startswith('# '):
            title_line = line
        else:
            body_lines.append(line)

    # Strip Notion links from remaining body
    body_lines = [NOTION_LINK_PAT.sub('', l) for l in body_lines]

    # Extract inline metadata
    meta, body_lines = extract_inline_meta(body_lines)

    extra = {}
    if category:
        extra['category'] = category
    if title_line:
        extra['title'] = title_line[2:].strip()  # strip '# '

    if not meta and not extra:
        cleaned = NOTION_LINK_PAT.sub('', content)
        return cleaned

    frontmatter = build_frontmatter(meta, extra)

    parts = [frontmatter]
    if title_line:
        parts.append('')
        parts.append(title_line)
    # Trim leading blank lines from body
    while body_lines and body_lines[0].strip() == '':
        body_lines.pop(0)
    if body_lines:
        parts.append('')
        parts.extend(body_lines)

    return '\n'.join(parts)


# ─── Rename logic ─────────────────────────────────────────────────────────────

def collect_rename_plan() -> list[tuple[Path, Path]]:
    """Build (old_path, new_path) pairs for files and folders needing renaming."""
    renames: list[tuple[Path, Path]] = []

    # ── Folders (process depth-first, deepest first so renames don't break sub-paths)
    all_dirs = sorted(
        [d for d in VAULT.rglob('*') if d.is_dir() and UUID_PAT.search(d.name)],
        key=lambda p: -len(p.parts),
    )
    for d in all_dirs:
        new_name = strip_uuid(d.name)
        new_path = d.parent / new_name
        if new_path != d and not new_path.exists():
            renames.append((d, new_path))

    # ── Files
    # Group files by their post-strip name to detect conflicts
    groups: dict[Path, list[Path]] = defaultdict(list)
    for f in VAULT.rglob('*.md'):
        if not UUID_PAT.search(f.name):
            continue
        new_name = strip_uuid(f.name)
        groups[f.parent / new_name].append(f)

    for target, sources in groups.items():
        if len(sources) == 1:
            if target != sources[0]:
                renames.append((sources[0], target))
        else:
            # Conflict: disambiguate with date from content
            for src in sources:
                try:
                    text = src.read_text(encoding='utf-8')
                except Exception:
                    text = ''
                date = None
                for line in text.split('\n')[:10]:
                    for field in ('기록일:', '면접일자:'):
                        if line.startswith(field):
                            date = parse_korean_date(line)
                            break
                    if date:
                        break

                stem = target.stem
                if date:
                    new_path = target.parent / f'{stem} {date}{target.suffix}'
                else:
                    # Fallback: keep short UUID prefix (8 chars)
                    short_id = UUID_PAT.search(src.stem).group(0).strip()[:8]
                    new_path = target.parent / f'{stem} {short_id}{target.suffix}'

                if new_path != src:
                    renames.append((src, new_path))

    return renames


# ─── Content processing ───────────────────────────────────────────────────────

def get_category(path: Path) -> str | None:
    parts = path.relative_to(VAULT).parts
    if not parts:
        return None
    folder = parts[0]
    return {
        'memory': '대화',
        'interviews': '면접',
        'idea': '아이디어',
        'dev': '개발',
    }.get(folder)


def process_vault_content():
    """Process all .md files: add frontmatter, clean Notion links."""
    for f in VAULT.rglob('*.md'):
        if '.memex' in f.parts:
            continue
        try:
            original = f.read_text(encoding='utf-8')
        except Exception as e:
            print(f'  SKIP (read error): {f.name}: {e}')
            continue

        category = get_category(f)
        processed = process_content(original, category)

        if processed != original:
            if not DRY_RUN:
                f.write_text(processed, encoding='utf-8')
            print(f'  updated: {f.relative_to(VAULT)}')


# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    print(f'Vault: {VAULT}')
    print(f'Dry run: {DRY_RUN}\n')

    # 1. Rename files/folders
    renames = collect_rename_plan()
    print(f'=== Renames: {len(renames)} ===')
    for old, new in renames[:10]:
        print(f'  {old.name!r:60s} → {new.name!r}')
    if len(renames) > 10:
        print(f'  ... and {len(renames) - 10} more')

    if not DRY_RUN:
        for old, new in renames:
            if old.exists():
                os.rename(old, new)
        print('Renames done.\n')

    # 2. Process content (frontmatter + clean Notion links)
    print('\n=== Content updates ===')
    process_vault_content()
    print('Content updates done.\n')

    print('All done.')


if __name__ == '__main__':
    main()
