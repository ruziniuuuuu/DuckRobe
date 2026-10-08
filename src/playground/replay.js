import { Group, MeshBasicMaterial, Quaternion } from 'three';
import { applySimulationPose } from './rig.js';
import { replayPose } from './keepsakes.js';

// Geometry is shared with the duck; this clone owns only its translucent material.
export function createReplay(rig) {
  const group = rig.group.clone(true), frame = new Group(), material = new MeshBasicMaterial({ color: 0x9cdbd1, transparent: true, opacity: .30, depthWrite: false });
  group.name = 'best-lap-duck'; frame.rotation.x = -Math.PI / 2; frame.add(group); frame.visible = false;
  group.traverse(node => { if (node.isMesh) { node.material = material; node.castShadow = node.receiveShadow = false; } });
  const bodies = new Map([...rig.bodies].map(([name]) => [name, group.getObjectByName(name)])), rotation = new Quaternion();
  const clone = { group, bodies, setJoint(name, angle) {
    const joint = rig.joints.get(name); if (!joint) return;
    bodies.get(joint.body.name).quaternion.copy(joint.baseQuaternion).multiply(rotation.setFromAxisAngle(joint.axis, angle));
  } };
  return { group: frame, update(record, time, enabled) {
    const pose = enabled ? replayPose(record, time) : null; frame.visible = Boolean(pose);
    if (pose) applySimulationPose(clone, pose);
  }, dispose() { frame.removeFromParent(); material.dispose(); } };
}
