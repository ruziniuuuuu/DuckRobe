import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import loadMujoco from '@mujoco/mujoco';
import * as ort from 'onnxruntime-web/wasm';
import { Quaternion, Vector3 } from 'three';
import { loadPhysicsAssets, preparePhysicsXml } from '../src/playground/model.js';
import { createSimulation } from '../src/playground/simulation.js';
import { createEnvironment } from '../src/playground/environment.js';
import { createActivity } from '../src/playground/activity.js';
import { getWorld } from '../src/playground/worlds.js';

globalThis.DOMParser = DOMParser; globalThis.XMLSerializer = XMLSerializer;
const root = path.resolve('public'), nativeFetch = globalThis.fetch;
globalThis.fetch = async (input, options) => {
  const url = new URL(input instanceof URL ? input : typeof input === 'string' ? input : input.url, 'http://duckrobe.test');
  if (url.hostname !== 'duckrobe.test') return nativeFetch(input, options);
  const filename = path.resolve(root, `.${url.pathname}`);
  assert(filename.startsWith(root + path.sep));
  return new Response(await readFile(filename));
};
const assets = await loadPhysicsAssets('http://duckrobe.test/playground/');
const source = await readFile('public/playground/robot.xml', 'utf8');
const policyUrl = new Uint8Array(await readFile('public/playground/walking.onnx'));
ort.env.wasm.numThreads = 1;
ort.env.wasm.wasmBinary = await readFile('node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm');
const mujoco = await loadMujoco();
let model, data;
const instrumented = { ...mujoco, MjData: class { constructor(m) { model = m; data = new mujoco.MjData(m); return data; } } };
const dynamics = () => Object.fromEntries(['body_mass', 'body_inertia', 'actuator_gainprm', 'actuator_biasprm'].map(key => [key, Array.from(model[key])]));
const baseline = await createSimulation({ mujoco: instrumented, ort, ...assets, policyUrl });
const originalDynamics = dynamics();
await baseline.dispose();
const yUp = values => new Vector3(values[0], values[2], -values[1]);

for (const id of ['circuit', 'park', 'harbor']) {
  const world = getWorld(id), scenery = createEnvironment(world);
  const worldAssets = await loadPhysicsAssets('http://duckrobe.test/playground/', undefined, world);
  assert.equal(worldAssets.xml, preparePhysicsXml(source, world).xml, `${id} cached assets must use this world's contacts and spawn`);
  worldAssets.meshes.forEach((mesh, i) => {
    assert.notEqual(mesh.bytes, assets.meshes[i].bytes);
    assert.deepEqual(new Uint8Array(mesh.bytes), new Uint8Array(assets.meshes[i].bytes));
  });
  const sim = await createSimulation({ mujoco: instrumented, ort, ...worldAssets, policyUrl });
  try {
    assert.equal(model.nu, 14); assert.equal(model.nq, 21);
    assert.deepEqual(dynamics(), originalDynamics, `${id} changed robot dynamics`);
    const initial = sim.snapshot(); assert.deepEqual(initial.root.slice(0, 3), world.spawn);
    scenery.group.updateMatrixWorld(true);
    for (const record of world.colliders) {
      const handle = model.geom(record.name), geomId = handle.id; handle.delete();
      const mesh = scenery.group.getObjectByName(record.name); assert(mesh, record.name);
      const position = yUp(data.geom_xpos.slice(geomId * 3, geomId * 3 + 3));
      assert(mesh.getWorldPosition(new Vector3()).distanceTo(position) < 1e-9, `${record.name} contact/render position`);
      const size = Array.from(model.geom_size.slice(geomId * 3, geomId * 3 + 3));
      assert.deepEqual(mesh.scale.toArray(), record.type === 'box' ? size.map(v => 2 * v) : [size[0], size[0], size[1]]);
      const rotation = data.geom_xmat.slice(geomId * 9, geomId * 9 + 9), q = mesh.getWorldQuaternion(new Quaternion());
      for (let axis = 0; axis < 3; axis++) {
        const unit = new Vector3().setComponent(axis, 1).applyQuaternion(q);
        assert(unit.distanceTo(yUp([rotation[axis], rotation[3 + axis], rotation[6 + axis]])) < 1e-9, `${record.name} contact/render orientation`);
      }
    }
    for (let i = 0; i < 100; i++) assert(!(await sim.step()).fallen, `${id} idle fall`);
    sim.reset();
    for (let i = 0; i < 150; i++) assert(!(await sim.step({ forward: 1 })).fallen, `${id} walking fall`);
    assert(sim.snapshot().root[0] - initial.root[0] > .1, `${id} spawn must allow forward walking`);
    assert.deepEqual(sim.reset(), initial);
    // Place the real robot against representative obstacles; verify MuJoCo
    // produces contacts, rather than checking only generated XML strings.
    for (const name of id === 'circuit' ? ['circuit_rail_0', 'island_middle'] : id === 'park' ? ['park_fence_px', 'park_tree_0', 'park_bench_0'] : ['harbor_railing_water', 'harbor_post_office', 'harbor_mailbox_0']) {
      sim.reset();
      const record = world.colliders.find(record => record.name === name), handle = model.geom(name), geomId = handle.id; handle.delete();
      data.qpos[0] = record.pos[0]; data.qpos[1] = record.pos[1];
      mujoco.mj_forward(model, data);
      const contacts = data.contact;
      let touches = false;
      for (let i = 0; i < data.ncon; i++) {
        const contact = contacts.get(i); touches ||= contact.geom1 === geomId || contact.geom2 === geomId; contact.delete();
      }
      contacts.delete(); assert(touches, `${name} must physically contact the robot`);
    }
    const routes = id === 'park' ? [{ start: [1.70, -.20], yaw: 0, axis: 0, target: 2.15 }, { start: [0, -1.03], yaw: Math.PI / 2, axis: 1, target: -.15 }]
      : id === 'circuit' ? [{ start: [1.55, 1.12], yaw: Math.PI / 2, axis: 1, target: 1.80 }]
      : [{ start: [-1.75, -.08], yaw: 0, axis: 0, target: -.70 }, { start: [1.10, -.70], yaw: Math.PI / 2, axis: 1, target: .22 }, { start: [2.60, -1.95], yaw: Math.PI / 2, axis: 1, target: -1.45 }];
    for (const route of routes) {
      sim.reset(); data.qpos[0] = route.start[0]; data.qpos[1] = route.start[1]; data.qpos[3] = Math.cos(route.yaw / 2); data.qpos[6] = Math.sin(route.yaw / 2); mujoco.mj_forward(model, data);
      for (let step = 0; step < 1100 && sim.snapshot().root[route.axis] < route.target; step++) assert(!(await sim.step({ forward: 1 })).fallen, `${id} route fall`);
      assert(sim.snapshot().root[route.axis] >= route.target, `${id} route must be physically reachable: ${JSON.stringify(route)}`);
    }
    assert.deepEqual(sim.reset(), initial);
    console.log(`PASS ${id}: unchanged dynamics, ${world.colliders.length} aligned colliders, real contacts, standing/walking and spawn reset`);
  } finally { scenery.dispose(); await sim.dispose(); }
}

assert.equal((await loadPhysicsAssets('http://duckrobe.test/playground/')).xml, assets.xml);
console.log('PASS cached native meshes retain independent worker ownership and world-specific XML across scene switches');

const circuit = getWorld('circuit'), race = createActivity(circuit);
const pose = (root, time, fallen = false) => ({ root, time, fallen });
let time = 0;
const cross = (index, { reverse = false, outside = false, fallen = false } = {}) => {
  const g = circuit.gates[index], offset = outside ? g.width : 0;
  const point = distance => [g.pos[0] + g.normal[0] * distance - g.normal[1] * offset,
    g.pos[1] + g.normal[1] * distance + g.normal[0] * offset];
  race.update(pose(point(reverse ? .1 : -.1), ++time));
  return race.update(pose(point(reverse ? -.1 : .1), ++time, fallen));
};
cross(0, { reverse: true }); cross(0, { outside: true }); cross(0, { fallen: true });
assert.equal(race.getState().started, false);
cross(0); assert.equal(race.getState().nextGate, 1);
cross(2); cross(0); assert.equal(race.getState().laps, 0); assert.equal(race.getState().nextGate, 1);
cross(1); cross(2); cross(3); cross(0);
assert.equal(race.getState().laps, 1); assert(race.getState().best > 0);
const best = race.getState().best;
cross(1); cross(2); cross(3); cross(0);
assert.equal(race.getState().laps, 2); assert(race.getState().best <= best);
const frozen = race.getState();
race.update(pose([.1, -1.1], time)); assert.deepEqual(race.getState(), frozen);
race.update(pose(circuit.spawn, 0));
assert.deepEqual(race.getState(), { started: false, elapsed: 0, nextGate: 0, laps: 0, best: null, stamps: [], splits: [], lastLap: null });
console.log('PASS circuit: directional/in-lane ordered gates, repeated laps, best time, frozen simulation time and reset');

const park = getWorld('park'), passport = createActivity(park);
passport.update(pose(park.stops[0].pos, 1, true)); assert.deepEqual(passport.getState().stamps, []);
for (const [index, stop] of park.stops.entries()) {
  passport.update(pose(stop.pos, index + 2)); passport.update(pose(stop.pos, index + 2));
  assert.equal(passport.getState().stamps.length, index + 1);
}
assert.deepEqual(passport.getState().stamps, park.stops.map(stop => stop.id));
passport.update(pose(park.spawn, 0)); assert.deepEqual(passport.getState().stamps, []);
console.log('PASS park: proximity stamps, no duplicates/fallen collection and reset');
