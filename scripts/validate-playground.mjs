import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import loadMujoco from '@mujoco/mujoco';
import * as ort from 'onnxruntime-web/wasm';
import { Vector3 } from 'three';
import { loadRobot } from '../src/robot.js';
import { OUTFITS, ITEMS, createOutfitParts, normalizeSelection, selectedItemIds } from '../src/outfits.js';
import { loadPhysicsAssets } from '../src/playground/model.js';
import { createSimulation } from '../src/playground/simulation.js';
import { dressSimulationRig, applySimulationPose } from '../src/playground/rig.js';
import { JOINT_NAMES, DEFAULT_POSE, SPAWN, CONTROL_DT } from '../src/playground/constants.js';

globalThis.DOMParser = DOMParser; globalThis.XMLSerializer = XMLSerializer;
const root = path.resolve('public');
const nativeFetch = globalThis.fetch;
globalThis.fetch = async (input, options) => {
  const url = new URL(input instanceof URL ? input : typeof input === 'string' ? input : input.url, 'http://duckrobe.test');
  if (url.hostname !== 'duckrobe.test') return nativeFetch(input, options);
  const filename = path.resolve(root, `.${url.pathname}`);
  assert(filename.startsWith(root + path.sep));
  return new Response(await readFile(filename));
};
const manifest = JSON.parse(await readFile('public/playground/manifest.json'));
assert.equal(manifest.revision, '023172c8a7d629b5258d90364c13bafe013abbfa');
for (const [name, source] of Object.entries(manifest.files)) {
  const bytes = await readFile(`public/playground/${name}`);
  assert.equal(bytes.length, source.bytes);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), source.sha256, name);
  assert(source.url.includes(`/resolve/${manifest.revision}/`));
}
console.log('PASS pinned asset sizes and SHA-256 hashes');

const assets = await loadPhysicsAssets('http://duckrobe.test/playground/');
const world = new DOMParser().parseFromString(assets.xml, 'text/xml').getElementsByTagName('worldbody')[0];
assert([...world.getElementsByTagName('geom')].every(g => g.getAttribute('class') !== 'visual'));
const policyUrl = new Uint8Array(await readFile('public/playground/walking.onnx'));
ort.env.wasm.numThreads = 1;
ort.env.wasm.wasmBinary = await readFile('node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm');
const mujoco = await loadMujoco();
let data, model, steps = 0, observation, actions;
const instrumentedMujoco = { ...mujoco,
  MjData: class { constructor(m) { model = m; data = new mujoco.MjData(m); return data; } },
  mj_step: (m, d) => { steps++; mujoco.mj_step(m, d); },
};
const instrumentedOrt = { Tensor: ort.Tensor, InferenceSession: { create: async (...args) => {
  const session = await ort.InferenceSession.create(...args);
  return { inputNames: session.inputNames, outputNames: session.outputNames, release: () => session.release(),
    run: async feeds => {
      const input = feeds[session.inputNames[0]];
      assert.deepEqual(input.dims, [1, 61]); observation = Array.from(input.data);
      const outputs = await session.run(feeds); actions = Array.from(outputs[session.outputNames[0]].data);
      assert.equal(actions.length, 14); return outputs;
    } };
} } };
const sim = await createSimulation({ mujoco: instrumentedMujoco, ort: instrumentedOrt, ...assets, policyUrl });
const yaw = pose => { const [w, x, y, z] = pose.root.slice(3); return Math.atan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z)); };
const run = async (count, command = {}) => { let pose; for (let i = 0; i < count; i++) { pose = await sim.step(command); assert(!pose.fallen, `Unexpected fall at ${pose.time}`); } return pose; };
try {
  assert.equal(model.nu, 14); assert.equal(model.nq, 21);
  for (let i = 0; i < 14; i++) {
    const joint = model.jnt(JOINT_NAMES[i]);
    assert.equal(model.actuator_trnid[i * 2], joint.id); joint.delete();
  }
  const initial = sim.snapshot();
  assert.deepEqual(initial.root.slice(0, 3), SPAWN);
  await sim.step({ forward: 1, turn: -1 });
  assert.equal(steps, 4); assert(Math.abs(sim.snapshot().time - CONTROL_DT) < 1e-12);
  assert.deepEqual(observation.slice(0, 3), [0, 0, 0]);
  assert.deepEqual(observation.slice(3, 6).map(v => v || 0), [0, 0, -1]);
  assert(observation.slice(6, 48).every(v => Math.abs(v) < 1e-7));
  assert.deepEqual(observation.slice(48), [.25, 0, -1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  const previous = actions;
  await sim.step({ forward: -1 });
  assert.deepEqual(observation.slice(34, 48), previous);
  assert(Math.abs(observation[48] + .2) < 1e-7);
  Array.from(data.ctrl).forEach((v, i) => assert(Math.abs(v - DEFAULT_POSE[i] - actions[i]) < 1e-12));
  sim.reset(); assert.deepEqual(sim.snapshot(), initial);
  console.log('PASS 61 observations, 14 targets, 50 Hz inference / 200 Hz physics, reset history');

  const idle = await run(500);
  assert(Math.hypot(idle.root[0] - SPAWN[0], idle.root[1]) < .03);
  assert(idle.root[2] > .09 && idle.root[2] < .15);
  sim.reset(); const forward = await run(150, { forward: 1 });
  assert(forward.root[0] - SPAWN[0] > .1, 'Forward must translate the physical root');
  sim.reset(); const backward = await run(500, { forward: -1 });
  console.log('Reverse displacement from stand:', backward.root[0] - SPAWN[0]);
  sim.reset(); await run(150, { forward: 1 }); const reverseStart = sim.snapshot();
  const reverseMoving = await run(300, { forward: -1 });
  console.log('Reverse displacement after walking:', reverseMoving.root[0] - reverseStart.root[0]);
  assert(reverseMoving.root[0] < reverseStart.root[0] - .1, 'Reverse must translate after walking');
  sim.reset(); const turning = await run(150, { turn: 1 });
  assert(yaw(turning) > .5, 'Left must rotate the physical root');
  sim.reset(); const right = await run(150, { turn: -1 });
  console.log('Right yaw from stand:', yaw(right));
  sim.reset(); await run(100, { forward: 1 }); const rightStart = yaw(sim.snapshot());
  const rightMoving = await run(150, { turn: -1 });
  console.log('Right yaw after walking:', yaw(rightMoving) - rightStart);
  assert(yaw(rightMoving) - rightStart < -.5, 'Right must rotate after walking');
  console.log(`PASS idle 10 s; forward ${(forward.root[0] - SPAWN[0]).toFixed(3)} m / 3 s; reverse after walking ${(reverseMoving.root[0] - reverseStart.root[0]).toFixed(3)} m / 6 s; turn ${yaw(turning).toFixed(2)} rad / 3 s`);

  // Compare the actual clothing/body transforms with the official kinematics,
  // then replay the same control sequence on bare and dressed renderers.
  const official = JSON.parse(await readFile('public/playground/kinematics.json'));
  const colors = { shell: '#76a999', accent: '#ffc36b' };
  const rig = await loadRobot({ colors });
  assert.equal(rig.metadata.kinematics.bodies.length, official.bodies.length);
  for (const body of official.bodies) {
    const own = rig.metadata.kinematics.bodies.find(b => b.name === body.name);
    assert(own); assert.equal(own.parent, body.parent);
    own.pos.forEach((v, i) => assert(Math.abs(v - body.pos[i]) < 1e-9));
    assert(Math.abs(own.quat.reduce((sum, v, i) => sum + v * body.quat[i], 0)) > .999999);
    if (body.joint) {
      assert.equal(own.joint.name, body.joint.name);
      own.joint.axis.forEach((v, i) => assert(Math.abs(v - body.joint.axis[i]) < 1e-9));
      own.joint.range.forEach((v, i) => assert(Math.abs(v - body.joint.range[i]) < 1e-9));
    }
  }
  const anchors = structuredClone(rig.metadata.anchorDefinitions);
  dressSimulationRig(rig, {});
  const commands = Array.from({ length: 150 }, (_, i) => ({ forward: i < 100 ? 1 : 0, turn: i >= 50 ? .5 : 0 }));
  sim.reset(); const bare = [];
  for (const command of commands) { const pose = await sim.step(command); applySimulationPose(rig, pose); bare.push(pose); }
  const mixed = normalizeSelection({ ...OUTFITS[0].selection, accessory: Object.fromEntries(['chest', 'side', 'back'].map(region => [region, ITEMS.find(item => item.region === region).id])) });
  for (const selection of [OUTFITS[0].selection, mixed, ...['library-spell', 'sunday-linen'].map(id => OUTFITS.find(look => look.id === id).selection)]) {
    const dressed = await loadRobot({ colors }); dressSimulationRig(dressed, selection);
    assert.deepEqual(dressed.metadata.anchorDefinitions, anchors);
    assert.deepEqual(dressed.group.position.toArray(), [0, 0, 0]);
    assert.deepEqual(dressed.metadata.bodyColors, colors);
    assert.equal(dressed.group.getObjectByName('jaw_soft:top_head_shell.stl').material.color.getHexString(), colors.shell.slice(1));
    assert.equal(dressed.group.getObjectByName('jaw_soft:jaw.stl').material.color.getHexString(), colors.accent.slice(1));
    const expectedBodies = new Map(createOutfitParts(selection).map(part => [part.group.name, part.bodyName]));
    const parts = []; dressed.group.traverse(node => { if (node.userData.itemId) parts.push(node); });
    for (const part of parts.filter(part => part.userData.kind === 'backpack')) {
      assert(part.userData.playgroundFitTranslation[0] > 0 && part.userData.playgroundFitTranslation[0] <= .02);
    }
    assert.deepEqual([...new Set(parts.map(p => p.userData.itemId))].sort(), selectedItemIds(selection).sort());
    const localTransforms = parts.map(part => { part.updateMatrix(); return part.matrix.clone(); });
    sim.reset();
    for (let i = 0; i < commands.length; i++) {
      const pose = await sim.step(commands[i]); applySimulationPose(dressed, pose);
      assert.deepEqual(pose, bare[i], `Clothing changed fixed-step physics at step ${i}`);
      dressed.group.updateMatrixWorld(true);
      parts.forEach((part, j) => {
        assert.equal(part.parent.name, `outfit_anchor:${expectedBodies.get(part.name)}`);
        assert(part.matrix.equals(localTransforms[j]), 'Garment slipped from its body anchor');
        assert(part.matrixWorld.equals(part.parent.matrixWorld.clone().multiply(localTransforms[j])));
      });
      for (let j = 0; j < 14; j++) assert.equal(dressed.joints.get(JOINT_NAMES[j]).angle, pose.joints[j]);
      const p = dressed.bodies.get('trunk_base').getWorldPosition(new Vector3());
      assert(p.distanceTo(new Vector3(pose.root[0], pose.root[2], -pose.root[1])) < 1e-9);
    }
  }
  console.log('PASS official body-frame compatibility, full/mixed outfit anchors and colors, identical bare/dressed physics');

  sim.reset();
  // Real deterministic perturbation, through the instrumented MuJoCo data;
  // no extra production command or test-only worker backdoor is needed.
  data.qpos[2] = .035; data.qpos[3] = 0; data.qpos[4] = 1;
  mujoco.mj_forward(model, data);
  let fallen;
  for (let i = 0; i < 20; i++) { fallen = await sim.step(); if (fallen.fallen) break; }
  assert(fallen.fallen); assert(fallen.time >= .2);
  assert.deepEqual(sim.reset(), initial); await run(50);
  await assert.rejects(sim.step({ forward: NaN }), /Invalid movement/);
  console.log('PASS sustained real fall, reset/recovery and invalid-command rejection');
} finally { await sim.dispose(); }
