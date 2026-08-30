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
  const data = await desktop.evaluate(() => window.BCP_DATA);
  record('desktop player count', await desktop.locator('.list-card').count(), 40);
  record('desktop missing-list count', await desktop.locator('.list-card--missing').count(), 11);
  record('desktop team count', await desktop.locator('.team-group').count(), 10);
  record('desktop linked rating count', await desktop.locator('.player-rating[href]').count(), 19);
  record('desktop explicit unrated count', await desktop.locator('.player-rating--unrated').count(), 21);
  record('desktop player game count column', await desktop.locator('.player-games').allTextContents().then((items) => items.length === 40 && items.every((item) => /^(?:\d+ games|—)$/.test(item))));
  record('desktop player rank column', await desktop.locator('.player-rank').allTextContents().then((items) => items.length === 40 && items.every((item) => /^(?:#[\d,]+ \/ [\d,]+|—)$/.test(item))));
  record('desktop team averages', await desktop.locator('.team-group h2 span').allTextContents().then((items) => items.every((item) => item.includes('Glicko avg'))));
  record('desktop team average game counts', await desktop.locator('.team-group h2 span').allTextContents().then((items) => items.every((item) => /(?:\d+(?:\.\d+)?|—) avg games/.test(item))));
  record('desktop team average ranks', await desktop.locator('.team-group h2 span').allTextContents().then((items) => items.every((item) => /Avg rank (?:#[\d,]+ \/ [\d,]+|—)$/.test(item))));
  record('desktop lists grouped by team', (await desktop.locator('.team-group').count()) > 1);
  record('desktop no horizontal overflow', await desktop.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
  await desktop.screenshot({ path: '/tmp/brighton-lists-desktop.png', fullPage: false });
  await desktop.locator('.list-card:not(.list-card--missing) .list-card__summary').first().click();
  record('dropdown has unit links', (await desktop.locator('.list-card__content .roster-link--unit').first().count()) > 0);
  record('dropdown has rules metadata links', (await desktop.locator('.list-card__content .roster-link--meta').first().count()) > 0);
  record('dropdown has three labelled layouts', await desktop.locator('.list-card:not(.list-card--missing) .layout-thumbnail').first().locator('..').locator('.layout-thumbnail').count(), 3);
  await desktop.locator('#expand-all').click();
  record('every published dropdown has layouts', await desktop.locator('.layout-strip').count(), 29);
  record('all layout thumbnails are present', await desktop.locator('.layout-thumbnail img').count(), 87);
  const layoutAssetResponses = await Promise.all(data.layoutReference.layouts.map((layout) => desktop.request.get(`http://127.0.0.1:4173/${layout.asset}`)));
  record('all 15 local layout assets load', layoutAssetResponses.every((response) => response.ok()));
  record('expanded desktop has no horizontal overflow', await desktop.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
  await desktop.locator('#search').fill('Kaashif');
  record('search filter result', await desktop.locator('.list-card').count(), 1);
  record('Kaashif matchup is Take and Hold mirror', await desktop.locator('.layout-strip__heading').textContent(), 'Take and Hold vs Take and Hold');
  await desktop.screenshot({ path: '/tmp/brighton-lists-desktop-search.png', fullPage: true });

  for (const list of data.lists) {
    const response = await desktop.request.get(`http://127.0.0.1:4173/${list.pageUrl}`);
    record(`route ${list.listId}`, response.ok());
  }

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  await mobile.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' });
  record('mobile player count', await mobile.locator('.list-card').count(), 40);
  record('mobile missing-list count', await mobile.locator('.list-card--missing').count(), 11);
  record('mobile index no horizontal overflow', await mobile.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
  await mobile.screenshot({ path: '/tmp/brighton-lists-mobile-index.png', fullPage: false });
  await mobile.locator('.list-card:not(.list-card--missing) .list-card__summary').first().click();
  record('mobile dropdown has unit links', (await mobile.locator('.list-card__content .roster-link--unit').count()) > 0);
  record('mobile dropdown has rules metadata links', (await mobile.locator('.list-card__content .roster-link--meta').count()) > 0);
  record('mobile dropdown has three side-by-side layouts', await mobile.locator('.list-card__summary[aria-expanded="true"]').locator('..').locator('.layout-thumbnail').count(), 3);
  record('mobile expanded dropdown has no horizontal overflow', await mobile.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
  await mobile.locator('.list-card:not(.list-card--missing) .list-card__content').first().scrollIntoViewIfNeeded();
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
