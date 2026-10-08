import assert from 'node:assert/strict';
import { createActivity } from '../src/playground/activity.js';
import { createInteractions } from '../src/playground/interactions.js';
import { createKeepsakes, validRace, replayPose } from '../src/playground/keepsakes.js';
import { getWorld } from '../src/playground/worlds.js';
import { OUTFITS } from '../src/outfits.js';
import { PerspectiveCamera, Vector3 } from 'three';
import { nearestPhoto, portraitView, scenicView } from '../src/playground/framing.js';

const pose = (point, time = 1, fallen = false) => ({ root: [...point.slice(0, 2), .12, 1, 0, 0, 0], joints: Array(14).fill(0), time, fallen });
const circuit = getWorld('circuit'), park = getWorld('park'), harbor = getWorld('harbor');
const memory = new Map(), storage = { getItem: key => memory.get(key), setItem: (key, value) => memory.set(key, value) };
const keepsakes = createKeepsakes(storage);
let recorded, time = 0;
const race = createActivity(circuit, { onLap: record => { recorded = record; keepsakes.saveRace(circuit, record); } });
function cross(index) {
  const gate = circuit.gates[index];
  race.update(pose(gate.pos.map((value, i) => value - gate.normal[i] * .02), time += 1));
  return race.update(pose(gate.pos.map((value, i) => value + gate.normal[i] * .02), time += 1));
}
cross(0); cross(1); cross(2); cross(3); cross(0);
assert(validRace(recorded, circuit)); assert.equal(recorded.splits.length, 4); assert.equal(recorded.duration, 8);
assert.equal(recorded.samples[0].time, 0); assert.equal(recorded.samples.at(-1).time, 8);
assert.equal(createKeepsakes(storage).record(circuit).duration, 8);
const savedRace = createActivity(circuit, { record: keepsakes.record(circuit) }); savedRace.reset(); assert.equal(savedRace.getState().best, 8);
const frozen = race.getState(); race.update(pose(circuit.gates[0].pos, time)); assert.deepEqual(race.getState(), frozen);
const interpolated = replayPose(recorded, .5); assert.equal(interpolated.time, .5); assert(Math.abs(Math.hypot(...interpolated.root.slice(3)) - 1) < 1e-10);
assert.equal(replayPose(recorded, -1), null); assert.equal(replayPose(recorded, 9), null);
assert(!validRace({ ...recorded, revision: -1 }, circuit)); assert(!validRace({ ...recorded, duration: NaN }, circuit));
assert(!validRace({ ...recorded, samples: [{ ...recorded.samples[0], root: [Infinity] }] }, circuit));
for (const index of [0, 1, recorded.samples.length - 1]) for (const invalid of [null, false, 3, []]) {
  const samples = structuredClone(recorded.samples); samples[index] = invalid;
  const record = { ...recorded, samples };
  assert.equal(validRace(record, circuit), false);
  const damaged = createKeepsakes({ getItem: () => JSON.stringify({ records: { circuit: record } }) });
  assert.equal(damaged.record(circuit), null, 'Malformed replay samples must be ignored without breaking startup');
}
race.update(pose(circuit.spawn, time + 1, true)); assert.equal(race.getState().started, false);
race.clearRecord(); race.reset(); assert.equal(race.getState().best, null);
keepsakes.clearRace(circuit); assert.equal(createKeepsakes(storage).record(circuit), null);
console.log('PASS race: completed pose recording, splits, device persistence, reset, fall invalidation, interpolation, versioning and clearing');

for (const personal of [false, true]) {
  const selection = personal ? OUTFITS.find(look => look.id === 'pocket-garden').selection : {};
  const garden = createInteractions(park, selection), point = park.interactions[0];
  assert.equal(garden.perform(pose([0, 0])), null);
  assert.equal(garden.perform(pose(point.pos, 1, true)), null);
  const watered = garden.perform(pose(point.pos, 2)); assert.equal(watered.personal, personal); assert.equal(garden.getState().wateredAt, 2);
  assert.deepEqual(garden.getState().completed, ['garden']); assert.equal(garden.perform(pose(point.pos, 3)), null);
  garden.nearby(pose(park.spawn, 0)); assert.deepEqual(garden.getState().completed, []);
}
const mail = createInteractions(harbor, OUTFITS.find(look => look.id === 'forest-post').selection), [office, ...destinations] = harbor.interactions;
assert.equal(mail.perform(pose(destinations[0].pos)), null);
assert.equal(mail.perform(pose(office.pos)).personal, true); assert.equal(mail.getState().carrying, true);
for (const [i, point] of destinations.entries()) { assert(mail.perform(pose(point.pos, i + 2))); assert.equal(mail.perform(pose(point.pos, i + 2)), null); }
assert.deepEqual(mail.getState().delivered, destinations.map(point => point.id)); mail.reset(); assert.equal(mail.getState().carrying, false);
console.log('PASS interactions: actual proximity, personal/borrowed can, one action per stop, three deliveries, reset and fallen guards');

for (let i = 0; i < 10; i++) keepsakes.addPhoto({ id: String(i), worldId: 'park', date: '2026-10-04T00:00:00Z', image: 'data:image/jpeg;base64,YWJj', selection: {}, place: 'Garden' });
assert.equal(keepsakes.photoCount(), 8); assert.equal(createKeepsakes(storage).photos()[0].id, '9');
keepsakes.removePhoto('9'); assert.equal(createKeepsakes(storage).photoCount(), 7);
const unavailable = createKeepsakes({ getItem() { throw new Error('blocked'); }, setItem() { throw new Error('quota'); } });
assert.equal(unavailable.addPhoto({ id: 'local', selection: {} }), false); assert.equal(unavailable.photoCount(), 1);
const corrupt = createKeepsakes({ getItem: () => '{', setItem() {} }); assert.equal(corrupt.photoCount(), 0);
console.log('PASS keepsakes: bounded album, reload, delete, damaged/blocked storage and in-memory fallback');

function visible(shot, point, radius, aspect) {
  const camera = new PerspectiveCamera(shot.fov, aspect, .01, 60); camera.position.copy(shot.position); camera.lookAt(shot.target); camera.updateMatrixWorld();
  for (const axis of [[radius, 0, 0], [-radius, 0, 0], [0, radius, 0], [0, -radius, 0], [0, 0, radius], [0, 0, -radius]]) {
    const p = point.clone().add(new Vector3(...axis)).project(camera);
    assert(Math.abs(p.x) < 1 && Math.abs(p.y) < 1 && p.z > -1 && p.z < 1, `camera clips subject at aspect ${aspect}`);
  }
}
for (const aspect of [.26, .46, 1, 1.6, 3.8]) for (const world of [circuit, park, harbor]) {
  const actor = pose(world.spawn), before = JSON.stringify(world.photos), close = portraitView(actor, aspect);
  visible(close, new Vector3(actor.root[0], actor.root[2] + .055, -actor.root[1]), .15, aspect);
  for (const size of [.30, .65]) for (const point of world.photos) {
    const actor = pose(point.pos), scenic = scenicView(world, actor, aspect, point, size);
    visible(portraitView(actor, aspect, size), new Vector3(actor.root[0], actor.root[2] + .055, -actor.root[1]), size / 2, aspect);
    visible(scenic, new Vector3(actor.root[0], actor.root[2] + .055, -actor.root[1]), Math.max(.17, size / 2), aspect);
    visible(scenic, new Vector3(point.view.focus[0], point.view.focus[2], -point.view.focus[1]), point.view.radius, aspect);
    assert.equal(scenic.place, point.id); assert.equal(nearestPhoto(world, actor).id, point.id);
  }
  assert.equal(JSON.stringify(world.photos), before);
}
const straight = portraitView(pose([0, 0]), 1), turned = pose([0, 0]); turned.root[3] = Math.SQRT1_2; turned.root[6] = Math.SQRT1_2;
const rotated = portraitView(turned, 1);
assert(Math.abs(rotated.position.x - straight.position.z) < 1e-10); assert(Math.abs(rotated.position.z + straight.position.x) < 1e-10);
assert.equal(nearestPhoto(getWorld('arena'), turned), null); assert.deepEqual(scenicView(getWorld('arena'), turned, 1), portraitView(turned, 1));
console.log('PASS framing: rotated outfits and all landmarks fit portrait/landscape screens without mutating scene descriptors');
