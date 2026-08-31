import * as cheerio from 'cheerio';
import { readFile, writeFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const raw = JSON.parse(await readFile(new URL('data/raw-lists.json', root), 'utf8'));
const references = JSON.parse(await readFile(new URL('data/wahapedia-references.json', root), 'utf8'));
const ownTeam = raw.roster.find(({ player }) => player === 'Kaashif Hymabaccus').team.trim();
const eligibleListIds = new Set(raw.roster.filter(({ team, listId }) => team.trim() !== ownTeam && listId).map(({ listId }) => listId));
const neededReferences = references.filter(({ listId }) => eligibleListIds.has(listId));
const urls = [...new Set(neededReferences.flatMap(({ datasheets }) => datasheets.map(({ url }) => url)))];

const clean = (value = '') => value.replace(/\s+/g, ' ').trim();
const numeric = (value) => {
  const numbers = String(value).match(/\d+/g)?.map(Number) || [];
  return numbers.length ? Math.max(...numbers) : 0;
};
const grantsPrecision = (text) => /\[PRECISION\]/i.test(text);
const dealsMortalWounds = (text) => /(?:enemy unit|that unit) suffers[^.]{0,80}mortal wounds?/i.test(text);

async function fetchDatasheet(url, attempt = 1) {
  let html;
  try {
    const response = await fetch(url, { headers: { 'user-agent': 'brighton-matchup-audit/1.0' } });
    if (!response.ok) throw new Error(`${response.status} ${url}`);
    html = await response.text();
  } catch (error) {
    if (attempt >= 4) throw error;
    await new Promise((resolve) => setTimeout(resolve, 400 * attempt));
    return fetchDatasheet(url, attempt + 1);
  }
  const $ = cheerio.load(html);
  const sheet = $('.datasheet').first();
  const name = clean(sheet.find('.dsH2Header').first().text()) || clean($('h1').first().text()).replace(/^.*?–\s*/, '');
  const abilities = sheet.find('.dsAbility').map((_, element) => clean($(element).text())).get()
    .filter((text) => /mortal wound|precision|damage characteristic|critical wound|critical hit|psychic test|select one enemy|after.*move|normal move|shoot/i.test(text))
    .slice(0, 12);
  const weapons = [];
  sheet.find('table.wTable tbody.bkg > tr:not(.wTable2_long)').each((_, row) => {
    const cells = $(row).find('td').map((__, cell) => clean($(cell).text())).get();
    if (cells.length < 8) return;
    const [weaponName, range, attacks, skill, strength, ap, damage] = cells.slice(-7);
    if (!weaponName || !damage || /WEAPONS/i.test(weaponName)) return;
    const lower = weaponName.toLowerCase();
    const flagged = /precision|devastating wounds|anti-vehicle|anti-monster|indirect fire/i.test(lower)
      || numeric(damage) >= 3
      || (numeric(strength) >= 12 && numeric(damage) >= 2);
    if (flagged) weapons.push({ name: weaponName, range, attacks, skill, strength, ap, damage });
  });
  return {
    name,
    url,
    flags: {
      precision: abilities.some(grantsPrecision) || weapons.some(({ name: weapon }) => /\bprecision\b/i.test(weapon)),
      mortalWounds: abilities.some(dealsMortalWounds),
      devastatingWounds: weapons.some(({ name: weapon }) => /devastating wounds/i.test(weapon)),
      highDamage: weapons.some(({ damage }) => numeric(damage) >= 3),
      antiTank: weapons.some(({ name: weapon, strength, damage }) => /anti-vehicle|anti-monster/i.test(weapon) || (numeric(strength) >= 12 && numeric(damage) >= 2)),
    },
    weapons,
    abilities,
  };
}

const sheets = new Map();
let cursor = 0;
async function worker() {
  while (cursor < urls.length) {
    const index = cursor++;
    const url = urls[index];
    const sheet = await fetchDatasheet(url);
    sheets.set(url, sheet);
    console.log(`${index + 1}/${urls.length} ${sheet.name || url}`);
  }
}
await Promise.all(Array.from({ length: 6 }, () => worker()));

const players = neededReferences.map((reference) => ({
  listId: reference.listId,
  player: reference.player,
  faction: reference.faction,
  datasheets: reference.datasheets.map(({ url }) => sheets.get(url)).filter(Boolean),
}));
const output = {
  schemaVersion: 1,
  edition: 11,
  fetchedAt: new Date().toISOString(),
  source: 'Wahapedia 11th-edition datasheets',
  playerCount: players.length,
  datasheetCount: sheets.size,
  players,
};
await writeFile(new URL('data/matchup-threats.json', root), `${JSON.stringify(output, null, 2)}\n`);
console.log(`Wrote ${players.length} player audits from ${sheets.size} current datasheets.`);
