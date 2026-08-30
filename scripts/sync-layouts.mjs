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
const layouts = index.layouts.filter(({ attacker, defender }) =>
  attacker.forceDisposition === 'Take and Hold' || defender.forceDisposition === 'Take and Hold',
);
if (layouts.length !== 15) throw new Error(`Expected 15 Take and Hold layouts, found ${layouts.length}`);

const directory = new URL('assets/layouts/', root);
await mkdir(directory, { recursive: true });
const records = await Promise.all(layouts.map(async (layout) => {
  const deploymentPlan = plansByLayout.get(layout.id);
  const sourcePath = deploymentPlan
    ? `plans/${deploymentPlan.preview}`
    : `maps/layout-${String(layout.pdfPage).padStart(2, '0')}.jpg`;
  const imageResponse = await fetch(`${plannerRaw}/${sourcePath}`);
  if (!imageResponse.ok) throw new Error(`Could not download ${layout.id}: ${imageResponse.status}`);
  const image = Buffer.from(await imageResponse.arrayBuffer());
  const asset = `assets/layouts/${layout.id}${deploymentPlan ? '-suggested.svg' : '.jpg'}`;
  await writeFile(new URL(asset, root), image);
  const opponentDisposition = layout.attacker.forceDisposition === 'Take and Hold'
    ? layout.defender.forceDisposition
    : layout.attacker.forceDisposition;
  return {
    id: layout.id,
    variant: layout.layout,
    opponentDisposition,
    asset,
    suggestedDeployment: Boolean(deploymentPlan),
    plannerUrl: `${plannerSite}/planner/?layout=${layout.id}${layout.id === 'take-and-hold-vs-take-and-hold-a' ? '&suggestion=1' : ''}`,
    sha256: createHash('sha256').update(image).digest('hex'),
  };
}));

const slug = (value) => value.toLocaleLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const dispositionsById = new Map(missions.forceDispositions.map((disposition) => [disposition.id, disposition]));
const takeAndHold = dispositionsById.get('take-and-hold');
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
for (const opponentId of ['take-and-hold', 'disruption', 'purge-the-foe', 'reconnaissance', 'priority-assets']) {
  const opponent = dispositionsById.get(opponentId);
  objectiveMatchups.push({
    opponentDisposition: opponent.name,
    player: await objectiveCard(takeAndHold, takeAndHold.primaryMissionsByOpponent[opponentId]),
    opponent: await objectiveCard(opponent, opponent.primaryMissionsByOpponent['take-and-hold']),
  });
}

const output = {
  schemaVersion: 1,
  revision: index.mapRevision.publishedOn,
  perspective: { player: 'Kaashif Hymabaccus', forceDisposition: 'Take and Hold' },
  source: `${plannerRaw}/data/event-layouts.json`,
  missionSource: `${plannerRaw}/data/missions.json`,
  objectiveMatchups,
  layouts: records,
};
await writeFile(new URL('data/layouts.json', root), `${JSON.stringify(output, null, 2)}\n`);
console.log(`Synchronized ${records.length} current Take and Hold matchup layouts and ${objectiveAssets.size} objective-card images.`);
