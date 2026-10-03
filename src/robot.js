import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import { createBehaviorController } from './behavior.js';

// Microduck's CAD frames use metres, +X forward and +Z up. Keep those
// frames intact so preview geometry and the native MJCF export agree.
export const DEFAULT_POSE = {
  left_hip_yaw: 0,
  left_hip_roll: -0.08726646259971647,
  left_hip_pitch: -0.457924,
  left_knee: -0.00494,
  left_ankle: 0.452984,
  neck_pitch: 0.3490658503988659,
  head_pitch: 0.3490658503988659,
  head_yaw: 0,
  head_roll: 0,
  right_hip_yaw: 0,
  right_hip_roll: 0.08726646259971647,
  right_hip_pitch: 0.457924,
  right_knee: 0.00494,
  right_ankle: -0.452984,
};

const APP_BASE_URL = import.meta.env?.BASE_URL || '/';

// Public assets are stored at /robot in the source manifest. Resolve them
// against the deployed app base, leaving remote and already-resolved URLs alone.
export function robotAssetUrl(url) {
  if (/^(?:[a-z][\w+.-]*:|\/\/)/i.test(url)) return url;
  const base = APP_BASE_URL.endsWith('/') ? APP_BASE_URL : `${APP_BASE_URL}/`;
  return url.startsWith(base) ? url : `${base}${url.replace(/^\/+/, '')}`;
}

const quaternion = (q) => new THREE.Quaternion(q[1], q[2], q[3], q[0]).normalize();
const accentParts = new Set([
  'jaw.stl', 'jaw_soft.stl', 'soft_mouth_top.stl', 'bottom_head_shell.stl',
  'noenoeil.stl', 'foot_left.stl', 'foot_right.stl', 'ankle_left.stl', 'ankle_right.stl',
]);
const shellParts = new Set([
  'top_head_shell.stl', 'left_shell.stl', 'right_shell.stl',
  'upper_leg_left.stl', 'upper_leg_right.stl', 'trunk_base.stl', 'face_part.stl',
]);
const darkParts = new Set([
  'xl330.stl', 'yaw2roll.stl', 'yaw_roll_motion.stl', 'bearing_roll.stl',
  'motor_support.stl', 'np_f970.stl', 'lens.stl', 'm12_lens_holder.stl',
]);

export const DEFAULT_ROBOT_COLORS = Object.freeze({ shell: '#ed8938', accent: '#f5b45f' });

export function normalizeRobotColors(colors = {}) {
  const source = colors && typeof colors === 'object' ? colors : {};
  return Object.fromEntries(Object.entries(DEFAULT_ROBOT_COLORS).map(([slot, fallback]) => {
    const value = source[slot];
    return [slot, typeof value === 'string' && /^#[\da-f]{6}$/i.test(value) ? value.toLowerCase() : fallback];
  }));
}

export function robotPartColor(name, colors = DEFAULT_ROBOT_COLORS) {
  const slot = name === 'lens.stl' ? 'lens'
    : shellParts.has(name) ? 'shell'
      : accentParts.has(name) ? 'accent'
        : darkParts.has(name) ? 'dark' : 'metal';
  const palette = { ...normalizeRobotColors(colors), dark: '#343638', metal: '#a8a5a0', lens: '#111b20' };
  return { slot, color: palette[slot] };
}

function materialFor(name, cache, colors) {
  const {slot, color} = robotPartColor(name, colors);
  if (!cache.has(slot)) {
    cache.set(slot, new THREE.MeshStandardMaterial({
      color,
      roughness: slot === 'lens' ? 0.12 : slot === 'metal' ? 0.46 : 0.58,
      metalness: slot === 'metal' ? 0.28 : slot === 'dark' ? 0.12 : 0,
    }));
  }
  return cache.get(slot);
}

async function json(url, signal) {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`Microduck asset failed: ${response.status} ${url}`);
  return response.json();
}

export async function loadRobot({ colors, signal } = {}) {
  const bodyColors = normalizeRobotColors(colors);
  const manifest = await json(robotAssetUrl('/robot/manifest.json'), signal);
  const web = {
    ...manifest.web,
    glbUrl: robotAssetUrl(manifest.web.glbUrl),
    kinematicsUrl: robotAssetUrl(manifest.web.kinematicsUrl),
  };
  const native = {
    ...manifest.native,
    xmlUrl: robotAssetUrl(manifest.native.xmlUrl),
    meshBaseUrl: robotAssetUrl(manifest.native.meshBaseUrl),
    licenseUrl: robotAssetUrl(manifest.native.licenseUrl),
  };
  const [kinematics, glb] = await Promise.all([
    json(web.kinematicsUrl, signal),
    fetch(web.glbUrl, { signal }).then(response => {
      if (!response.ok) throw new Error(`Microduck asset failed: ${response.status} ${web.glbUrl}`);
      return response.arrayBuffer();
    }),
  ]);
  signal?.throwIfAborted();
  const gltf = await new GLTFLoader().parseAsync(glb, '');

  // The GLB packs official STL part geometries, not an assembled character.
  // Rebuild its body tree from our export of the pinned official MJCF.
  const geometries = new Map();
  gltf.scene.traverse((object) => {
    if (!object.isMesh) return;
    const name = object.userData.meshFile || object.name;
    const scaled = object.geometry.clone();
    scaled.deleteAttribute('normal');
    scaled.scale(1000, 1000, 1000);
    const geometry = toCreasedNormals(scaled, Math.PI / 5);
    geometry.scale(0.001, 0.001, 0.001);
    geometry.computeBoundingBox();
    scaled.dispose();
    geometries.set(name, geometry);
    object.geometry.dispose();
    (Array.isArray(object.material) ? object.material : [object.material]).forEach(material => material.dispose());
  });

  const group = new THREE.Group();
  group.name = 'microduck';
  const bodies = new Map();
  const joints = new Map();
  const materials = new Map();

  for (const body of kinematics.bodies) {
    const node = new THREE.Group();
    node.name = body.name;
    node.userData.bodyName = body.name;
    node.position.fromArray(body.pos);
    node.quaternion.copy(quaternion(body.quat));
    bodies.set(body.name, node);
    if (body.joint) {
      joints.set(body.joint.name, {
        body: node,
        axis: new THREE.Vector3().fromArray(body.joint.axis).normalize(),
        baseQuaternion: node.quaternion.clone(),
        range: body.joint.range,
        angle: DEFAULT_POSE[body.joint.name] ?? 0,
      });
    }
    for (const geom of body.geoms) {
      if (geom.type !== 'mesh' || !geom.mesh) continue;
      const geometry = geometries.get(geom.mesh);
      if (!geometry) throw new Error(`Missing official Microduck part: ${geom.mesh}`);
      const mesh = new THREE.Mesh(geometry, materialFor(geom.mesh, materials, bodyColors));
      mesh.name = `${body.name}:${geom.mesh}`;
      mesh.userData.meshFile = geom.mesh;
      mesh.userData.bodyName = body.name;
      mesh.position.fromArray(geom.pos ?? [0, 0, 0]);
      mesh.quaternion.copy(quaternion(geom.quat ?? [1, 0, 0, 0]));
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      node.add(mesh);
    }
  }
  for (const body of kinematics.bodies) {
    (body.parent ? bodies.get(body.parent) : group).add(bodies.get(body.name));
  }

  const rotation = new THREE.Quaternion();
  function setJoint(name, angle, { clamp = true } = {}) {
    const joint = joints.get(name);
    if (!joint) return;
    if (clamp && joint.range) angle = THREE.MathUtils.clamp(angle, ...joint.range);
    joint.angle = angle;
    rotation.setFromAxisAngle(joint.axis, angle);
    joint.body.quaternion.copy(joint.baseQuaternion).multiply(rotation);
  }
  for (const [name, angle] of Object.entries(DEFAULT_POSE)) setJoint(name, angle);
  group.updateMatrixWorld(true);

  // Stable authoring frames: every anchor starts world-aligned in the
  // default pose, while inheriting its robot body's subsequent motion.
  const anchors = new Map();
  const anchorDefinitions = {};
  const worldQuaternion = new THREE.Quaternion();
  for (const [name, body] of bodies) {
    const anchor = new THREE.Group();
    anchor.name = `outfit_anchor:${name}`;
    body.getWorldQuaternion(worldQuaternion);
    anchor.quaternion.copy(worldQuaternion).invert();
    anchor.userData.bodyName = name;
    body.add(anchor);
    anchors.set(name, anchor);
    anchorDefinitions[name] = {
      bodyName: name,
      localPosition: [0, 0, 0],
      localQuaternion: anchor.quaternion.toArray(),
      quaternionOrder: 'xyzw',
      defaultWorldPosition: body.getWorldPosition(new THREE.Vector3()).toArray(),
    };
  }

  // The simplified simulation head treats the beak as rigid. Restore a
  // visual hinge for a small quack without changing the native dynamics.
  const head = bodies.get('jaw_soft');
  const jawMeshes = head.children.filter((node) => node.isMesh && ['jaw.stl', 'jaw_soft.stl'].includes(node.userData.meshFile));
  const rigidJaw = jawMeshes.find((node) => node.userData.meshFile === 'jaw.stl');
  const jawPivot = new THREE.Group();
  jawPivot.name = 'microduck_visual_jaw';
  if (rigidJaw) {
    jawPivot.position.copy(head.worldToLocal(rigidJaw.localToWorld(new THREE.Vector3(0, 0.00004, 0.0075))));
    head.add(jawPivot);
    head.updateMatrixWorld(true);
    for (const mesh of jawMeshes) jawPivot.attach(mesh);
  }
  const jawAxis = new THREE.Vector3(0, 1, 0).applyQuaternion(head.getWorldQuaternion(new THREE.Quaternion()).invert()).normalize();

  group.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(group, true);
  const groundOffset = -box.min.z;
  group.position.z = groundOffset;
  group.updateMatrixWorld(true);
  box.setFromObject(group, true);

  const metadata = {
    ...manifest,
    web,
    native,
    modelName: 'Microduck',
    kinematics,
    defaultPose: { ...DEFAULT_POSE },
    anchorDefinitions,
    bounds: { min: box.min.toArray(), max: box.max.toArray(), size: box.getSize(new THREE.Vector3()).toArray() },
    groundOffset,
    bodyColors,
    mjcfUrl: native.xmlUrl,
    meshBaseUrl: native.meshBaseUrl,
  };

  function setColors(colors) {
    metadata.bodyColors = normalizeRobotColors(colors);
    for (const slot of ['shell', 'accent']) materials.get(slot)?.color.set(metadata.bodyColors[slot]);
    return { ...metadata.bodyColors };
  }

  const behavior = createBehaviorController({ group, bodies, setJoint, defaultPose: DEFAULT_POSE, groundOffset, jawPivot, jawAxis });
  return { group, bodies, joints, anchors, metadata, setJoint, setColors, behavior,
    animate: behavior.animate, trigger: behavior.trigger, setInteraction: behavior.setInteraction };
}
