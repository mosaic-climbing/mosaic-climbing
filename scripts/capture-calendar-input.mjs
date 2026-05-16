// One-shot capture: load the live storefront calendar page in headless
// Chromium, intercept the StorefrontCalendarQuery POST, print the variables
// (specifically the `input` shape) so we can paste it into src/config.js.
//
// Usage:
//   node capture-calendar-input.mjs
//   node capture-calendar-input.mjs --headed   # pop a window for debugging
//   node capture-calendar-input.mjs --timeout=45000

import { chromium } from 'playwright';

const TARGET_URL = 'https://portal.mosaicclimbing.com/mos/n/calendar';
const GRAPHQL_PATH = '/graphql-public';
// The SPA doesn't send `operationName` in the POST body, so we match the
// embedded query string instead.
const OPERATION_NAME = 'StorefrontCalendarQuery';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  })
);
const timeoutMs = Number(args.timeout) || 30_000;
const headed = !!args.headed;

const browser = await chromium.launch({ headless: !headed });
const context = await browser.newContext({
  userAgent:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36',
  viewport: { width: 1280, height: 900 },
});
const page = await context.newPage();

const captures = [];
page.on('request', (req) => {
  const url = req.url();
  if (!url.includes(GRAPHQL_PATH)) return;
  if (req.method() !== 'POST') return;
  let body;
  try {
    body = JSON.parse(req.postData() || 'null');
  } catch {
    return;
  }
  const payloads = Array.isArray(body) ? body : [body];
  for (const p of payloads) {
    const isCalendarQuery =
      p?.operationName === OPERATION_NAME ||
      (typeof p?.query === 'string' && p.query.includes(OPERATION_NAME));
    if (isCalendarQuery) {
      captures.push({ url, body: p, capturedAt: new Date().toISOString() });
    }
  }
});

const done = new Promise((resolve, reject) => {
  const t = setTimeout(
    () => reject(new Error(`no ${OPERATION_NAME} request in ${timeoutMs}ms`)),
    timeoutMs
  );
  const interval = setInterval(() => {
    if (captures.length > 0) {
      clearTimeout(t);
      clearInterval(interval);
      resolve();
    }
  }, 100);
});

try {
  await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded' });
  await done;
} catch (err) {
  console.error('CAPTURE FAILED:', err.message);
  await browser.close();
  process.exit(2);
}

await browser.close();

const first = captures[0];
const input = first.body.variables?.input;
console.log('# Captured at:', first.capturedAt);
console.log('# Total matching requests intercepted:', captures.length);
console.log('# operationName:', first.body.operationName);
console.log('# variables.input (paste into src/config.js → CALENDAR_INPUT_EXTRA');
console.log('#   minus startDate/endDate which the scraper supplies):');
console.log(JSON.stringify(input, null, 2));
console.log('# full variables payload:');
console.log(JSON.stringify(first.body.variables, null, 2));
