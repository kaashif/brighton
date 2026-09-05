import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const raw = JSON.parse(await readFile(new URL('data/raw-lists.json', root), 'utf8'));
const audits = JSON.parse(await readFile(new URL('data/matchup-threats.json', root), 'utf8'));
const kaashifTeam = 'South London Squad';
const sourceBase = 'https://wahapedia.ru/wh40k11ed/factions';

const normalize = (value = '') => value.normalize('NFKD').replace(/\p{Diacritic}/gu, '').replace(/[^a-z0-9]+/gi, ' ').trim().toLowerCase();
const slugify = (value = '') => normalize(value).replace(/\s+/g, '-');
const escapeHtml = (value = '') => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const stars = (rating) => `${'★'.repeat(rating)}${'☆'.repeat(5 - rating)}`;
const listById = new Map(raw.lists.map((list) => [list.listId, list]));
const auditByListId = new Map(audits.players.map((audit) => [audit.listId, audit]));

const factionRules = {
  'Adeptus Custodes': ['adeptus-custodes', 'Elite melee infantry with excellent saves, strong character-led units and relatively few bodies.', 'They usually take the centre, force close combats and win by making each model hard to shift.', 'The fight is catchable and mostly comes to you. Preserve the Technomancers from Precision, layer Wraiths in front and counter-charge after they commit.'],
  'Adeptus Mechanicus': ['adeptus-mechanicus', 'A combined-arms gunline with efficient vehicles, specialist infantry and layered targeting support.', 'They try to establish firing lanes, trade disposable screens and focus a key target with high-damage guns.', 'Deny lanes, do not drip-feed C’tan into anti-tank fire, and use Wraiths to pin the shooting pieces before exposing the missile.'],
  'Blood Angels': ['space-marines', 'Fast Space Marine melee pressure backed by jump units, transports and a smaller shooting package.', 'They threaten an early multi-charge, use speed to choose a flank and try to kill support characters during the scrum.', 'This is broadly the kind of matchup Kaashif wants: receive the first wave with Wraiths, protect the Technomancers, then counter-charge with the missile.'],
  'Chaos Daemons': ['chaos-daemons', 'A mixed monster-and-infantry army with deep-strike pressure, invulnerable saves and disruptive melee threats.', 'They use reserve arrivals and fast monsters to overload a flank, contest the centre and force several awkward combats at once.', 'Screen the Technomancers from deep strike, make the Daemons hit Wraiths first and concentrate the counter-charge into one greater threat at a time.'],
  'Chaos Knights': ['chaos-knights', 'A vehicle-heavy army of fast War Dogs with efficient shooting, melee and high objective pressure.', 'They spread onto firing angles, trade individual hulls and use melta/high-damage guns to pressure C’tan.', 'Hide until several dogs can be tagged at once. Avoid isolated C’tan exposures and make the Wraith charges shut down guns, not just score a trade.'],
  'Chaos Space Marines': ['chaos-space-marines', 'A flexible combined-arms faction that can mix durable infantry, fast melee, transports and dangerous shooting.', 'They use layered trading pieces and powerful character-led units while vehicles establish damaging firing lanes.', 'Identify Precision, mortal-wound and D3+ weapons before exposing support pieces, then decide whether to receive the melee elements or stage for the guns.'],
  'Dark Angels': ['space-marines', 'Space Marines with access to durable elite infantry and highly mobile Ravenwing shooting.', 'A mobile build can create cross-board angles, shoot and reposition while a hard melee unit controls the centre.', 'Do not chase skirmishers across open lanes. Hide the support package, force the bikes toward objectives and launch only when the Wraiths can trap them.'],
  'Death Guard': ['death-guard', 'Slow, durable close-range units with debuffs, resilient infantry and damaging short-range brawlers.', 'They normally compress the board, occupy the middle and grind down anything that stays in contagion range.', 'The low speed helps. Screen debuff pieces with Wraiths, preserve the Technomancers and choose one flank so the counter-charge overwhelms rather than feeds the grind.'],
  Deathwatch: ['space-marines', 'A flexible Space Marine force with specialist kill teams, elite infantry and access to broad weapon mixes.', 'They combine layered shooting with durable infantry, then use mission tools and focused attacks to remove a chosen target.', 'Inventory their high-damage and Precision weapons before deploying, protect the Technomancers and use Wraiths to pin the shooting elements before committing C’tan.'],
  'Drukhari': ['drukhari', 'Very fast, fragile units in transports with strong trading, mobile shooting and precise melee threats.', 'They try to stay uncatchable, expose only the unit needed for a trade and attack support pieces from unexpected angles.', 'This is structurally awkward. Protect Technomancers from angles, reserve a counterpunch and use objectives to force fragile boats and infantry into Wraith charge range.'],
  "Emperor's Children": ['emperor-s-children', 'Fast elite melee pressure with numerous character-led units, Precision access and powerful monsters.', 'They want to dictate combats, isolate leaders and use Fulgrim or another hammer to break the durable centre.', 'Receive the charge through Wraiths, never offer a clean Precision line to a Technomancer and counter-charge the committed hammer with several threats together.'],
  'Genestealer Cult': ['genestealer-cults', 'A mobile ambush army with deep strike, redeployment, short-range shooting and disposable units that can return.', 'They attack from reserves, overload a weak edge and score while avoiding a straight durability fight.', 'Screen deeply, keep the missile compact and do not let the army be pulled apart. The main danger is mobile shooting and repeated scoring rather than a fair brawl.'],
  'Leagues of Votann': ['leagues-of-votann', 'Tough mid-range infantry and vehicles with efficient high-damage shooting and strong objective control.', 'They usually establish a shooting castle, mark priority targets and move durable units onto the midfield once trades begin.', 'Avoid long lanes and expose only when Wraiths can connect. Their D3+ and rail-style weapons are much worse for C’tan than ordinary D2 volume.'],
  'Necrons': ['necrons', 'Another durable Necron build built around resilient threats, regeneration and efficient objective play.', 'It will try to win the durability race, force awkward target priority and preserve expensive threats until late.', 'Concentrate damage instead of splitting, protect Technomancers from character-killing tools and use the Void Dragon where it can punish vehicles or an opposing C’tan safely.'],
  'Orks': ['orks', 'A high-volume pressure army with fast melee, large units, transports and disruptive forward pieces.', 'It wants to occupy lanes early, pin the army in deployment and deliver several charges at once.', 'This is a preferred shape: block Scout moves when needed, let Wraiths absorb the first contact and counter-charge the committed mass with the compact missile.'],
  'Space Marines (Astartes)': ['space-marines', 'A flexible Space Marine force that may combine mobile shooting, durable infantry, transports and melee.', 'Without the submitted list, it could play either a mid-board combined-arms game or a more mobile shooting game.', 'Keep the read provisional. Check for Scout snipers, melta, D6+ damage and shoot-and-move units before exposing Technomancers or C’tan.'],
  "T'au Empire": ['t-au-empire', 'Fast, efficient shooting with battlesuits, skimmers, rail weapons and disposable spotting or screening units.', 'They create firing angles, focus one durable target and reposition so the counter-charge cannot connect.', 'This is the worst archetype for Kaashif. Stage completely out of sight, pressure several objectives together and use Wraiths to trap suits or vehicles before revealing C’tan.'],
  'Thousand Sons': ['thousand-sons', 'Elite psychic shooting with teleport tools, Devastating Wounds and direct mortal-wound effects.', 'They isolate a valuable unit, amplify psychic damage and use movement tricks to avoid the counter-charge.', 'Respect Doombolt and psychic Devastating Wounds even when normal line-of-sight maths looks safe. Spread threat pressure, deny teleport landing zones and do not expose Technomancers.'],
  'Tyranids': ['tyranids', 'A flexible monster-and-infantry army with board control, disruption and either pressure or high-damage monster shooting.', 'It tries to crowd objectives with expendable bodies while monsters choose favourable combats or firing lanes.', 'Clear screens without separating the missile. Hide C’tan from rupture/high-damage guns and keep Technomancers away from Precision monsters.'],
  'World Eaters': ['world-eaters', 'Very fast melee pressure with pre-game movement, hard character-led units and multiple early-charge threats.', 'They try to pin the army immediately and kill several units before a coherent counter-charge is possible.', 'This is a favourable style if deployment blocks the first wave. Put bodies in Scout lanes, receive with Wraiths and counter-charge with the entire missile rather than individual pieces.'],
};

// Ratings are Kaashif-specific, not general army power rankings.
const profiles = {
  'Dan Freeman': [4, 'The World Eaters pressure still has to enter the counter-charge zone, though the daemon engines add meaningful high-damage shooting and melee.', 'Make Eightbound hit Wraiths first, keep C’tan out of Forgefiend and Defiler lanes, then collapse the missile onto the committed wave.'],
  'Harley Stevens': [4, 'The Daemon list is a catchable durability brawl built around Rotigus, a Great Unclean One and several Nurgle objective pieces.', 'Screen the Khorne speed and reserve arrivals, hold the middle with Wraiths and focus one greater daemon before the next can join the combat.'],
  'Luke Vincent': [2, 'This Ork list mixes durable melee pieces with substantial Lootas, Flash Gitz and mobile shooting, so it can pressure without offering a clean brawl.', 'Block the early board-control pieces, hide the Technomancers from shooting angles and send Wraiths to pin Lootas or Flash Gitz before exposing the missile.'],
  'Tim Anderson': [3, 'The Death Guard core is slow and catchable, but Rotigus, Defilers and Bloat-drones add durable pressure plus high-damage attacks.', 'Choose one flank, keep C’tan out of the daemon-engine lanes and use Wraiths to separate the first pressure piece from the slower Nurgle centre.'],
  'Alexander England': [2, 'Mobile Salamanders shooting, multiple melta platforms and D6/D6+1 damage are all dangerous to C’tan.', 'Hide from the long Land Speeder and missile lanes, protect Technomancers from the Scout sniper and commit Wraiths only where they can tag the melta package.'],
  'Geoff Legg': [4, 'Custodes mostly have to enter the counter-charge zone, although D3 melee and Blade Champion Precision matter.', 'Layer Wraiths in front of the support characters, accept a controlled first combat and then collapse the missile onto one elite unit.'],
  'Grzegorz Bondaruk': [3, 'The triple-C’tan mirror is a slow durability fight with dangerous mortal-wound and high-damage spikes on both sides.', 'Concentrate on one C’tan at a time, keep Technomancers away from the Deceiver and avoid giving Imotekh a valuable clustered mortal-wound target.'],
  'Jerome Connolly': [2, 'AdMech combine firing lanes, vehicle-killing guns and genuine Precision into the support package.', 'Stay completely hidden until Wraiths can tag several guns; never expose a Technomancer to the Rangers and do not send a C’tan alone into the D6+ damage.'],
  'Christian Faustino': [4, 'Fast Blood Angels melee is catchable and invites the counter-charge, but jump speed and a Scout sniper can reach support pieces.', 'Screen the first wave with Wraiths, hide Technomancers from the Scout angle and keep enough depth that Dante’s unit cannot touch the missile for free.'],
  'Daniel Fuller': [3, 'The army comes into melee, but widespread Precision plus Fulgrim’s high damage and mortal wounds directly attack the Necron support structure.', 'Keep Technomancers out of character lines, let Wraiths receive lesser units and counter Fulgrim only with multiple missile elements together.'],
  'Jack Holliday': [1, 'This is fast T’au shooting with rail, fusion and D6+1 damage that can keep moving away from the counter-charge.', 'Give up early angles, stage behind full ruins and push Wraiths onto multiple lanes so at least one unit can trap Broadsides, Piranhas or the Ghostkeel.'],
  'Louis Anderson': [2, 'Two rupture-cannon Tyrannofexes threaten C’tan at extreme damage while Deathleaper and the Norn can use Precision.', 'Hide C’tan until the Tyrannofex lanes are closed, screen Technomancers from the lone operatives and use Wraiths to clear the infantry screen without overextending.'],
  'Brando McCready': [2, 'The Votann list combines two large Hearthguard bricks with Thunderkyn, fast Pioneers and numerous Yaegir screens.', 'Protect C’tan from grav fire, do not let the Yaegirs pull the army apart and use Wraiths to pin the mobile elements before committing into Hearthguard.'],
  'Max Pringle': [3, 'The Red Corsairs list combines fast infantry and bikes with Mutilators, a Predator and a Defiler, giving it both catchable pressure and dangerous guns.', 'Identify the high-damage lanes, receive the mobile wave with Wraiths and counter only when the Predator and Defiler can also be tagged or hidden from.'],
  'Rob Lebeau': [2, 'Ravenwing speed, mobile plasma and speeder fire can evade the slow counter-charge while the Lion and Deathwing Knights anchor the centre.', 'Refuse the opening bike and speeder lanes, keep Technomancers screened and force the Ravenwing onto objectives where Wraiths can trap them.'],
  'Sam Cordell': [1, 'The submitted T’au list has the exact mobile-shooting profile Kaashif dislikes: a Hammerhead, Riptide, Ghostkeel, Piranhas and layered spotters.', 'Deploy for zero early lines, preserve both Wraith bricks and accept scoring pressure until a multi-tag charge can trap the main shooting assets.'],
  'Bradley Stuart-James': [3, 'The monster pressure is catchable, but Assimilators and Haruspexes bring D6+1 damage and charge-phase mortal wounds.', 'Use Wraiths to control which monster connects first, do not let the missile be multi-charged and counter one exposed monster with concentrated force.'],
  'Ezra Adams': [3, 'Custodes come into the brawl, but this list has several Precision pieces, fast bikes and D3/D6+1 damage.', 'Hide Technomancers behind the Wraith footprint, absorb the first elite unit and keep the Nightbringer away from an unsupported bike charge.'],
  'Matt Delves': [1, 'Double Hekaton and the rest of the Votann gunline carry exactly the high-damage shooting that bypasses the favourable D2 profile.', 'Stay off every rail/beam lane, push Wraiths into the vehicles together and protect Technomancers from any Preymark or other Precision angle.'],
  'Max Dennis': [3, 'This EC list is catchable melee pressure, but its many Precision characters and D3/D6 damage can dismantle the support package.', 'Receive with Wraiths, deny character-to-Technomancer contact and counter the committed units before the Defiler or Prince can join cleanly.'],
  'Alex Dracup': [4, 'Ork pressure largely has to enter the preferred counter-charge range, though Snikrot/Wazdakka Precision and Ghaz’s D4 are real threats.', 'Screen the forward tricks, keep Technomancers away from Snikrot and let Wraiths pin the first wave while the missile selects Ghaz or the main brick.'],
  'Andrew Mcbride': [4, 'World Eaters are a preferred fast-melee matchup, offset by Master of Executions Precision and several D6+ damage engines.', 'Block Scout lanes, make Wraiths the only early charge and keep Technomancers out of the Master of Executions unit’s reach before countering with the whole missile.'],
  'Charles Bunn': [1, 'Magnus, psychic Devastating Wounds, Doombolt-style mortal wounds and Precision bows attack every part of the Necron durability plan.', 'Spread valuable units, screen teleport positions, hide Technomancers and pressure several angles so Magnus cannot focus the entire army safely.'],
  'Rob Scott': [1, 'Ravenwing speed, shoot-and-move pressure, plasma and D6+1 guns make this a textbook hard fast-shooting matchup.', 'Refuse long lanes, do not chase bikes and use objectives to force one wing close enough for Wraiths to tag while the missile stays hidden.'],
  'Adam Wright': [2, 'The Salamanders package mixes mobile D6+ shooting, a Redeemer and Scout Precision with credible board pressure.', 'Protect support characters, hide from the speeders and commit only when Wraiths can pin the vehicles rather than merely touch a disposable screen.'],
  'Daniel Latham': [2, 'Mobile Lokhust shooting plus Void Dragon and other mortal/high-damage spikes threaten the C’tan plan while the Necron shell remains hard to clear.', 'Use terrain to deny Lokhust angles, keep the missile compact and commit the Void Dragon only when it can trade into the opposing vehicles or C’tan without being focused.'],
  'Pete Armstrong': [1, 'A board full of fast War Dogs with melta, autocannons and D6+2 melee can shoot while staying difficult to pin.', 'Hide all C’tan from the opening spear lanes, threaten multiple dog charges with Wraiths and avoid trading a whole brick for one cheap hull.'],
  'Ryan Nichol': [4, 'This Custodes list wants a direct melee contest and has comparatively few bodies, which suits the Wraith screen and counter-charge plan.', 'Make them spend an elite unit to clear Wraiths, protect Technomancers from the Blade Champion and concentrate the missile on one brick.'],
  'Chris Shaw': [4, 'Ghazghkull, Meganobz, Squighogs and Kommandos bring the kind of direct Ork pressure the Wraith screen wants to receive.', 'Block the forward tricks, keep Technomancers away from Snikrot and let Wraiths pin the first wave while the missile selects Ghaz or the Meganob brick.'],
  'Christopher Dyas': [1, 'Sunforge and Fireknife Crisis suits, a Hammerhead and a Ghostkeel create mobile high-damage angles that can avoid the slow Necron melee package.', 'Deploy without visible C’tan or Technomancers, then force the suits and tanks to contest several objectives inside Wraith charge distance.'],
  'Liam Macindoe': [1, 'Deathwatch kill teams combine flexible shooting, elite infantry and a Thunderstrike with enough mobility to target the Necron support package.', 'Inventory the kill-team weapon profiles, protect Technomancers and use both Wraith units to close shooting lanes before committing isolated C’tan.'],
  'Nick Watkins': [3, 'The Emperor’s Children list mixes fast daemon pressure, several monsters and a Defiler, making it catchable but dangerous to unsupported pieces.', 'Screen Shalaxi and the winged threats with Wraiths, hide the Technomancers from character attacks and counter one monster at a time with the full missile.'],
  'David Bannister': [1, 'Retaliation Cadre battlesuits plus Hammerhead and Stormsurge combine extreme mobility with D6+6/D12 shooting.', 'Play for zero opening lines, force suits to expose for objectives and use both Wraith units to trap the mobile guns before any C’tan is shown.'],
  'Jonathan Aylett': [5, 'Huge Scout-enabled Ork melee blocks are exactly the pressure Kaashif wants to tank and counter-charge.', 'Use both Flayed One units to block Scout lanes when required, receive the mass with Wraiths and launch the compact missile into the committed centre.'],
  'Nicholas Bannister': [4, 'Custodes and Sisters must fight at close range and mostly offer efficient targets for the Necron counter-charge.', 'Protect Technomancers from the Blade Champion, clear Sisters cheaply and make the Custodes commit to Wraiths before sending the missile.'],
  'William Samms': [2, 'The Dark Angels list combines three Vengeance speeders and mobile Ravenwing pressure with the Lion and two Deathwing Knight units.', 'Hide C’tan from the plasma and melta lanes, force the speeders onto objectives and make Wraiths absorb the elite infantry before the counter-charge.'],
};
const profilesByName = new Map(Object.entries(profiles).map(([name, profile]) => [normalize(name), profile]));

function datasheetThreat(sheet) {
  const tags = [];
  const precision = sheet.weapons.filter((weapon) => /precision/i.test(weapon.name)).slice(0, 2);
  const mortalAbilities = sheet.abilities.filter((ability) => /(?:enemy unit|that unit) suffers[^.]{0,80}mortal wounds?/i.test(ability)).slice(0, 1);
  const devastating = sheet.weapons.filter((weapon) => /devastating wounds/i.test(weapon.name)).slice(0, 2);
  const highDamage = sheet.weapons.filter((weapon) => /D6|D3|D12|\b[3-9]\b|\b1[0-9]\b/i.test(weapon.damage)).slice(0, 2);
  if (precision.length) tags.push(`Precision: ${precision.map((weapon) => `${weapon.name} (${weapon.damage} damage)`).join(', ')}`);
  else if (sheet.flags.precision) tags.push('A conditional Precision ability is present; check its target restrictions.');
  if (mortalAbilities.length) tags.push(`Mortal wounds: ${mortalAbilities[0].split(':')[0]}.`);
  if (highDamage.length) tags.push(`High damage: ${highDamage.map((weapon) => `${weapon.name} (${weapon.damage})`).join(', ')}`);
  if (devastating.length) tags.push(`Devastating Wounds: ${devastating.map((weapon) => weapon.name).join(', ')}`);
  return tags.slice(0, 3);
}

function threatScore(sheet) {
  return Number(sheet.flags.mortalWounds) * 7 + Number(sheet.flags.precision) * 6 + Number(sheet.flags.antiTank) * 4 + Number(sheet.flags.highDamage) * 3 + Number(sheet.flags.devastatingWounds) * 2;
}

function selectThreats(audit) {
  if (!audit) return [];
  return audit.datasheets
    .filter((sheet) => threatScore(sheet) > 0 && datasheetThreat(sheet).length)
    .sort((a, b) => threatScore(b) - threatScore(a))
    .slice(0, 6)
    .map((sheet) => ({ name: sheet.name.replace(/\(⌀.*$/, '').trim(), url: sheet.url, notes: datasheetThreat(sheet) }));
}

function matchupPage(entry) {
  const threatHtml = entry.threats.length ? entry.threats.map((threat) => `
          <article class="matchup-threat">
            <h3><a href="${threat.url}" target="_blank" rel="noreferrer">${escapeHtml(threat.name)} ↗</a></h3>
            <ul>${threat.notes.map((note) => `<li>${escapeHtml(note)}</li>`).join('')}</ul>
          </article>`).join('').trim() : '<p class="matchup-empty">No exact datasheet audit is possible without a usable submitted list. Check the opponent’s roster at the table.</p>';
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="description" content="Kaashif's Brighton matchup notes for ${escapeHtml(entry.player)}." />
  <title>Kaashif vs ${escapeHtml(entry.player)} — Brighton matchup</title>
  <link rel="stylesheet" href="../../styles.css" />
</head>
<body class="matchup-page">
  <header class="detail-hero matchup-hero">
    <nav><a href="../../">← Brighton roster</a><a href="../">All matchup reads</a></nav>
    <h1>Kaashif vs ${escapeHtml(entry.player)}</h1>
    <p class="detail-meta">${escapeHtml(entry.team)} · ${escapeHtml(entry.faction)}</p>
    <div class="matchup-score" aria-label="${entry.rating} out of 5 stars"><strong>${stars(entry.rating)}</strong><span>${entry.rating}/5 for Kaashif</span></div>
    <p class="matchup-verdict">${escapeHtml(entry.verdict)}</p>
    <p class="matchup-confidence"><strong>${entry.confidence} confidence.</strong> ${escapeHtml(entry.evidence)}</p>
  </header>
  <main class="matchup-main">
    <section class="matchup-section">
      <h2>What the army does</h2>
      <p>${escapeHtml(entry.army)}</p>
      <h2>What they probably try</h2>
      <p>${escapeHtml(entry.opponentPlan)}</p>
      <h2>Kaashif’s plan</h2>
      <p>${escapeHtml(entry.kaashifPlan)}</p>
      <p>${escapeHtml(entry.playerPlan)}</p>
    </section>
    <section class="matchup-section matchup-section--threats">
      <h2>List-specific traps</h2>
      ${threatHtml}
    </section>
    <section class="matchup-method">
      <h2>How to read the rating</h2>
      <p>★★★★★ strongly favourable · ★★★☆☆ roughly even · ★☆☆☆☆ strongly unfavourable. This is a subjective pairing read for Kaashif’s submitted Necron list, not a player or army power rating.</p>
      <p>The read rewards fast melee that Wraiths can absorb and the missile can counter-charge. It penalises fast shooting, Precision into Technomancers, mortal/Devastating Wound output and D3+ weapons into C’tan. Ordinary Damage 2 volume is comparatively welcome because Necrodermis reduces it efficiently.</p>
      <p><a href="${entry.factionUrl}" target="_blank" rel="noreferrer">Current faction rules on Wahapedia ↗</a>${entry.listUrl ? ` · <a href="../../lists/${entry.listId}/">Submitted Brighton list</a>` : ''}</p>
    </section>
  </main>
</body>
</html>`;
}

const opponents = raw.roster.filter((player) => player.team.trim() !== kaashifTeam);
const entries = opponents.map((player) => {
  const profile = profilesByName.get(normalize(player.player));
  if (!profile) throw new Error(`No matchup profile for ${player.player}`);
  const faction = factionRules[player.faction];
  if (!faction) throw new Error(`No faction profile for ${player.faction}`);
  const list = player.listId ? listById.get(player.listId) : null;
  const usableList = list && list.content.trim() !== 'Suck your mum';
  const audit = usableList ? auditByListId.get(player.listId) : null;
  const slug = slugify(player.player);
  return {
    playerId: player.playerId,
    player: player.player.trim(),
    team: player.team.trim(),
    faction: player.faction,
    slug,
    pageUrl: `matchups/${slug}/`,
    rating: profile[0],
    stars: stars(profile[0]),
    verdict: profile[1],
    playerPlan: profile[2],
    army: faction[1],
    opponentPlan: faction[2],
    kaashifPlan: faction[3],
    factionUrl: `${sourceBase}/${faction[0]}/`,
    confidence: usableList ? 'High' : 'Low',
    evidence: usableList ? 'Based on the submitted Brighton list and current 11th-edition datasheets.' : list ? 'The submitted entry contains no usable roster; this is a faction-level provisional read.' : 'No list was submitted; this is a faction-level provisional read.',
    listId: usableList ? player.listId : null,
    listUrl: usableList ? list.sourceUrl : null,
    threats: selectThreats(audit),
  };
});

if (entries.length !== 36) throw new Error(`Expected 36 non-team opponents, found ${entries.length}.`);
if (new Set(entries.map((entry) => entry.slug)).size !== entries.length) throw new Error('Duplicate matchup slug.');

await rm(new URL('matchups/', root), { recursive: true, force: true });
await mkdir(new URL('matchups/', root), { recursive: true });
for (const entry of entries) {
  const directory = new URL(`matchups/${entry.slug}/`, root);
  await mkdir(directory, { recursive: true });
  await writeFile(new URL('index.html', directory), matchupPage(entry));
}

const groups = Map.groupBy(entries, (entry) => entry.team);
const indexGroups = [...groups].map(([team, players]) => `<section class="matchup-index-team"><h2>${escapeHtml(team)}</h2><div>${players.map((entry) => `<a href="${entry.slug}/"><strong>${escapeHtml(entry.player)}</strong><span>${escapeHtml(entry.faction)}</span><b aria-label="${entry.rating} out of 5 stars">${entry.stars}</b></a>`).join('')}</div></section>`).join('');
await writeFile(new URL('matchups/index.html', root), `<!doctype html>
<html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>Kaashif’s Brighton matchup reads</title><link rel="stylesheet" href="../styles.css" /></head>
<body class="matchup-page"><header class="detail-hero"><nav><a href="../">← Brighton roster</a></nav><h1>Kaashif’s matchup reads</h1><p class="detail-meta">All 36 players outside South London Squad. Subjective analysis is kept separate from the factual roster and list pages.</p></header><main class="matchup-index">${indexGroups}</main></body></html>`);

await writeFile(new URL('data/matchup-analysis.json', root), `${JSON.stringify({ schemaVersion: 1, generatedAt: new Date().toISOString(), playerCount: entries.length, entries }, null, 2)}\n`);
console.log(`Built ${entries.length} Kaashif-specific matchup pages (${entries.filter((entry) => entry.confidence === 'High').length} list-specific, ${entries.filter((entry) => entry.confidence === 'Low').length} provisional).`);
