# Dressed Duck Playground

Choose **Try in playground** once the wardrobe duck has loaded. The current
selection, including chest/side/back accessories and body colors, transfers
automatically. Change outfits in the wardrobe and re-enter to use the new look.

| Control | Action |
| --- | --- |
| W / ↑, S / ↓ | Forward, reverse |
| A / ←, D / → | Turn left, right |
| On-screen direction buttons | Hold to steer; touch supports simultaneous forward/turn |
| Drag / pinch / wheel | Orbit / zoom; manual camera input disables following |
| Follow camera | Toggle tracking of the duck's position |
| Pause / Resume | Stop/restart simulation |
| Reset duck | Restore standing pose, controller history and camera; resume unless the tab is hidden; keep outfit |
| Back / Escape | Close and restore wardrobe focus and scroll |

Releasing controls or losing focus clears movement commands. Hiding the tab
pauses the simulation; returning requires explicit Resume. A sustained fall
pauses and offers Reset. Loading and errors always retain Back; Retry creates a
fresh worker and rendering session. Controls are translated into English and
Chinese and contained in a native modal dialog.

## Architecture and invariants

`src/main.js` opens a full-screen overlay without changing the saved/wardrobe
view or rebuilding its catalog. The preview's independent `setSuspended()`
stops its animation/render loop and thumbnail queue, preserving the motion
preference. Closing restores the mounted catalog, body scroll and focus.

`createPlayground({ host, selection, colors, language, onExit })` in
`src/playground/index.js` returns `pause()`, `resume()`, `reset()` and `dispose()`.
Its `rig` getter and read-only `getState()` snapshots support the existing
`window.duckrobe` diagnostic convention. It dynamically loads on first entry.
Every visit/retry owns an abort controller, worker, renderer, scene, resize
observer and animation frame. Disposal is idempotent; stale async results are
ignored and their geometry is disposed.

The dedicated module worker lazily loads MuJoCo and ONNX Runtime. The main
thread prepares collision STL buffers from the pinned GLB and transfers them
once; it sends `init`, `command`, `pause`, `resume`, `reset`. The worker returns
`progress`, `ready`, `pose`, `fallen`, `reset`, `error`. No clothing or material
data crosses the physics boundary. Worker timers never overlap inference.
Each tick runs exactly one inference and four 0.005-second physics steps.
Slow devices slow simulation time instead of dropping physics steps or
building an unbounded catch-up queue.

The 61-value observation is gyro (3), projected gravity (3), joint positions
relative to the reference pose (14), joint velocities (14), previous action
(14), command (13). Command slots 0/1/2 are forward/lateral/yaw; lateral and
the ten head/body command slots remain zero. The 14 position targets equal
reference pose + policy output. Input velocities match upstream: +0.25 m/s,
−0.2 m/s, ±1 rad/s. ONNX uses one WASM thread, with no remote CDN or isolation
header requirement.

Physics uses the official simulator MJCF, **not** DuckRobe's export model.
Preparation removes visual geoms and unused assets, creates the official
floor/walls and STAND keyframe, and sets the timestep. It preserves robot
collisions, masses, inertias, actuator parameters and constraints. The source
file itself stays byte-identical. The reference kinematics fixture verifies
that the wardrobe renderer's body frames match the simulator.

`rig.js` retains clothing anchors made by `loadRobot()` in its reference pose,
removes the preview-only ground offset, and adds one Z-up → Y-up wrapper.
Root translation/quaternion and named joint angles come directly from physics,
including small excursions through MuJoCo's soft joint limits. Decorative
wardrobe animation is never called. Outfits cannot change dynamics.

Backpack and garden-pack harnesses receive a small placement adjustment toward
the visible torso surface to close their conspicuous reference-pose gap. This
is local to the Playground rig; wardrobe/export placement and physical
collisions remain unchanged. The following camera uses elapsed render time so
it stays with the duck even when rendering slows below the policy frequency.

All public, worker and WASM URLs resolve through Vite's base. Both `/` and
`/DuckRobe/` work on a plain static server. Simulation assets and runtime chunks
are unloaded until entry. Their transferred sizes are approximately 2.1 MB
for model/policy data plus 23 MB of uncompressed WASM (browser caching applies).
Saved-look storage and ZIP/export formats are unchanged.

## Provenance

Upstream is [Pollen Robotics Microduck Sandbox at
023172c8a7d629b5258d90364c13bafe013abbfa](https://huggingface.co/spaces/pollen-robotics/microduck-simulator/tree/023172c8a7d629b5258d90364c13bafe013abbfa).
`public/playground/manifest.json` records URLs and SHA-256 values for unmodified
assets and original adapted source files. Runtime versions are pinned in
`package-lock.json`. `THIRD_PARTY_NOTICES.md` distinguishes simulator assets
from the existing wardrobe/export assets.

## Validation and limitations

Local verification on 2026-10-03:

| Check | Result |
| --- | --- |
| Real MuJoCo / ONNX baseline, falls, reset, full/mixed/long outfits | Passed; bare and dressed fixed-step trajectories match exactly |
| Playground browser suite | 19/19 passed, including root, Pages base and fresh development cache |
| Existing wardrobe browser suite | 18/18 passed; zero browser errors |
| Catalog, behavior, hat/eyewear fit and asset paths | Passed |
| Export validation | 115 cases passed, including all 100 outfits |
| Production builds | Root and `/DuckRobe/` passed |
| Visual review | Complete and mixed looks, cape and linen dress; desktop, 390×844 portrait and 844×390 landscape |

The build retains the existing large-main-chunk warning. Run physics and
browser checks locally using [the contribution workflow](../CONTRIBUTING.md).
The Pages workflow builds and deploys the site; it does not run validation.

Run `npm run check:playground` for real WASM physics and policy inference,
asset hashes, observation layout, standing, translation/turning, reset,
perturbed falls and exact bare/dressed trajectory comparisons. Full and mixed
outfits are checked for anchor transforms, colors and body-frame compatibility.

Measured on the pinned policy with deterministic fixed steps: zero-command
standing stays within 3 cm for 10 seconds; forward translates 0.283 m in
3 seconds; left turns 1.05 rad in 3 seconds. Reverse from a fresh stand barely
moves (0.00002 m over 10 seconds), but after forward walking reverses 0.466 m
over 6 seconds. Right turns 0.229 rad from rest versus 1.609 rad after walking
over 3 seconds. These are observed limitations of this controller/model pair;
we retain the official command magnitudes. A few forward steps help initiate
reverse and tight turns. There is no separate running gait.

`npm run check:playground:ui` builds both deployment bases and uses a strict
static server plus real Chromium workers. It checks lazy loading, motion,
pause/reset, input release, camera follow, suspended wardrobe work, state and
focus restoration, repeated visits, exit during loading, missing assets,
invalid-policy startup, retry, English/Chinese and mobile layouts. It injects
visibility/fall/runtime-error events at the browser boundary to verify those
UI paths; the sustained-fall detector itself is tested with real MuJoCo data.
Screenshots and the machine-readable results are saved in `test-results/`.
The browser check also starts Vite with a fresh dependency cache to verify that
first entry does not reload the page while discovering lazy worker packages.

Garments are rigid decorations: wide or long hems can intersect swinging legs,
and shoe soles can intersect the floor because contacts use the official bare
feet. No cloth physics, garment collisions, physical root lift, ZIP import,
rollers, multiplayer or extra Sandbox activities are included. Physical-phone
GPU performance is not established by responsive Chromium viewport checks.
