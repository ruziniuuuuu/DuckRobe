import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { build, createServer as createViteServer } from 'vite';
import { chromium } from 'playwright';
import { getWorld } from '../src/playground/worlds.js';
import { checkAdventures, checkAlbumRestore } from './adventure-ui.mjs';

// Exercise real production chunks and WASM under strict static hosting:
// requests outside the selected base receive 404, never an SPA fallback.
async function revealControl(selector, target) {
  let panel;
  if (/data-language|#about-button|#export-look|#repository-link/.test(selector)) panel = 'app-more';
  else if (/data-theme|#filter-favorites/.test(selector)) panel = 'collection-filter';
  else if (/data-remove-item|#clear-look/.test(selector)) panel = 'wearing-panel';
  if (panel && !await target.locator('#' + panel).evaluate(el => el.open)) await target.locator('#' + panel + ' > summary').click();
  await target.locator(selector).click();
}
const output = path.resolve(process.env.DUCKROBE_QA_OUTPUT || 'test-results');
await mkdir(output, { recursive: true });
const temporary = await mkdtemp(path.join(tmpdir(), 'duckrobe-playground-'));
const gpuArgs = process.env.DUCKROBE_QA_GPU === 'metal' ? ['--use-angle=metal']
  : process.env.DUCKROBE_QA_GPU === 'vulkan' ? ['--enable-gpu', '--use-angle=vulkan']
  : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', ...gpuArgs] });
const results = [];
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
async function check(name, action) { await action(); console.log(`PASS ${name}`); results.push(name); }

try {
  for (const base of ['/', '/DuckRobe/']) {
    const dist = path.join(temporary, base === '/' ? 'root' : 'pages');
    await build({ base, logLevel: 'error', build: { outDir: dist, emptyOutDir: true } });
    const server = createServer(async (req, res) => {
      const pathname = new URL(req.url, 'http://localhost').pathname;
      const filename = path.resolve(dist, `.${pathname.slice(base.length - 1) === '/' ? '/index.html' : pathname.slice(base.length - 1)}`);
      if (!pathname.startsWith(base) || !filename.startsWith(dist + path.sep)) { res.writeHead(404).end(); return; }
      try { res.writeHead(200, { 'Content-Type': mime[path.extname(filename)] || 'application/octet-stream' }); res.end(await readFile(filename)); }
      catch { res.writeHead(404).end(); }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, hasTouch: true });
    await context.addInitScript(() => {
      // Instrument the browser boundary, without adding hooks to production.
      window.__playgroundDraws = 0;
      for (const prototype of [WebGLRenderingContext.prototype, WebGL2RenderingContext.prototype]) {
        const draw = prototype.drawElements;
        prototype.drawElements = function(...args) {
          if (this.canvas.parentElement?.classList.contains('playground-canvas')) window.__playgroundDraws++;
          return draw.apply(this, args);
        };
      }
      window.__workers = { active: 0, created: 0, messages: [], instances: [], resets: 0 };
      const NativeWorker = window.Worker;
      window.Worker = class extends NativeWorker {
        constructor(...args) {
          super(...args); window.__workers.active++; window.__workers.created++; window.__workers.instances.push(this);
          this.addEventListener('message', ({ data }) => {
            if (data.pose) this.lastPose = data.pose;
            if (data.type === 'reset') { window.__workers.resets++; window.__workers.lastReset = this.lastPose; }
          });
        }
        postMessage(message, ...args) { window.__workers.messages.push(structuredClone({ ...message, meshes: undefined, xml: undefined })); super.postMessage(message, ...args); }
        terminate() { if (!this.stopped) { this.stopped = true; window.__workers.active--; } return super.terminate(); }
      };
    });
    const page = await context.newPage(), errors = [], requests = [];
    // Software-rendered scenery readback can outlast the interaction timeout.
    // Keep behavioral waits unchanged, matching wardrobe screenshot allowances.
    const snapshot = options => page.screenshot({ ...options, timeout: 90000 });
    page.setDefaultTimeout(45000);
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => requests.push(request.url()));
    const appUrl = `http://127.0.0.1:${server.address().port}${base}`;
    const state = () => page.evaluate(() => window.duckrobe.playground.getState());
    const status = value => page.waitForFunction(value => document.querySelector('.playground-view')?.dataset.playgroundStatus === value, value, { timeout: 65000 });
    const enter = async () => { await page.locator('#open-playground').click(); await status('running'); };
    const exit = async () => { await page.locator('[data-back]').click(); assert.equal(await page.locator('#playground-dialog').getAttribute('open'), null); assert.equal(await page.evaluate(() => window.__workers.active), 0); };
    const advance = async duration => { const start = (await state()).pose.time; await page.waitForFunction(time => window.duckrobe.playground.getState().pose.time >= time, start + duration); };
    const chooseWorld = async id => { await page.locator('select[data-world]').selectOption(id); await status('running'); assert.equal((await state()).worldId, id); };
    try {
      await page.goto(appUrl); await page.waitForFunction(() => window.duckrobe?.ready);
      await check(`${base} simulation stays lazy in the wardrobe`, async () => {
        assert(!requests.some(url => /playground\/|\.wasm|walking\.onnx|physics\.worker/.test(url)));
        assert.equal(await page.evaluate(() => window.__workers.created), 0);
      });
      await page.evaluate(() => {
        const app = window.duckrobe; app.selectLook(app.OUTFITS[0].id);
        for (const region of ['chest', 'side', 'back']) app.selectItem(app.ITEMS.find(item => item.region === region).id);
        for (const [id, color] of [['shell-color', '#abcdef'], ['accent-color', '#654321']]) {
          const input = document.getElementById(id); input.value = color; input.dispatchEvent(new Event('input', { bubbles: true }));
        }
      });
      await page.locator('#moves-panel > summary').click();
      await page.locator('#motion-toggle').click();
      await page.locator('#slot-controls [data-slot="accessory"]').click();
      await page.locator('[data-accessory-region="chest"]').click();
      await page.locator('#catalog-scroll').evaluate(el => { el.scrollTop = 160; });
      await page.locator('#open-playground').scrollIntoViewIfNeeded();
      const before = await page.evaluate(() => ({ state: structuredClone(window.duckrobe.state), scroll: document.querySelector('#catalog-scroll').scrollTop, y: scrollY }));
      await enter();
      await check(`${base} real WASM worker, clothing snapshot, focus containment and suspended wardrobe`, async () => {
        assert.equal(await page.evaluate(() => window.__workers.active), 1);
        assert.equal(await page.evaluate(() => crossOriginIsolated), false);
        const current = await state(); assert.deepEqual(current.selection, before.state.selection); assert.deepEqual(current.colors, before.state.colors);
        assert.equal(await page.locator('.playground-canvas canvas').count(), 1);
        const frozen = await page.evaluate(() => ({ frame: window.duckrobe.preview.renderer.info.render.frame, cache: window.duckrobe.thumbnails.size }));
        await advance(.3);
        assert.deepEqual(await page.evaluate(() => ({ frame: window.duckrobe.preview.renderer.info.render.frame, cache: window.duckrobe.thumbnails.size })), frozen);
        await page.locator('[data-back]').focus(); await page.keyboard.press('Shift+Tab');
        assert.equal(await page.evaluate(() => document.activeElement.dataset.direction), 'right');
        await page.keyboard.press('Tab'); assert(await page.locator('[data-back]').evaluate(el => el === document.activeElement));
        assert(requests.filter(url => /\.wasm|playground\//.test(url)).every(url => new URL(url).pathname.startsWith(base)));
        assert(requests.some(url => url.endsWith('walking.onnx')));
      });
      await check(`${base} keyboard translation, turning, release and blur`, async () => {
        const start = (await state()).pose;
        await page.keyboard.down('w'); await advance(2); await page.keyboard.up('w');
        assert((await state()).pose.root[0] - start.root[0] > .08);
        await page.keyboard.down('a'); await advance(1); await page.keyboard.up('a');
        const end = (await state()).pose; assert(Math.abs(end.root[6] - start.root[6]) > .1);
        await page.keyboard.down('w'); await page.keyboard.down('ArrowUp'); await page.keyboard.up('w');
        assert.equal(await page.evaluate(() => window.__workers.messages.at(-1).forward), 1);
        await page.evaluate(() => window.dispatchEvent(new Event('blur')));
        assert.equal(await page.evaluate(() => window.__workers.messages.at(-1).forward), 0);
        await page.keyboard.up('ArrowUp');
      });
      await check(`${base} idle pause stops drawing; camera, resize and resume redraw`, async () => {
        await page.locator('[data-pause]').click(); await status('paused');
        const settle = () => page.waitForFunction(() => {
          const draws = window.__playgroundDraws, now = performance.now();
          if (window.__lastDraws !== draws) { window.__lastDraws = draws; window.__drawsSettledAt = now; }
          return draws > 0 && now - window.__drawsSettledAt > 600;
        });
        await settle();
        const frozen = await page.evaluate(() => window.__playgroundDraws);
        await page.waitForTimeout(600); assert.equal(await page.evaluate(() => window.__playgroundDraws), frozen);
        await page.mouse.move(700, 380); await page.mouse.down(); await page.mouse.move(780, 420, { steps: 4 }); await page.mouse.up();
        await page.waitForFunction(draws => window.__playgroundDraws > draws, frozen);
        await settle();
        const orbitDraws = await page.evaluate(() => window.__playgroundDraws);
        await page.mouse.wheel(0, 150);
        await page.waitForFunction(draws => window.__playgroundDraws > draws, orbitDraws);
        await settle();
        const zoomDraws = await page.evaluate(() => window.__playgroundDraws);
        await page.setViewportSize({ width: 1400, height: 880 });
        await page.waitForFunction(draws => window.__playgroundDraws > draws, zoomDraws);
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.locator('[data-follow]').click();
        const pausedDraws = await page.evaluate(() => window.__playgroundDraws);
        await page.locator('[data-pause]').click(); await advance(.1);
        await page.waitForFunction(draws => window.__playgroundDraws > draws, pausedDraws);
      });
      await check(`${base} pause, explicit visibility resume, reset, orbit and follow`, async () => {
        await page.locator('[data-pause]').click(); await status('paused'); await page.waitForTimeout(100);
        const frozen = (await state()).pose.time; await page.waitForTimeout(120); assert.equal((await state()).pose.time, frozen);
        await page.locator('[data-pause]').click(); await advance(.1);
        await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
        await status('paused');
        await page.evaluate(() => { delete document.hidden; document.dispatchEvent(new Event('visibilitychange')); });
        assert.equal((await state()).status, 'paused');
        const resets = await page.evaluate(() => window.__workers.resets);
        await page.locator('[data-reset]').click(); await status('running');
        const reset = await page.evaluate(() => ({ count: window.__workers.resets, pose: window.__workers.lastReset }));
        assert.equal(reset.count, resets + 1); assert.equal(reset.pose.time, 0); assert.deepEqual(reset.pose.root.slice(0, 3), getWorld('circuit').spawn);
        await page.mouse.move(700, 380); await page.mouse.down(); await page.mouse.move(800, 420, { steps: 8 }); await page.mouse.up();
        assert.equal((await state()).following, false);
        await page.locator('[data-follow]').click(); assert.equal((await state()).following, true);
        await page.mouse.move(750, 400); await page.mouse.wheel(0, 150);
        await page.waitForFunction(() => !window.duckrobe.playground.getState().following);
      });
      await check(`${base} environment switching, input clearing, outfit preservation and overview`, async () => {
        assert.equal((await state()).worldId, 'circuit');
        for (const id of ['park', 'harbor', 'arena', 'circuit', 'park']) {
          await page.locator('[data-back]').focus(); await page.keyboard.down('w');
          await chooseWorld(id); await page.keyboard.up('w');
          assert.equal(await page.evaluate(() => window.__workers.active), 1);
          assert.equal(await page.locator('.playground-canvas canvas').count(), 1);
          assert.deepEqual((await state()).selection, before.state.selection); assert.deepEqual((await state()).colors, before.state.colors);
          const lastCommand = await page.evaluate(() => window.__workers.messages.findLast(message => message.type === 'command'));
          assert.deepEqual([lastCommand.forward, lastCommand.turn], [0, 0]);
          assert.equal(await page.locator('[data-activity]').isVisible(), id !== 'arena');
          await page.locator('[data-overview]').click(); assert.equal((await state()).following, false);
          assert.equal(await page.locator('[data-overview]').getAttribute('aria-pressed'), 'true');
        }
        await page.locator('[data-back]').focus(); await page.keyboard.down('w'); await advance(3); await page.keyboard.up('w');
        assert((await state()).activity.stamps.includes('entrance'));
        await page.locator('[data-pause]').click(); await status('paused');
        await snapshot({ path: path.join(output, `playground-park${base === '/' ? '' : '-pages'}.png`) });
        await page.locator('[data-reset]').click(); await status('running');
        assert.deepEqual((await state()).activity.stamps, []);
        await chooseWorld('circuit'); await page.locator('[data-pause]').click();
        await snapshot({ path: path.join(output, `playground-circuit${base === '/' ? '' : '-pages'}.png`) });
      });
      await snapshot({ path: path.join(output, base === '/' ? 'playground-desktop.png' : 'playground-pages.png') });
      await check(`${base} park rides follow simulation pause and reduced motion`, async () => {
        const rides = () => page.evaluate(() => {
          const scene = window.duckrobe.playground.rig.group.parent.parent;
          return { wheel: scene.getObjectByName('park-ferris-wheel').rotation.y, carousel: scene.getObjectByName('park-carousel-turntable').rotation.z };
        });
        await chooseWorld('park'); const initial = await rides(); await advance(.3);
        const moving = await rides(); assert.notEqual(moving.wheel, initial.wheel); assert.notEqual(moving.carousel, initial.carousel);
        await page.locator('[data-pause]').click(); await status('paused'); await page.waitForTimeout(150);
        const paused = await rides(); await page.waitForTimeout(150); assert.deepEqual(await rides(), paused);
        await page.emulateMedia({ reducedMotion: 'reduce' }); await chooseWorld('arena'); await chooseWorld('park'); await advance(.3);
        assert.deepEqual(await rides(), { wheel: 0, carousel: 0 });
        await page.emulateMedia({ reducedMotion: 'no-preference' }); await chooseWorld('circuit'); await page.locator('[data-pause]').click();
      });
      await check(`${base} double-sided circuit clock follows real crossing, pause and reset`, async () => {
        const clock = (remember = false) => page.evaluate(remember => {
          const scene = window.duckrobe.playground.rig.group.parent.parent;
          const front = scene.getObjectByName('circuit-clock-front'), back = scene.getObjectByName('circuit-clock-back');
          const texture = front.material.map, pixels = texture.image.getContext('2d').getImageData(0, 0, 1024, 224).data;
          if (remember) window.__clockPixels = pixels;
          let hash = 2166136261, maxDifference = 0;
          for (let i = 0; i < pixels.length; i++) { hash = Math.imul(hash ^ pixels[i], 16777619); maxDifference = Math.max(maxDifference, Math.abs(pixels[i] - window.__clockPixels[i])); }
          return { hash, shared: texture === back.material.map, maxDifference };
        }, remember);
        const idle = await clock(true); assert(idle.shared);
        const clockImage = () => page.evaluate(() => window.duckrobe.playground.rig.group.parent.parent.getObjectByName('circuit-clock-front').material.map.image.toDataURL().split(',')[1]);
        const initialImage = await clockImage();
        await page.locator('[data-pause]').click(); await status('running');
        await page.locator('[data-back]').focus(); await page.keyboard.down('w');
        await page.waitForFunction(() => window.duckrobe.playground.getState().activity.started);
        await page.keyboard.up('w'); await advance(.4);
        await page.locator('[data-pause]').click(); await status('paused'); await page.waitForTimeout(150);
        const stopped = await clock(); assert.notEqual(stopped.hash, idle.hash);
        await page.waitForTimeout(150); assert.deepEqual(await clock(), stopped);
        await page.locator('[data-reset]').click(); await status('running');
        await page.waitForFunction(() => !window.duckrobe.playground.getState().activity.started);
        await page.waitForTimeout(150);
        const resetClock = await clock();
        if (resetClock.maxDifference > 3) {
          await writeFile(path.join(output, 'clock-initial.png'), Buffer.from(initialImage, 'base64'));
          await writeFile(path.join(output, 'clock-reset.png'), Buffer.from(await clockImage(), 'base64'));
        }
        // Canvas text readback can differ by 1–2 color levels at glyph edges
        // after GPU/software rasterization; actual changed digits differ far more.
        assert(resetClock.shared); assert(resetClock.maxDifference <= 3);
      });
      await checkAdventures({ page, check, base, appUrl, state, status, chooseWorld });
      await check(`${base} round trip preserves browsing, outfit, colors, motion, scroll and focus`, async () => {
        await page.keyboard.press('Escape');
        assert.equal(await page.locator('#playground-dialog').getAttribute('open'), null);
        const after = await page.evaluate(() => ({ state: structuredClone(window.duckrobe.state), scroll: document.querySelector('#catalog-scroll').scrollTop, y: scrollY }));
        assert.deepEqual(after, before);
        assert(await page.locator('#open-playground').evaluate(el => document.activeElement === el));
        assert.equal(await page.evaluate(() => window.__workers.active), 0);
        const frame = await page.evaluate(() => window.duckrobe.preview.renderer.info.render.frame);
        await page.waitForFunction(frame => window.duckrobe.preview.renderer.info.render.frame > frame, frame);
      });
      await checkAlbumRestore({ page, check, base, enter, exit, before });
      if (base === '/') {
        await check('missing model assets show Retry and Back; retry recovers', async () => {
          // A new page drops successful prepared-asset caches, so this still
          // exercises a genuinely missing cold-load asset.
          await page.reload(); await page.waitForFunction(() => window.duckrobe?.ready);
          await page.route('**/playground/robot.xml', route => route.fulfill({ status: 404, body: 'missing' }), { times: 1 });
          await page.locator('#open-playground').click(); await status('error');
          assert.match(await page.locator('[data-detail]').innerText(), /404/);
          assert(await page.locator('[data-back]').isEnabled());
          await page.locator('[data-recover]').click(); await status('running'); await exit();
        });
        await check('policy initialization failure disposes worker and retries cleanly', async () => {
          await page.route('**/playground/walking.onnx', route => route.fulfill({ status: 200, body: 'invalid policy' }), { times: 1 });
          await page.locator('#open-playground').click(); await status('error');
          assert.equal(await page.evaluate(() => window.__workers.active), 0);
          await page.locator('[data-recover]').click(); await status('running'); await exit();
        });
        await check('exit during policy loading terminates pending initialization', async () => {
          let release, reached; const gate = new Promise(resolve => { release = resolve; }); const requested = new Promise(resolve => { reached = resolve; });
          await page.route('**/playground/walking.onnx', async route => { reached(); await gate; await route.abort().catch(() => {}); }, { times: 1 });
          await page.locator('#open-playground').click(); await requested; await exit(); release();
          await enter(); await exit();
        });
        await check('rapid environment changes during policy loading discard stale workers', async () => {
          let release, reached; const gate = new Promise(resolve => { release = resolve; }); const requested = new Promise(resolve => { reached = resolve; });
          await page.route('**/playground/walking.onnx', async route => { reached(); await gate; await route.abort().catch(() => {}); }, { times: 1 });
          await page.locator('#open-playground').click(); await requested;
          await page.locator('select[data-world]').selectOption('park');
          await chooseWorld('arena'); release(); await advance(.1);
          assert.equal(await page.evaluate(() => window.__workers.active), 1);
          assert.equal(await page.locator('.playground-canvas canvas').count(), 1);
          assert.equal((await state()).status, 'running'); await exit();
        });
        await check('worker fall/runtime errors reach recoverable UI', async () => {
          await enter();
          await page.evaluate(() => { const w = window.__workers.instances.at(-1); w.postMessage({ type: 'pause' }); w.dispatchEvent(new MessageEvent('message', { data: { type: 'fallen' } })); });
          await status('fallen'); assert(await page.locator('[data-recover]').isEnabled());
          await page.locator('[data-recover]').click(); await status('running');
          await page.evaluate(() => window.__workers.instances.at(-1).dispatchEvent(new MessageEvent('message', { data: { type: 'error', message: 'Injected runtime failure' } })));
          await status('error'); assert.equal(await page.evaluate(() => window.__workers.active), 0);
          await page.locator('[data-recover]').click(); await status('running'); await exit();
        });
        await check('saved view and Chinese labels survive the round trip', async () => {
          await revealControl('[data-language="zh"]', page); await page.locator('#saved-nav').click();
          const saved = await page.evaluate(() => structuredClone(window.duckrobe.state));
          await enter(); assert.match(await page.locator('[data-back]').innerText(), /换装/);
          assert.match(await page.locator('select[data-world] option[value="circuit"]').innerText(), /赛道/);
          await chooseWorld('park'); assert.match(await page.locator('[data-activity-title]').innerText(), /游园/); await exit();
          assert.deepEqual(await page.evaluate(() => structuredClone(window.duckrobe.state)), saved);
        });
        await check('long garments stay attached while standing, walking and turning', async () => {
          await revealControl('[data-language="en"]', page);
          await page.evaluate(() => window.duckrobe.selectLook('library-spell'));
          await enter();
          for (const [label, key] of [['stand', null], ['walk', 'w'], ['turn', 'a']]) {
            if (key) { await page.keyboard.down(key); await advance(.6); await page.keyboard.up(key); }
            await snapshot({ path: path.join(output, `playground-cape-${label}.png`) });
          }
          await exit();
          await page.evaluate(() => window.duckrobe.selectLook('sunday-linen'));
          await enter(); await page.keyboard.down('w'); await advance(.6); await page.keyboard.up('w');
          await snapshot({ path: path.join(output, 'playground-dress-walk.png') }); await exit();
        });
      }
      await check(`${base} mobile portrait/landscape layout and pointer steering`, async () => {
        await page.setViewportSize({ width: 390, height: 844 }); await enter();
        const button = page.locator('[data-direction="forward"]'); const box = await button.boundingBox();
        const cdp = await context.newCDPSession(page);
        const forward = { x: box.x + box.width / 2, y: box.y + box.height / 2, id: 1 };
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [forward] }); await advance(.5);
        assert(await button.evaluate(el => el.classList.contains('held')));
        const right = await page.locator('[data-direction="right"]').boundingBox();
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [forward, { x: right.x + right.width / 2, y: right.y + right.height / 2, id: 2 }] });
        assert.deepEqual(await page.evaluate(() => { const m = window.__workers.messages.at(-1); return [m.forward, m.turn]; }), [1, -1]);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        assert.equal(await page.evaluate(() => window.__workers.messages.at(-1).forward), 0); await cdp.detach();
        for (const id of ['circuit', 'park', 'harbor']) {
          await chooseWorld(id); await page.locator('[data-pause]').click();
          for (const [width, height, label] of [[390, 844, 'mobile'], [844, 390, 'landscape']]) {
            await page.setViewportSize({ width, height });
            await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
            for (const selector of ['[data-back]', 'select[data-world]', '[data-pause]', '[data-reset]', '[data-follow]', '[data-overview]', '[data-direction="right"]', '[data-photo]', '[data-album]', '[data-portrait]']) {
              const rect = await page.locator(selector).boundingBox(); assert(rect.x >= 0 && rect.y >= 0 && rect.x + rect.width <= width && rect.y + rect.height <= height, `${selector} outside viewport`);
              assert(await page.locator(selector).evaluate(el => { const r = el.getBoundingClientRect(); return el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)); }), `${selector} covered by another control`);
            }
            await snapshot({ path: path.join(output, `playground-${id}-${label}${base === '/' ? '' : '-pages'}.png`) });
          }
        }
        await exit(); assert.equal(await page.locator('.playground-canvas canvas').count(), 0);
      });
      assert.deepEqual(errors, [], 'Unhandled browser errors');
    } catch (error) {
      await snapshot({ path: path.join(output, 'playground-failure.png') }).catch(() => {});
      console.error('Playground state:', await page.locator('#playground-host').innerText().catch(() => 'unavailable'));
      throw error;
    } finally { await context.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  }
  await check('fresh development cache opens Playground without an optimizer reload', async () => {
    const dev = await createViteServer({ base: '/', logLevel: 'error', cacheDir: path.join(temporary, 'vite-cache'), server: { host: '127.0.0.1', port: 0 } });
    await dev.listen();
    const context = await browser.newContext({ viewport: { width: 1100, height: 740 } });
    const page = await context.newPage();
    try {
      for (const asset of ['@mujoco/mujoco/mujoco.wasm', 'onnxruntime-web/dist/ort-wasm-simd-threaded.wasm']) {
        const response = await context.request.get(`http://127.0.0.1:${dev.httpServer.address().port}/node_modules/${asset}`, { headers: { 'Accept-Encoding': 'gzip' } });
        const bytes = await readFile(`node_modules/${asset}`);
        assert.equal(response.headers()['content-encoding'], 'gzip');
        const vary = response.headers().vary.toLowerCase().split(',').map(value => value.trim());
        assert(vary.includes('origin') && vary.includes('accept-encoding'));
        assert(Number(response.headers()['content-length']) < bytes.length / 2);
        assert.deepEqual(await response.body(), bytes);
      }
      await page.goto(`http://127.0.0.1:${dev.httpServer.address().port}`);
      await page.waitForFunction(() => window.duckrobe?.ready);
      const origin = await page.evaluate(() => performance.timeOrigin);
      await page.locator('#open-playground').click();
      await page.waitForFunction(() => window.duckrobe?.playground?.getState().pose?.time > .3, null, { timeout: 65000 });
      assert.equal(await page.evaluate(() => performance.timeOrigin), origin);
      await page.locator('[data-back]').click();
      assert.equal(await page.locator('#playground-dialog').getAttribute('open'), null);
    } finally { await context.close(); await dev.close(); }
  });
  await writeFile(path.join(output, 'playground-results.json'), JSON.stringify({ passed: results }, null, 2));
} finally { await browser.close(); await rm(temporary, { recursive: true, force: true }); }
