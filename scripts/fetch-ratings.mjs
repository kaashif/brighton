import { readFile, writeFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const raw = JSON.parse(await readFile(new URL('data/raw-lists.json', root), 'utf8'));
const sourceUrl = 'https://tabletop-tools.net/new-meta/#/players';
const apiUrl = 'https://tabletop-tools.net/new-meta/trpc/player.search';
const aliases = new Map([
  ['Brando McCready', 'Brandon McCready'],
]);
const normalize = (value = '') => value.normalize('NFKD').replace(/\p{Diacritic}/gu, '').replace(/\s+/g, ' ').trim().toLocaleLowerCase();

async function findRating(player) {
  const lookupName = aliases.get(player.player.trim()) || player.player.trim();
  const url = new URL(apiUrl);
  url.searchParams.set('input', JSON.stringify({ name: lookupName }));
  const response = await fetch(url, { headers: { 'user-agent': 'brighton-40k-list-index/1.0' } });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  const payload = await response.json();
  const candidates = payload.result?.data || [];
  const match = candidates.find((candidate) => normalize(candidate.playerName) === normalize(lookupName));
  if (!match) return { playerId: player.playerId, player: player.player.trim(), team: player.team.trim(), matched: false };
  return {
    playerId: player.playerId,
    player: player.player.trim(),
    team: player.team.trim(),
    matched: true,
    sourceName: match.playerName,
    matchMethod: aliases.has(player.player.trim()) ? 'verified alias' : 'exact name',
    rating: match.displayRating,
    ratingDeviation: Math.round(match.ratingDeviation),
    displayBand: match.displayBand,
    gamesPlayed: match.gamesPlayed,
    profileUrl: `https://tabletop-tools.net/new-meta/#/player/${match.id}`,
  };
}

const players = await Promise.all(raw.roster.map(findRating));
const teams = [];
for (const [team, teamPlayers] of Map.groupBy(players, (player) => player.team)) {
  const rated = teamPlayers.filter((player) => player.matched);
  teams.push({
    team,
    averageRating: rated.length ? Math.round(rated.reduce((sum, player) => sum + player.rating, 0) / rated.length) : null,
    ratedPlayers: rated.length,
    totalPlayers: teamPlayers.length,
  });
}

const output = {
  fetchedAt: new Date().toISOString(),
  source: 'Tabletop Tools — New Meta',
  sourceUrl,
  ratingSystem: 'Glicko-2',
  note: 'Team averages include matched players only. Unmatched identities are not assigned a rating.',
  matchedPlayers: players.filter((player) => player.matched).length,
  unmatchedPlayers: players.filter((player) => !player.matched).length,
  players,
  teams,
};

await writeFile(new URL('data/player-ratings.json', root), `${JSON.stringify(output, null, 2)}\n`);
console.log(`Matched ${output.matchedPlayers}/${players.length} players; wrote data/player-ratings.json.`);
