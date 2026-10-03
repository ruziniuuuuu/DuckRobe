# Contributing

Install dependencies with `npm ci`, then run `npm run dev`. Keep changes local
and review the diff before pushing. Existing stored looks and export formats
should remain compatible.

For wardrobe changes run:

```sh
node scripts/validate-catalog.mjs
node scripts/validate-behavior.mjs
node scripts/validate-hat-fit.mjs
node scripts/validate-eyewear-fit.mjs
node scripts/validate-footwear-fit.mjs
node scripts/validate-accessory-fit.mjs
npm run check:exports
node scripts/validate-subpath-assets.mjs
npm run build
```

With a development server running, install Chromium and check the wardrobe
and studio controls:

```sh
npx playwright install chromium
npm run check:ui
node scripts/validate-studio-ui.mjs
```

Browser checks write screenshots under `test-results/`. Set `DUCKROBE_URL`
to test another address. See [Playground notes](docs/playground.md) for the
walking controls, architecture and limitations.

For Playground changes also run:

```sh
npm run check:playground
npx playwright install chromium
npm run check:playground:ui
```

The second check builds both root and Pages deployments and starts its own
static servers. Run validation locally; the Pages workflow builds the site
for pull requests and deploys pushes to `main`. Review desktop, mobile
portrait and landscape screenshots, and inspect representative complete and
mixed outfits while standing, walking and turning. Include a long garment,
hat, eyewear, shoes and all three accessory regions.

Keep physics in the worker and clothing in the renderer. Do not compensate for
a garment fit issue by changing colliders, lifting the robot or altering policy
observations. Adjust garment placement if needed, then rerun wardrobe/export
checks. New lifecycle work must cover close/retry during initialization and
must leave no worker, listener, observer or render loop running after exit.

Upstream simulator assets are pinned in `public/playground/manifest.json`.
Updating them is a deliberate separate change: record source revision, URLs,
sizes and SHA-256 hashes; verify body frames, the 61-value observation order,
14 action targets and 50/200 Hz timing against upstream; rerun the bare-duck
baseline before testing outfits. See [Playground notes](docs/playground.md)
for architecture, measured policy behavior and known rigid-clothing limits.
