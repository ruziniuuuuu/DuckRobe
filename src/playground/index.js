import './style.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { loadRobot, robotAssetUrl } from '../robot.js';
import { normalizeSelection, selectedItemIds } from '../outfits.js';
import { t } from '../i18n.js';
import { dressSimulationRig, applySimulationPose } from './rig.js';
import { loadPhysicsAssets } from './model.js';
import { WORLDS, getWorld } from './worlds.js';
import { createEnvironment } from './environment.js';
import { createActivity, formatRaceTime } from './activity.js';
import { createInteractions } from './interactions.js';
import { createKeepsakes } from './keepsakes.js';
import { createReplay } from './replay.js';
import { createPhotography } from './photography.js';
import { nearestPhoto, portraitView, scenicView } from './framing.js';

function disposeTree(root) {
  const geometries = new Set(), materials = new Set();
  root?.traverse(node => {
    if (node.geometry) geometries.add(node.geometry);
    if (node.material) (Array.isArray(node.material) ? node.material : [node.material]).forEach(m => materials.add(m));
  });
  geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose());
}

export function createPlayground({ host, selection, colors, language, sourceRig, lookName = '', onExit, onWear, worldId = 'circuit' }) {
  const tr = (key, vars) => t(key, language, vars), chosen = normalizeSelection(selection);
  let selectedWorld = getWorld(worldId).id, overview = false, cameraMode = 'follow';
  const inputs = new AbortController(), keys = new Set(), pointers = new Map(), pulses = new Set();
  const directions = { KeyW: 'forward', ArrowUp: 'forward', KeyS: 'back', ArrowDown: 'back', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right' };
  let disposed = false, current, status = 'loading', follow = true, latestPose = null, stage = 'assets';
  let storage; try { storage = localStorage; } catch { /* In-memory keepsakes remain available. */ }
  const keepsakes = createKeepsakes(storage);
  host.innerHTML = `
    <div class="playground-view" data-playground-status="loading">
      <div class="playground-canvas" data-canvas></div>
      <header class="playground-header">
        <button class="playground-back" data-back>← <span>${tr('playgroundBack')}</span></button>
        <div class="playground-title"><span>DUCKROBE / ${tr('playgroundTitle')}</span><strong>${tr('playgroundTagline')}</strong></div>
        <label class="playground-world"><span>${tr('worldChoose')}</span><select data-world aria-label="${tr('worldChoose')}">${WORLDS.map(world => `<option value="${world.id}"${world.id === selectedWorld ? ' selected' : ''}>${tr(world.label)}</option>`).join('')}</select></label>
        <span class="playground-status" data-status role="status" aria-live="polite"></span>
      </header>
      <div class="playground-activity" data-activity hidden><strong data-activity-title></strong><span data-activity-detail></span><div class="playground-stamps" data-stamps></div><span data-race-splits></span><div class="playground-race-tools" data-race-tools hidden><button data-replay aria-pressed="false">${tr('raceReplay')}</button><button data-clear-record>${tr('raceClear')}</button></div></div>
      <div class="playground-tools"><button data-portrait aria-pressed="false" disabled>${tr('travelPortrait')}</button><button data-scenic aria-pressed="false" disabled>${tr('travelScenic')}</button><button data-photo disabled>${tr('travelTake')}</button><button data-album>${tr('travelAlbum')}</button></div>
      <div class="playground-interaction" data-interaction hidden><span data-interaction-hint></span><button data-interact disabled></button></div>
      <div class="playground-notice" data-notice role="status" aria-live="polite" hidden></div>
      <div class="playground-message" data-message role="status" aria-live="polite">
        <span class="playground-spark" aria-hidden="true">✳</span><h2 data-message-title></h2><p data-detail></p>
        <button data-recover hidden>${tr('retry')}</button>
      </div>
      <div class="playground-paused" data-paused hidden>${tr('playgroundPaused')}</div>
      <footer class="playground-footer">
        <div class="playground-controls">
          <button data-pause disabled>${tr('playgroundPause')}</button>
          <button data-reset disabled>${tr('playgroundReset')}</button>
          <button data-follow aria-pressed="true" disabled>${tr('playgroundFollow')}</button>
          <button data-overview aria-pressed="false" disabled>${tr('worldOverview')}</button>
        </div>
        <p class="playground-hint">${tr('playgroundHelp')}</p>
        <p class="playground-note">${tr('playgroundVisualOnly')}</p>
      </footer>
      <div class="playground-dpad" role="group" aria-label="${tr('playgroundSteer')}">
        <button data-direction="forward" aria-label="${tr('playgroundForward')}" disabled>↑</button>
        <button data-direction="left" aria-label="${tr('playgroundLeft')}" disabled>↶</button>
        <button data-direction="back" aria-label="${tr('playgroundBackward')}" disabled>↓</button>
        <button data-direction="right" aria-label="${tr('playgroundRight')}" disabled>↷</button>
      </div>
    </div>`;
  const find = selector => host.querySelector(selector), view = find('.playground-view');
  const on = (target, event, callback, options = {}) => target.addEventListener(event, callback, { ...options, signal: inputs.signal });
  const post = message => current?.worker?.postMessage(message);
  const photography = createPhotography({ view, tr, language, keepsakes, pause, onWear, snapshot: () => {
    if (!current?.rig || !['running', 'paused'].includes(status)) return null;
    const point = cameraMode === 'scenic' ? current.photoPoint : (current.world.photos || []).find(point => Math.hypot(latestPose.root[0] - point.pos[0], latestPose.root[1] - point.pos[1]) <= point.radius);
    const date = new Date(), interaction = current.interactions.getState(), activity = current.activity.getState();
    return { renderer: current.renderer, scene: current.scene, camera: current.camera, worldId: current.world.id,
      place: tr(point?.label || current.world.label), look: lookName || tr('mixName'), date: date.toLocaleDateString(language === 'zh' ? 'zh-CN' : 'en-GB'), isoDate: date.toISOString(),
      badge: activity.lastLap ? formatRaceTime(activity.lastLap.duration) : interaction.completed.includes('garden') ? 'BLOOM' : interaction.delivered.length === 3 ? 'AIR MAIL' : interaction.camera ? 'INSTANT' : '', personalCamera: interaction.camera, selection: chosen, colors: { ...colors } };
  } });
  function notice(message) {
    if (!current) return;
    clearTimeout(current.noticeTimer); find('[data-notice]').textContent = message; find('[data-notice]').hidden = false;
    current.noticeTimer = setTimeout(() => { if (!disposed) find('[data-notice]').hidden = true; }, 4500);
  }
  function movement() {
    const held = new Set([...keys].map(key => directions[key]).concat([...pointers.values()]));
    find('.playground-dpad').querySelectorAll('button').forEach(button => button.classList.toggle('held', held.has(button.dataset.direction)));
    post({ type: 'command', forward: status === 'running' ? Number(held.has('forward')) - Number(held.has('back')) : 0,
      turn: status === 'running' ? Number(held.has('left')) - Number(held.has('right')) : 0 });
  }
  function clearInputs() { keys.clear(); pointers.clear(); pulses.forEach(clearTimeout); pulses.clear(); movement(); }
  function setStatus(next, detail = '') {
    status = next; view.dataset.playgroundStatus = next;
    if (current) current.renderDirty = true;
    const loading = next === 'loading', error = next === 'error', fallen = next === 'fallen';
    find('[data-status]').textContent = tr({ loading: 'playgroundLoading', running: 'playgroundLive', paused: 'playgroundPaused', fallen: 'playgroundFallen', error: 'playgroundError' }[next]);
    find('[data-message]').hidden = !loading && !error && !fallen;
    find('[data-message-title]').textContent = tr(fallen ? 'playgroundFallen' : error ? 'playgroundError' : 'playgroundLoading');
    find('[data-detail]').textContent = detail || tr(fallen ? 'playgroundFallHelp' : `playgroundStage_${stage}`);
    find('[data-recover]').hidden = !error && !fallen;
    find('[data-recover]').textContent = tr(fallen ? 'playgroundReset' : 'retry');
    find('[data-paused]').hidden = next !== 'paused';
    find('[data-pause]').textContent = tr(next === 'paused' ? 'playgroundResume' : 'playgroundPause');
    find('[data-pause]').disabled = loading || error || fallen;
    find('[data-reset]').disabled = loading || error;
    find('[data-follow]').disabled = loading || error;
    find('[data-overview]').disabled = loading || error;
    find('[data-portrait]').disabled = loading || error;
    find('[data-scenic]').disabled = loading || error || !current?.world.photos?.length;
    find('[data-photo]').disabled = !['running', 'paused'].includes(next);
    find('[data-interact]').disabled = next !== 'running';
    find('.playground-dpad').querySelectorAll('button').forEach(button => { button.disabled = next !== 'running'; });
  }
  function pause() {
    if (status !== 'running') return;
    clearInputs(); post({ type: 'pause' }); setStatus('paused');
  }
  function resume() {
    if (status !== 'paused' || document.hidden || photography.open) return;
    clearInputs(); setStatus('running'); post({ type: 'resume' });
  }
  function reset() {
    if (!['running', 'paused', 'fallen'].includes(status)) return;
    photography.close(); current.interactions.reset(); clearInputs(); post({ type: 'reset' }); setStatus('paused');
  }
  function setFollow(value) {
    follow = value; overview = false; cameraMode = value ? 'follow' : 'free';
    view.dataset.camera = cameraMode;
    find('[data-follow]').setAttribute('aria-pressed', String(value)); find('[data-overview]').setAttribute('aria-pressed', 'false');
    for (const mode of ['portrait', 'scenic']) find(`[data-${mode}]`).setAttribute('aria-pressed', 'false');
  }
  function clean(attempt) {
    if (!attempt || attempt.cleaned) return;
    attempt.cleaned = true;
    attempt.abort.abort(); clearTimeout(attempt.timeout); clearTimeout(attempt.noticeTimer); attempt.worker?.terminate();
    cancelAnimationFrame(attempt.frame); attempt.observer?.disconnect(); attempt.controls?.dispose();
    attempt.replay?.dispose(); attempt.scenery?.dispose(); disposeTree(attempt.scene); attempt.environment?.dispose();
    attempt.renderer?.dispose(); attempt.renderer?.forceContextLoss(); attempt.renderer?.domElement.remove();
  }
  function fail(attempt, error) {
    if (disposed || current !== attempt || attempt.abort.signal.aborted) return;
    clearInputs(); clean(attempt); setStatus('error', `${tr('playgroundErrorHelp')} ${error?.message || error}`);
  }
  function syncPose(attempt, pose) {
    latestPose = pose;
    attempt.renderDirty = true;
    const activity = attempt.activity.update(pose);
    const nearby = attempt.interactions.nearby(pose), interaction = attempt.interactions.getState();
    find('[data-interaction]').hidden = !nearby;
    if (nearby) {
      const needsLetters = nearby.type === 'deliver' && !interaction.carrying;
      find('[data-interaction-hint]').textContent = tr(needsLetters ? 'harborNeedLetters' : nearby.label);
      find('[data-interact]').textContent = tr(nearby.type === 'water' ? interaction.wateringCan ? 'gardenPersonal' : 'gardenBorrow' : nearby.type === 'letters' ? 'harborCollect' : 'harborDeliver');
      find('[data-interact]').disabled = status !== 'running' || needsLetters;
    }
    if (pose.time < attempt.hudTime || pose.time - attempt.hudTime >= .1) {
      attempt.hudTime = pose.time;
      const harbor = attempt.world.id === 'harbor';
      find('[data-activity-title]').textContent = attempt.world.gates ? tr('circuitLap', { count: activity.laps + 1 }) : tr(harbor ? 'harborProgress' : 'parkPassport', { count: harbor ? interaction.delivered.length : activity.stamps.length });
      find('[data-activity-detail]').textContent = attempt.world.gates ? (activity.started
        ? `${formatRaceTime(activity.elapsed)} · ${tr('circuitGate', { count: activity.nextGate || 4 })}${activity.best === null ? '' : ` · ${tr('circuitBest', { time: formatRaceTime(activity.best) })}`}`
        : tr(pose.time < 3 ? 'raceReady' : 'raceGo', { count: Math.max(1, 3 - Math.floor(pose.time)) })) : harbor
          ? tr(interaction.delivered.length === 3 ? 'harborComplete' : interaction.carrying ? 'harborReady' : 'harborNeedLetters')
          : tr(activity.stamps.length === 4 ? 'parkComplete' : 'parkVisit');
      const splits = activity.lastLap?.splits || activity.splits;
      find('[data-race-splits]').textContent = splits.length ? tr('raceSplits', { times: splits.map((split, i) => formatRaceTime(split - (splits[i - 1] || 0))).join(' / ') }) : '';
      if (!activity.started && attempt.record) find('[data-race-splits]').textContent = tr('raceRecord', { time: formatRaceTime(attempt.record.duration) });
      find('[data-stamps]').querySelectorAll('[data-stop]').forEach(stamp => {
        const collected = (harbor ? interaction.delivered : activity.stamps).includes(stamp.dataset.stop), stop = (harbor ? attempt.world.interactions : attempt.world.stops).find(stop => stop.id === stamp.dataset.stop);
        stamp.classList.toggle('collected', collected); stamp.textContent = `${collected ? '✓ ' : ''}${tr(stop.label)}`;
      });
    }
    if (!attempt.rig) return;
    applySimulationPose(attempt.rig, pose);
  }
  function applyShot(attempt) {
    if (!latestPose || !attempt?.controls) return;
    const shot = cameraMode === 'scenic' ? scenicView(attempt.world, latestPose, attempt.camera.aspect, attempt.photoPoint, attempt.portraitSize) : portraitView(latestPose, attempt.camera.aspect, attempt.portraitSize);
    if (attempt.camera.fov !== shot.fov) { attempt.camera.fov = shot.fov; attempt.camera.updateProjectionMatrix(); }
    attempt.controls.target.copy(shot.target); attempt.camera.position.copy(shot.position);
  }
  function frameShot(mode) {
    if (!current?.controls || !latestPose) return;
    setFollow(false); cameraMode = mode; current.photoPoint = nearestPhoto(current.world, latestPose);
    view.dataset.camera = mode;
    if (current.rig) {
      const bounds = new THREE.Box3().setFromObject(current.rig.group), center = new THREE.Vector3(latestPose.root[0], latestPose.root[2] + .055, -latestPose.root[1]);
      const extent = ['x', 'y', 'z'].map(axis => Math.max(Math.abs(bounds.min[axis] - center[axis]), Math.abs(bounds.max[axis] - center[axis])));
      current.portraitSize = Math.max(.28, 2 * Math.hypot(...extent));
    }
    find(`[data-${mode}]`).setAttribute('aria-pressed', 'true'); applyShot(current); current.controls.update();
  }
  function showOverview(attempt) {
    if (!attempt?.controls) return;
    const { camera, controls, world } = attempt;
    camera.fov = world.id === 'park' ? 48 : 40; camera.updateProjectionMatrix();
    const distance = Math.max(world.bounds[0] * 2 / camera.aspect, world.bounds[1] * 2) * (world.overview?.scale || 1.8)
      * Math.tan(THREE.MathUtils.degToRad(20)) / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const aim = world.overview?.target || [0, 0, .2], axis = world.overview?.direction || [.5, -1.55, .95];
    controls.target.set(aim[0], aim[2], -aim[1]);
    const direction = new THREE.Vector3(axis[0], axis[2], -axis[1]);
    camera.position.copy(controls.target).add(direction.normalize().multiplyScalar(distance));
    setFollow(false); overview = true; cameraMode = 'overview'; view.dataset.camera = cameraMode; find('[data-overview]').setAttribute('aria-pressed', 'true'); controls.update();
  }
  function resetCamera(attempt, wide = attempt.world.id === 'circuit') {
    if (wide) { showOverview(attempt); return; }
    const p = latestPose?.root || attempt.world.spawn;
    attempt.camera.fov = attempt.world.id === 'park' ? 48 : 40; attempt.camera.updateProjectionMatrix();
    attempt.controls.target.set(p[0], p[2] + (attempt.world.id === 'park' ? .38 : 0), -p[1]);
    attempt.camera.position.copy(attempt.controls.target).add(attempt.world.id === 'park' ? new THREE.Vector3(.30, .12, 1.62) : new THREE.Vector3(.62, .29, .8));
    setFollow(true); attempt.controls.update();
  }
  async function boot() {
    photography.close(); clean(current); latestPose = null; clearInputs(); stage = 'assets'; setStatus('loading');
    find('[data-notice]').hidden = true; find('[data-interaction]').hidden = true;
    const world = getWorld(selectedWorld), record = world.gates ? keepsakes.record(world) : null;
    const attempt = { abort: new AbortController(), world, record, interactions: createInteractions(world, chosen), replayEnabled: false, hudTime: -Infinity }; current = attempt;
    attempt.activity = createActivity(world, { record, onLap: lap => {
      const saved = keepsakes.saveRace(world, lap); attempt.record = keepsakes.record(world);
      find('[data-replay]').disabled = !attempt.record; find('[data-clear-record]').disabled = !attempt.record;
      notice(`${tr('raceFinish', { time: formatRaceTime(lap.duration) })}${saved ? '' : ` · ${tr('travelStorage')}`}`);
    } });
    view.dataset.world = world.id; find('[data-activity]').hidden = !world.gates && !world.stops && !world.interactions;
    find('[data-race-tools]').hidden = !world.gates; find('[data-replay]').setAttribute('aria-pressed', 'false'); find('[data-replay]').disabled = !record; find('[data-clear-record]').disabled = !record;
    find('[data-race-splits]').textContent = '';
    find('[data-activity-title]').textContent = ''; find('[data-activity-detail]').textContent = '';
    find('[data-stamps]').innerHTML = (world.stops || world.interactions?.filter(point => point.type === 'deliver') || []).map(stop => `<span data-stop="${stop.id}">${tr(stop.label)}</span>`).join('');
    const alive = () => !disposed && current === attempt && !attempt.abort.signal.aborted;
    attempt.timeout = setTimeout(() => fail(attempt, new Error(tr('playgroundTimeout'))), 60000);
    try {
      const baseUrl = new URL(robotAssetUrl('/playground/'), location.href).href;
      const model = await loadPhysicsAssets(baseUrl, attempt.abort.signal, world);
      if (!alive()) return;
      const workerPromise = (async () => {
        const worker = new Worker(new URL('./physics.worker.js', import.meta.url), { type: 'module' }); attempt.worker = worker;
        await new Promise((resolve, reject) => {
          attempt.abort.signal.addEventListener('abort', () => reject(new DOMException('Playground closed', 'AbortError')), { once: true });
          worker.onerror = event => { event.preventDefault(); const error = new Error(event.message || tr('playgroundError')); reject(error); fail(attempt, error); };
          worker.onmessage = ({ data }) => {
            if (!alive()) return;
            if (data.type === 'progress') { stage = data.stage; setStatus('loading'); }
            else if (data.type === 'ready') { syncPose(attempt, data.pose); resolve(); }
            else if (data.type === 'pose') syncPose(attempt, data.pose);
            else if (data.type === 'fallen') { clearInputs(); setStatus('fallen'); }
            else if (data.type === 'reset') { resetCamera(attempt); if (!document.hidden) resume(); }
            else if (data.type === 'error') { const error = new Error(data.message); reject(error); fail(attempt, error); }
          };
          worker.postMessage({ type: 'init', ...model, policyUrl: new URL('walking.onnx', baseUrl).href }, model.meshes.map(mesh => mesh.bytes));
        });
      })();
      // Runtime initialization overlaps the GPU/environment and visual rig.
      // Observe failures even if graphics setup throws before Promise.all.
      workerPromise.catch(() => {});
      const atmosphere = world.atmosphere;
      const scene = new THREE.Scene(); attempt.scene = scene; scene.background = new THREE.Color(atmosphere?.horizon || 0x08080c);
      if (atmosphere) scene.fog = new THREE.Fog(atmosphere.fog, 18, 48);
      const renderer = new THREE.WebGLRenderer({ antialias: true }); attempt.renderer = renderer;
      renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = atmosphere?.exposure || 1;
      renderer.shadowMap.enabled = world.id !== 'arena'; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.shadowMap.autoUpdate = false; renderer.shadowMap.needsUpdate = true;
      renderer.domElement.setAttribute('role', 'img'); renderer.domElement.setAttribute('aria-label', tr('playgroundCanvas'));
      find('[data-canvas]').append(renderer.domElement);
      renderer.domElement.addEventListener('webglcontextlost', event => { event.preventDefault(); fail(attempt, new Error(tr('playgroundGraphicsError'))); }, { signal: attempt.abort.signal });
      attempt.scenery = createEnvironment(world); scene.add(attempt.scenery.group);
      const pmrem = new THREE.PMREMGenerator(renderer), room = atmosphere ? new THREE.Scene() : new RoomEnvironment();
      if (atmosphere) { const sky = new THREE.Group(); sky.rotation.x = -Math.PI / 2; sky.add(attempt.scenery.sky.clone()); room.add(sky); }
      attempt.environment = pmrem.fromScene(room); scene.environment = attempt.environment.texture; scene.environmentIntensity = atmosphere ? .55 : .45;
      if (!atmosphere) room.dispose(); pmrem.dispose();
      scene.add(new THREE.AmbientLight(0xffffff, world.id === 'arena' ? .6 : .14));
      if (atmosphere) scene.add(new THREE.HemisphereLight(atmosphere.sky, atmosphere.ground, .65));
      for (const [color, power, position] of [[0xffffff, 1.6, [2, 4, 2]], [0xffffff, .4, [-2, 2, 1.5]], [0xffb366, .7, [0, 3, -2]]]) {
        const light = new THREE.DirectionalLight(color, power); light.position.fromArray(position); scene.add(light);
        if (world.id !== 'arena' && power !== 1.6) light.intensity *= .45;
        if (world.id !== 'arena' && power === 1.6) {
          light.color.setHex(atmosphere.sun); light.intensity = atmosphere.power; light.position.set(-3, 6, 4); light.castShadow = true; light.shadow.mapSize.set(2048, 2048);
          Object.assign(light.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4, near: .1, far: 15 });
          light.shadow.bias = -.00015; light.shadow.normalBias = .003;
        }
      }
      const camera = new THREE.PerspectiveCamera(world.id === 'park' ? 48 : 40, 1, .01, world.id === 'arena' ? 40 : 60); attempt.camera = camera;
      const controls = new OrbitControls(camera, renderer.domElement); attempt.controls = controls;
      controls.enableDamping = true; controls.enablePan = false; controls.minDistance = .35; controls.maxDistance = world.id === 'arena' ? 6 : 40;
      controls.maxPolarAngle = Math.PI / 2 - .025;
      controls.addEventListener('start', () => setFollow(false));
      controls.addEventListener('change', () => { attempt.renderDirty = true; });
      resetCamera(attempt);
      const resize = () => {
        const { width, height } = find('[data-canvas]').getBoundingClientRect();
        if (!width || !height) return;
        renderer.setSize(width, height); camera.aspect = width / height; camera.updateProjectionMatrix();
        attempt.renderDirty = true;
        if (overview) showOverview(attempt);
        else if (['portrait', 'scenic'].includes(cameraMode)) applyShot(attempt);
      };
      attempt.observer = new ResizeObserver(resize); attempt.observer.observe(find('[data-canvas]')); resize();
      const target = new THREE.Vector3(), delta = new THREE.Vector3();
      let previousFrame = performance.now();
      function frame() {
        if (!alive()) return;
        attempt.frame = requestAnimationFrame(frame);
        if (document.hidden) return;
        const now = performance.now(), elapsed = Math.min((now - previousFrame) / 1000, .25); previousFrame = now;
        if (latestPose) {
          const p = latestPose.root; target.set(p[0], p[2] + (world.id === 'park' ? .38 : 0), -p[1]);
          if (follow) { delta.copy(target).sub(controls.target).multiplyScalar(1 - Math.exp(-12 * elapsed)); controls.target.add(delta); camera.position.add(delta); }
          else if (['portrait', 'scenic'].includes(cameraMode)) applyShot(attempt);
          if (attempt.shadowTime !== latestPose.time) { renderer.shadowMap.needsUpdate = true; attempt.shadowTime = latestPose.time; }
          const activity = attempt.activity.getState();
          attempt.scenery.update(latestPose, target, activity, attempt.interactions.getState());
          if (attempt.wateringCan) {
            const waterTime = latestPose.time - (attempt.interactions.getState().wateredAt ?? -Infinity);
            const tilt = !attempt.reducedMotion && waterTime >= 0 && waterTime < 2 ? Math.sin(waterTime * Math.PI / 2) * .4 : 0;
            attempt.wateringCan.node.quaternion.copy(attempt.wateringCan.base).multiply(attempt.waterRotation.setFromAxisAngle(attempt.waterAxis, tilt));
          }
          attempt.replay?.update(attempt.record, activity.started ? activity.elapsed : -1, attempt.replayEnabled);
        }
        // Match the usual 0.05 damping at 60 Hz without making an orbit take
        // minutes to settle on a slow renderer. Physics time is independent.
        controls.dampingFactor = 1 - Math.pow(.95, elapsed * 60);
        const cameraChanged = controls.update();
        // Paused/fallen scenes need drawing only after a pose, camera or size
        // change. Keep initialization warm and walking animated as before.
        if (!['loading', 'running'].includes(status) && !cameraChanged && !attempt.renderDirty) return;
        renderer.render(scene, camera); attempt.renderDirty = false;
      }
      // Warm the render pipeline while the independent runtimes initialize.
      frame();
      const rigPromise = loadRobot({ colors, signal: attempt.abort.signal, sourceRig }).then(rig => {
        if (!alive()) { disposeTree(rig.group); return; }
        attempt.rig = rig;
        attempt.renderDirty = true;
        scene.add(dressSimulationRig(rig, chosen));
        renderer.shadowMap.needsUpdate = true;
        rig.group.traverse(node => { if (node.userData.kind === 'watering') attempt.wateringCan = { node, base: node.quaternion.clone() }; });
        attempt.waterRotation = new THREE.Quaternion(); attempt.waterAxis = new THREE.Vector3(0, 1, 0); attempt.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (world.gates) { attempt.replay = createReplay(rig); scene.add(attempt.replay.group); }
        if (latestPose) syncPose(attempt, latestPose);
      });
      await Promise.all([rigPromise, workerPromise]);
      if (!alive()) return;
      clearTimeout(attempt.timeout); resetCamera(attempt); setStatus('paused'); resume();
    } catch (error) { if (alive()) fail(attempt, error); }
  }

  on(find('[data-back]'), 'click', onExit);
  on(find('[data-pause]'), 'click', () => status === 'paused' ? resume() : pause());
  on(find('[data-reset]'), 'click', reset);
  on(find('[data-follow]'), 'click', () => follow ? setFollow(false) : resetCamera(current, false));
  on(find('[data-overview]'), 'click', () => showOverview(current));
  on(find('[data-portrait]'), 'click', () => frameShot('portrait'));
  on(find('[data-scenic]'), 'click', () => frameShot('scenic'));
  on(find('[data-photo]'), 'click', () => photography.take());
  on(find('[data-album]'), 'click', () => photography.album());
  on(find('[data-replay]'), 'click', () => { if (!current?.record) return; current.replayEnabled = !current.replayEnabled; current.renderDirty = true; find('[data-replay]').setAttribute('aria-pressed', String(current.replayEnabled)); });
  on(find('[data-clear-record]'), 'click', () => {
    if (!current?.world.gates) return;
    const saved = keepsakes.clearRace(current.world); current.record = null; current.activity.clearRecord(); current.replayEnabled = false;
    current.renderDirty = true;
    find('[data-replay]').disabled = true; find('[data-clear-record]').disabled = true; find('[data-replay]').setAttribute('aria-pressed', 'false');
    notice(tr(saved ? 'raceRecordCleared' : 'travelStorage'));
  });
  on(find('[data-interact]'), 'click', () => {
    if (status !== 'running') return;
    clearInputs(); const action = current.interactions.perform(latestPose); if (!action) return;
    current.renderer.shadowMap.needsUpdate = true;
    notice(tr(action.type === 'water' ? 'gardenDone' : action.type === 'letters' ? 'harborCollected' : 'harborDelivered'));
    current.hudTime = -Infinity; syncPose(current, latestPose);
  });
  on(find('select[data-world]'), 'change', event => { selectedWorld = event.target.value; void boot(); });
  on(find('[data-recover]'), 'click', () => status === 'fallen' ? reset() : void boot());
  on(window, 'keydown', event => {
    if (photography.open) return;
    if (directions[event.code]) {
      if (event.target instanceof HTMLSelectElement) return;
      event.preventDefault();
      if (event.repeat && !keys.has(event.code)) return;
      if (status === 'running') { keys.add(event.code); movement(); }
    } else if (event.code === 'Tab') {
      const buttons = [...host.querySelectorAll('button:not(:disabled), select:not(:disabled)')].filter(button => !button.hidden && button.getClientRects().length);
      const first = buttons[0], last = buttons.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
  });
  on(window, 'keyup', event => { if (directions[event.code]) { event.preventDefault(); keys.delete(event.code); movement(); } });
  find('.playground-dpad').querySelectorAll('button').forEach(button => {
    on(button, 'pointerdown', event => {
      if (status !== 'running') return;
      event.preventDefault(); button.setPointerCapture(event.pointerId); pointers.set(event.pointerId, button.dataset.direction); movement();
    });
    for (const eventName of ['pointerup', 'pointercancel', 'lostpointercapture']) on(button, eventName, event => { pointers.delete(event.pointerId); movement(); });
    // Keyboard and assistive-technology activation gives a short movement pulse.
    on(button, 'click', event => {
      if (event.detail !== 0 || status !== 'running') return;
      const key = Symbol(); pointers.set(key, button.dataset.direction); movement();
      const timer = setTimeout(() => { pulses.delete(timer); pointers.delete(key); if (!disposed) movement(); }, 200);
      pulses.add(timer);
    });
  });
  on(window, 'blur', clearInputs);
  on(document, 'visibilitychange', () => { if (document.hidden) { clearInputs(); pause(); } });
  setStatus('loading'); find('[data-back]').focus(); void boot();
  return {
    pause, resume, reset,
    get rig() { return current?.rig; },
    getState: () => ({ status, pose: latestPose, following: follow, worldId: selectedWorld, camera: current?.camera ? { mode: cameraMode, position: current.camera.position.toArray(), target: current.controls.target.toArray(), fov: current.camera.fov, place: cameraMode === 'scenic' ? current.photoPoint?.id : null } : null, activity: current?.activity.getState(), interactions: current?.interactions.getState(), replayEnabled: current?.replayEnabled,
      record: current?.record ? { duration: current.record.duration, splits: [...current.record.splits] } : null, photos: keepsakes.photoCount(), selection: structuredClone(chosen), colors: { ...colors }, itemIds: selectedItemIds(chosen) }),
    dispose() { if (disposed) return; disposed = true; photography.dispose(); inputs.abort(); clearInputs(); clean(current); current = null; host.replaceChildren(); },
  };
}
