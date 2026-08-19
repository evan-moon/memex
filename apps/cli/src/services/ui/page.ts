export const PAGE = String.raw`<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>memex</title>
<style>
  :root {
    --bg:#0f1115; --panel:#151821; --line:#242938; --text:#e6e8ee; --dim:#8b93a7;
    --accent:#7c9cff; --warn:#e0a33e; --danger:#e06c75; --bar:#39415a;
  }
  @media (prefers-color-scheme: light) {
    :root { --bg:#fafbfc; --panel:#fff; --line:#e4e7ee; --text:#1a1d24; --dim:#68717f; --bar:#cbd3e6; }
  }
  * { box-sizing:border-box; }
  body { margin:0; height:100vh; display:flex; background:var(--bg); color:var(--text);
    font:13.5px/1.55 -apple-system, BlinkMacSystemFont, "Pretendard", "Apple SD Gothic Neo", sans-serif; }
  aside { width:290px; flex:none; border-right:1px solid var(--line); overflow:auto; padding:10px 0 40px; }
  main { flex:1; overflow:auto; }
  .brand { padding:12px 16px 8px; font-weight:650; letter-spacing:-.01em; }
  .sec { margin-top:4px; }
  .sec > button { width:100%; text-align:left; background:none; border:0; color:var(--text);
    padding:7px 16px; cursor:pointer; display:flex; gap:8px; align-items:center; font-size:13px; }
  .sec > button:hover { background:rgba(124,156,255,.07); }
  .sec .n { margin-left:auto; color:var(--dim); font-size:11.5px; }
  .items { display:none; padding-bottom:6px; }
  .sec.open .items { display:block; }
  .item { padding:5px 16px 5px 30px; cursor:pointer; color:var(--dim); font-size:12.5px;
    white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .item:hover { background:rgba(124,156,255,.07); color:var(--text); }
  .item.sel { background:rgba(124,156,255,.14); color:var(--text); }
  .item .w { color:var(--warn); }
  header { position:sticky; top:0; background:var(--bg); border-bottom:1px solid var(--line);
    padding:10px 20px; display:flex; gap:10px; align-items:center; z-index:3; }
  header input { flex:1; background:var(--panel); border:1px solid var(--line); color:var(--text);
    border-radius:7px; padding:7px 11px; font-size:13px; outline:none; }
  header input:focus { border-color:var(--accent); }
  .pad { padding:18px 22px 80px; max-width:940px; }
  h2 { font-size:15px; margin:0 0 2px; letter-spacing:-.01em; }
  .sub { color:var(--dim); font-size:12px; margin-bottom:16px; }
  .topic { display:grid; grid-template-columns:150px 1fr 74px; gap:12px; align-items:center;
    padding:9px 10px; border-radius:8px; cursor:pointer; }
  .topic:hover { background:var(--panel); }
  .topic .nm { font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .topic .nm small { color:var(--dim); font-weight:400; margin-left:6px; }
  .topic .when { color:var(--dim); font-size:11.5px; text-align:right; }
  .spark { display:flex; align-items:flex-end; gap:1px; height:26px; position:relative; }
  .spark i { flex:1; background:var(--bar); border-radius:1px 1px 0 0; min-height:1px; }
  .marks { display:flex; gap:1px; height:8px; margin-top:2px; }
  .marks i { flex:1; }
  .marks i.correction { background:var(--danger); }
  .marks i.return { background:var(--accent); }
  .marks i.arc { background:var(--warn); }
  .dormant { opacity:.5; }
  .badge { font-size:10.5px; padding:1px 7px; border-radius:99px; border:1px solid var(--line); color:var(--dim); }
  .banner { border:1px solid var(--danger); border-radius:8px; padding:10px 13px; margin:12px 0;
    background:rgba(224,108,117,.07); font-size:12.5px; }
  .banner a, .link { color:var(--accent); cursor:pointer; text-decoration:none; }
  .content { white-space:pre-wrap; line-height:1.7; margin-top:14px; font-size:13.5px; }
  .rel { margin-top:26px; border-top:1px solid var(--line); padding-top:14px; }
  .rel h3 { font-size:12px; color:var(--dim); margin:0 0 7px; font-weight:600; }
  .row { padding:5px 8px; border-radius:6px; cursor:pointer; display:flex; gap:9px; align-items:baseline; }
  .row:hover { background:var(--panel); }
  .row .t { flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .row .d { color:var(--dim); font-size:11px; }
  .mk { display:flex; gap:9px; padding:7px 9px; border-radius:7px; cursor:pointer; align-items:baseline; }
  .mk:hover { background:var(--panel); }
  .mk .k { font-size:10.5px; padding:1px 7px; border-radius:99px; }
  .mk .k.correction { color:var(--danger); border:1px solid var(--danger); }
  .mk .k.return { color:var(--accent); border:1px solid var(--accent); }
  .mk .k.arc { color:var(--warn); border:1px solid var(--warn); }
  .empty { color:var(--dim); padding:50px 0; text-align:center; }
</style>
</head>
<body>
<aside>
  <div class="brand">memex</div>
  <div id="tree"></div>
</aside>
<main>
  <header><input id="q" placeholder="검색  (⌘K)" autocomplete="off" /></header>
  <div class="pad" id="view"></div>
</main>
<script>
const S = { sidebar: null, topics: null, sel: null };
const day = (ms) => new Date(ms).toISOString().slice(0, 10);
const ago = (ms) => {
  const d = Math.floor((Date.now() - ms) / 86400000);
  if (d < 1) return '오늘'; if (d < 30) return d + '일 전';
  if (d < 365) return Math.floor(d / 30) + '개월 전';
  return (d / 365).toFixed(1) + '년 전';
};
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' })[c]);
const get = (u) => fetch(u).then((r) => (r.ok ? r.json() : null));

async function boot() {
  [S.sidebar, S.topics] = await Promise.all([get('/api/sidebar'), get('/api/topics')]);
  renderTree();
  home();
}

function renderTree() {
  const { counts, state, rule, past, stale } = S.sidebar;
  const staleSet = new Set(stale);
  const sec = (key, label, n, items, open) =>
    '<div class="sec' + (open ? ' open' : '') + '" data-sec="' + key + '">' +
      '<button>' + label + '<span class="n">' + (n ?? items.length) + '</span></button>' +
      '<div class="items">' + items.map((i) =>
        '<div class="item" data-note="' + i.id + '">' +
          (staleSet.has(i.id) ? '<span class="w">⚠ </span>' : '') + esc(i.title) + '</div>').join('') +
      '</div></div>';

  const topics = '<div class="sec" data-sec="topics"><button>주제<span class="n">' +
    S.topics.length + '</span></button><div class="items">' +
    S.topics.map((t) => '<div class="item" data-topic="' + esc(t.tag) + '">' + esc(t.tag) +
      ' <span class="n">' + t.count + '</span></div>').join('') + '</div></div>';

  document.getElementById('tree').innerHTML =
    sec('state', '지금 믿는 것', counts.state, state, true) +
    sec('past', '기록', counts.past, past) +
    sec('rule', '지침', counts.rule, rule) + topics;
}

function home() {
  S.sel = null;
  const max = (t) => Math.max(...t.buckets, 1);
  document.getElementById('view').innerHTML =
    '<h2>주제</h2><div class="sub">' + S.topics.length + '개 · 활동과 생각이 꺾인 지점</div>' +
    S.topics.map((t) => {
      const m = max(t);
      const marks = Array.from({ length: 40 }, () => '');
      for (const k of t.markers) marks[k.bucket] = k.kind;
      return '<div class="topic' + (t.dormant ? ' dormant' : '') + '" data-topic="' + esc(t.tag) + '">' +
        '<div class="nm">' + esc(t.tag) + '<small>' + t.count + '</small></div>' +
        '<div><div class="spark">' +
          t.buckets.map((b) => '<i style="height:' + Math.max(1, (b / m) * 26) + 'px"></i>').join('') +
        '</div><div class="marks">' + marks.map((k) => '<i class="' + k + '"></i>').join('') + '</div></div>' +
        '<div class="when">' + ago(t.lastAt) + (t.dormant ? '<br>잠듦' : '') + '</div></div>';
    }).join('');
}

async function topic(tag) {
  const t = await get('/api/topic/' + encodeURIComponent(tag));
  if (!t) return;
  const m = Math.max(...t.buckets, 1);
  const marks = Array.from({ length: 40 }, () => '');
  for (const k of t.markers) marks[k.bucket] = k.kind;
  document.getElementById('view').innerHTML =
    '<h2>' + esc(t.tag) + '</h2><div class="sub">' + t.count + ' notes · ' +
      day(t.firstAt) + ' → ' + day(t.lastAt) + '</div>' +
    '<div class="spark">' + t.buckets.map((b) =>
      '<i style="height:' + Math.max(1, (b / m) * 26) + 'px"></i>').join('') + '</div>' +
    '<div class="marks">' + marks.map((k) => '<i class="' + k + '"></i>').join('') + '</div>' +
    (t.markers.length === 0
      ? '<div class="rel"><h3>전환점 없음 — 연대기로 읽어</h3></div>'
      : '<div class="rel"><h3>전환점 ' + t.markers.length + '</h3>' + t.markers.map((k) =>
          '<div class="mk" data-note="' + k.noteId + '"><span class="k ' + k.kind + '">' +
          ({ correction: '정정', return: '재등장', arc: '아크' })[k.kind] + '</span>' +
          '<span class="t">' + esc(k.title) + '<br><span class="d">' + esc(k.detail) + '</span></span>' +
          '<span class="d">' + day(k.at) + '</span></div>').join('') + '</div>') +
    '<div class="rel"><h3>노트 ' + t.notes.length + '</h3>' + t.notes.slice(0, 100).map((n) =>
      '<div class="row" data-note="' + n.id + '"><span class="badge">' + n.layer + '</span>' +
      '<span class="t">' + esc(n.title) + '</span><span class="d">' + day(n.at) + '</span></div>').join('') + '</div>';
}

async function note(id) {
  const n = await get('/api/note/' + id);
  if (!n) return;
  S.sel = id;
  document.querySelectorAll('.item').forEach((el) =>
    el.classList.toggle('sel', el.dataset.note === String(id)));
  const refs = (title, list) => list.length === 0 ? '' :
    '<div class="rel"><h3>' + title + ' ' + list.length + '</h3>' + list.map((r) =>
      '<div class="row" data-note="' + r.id + '"><span class="badge">' + r.layer + '</span>' +
      '<span class="t">' + esc(r.title) + '</span><span class="d">' + day(r.at) + '</span></div>').join('') + '</div>';

  document.getElementById('view').innerHTML =
    '<h2>' + esc(n.title) + '</h2>' +
    '<div class="sub"><span class="badge">' + n.layer + '</span> ' + day(n.at) +
      (n.tags.length ? ' · ' + n.tags.map(esc).join(' · ') : '') +
      (n.obsidianUrl ? ' · <a class="link" href="' + n.obsidianUrl + '">Obsidian에서 열기 ↗</a>' : '') +
    '</div>' +
    (n.supersededBy.length
      ? '<div class="banner">⚠ 이 노트는 이후 ' + n.supersededBy.length + '개 노트에서 정정됐어<br>최신: ' +
        '<span class="link" data-note="' + n.supersededBy[n.supersededBy.length - 1].id + '">' +
        esc(n.supersededBy[n.supersededBy.length - 1].title) + '</span></div>'
      : '') +
    (n.corrects.length
      ? '<div class="banner">이 노트가 정정하는 것: <span class="link" data-note="' + n.corrects[0].id + '">' +
        esc(n.corrects[0].title) + '</span></div>'
      : '') +
    '<div class="content">' + esc(n.content) + '</div>' +
    refs('이 노트를 참조하는 노트', n.backlinks) +
    refs('의미상 가까운 노트', n.related);
  document.querySelector('main').scrollTop = 0;
}

async function runSearch(q) {
  const hits = await get('/api/search?q=' + encodeURIComponent(q));
  document.getElementById('view').innerHTML =
    '<h2>검색</h2><div class="sub">' + esc(q) + ' · ' + hits.length + '건</div>' +
    (hits.length === 0 ? '<div class="empty">없음</div>' : hits.map((h) =>
      '<div class="row" data-note="' + h.id + '" style="display:block; padding:10px">' +
      '<div><span class="badge">' + h.layer + '</span> <b>' + esc(h.title) + '</b> ' +
      '<span class="d">' + day(h.at) + '</span>' +
      (h.supersededBy ? ' <span style="color:var(--danger)">⚠ 정정됨</span>' : '') + '</div>' +
      '<div class="d" style="margin-top:4px">' + esc(h.snippet) + '…</div></div>').join(''));
}

document.addEventListener('click', (e) => {
  const secBtn = e.target.closest('.sec > button');
  if (secBtn) return secBtn.parentElement.classList.toggle('open');
  const t = e.target.closest('[data-topic]');
  if (t) return topic(t.dataset.topic);
  const n = e.target.closest('[data-note]');
  if (n) return note(Number(n.dataset.note));
});
const q = document.getElementById('q');
let timer;
q.addEventListener('input', () => {
  clearTimeout(timer);
  const v = q.value.trim();
  timer = setTimeout(() => (v.length === 0 ? home() : runSearch(v)), 250);
});
document.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); q.focus(); q.select(); }
  if (e.key === 'Escape') { q.value = ''; q.blur(); home(); }
});
boot();
</script>
</body>
</html>`;
