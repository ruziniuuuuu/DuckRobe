import { Vector3 } from 'three';

const yUp = point => new Vector3(point[0], point[2], -point[1]);

// Fit subjects in camera space, including tall portrait viewports. All world
// descriptors stay in native Z-up metres; conversion happens only here.
function fit(target, direction, subjects, aspect, fov) {
  const forward = direction.clone().normalize(), right = new Vector3().crossVectors(new Vector3(0, 1, 0), forward).normalize();
  const up = new Vector3().crossVectors(forward, right), tangent = Math.tan(fov * Math.PI / 360);
  let distance = .35;
  for (const { point, radius } of subjects) {
    const delta = point.clone().sub(target), depth = delta.dot(forward) + radius;
    distance = Math.max(distance, depth + (Math.abs(delta.dot(right)) + radius) / (tangent * Math.max(.2, aspect)), depth + (Math.abs(delta.dot(up)) + radius) / tangent);
  }
  return { position: target.clone().addScaledVector(forward, distance * 1.08), target, fov };
}

export function nearestPhoto(world, pose) {
  return [...(world.photos || [])].sort((a, b) => Math.hypot(pose.root[0] - a.pos[0], pose.root[1] - a.pos[1]) - Math.hypot(pose.root[0] - b.pos[0], pose.root[1] - b.pos[1]))[0] || null;
}

export function portraitView(pose, aspect, size = .30) {
  const [w, x, y, z] = pose.root.slice(3), yaw = Math.atan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z));
  const angle = yaw - .75, target = yUp([pose.root[0], pose.root[1], pose.root[2] + .055]);
  return fit(target, yUp([Math.cos(angle), Math.sin(angle), .30]), [{ point: target, radius: Math.max(.14, size / 2) }], aspect, 36);
}

export function scenicView(world, pose, aspect, point = nearestPhoto(world, pose), size = .30) {
  if (!point?.view) return portraitView(pose, aspect, size);
  const actor = yUp([pose.root[0], pose.root[1], pose.root[2] + .055]), focus = yUp(point.view.focus);
  return { ...fit(actor.clone().lerp(focus, .42), yUp(point.view.direction), [{ point: actor, radius: Math.max(.17, size / 2) }, { point: focus, radius: point.view.radius }], aspect, 40), place: point.id };
}
