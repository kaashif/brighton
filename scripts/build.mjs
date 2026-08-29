import * as cheerio from 'cheerio';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const raw = JSON.parse(await readFile(new URL('data/raw-lists.json', root), 'utf8'));
const wahaBase = 'https://wahapedia.ru/wh40k11ed';
const coreRulesUrl = `${wahaBase}/the-rules/core-rules/`;

const factionSlugs = {
  'Adeptus Custodes': 'adeptus-custodes',
  'Adeptus Mechanicus': 'adeptus-mechanicus',
  'Blood Angels': 'space-marines',
  'Chaos Knights': 'chaos-knights',
  'Dark Angels': 'space-marines',
  "Emperor's Children": 'emperor-s-children',
  'Leagues of Votann': 'leagues-of-votann',
  Necrons: 'necrons',
  Orks: 'orks',
  'Space Marines (Astartes)': 'space-marines',
  "T'au Empire": 't-au-empire',
  'Thousand Sons': 'thousand-sons',
  Tyranids: 'tyranids',
  'World Eaters': 'world-eaters',
};

const escapeHtml = (value = '') => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const normalize = (value = '') => value.normalize('NFKD').replace(/[’‘]/g, "'").replace(/[‐‑‒–—]/g, '-').replace(/\p{Diacritic}/gu, '').replace(/\s+/g, ' ').trim().toLocaleLowerCase();
const factionName = (list) => list.faction.split(' - ')[0];
const cleanUnitHeading = (line) => line
  .replace(/^\s*(?:Char\d+:\s*)?/i, '')
  .replace(/^\d+x\s+/i, '')
  .replace(/\s+[\[(]\d+\s+(?:pts|points)[\])]\s*:?\s*$/i, '')
  .trim();

async function fetchText(url) {
  const response = await fetch(url, { headers: { 'user-agent': 'brighton-40k-list-index/1.0' } });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response.text();
}

async function loadFaction(slug) {
  const rootUrl = `${wahaBase}/factions/${slug}/`;
  const [rootHtml, datasheetHtml] = await Promise.all([fetchText(rootUrl), fetchText(`${rootUrl}datasheets.html`)]);
  const $root = cheerio.load(rootHtml);
  const $sheets = cheerio.load(datasheetHtml);
  const datasheets = new Map();
  $sheets(`a[href^="/wh40k11ed/factions/${slug}/"]`).each((_, element) => {
    const href = $sheets(element).attr('href');
    const name = $sheets(element).text().replace(/\s+/g, ' ').trim();
    if (!href || !name || href.endsWith('/') || href.endsWith('.html')) return;
    const tail = href.slice(`/wh40k11ed/factions/${slug}/`.length);
    if (!tail || tail.includes('/') || tail.startsWith('#')) return;
    datasheets.set(normalize(name), { name, url: new URL(href, 'https://wahapedia.ru').href });
  });
  const sections = [];
  $root('h2[id], h3[id]').each((_, element) => {
    const id = $root(element).attr('id');
    const name = $root(element).clone().children().remove().end().text().replace(/\s+/g, ' ').trim();
    if (id && name) sections.push({ name, normalized: normalize(name), url: `${rootUrl}#${encodeURIComponent(id)}` });
  });
  return { slug, rootUrl, datasheets, sections };
}

const alliedSlugs = ['imperial-agents'];
const neededSlugs = [...new Set([...raw.lists.map((list) => factionSlugs[factionName(list)]), ...alliedSlugs])];
if (neededSlugs.includes(undefined)) throw new Error('A faction is missing from factionSlugs.');
const factionIndexes = Object.fromEntries((await Promise.all(neededSlugs.map(loadFaction))).map((index) => [index.slug, index]));

function referencesFor(list) {
  const faction = factionName(list);
  const slug = factionSlugs[faction];
  const index = factionIndexes[slug];
  const lines = list.content.split('\n');
  const datasheets = [];
  const seen = new Set();

  lines.forEach((line, lineIndex) => {
    if (!/[\[(]\d+\s+(?:pts|points)[\])]\s*:?\s*$/i.test(line)) return;
    const cleaned = normalize(cleanUnitHeading(line));
    let match = index.datasheets.get(cleaned);
    if (!match) {
      const candidates = [...index.datasheets.entries()].filter(([name]) => cleaned.startsWith(`${name} with `) || cleaned.startsWith(`${name} - `));
      candidates.sort(([a], [b]) => b.length - a.length);
      match = candidates[0]?.[1];
    }
    if (!match) {
      for (const alliedSlug of alliedSlugs) {
        match = factionIndexes[alliedSlug].datasheets.get(cleaned);
        if (match) break;
      }
    }
    if (match && !seen.has(match.url)) {
      seen.add(match.url);
      datasheets.push({ ...match, lineIndex });
    }
  });

  const detachmentLine = lines.find((line) => /^\s*\+?\s*DETACHMENT:/i.test(line)) || '';
  const detachmentText = detachmentLine.replace(/^\s*\+?\s*DETACHMENT:\s*/i, '').trim();
  const detachmentNormalized = normalize(detachmentText);
  const detachments = index.sections
    .filter((section) => section.normalized.length > 4 && detachmentNormalized.includes(section.normalized))
    .filter((section, position, all) => all.findIndex((item) => item.normalized === section.normalized) === position);

  return {
    faction,
    factionUrl: index.rootUrl,
    coreRulesUrl,
    detachmentText,
    detachments,
    datasheets,
  };
}

function linkedRosterHtml(list, references) {
  const byLine = new Map(references.datasheets.map((sheet) => [sheet.lineIndex, sheet]));
  return list.content.split('\n').map((line, index) => {
    const sheet = byLine.get(index);
    const escaped = escapeHtml(line);
    return sheet ? `<a class="unit-link" href="${sheet.url}" target="_blank" rel="noreferrer">${escaped}<span aria-hidden="true"> ↗</span></a>` : escaped;
  }).join('\n');
}

function detailPage(list, references) {
  const datasheetLinks = references.datasheets.length
    ? references.datasheets.map((sheet) => `<li><a href="${sheet.url}" target="_blank" rel="noreferrer">${escapeHtml(sheet.name)} <span>↗</span></a></li>`).join('')
    : '<li>No datasheet names could be matched from this submission.</li>';
  const detachmentLinks = references.detachments.map((detachment) => `<li><a href="${detachment.url}" target="_blank" rel="noreferrer">${escapeHtml(detachment.name)} <span>↗</span></a></li>`).join('');
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="description" content="${escapeHtml(list.pagePlayer)}'s army list for Brighton 40k Teams II." />
  <title>${escapeHtml(list.pagePlayer)} — Brighton 40k Teams II</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="../../styles.css" />
</head>
<body class="detail-page">
  <header class="detail-hero">
    <nav><a href="../../">← All lists</a><a href="${list.sourceUrl}" target="_blank" rel="noreferrer">Original on BCP ↗</a></nav>
    <p class="eyebrow">${escapeHtml(list.team)}</p>
    <h1>${escapeHtml(list.pagePlayer)}</h1>
    <p class="detail-faction">${escapeHtml(list.faction)}</p>
  </header>
  <main class="detail-layout">
    <article class="roster-panel">
      <div class="section-label">Submitted roster</div>
      <pre class="detail-roster">${linkedRosterHtml(list, references)}</pre>
    </article>
    <aside class="rules-panel">
      <div class="rules-panel__sticky">
        <p class="section-label">11th-edition rules</p>
        <h2>Quick references</h2>
        <ul class="primary-links">
          <li><a href="${references.factionUrl}" target="_blank" rel="noreferrer">${escapeHtml(references.faction)} rules <span>↗</span></a></li>
          <li><a href="${references.coreRulesUrl}" target="_blank" rel="noreferrer">Core rules <span>↗</span></a></li>
          ${detachmentLinks}
        </ul>
        <h3>Datasheets <span>${references.datasheets.length}</span></h3>
        <ul class="datasheet-links">${datasheetLinks}</ul>
        <p class="powered">Rules links powered by <a href="https://wahapedia.ru/wh40k11ed/the-rules/data-export/" target="_blank" rel="noreferrer">Wahapedia</a>.</p>
      </div>
    </aside>
  </main>
</body>
</html>`;
}

await rm(new URL('lists/', root), { recursive: true, force: true });
await mkdir(new URL('lists/', root), { recursive: true });
const builtLists = [];
const referenceReport = [];

for (const list of raw.lists) {
  const references = referencesFor(list);
  const directory = new URL(`lists/${list.listId}/`, root);
  await mkdir(directory, { recursive: true });
  await writeFile(new URL('index.html', directory), detailPage(list, references));
  builtLists.push({ ...list, pageUrl: `lists/${list.listId}/` });
  referenceReport.push({ listId: list.listId, player: list.pagePlayer, ...references });
}

const siteData = { ...raw, lists: builtLists };
await writeFile(new URL('data.js', root), `window.BCP_DATA = ${JSON.stringify(siteData, null, 2)};\n`);
await writeFile(new URL('data/wahapedia-references.json', root), `${JSON.stringify(referenceReport, null, 2)}\n`);
console.log(`Built ${builtLists.length} player pages with ${referenceReport.reduce((sum, item) => sum + item.datasheets.length, 0)} verified-name datasheet references.`);
