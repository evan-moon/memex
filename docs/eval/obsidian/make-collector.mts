import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const usage = `Regenerate the console snippet from the current golden set.

  node --import tsx docs/eval/obsidian/make-collector.mts

The queries are baked into collect-sc.js so the snippet is one self-contained
paste into Obsidian's developer console. Generating it here keeps it from
drifting out of sync with golden-set.json.`;

if (process.argv.includes('--help')) {
  console.log(usage);
  process.exit(0);
}

const here = dirname(new URL(import.meta.url).pathname);
const golden = JSON.parse(readFileSync(join(here, 'golden-set.json'), 'utf8')) as {
  index: number;
  query: string;
}[];

const queries = golden.map((g) => ({ index: g.index, q: g.query }));

const snippet = `// memex vs Smart Connections — run in Obsidian's developer console (Cmd+Opt+I)
// Calls Smart Connections' own lookup(), so these are its real search results,
// not a reimplementation of them.
(async () => {
  const env = window.smart_env;
  if (!env?.smart_sources?.lookup) return console.error('Smart Connections env not ready');

  // Collections finish loading after the plugin reports ready, and a probe that
  // beats them to it comes back empty for reasons that have nothing to do with
  // retrieval quality.
  const embedded = () =>
    (env.smart_sources?.filter?.({ key_starts_with: '' }) ?? []).filter((s) => s.vec).length;
  for (let waited = 0; waited < 120 && embedded() === 0; waited += 2) {
    if (waited === 0) console.log('waiting for collections to load...');
    await new Promise((r) => setTimeout(r, 2000));
  }

  const model = env.smart_sources.embed_model?.model_key
    ?? env.smart_sources.embed_model?.opts?.model_key ?? '(unknown)';
  console.log('embedding model in use:', model);
  console.log('sources:', env.smart_sources?.keys?.length ?? '?', 'blocks:', env.smart_blocks?.keys?.length ?? '?');
  console.log('sources carrying a vector:', embedded());
  if (model !== 'Xenova/multilingual-e5-small') {
    return console.error('active model is ' + model + ' — the stored vectors are multilingual-e5-small, so every lookup will miss');
  }
  if (!env.smart_sources.embed_model) {
    return console.error('no embed model on smart_sources — lookup would return nothing for every query');
  }

  // lookup() answers an error by logging a warning and returning [], which for a
  // 400-query run means ten minutes of work and a file full of blanks. Stop at
  // the first few instead and say what came back.
  const probe = await env.smart_sources.lookup({ hypotheticals: ['테스트'], k: 5 });
  console.log('probe returned', Array.isArray(probe) ? probe.length + ' hits' : JSON.stringify(probe).slice(0, 200));
  if (!Array.isArray(probe) || probe.length === 0) {
    return console.error('lookup returned nothing on a probe query — check the console warning above it');
  }
  console.log('probe sample key:', probe[0]?.item?.key ?? probe[0]?.item?.path ?? '(no key)');

  const idOf = (key) => {
    const m = String(key).match(/\\(id (\\d+)\\)\\.md/);
    return m ? Number(m[1]) : null;
  };

  const QUERIES = ${JSON.stringify(queries)};

  const rows = [];
  let empty = 0;
  for (const { index, q } of QUERIES) {
    const hits = await env.smart_sources.lookup({ hypotheticals: [q], k: 30 });
    // Blocks and their source both come back — keep each note once, at its best rank.
    const seen = [];
    for (const h of hits ?? []) {
      const id = idOf(h.item?.key ?? h.item?.path ?? '');
      if (id && !seen.includes(id)) seen.push(id);
      if (seen.length >= 10) break;
    }
    rows.push([index, q, ...seen, ...Array(10 - seen.length).fill('')]);
    if (seen.length === 0) empty += 1;
    if (empty >= 5 && rows.length === empty) {
      return console.error('first ' + empty + ' queries all returned nothing — stopping instead of writing a blank file');
    }
    if (index % 25 === 0) console.log(index + '/' + QUERIES.length + ' (' + empty + ' empty so far)');
  }

  const esc = (v) => (typeof v === 'string' && /["',]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v);
  const csv = 'index,query,rank1,rank2,rank3,rank4,rank5,rank6,rank7,rank8,rank9,rank10\\n'
    + rows.map((r) => r.map(esc).join(',')).join('\\n');

  // Written into the vault rather than the clipboard: copying the console line
  // to report the result overwrites a clipboard, and a rerun is minutes of
  // lookups nobody should have to repeat for that.
  await app.vault.adapter.write('sc-results.csv', csv);
  try { await navigator.clipboard.writeText(csv); } catch {}
  console.log('model:', model, '-', rows.length, 'rows written to sc-results.csv in the vault root');
})();
`;

writeFileSync(join(here, 'collect-sc.js'), snippet, 'utf8');
console.log(`wrote collect-sc.js with ${queries.length} queries`);
