# Brighton 40k Teams II — Army Lists

A searchable, mobile-friendly static archive of all 40 army lists published on the Best Coast Pairings roster for Brighton 40k Teams II.

Each player has a dedicated page containing the full submitted roster, its original BCP link, and matched 11th-edition faction, detachment, core-rule, and datasheet references on Wahapedia. Every submitted-list dropdown shows both players' directed primary-objective cards side by side, followed by the current A/B/C battlefield layouts for Kaashif's Take and Hold disposition against that player's disposition.

Where a vetted deployment suggestion exists, its bases appear directly on the layout thumbnail and clicking that thumbnail opens the same loaded suggestion in the planner. Unsuggested layouts continue to show the empty battlefield.

## Repository contents

- `data/raw-lists.json` contains the complete 40-player roster and every published list.
- `data/player-ratings.json` contains matched Tabletop Tools Glicko-2 ratings, full-pool ranks, per-player 11th-edition game counts, and team averages.
- `data/layouts.json`, `assets/objectives/`, and `assets/layouts/` contain the directed primary cards and 15 current Take and Hold matchup layouts synchronized from the deployment planner.
- `exports/` contains one GitHub-readable Markdown file for every player, grouped by team in its index. Submitted rosters have inline Wahapedia links; missing submissions are explicitly marked.
- `scripts/extract.mjs` extracts the authenticated BCP event through a Playwright-controlled Chrome session.
- `scripts/build.mjs` builds the homepage and all 40 player pages, matching roster entries to live Wahapedia datasheets.
- `scripts/fetch-ratings.mjs` refreshes player ratings from Tabletop Tools and avoids assigning ambiguous name matches.
- `scripts/check-links.mjs` checks every internal and external link, including local layout assets and their deployment-planner targets.
- `scripts/spot-check-wahapedia.mjs` renders and screenshots one standalone datasheet page per represented faction.
- `scripts/qa.mjs` tests the site at desktop and mobile dimensions with Playwright.

## Commands

```sh
npm install
npm run layouts
npm run build
npm run ratings
npm run check
npm run check:waha
npm run check:waha:visual
npm run qa
```

The site is an unofficial event reference. List ownership remains with the players who submitted them. Rules references are powered by Wahapedia.
