// Activities consume simulated poses, never change physics or infer progress
// from rendered frames. Pausing and slower devices therefore stop the clock.
export function formatRaceTime(seconds) {
  const ticks = Math.round(seconds * 100);
  return `${String(Math.floor(ticks / 6000)).padStart(2, '0')}:${(ticks % 6000 / 100).toFixed(2).padStart(5, '0')}`;
}
function crossesGate(before, after, gate) {
  const signed = p => (p[0] - gate.pos[0]) * gate.normal[0] + (p[1] - gate.pos[1]) * gate.normal[1];
  const a = signed(before), b = signed(after);
  if (!(a < 0 && b >= 0)) return false;
  const t = -a / (b - a), x = before[0] + (after[0] - before[0]) * t - gate.pos[0];
  const y = before[1] + (after[1] - before[1]) * t - gate.pos[1];
  return Math.abs(x * -gate.normal[1] + y * gate.normal[0]) <= gate.width / 2;
}
export function createActivity(world, { record = null, onLap = () => {} } = {}) {
  let previous, started, elapsed, gate, laps, best, stamps, splits, samples, lastLap;
  function reset() { previous = null; started = null; elapsed = 0; gate = 0; laps = 0; best = record?.duration ?? null; stamps = new Set(); splits = []; samples = []; lastLap = null; }
  function sample(pose, force = false) {
    if (pose.root.length !== 7 || pose.joints?.length !== 14 || started === null || samples.length >= (force ? 6002 : 6001)) return;
    const time = pose.time - started;
    if (time > 1200 || !force && samples.length && time - samples.at(-1).time < .2) return;
    samples.push({ time, root: [...pose.root], joints: [...pose.joints] });
  }
  function update(pose) {
    if (previous && pose.time < previous.time) reset();
    if (pose.fallen && started !== null) { started = null; elapsed = 0; gate = 0; samples = []; splits = []; }
    if (!pose.fallen && !previous?.fallen && world.gates && previous && crossesGate(previous.root, pose.root, world.gates[gate])) {
      if (gate === 0) {
        if (started !== null) {
          const time = pose.time - started; sample(pose, true);
          const delta = best === null ? null : time - best;
          laps++; best = best === null ? time : Math.min(best, time);
          lastLap = { duration: time, splits: [...splits, time], lap: laps, finishedAt: pose.time, delta };
          if (samples.length > 1) {
            const completed = { revision: world.revision, ...lastLap, samples };
            if (!record || time < record.duration) record = completed;
            onLap(completed);
          }
        }
        started = pose.time;
        splits = []; samples = [];
      } else splits.push(pose.time - started);
      gate = (gate + 1) % world.gates.length;
    }
    if (started !== null) { elapsed = pose.time - started; sample(pose); }
    if (!pose.fallen) for (const stop of world.stops || []) {
      if (Math.hypot(pose.root[0] - stop.pos[0], pose.root[1] - stop.pos[1]) <= stop.radius) stamps.add(stop.id);
    }
    previous = { root: [...pose.root], time: pose.time, fallen: pose.fallen };
    return getState();
  }
  function getState() { return { started: started !== null, elapsed, nextGate: gate, laps, best, stamps: [...stamps], splits: [...splits], lastLap: lastLap ? { ...lastLap, splits: [...lastLap.splits] } : null }; }
  reset();
  return { update, reset, getState, clearRecord() { record = null; best = null; } };
}
