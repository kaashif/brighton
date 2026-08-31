import { chromium } from 'playwright';
import { readFile, writeFile } from 'node:fs/promises';

const CDP_URL = process.env.CDP_URL || 'http://127.0.0.1:9223';
const EVENT_ID = 'oBgVBdXRqUIy';
const OUTPUT = new URL('../data/raw-lists.json', import.meta.url);
const ratings = JSON.parse(await readFile(new URL('../data/player-ratings.json', import.meta.url), 'utf8'));
const normalize = (value = '') => value.normalize('NFKD').replace(/\p{Diacritic}/gu, '').replace(/\s+/g, ' ').trim().toLowerCase();
const dispositions = ['Take and Hold', 'Disruption', 'Purge the Foe', 'Reconnaissance', 'Priority Assets'];

const browser = await chromium.connectOverCDP(CDP_URL);
const context = browser.contexts()[0];
const eventPage = context.pages().find((page) => page.url().includes(`/event/${EVENT_ID}`));
if (!eventPage) throw new Error(`Open event ${EVENT_ID} in the connected, authenticated browser first.`);

await eventPage.waitForLoadState('domcontentloaded');

const extractedRoster = await eventPage.locator('svg[data-icon="clipboard-list"]').evaluateAll((icons) =>
  icons.map((icon) => {
    const control = icon.closest('a, button');
    const row = control?.parentElement?.parentElement;
    const teamCard = row?.parentElement?.parentElement;
    const rowLines = (row?.innerText || '').split('\n').map((s) => s.trim()).filter(Boolean);
    const teamLines = (teamCard?.innerText || '').split('\n').map((s) => s.trim()).filter(Boolean);
    const sourceUrl = control?.tagName === 'A' ? control.href : null;
    return {
      player: rowLines[0] || 'Unknown player',
      team: teamLines[0] || 'Unknown team',
      faction: rowLines[1] || 'Unknown faction',
      checkedIn: rowLines.includes('CHECKED IN'),
      listId: sourceUrl ? new URL(sourceUrl).pathname.split('/').pop() : null,
      hasPublishedList: Boolean(sourceUrl),
      sourceUrl,
    };
  }),
);

const roster = extractedRoster.map((entry) => {
  const observed = normalize(entry.player);
  const identity = ratings.players.find((candidate) => observed === normalize(candidate.player) || observed.startsWith(`${normalize(candidate.player)} -`));
  if (!identity) throw new Error(`Could not recover stable identity for ${entry.player}.`);
  const listFaction = entry.faction;
  const faction = dispositions.reduce((value, disposition) => value.replace(new RegExp(` - ${disposition}$`), ''), listFaction);
  return { ...entry, playerId: identity.playerId, player: identity.player.trim(), team: identity.team.trim(), faction, listFaction };
});

const linked = roster.filter((entry) => entry.sourceUrl);
let cursor = 0;

async function extractOne(entry) {
  const page = await context.newPage();
  try {
    await page.goto(entry.sourceUrl, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await page.getByText('Format inspected:', { exact: false }).waitFor({ state: 'visible', timeout: 20_000 });
    const lines = (await page.locator('body').innerText()).split('\n').map((line) => line.replace(/\u00a0/g, ' ').trimEnd());
    const formatIndex = lines.findIndex((line) => line.trim().startsWith('Format inspected:'));
    const footerIndex = lines.findIndex((line, index) => index > formatIndex && line.trim() === 'Connect with us');
    const visible = lines.slice(formatIndex + 1, footerIndex === -1 ? undefined : footerIndex);
    while (visible.length && !visible[0].trim()) visible.shift();
    while (visible.length && !visible.at(-1).trim()) visible.pop();
    const event = visible.shift()?.trim();
    const pagePlayer = visible.shift()?.trim() || entry.player;
    while (visible.length && !visible[0].trim()) visible.shift();
    const uploadedIndex = visible.findIndex((line) => line.trim().startsWith('Uploaded with Best Coast Pairings'));
    const listLines = uploadedIndex === -1 ? visible : visible.slice(0, uploadedIndex);
    while (listLines.length && !listLines.at(-1).trim()) listLines.pop();
    const { listFaction, ...publicEntry } = entry;
    return { ...publicEntry, faction: listFaction, event, pagePlayer, content: listLines.join('\n') };
  } finally {
    await page.close();
  }
}

async function worker() {
  const results = [];
  while (cursor < linked.length) {
    const index = cursor++;
    results.push([index, await extractOne(linked[index])]);
    console.log(`${index + 1}/${linked.length} ${linked[index].player}`);
  }
  return results;
}

const lists = (await Promise.all(Array.from({ length: 4 }, worker))).flat().sort(([a], [b]) => a - b).map(([, list]) => list);
await writeFile(OUTPUT, `${JSON.stringify({
  event: 'Brighton 40k Teams II',
  eventId: EVENT_ID,
  eventUrl: eventPage.url(),
  extractedAt: new Date().toISOString(),
  rosterCount: roster.length,
  count: lists.length,
  missingListCount: roster.length - lists.length,
  roster: roster.map(({ listFaction, ...entry }) => entry),
  lists,
}, null, 2)}\n`);

await browser.close();
