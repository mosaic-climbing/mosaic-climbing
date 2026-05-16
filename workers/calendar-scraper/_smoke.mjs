// End-to-end smoke test: exercise src/scrape.js + src/normalize.js without
// pulling in the Worker runtime (no R2/KV). Verifies the public GraphQL endpoint
// is reachable, the captured CalendarFilter input works, and normalization
// produces the events.json shape the marketing site expects.
import { fetchAllRows, buildWindows } from './src/scrape.js';
import { buildPayload } from './src/normalize.js';

const now = new Date();
console.log('windows for now=' + now.toISOString().slice(0, 10) + ':');
for (const w of buildWindows(now)) console.log('  ', w.startDate, '→', w.endDate);

console.log('\nfetching…');
const rows = await fetchAllRows(now);
console.log('raw rows:', rows.length);

const payload = buildPayload(rows, { now });
console.log('\nmeta:', payload.meta);
console.log('\nevent count by title:');
const byTitle = {};
for (const e of payload.events) byTitle[e.title] = (byTitle[e.title] || 0) + 1;
for (const [t, n] of Object.entries(byTitle).sort()) console.log(`  ${n}× ${t}`);

console.log('\nsample normalized events:');
console.log(JSON.stringify(payload.events.slice(0, 2), null, 2));
console.log('\nlast event in window:');
console.log(JSON.stringify(payload.events.at(-1), null, 2));
