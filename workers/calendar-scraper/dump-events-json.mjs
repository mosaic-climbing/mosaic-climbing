// Manual seed for events.json — runs the same scrape + normalize pipeline the
// Cloudflare Worker will run hourly, but writes to the repo's static
// events.json so the marketing site can ship the calendar UI before the
// Worker is deployed. Re-run this manually if data goes stale; once the
// Worker is live (per docs/calendar-plan.md §12), the static file becomes
// the Worker's R2 output and this script is no longer needed.
//
// Usage:
//   node workers/calendar-scraper/dump-events-json.mjs
import { fetchAllRows } from './src/scrape.js';
import { buildPayload } from './src/normalize.js';
import { writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const outPath = resolve(here, '../../events.json');

const now = new Date();
console.log(`fetching live calendar (anchor ${now.toISOString()})…`);
const rows = await fetchAllRows(now);
const payload = buildPayload(rows, { now });

await writeFile(outPath, JSON.stringify(payload, null, 2) + '\n', 'utf8');
console.log(`wrote ${outPath}`);
console.log(`  events: ${payload.events.length}`);
console.log(`  updatedAt: ${payload.meta.updatedAt}`);
