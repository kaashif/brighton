import { chromium } from 'playwright';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const report = JSON.parse(await readFile(new URL('data/wahapedia-references.json', root), 'utf8'));
const outputDirectory = '/tmp/brighton-wahapedia-spot-check';
const normalize = (value = '') => value.normalize('NFKD').replace(/[’‘]/g, "'").replace(/[‐‑‒–—]/g, '-').replace(/\p{Diacritic}/gu, '').replace(/\s+/g, ' ').trim().toLocaleLowerCase();
const slugify = (value = '') => normalize(value).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const unique = new Map();
for (const list of report) {
  for (const datasheet of list.datasheets) {
    const factionSlug = new URL(datasheet.url).pathname.split('/')[3];
    if (!unique.has(factionSlug)) unique.set(factionSlug, { factionSlug, name: datasheet.name, url: datasheet.url });
  }
}

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1100, height: 720 }, colorScheme: 'light' });
await context.route('**/*', (route) => ['font', 'image', 'media'].includes(route.request().resourceType()) ? route.abort() : route.continue());
const checks = [];

for (const [index, item] of [...unique.values()].entries()) {
  const page = await context.newPage();
  const started = Date.now();
  try {
    const response = await page.goto(item.url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    const headings = await page.locator('h1, h2').allInnerTexts();
    const visibleHeading = headings.find((heading) => normalize(heading).includes(normalize(item.name))) || '';
    const screenshot = `${String(index + 1).padStart(2, '0')}-${item.factionSlug}-${slugify(item.name)}.png`;
    await page.screenshot({ path: `${outputDirectory}/${screenshot}`, fullPage: false });
    checks.push({ ...item, status: response?.status() ?? null, title: await page.title(), visibleHeading, screenshot, elapsedMs: Date.now() - started, passed: response?.ok() === true && Boolean(visibleHeading) });
  } catch (error) {
    checks.push({ ...item, elapsedMs: Date.now() - started, passed: false, error: error.message });
  } finally {
    await page.close();
  }
}

await browser.close();
const result = {
  checkedAt: new Date().toISOString(),
  method: 'One rendered standalone datasheet page per represented faction; visible heading and screenshot checked.',
  screenshotDirectory: outputDirectory,
  passed: checks.filter((check) => check.passed).length,
  failed: checks.filter((check) => !check.passed).length,
  checks,
};
await writeFile(new URL('data/wahapedia-visual-spot-check.json', root), `${JSON.stringify(result, null, 2)}\n`);
console.log(`Rendered ${checks.length} representative datasheets: ${result.passed} passed, ${result.failed} failed. Screenshots: ${outputDirectory}`);
if (result.failed) process.exitCode = 1;
