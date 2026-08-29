import * as cheerio from 'cheerio';
import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const rootUrl = new URL('../', import.meta.url);
const rootPath = fileURLToPath(rootUrl);

async function walk(directory) {
  const entries = await readdir(directory);
  const files = [];
  for (const entry of entries) {
    if (entry === '.git' || entry === 'node_modules') continue;
    const full = path.join(directory, entry);
    const info = await stat(full);
    files.push(...(info.isDirectory() ? await walk(full) : [full]));
  }
  return files;
}

const htmlFiles = (await walk(rootPath)).filter((file) => file.endsWith('.html'));
const internalFailures = [];
const externalUrls = new Set();

for (const file of htmlFiles) {
  const $ = cheerio.load(await readFile(file, 'utf8'));
  $('a[href], link[rel="stylesheet"][href], script[src]').each((_, element) => {
    const href = $(element).attr('href') || $(element).attr('src');
    if (!href || href.startsWith('#') || href.startsWith('mailto:')) return;
    if (/^https?:/.test(href)) return void externalUrls.add(href.split('#')[0]);
    const resolved = path.resolve(path.dirname(file), href.split('#')[0]);
    internalFailures.push({ file, href, resolved });
  });
}

const unresolvedInternal = [];
for (const item of internalFailures) {
  try {
    const info = await stat(item.resolved);
    if (info.isDirectory()) await stat(path.join(item.resolved, 'index.html'));
  } catch {
    unresolvedInternal.push(item);
  }
}

const externalResults = [];
const urls = [...externalUrls];
let cursor = 0;
async function worker() {
  while (cursor < urls.length) {
    const url = urls[cursor++];
    try {
      const response = await fetch(url, { method: url.includes('wahapedia.ru') ? 'HEAD' : 'GET', redirect: 'follow', headers: { 'user-agent': 'brighton-40k-link-checker/1.0' }, signal: AbortSignal.timeout(15_000) });
      externalResults.push({ url, status: response.status, ok: response.ok });
      await response.body?.cancel();
    } catch (error) {
      externalResults.push({ url, status: 0, ok: false, error: error.message });
    }
  }
}
await Promise.all(Array.from({ length: 6 }, worker));

const report = {
  checkedAt: new Date().toISOString(),
  htmlFiles: htmlFiles.length,
  internalLinks: internalFailures.length,
  externalLinks: externalResults.length,
  unresolvedInternal,
  failedExternal: externalResults.filter((result) => !result.ok),
  externalResults: externalResults.sort((a, b) => a.url.localeCompare(b.url)),
};
await writeFile(new URL('../data/link-check.json', import.meta.url), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ htmlFiles: report.htmlFiles, internalLinks: report.internalLinks, externalLinks: report.externalLinks, unresolvedInternal: report.unresolvedInternal.length, failedExternal: report.failedExternal.length }, null, 2));
if (report.unresolvedInternal.length || report.failedExternal.length) process.exitCode = 1;
