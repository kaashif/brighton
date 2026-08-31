import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const mime = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml' };
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
  record('perspective selector has whole Kaashif team', await desktop.locator('#perspective-player option').count(), 4);
  record('Kaashif is the default perspective', await desktop.locator('#perspective-player').inputValue(), 'zKNvC08xfWGI');
  record('desktop perspective bar is sticky', await desktop.locator('.perspective-bar').evaluate((element) => getComputedStyle(element).position), 'sticky');
  record('desktop opponent matchup links', await desktop.locator('.matchup-rating[href]').count(), 36);
  record('desktop own-team matchup labels', await desktop.locator('.matchup-rating--team').count(), 4);
  record('desktop linked rating count', await desktop.locator('.player-rating[href]').count(), 19);
  record('desktop explicit unrated count', await desktop.locator('.player-rating--unrated').count(), 21);
  record('desktop player game count column', await desktop.locator('.player-games').allTextContents().then((items) => items.length === 40 && items.every((item) => /^(?:\d+ games|—)$/.test(item))));
  record('desktop player rank column', await desktop.locator('.player-rank').allTextContents().then((items) => items.length === 40 && items.every((item) => /^(?:#[\d,]+ \/ [\d,]+|—)$/.test(item))));
  record('desktop team averages', await desktop.locator('.team-group h2 span').allTextContents().then((items) => items.every((item) => item.includes('Glicko avg'))));
  record('desktop team average game counts', await desktop.locator('.team-group h2 span').allTextContents().then((items) => items.every((item) => /(?:\d+(?:\.\d+)?|—) avg games/.test(item))));
  record('desktop team average ranks', await desktop.locator('.team-group h2 span').allTextContents().then((items) => items.every((item) => /Avg rank (?:#[\d,]+ \/ [\d,]+|—)$/.test(item))));
  record('desktop lists grouped by team', (await desktop.locator('.team-group').count()) > 1);
  record('desktop no horizontal overflow', await desktop.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
  await desktop.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  record('desktop perspective remains on screen after scroll', await desktop.locator('.perspective-bar').evaluate((element) => Math.abs(element.getBoundingClientRect().top) < 1));
  await desktop.evaluate(() => window.scrollTo(0, 0));
  await desktop.screenshot({ path: '/tmp/brighton-lists-desktop.png', fullPage: false });
  await desktop.locator('.list-card:not(.list-card--missing) .list-card__summary').first().click();
  record('dropdown has unit links', (await desktop.locator('.list-card__content .roster-link--unit').first().count()) > 0);
  record('dropdown has rules metadata links', (await desktop.locator('.list-card__content .roster-link--meta').first().count()) > 0);
  record('expanded roster has no nested scrollbar', await desktop.locator('.list-card__content').first().evaluate((element) => element.scrollHeight === element.clientHeight));
  record('dropdown has two objective cards', await desktop.locator('.list-card:not(.list-card--missing) .objective-card').first().locator('..').locator('.objective-card').count(), 2);
  record('dropdown has three labelled layouts', await desktop.locator('.list-card:not(.list-card--missing) .layout-thumbnail').first().locator('..').locator('.layout-thumbnail').count(), 3);
  await desktop.locator('#expand-all').click();
  record('every published dropdown has objectives', await desktop.locator('.objective-strip').count(), 29);
  record('all objective cards are present', await desktop.locator('.objective-card img').count(), 58);
  record('every published dropdown has layouts', await desktop.locator('.layout-strip').count(), 29);
  record('all layout thumbnails are present', await desktop.locator('.layout-thumbnail img').count(), 87);
  record('all force-disposition layouts are available', data.layoutReference.layouts.length, 45);
  record('all ordered objective matchups are available', data.layoutReference.objectiveMatchups.length, 25);
  record('only the vetted layout uses a suggested-deployment preview', data.layoutReference.layouts.filter((layout) => layout.suggestedDeployment).length, 1);
  const layoutAssetResponses = await Promise.all(data.layoutReference.layouts.map((layout) => desktop.request.get(`http://127.0.0.1:4173/${layout.asset}`)));
  record('all 45 local layout assets load', layoutAssetResponses.every((response) => response.ok()));
  const objectiveAssets = [...new Set(data.layoutReference.objectiveMatchups.flatMap((matchup) => [matchup.player.asset, matchup.opponent.asset]))];
  const objectiveAssetResponses = await Promise.all(objectiveAssets.map((asset) => desktop.request.get(`http://127.0.0.1:4173/${asset}`)));
  record('all local objective assets load', objectiveAssetResponses.every((response) => response.ok()));
  record('expanded desktop has no horizontal overflow', await desktop.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
  await desktop.locator('#search').fill('Kaashif');
  record('search filter result', await desktop.locator('.list-card').count(), 1);
  record('Kaashif matchup is Take and Hold mirror', await desktop.locator('.layout-strip__heading').textContent(), 'Take and Hold vs Take and Hold');
  record('Kaashif Layout A thumbnail shows the suggestion', await desktop.locator('.layout-thumbnail strong').first().textContent(), 'Layout A · suggested deployment');
  record('Kaashif Layout A opens the loaded suggestion', await desktop.locator('.layout-thumbnail').first().getAttribute('href'), 'https://kaashif.github.io/40k-planner/planner/?layout=take-and-hold-vs-take-and-hold-a&suggestion=1');
  record('Kaashif Layout A suggested preview renders', await desktop.locator('.layout-thumbnail img').first().evaluate((image) => image.complete && image.naturalWidth > 0));
  record('Kaashif mirror has two Battlefield Dominance cards', await desktop.locator('.objective-card figcaption span').allTextContents().then((items) => items.length === 2 && items.every((item) => item === 'Take and Hold — Battlefield Dominance')));
  await desktop.locator('#perspective-player').selectOption('tLKxjlKF1ivt');
  record('Joseph perspective switches matchup heading', await desktop.locator('.layout-strip__heading').textContent(), 'Purge the Foe vs Take and Hold');
  record('Joseph objective switches to Unstoppable Force', await desktop.locator('.objective-card figcaption span').first().textContent(), 'Purge the Foe — Unstoppable Force');
  record('Kaashif objective switches to Immovable Object', await desktop.locator('.objective-card figcaption span').nth(1).textContent(), 'Take and Hold — Immovable Object');
  record('non-Kaashif perspective has three layouts', await desktop.locator('.layout-thumbnail').count(), 3);
  record('non-Kaashif perspective does not load Kaashif suggestion', await desktop.locator('.layout-thumbnail strong').allTextContents().then((items) => items.every((item) => !item.includes('suggested deployment'))));
  await desktop.screenshot({ path: '/tmp/brighton-lists-desktop-search.png', fullPage: true });

  for (const list of data.lists) {
    const response = await desktop.request.get(`http://127.0.0.1:4173/${list.pageUrl}`);
    record(`route ${list.listId}`, response.ok());
  }
  record('matchup dataset covers every opponent', data.matchupAnalysis.entries.length, 36);
  record('matchup pages with exact-list confidence', data.matchupAnalysis.entries.filter((entry) => entry.confidence === 'High').length, 24);
  record('provisional matchup pages', data.matchupAnalysis.entries.filter((entry) => entry.confidence === 'Low').length, 12);
  record('matchup stars are all valid', data.matchupAnalysis.entries.every((entry) => entry.rating >= 1 && entry.rating <= 5 && entry.stars.length === 5));
  for (const matchup of data.matchupAnalysis.entries) {
    const response = await desktop.request.get(`http://127.0.0.1:4173/${matchup.pageUrl}`);
    record(`matchup route ${matchup.playerId}`, response.ok());
  }
  await desktop.goto('http://127.0.0.1:4173/matchups/charles-bunn/', { waitUntil: 'networkidle' });
  record('exact matchup shows threat links', (await desktop.locator('.matchup-threat a').count()) > 0);
  record('exact matchup has high confidence label', await desktop.locator('.matchup-confidence strong').textContent(), 'High confidence.');
  record('desktop matchup no horizontal overflow', await desktop.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
  await desktop.screenshot({ path: '/tmp/brighton-matchup-desktop.png', fullPage: true });
  await desktop.goto('http://127.0.0.1:4173/matchups/sam-cordell/', { waitUntil: 'networkidle' });
  record('missing-list matchup is explicit', await desktop.locator('.matchup-confidence strong').textContent(), 'Low confidence.');
  record('missing-list matchup has no invented exact threats', await desktop.locator('.matchup-threat').count(), 0);

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  await mobile.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' });
  record('mobile player count', await mobile.locator('.list-card').count(), 40);
  record('mobile missing-list count', await mobile.locator('.list-card--missing').count(), 11);
  record('mobile matchup links remain available', await mobile.locator('.matchup-rating[href]').count(), 36);
  record('mobile index no horizontal overflow', await mobile.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
  await mobile.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  record('mobile perspective remains on screen after scroll', await mobile.locator('.perspective-bar').evaluate((element) => Math.abs(element.getBoundingClientRect().top) < 1));
  await mobile.evaluate(() => window.scrollTo(0, 0));
  await mobile.screenshot({ path: '/tmp/brighton-lists-mobile-index.png', fullPage: false });
  await mobile.locator('#perspective-player').selectOption('SlnqyU8XcuVu');
  record('mobile perspective metadata updates', await mobile.locator('#perspective-meta').textContent(), 'South London Squad · Priority Assets');
  await mobile.locator('.list-card:not(.list-card--missing) .list-card__summary').first().click();
  record('mobile layouts switch with identity', await mobile.locator('.layout-strip__heading').first().textContent(), 'Priority Assets vs Reconnaissance');
  record('mobile dropdown has unit links', (await mobile.locator('.list-card__content .roster-link--unit').count()) > 0);
  record('mobile dropdown has rules metadata links', (await mobile.locator('.list-card__content .roster-link--meta').count()) > 0);
  record('mobile roster has no nested scrollbar', await mobile.locator('.list-card__content').first().evaluate((element) => element.scrollHeight === element.clientHeight));
  record('mobile dropdown has two side-by-side objective cards', await mobile.locator('.list-card__summary[aria-expanded="true"]').locator('..').locator('.objective-card').count(), 2);
  record('mobile objective cards stay in two columns', await mobile.locator('.objective-strip__cards').first().evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(' ').length), 2);
  record('mobile dropdown has three side-by-side layouts', await mobile.locator('.list-card__summary[aria-expanded="true"]').locator('..').locator('.layout-thumbnail').count(), 3);
  record('mobile expanded dropdown has no horizontal overflow', await mobile.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
  await mobile.locator('.objective-strip').first().scrollIntoViewIfNeeded();
  await mobile.screenshot({ path: '/tmp/brighton-lists-mobile-expanded.png', fullPage: false });
  await mobile.locator('.list-card:not(.list-card--missing) .list-card__content').first().scrollIntoViewIfNeeded();
  await mobile.screenshot({ path: '/tmp/brighton-lists-mobile.png', fullPage: false });

  await mobile.goto(`http://127.0.0.1:4173/${data.lists[0].pageUrl}`, { waitUntil: 'networkidle' });
  record('mobile detail has roster', await mobile.locator('.detail-roster').isVisible());
  record('mobile detail has rules links', (await mobile.locator('.rules-panel a').count()) > 2);
  record('mobile detail no horizontal overflow', await mobile.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
  await mobile.screenshot({ path: '/tmp/brighton-list-detail-mobile.png', fullPage: false });
  await mobile.goto('http://127.0.0.1:4173/matchups/david-bannister/', { waitUntil: 'networkidle' });
  record('mobile matchup score visible', await mobile.locator('.matchup-score').isVisible());
  record('mobile matchup threats visible', (await mobile.locator('.matchup-threat').count()) > 0);
  record('mobile matchup no horizontal overflow', await mobile.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
  await mobile.screenshot({ path: '/tmp/brighton-matchup-mobile.png', fullPage: true });
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}

results.passed = results.checks.every((check) => check.passed);
await writeFile(new URL('../data/qa-report.json', import.meta.url), `${JSON.stringify(results, null, 2)}\n`);
console.log(JSON.stringify({ passed: results.passed, checks: results.checks.length }, null, 2));
