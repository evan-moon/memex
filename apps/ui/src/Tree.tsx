import { ChevronDown, ChevronRight, FileText, FolderLock, FolderPen } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, type VaultRoot, type VaultTree } from './api.ts';
import { ContextMenu, type MenuAt, type MenuItem } from './ContextMenu.tsx';
import { useT } from './i18n.ts';
import { closeTab, openTab } from './tabs.ts';

const ROW =
  'flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-[13px] hover:bg-surface-muted';

type Filter = 'all' | 'agent' | 'person';

const Root = ({
  root,
  filter,
  onNavigate,
  onMenu,
  onFolderMenu,
  expandAll,
}: {
  root: VaultRoot;
  filter: Filter;
  expandAll: number;
  onNavigate?: () => void;
  onMenu: (note: { id: number; title: string }, at: MenuAt) => void;
  onFolderMenu: (folder: { path: string; name: string }, at: MenuAt) => void;
}) => {
  const t = useT();
  const { id = '' } = useParams();
  const [open, setOpen] = useState<Set<string>>(new Set());
  // A borrowed source is usually somebody else's repository, so it starts shut:
  // the vault is what someone came here to look at.
  const [expanded, setExpanded] = useState(root.writable);

  // Opening everything at once is the one folder action that costs nothing and
  // moves nothing. The timestamp is the trigger: asking twice should open it
  // again even if nothing else changed.
  useEffect(() => {
    if (expandAll === 0) return;
    setExpanded(true);
    setOpen(new Set(root.folders.map((folder) => folder.path)));
  }, [expandAll, root.folders]);

  const toggle = (path: string) =>
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });

  const notesIn = (path: string) =>
    (root.notes[path] ?? []).filter((note) => filter === 'all' || note.writer === filter);

  const holds = (path: string) =>
    Object.keys(root.notes).some(
      (at) => (at === path || at.startsWith(`${path}/`)) && notesIn(at).length > 0,
    );

  const shown = root.folders.filter((folder) => {
    const parts = folder.path.split('/');
    return (
      parts.slice(0, -1).every((_, at) => open.has(parts.slice(0, at + 1).join('/'))) &&
      holds(folder.path)
    );
  });

  const Note = ({ note, indent }: { note: { id: number; title: string }; indent: number }) => (
    <Link
      to={`/note/${note.id}`}
      onClick={onNavigate}
      onContextMenu={(event) => {
        event.preventDefault();
        onMenu(note, { x: event.clientX, y: event.clientY });
      }}
      className={`${ROW} ${Number(id) === note.id ? 'bg-accent-soft text-foreground' : 'text-muted'}`}
      style={{ paddingLeft: `${indent}rem` }}
    >
      <FileText size={12} className="shrink-0 opacity-60" />
      <span className="truncate">{note.title}</span>
    </Link>
  );

  return (
    <div className="mb-1">
      {/* The icon is the whole distinction: a pen means memex can write here, a
          lock means it only reads and whatever made the file will change it. */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        title={root.writable ? t.tree.writable(root.path) : t.tree.readonly(root.path)}
        className={`${ROW} font-medium`}
      >
        {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        {root.writable ? (
          <FolderPen size={13} className="text-primary" />
        ) : (
          <FolderLock size={13} className="text-muted" />
        )}
        <span className="truncate">{root.name}</span>
        <span className="ml-auto text-[11px] text-muted">{root.count}</span>
      </button>
      {expanded ? (
        <div className="space-y-0.5">
          {shown.map((folder) => (
            <div key={folder.path}>
              <button
                type="button"
                onClick={() => toggle(folder.path)}
                onContextMenu={(event) => {
                  event.preventDefault();
                  onFolderMenu(folder, { x: event.clientX, y: event.clientY });
                }}
                className={ROW}
                style={{ paddingLeft: `${folder.depth * 0.75 + 1.2}rem` }}
              >
                {open.has(folder.path) ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                <span className="truncate">{folder.name}</span>
                <span className="ml-auto text-[11px] text-muted">
                  {filter === 'all' ? folder.count : notesIn(folder.path).length}
                </span>
              </button>
              {open.has(folder.path)
                ? notesIn(folder.path).map((note) => (
                    <Note key={note.id} note={note} indent={folder.depth * 0.75 + 2.3} />
                  ))
                : null}
            </div>
          ))}
          {notesIn('').map((note) => (
            <Note key={note.id} note={note} indent={1.2} />
          ))}
        </div>
      ) : null}
    </div>
  );
};

// The vault as it sits on disk, one root per place memex reads from. Topics and
// layers are memex's reading of the notes; this is the shelf they are on.
export const Tree = ({
  tree,
  onNavigate,
  onHistory,
}: {
  tree: VaultTree;
  onNavigate?: () => void;
  onHistory: (note: { id: number; title: string }) => void;
}) => {
  const t = useT();
  const navigate = useNavigate();
  // memex's own addition on top of the file tree: most of this was written by an
  // agent, and telling that apart is the question a file manager cannot answer.
  const [filter, setFilter] = useState<Filter>('all');
  const [menu, setMenu] = useState<{ note: { id: number; title: string }; at: MenuAt } | null>(
    null,
  );
  const [folderMenu, setFolderMenu] = useState<{
    root: VaultRoot;
    folder: { path: string; name: string };
    at: MenuAt;
  } | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [expandAll, setExpandAll] = useState<{ root: string; at: number } | null>(null);

  const writableRoot = tree.roots.find((root) => root.writable) ?? null;
  const rootOf = (id: number) =>
    tree.roots.find((root) =>
      Object.values(root.notes).some((list) => list.some((n) => n.id === id)),
    );

  const run = (work: Promise<unknown>) => {
    setFailed(null);
    work
      .then(() => window.location.reload())
      .catch((cause: unknown) => {
        setFailed(cause instanceof Error ? cause.message : String(cause));
      });
  };

  const itemsFor = (note: { id: number; title: string }): MenuItem[] => {
    const home = rootOf(note.id);
    // What memex can honestly offer here. Duplicating or renaming a borrowed
    // file would write into someone else's repository, so those are left out
    // rather than shown and refused.
    const mine = home?.writable === true;
    return [
      { kind: 'item', label: t.menu.open, onPick: () => navigate(`/note/${note.id}`) },
      {
        kind: 'item',
        label: t.menu.openTab,
        onPick: () => openTab(note, { background: true }),
      },
      { kind: 'divider' },
      ...(mine
        ? ([
            {
              kind: 'item',
              label: t.menu.duplicate,
              onPick: () => run(api.duplicateNote(note.id)),
            },
            {
              kind: 'item',
              label: t.menu.rename,
              onPick: () => {
                const next = window.prompt(t.menu.renamePrompt, note.title);
                if (next !== null && next.trim() !== '') run(api.renameNote(note.id, next));
              },
            },
          ] as MenuItem[])
        : []),
      {
        kind: 'item',
        label: t.menu.move,
        onPick: () => {
          const folder = window.prompt(t.menu.movePrompt, writableRoot?.path ?? '');
          if (folder !== null && folder.trim() !== '') run(api.moveNote(note.id, folder.trim()));
        },
      },
      { kind: 'divider' },
      {
        kind: 'item',
        label: t.menu.copyPath,
        onPick: () => {
          const found = home?.path ?? '';
          navigator.clipboard.writeText(found).catch(() => {});
        },
      },
      { kind: 'divider' },
      { kind: 'item', label: t.menu.history, onPick: () => onHistory(note) },
      { kind: 'divider' },
      { kind: 'item', label: t.menu.openDefault, onPick: () => run(api.openNote(note.id)) },
      { kind: 'item', label: t.menu.reveal, onPick: () => run(api.revealNote(note.id)) },
      ...(mine
        ? ([
            { kind: 'divider' },
            {
              kind: 'item',
              label: t.menu.delete,
              danger: true,
              // The one item that cannot be undone from inside the app, so it
              // is the one that asks. Naming the note in the question is what
              // stops a mis-click from being a shrug.
              onPick: () => {
                if (window.confirm(t.menu.deletePrompt(note.title))) {
                  closeTab(note.id);
                  run(api.deleteNote(note.id));
                }
              },
            },
          ] as MenuItem[])
        : []),
    ];
  };

  // A folder is not a row in the database — it exists because notes sit in it.
  // So it can be shown and expanded, and the rest of what Obsidian offers here
  // would mean moving every note inside it. That is a bigger promise than this
  // menu should make.
  const folderItems = (root: VaultRoot, folder: { path: string; name: string }): MenuItem[] => [
    {
      kind: 'item',
      label: t.menu.expandAll,
      onPick: () => setExpandAll({ root: root.id, at: Date.now() }),
    },
    { kind: 'divider' },
    {
      kind: 'item',
      label: t.menu.copyPath,
      onPick: () => {
        navigator.clipboard.writeText(`${root.path}/${folder.path}`).catch(() => {});
      },
    },
    {
      kind: 'item',
      label: t.menu.reveal,
      onPick: () => run(api.revealFolder(root.path, folder.path)),
    },
  ];

  return (
    <div>
      <div className="mb-2 flex gap-1 px-2">
        {(['all', 'agent', 'person'] as const).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setFilter(option)}
            className={`rounded-full px-2 py-0.5 text-[11px] ${
              filter === option
                ? 'bg-accent-soft text-foreground'
                : 'text-muted hover:bg-surface-muted'
            }`}
          >
            {t.tree[option]}
          </button>
        ))}
      </div>
      {tree.roots.map((root) => (
        <Root
          key={root.id}
          root={root}
          filter={filter}
          onNavigate={onNavigate}
          onMenu={(note, at) => setMenu({ note, at })}
          onFolderMenu={(folder, at) => setFolderMenu({ root, folder, at })}
          expandAll={expandAll?.root === root.id ? expandAll.at : 0}
        />
      ))}
      {menu === null ? null : (
        <ContextMenu at={menu.at} items={itemsFor(menu.note)} onClose={() => setMenu(null)} />
      )}
      {folderMenu === null ? null : (
        <ContextMenu
          at={folderMenu.at}
          items={folderItems(folderMenu.root, folderMenu.folder)}
          onClose={() => setFolderMenu(null)}
        />
      )}
      {failed === null ? null : <p className="px-2 pt-2 text-[11px] text-danger">{failed}</p>}
      {tree.roots.length === 0 ? <p className="px-2 text-xs text-muted">{t.tree.empty}</p> : null}
    </div>
  );
};
