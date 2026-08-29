# Brighton 40k Teams II — Army Lists

A searchable, mobile-friendly static archive of the 29 army lists published on the Best Coast Pairings roster for Brighton 40k Teams II. The event roster contains 40 players; 11 did not have a published list when the data was extracted.

Each player has a dedicated page containing the full submitted roster, its original BCP link, and matched 11th-edition faction, detachment, core-rule, and datasheet references on Wahapedia.

## Repository contents

- `data/raw-lists.json` contains the complete extraction, including the 40-player roster and the 11 missing-list records.
- `scripts/extract.mjs` extracts the authenticated BCP event through a Playwright-controlled Chrome session.
- `scripts/build.mjs` builds the homepage and all 29 player pages, matching roster entries to live Wahapedia datasheets.
- `scripts/check-links.mjs` checks every internal and external link.
- `scripts/qa.mjs` tests the site at desktop and mobile dimensions with Playwright.

## Commands

```sh
npm install
npm run build
npm run check
npm run qa
```

The site is an unofficial event reference. List ownership remains with the players who submitted them. Rules references are powered by Wahapedia.
