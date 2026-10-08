# Dressed Duck Playground

Choose **Try in playground** once the wardrobe duck has loaded. The current
selection, including chest/side/back accessories and body colors, transfers
automatically. Change outfits in the wardrobe and re-enter to use the new look.
Travel postcards also offer **Wear this look**, returning to the wardrobe with
the captured selection and body colors.

| Control | Action |
| --- | --- |
| W / ↑, S / ↓ | Forward, reverse |
| A / ←, D / → | Turn left, right |
| On-screen direction buttons | Hold to steer; touch supports simultaneous forward/turn |
| Drag / pinch / wheel | Orbit / zoom; manual camera input disables following |
| Follow camera | Toggle tracking of the duck's position |
| Environment selector | Switch between miniature circuit, amusement park, sea salt harbor and classic arena |
| Overview | Frame the whole environment; disable following |
| Outfit close-up | Frame the complete outfit at the duck's real position and rotate with its heading |
| Landmark portrait | Frame the duck with the nearest scene landmark; adapt to portrait/landscape viewports |
| Take a photo | Pause and capture a UI-free scene postcard; download PNG or keep it in the local album |
| Travel album | Browse the latest eight local postcards, download, remove or wear a captured look |
| Best lap replay / Clear record | Toggle a render-only replay or remove the device's circuit record |
| Nearby action button | Explicitly water the park garden, collect postcards or deliver harbor mail |
| Pause / Resume | Stop/restart simulation |
| Reset duck | Restore standing pose, controller history and camera; resume unless the tab is hidden; keep outfit |
| Back / Escape | Close and restore wardrobe focus and scroll |

Releasing controls or losing focus clears movement commands. Hiding the tab
pauses the simulation; returning requires explicit Resume. A sustained fall
pauses and offers Reset. Loading and errors always retain Back; Retry creates a
fresh worker and rendering session. Controls are translated into English and
Chinese and contained in a native modal dialog.

## Environments

The miniature circuit opens by default, with an overview camera. Choose
**Follow camera** for a closer view while steering. The original grid arena is
still available in the environment selector. The park opens with a lower,
closer following camera; Overview shows its complete layout. Switching scenes starts a fresh
simulation at that scene's spawn, clears held inputs and activity progress,
and keeps the selected outfit and body colors. Device race records and travel
postcards survive scene switches and resets. No extra scene assets or
network services are required.

**Miniature circuit:** a stadium-shaped asphalt loop with striped curbs,
metal guardrails and a stone-edged planted island, start arch, benches and an
open pit pavilion with tools, tire stacks and cones. A break in the guardrail
and flat branch connect the circuit to its contact-enabled pit workshop. Navy cloth flags, the
workshop banner and stone markers use the DuckRobe head mark. The gantry has
two readable clock faces, metal bracing, mounting bolts and signal lenses;
its display shares the HUD's lap state and time formatting. A completed lap
holds its finish time and difference from the previous device best for four
simulation seconds. The next checkpoint gains a soft glow. Subtle skid traces,
curb pebbles, verge grass and workshop cables/tools add surface detail without
changing the walking route. Flags ripple on
simulation time and remain still with reduced motion enabled. Both edges have painted
curbs, and route arrows show the direction. Cross the checkerboard line in the forward direction to start the
clock. Visit the numbered checkpoints 1–3 in order, then cross the start line
again to finish a lap. Reverse crossings and crossings outside the lane do
not count. The HUD shows the current lap, next checkpoint and session best.
Timing and the three-second start lights use simulation time, so pausing stops
both. Four sector times and the most recent lap are shown after a finish.
Reset or scene switching clears the current lap; the fastest valid completed
lap stays on this device until **Clear record**. Falls invalidate the current
lap. Recordings sample the real position, quaternion and 14 joint angles at
up to 5 Hz, capped at 20 minutes / 6,002 samples and keyed to the route revision.
Best lap replay interpolates a translucent duck alongside the current lap;
it has no worker, colliders or influence on the walking policy. Pause freezes
playback too. The current outfit is used for the replay.

`signage.js` creates and owns the circuit's local canvas maps. The clock redraws
only when its displayed tenth of a second or lap changes; both faces share one
texture, and leaving the scene disposes all sign maps.

**Amusement park:** a circular brick promenade with connecting attraction
courtyards, lawns and six stone-edged flowerbeds. The garden pavilion has a
shingled roof and music board; the carousel has DuckRobe medallions, bulbs,
mirrored center panels and saddled horses. The Ferris wheel has a branded hub,
trimmed cabins and a fenced stone platform with contact-enabled steps. The
slide/swing area includes a roofed tower, sand surface and picket fence.
The entrance arch, lantern banners, colored direction signs and scalloped
ticket awning share the park's cream, sage and muted coral palette. Approach
the four numbered ground markers to collect entrance, garden, Ferris wheel
and carousel stamps. Each stop counts once; Reset clears the passport. The
carousel and wheel animate from simulation time, freeze during Pause and
respect `prefers-reduced-motion`. The rides are scenery, with static bases
and obstacle contacts; there is no boarding or moving-ride physics. The slide
has a static sloped contact surface, but climbing is not a supported gait of
the pinned flat-ground walking policy.
The play fence has a walking entrance, while the central garden now has small
separate beds and a flush pavilion floor with a clear front approach. Near the
garden's can station, choose **Use your watering can** or **Borrow a can and
water**. Taller blossoms open gradually over 1.4 simulation seconds once per
visit/reset; regional flower palettes and heights vary between beds, and
collected ground markers turn sage green. A short water effect and
can tilt use simulation time and respect reduced motion. Clothing is still
decorative in the physical model.

**Sea salt harbor:** a flat stone promenade with a branded blue post office,
awning café, striped lighthouse, three mailboxes, quay railings, a timber
jetty and gently moving decorative sailboats. Café chairs, a menu board,
postal crates, a life buoy, mooring ropes and an inset timber waterfront add
detail around the clear walking paths. The sea has procedural ripples,
view-dependent glints and a lighter shoreline. Collect three postcards at the
post office, then explicitly deliver to the café, quay and lighthouse gold
markers. Delivery before collection is disabled, and each location counts
once. An envelope slides into the mailbox and its flag rises over .75
simulation seconds; a receipt remains after delivery. The HUD and mailbox
receipts reflect the delivered count; reset or
scene switching clears the route. The quay railing keeps the walking area
separate from the decorative sea and jetty. Mail delivery works with every
outfit; the existing mail-satchel looks suit the scene without changing physics.

Each outdoor scene has its own sky, sunlight, hemisphere fill and exposure.
Overview angles separate the park entrance from the pavilion and show the
harbor waterfront. Surface maps use muted colors, fine grain and worn edges.
Water, flowers and mail feedback freeze with the simulation and respect
reduced motion. Paused shadow maps are reused until the scene changes.

## Little travel postcards

**Outfit close-up** keeps tall hats, wide garments and accessories in view;
**Landmark portrait** frames the duck and the closest configured landmark
together. Both reframe after a viewport orientation change. Dragging resumes
manual camera control. In these photo views, the header and Resume button
retain the paused state while the duplicate scene badge is hidden to leave
the photograph visible.

Photography captures the actual WebGL scene at the selected camera without
the DOM controls. The 1400×1200 PNG includes a cream border, place, outfit,
piece names, two duck color swatches, local date and a postage-style QR code.
The stamp prints warm brown ink on the card's cream paper, with a light
perforated edge and the shared DuckRobe mark in a cancellation stamp. Rounded
finder corners retain the QR's clear four-module margin and pixel alignment.
Garden bloom, delivered mail, completed lap and instant-camera marks appear
beside the date. A selected camera adds a small print reveal, respecting
reduced motion. Photo capture and album browsing pause walking; closing the
panel leaves it paused until explicit Resume. The nested panel owns keyboard
focus; Escape closes the panel first and the playground on the next press.

The latest eight 700×600 JPEG postcards and captured selections/colors are
saved under `duckrobe.travels.v1`, separately from the existing wardrobe.
Original-size PNG download is available at capture; album downloads enlarge
the stored photograph but redraw the typography and QR at full resolution.
Older 700×550 cards remain readable; album previews and downloads retypeset
their signatures with the current QR stamp without rewriting stored photos.
Storage errors leave this visit's album and race record
usable and offer a visible download prompt. No photos or records are sent to
a server. A route revision mismatch or malformed record is ignored.

**Share this look** opens a copyable outfit link; browsers with Web Share also
offer a native share button with PNG attachment when supported. Clipboard
denial leaves a selectable link. A recipient can scan the PNG stamp or open
the link to wear exactly the captured pieces and shell/accent colors, then
use the existing **Save this look** button. Their favorites, saved collection,
language and color-lock preference survive. The shared palette applies even
if the recipient has locked colors; subsequent wardrobe choices respect the
lock again. Once applied, the hash is consumed so refreshing after changing
clothes does not bring back the old shared look.

`#look=v1.…` contains a compressed, checksummed tuple of seven stable item
IDs (hat, eyewear, body, chest, side, back, legwear) and two hex colors. It
contains no photograph, account identifier or catalogue array index. Decode
size is bounded. A damaged code, unsupported version, unavailable item or
wrong attachment position is rejected as a whole, preserving the current
look. This checksum detects accidental damage and is not authentication.
Links use the deployed app's origin and Vite base. Local previews point at
the project's public Pages URL; recipients there need this feature deployed
before the link can restore a look. No deployment is performed by this change.

## Architecture and invariants

`src/main.js` opens a full-screen overlay without changing the saved/wardrobe
view or rebuilding its catalog. The preview's independent `setSuspended()`
stops its animation/render loop and thumbnail queue, preserving the motion
preference. Closing restores the mounted catalog, body scroll and focus.

`createPlayground({ host, selection, colors, language, sourceRig, onExit, worldId })` in
`src/playground/index.js` returns `pause()`, `resume()`, `reset()` and `dispose()`.
Its `rig` getter and read-only `getState()` snapshots support the existing
`window.duckrobe` diagnostic convention, including `worldId` and an activity
snapshot. `worldId` defaults to `circuit`. It dynamically loads on first entry.
Every visit/retry owns an abort controller, worker, renderer, scene, resize
observer and animation frame. Disposal is idempotent; stale async results are
ignored and their geometry is disposed.
`interactions.js` owns explicit pose/proximity rules and outfit capabilities.
`keepsakes.js` validates bounded local photo/record storage and interpolates
recorded poses; `replay.js` owns a render-only duck clone sharing geometry.
`shared-look.js` owns the versioned outfit contract, strict decoder and link
creation. `postcard.js` typesets the canvas card and its QR stamp.
`photography.js` owns capture, its focus-contained panel, temporary
download URLs, sharing and album UI. Scene/visit disposal closes panels, aborts handlers
and revokes owned URLs. These modules do not write to the physics worker.

`worlds.js` defines spawn points, bounds, static contacts and activity locations
in metres and native Z-up coordinates, plus atmosphere, overview and landmark
framing descriptors. `framing.js` fits subjects in camera space and converts
native coordinates at the rendering boundary. `environment.js` builds procedural
Three.js scenery and owns its geometry, materials, textures and animations;
`model.js` creates MuJoCo contacts from the same records. Box half-sizes and
native yaw/roll are shared, with one Z-up → Y-up render wrapper. Trees,
benches, gates and railings use simple contact proxies at their detailed
visual placements. `textures.js` builds deterministic colour, bump and leaf
alpha maps locally; scene-owned maps are shared and disposed together. Leaf,
flower and stem geometry is drawn with instanced meshes. Warm directional
sunlight, a hemisphere fill, a sky dome/clouds and shadows provide the outdoor
lighting without postprocessing dependencies or external asset requests.
`activity.js` consumes only simulated poses, with no rendering or physics
dependencies. Each scene owns its worker and resources; switching uses the
same abort/cleanup path as retry and exit. The classic arena remains the
default for `preparePhysicsXml()` and baseline physics validation.

The dedicated module worker lazily loads MuJoCo and ONNX Runtime concurrently.
The main thread prepares collision STL buffers from the pinned GLB, caches one
successful native mesh source, compiles each world's contacts/spawn into its
own XML, and transfers independent mesh copies to each new worker. Failed
or aborted preparations are not cached. The visual rig copies the wardrobe's
prepared native geometry and rebuilds its reference pose with independent
materials. Runtime initialization overlaps graphics setup and arena rendering.
The main thread sends `init`, `command`, `pause`,
`resume`, `reset`. The worker returns
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
floor, the selected environment's static contacts and STAND keyframe, and sets
the timestep. It preserves robot collisions, masses, inertias, actuator
parameters and constraints. The source
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
are unloaded until entry. Their raw sizes are approximately 2.1 MB
for model/policy data plus 23.6 MB of WASM (browser caching applies). The Vite
development server now serves those two WASM binaries with gzip when supported,
reducing their combined transfer to about 6.8 MB. Production compression depends
on the static host; the development middleware does not configure that host.
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

Environment extension verification on 2026-10-04:

| Check | Result |
| --- | --- |
| Existing real MuJoCo / ONNX baseline | Passed, including pinned hashes, controller behavior, falls and exact bare/dressed trajectories |
| New environment physics | Passed; 59 circuit and 49 park contacts match render placement, size and orientation; robot dynamics unchanged; standing, forward walking and reset pass |
| Lap/passport behavior | Passed; ordered, directional, in-lane gates, best laps, paused simulation time, unique stamps and reset |
| Extended Playground browser suite | 26/26 passed on macOS Chromium with Metal; root, Pages base, scene switching, fresh development cache, clock crossing/pause/reset and park ride pause/reduced motion |
| Production builds | Root and `/DuckRobe/` passed |
| Visual review | Both scenes on desktop, 390×844 portrait and 844×390 landscape; complete/mixed looks and long garments |

Little-adventures verification on 2026-10-04:

| Check | Result |
| --- | --- |
| Compiled native-world contacts and render parity | Passed; 59 circuit, 61 park and 11 harbor contacts; robot dynamics unchanged |
| Actual policy walking through new paths | Passed; pit entry, play-fence opening, pavilion approach and postal promenade |
| Adventure logic and local storage | Passed; sector/pose recording, replay, personal/borrowed watering, delivery order, bounded albums and storage fallback |
| Playground browser suite | 34/34 passed; root and Pages, real PNG capture/download, nested focus, album outfit restoration, replay meshes and all three scenes in mobile portrait/landscape |
| Original MuJoCo/ONNX baseline | Passed; pinned hashes, falls, reset and exact bare/dressed trajectories |
| Existing wardrobe browser suite | 18/18 passed on a fixed root production build with Metal; original moves, saved looks and real model ZIP download; zero browser errors |
| Real visual captures | Desktop, 390×844 portrait and 844×390 landscape; native spawn poses, no pose fixtures |

Scene-polish verification on 2026-10-06:

| Check | Result |
| --- | --- |
| Native-world contacts and walking | Passed; 59 circuit, 61 park and 17 harbor contacts; all three delivery approaches use the actual walking policy |
| Camera and interaction logic | Passed; heading-aware outfit framing, landmark bounds across five aspect ratios, gradual flowers/mail and paused simulation time |
| Playground browser suite | 44/44 passed; root and Pages base, mobile cameras, pause/reset, scenery feedback and existing postcard/record behavior |
| Wardrobe, studio and exports | Passed; 18 wardrobe browser checks, 7 studio checks, catalog/fit/behavior/assets and 127 export cases |
| Real visual review | All three maps in desktop, 390×844 portrait and 844×390 landscape; sailor, garden pack, linen dress and wizard looks |
| Postcard compatibility | Original PNG, 700px image and stored JPEG decoded with an independent QR reader; exact fresh-recipient outfit/colors restored |

Upstream-integration verification on 2026-10-08, based on `11a106b`:

| Check | Result |
| --- | --- |
| Runtime and native geometry | Passed; concurrent runtime setup, independent rig copies and exact expanded triangles/normals retained |
| Cached world isolation | Passed; every scene receives its own contacts/spawn XML and independently transferable mesh buffers; returning to the arena restores its original XML |
| Playground browser suite | 46/46 passed on root and Pages; includes idle paused rendering, scene switching, camera framing and exact postcard outfit restoration |
| Wardrobe, studio, exports and build | Passed; 18 wardrobe and 7 studio checks, catalog/behavior/fit/assets, 127 export cases and production build |

The circuit's first/repeat-entry profiler completed at pixel ratios 1 and 2
using a local Metal adapter on Apple M4. The default SwiftShader run timed out;
a retry produced one sample before being stopped because software rendering
was very slow. These runs do not establish a before/after performance gain.

The build retains the existing large-main-chunk warning. Run physics and
browser checks locally using [the contribution workflow](../CONTRIBUTING.md).
The Pages workflow builds and deploys the site; it does not run validation.

Run `npm run check:playground` for real WASM physics and policy inference,
asset hashes, observation layout, standing, translation/turning, reset,
perturbed falls and exact bare/dressed trajectory comparisons. Full and mixed
outfits are checked for anchor transforms, colors and body-frame compatibility.

Run `npm run check:adventures` for completed-lap recording, sector times,
record persistence/versioning, replay interpolation, proximity actions,
personal/borrowed watering, delivery order and bounded/storage-fallback albums.
It also projects outfit/landmark bounds across narrow portrait and wide
landscape aspects and checks heading-aware close-ups.

Run `npm run check:worlds` for real compiled environment contacts and rendered
transforms, unchanged robot masses/inertias/actuator parameters, scene spawn
and reset, policy walking, and lap/passport rules. It also walks the real robot
through the play-fence opening, pavilion approach, pit entrance and postal
promenade, beyond just testing geometric openings.

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
scene changes during loading, verifies that exactly one worker/canvas remains,
and checks input clearing, scene-specific reset and passport collection. It
also injects
visibility/fall/runtime-error events at the browser boundary to verify those
UI paths; the sustained-fall detector itself is tested with real MuJoCo data.
Screenshots and the machine-readable results are saved in `test-results/`.
Adventure checks capture and inspect PNG dimensions, nested focus/escape,
album restoration, local record clearing and actual replay meshes. Fixture
poses at the instrumented worker boundary exercise watering and delivery
feedback and completed laps; physical walking paths are validated separately
by the native-world suite. Root and Pages builds both run these checks.
The browser check also starts Vite with a fresh dependency cache to verify that
first entry does not reload the page while discovering lazy worker packages.

### Performance measurements

On 2026-10-04, a sequential local Chromium/SwiftShader comparison against
`6e86b9d` used the default look, a 1440×900 viewport, device pixel ratios 1 and 2,
and eight seconds of forward walking per visit. Startup measures the actual
click event to receipt of the worker's ready message. A first visit uses a fresh
browser context; a repeat uses the same page. Source instrumentation disables
HTTP caching in Playwright, so these are not ordinary browser-cache or
cold-network benchmarks.

| Pixel ratio / visit | Runtime readiness before → after | FPS before → after |
| --- | --- | --- |
| 1 / first | 0.98 → 1.11 s | 3.50 → 4.21 |
| 1 / repeat | 1.68 → 1.02 s | 3.66 → 3.79 |
| 2 / first | 1.23 → 1.19 s | 4.21 → 3.88 |
| 2 / repeat | 1.62 → 1.27 s | 4.00 → 3.32 |

Repeat runtime startup improved 22–39% in this single pass. First-entry timing
and FPS did not consistently improve. The worker sustained real-time
simulation, averaging 0.44–0.52 ms per control tick (inference and four physics
steps) across both versions. Rendering is the
remaining bottleneck in this software renderer. Removing unused floor
subdivisions reduced the default scene from 971,988 to 840,918 triangles per
frame (13.5%); the detailed CAD duck still accounts for most of the geometry.
These results do not establish native desktop or phone GPU performance.

Additional rendering-load changes on 2026-10-04 share only bit-identical
position/normal pairs after crease shading. For all 38 unique CAD parts,
stored vertices fall from 1,295,406 to 386,883 (70.1%), and position, normal
and index buffers from 31,089,744 to 11,876,004 bytes (61.8%). These are unique
geometry buffer totals for one rig, excluding textures, driver overhead and
temporary preparation allocations. The expanded triangle stream, winding,
normals and bounds remain identical. Download assets and physics are unchanged.
The indexing pass took about 78 ms in an isolated Node prototype; it runs once
during wardrobe mesh preparation, and Playground copies the prepared buffers.

A sequential 1440×900, pixel-ratio-1 SwiftShader prototype check measured
3.92/2.66 FPS before and 3.62/2.51 FPS after for first/repeat visits. This
does **not** establish an FPS improvement. Triangle count (840,918 in the
default scene), draw calls (165) and fragment work are unchanged. A lighter
display mesh or adjustable resolution is a separate visual-quality tradeoff
that should be evaluated on the affected native browser/GPU.

Paused and fallen scenes now redraw only when their pose, camera or canvas
size changes. Running and loading scenes continue rendering. Browser checks
verify zero draw calls while a paused camera is settled, followed by redraws
on drag, wheel zoom, resize and resume. Camera damping is allowed to finish
before drawing stops; a cheap animation-frame callback still observes controls.
Orbit damping uses elapsed render time, matching the previous factor at 60 Hz,
so low frame rates do not stretch the settling period across hundreds of frames.
It is capped after long frame gaps and does not change simulation time.
`node scripts/validate-robot-geometry.mjs` verifies byte-identical expanded
geometry and the WebGL2 index-width boundary.

The performance changes also passed real WASM physics and geometry checks,
all 21 Playground browser checks, 7 studio checks, garment-fit checks,
127 export cases and root/Pages production
builds. Gzip responses matched the original runtime bytes under both development
bases, including HEAD, conditional requests and disabled gzip negotiation.

With Vite running, reproduce the measurements with:

```sh
node scripts/profile-playground.mjs local
```

Set `DUCKROBE_URL` for another development address and `DUCKROBE_QA_OUTPUT` for
the JSON output directory. The script records click-to-worker-ready startup,
stages, frame rate,
simulation/wall-time ratio, worker tick time, render submission time, triangles,
draw calls, pixel count and WebGL renderer. Render submission time measures CPU
work, not completed GPU work. Measure on the affected browser/device before
choosing reduced mesh detail or a lower render resolution.

Garments are rigid decorations: wide or long hems can intersect swinging legs,
and shoe soles can intersect the floor because contacts use the official bare
feet. No cloth physics, garment collisions, physical root lift, ZIP import,
ride boarding, rollers or multiplayer are included. Physical-phone
GPU performance is not established by responsive Chromium viewport checks.
