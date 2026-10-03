import { CONTROL_DT, DECIMATION, DEFAULT_POSE, JOINT_NAMES, OBS_SIZE } from './constants.js';

// The same observation and position-target loop as the pinned Sandbox.
// Runtime dependencies are injected so fixed-step checks exercise this exact
// controller without a render loop, worker timer, or wardrobe state.
export async function createSimulation({ mujoco, ort, xml, meshes, policyUrl, onProgress = () => {} }) {
  let vfs, model, data, session;
  const dispose = async () => { data?.delete(); model?.delete(); vfs?.delete(); await session?.release(); };
  try {
    onProgress('compile');
    vfs = new mujoco.MjVFS();
    for (const { name, bytes } of meshes) vfs.addBuffer(name, new Uint8Array(bytes));
    model = mujoco.MjModel.from_xml_string(xml, vfs);
    data = new mujoco.MjData(model);
    if (model.nu !== 14 || model.nq !== 21) throw new Error('The walking policy requires the pinned 14-joint robot.');
    const read = (handle, field) => { const value = Number(handle[field]); handle.delete(); return value; };
    const qposAdr = JOINT_NAMES.map(name => read(model.jnt(name), 'qposadr'));
    const dofAdr = JOINT_NAMES.map(name => read(model.jnt(name), 'dofadr'));
    const gyroAdr = read(model.sensor('imu_ang_vel'), 'adr');
    const trunkId = read(model.body('trunk_base'), 'id');
    const standId = read(model.key('STAND'), 'id');
    onProgress('policy');
    session = await ort.InferenceSession.create(policyUrl, { executionProviders: ['wasm'] });
    const obs = new Float32Array(OBS_SIZE), lastAction = new Float32Array(14);
    let fallenFor = 0;

    function gravity() {
      const body = data.body(trunkId), q = body.xquat;
      const [w, x, y, z] = q;
      body.delete();
      // World -Z, rotated by the inverse trunk orientation (wxyz).
      return [2 * (w * y - x * z), -2 * (y * z + w * x), 2 * (x * x + y * y) - 1];
    }
    function snapshot() {
      const q = data.qpos;
      return { time: data.time, root: Array.from(q.slice(0, 7)), joints: qposAdr.map(i => q[i]),
        speed: Math.hypot(data.qvel[0], data.qvel[1]), fallen: fallenFor >= 0.2 };
    }
    function reset() {
      mujoco.mj_resetDataKeyframe(model, data, standId);
      mujoco.mj_forward(model, data);
      lastAction.fill(0); obs.fill(0); fallenFor = 0;
      return snapshot();
    }
    async function step({ forward = 0, turn = 0 } = {}) {
      if (!Number.isFinite(forward) || !Number.isFinite(turn)) throw new Error('Invalid movement command.');
      const q = data.qpos, velocity = data.qvel, sensors = data.sensordata;
      let i = 0;
      for (let a = 0; a < 3; a++) obs[i++] = sensors[gyroAdr + a];
      for (const g of gravity()) obs[i++] = g;
      for (let j = 0; j < 14; j++) obs[i++] = q[qposAdr[j]] - DEFAULT_POSE[j];
      for (let j = 0; j < 14; j++) obs[i++] = velocity[dofAdr[j]];
      obs.set(lastAction, i); i += 14;
      obs.fill(0, i);
      forward = Math.max(-1, Math.min(1, forward));
      obs[i] = forward * (forward >= 0 ? 0.25 : 0.2);
      obs[i + 2] = Math.max(-1, Math.min(1, turn));
      if (!obs.every(Number.isFinite)) throw new Error('The simulation produced an invalid observation. Reset to try again.');
      const input = new ort.Tensor('float32', obs, [1, OBS_SIZE]);
      let outputs;
      try {
        outputs = await session.run({ [session.inputNames[0]]: input });
        const actions = outputs[session.outputNames[0]].data;
        if (actions.length !== 14 || !Array.from(actions).every(Number.isFinite)) throw new Error('The walking policy produced invalid joint targets.');
        lastAction.set(actions);
        const ctrl = data.ctrl;
        for (let j = 0; j < 14; j++) ctrl[j] = DEFAULT_POSE[j] + actions[j];
      } finally {
        input.dispose();
        if (outputs) for (const output of Object.values(outputs)) output.dispose();
      }
      for (let s = 0; s < DECIMATION; s++) mujoco.mj_step(model, data);
      if (!Array.from(data.qpos).every(Number.isFinite) || !Array.from(data.qvel).every(Number.isFinite)) throw new Error('The simulation became unstable. Reset to try again.');
      fallenFor = gravity()[2] > -0.5 || data.qpos[2] < 0.02 ? fallenFor + CONTROL_DT : 0;
      return snapshot();
    }
    reset();
    return { step, reset, snapshot, dispose };
  } catch (error) { await dispose(); throw error; }
}
