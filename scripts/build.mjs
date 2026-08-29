import * as cheerio from 'cheerio';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const raw = JSON.parse(await readFile(new URL('data/raw-lists.json', root), 'utf8'));
const ratings = JSON.parse(await readFile(new URL('data/player-ratings.json', root), 'utf8'));
const ratingsByPlayerId = new Map(ratings.players.filter((player) => player.matched).map((player) => [player.playerId, player]));
const playersByListId = new Map(raw.roster.filter((player) => player.listId).map((player) => [player.listId, player]));
const wahaBase = 'https://wahapedia.ru/wh40k11ed';
const coreRulesUrl = `${wahaBase}/the-rules/core-rules/`;
const siteBase = 'https://kaashif.github.io/brighton';

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
const slugify = (value = '') => normalize(value).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
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
    if (!href || !name) return;
    const parsed = new URL(href, 'https://wahapedia.ru');
    if (parsed.hash || parsed.pathname.endsWith('.html')) return;
    const prefix = `/wh40k11ed/factions/${slug}/`;
    const tail = parsed.pathname.slice(prefix.length).replace(/\/$/, '');
    if (!tail || tail.includes('/') || tail.startsWith('#')) return;
    datasheets.set(normalize(name), { name, url: `https://wahapedia.ru${prefix}${tail}/` });
  });
  const sections = [];
  $root('h2[id], h3[id]').each((_, element) => {
    const id = $root(element).attr('id');
    const name = $root(element).clone().children().remove().end().text().replace(/\s+/g, ' ').trim();
    if (id && name) sections.push({ name, normalized: normalize(name), url: `${rootUrl}#${encodeURIComponent(id)}` });
  });
  const enhancements = new Map();
  $root('h2[id]').each((_, element) => {
    const id = $root(element).attr('id');
    if (!id) return;
    const sectionUrl = `${rootUrl}#${encodeURIComponent(id)}`;
    $root(element).nextUntil('h2').find('ul.EnhancementsPts li').each((__, item) => {
      const name = $root(item).find('span').first().text().replace(/\s+/g, ' ').trim();
      if (name) enhancements.set(normalize(name), { name, url: sectionUrl });
    });
  });
  return { slug, rootUrl, datasheets, sections, enhancements };
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
  const datasheetMatches = new Map();

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
    if (match) {
      if (!datasheetMatches.has(match.url)) datasheetMatches.set(match.url, { ...match, lineIndexes: [] });
      datasheetMatches.get(match.url).lineIndexes.push(lineIndex);
    }
  });
  const datasheets = [...datasheetMatches.values()];

  const detachmentLine = lines.find((line) => /^\s*\+?\s*DETACHMENT:/i.test(line)) || '';
  const detachmentText = detachmentLine.replace(/^\s*\+?\s*DETACHMENT:\s*/i, '').trim();
  const detachmentNormalized = normalize(detachmentText);
  const detachments = index.sections
    .filter((section) => section.normalized.length > 4 && detachmentNormalized.includes(section.normalized))
    .filter((section, position, all) => all.findIndex((item) => item.normalized === section.normalized) === position);
  const detachmentLineIndex = lines.indexOf(detachmentLine);
  const enhancements = [];
  for (const enhancement of index.enhancements.values()) {
    const lineIndexes = lines.flatMap((line, lineIndex) => normalize(line).includes(normalize(enhancement.name)) ? [lineIndex] : []);
    if (lineIndexes.length) enhancements.push({ ...enhancement, lineIndexes });
  }
  const factionLineIndexes = lines.flatMap((line, lineIndex) => {
    const normalized = normalize(line);
    return /^\s*\+?\s*FACTION(?: KEYWORD)?:/i.test(line) || (lineIndex === 0 && normalized.includes(normalize(faction))) ? [lineIndex] : [];
  });

  return {
    faction,
    factionUrl: index.rootUrl,
    coreRulesUrl,
    detachmentText,
    detachmentLineIndex,
    detachments,
    enhancements,
    factionLineIndexes,
    datasheets,
  };
}

function linkTerms(line, terms, className = 'roster-link roster-link--meta') {
  const comparable = line.replace(/[’‘]/g, "'").toLocaleLowerCase();
  const occurrences = [];
  for (const term of terms) {
    const needle = term.name.replace(/[’‘]/g, "'").toLocaleLowerCase();
    const start = comparable.indexOf(needle);
    if (start !== -1) occurrences.push({ start, end: start + needle.length, ...term });
  }
  occurrences.sort((a, b) => a.start - b.start || b.end - a.end);
  const nonOverlapping = occurrences.filter((item, index, all) => !all.slice(0, index).some((earlier) => item.start < earlier.end));
  if (!nonOverlapping.length) return null;
  let cursor = 0;
  let html = '';
  for (const occurrence of nonOverlapping) {
    html += escapeHtml(line.slice(cursor, occurrence.start));
    html += `<a class="${className}" href="${occurrence.url}" target="_blank" rel="noreferrer">${escapeHtml(line.slice(occurrence.start, occurrence.end))}</a>`;
    cursor = occurrence.end;
  }
  return html + escapeHtml(line.slice(cursor));
}

function linkedRosterHtml(list, references) {
  const datasheetByLine = new Map(references.datasheets.flatMap((sheet) => sheet.lineIndexes.map((lineIndex) => [lineIndex, sheet])));
  const enhancementByLine = new Map(references.enhancements.flatMap((enhancement) => enhancement.lineIndexes.map((lineIndex) => [lineIndex, enhancement])));
  return list.content.split('\n').map((line, index) => {
    const sheet = datasheetByLine.get(index);
    const escaped = escapeHtml(line);
    if (sheet) return `<a class="roster-link roster-link--unit" href="${sheet.url}" target="_blank" rel="noreferrer">${escaped}</a>`;
    const enhancement = enhancementByLine.get(index);
    if (enhancement) return linkTerms(line, [enhancement]) || `<a class="roster-link roster-link--meta" href="${enhancement.url}" target="_blank" rel="noreferrer">${escaped}</a>`;
    if (index === references.detachmentLineIndex && references.detachments.length) {
      return linkTerms(line, references.detachments) || `<a class="roster-link roster-link--meta" href="${references.detachments[0].url}" target="_blank" rel="noreferrer">${escaped}</a>`;
    }
    if (references.factionLineIndexes.includes(index)) return `<a class="roster-link roster-link--meta" href="${references.factionUrl}" target="_blank" rel="noreferrer">${escaped}</a>`;
    return escaped;
  }).join('\n');
}

function exportMarkdown(player, list, references, rating) {
  const heading = `# ${player.player}\n\n`;
  const metadata = [
    `- Team: ${player.team.trim()}`,
    `- Faction: ${player.faction}`,
  ];
  if (rating) metadata.push(`- [Glicko-2 rating: ${rating.rating} (${rating.gamesPlayed} games)](${rating.profileUrl})`);

  if (!list) {
    return `${heading}${metadata.join('\n')}\n\n## Army list\n\nNo list submitted.\n`;
  }

  metadata.push(`- [Original submission on Best Coast Pairings](${list.sourceUrl})`);
  metadata.push(`- [Web version](${siteBase}/lists/${list.listId}/)`);
  return `${heading}${metadata.join('\n')}\n\n## Army list\n\n<pre>${linkedRosterHtml(list, references)}</pre>\n`;
}

function detailPage(list, references, rating) {
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
  <link rel="stylesheet" href="../../styles.css" />
</head>
<body class="detail-page">
  <header class="detail-hero">
    <nav><a href="../../">← All lists</a><a href="${list.sourceUrl}" target="_blank" rel="noreferrer">Original on BCP ↗</a></nav>
    <h1>${escapeHtml(list.pagePlayer)}</h1>
    <p class="detail-meta">${escapeHtml(list.team)} · ${escapeHtml(list.faction)}${rating ? ` · <a href="${rating.profileUrl}" target="_blank" rel="noreferrer">Glicko-2 ${rating.rating}</a>` : ''}</p>
  </header>
  <main class="detail-layout">
    <article class="roster-panel">
      <h2>Army list</h2>
      <pre class="detail-roster">${linkedRosterHtml(list, references)}</pre>
    </article>
    <aside class="rules-panel">
      <div class="rules-panel__sticky">
        <h2>11th-edition rules</h2>
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
await rm(new URL('exports/', root), { recursive: true, force: true });
await mkdir(new URL('exports/', root), { recursive: true });
const builtLists = [];
const referenceReport = [];
const referencesByListId = new Map();

for (const list of raw.lists) {
  const references = referencesFor(list);
  const rating = ratingsByPlayerId.get(playersByListId.get(list.listId)?.playerId);
  const directory = new URL(`lists/${list.listId}/`, root);
  await mkdir(directory, { recursive: true });
  await writeFile(new URL('index.html', directory), detailPage(list, references, rating));
  builtLists.push({ ...list, pageUrl: `lists/${list.listId}/`, linkedContent: linkedRosterHtml(list, references) });
  referenceReport.push({ listId: list.listId, player: list.pagePlayer, ...references });
  referencesByListId.set(list.listId, references);
}

const listsById = new Map(raw.lists.map((list) => [list.listId, list]));
const exportRecords = [];
for (const player of raw.roster) {
  const list = player.listId ? listsById.get(player.listId) : null;
  const rating = ratingsByPlayerId.get(player.playerId);
  const filename = `${slugify(player.team)}--${slugify(player.player)}.md`;
  await writeFile(new URL(`exports/${filename}`, root), exportMarkdown(player, list, list ? referencesByListId.get(list.listId) : null, rating));
  exportRecords.push({ ...player, filename, rating });
}

const exportGroups = Map.groupBy(exportRecords, (player) => player.team.trim());
const exportIndex = [
  '# Hyperlinked army-list files',
  '',
  'All 40 event players are included. Players without a published submission are represented by a file marked “No list submitted”.',
  '',
];
for (const [team, players] of exportGroups) {
  exportIndex.push(`## ${team}`, '');
  for (const player of players) {
    const status = player.hasPublishedList ? '' : ' — no list submitted';
    const rating = player.rating ? ` — [Glicko-2 ${player.rating.rating}](${player.rating.profileUrl})` : '';
    exportIndex.push(`- [${player.player}](./${player.filename}) — ${player.faction}${status}${rating}`);
  }
  exportIndex.push('');
}
await writeFile(new URL('exports/README.md', root), `${exportIndex.join('\n')}\n`);

const siteData = { ...raw, lists: builtLists, ratings };
await writeFile(new URL('data.js', root), `window.BCP_DATA = ${JSON.stringify(siteData, null, 2)};\n`);
await writeFile(new URL('data/wahapedia-references.json', root), `${JSON.stringify(referenceReport, null, 2)}\n`);
console.log(`Built ${builtLists.length} player pages and ${exportRecords.length} repository exports with ${referenceReport.reduce((sum, item) => sum + item.datasheets.length, 0)} verified-name datasheet references.`);
