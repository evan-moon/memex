export const PAGE = String.raw`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>memex inbox</title>
<style>
  :root {
    --bg: #0f1115; --panel: #171a21; --line: #262b36; --text: #e6e8ee;
    --dim: #8b93a7; --accent: #7c9cff; --warn: #e0a33e; --danger: #e06c75;
  }
  @media (prefers-color-scheme: light) {
    :root { --bg:#f7f8fa; --panel:#fff; --line:#e3e6ec; --text:#1a1d24; --dim:#67707f; }
  }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--text);
    font: 14px/1.55 -apple-system, BlinkMacSystemFont, "Pretendard", "Apple SD Gothic Neo", sans-serif; }
  header { position:sticky; top:0; background:var(--bg); border-bottom:1px solid var(--line);
    padding:14px 20px; display:flex; gap:14px; align-items:baseline; flex-wrap:wrap; z-index:2; }
  h1 { font-size:15px; margin:0; font-weight:650; letter-spacing:-0.01em; }
  .tabs { display:flex; gap:6px; margin-left:auto; flex-wrap:wrap; }
  .tab { border:1px solid var(--line); background:transparent; color:var(--dim);
    padding:4px 10px; border-radius:99px; cursor:pointer; font-size:12px; }
  .tab[aria-pressed="true"] { color:var(--text); border-color:var(--accent); }
  main { padding:16px 20px 80px; max-width:920px; margin:0 auto; }
  .card { background:var(--panel); border:1px solid var(--line); border-radius:10px;
    padding:14px 16px; margin-bottom:10px; }
  .row { display:flex; gap:10px; align-items:center; }
  .badge { font-size:11px; padding:2px 8px; border-radius:99px; border:1px solid var(--line);
    color:var(--dim); white-space:nowrap; }
  .badge.hidden_arc { color:var(--accent); border-color:var(--accent); }
  .badge.stale_state { color:var(--warn); border-color:var(--warn); }
  .why { margin:10px 0 12px; }
  .evidence { display:flex; flex-direction:column; gap:6px; }
  .note { display:flex; gap:8px; align-items:baseline; font-size:13px;
    padding:6px 8px; border-radius:6px; cursor:pointer; }
  .note:hover { background:rgba(124,156,255,0.08); }
  .note .t { flex:1; }
  .note .d { color:var(--dim); font-size:11px; white-space:nowrap; }
  .sup { color:var(--danger); font-size:11px; }
  .actions { display:flex; gap:8px; margin-top:12px; }
  button.act { background:transparent; border:1px solid var(--line); color:var(--dim);
    border-radius:6px; padding:5px 12px; cursor:pointer; font-size:12px; }
  button.act:hover { color:var(--text); border-color:var(--accent); }
  .empty { color:var(--dim); text-align:center; padding:60px 0; }
  dialog { background:var(--panel); color:var(--text); border:1px solid var(--line);
    border-radius:12px; max-width:760px; width:92vw; max-height:80vh; padding:0; }
  dialog::backdrop { background:rgba(0,0,0,0.55); }
  .dlg-head { padding:14px 18px; border-bottom:1px solid var(--line); display:flex; gap:10px; }
  .dlg-body { padding:16px 18px; overflow:auto; max-height:64vh; white-space:pre-wrap;
    font-size:13px; line-height:1.6; }
  .dim { color:var(--dim); }
</style>
</head>
<body>
<header>
  <h1>memex inbox</h1>
  <span class="dim" id="summary"></span>
  <div class="tabs" id="tabs"></div>
</header>
<main id="list"></main>
<dialog id="dlg">
  <div class="dlg-head"><strong id="dlg-title"></strong></div>
  <div class="dlg-body" id="dlg-body"></div>
</dialog>
<script>
const state = { filter: 'all', maintenance: false, data: { counts: {}, signals: [] } };
const LABEL = { hidden_arc: 'arc', stale_state: 'stale', tag_burst: 'tag burst', dangling_link: 'link' };
const day = (ms) => new Date(ms).toISOString().slice(0, 10);

async function load() {
  const res = await fetch('/api/inbox?maintenance=' + (state.maintenance ? '1' : '0'));
  state.data = await res.json();
  render();
}

function render() {
  const { counts, signals } = state.data;
  const types = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
  const shown = state.filter === 'all' ? signals : signals.filter((s) => s.type === state.filter);

  document.getElementById('summary').textContent =
    signals.length + ' to triage' +
    (counts.dangling_link && !state.maintenance ? ' · ' + counts.dangling_link + ' link fixes hidden' : '');

  document.getElementById('tabs').innerHTML =
    ['all', ...types].map((t) =>
      '<button class="tab" data-t="' + t + '" aria-pressed="' + (state.filter === t) + '">' +
      (t === 'all' ? 'all' : (LABEL[t] || t) + ' ' + counts[t]) + '</button>').join('') +
    '<button class="tab" data-m="1" aria-pressed="' + state.maintenance + '">maintenance</button>';

  document.getElementById('list').innerHTML = shown.length === 0
    ? '<div class="empty">nothing waiting</div>'
    : shown.map(card).join('');
}

function card(s) {
  return '<div class="card" data-id="' + s.id + '">' +
    '<div class="row"><span class="badge ' + s.type + '">' + (LABEL[s.type] || s.type) + '</span>' +
    '<span class="dim">' + day(s.createdAt) + '</span></div>' +
    (s.reasoning ? '<div class="why">' + esc(s.reasoning) + '</div>' : '') +
    '<div class="evidence">' + s.evidence.map((n) =>
      '<div class="note" data-note="' + n.id + '">' +
        '<span class="badge">' + n.layer + '</span>' +
        '<span class="t">' + esc(n.title) +
          (n.supersededBy ? ' <span class="sup">⚠ superseded by #' + n.supersededBy.id + '</span>' : '') +
        '</span><span class="d">' + day(n.authoredAt) + '</span>' +
      '</div>').join('') + '</div>' +
    '<div class="actions">' +
      '<button class="act" data-act="dismissed">dismiss</button>' +
      '<button class="act" data-act="snoozed">later</button>' +
    '</div></div>';
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}

document.addEventListener('click', async (e) => {
  const tab = e.target.closest('.tab');
  if (tab) {
    if (tab.dataset.m) { state.maintenance = !state.maintenance; return load(); }
    state.filter = tab.dataset.t;
    return render();
  }
  const act = e.target.closest('.act');
  if (act) {
    const id = act.closest('.card').dataset.id;
    await fetch('/api/signal/' + id + '/status', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: act.dataset.act }),
    });
    return load();
  }
  const note = e.target.closest('.note');
  if (note) {
    const res = await fetch('/api/note/' + note.dataset.note);
    const n = await res.json();
    document.getElementById('dlg-title').textContent = n.title;
    document.getElementById('dlg-body').textContent = n.content;
    document.getElementById('dlg').showModal();
  }
});
document.getElementById('dlg').addEventListener('click', (e) => {
  if (e.target.id === 'dlg') document.getElementById('dlg').close();
});
load();
</script>
</body>
</html>`;
