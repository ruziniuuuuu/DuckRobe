import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

// Development-only instrumentation: production code needs no profiling hooks.
// SwiftShader makes runs reproducible here; its FPS is not a native GPU result.
const label = process.argv[2] || 'local';
assert.match(label, /^[a-z\d_-]+$/i, 'Use a simple filename label');
const appUrl = process.env.DUCKROBE_URL || 'http://127.0.0.1:5173/';
const output = path.resolve(process.env.DUCKROBE_QA_OUTPUT || 'test-results/playground-performance');
await mkdir(output, { recursive: true });
const gpu = process.env.DUCKROBE_QA_GPU || 'swiftshader';
const gpuArgs = gpu === 'metal' ? ['--use-angle=metal'] : gpu === 'vulkan' ? ['--enable-gpu', '--use-angle=vulkan'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', ...gpuArgs] });
const results = [];
const replace = (body, before, after) => {
  assert(body.includes(before), 'Profiler requires the current Vite development source');
  return body.replace(before, after);
};
try {
  for (const dpr of [1, 2]) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: dpr });
    await context.addInitScript(() => {
      window.__profile = { events: [], poses: [], frames: [], renders: [], workerStepMs: [] };
      document.addEventListener('click', event => {
        if (event.target.closest?.('#open-playground')) window.__profile.openAt = performance.now();
      }, true);
      const NativeWorker = Worker;
      window.Worker = class extends NativeWorker {
        constructor(...args) {
          super(...args);
          this.addEventListener('message', ({ data }) => {
            const now = performance.now();
            if (data.type === 'ready') window.__profile.readyAt = now;
            if (data.type !== 'pose') window.__profile.events.push({ type: data.type, stage: data.stage, at: now });
            if (data.pose) window.__profile.poses.push({ at: now, time: data.pose.time });
            if (data.__stepMs !== undefined) window.__profile.workerStepMs.push(data.__stepMs);
          });
        }
      };
      const tick = time => { window.__profile.frames.push(time); requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    });
    try {
      const page = await context.newPage(), errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.route('**/src/playground/index.js*', async route => {
        const response = await route.fetch();
        const body = replace(await response.text(), 'renderer.render(scene, camera);',
          'const profileRenderStart = performance.now(); renderer.render(scene, camera); window.__profile.renders.push({ at: performance.now(), ms: performance.now() - profileRenderStart, triangles: renderer.info.render.triangles, calls: renderer.info.render.calls, pixels: renderer.domElement.width * renderer.domElement.height });');
        await route.fulfill({ response, body });
      });
      await page.route('**/src/playground/physics.worker.js*', async route => {
        const response = await route.fetch();
        let body = replace(await response.text(), 'let pose = await simulation.step(command);',
          'const profileStepStart = performance.now(); let pose = await simulation.step(command); const __stepMs = performance.now() - profileStepStart;');
        body = replace(body, "send('pose', { pose });", "send('pose', { pose, __stepMs });");
        await route.fulfill({ response, body });
      });
      await page.goto(appUrl);
      await page.waitForFunction(() => window.duckrobe?.ready, null, { timeout: 90000 });
      for (const visit of ['first', 'repeat']) {
        await page.evaluate(() => {
          const p = window.__profile;
          p.events = []; p.poses = []; p.frames = []; p.renders = []; p.workerStepMs = []; p.openAt = undefined; p.readyAt = undefined;
        });
        await page.locator('#open-playground').click();
        await page.waitForFunction(() => window.duckrobe?.playground?.getState().status === 'running', null, { timeout: 90000 });
        const readyAt = await page.evaluate(() => performance.now());
        await page.keyboard.down('w'); await page.waitForTimeout(8000); await page.keyboard.up('w');
        const result = await page.evaluate(({ dpr, visit, readyAt }) => {
          const p = window.__profile;
          const poses = p.poses.filter(pose => pose.at >= readyAt + 1000);
          const frames = p.frames.filter(at => at >= readyAt + 1000);
          const renders = p.renders.filter(render => render.at >= readyAt + 1000);
          const average = values => values.reduce((a, b) => a + b, 0) / Math.max(1, values.length);
          const percentile = values => [...values].sort((a, b) => a - b)[Math.floor((values.length - 1) * .95)];
          const gl = document.querySelector('.playground-canvas canvas').getContext('webgl2');
          const debug = gl.getExtension('WEBGL_debug_renderer_info');
          return {
            dpr, visit, startupMs: p.readyAt - p.openAt,
            renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
            stages: p.events.map(event => ({ ...event, at: event.at - p.openAt })),
            fps: (frames.length - 1) / ((frames.at(-1) - frames[0]) / 1000),
            realtimeFactor: (poses.at(-1).time - poses[0].time) / ((poses.at(-1).at - poses[0].at) / 1000),
            meanWorkerStepMs: average(p.workerStepMs), p95WorkerStepMs: percentile(p.workerStepMs),
            meanRenderSubmitMs: average(renders.map(render => render.ms)), p95RenderSubmitMs: percentile(renders.map(render => render.ms)),
            triangles: renders.at(-1)?.triangles, drawCalls: renders.at(-1)?.calls, pixels: renders.at(-1)?.pixels,
          };
        }, { dpr, visit, readyAt });
        assert(result.triangles > 0 && result.meanWorkerStepMs > 0, 'Missing profiling instrumentation');
        assert.deepEqual(errors, [], 'Unhandled browser errors');
        results.push(result); console.log(JSON.stringify(result));
        await page.locator('[data-back]').click();
      }
    } finally { await context.close(); }
  }
} finally { await browser.close(); }
await writeFile(path.join(output, `${label}.json`), JSON.stringify({ label, appUrl, startupMeasurement: 'Click event to worker ready', renderer: `Chromium ${gpu}`, results }, null, 2));
