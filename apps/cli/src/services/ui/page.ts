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
  .topic { display:grid; grid-template-columns:1fr 108px 108px 68px; gap:12px; align-items:center;
    padding:10px 12px; border-radius:9px; cursor:pointer; border:1px solid transparent; }
  .topic:hover { background:var(--panel); border-color:var(--line); }
  .topic .nm { font-weight:650; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .topic .nm small { color:var(--dim); font-weight:400; margin-left:7px; }
  .topic .num { text-align:right; font-variant-numeric:tabular-nums; }
  .topic .num b { font-weight:650; }
  .topic .num span { color:var(--dim); font-size:11px; margin-left:4px; }
  .ok b { color:var(--accent); }
  .old b { color:var(--warn); }
  .zero b { color:var(--dim); font-weight:400; }
  .topic .when { color:var(--dim); font-size:11.5px; text-align:right; }
  .dormant-row { opacity:.6; }
  .colhead { display:grid; grid-template-columns:1fr 108px 108px 68px; gap:12px;
    padding:0 12px 6px; color:var(--dim); font-size:11px; }
  .colhead div:not(:first-child) { text-align:right; }
  .split { display:grid; grid-template-columns:1fr 1fr; gap:22px; margin-top:18px; }
  @media (max-width:840px) { .split { grid-template-columns:1fr; } }
  .why { color:var(--warn); font-size:11.5px; margin-top:2px; }
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
  const num = (n, cls) => '<div class="num ' + (n === 0 ? 'zero' : cls) + '"><b>' + n + '</b></div>';
  document.getElementById('view').innerHTML =
    '<h2>주제</h2><div class="sub">' + S.topics.length + '개 · 낡은 정보가 많은 순</div>' +
    '<div class="colhead"><div></div><div>지금 유효</div><div>낡음</div><div></div></div>' +
    S.topics.map((t) =>
      '<div class="topic' + (t.dormant ? ' dormant-row' : '') + '" data-topic="' + esc(t.tag) + '">' +
        '<div class="nm">' + esc(t.tag) + '<small>' + t.count + '</small></div>' +
        num(t.currentCount, 'ok') + num(t.outdatedCount, 'old') +
        '<div class="when">' + (t.dormant ? '잠듦' : ago(t.lastAt)) + '</div>' +
      '</div>').join('');
}

async function topic(tag) {
  const t = await get('/api/topic/' + encodeURIComponent(tag));
  if (!t) return;
  const list = (notes, showWhy) => notes.length === 0
    ? '<div class="d" style="padding:8px">없음</div>'
    : notes.map((n) =>
        '<div class="row" data-note="' + n.id + '" style="display:block">' +
          '<div><span class="badge">' + n.layer + '</span> ' + esc(n.title) +
          ' <span class="d">' + day(n.at) + '</span></div>' +
          (showWhy && n.reason ? '<div class="why">' + esc(n.reason) + '</div>' : '') +
        '</div>').join('');

  document.getElementById('view').innerHTML =
    '<h2>' + esc(t.tag) + '</h2>' +
    '<div class="sub">' + t.count + '개 · 지금 유효 ' + t.currentCount +
      ' · 낡음 ' + t.outdatedCount + (t.dormant ? ' · 잠듦' : '') + '</div>' +
    (t.arcs.length
      ? t.arcs.map((a) => '<div class="banner" style="border-color:var(--warn); background:rgba(224,163,62,.07)">' +
          '💡 ' + esc(a.reasoning) + '</div>').join('')
      : '') +
    '<div class="split">' +
      '<div><h3 style="font-size:12px;color:var(--dim);margin:0 0 6px">지금 유효한 것 ' +
        t.currentCount + '</h3>' + list(t.current, true) + '</div>' +
      '<div><h3 style="font-size:12px;color:var(--warn);margin:0 0 6px">낡았거나 뒤집힌 것 ' +
        t.outdatedCount + '</h3>' + list(t.outdated, true) + '</div>' +
    '</div>' +
    '<div class="rel"><h3>전체 ' + t.notes.length + '</h3>' + t.notes.slice(0, 60).map((n) =>
      '<div class="row" data-note="' + n.id + '"><span class="badge">' + n.layer + '</span>' +
      '<span class="t">' + esc(n.title) + '</span><span class="d">' + day(n.at) + '</span></div>').join('') + '</div>';
  document.querySelector('main').scrollTop = 0;
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
