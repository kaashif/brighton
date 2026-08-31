import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const plannerRaw = 'https://raw.githubusercontent.com/kaashif/40k-planner/main/public/reference/11th-edition';
const plannerSite = 'https://kaashif.github.io/40k-planner';
const [indexResponse, missionsResponse, plansResponse] = await Promise.all([
  fetch(`${plannerRaw}/data/event-layouts.json`),
  fetch(`${plannerRaw}/data/missions.json`),
  fetch(`${plannerRaw}/plans/index.json`),
]);
if (!indexResponse.ok) throw new Error(`Could not download layout index: ${indexResponse.status}`);
if (!missionsResponse.ok) throw new Error(`Could not download mission index: ${missionsResponse.status}`);
if (!plansResponse.ok) throw new Error(`Could not download deployment-plan index: ${plansResponse.status}`);
const index = await indexResponse.json();
const missions = await missionsResponse.json();
const deploymentPlans = await plansResponse.json();
const plansByLayout = new Map(deploymentPlans.plans.map((plan) => [plan.layoutId, plan]));
const layouts = index.layouts;
if (layouts.length !== 45) throw new Error(`Expected all 45 layouts, found ${layouts.length}`);

const directory = new URL('assets/layouts/', root);
await mkdir(directory, { recursive: true });
const records = await Promise.all(layouts.map(async (layout) => {
  const deploymentPlan = plansByLayout.get(layout.id);
  const baseResponse = await fetch(`${plannerRaw}/maps/layout-${String(layout.pdfPage).padStart(2, '0')}.jpg`);
  if (!baseResponse.ok) throw new Error(`Could not download base map for ${layout.id}: ${baseResponse.status}`);
  const baseImage = Buffer.from(await baseResponse.arrayBuffer());
  const baseAsset = `assets/layouts/${layout.id}.jpg`;
  await writeFile(new URL(baseAsset, root), baseImage);
  let asset = baseAsset;
  let image = baseImage;
  if (deploymentPlan) {
    const imageResponse = await fetch(`${plannerRaw}/plans/${deploymentPlan.preview}`);
    if (!imageResponse.ok) throw new Error(`Could not download suggestion for ${layout.id}: ${imageResponse.status}`);
    image = Buffer.from(await imageResponse.arrayBuffer());
    asset = `assets/layouts/${layout.id}-suggested.svg`;
    await writeFile(new URL(asset, root), image);
  }
  return {
    id: layout.id,
    variant: layout.layout,
    attackerDisposition: layout.attacker.forceDisposition,
    defenderDisposition: layout.defender.forceDisposition,
    asset,
    baseAsset,
    suggestedDeployment: Boolean(deploymentPlan),
    basePlannerUrl: `${plannerSite}/planner/?layout=${layout.id}`,
    plannerUrl: `${plannerSite}/planner/?layout=${layout.id}${layout.id === 'take-and-hold-vs-take-and-hold-a' ? '&suggestion=1' : ''}`,
    sha256: createHash('sha256').update(image).digest('hex'),
  };
}));

const slug = (value) => value.toLocaleLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const objectiveDirectory = new URL('assets/objectives/', root);
await mkdir(objectiveDirectory, { recursive: true });
const objectiveAssets = new Map();

async function objectiveCard(disposition, mission) {
  const sourcePath = `cards/${disposition.id}/${slug(mission)}.png`;
  if (!objectiveAssets.has(sourcePath)) {
    const response = await fetch(`${plannerRaw}/${sourcePath}`);
    if (!response.ok) throw new Error(`Could not download ${disposition.name} — ${mission}: ${response.status}`);
    const image = Buffer.from(await response.arrayBuffer());
    const asset = `assets/objectives/${disposition.id}-${slug(mission)}.png`;
    await writeFile(new URL(asset, root), image);
    objectiveAssets.set(sourcePath, {
      asset,
      sha256: createHash('sha256').update(image).digest('hex'),
    });
  }
  return {
    disposition: disposition.name,
    mission,
    ...objectiveAssets.get(sourcePath),
  };
}

const objectiveMatchups = [];
for (const player of missions.forceDispositions) {
  for (const opponent of missions.forceDispositions) {
    objectiveMatchups.push({
      playerDisposition: player.name,
      opponentDisposition: opponent.name,
      player: await objectiveCard(player, player.primaryMissionsByOpponent[opponent.id]),
      opponent: await objectiveCard(opponent, opponent.primaryMissionsByOpponent[player.id]),
    });
  }
}

const output = {
  schemaVersion: 1,
  revision: index.mapRevision.publishedOn,
  perspective: { team: 'South London Squad', defaultPlayer: 'Kaashif Hymabaccus', forceDisposition: 'Take and Hold' },
  source: `${plannerRaw}/data/event-layouts.json`,
  missionSource: `${plannerRaw}/data/missions.json`,
  objectiveMatchups,
  layouts: records,
};
await writeFile(new URL('data/layouts.json', root), `${JSON.stringify(output, null, 2)}\n`);
console.log(`Synchronized all ${records.length} current layouts and ${objectiveAssets.size} objective-card images for the five force dispositions.`);
