import { ITEMS, selectedItemIds } from '../outfits.js';

// All actions are explicit and proximity-checked against simulated poses.
// A public watering can/mail counter keeps every activity available to all looks.
export function createInteractions(world, selection) {
  const kinds = new Set(ITEMS.filter(item => selectedItemIds(selection).includes(item.id)).map(item => item.kind));
  let completed = new Set(), carrying = false, previousTime = 0, wateredAt = null, performedAt = {};
  function reset() { completed = new Set(); carrying = false; previousTime = 0; wateredAt = null; performedAt = {}; }
  function nearby(pose) {
    if (!pose || pose.fallen) return null;
    if (pose.time < previousTime) reset(); previousTime = pose.time;
    return (world.interactions || []).filter(point => !completed.has(point.id)
      && Math.hypot(pose.root[0] - point.pos[0], pose.root[1] - point.pos[1]) <= point.radius)
      .sort((a, b) => Math.hypot(pose.root[0] - a.pos[0], pose.root[1] - a.pos[1]) - Math.hypot(pose.root[0] - b.pos[0], pose.root[1] - b.pos[1]))[0] || null;
  }
  function perform(pose) {
    const point = nearby(pose);
    if (!point || point.type === 'deliver' && !carrying) return null;
    if (point.type === 'letters') carrying = true;
    if (point.type === 'water') wateredAt = pose.time;
    performedAt[point.id] = pose.time;
    completed.add(point.id);
    return { ...point, personal: point.type === 'water' ? kinds.has('watering') : kinds.has('aviator-satchel') || kinds.has('satchel') };
  }
  return { nearby, perform, reset, getState: () => ({ completed: [...completed], carrying,
    wateredAt, performedAt: { ...performedAt }, delivered: (world.interactions || []).filter(point => point.type === 'deliver' && completed.has(point.id)).map(point => point.id),
    wateringCan: kinds.has('watering'), camera: kinds.has('instant-camera') || kinds.has('camera') }) };
}
