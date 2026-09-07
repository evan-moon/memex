import { ChevronDown, ChevronRight, FileText, FolderLock, FolderPen } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AskName, type Question } from './AskName.tsx';
import { api, type TreeFolder, type VaultRoot, type VaultTree } from './api.ts';
import { ContextMenu, type MenuAt, type MenuItem } from './ContextMenu.tsx';
import { useT } from './i18n.ts';
import { closeTab, openTab } from './tabs.ts';
import { vaultChanged } from './vault.ts';

const ROW =
  'flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-[13px] hover:bg-surface-muted';

type Filter = 'all' | 'agent' | 'person';

const Root = ({
  root,
  filter,
  onNavigate,
  onMenu,
  onFolderMenu,
  onRootMenu,
  expandAll,
}: {
  root: VaultRoot;
  filter: Filter;
  expandAll: number;
  onNavigate?: () => void;
  onMenu: (note: { id: number; title: string }, at: MenuAt) => void;
  onFolderMenu: (folder: TreeFolder, at: MenuAt) => void;
  onRootMenu: (at: MenuAt) => void;
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
      // A folder somebody just made holds nothing yet, and hiding it would
      // read as the folder not having been made. Under a filter the row is
      // about which notes are in it, so an empty one has nothing to say.
      (holds(folder.path) || (filter === 'all' && folder.count === 0))
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
        onContextMenu={(event) => {
          event.preventDefault();
          onRootMenu({ x: event.clientX, y: event.clientY });
        }}
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
    folder: TreeFolder;
    at: MenuAt;
  } | null>(null);
  const [rootMenu, setRootMenu] = useState<{ root: VaultRoot; at: MenuAt } | null>(null);
  const [asking, setAsking] = useState<Question | null>(null);
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
      // The vault changed, not the window. Reloading would take which folders
      // are open, where the tree is scrolled and the note being read with it.
      .then(() => vaultChanged())
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
              onPick: () =>
                setAsking({
                  heading: t.menu.renamePrompt,
                  initial: note.title,
                  submitLabel: t.menu.renameConfirm,
                  onAnswer: (next) => run(api.renameNote(note.id, next)),
                }),
            },
          ] as MenuItem[])
        : []),
      {
        kind: 'item',
        label: t.menu.move,
        onPick: () =>
          setAsking({
            heading: t.menu.movePrompt,
            initial: writableRoot?.path ?? '',
            submitLabel: t.menu.moveConfirm,
            onAnswer: (folder) => run(api.moveNote(note.id, folder)),
          }),
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

  // Everything a person can start from a folder. The vault is the one root
  // where making and unmaking is on offer: a borrowed root belongs to the tool
  // that wrote it, so there it stays a place to look at.
  const makers = (root: VaultRoot, folder: string): MenuItem[] =>
    root.writable
      ? [
          {
            kind: 'item',
            label: t.menu.newNote,
            onPick: () => navigate(`/new?folder=${encodeURIComponent(folder)}`),
          },
          {
            kind: 'item',
            label: t.menu.newFolder,
            onPick: () =>
              setAsking({
                heading: t.menu.newFolderPrompt,
                initial: '',
                submitLabel: t.menu.newFolderConfirm,
                onAnswer: (name) => run(api.newFolder(root.path, folder, name)),
              }),
          },
          { kind: 'divider' },
        ]
      : [];

  const notesUnder = (root: VaultRoot, folder: string) =>
    Object.entries(root.notes)
      .filter(([at]) => at === folder || at.startsWith(`${folder}/`))
      .flatMap(([, list]) => list);

  const folderItems = (root: VaultRoot, folder: TreeFolder): MenuItem[] => [
    ...makers(root, folder.path),
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
    ...(root.writable
      ? ([
          { kind: 'divider' },
          {
            kind: 'item',
            label: t.menu.deleteFolder,
            danger: true,
            // Deleting a folder deletes the notes in it, so the question says
            // how many rather than leaving the person to open it and count.
            onPick: () => {
              const inside = notesUnder(root, folder.path);
              if (window.confirm(t.menu.deleteFolderPrompt(folder.name, inside.length))) {
                for (const note of inside) closeTab(note.id);
                run(api.deleteFolder(root.path, folder.path));
              }
            },
          },
        ] as MenuItem[])
      : []),
  ];

  // The root row is the vault itself, which is where a note with no folder in
  // mind goes. It cannot be deleted, so it only offers the two makers.
  const rootItems = (root: VaultRoot): MenuItem[] => [
    ...makers(root, ''),
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
        navigator.clipboard.writeText(root.path).catch(() => {});
      },
    },
    { kind: 'item', label: t.menu.reveal, onPick: () => run(api.revealFolder(root.path, '')) },
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
          onRootMenu={(at) => setRootMenu({ root, at })}
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
      {rootMenu === null ? null : (
        <ContextMenu
          at={rootMenu.at}
          items={rootItems(rootMenu.root)}
          onClose={() => setRootMenu(null)}
        />
      )}
      {asking === null ? null : <AskName question={asking} onClose={() => setAsking(null)} />}
      {failed === null ? null : <p className="px-2 pt-2 text-[11px] text-danger">{failed}</p>}
      {tree.roots.length === 0 ? <p className="px-2 text-xs text-muted">{t.tree.empty}</p> : null}
    </div>
  );
};
