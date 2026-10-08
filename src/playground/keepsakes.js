import { normalizeSelection } from '../outfits.js';

const KEY = 'duckrobe.travels.v1', LIMIT = 8, MAX_SAMPLES = 6002;
const finite = values => Array.isArray(values) && values.every(Number.isFinite);
export function validRace(record, world) {
  if (!record || record.revision !== world.revision || !Number.isFinite(record.duration) || record.duration <= 0 || record.duration > 1200
    || !finite(record.splits) || record.splits.length !== 4 || record.splits.some((value, i) => value <= (record.splits[i - 1] || 0)) || Math.abs(record.splits[3] - record.duration) > .01
    || !Array.isArray(record.samples) || record.samples.length < 2 || record.samples.length > MAX_SAMPLES
    || !record.samples.every(sample => sample && typeof sample === 'object' && !Array.isArray(sample))) return false;
  if (record.samples[0].time !== 0 || Math.abs(record.samples.at(-1).time - record.duration) > .01) return false;
  let time = -1;
  return record.samples.every(sample => {
    const valid = Number.isFinite(sample.time) && sample.time >= 0 && sample.time >= time && sample.time <= record.duration + .01
      && finite(sample.root) && sample.root.length === 7 && Math.abs(Math.hypot(...sample.root.slice(3)) - 1) < .02 && finite(sample.joints) && sample.joints.length === 14;
    time = sample.time; return valid;
  });
}
export function createKeepsakes(storage) {
  let photos = [], records = {};
  try {
    const saved = JSON.parse(storage?.getItem(KEY) || '{}');
    photos = (Array.isArray(saved.photos) ? saved.photos : []).slice(0, LIMIT).filter(photo => photo && typeof photo.id === 'string'
      && ['circuit', 'park', 'harbor', 'arena'].includes(photo.worldId) && typeof photo.date === 'string'
      && typeof photo.image === 'string' && photo.image.length < 220000 && /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(photo.image))
      .map(photo => ({ ...photo, selection: normalizeSelection(photo.selection) }));
    records = saved.records && typeof saved.records === 'object' && !Array.isArray(saved.records) ? saved.records : {};
  } catch { /* Fresh sessions still work if storage is unavailable or damaged. */ }
  function persist() {
    try { if (!storage) return false; storage.setItem(KEY, JSON.stringify({ photos, records })); return true; } catch { return false; }
  }
  return {
    photos: () => structuredClone(photos),
    photoCount: () => photos.length,
    addPhoto(photo) { photos = [{ ...photo, selection: normalizeSelection(photo.selection) }, ...photos].slice(0, LIMIT); return persist(); },
    removePhoto(id) { photos = photos.filter(photo => photo.id !== id); return persist(); },
    record(world) { const record = records[world.id]; return validRace(record, world) ? structuredClone(record) : null; },
    saveRace(world, record) {
      if (!validRace(record, world)) return false;
      const previous = this.record(world);
      if (!previous || record.duration < previous.duration) records[world.id] = structuredClone(record);
      return persist();
    },
    clearRace(world) { delete records[world.id]; return persist(); },
  };
}

// Render-only playback uses the same simulation time as the current lap.
export function replayPose(record, time) {
  if (!record || time < 0 || time > record.duration) return null;
  const samples = record.samples;
  let low = 0, high = samples.length - 1;
  while (low + 1 < high) { const middle = (low + high) >> 1; if (samples[middle].time <= time) low = middle; else high = middle; }
  const a = samples[low], b = samples[high], f = Math.min(1, Math.max(0, (time - a.time) / (b.time - a.time || 1)));
  const root = a.root.map((value, i) => i < 3 ? value + (b.root[i] - value) * f : value);
  // Nlerp with the short quaternion arc, normalized before rendering.
  const sign = a.root.slice(3).reduce((dot, value, i) => dot + value * b.root[i + 3], 0) < 0 ? -1 : 1;
  const q = a.root.slice(3).map((value, i) => value + (b.root[i + 3] * sign - value) * f), length = Math.hypot(...q) || 1;
  root.splice(3, 4, ...q.map(value => value / length));
  return { time, root, joints: a.joints.map((value, i) => value + (b.joints[i] - value) * f), fallen: false };
}
