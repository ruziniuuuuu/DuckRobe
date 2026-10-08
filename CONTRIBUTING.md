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
npm run check:worlds
npm run check:adventures
npm run check:sharing
npx playwright install chromium
npm run check:playground:ui
```

The browser check builds both root and Pages deployments and starts its own
static servers. Run validation locally; the Pages workflow builds the site
for pull requests and deploys pushes to `main`. Review desktop, mobile
portrait and landscape screenshots, and inspect representative complete and
mixed outfits while standing, walking and turning. Include a long garment,
hat, eyewear, shoes and all three accessory regions.

On macOS, `DUCKROBE_QA_GPU=metal npm run check:playground:ui` uses native Metal
rendering. The default remains SwiftShader for headless environments without
a hardware GPU; the same GPU option is supported by `check:ui`. For a stable
wardrobe regression run, build once, run `npm run preview` and set
`DUCKROBE_URL` to its address so source edits cannot interrupt checks with HMR.
Inspect all three outdoor environments in portrait and landscape;
use Overview and Follow camera, collect a park stamp, cross the circuit start
line and verify that Pause/Reset stop or clear activity progress.

Define scene contacts, spawns and activity locations in
`src/playground/worlds.js`, using native Z-up metres and MJCF half-sizes.
Keep decorative meshes/animations in `environment.js` and pose-based activity
rules in `activity.js`. Render and compile static contacts from the same
records; verify their actual compiled MuJoCo position, orientation and size
against the renderer with `check:worlds`. Scene switching must preserve the
outfit/colors, clear held input and dispose the previous scene and worker.

Keep physics in the worker and clothing in the renderer. Do not compensate for
a garment fit issue by changing colliders, lifting the robot or altering policy
observations. Adjust garment placement if needed, then rerun wardrobe/export
checks. New lifecycle work must cover close/retry during initialization and
must leave no worker, listener, observer or render loop running after exit.
Define explicit proximity actions in `interactions.js`, persistence in
`keepsakes.js`, and postcard UI in `photography.js`. Race replays are visual
clones, never physical actors. Keep storage bounded, handle unavailable
storage, and preserve existing wardrobe selection/export contracts. Check
photo/album focus, PNG downloads, outfit restoration and record clearing on
both deployment bases. Label synthetic worker-pose fixtures accurately;
verify walking access with the real MuJoCo/ONNX world check as well.
Keep shared looks keyed to stable item IDs, including empty slots and all
three accessory regions. Reject incompatible codes without partial imports.
Decode the actual downloaded postcard QR with an independent reader at full
size and 700px; verify fresh-recipient restoration with custom colors and a
locked palette, clipboard fallback, PNG sharing and legacy album downloads.

For loading or rendering changes, run `node scripts/profile-playground.mjs local`
against Vite. It records first/repeat entry, worker timing and rendering counters
at two pixel ratios. Its headless SwiftShader frame rate is software-rendering
evidence; verify performance on the affected device before claiming an FPS gain.
Run `node scripts/validate-robot-geometry.mjs` after native render-mesh changes;
it compares every triangle position and shading normal against the original
preparation pipeline and verifies independent hard-edge vertices and index width.

Upstream simulator assets are pinned in `public/playground/manifest.json`.
Updating them is a deliberate separate change: record source revision, URLs,
sizes and SHA-256 hashes; verify body frames, the 61-value observation order,
14 action targets and 50/200 Hz timing against upstream; rerun the bare-duck
baseline before testing outfits. See [Playground notes](docs/playground.md)
for architecture, measured policy behavior and known rigid-clothing limits.
