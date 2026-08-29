import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const mime = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json' };
const server = createServer(async (request, response) => {
  try {
    let pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
    let file = path.join(root, pathname);
    if ((await stat(file)).isDirectory()) file = path.join(file, 'index.html');
    response.writeHead(200, { 'content-type': mime[path.extname(file)] || 'application/octet-stream' });
    response.end(await readFile(file));
  } catch {
    response.writeHead(404).end('Not found');
  }
});
await new Promise((resolve) => server.listen(4173, '127.0.0.1', resolve));

const browser = await chromium.launch({ headless: true });
const results = { checkedAt: new Date().toISOString(), checks: [] };

function record(name, value, expected = true) {
  const passed = value === expected;
  results.checks.push({ name, passed, value, expected });
  if (!passed) throw new Error(`${name}: expected ${expected}, got ${value}`);
}

try {
  const desktop = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await desktop.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' });
  record('desktop list count', await desktop.locator('.list-card').count(), 29);
  record('desktop lists grouped by team', (await desktop.locator('.team-group').count()) > 1);
  record('desktop no horizontal overflow', await desktop.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
  await desktop.locator('.list-card__summary').first().click();
  record('dropdown has unit links', (await desktop.locator('.list-card__content .roster-link--unit').first().count()) > 0);
  record('dropdown has rules metadata links', (await desktop.locator('.list-card__content .roster-link--meta').first().count()) > 0);
  await desktop.locator('#search').fill('Kaashif');
  record('search filter result', await desktop.locator('.list-card').count(), 1);
  await desktop.screenshot({ path: '/tmp/brighton-lists-desktop.png', fullPage: true });

  const data = await desktop.evaluate(() => window.BCP_DATA);
  for (const list of data.lists) {
    const response = await desktop.request.get(`http://127.0.0.1:4173/${list.pageUrl}`);
    record(`route ${list.listId}`, response.ok());
  }

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  await mobile.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' });
  record('mobile list count', await mobile.locator('.list-card').count(), 29);
  record('mobile index no horizontal overflow', await mobile.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
  await mobile.locator('.list-card__summary').first().click();
  record('mobile dropdown has unit links', (await mobile.locator('.list-card__content .roster-link--unit').count()) > 0);
  record('mobile dropdown has rules metadata links', (await mobile.locator('.list-card__content .roster-link--meta').count()) > 0);
  await mobile.locator('.list-card__content').first().scrollIntoViewIfNeeded();
  await mobile.screenshot({ path: '/tmp/brighton-lists-mobile.png', fullPage: false });

  await mobile.goto(`http://127.0.0.1:4173/${data.lists[0].pageUrl}`, { waitUntil: 'networkidle' });
  record('mobile detail has roster', await mobile.locator('.detail-roster').isVisible());
  record('mobile detail has rules links', (await mobile.locator('.rules-panel a').count()) > 2);
  record('mobile detail no horizontal overflow', await mobile.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
  await mobile.screenshot({ path: '/tmp/brighton-list-detail-mobile.png', fullPage: false });
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}

results.passed = results.checks.every((check) => check.passed);
await writeFile(new URL('../data/qa-report.json', import.meta.url), `${JSON.stringify(results, null, 2)}\n`);
console.log(JSON.stringify({ passed: results.passed, checks: results.checks.length }, null, 2));
