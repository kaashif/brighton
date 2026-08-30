import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const plannerRaw = 'https://raw.githubusercontent.com/kaashif/40k-planner/main/public/reference/11th-edition';
const plannerSite = 'https://kaashif.github.io/40k-planner';
const indexResponse = await fetch(`${plannerRaw}/data/event-layouts.json`);
if (!indexResponse.ok) throw new Error(`Could not download layout index: ${indexResponse.status}`);
const index = await indexResponse.json();
const layouts = index.layouts.filter(({ attacker, defender }) =>
  attacker.forceDisposition === 'Take and Hold' || defender.forceDisposition === 'Take and Hold',
);
if (layouts.length !== 15) throw new Error(`Expected 15 Take and Hold layouts, found ${layouts.length}`);

const directory = new URL('assets/layouts/', root);
await mkdir(directory, { recursive: true });
const records = await Promise.all(layouts.map(async (layout) => {
  const imageResponse = await fetch(`${plannerRaw}/maps/layout-${String(layout.pdfPage).padStart(2, '0')}.jpg`);
  if (!imageResponse.ok) throw new Error(`Could not download ${layout.id}: ${imageResponse.status}`);
  const image = Buffer.from(await imageResponse.arrayBuffer());
  const asset = `assets/layouts/${layout.id}.jpg`;
  await writeFile(new URL(asset, root), image);
  const opponentDisposition = layout.attacker.forceDisposition === 'Take and Hold'
    ? layout.defender.forceDisposition
    : layout.attacker.forceDisposition;
  return {
    id: layout.id,
    variant: layout.layout,
    opponentDisposition,
    asset,
    plannerUrl: `${plannerSite}/planner/?layout=${layout.id}`,
    sha256: createHash('sha256').update(image).digest('hex'),
  };
}));

const output = {
  schemaVersion: 1,
  revision: index.mapRevision.publishedOn,
  perspective: { player: 'Kaashif Hymabaccus', forceDisposition: 'Take and Hold' },
  source: `${plannerRaw}/data/event-layouts.json`,
  layouts: records,
};
await writeFile(new URL('data/layouts.json', root), `${JSON.stringify(output, null, 2)}\n`);
console.log(`Synchronized ${records.length} current Take and Hold matchup layouts.`);
