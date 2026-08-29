import { readFile, writeFile } from 'node:fs/promises';

const source = JSON.parse(await readFile(new URL('../data/wahapedia-references.json', import.meta.url), 'utf8'));
const urls = [...new Set(source.flatMap((list) => list.datasheets.map((sheet) => sheet.url)))].sort();
const canonicalPattern = /^https:\/\/wahapedia\.ru\/wh40k11ed\/factions\/[^/#]+\/[^/#]+\/$/;
const results = [];
let cursor = 0;

async function worker() {
  while (cursor < urls.length) {
    const url = urls[cursor++];
    const started = performance.now();
    if (!canonicalPattern.test(url)) {
      results.push({ url, ok: false, status: 0, canonical: false, milliseconds: 0 });
      continue;
    }
    try {
      const response = await fetch(url, {
        method: 'HEAD',
        redirect: 'follow',
        headers: { 'user-agent': 'brighton-40k-canonical-link-checker/1.0' },
        signal: AbortSignal.timeout(15_000),
      });
      results.push({
        url,
        ok: response.ok && response.url === url,
        status: response.status,
        canonical: response.url === url,
        finalUrl: response.url,
        milliseconds: Math.round(performance.now() - started),
      });
    } catch (error) {
      results.push({ url, ok: false, status: 0, canonical: true, error: error.message, milliseconds: Math.round(performance.now() - started) });
    }
  }
}

await Promise.all(Array.from({ length: 12 }, worker));
results.sort((a, b) => a.url.localeCompare(b.url));
const failed = results.filter((result) => !result.ok);
const report = {
  checkedAt: new Date().toISOString(),
  uniqueDatasheetUrls: urls.length,
  canonicalIndividualPages: results.filter((result) => result.canonical).length,
  passed: results.length - failed.length,
  failed,
  results,
};
await writeFile(new URL('../data/wahapedia-link-check.json', import.meta.url), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ uniqueDatasheetUrls: report.uniqueDatasheetUrls, canonicalIndividualPages: report.canonicalIndividualPages, passed: report.passed, failed: failed.length }, null, 2));
if (failed.length) process.exitCode = 1;
