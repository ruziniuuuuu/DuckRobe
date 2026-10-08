import { ARENA_HALF, ARENA_WALL_H, ARENA_WALL_T, SPAWN } from './constants.js';

// Environment geometry uses metres, native Z-up and MJCF half-sizes. Both
// render meshes and static contacts come from these same records.
const box = (name, pos, size, kind = 'rail', yaw = 0, roll = 0) => ({ name, type: 'box', pos, size, kind, yaw, roll });
const cylinder = (name, pos, size, kind) => ({ name, type: 'cylinder', pos, size, kind, yaw: 0 });
const ht = ARENA_WALL_T / 2, hh = ARENA_WALL_H / 2, off = ARENA_HALF + ht, span = ARENA_HALF + ARENA_WALL_T;
const arena = {
  id: 'arena', label: 'worldArena', bounds: [ARENA_HALF, ARENA_HALF], spawn: [...SPAWN],
  colliders: [box('wall_px', [off, 0, hh], [ht, span, hh]), box('wall_nx', [-off, 0, hh], [ht, span, hh]),
    box('wall_py', [0, off, hh], [span, ht, hh]), box('wall_ny', [0, -off, hh], [span, ht, hh])],
};

// A stadium-shaped loop, traversed counterclockwise from the bottom straight.
export function circuitPoint(fraction, radius = 1.1) {
  const straight = .6, length = 4 * straight + 2 * Math.PI * radius;
  let d = ((fraction % 1 + 1) % 1) * length;
  if (d < 2 * straight) return [-straight + d, -radius];
  d -= 2 * straight;
  if (d < Math.PI * radius) { const a = -Math.PI / 2 + d / radius; return [straight + radius * Math.cos(a), radius * Math.sin(a)]; }
  d -= Math.PI * radius;
  if (d < 2 * straight) return [straight - d, radius];
  const a = Math.PI / 2 + (d - 2 * straight) / radius;
  return [-straight + radius * Math.cos(a), radius * Math.sin(a)];
}
const circuitRails = Array.from({ length: 56 }, (_, i) => {
  const a = circuitPoint(i / 56, 1.48), b = circuitPoint((i + 1) / 56, 1.48);
  return box(`circuit_rail_${i}`, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, .11],
    [Math.hypot(b[0] - a[0], b[1] - a[1]) / 2 + .006, .018, .11], 'rail', Math.atan2(b[1] - a[1], b[0] - a[0]));
}).filter((record, i) => i < 22 || i > 25);
const circuit = {
  id: 'circuit', label: 'worldCircuit', bounds: [2.65, 2.4], spawn: [-.55, -1.1, .12], revision: 2,
  overview: { direction: [-1.25, -1.4, 1.4], target: [0, .1, .25], scale: 1.48 },
  atmosphere: { top: 0x83adc7, horizon: 0xe8ecdf, sun: 0xffead0, sky: 0xe5eff9, ground: 0xa99879, fog: 0xe6eadc, power: 2.4, exposure: 1.05 },
  colliders: [box('island_middle', [0, 0, .065], [.6, .75, .065], 'island'),
    cylinder('island_right', [.6, 0, .065], [.75, .065], 'island'), cylinder('island_left', [-.6, 0, .065], [.75, .065], 'island'), ...circuitRails,
    box('pit_back', [1.4, 2.25, .35], [.75, .018, .35], 'building'),
    box('pit_workbench', [1.6, 2.12, .18], [.51, .155, .18], 'building'),
    ...[-.72, .72].map((x, i) => box(`pit_post_${i}`, [1.4 + x, 1.67, .38], [.018, .018, .38], 'post'))],
  gates: [{ pos: [0, -1.1], normal: [1, 0], width: .7 }, { pos: [1.7, 0], normal: [0, 1], width: .7 },
    { pos: [0, 1.1], normal: [-1, 0], width: .7 }, { pos: [-1.7, 0], normal: [0, -1], width: .7 }],
  photos: [{ id: 'finish', label: 'photoFinish', pos: [0, -1.1], radius: 1.1, view: { focus: [0, -1.1, .42], radius: .47, direction: [-1.3, -1.5, .85] } },
    { id: 'pit', label: 'photoPit', pos: [1.55, 1.68], radius: .65, view: { focus: [1.4, 1.97, .40], radius: .75, direction: [.8, -1.8, .9] } }],
};

const parkTrees = [[-2.7, -1.6, 1.1], [-2.6, 1.65, 1.3], [-1.5, 2.8, 1.2], [.6, 3, .9], [2.8, 1.8, 1.2], [-1.8, -2.7, 1], [2.8, -1.9, 1]];
const parkBenches = [[-.95, -2.2, 0], [.95, 2, Math.PI], [-1.95, 1.6, .6], [2, -1.3, -.5]];
const park = {
  id: 'park', label: 'worldPark', bounds: [3.35, 3.2], spawn: [-.4, -2.2, .12],
  overview: { direction: [-.9, -1.45, 1.35], target: [0, .1, .32], scale: 1.72 },
  atmosphere: { top: 0x9abac8, horizon: 0xf0e7d6, sun: 0xffdfb7, sky: 0xe9eff4, ground: 0xb09977, fog: 0xe9e5d6, power: 2.2, exposure: 1.03 },
  trees: parkTrees, benches: parkBenches,
  colliders: [...[[-.9, 0], [.9, 0], [0, .9]].map(([x, y], i) => cylinder(`park_garden_${i}`, [x, y, .045], [.20, .045], 'flowerbed')),
    ...Array.from({ length: 8 }, (_, i) => { const a = i * Math.PI / 4 + Math.PI / 8; return cylinder(`park_gazebo_post_${i}`, [Math.cos(a) * .6, Math.sin(a) * .6, .45], [.015, .45], 'post'); }),
    cylinder('park_carousel', [-2.45, 0, .06], [.55, .06], 'platform'),
    box('park_wheel_base', [1.2, 2.5, .15], [.94, .24, .15], 'stone'),
    box('park_wheel_step_lower', [1.2, 2.06, .04], [.34, .10, .04], 'stone'),
    box('park_wheel_step_upper', [1.2, 2.21, .10], [.34, .07, .10], 'stone'),
    ...[[-2.45, -2.35, .58], [2.65, -2.65, .46], [-2.2, 2.55, .45], [2.75, 2.60, .42], [-2.1, -1.0, .33], [-.55, 2.5, .42]]
      .map(([x, y, radius], i) => cylinder(`park_flowerbed_${i}`, [x, y, .045], [radius, .045], 'flowerbed')),
    box('park_slide_deck', [2.5, .62, .88], [.25, .18, .03], 'wood'),
    box('park_slide_chute', [2.5, .1, .46], [.18, .55, .02], 'slide', 0, .745),
    ...[-.2, .2].map((x, i) => box(`park_slide_rail_${i}`, [2.5 + x, .1, .50], [.016, .55, .045], 'wood', 0, .745)),
    ...[-.18, .18].flatMap((x, i) => [-.13, .13].map((y, j) => box(`park_slide_leg_${i}_${j}`, [2.5 + x, .62 + y, .44], [.02, .02, .44], 'wood'))),
    ...[-.18, .18].map((x, i) => box(`park_slide_ladder_${i}`, [2.5 + x, 1, .44], [.014, .51, .014], 'wood', 0, -.95)),
    ...Array.from({ length: 5 }, (_, i) => box(`park_slide_step_${i}`, [2.5, 1.29 - i * .145, .025 + i * .2], [.2, .014, .014], 'wood')),
    box('park_kiosk', [1.8, -2.35, .35], [.35, .25, .35], 'building'),
    box('park_gate_left', [-.75, -1.35, .5], [.075, .08, .5], 'post'),
    box('park_gate_right', [.75, -1.35, .5], [.075, .08, .5], 'post'),
    cylinder('park_wayfinding', [-1.25, -1.75, .36], [.018, .36], 'metal'),
    box('park_water_station', [-1.80, -.65, .18], [.105, .10, .18], 'building'),
    box('park_play_fence_front_lower', [2.04, -.85, .15], [.018, .35, .15], 'fence'),
    box('park_play_fence_front_upper', [2.04, .85, .15], [.018, .55, .15], 'fence'),
    box('park_play_fence_top', [2.7, 1.4, .15], [.66, .018, .15], 'fence'),
    box('park_play_fence_bottom', [2.7, -1.2, .15], [.66, .018, .15], 'fence'),
    box('park_fence_px', [3.35, 0, .14], [.025, 3.225, .14], 'fence'),
    box('park_fence_nx', [-3.35, 0, .14], [.025, 3.225, .14], 'fence'),
    box('park_fence_py', [0, 3.2, .14], [3.375, .025, .14], 'fence'),
    box('park_fence_ny_left', [-2.0625, -3.2, .14], [1.3125, .025, .14], 'fence'),
    box('park_fence_ny_right', [2.0625, -3.2, .14], [1.3125, .025, .14], 'fence'),
    ...parkTrees.map(([x, y, height], i) => cylinder(`park_tree_${i}`, [x, y, height * .24], [.035, height * .24], 'trunk')),
    ...parkBenches.map(([x, y, yaw], i) => box(`park_bench_${i}`, [x, y, .18], [.26, .11, .18], 'bench', yaw))],
  stops: [{ id: 'entrance', label: 'parkEntrance', pos: [0, -2.2], radius: .26 },
    { id: 'garden', label: 'parkGarden', pos: [1.5, 0], radius: .26 },
    { id: 'wheel', label: 'parkWheel', pos: [1.05, 1.7], radius: .26 },
    { id: 'carousel', label: 'parkCarousel', pos: [-1.5, 0], radius: .26 }],
  interactions: [{ id: 'garden', type: 'water', label: 'gardenWater', pos: [-1.72, -1.0], radius: .48, target: [-2.1, -1.0, .10] }],
  photos: [{ id: 'gate', label: 'photoEntrance', pos: [0, -2.2], radius: 1, view: { focus: [0, -1.35, .8], radius: .8, direction: [-.6, -2, .65] } },
    { id: 'carousel', label: 'parkCarousel', pos: [-1.5, 0], radius: .65, view: { focus: [-2.45, 0, .70], radius: .70, direction: [1.2, -1.5, .8] } },
    { id: 'wheel', label: 'parkWheel', pos: [1.05, 1.7], radius: .70, view: { focus: [1.2, 2.5, 1.05], radius: 1, direction: [-.7, -2, .7] } },
    { id: 'garden', label: 'parkGarden', pos: [-1.72, -1.0], radius: .7, view: { focus: [-2.1, -1, .22], radius: .38, direction: [1, -1.4, .9] } }],
};
const harbor = {
  id: 'harbor', label: 'worldHarbor', bounds: [3.3, 2.4], spawn: [-2.55, -1.55, .12],
  overview: { direction: [.55, -1.65, 1.25], target: [0, -.2, .3], scale: 1.82 },
  atmosphere: { top: 0x79acc7, horizon: 0xe3edf0, sun: 0xffefd8, sky: 0xddeefa, ground: 0xc2b598, fog: 0xdae6e8, power: 2.3, exposure: 1.09 },
  colliders: [box('harbor_post_office', [-1.75, .65, .52], [.58, .36, .52], 'building'),
    cylinder('harbor_lighthouse', [2.25, .65, .76], [.27, .76], 'building'),
    box('harbor_cafe', [.05, .74, .38], [.48, .32, .38], 'building'),
    cylinder('harbor_cafe_table', [.28, .08, .08], [.10, .08], 'building'),
    ...[[.04, .10, -Math.PI / 2], [.53, .12, Math.PI / 2], [.30, -.20, Math.PI]].map(([x, y, yaw], i) => box(`harbor_cafe_chair_${i}`, [x, y, .14], [.065, .055, .14], 'bench', yaw)),
    box('harbor_menu', [-.68, .33, .20], [.085, .065, .20], 'building'),
    box('harbor_crate_0', [-2.67, .51, .08], [.13, .12, .08], 'building'),
    box('harbor_crate_1', [-2.47, .68, .095], [.12, .11, .095], 'building'),
    box('harbor_railing_water', [0, 1.3, .16], [3.3, .02, .16], 'rail'),
    box('harbor_railing_front', [0, -2.4, .16], [3.3, .02, .16], 'rail'),
    box('harbor_railing_left', [-3.3, -.55, .16], [.02, 1.85, .16], 'rail'),
    box('harbor_railing_right', [3.3, -.55, .16], [.02, 1.85, .16], 'rail'),
    ...[[-.65, -.05], [1.10, .58], [2.60, -1.10]].map(([x, y], i) => box(`harbor_mailbox_${i}`, [x, y, .22], [.07, .06, .22], 'post'))],
  interactions: [{ id: 'post-office', type: 'letters', label: 'harborCollect', pos: [-1.75, -.08], radius: .48 },
    { id: 'cafe', type: 'deliver', label: 'harborCafe', pos: [-.65, -.40], radius: .36 },
    { id: 'quay', type: 'deliver', label: 'harborQuay', pos: [1.10, .22], radius: .36 },
    { id: 'lighthouse', type: 'deliver', label: 'harborLighthouse', pos: [2.60, -1.45], radius: .36 }],
  photos: [{ id: 'post-office', label: 'harborPostOffice', pos: [-1.75, -.08], radius: .8, view: { focus: [-1.75, .65, .65], radius: .72, direction: [.75, -1.8, .75] } },
    { id: 'cafe', label: 'harborCafe', pos: [.25, -.45], radius: .65, view: { focus: [.05, .74, .46], radius: .6, direction: [.9, -2, .8] } },
    { id: 'lighthouse', label: 'harborLighthouse', pos: [2.25, -.1], radius: 1, view: { focus: [2.25, .65, .95], radius: .93, direction: [.9, -1.8, .6] } }],
};
export const WORLDS = [circuit, park, harbor, arena];
export function getWorld(id = 'arena') {
  const world = WORLDS.find(world => world.id === id);
  if (!world) throw new Error(`Unknown playground environment: ${id}`);
  return world;
}
