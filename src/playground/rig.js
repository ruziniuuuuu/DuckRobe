import { Box3, Group, Raycaster, Vector3 } from 'three';
import { attachOutfitParts } from '../outfits.js';
import { JOINT_NAMES } from './constants.js';

export function dressSimulationRig(rig, selection) {
  // loadRobot establishes the clothing anchors in its reference pose. Keep
  // those local transforms, but remove the wardrobe's visual floor offset.
  rig.group.position.set(0, 0, 0);
  rig.group.quaternion.identity();
  const parts = attachOutfitParts(rig, selection);
  rig.group.updateMatrixWorld(true);
  // The wardrobe's roomy pack placement leaves its short harness floating
  // in an unobstructed arena view. Bring that harness to the visible torso
  // surface in the reference frame; preserve anchors and all physics data.
  const torso = rig.bodies.get('trunk_base').children.filter(node => node.isMesh)
    .concat(parts.filter(part => part.slot === 'body' && part.bodyName === 'trunk_base').map(part => part.group));
  for (const { group } of parts.filter(part => part.region === 'back' && ['backpack', 'garden-pack'].includes(part.group.userData.kind))) {
    const bounds = new Box3().setFromObject(group, true), center = bounds.getCenter(new Vector3());
    const ray = new Raycaster(new Vector3(bounds.min.x - 1, center.y, center.z), new Vector3(1, 0, 0));
    const surface = ray.intersectObjects(torso, true)[0]?.point.x;
    if (surface === undefined) continue;
    const offset = Math.max(0, Math.min(.02, surface - bounds.max.x - .0015));
    group.position.x += offset;
    group.userData.playgroundFitTranslation = [offset, 0, 0];
  }
  const nativeFrame = new Group();
  nativeFrame.rotation.x = -Math.PI / 2; // native Z-up -> arena Y-up, once
  nativeFrame.add(rig.group);
  return nativeFrame;
}

export function applySimulationPose(rig, pose) {
  const trunk = rig.bodies.get('trunk_base');
  trunk.position.fromArray(pose.root);
  trunk.quaternion.set(pose.root[4], pose.root[5], pose.root[6], pose.root[3]);
  // MuJoCo limits are soft; render the actual simulated angles, including
  // small limit excursions. Wardrobe animation still uses clamped joints.
  JOINT_NAMES.forEach((name, i) => rig.setJoint(name, pose.joints[i], { clamp: false }));
}
