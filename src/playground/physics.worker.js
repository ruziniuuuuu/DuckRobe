import mujocoWasmUrl from '@mujoco/mujoco/mujoco.wasm?url';
import ortWasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url';
import { createSimulation } from './simulation.js';
import { CONTROL_DT } from './constants.js';

let simulation, paused = true, command = {}, timer, busy = false, resetPending = false;
const send = (type, payload = {}) => postMessage({ type, ...payload });
const fail = error => { paused = true; clearTimeout(timer); send('error', { message: error?.message || String(error) }); };

async function tick() {
  if (!simulation || busy || paused) return;
  busy = true;
  const start = performance.now();
  try {
    let pose = await simulation.step(command);
    // A reset received during asynchronous inference takes effect only once
    // the old step has completed, never half-way through an observation.
    const didReset = resetPending;
    if (didReset) { pose = simulation.reset(); resetPending = false; paused = true; }
    if (pose.fallen) { paused = true; command = {}; send('fallen'); }
    send('pose', { pose });
    if (didReset) send('reset');
  } catch (error) { fail(error); }
  finally {
    busy = false;
    if (!paused) timer = setTimeout(tick, Math.max(0, CONTROL_DT * 1000 - (performance.now() - start)));
  }
}

self.onmessage = async ({ data }) => {
  try {
    if (data.type === 'init') {
      send('progress', { stage: 'runtime' });
      const [{ default: loadMujoco }, ort] = await Promise.all([import('@mujoco/mujoco'), import('onnxruntime-web/wasm')]);
      ort.env.wasm.numThreads = 1;
      ort.env.wasm.wasmPaths = { wasm: new URL(ortWasmUrl, self.location.href).href };
      const mujoco = await loadMujoco({ locateFile: p => p.endsWith('.wasm') ? new URL(mujocoWasmUrl, self.location.href).href : p });
      simulation = await createSimulation({ mujoco, ort, ...data, onProgress: stage => send('progress', { stage }) });
      send('ready', { pose: simulation.snapshot() });
    } else if (data.type === 'command') command = { forward: data.forward, turn: data.turn };
    else if (data.type === 'pause') { paused = true; command = {}; clearTimeout(timer); }
    else if (data.type === 'resume' && simulation) { paused = false; clearTimeout(timer); void tick(); }
    else if (data.type === 'reset' && simulation) {
      paused = true; command = {}; clearTimeout(timer);
      if (busy) resetPending = true;
      else { send('pose', { pose: simulation.reset() }); send('reset'); }
    }
  } catch (error) { fail(error); }
};
