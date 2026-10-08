import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { unzipSync } from 'fflate';
import { DOMParser } from '@xmldom/xmldom';

async function revealControl(selector, target = page) {
  let panel;
  if (/data-language|#about-button|#export-look|#repository-link/.test(selector)) panel = 'app-more';
  else if (/data-theme|#filter-favorites/.test(selector)) panel = 'collection-filter';
  else if (/data-remove-item|#clear-look/.test(selector)) panel = 'wearing-panel';
  if (panel && !await target.locator('#' + panel).evaluate(el => el.open)) await target.locator('#' + panel + ' > summary').click();
  await target.locator(selector).click();
}
const url = process.env.DUCKROBE_URL || 'http://localhost:5173';
const output = path.resolve(process.env.DUCKROBE_QA_OUTPUT || 'test-results');
const slots = ['hat', 'eyewear', 'body', 'accessory', 'legwear'];
const regions = ['chest', 'side', 'back'];
const results = [], errors = [], warnings = [], screenshots = [];
await mkdir(output, { recursive: true });
const gpuArgs = process.env.DUCKROBE_QA_GPU === 'metal' ? ['--use-angle=metal']
  : process.env.DUCKROBE_QA_GPU === 'vulkan' ? ['--enable-gpu', '--use-angle=vulkan']
  : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', ...gpuArgs] });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
const page = await context.newPage();
function watch(target, label = '') {
  target.setDefaultTimeout(45000); target.setDefaultNavigationTimeout(90000);
  target.on('pageerror', error => { errors.push(`${label}${error.message}`); console.error(`BROWSER ${label}${error.message}`); });
  target.on('console', message => { if (message.type() === 'error') errors.push(`${label}${message.text()}`); if (message.type() === 'warning') warnings.push(`${label}${message.text()}`); });
}
watch(page);
async function check(name, action) {
  try { await action(); results.push({ name, status: 'passed' }); console.log(`PASS ${name}`); }
  catch (error) { results.push({ name, status: 'failed', error: error.stack || error.message }); console.error(`FAIL ${name}: ${error.message}`); }
}
async function ready(target = page) { await target.waitForFunction(() => window.duckrobe?.ready && window.duckrobe.OUTFITS?.length === 100 && Array.isArray(window.duckrobe.ITEMS), null, { timeout: 180000 }); }
async function selection(target = page) { return target.evaluate(() => structuredClone(window.duckrobe.state.selection)); }
async function colors(target = page) { return target.evaluate(() => ({ ...window.duckrobe.rig.metadata.bodyColors })); }
async function selectedIds(target = page) { return target.evaluate(() => window.duckrobe.selectedItemIds(window.duckrobe.state.selection)); }
async function selectLook(id, target = page) { await target.locator(`[data-outfit="${id}"] .card-open`).click(); }
async function selectItem(id, target = page) { await target.locator(`[data-item="${id}"] .card-open`).click(); }
async function switchSlot(slot, target = page) { await target.locator(`#slot-controls [data-slot="${slot}"]`).click(); }
async function openPanel(id, target = page) { if (!await target.locator('#' + id).evaluate(panel => panel.open)) await target.locator('#' + id + ' > summary').click(); }
async function setColor(selector, value, target = page) { await openPanel('colors-panel', target); await target.locator(selector).evaluate((input, value) => { input.value = value; input.dispatchEvent(new Event('input', { bubbles: true })); }, value); }
async function snapshot(name, target = page, options = {}) { await target.screenshot({ path: path.join(output, name), timeout: 90000, ...options }); screenshots.push(name); }
async function workspace(target = page) { await target.locator('.wardrobe-layout').evaluate(element => scrollTo(0, element.getBoundingClientRect().top + scrollY - 24)); }
async function thumbnailsIdle(target = page) {
  await target.waitForFunction(() => window.duckrobe.preview.thumbnailsPending === 0, null, { timeout: 180000 });
}
async function thumbnail(id, target = page) {
  await target.waitForFunction(id => { const image = document.querySelector(`[data-outfit="${id}"] img`); return image?.complete && image.naturalWidth > 0 && image.src.startsWith('data:image/') && image.src.length > 3000; }, id, { timeout: 180000 });
}
async function noOverflow(target = page) {
  const dimensions = await target.evaluate(() => ({ width: innerWidth, document: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
  assert(dimensions.document <= dimensions.width + 1 && dimensions.body <= dimensions.width + 1, JSON.stringify(dimensions));
}
function unchangedOtherSlots(before, after, changed) { for (const slot of slots.filter(slot => slot !== changed)) assert.deepEqual(after[slot], before[slot], `Changing ${changed} changed ${slot}`); }
async function attachedIds(target = page) {
  return target.evaluate(() => { const ids = new Set(); window.duckrobe.rig.group.traverse(group => { if (group.userData.itemId) { let count = 0; group.traverse(object => { if (object.isMesh) count++; }); if (count) ids.add(group.userData.itemId); } }); return [...ids].sort(); });
}
async function frames(count = 24) {
  return page.evaluate(async count => { const values = []; for (let i = 0; i < count; i++) { await new Promise(requestAnimationFrame); const { rig } = window.duckrobe; values.push({ root: [...rig.group.position.toArray(), ...rig.group.rotation.toArray().slice(0, 3)], joints: Object.fromEntries([...rig.joints].map(([name, joint]) => [name, joint.angle])), behavior: rig.behavior.getState() }); } return values; }, count);
}
const extent = values => Math.max(...values) - Math.min(...values);
async function contactSheets(catalog) {
  const data = await page.locator('[data-outfit]').evaluateAll(cards => cards.map(card => ({ id: card.dataset.outfit, name: card.querySelector('.card-name').textContent, image: card.querySelector('img')?.src })));
  assert.equal(data.length, 100); assert(data.every(item => item.image?.startsWith('data:image/')));
  assert.equal(new Set(data.map(item => item.image)).size, 100);
  await mkdir(path.join(output, 'catalog', 'thumbs'), { recursive: true });
  for (const item of data) await writeFile(path.join(output, 'catalog', 'thumbs', `${item.id}.webp`), Buffer.from(item.image.split(',')[1], 'base64'));
  const sheet = await context.newPage(); await sheet.bringToFront();
  for (let index = 0; index < 4; index++) {
    const panel = data.slice(index * 25, (index + 1) * 25).map(item => ({ ...item, title: catalog.find(look => look.id === item.id)?.name || item.name }));
    await sheet.setViewportSize({ width: 1400, height: 1550 });
    await sheet.setContent(`<html lang="zh-CN"><meta charset="utf-8"><style>*{box-sizing:border-box}body{margin:0;padding:24px;background:#f6f5ed;font-family:Arial,"Noto Sans CJK SC",sans-serif;color:#29372d}h1{font-size:24px;margin:0 0 18px}main{display:grid;grid-template-columns:repeat(5,1fr);gap:12px}article{background:#fffaf0;border-radius:14px;text-align:center;padding:6px}img{width:100%;height:252px;object-fit:contain}p{font-size:14px;margin:0;padding:5px}</style><h1>DuckRobe · ${index * 25 + 1}–${index * 25 + 25} / 100 · 真实三维试穿</h1><main>${panel.map(item => `<article><img src="${item.image}"><p>${item.title}</p></article>`).join('')}</main></html>`);
    await sheet.locator('img').evaluateAll(images => Promise.all(images.map(image => image.decode())));
    await snapshot(`catalog-${index + 1}.png`, sheet, { fullPage: true });
  }
  await sheet.close(); await page.bringToFront();
}

try {
  await page.goto(url, { waitUntil: 'domcontentloaded' }); await ready(); await page.bringToFront();
  const catalog = await page.evaluate(() => window.duckrobe.OUTFITS.map(({ id, name, en, theme, selection, bodyColors }) => ({ id, name, en, theme, selection, bodyColors })));
  const items = await page.evaluate(() => window.duckrobe.ITEMS.map(({ id, name, en, slot, region, kind }) => ({ id, name, en, slot, region, kind })));
  const themes = await page.evaluate(() => window.duckrobe.THEMES.map(({ id, name }) => ({ id, name })));
  await workspace(); await thumbnail(catalog[0].id); await thumbnailsIdle();
  await check('fresh English wardrobe has 100 curated kits and renders only visible previews plus prefetch', async () => {
    assert.equal(await page.locator('html').getAttribute('lang'), 'en'); assert.equal(await page.locator('[data-outfit]').count(), 100);
    assert.equal(catalog.length, 100); assert.equal(themes.length, 10); assert(items.length > 100);
    assert(!/\p{Script=Han}/u.test(await page.locator('#look-name').innerText()));
    const loading = await page.evaluate(() => ({ cached: [...window.duckrobe.thumbnails.keys()].filter(key => key.startsWith('look:')).length, images: document.querySelectorAll('[data-outfit] img').length }));
    assert(loading.cached > 0 && loading.cached < 40, `Expected a visible subset, got ${JSON.stringify(loading)}`);
    assert(loading.images > 0 && loading.images < 100); await noOverflow();
  });
  await snapshot('desktop-ready.png');
  await check('desktop wheel, drag and keyboard scroll only the catalog and keep headers fixed', async () => {
    const scroll = page.locator('#catalog-scroll');
    const before = await scroll.evaluate(element => ({ top: element.scrollTop, height: element.clientHeight, content: element.scrollHeight, pageY: scrollY, headerY: document.querySelector('.closet-controls').getBoundingClientRect().y }));
    assert(before.height > 100 && before.content > before.height * 3);
    await scroll.hover(); await page.mouse.wheel(0, 520);
    await page.waitForFunction(top => document.querySelector('#catalog-scroll').scrollTop > top + 100, before.top);
    const selectionBefore = await selection(), box = await scroll.boundingBox(); assert(box);
    await page.mouse.move(box.x + box.width * .5, box.y + box.height * .75); await page.mouse.down();
    const dragBefore = await scroll.evaluate(element => element.scrollTop);
    await page.mouse.move(box.x + box.width * .5, box.y + box.height * .35, { steps: 10 }); await page.mouse.up();
    assert(await scroll.evaluate(element => element.scrollTop) > dragBefore + 40); assert.deepEqual(await selection(), selectionBefore, 'A drag must not accidentally equip a look');
    await scroll.focus(); await page.keyboard.press('End');
    await page.waitForFunction(() => { const element = document.querySelector('#catalog-scroll'); return element.scrollTop >= element.scrollHeight - element.clientHeight - 4; });
    const after = await scroll.evaluate(element => ({ pageY: scrollY, headerY: document.querySelector('.closet-controls').getBoundingClientRect().y }));
    assert(Math.abs(after.pageY - before.pageY) < 2); assert(Math.abs(after.headerY - before.headerY) < 2);
    await selectLook(catalog.at(-1).id); assert.deepEqual(await selection(), catalog.at(-1).selection);
    assert.deepEqual(await attachedIds(), (await selectedIds()).sort());
    await scroll.focus(); await page.keyboard.press('Home');
    await page.waitForFunction(() => document.querySelector('#catalog-scroll').scrollTop < 4);
  });
  await check('kit colors apply automatically, lock survives reload, and explicit look palette overrides the lock', async () => {
    const first = catalog[0], different = catalog.find(look => JSON.stringify(look.bodyColors) !== JSON.stringify(first.bodyColors)); assert(different);
    await selectLook(first.id); assert.deepEqual(await colors(), first.bodyColors);
    const image = await page.locator(`[data-outfit="${first.id}"] img`).getAttribute('src');
    await setColor('#shell-color', '#9fbc8e'); await setColor('#accent-color', '#f5cf76');
    await openPanel('colors-panel'); assert.equal(await page.locator('#color-lock').getAttribute('aria-pressed'), 'true');
    await selectLook(different.id); assert.deepEqual(await colors(), { shell: '#9fbc8e', accent: '#f5cf76' });
    assert.equal(await page.locator(`[data-outfit="${first.id}"] img`).getAttribute('src'), image, 'Kit previews must retain their own palette');
    const painted = await page.evaluate(() => { const result = {}; window.duckrobe.rig.group.traverse(mesh => { if (!mesh.isMesh) return; if (mesh.userData.meshFile === 'top_head_shell.stl') result.shell = `#${mesh.material.color.getHexString()}`; if (mesh.userData.meshFile === 'jaw.stl') result.accent = `#${mesh.material.color.getHexString()}`; }); return result; });
    assert.deepEqual(painted, await colors(), 'The native robot materials must reflect the visible color controls');
    const cached = await page.evaluate(() => [...window.duckrobe.thumbnails.keys()].filter(key => key.startsWith('look:')).sort());
    await setColor('#shell-color', '#bdace3'); await thumbnailsIdle();
    assert.deepEqual(await page.evaluate(() => [...window.duckrobe.thumbnails.keys()].filter(key => key.startsWith('look:')).sort()), cached, 'Custom colors must not queue a new full catalog');
    await page.reload({ waitUntil: 'domcontentloaded' }); await ready(); await workspace();
    assert.equal(await page.locator('#color-lock').getAttribute('aria-pressed'), 'true'); assert.deepEqual(await colors(), { shell: '#bdace3', accent: '#f5cf76' });
    await openPanel('colors-panel'); await page.locator('#apply-look-colors').click(); assert.deepEqual(await colors(), different.bodyColors);
    assert.equal(await page.locator('#color-lock').getAttribute('aria-pressed'), 'false');
    await selectLook(first.id); assert.deepEqual(await colors(), first.bodyColors);
  });
  await check('scrolling incrementally renders all 100 unique real previews', async () => {
    await switchSlot('all'); await workspace();
    const cards = page.locator('[data-outfit]');
    for (let index = 0; index < catalog.length; index += 3) {
      await cards.nth(index).scrollIntoViewIfNeeded();
      for (const look of catalog.slice(index, index + 3)) await thumbnail(look.id);
    }
    assert.equal(await page.locator('[data-outfit] img').count(), 100); await contactSheets(catalog);
  });
  await check('rapid category changes cancel old previews without errors, and new previews resume', async () => {
    const before = await selection(), errorCount = errors.length;
    for (let pass = 0; pass < 2; pass++) for (const slot of ['hat', 'body', 'eyewear', 'legwear', 'accessory', 'all']) await switchSlot(slot);
    assert.deepEqual(await selection(), before);
    await switchSlot('body'); const fresh = items.filter(item => item.slot === 'body').at(-1);
    await page.locator(`[data-item="${fresh.id}"]`).scrollIntoViewIfNeeded();
    await page.waitForFunction(id => { const image = document.querySelector(`[data-item="${id}"] img`); return image?.complete && image.naturalWidth > 0 && image.src.length > 3000; }, fresh.id, { timeout: 180000 });
    await thumbnailsIdle(); assert.equal(errors.length, errorCount, 'Canceled thumbnail jobs must not throw'); assert.deepEqual(await selection(), before);
    await switchSlot('all');
  });
  await check('10 collections each show 10 kits, and English/Chinese searches work in both languages', async () => {
    for (const theme of themes) { await revealControl(`[data-theme="${theme.id}"]`, page); assert.equal(await page.locator('[data-outfit]').count(), 10); }
    await revealControl('[data-theme="all"]', page);
    await page.locator('#outfit-search').fill(catalog[0].en); assert(await page.locator(`[data-outfit="${catalog[0].id}"]`).isVisible());
    await page.locator('#outfit-search').fill(catalog[0].name); assert(await page.locator(`[data-outfit="${catalog[0].id}"]`).isVisible());
    const before = await selection(); await revealControl('[data-language="zh"]', page); assert.match(await page.locator('html').getAttribute('lang'), /^zh/);
    await openPanel('colors-panel'); assert(/\p{Script=Han}/u.test(await page.locator('#color-lock').innerText())); assert.deepEqual(await selection(), before);
    await page.locator('#outfit-search').fill('no-such-duck-qa-837'); assert.equal(await page.locator('[data-outfit]').count(), 0);
    await page.locator('#clear-filters').click(); assert.equal(await page.locator('[data-outfit]').count(), 100);
    await revealControl('[data-language="en"]', page);
  });
  await check('independent products equip and remove without changing other slots', async () => {
    for (const slot of slots.filter(slot => slot !== 'accessory')) {
      const before = await selection(); await switchSlot(slot); assert.deepEqual(await selection(), before);
      const pool = items.filter(item => item.slot === slot); assert.equal(await page.locator('[data-item]').count(), pool.length);
      const item = pool.find(item => item.id !== before[slot]); assert(item); await selectItem(item.id);
      const after = await selection(); assert.equal(after[slot], item.id); unchangedOtherSlots(before, after, slot);
      assert.equal(await page.locator(`[data-item="${item.id}"] .card-open`).getAttribute('aria-pressed'), 'true');
      await revealControl(`[data-remove-item="${item.id}"]`, page); const removed = await selection(); assert.equal(removed[slot], null); unchangedOtherSlots(after, removed, slot);
    }
  });
  await check('chest, side and back coexist; same-region replacement and per-piece removal preserve neighbors', async () => {
    await revealControl('#clear-look', page); assert.deepEqual(await selectedIds(), []); await switchSlot('accessory');
    const chosen = {};
    for (const region of regions) {
      const pool = items.filter(item => item.slot === 'accessory' && item.region === region); assert(pool.length > 1);
      await page.locator(`[data-accessory-region="${region}"]`).click(); assert.equal(await page.locator('[data-item]').count(), pool.length);
      assert.equal(await page.locator('[data-item] .card-position').count(), pool.length);
      chosen[region] = pool[0].id; await selectItem(chosen[region]); assert.equal((await selection()).accessory[region], chosen[region]);
    }
    assert.deepEqual((await selection()).accessory, chosen); assert.equal(await page.locator('[data-remove-slot="accessory"]').count(), 3);
    const replacement = items.find(item => item.slot === 'accessory' && item.region === 'chest' && item.id !== chosen.chest); assert(replacement);
    await page.locator('[data-accessory-region="chest"]').click(); await selectItem(replacement.id); chosen.chest = replacement.id;
    assert.deepEqual((await selection()).accessory, chosen); assert.deepEqual(await attachedIds(), Object.values(chosen).sort());
    await revealControl(`[data-remove-item="${chosen.side}"]`, page); assert.deepEqual((await selection()).accessory, { ...chosen, side: null });
    await page.locator('[data-accessory-region="side"]').click(); await selectItem(chosen.side);
    await page.locator('[data-accessory-region="back"]').click(); await selectItem(chosen.back); assert.deepEqual((await selection()).accessory, { ...chosen, back: null });
    await selectItem(chosen.back); assert.deepEqual((await selection()).accessory, chosen);
    for (const slot of slots.filter(slot => slot !== 'accessory')) { await switchSlot(slot); const id = catalog[0].selection[slot] || items.find(item => item.slot === slot).id; await selectItem(id); }
    assert.deepEqual(await attachedIds(), (await selectedIds()).sort());
  });
  await check('kit and piece favorites retain their own IDs and filters', async () => {
    await switchSlot('all'); const look = catalog[0]; await page.locator(`[data-outfit="${look.id}"] .card-heart`).click();
    await revealControl('#filter-favorites', page); assert.equal(await page.locator('[data-outfit]').count(), 1);
    await page.locator('[data-outfit] .card-heart').click(); assert.equal(await page.locator('[data-outfit]').count(), 0); await revealControl('#filter-favorites', page);
    await switchSlot('body'); const piece = items.find(item => item.slot === 'body'); await page.locator(`[data-item="${piece.id}"] .card-heart`).click();
    await revealControl('#filter-favorites', page); assert.equal(await page.locator('[data-item]').count(), 1); await page.locator('[data-item] .card-heart').click(); assert.equal(await page.locator('[data-item]').count(), 0); await revealControl('#filter-favorites', page);
  });
  let savedSelection, savedColors, savedId;
  await check('saving a multi-accessory look keeps colors, lock and canonical choices across reload', async () => {
    savedSelection = await selection(); await setColor('#shell-color', '#bdace3'); await setColor('#accent-color', '#f2dbac'); savedColors = await colors();
    if (await page.locator('#color-lock').getAttribute('aria-pressed') !== 'true') { await openPanel('colors-panel'); await page.locator('#color-lock').click(); }
    await page.locator('#save-look').click(); savedId = await page.evaluate(() => window.duckrobe.state.saved[0].id);
    await page.locator('#save-look').click(); assert.equal(await page.locator('#saved-count').innerText(), '1');
    await setColor('#shell-color', '#ed8938'); await page.locator('#save-look').click(); assert.equal(await page.locator('#saved-count').innerText(), '2');
    await revealControl('#clear-look', page); assert.deepEqual(await selectedIds(), []); await page.locator('#saved-nav').click();
    await page.locator(`[data-saved="${savedId}"] .card-open`).click(); assert.deepEqual(await selection(), savedSelection); assert.deepEqual(await colors(), savedColors);
    await page.reload({ waitUntil: 'domcontentloaded' }); await ready(); await workspace();
    assert.deepEqual(await selection(), savedSelection); assert.deepEqual(await colors(), savedColors); assert.equal(await page.locator('#color-lock').getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('#saved-count').innerText(), '2');
  });
  await check('every current eyewear product has one continuous eyepiece rim and one lens', async () => {
    await switchSlot('eyewear'); const pool = items.filter(item => item.slot === 'eyewear');
    for (const item of pool) {
      await selectItem(item.id);
      const details = await page.evaluate(() => { const meshes = []; window.duckrobe.rig.group.traverse(group => { if (group.userData.slot === 'eyewear') group.traverse(object => { if (object.isMesh) meshes.push({ name: object.name, vertices: object.geometry.getAttribute('position').count }); }); }); return meshes; });
      assert.equal(details.filter(mesh => mesh.name.split(':').at(-1) === 'single-eyepiece-rim').length, 1, item.id);
      assert.equal(details.filter(mesh => mesh.name.split(':').at(-1) === 'single-optical-lens').length, 1, item.id); assert(details.every(mesh => mesh.vertices > 0));
    }
    await snapshot('eyewear.png');
  });
  await check('featured moves and 12 more moves trigger different real joint motion with grounded feet', async () => {
    const actions = await page.evaluate(() => window.duckrobe.ACTIONS.map(({ id, featured }) => ({ id, featured })));
    assert.equal(actions.length, 16); assert.equal(new Set(actions.map(action => action.id)).size, 16);
    const extra = actions.filter(action => !action.featured && action.id !== 'rest'); assert.equal(extra.length, 12);
    assert.equal(await page.locator('#pet-action-menu [data-action]').count(), 3); assert.equal(await page.locator('#extra-action-menu [data-action]').count(), 12);
    await openPanel('moves-panel');
    if (await page.locator('#motion-toggle').getAttribute('aria-pressed') === 'true') await page.locator('#motion-toggle').click();
    await page.mouse.move(1, 1); await frames(35); const resting = await frames(8);
    for (const joint of Object.keys(resting[0].joints)) assert(extent(resting.map(frame => frame.joints[joint])) < .008, `${joint} did not settle`);
    const signatures = [];
    for (const action of actions.filter(action => action.id !== 'rest')) {
      await openPanel('moves-panel');
      if (!action.featured) await page.locator('.more-actions summary').click();
      await page.locator(`${action.featured ? '#pet-action-menu' : '#extra-action-menu'} [data-action="${action.id}"]`).click();
      if (!action.featured) assert.equal(await page.locator('.more-actions').getAttribute('open'), null);
      await page.waitForFunction(id => window.duckrobe.rig.behavior.getState().kind === id, action.id, { timeout: 20000 });
      const observed = await frames(30), names = Object.keys(observed[0].joints);
      assert(Math.max(...names.map(name => extent(observed.map(frame => frame.joints[name])))) > .008, `${action.id} must move actual joints`);
      for (const frame of observed) assert(frame.behavior.footBounds.left >= -1e-5 && frame.behavior.footBounds.right >= -1e-5, `Feet crossed ground in ${action.id}`);
      signatures.push(names.map(name => Math.round(extent(observed.map(frame => frame.joints[name])) * 1e4)).join('|'));
    }
    assert(new Set(signatures).size >= 12, 'Moves must have materially different joint patterns');
  });
  await check('inspection drag moves the camera, and keyboard/modal interactions retain focus', async () => {
    const canvas = page.locator('#viewer canvas'), box = await canvas.boundingBox(); assert(box);
    const before = await page.evaluate(() => window.duckrobe.preview.camera.position.toArray());
    await page.mouse.move(box.x + box.width * .5, box.y + box.height * .55); await page.mouse.down(); await page.mouse.move(box.x + box.width * .76, box.y + box.height * .58, { steps: 10 }); await frames(8); await page.mouse.up(); await page.mouse.move(1, 1);
    const after = await page.evaluate(() => window.duckrobe.preview.camera.position.toArray()); assert(before.some((value, i) => Math.abs(value - after[i]) > .02)); await page.locator('#reset-camera').click();
    await page.locator('#look-name').click(); await page.keyboard.press('/'); assert(await page.locator('#outfit-search').evaluate(element => element === document.activeElement));
    await revealControl('#about-button', page); assert(await page.locator('#info-dialog').isVisible()); assert(await page.locator('#info-dialog').evaluate(element => element.contains(document.activeElement)));
    await page.keyboard.press('Escape'); assert(!(await page.locator('#info-dialog').isVisible())); await page.waitForFunction(() => document.querySelector('#app-more > summary') === document.activeElement);
  });
  await check('actual download contains canonical v3 multi-accessory selection, colors and all 38 native meshes', async () => {
    const current = await selection(), palette = await colors(); assert(regions.every(region => current.accessory[region]));
    const downloading = page.waitForEvent('download', { timeout: 120000 }); await revealControl('#export-look', page); const download = await downloading;
    const destination = path.join(output, 'duckrobe-three-accessories.zip'); await download.saveAs(destination); assert.equal(await download.failure(), null);
    const files = unzipSync(await readFile(destination)), decoder = new TextDecoder(), parser = new DOMParser();
    const manifest = JSON.parse(decoder.decode(files['manifest.json'])); assert.equal(manifest.formatVersion, 3); assert.deepEqual(manifest.selection, current); assert.deepEqual(manifest.bodyColors, palette);
    assert.deepEqual([...new Set(manifest.clothing.filter(part => part.slot === 'accessory').map(part => part.region))].sort(), [...regions].sort());
    for (const part of manifest.clothing.filter(part => part.slot === 'accessory')) assert.equal(part.itemId, current.accessory[part.region]);
    const urdf = parser.parseFromString(decoder.decode(files['microduck.urdf']), 'application/xml'), mjcf = parser.parseFromString(decoder.decode(files['microduck.xml']), 'application/xml');
    assert.equal(urdf.documentElement.tagName, 'robot'); assert.equal(mjcf.documentElement.tagName, 'mujoco');
    for (const mesh of [...urdf.getElementsByTagName('mesh')]) assert(files[mesh.getAttribute('filename')]?.length > 0, `URDF missing ${mesh.getAttribute('filename')}`);
    const meshDir = mjcf.getElementsByTagName('compiler')[0].getAttribute('meshdir');
    for (const mesh of [...mjcf.getElementsByTagName('mesh')]) assert(files[path.posix.join(meshDir, mesh.getAttribute('file'))]?.length > 0, `MJCF missing ${mesh.getAttribute('file')}`);
    assert.equal(Object.keys(files).filter(filename => filename.startsWith('meshes/robot/')).length, 38); assert(files['LICENSE-Microduck.txt']);
    console.log(`Downloaded v3 multi-accessory ZIP: ${Object.keys(files).length} files`);
  });
  await check('legacy scalar accessories migrate without losing saved colors, dates, favorites or preview', async () => {
    const legacyContext = await browser.newContext({ viewport: { width: 1440, height: 900 } }), legacyPage = await legacyContext.newPage(); watch(legacyPage, 'legacy: '); await legacyPage.bringToFront();
    const piece = items.find(item => item.slot === 'accessory' && !item.id.startsWith('accessory-')); assert(piece);
    const legacySelection = { ...catalog[0].selection, accessory: piece.id }, expected = { ...catalog[0].selection, accessory: { chest: null, side: null, back: null, [piece.region]: piece.id } };
    const oldThumbnail = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
    await legacyPage.addInitScript(({ selection, thumbnail, itemId }) => localStorage.setItem('duckrobe.wardrobe.v2', JSON.stringify({ language: 'en', selection, colors: { shell: '#bdace3', accent: '#f2dbac' }, colorLocked: true, favorites: [`item:${itemId}`], saved: [{ id: 'legacy-scalar-qa', selection, colors: { shell: '#bdace3', accent: '#f2dbac' }, date: '2026-10-01T20:00:00.000Z', thumbnail, thumbnailVersion: 'microduck-single-eye-v2' }] })), { selection: legacySelection, thumbnail: oldThumbnail, itemId: piece.id });
    try {
      await legacyPage.goto(url, { waitUntil: 'domcontentloaded' }); await ready(legacyPage); await workspace(legacyPage);
      assert.deepEqual(await selection(legacyPage), expected); assert.equal(await legacyPage.locator('#color-lock').getAttribute('aria-pressed'), 'true');
      await legacyPage.locator('#saved-nav').click(); await legacyPage.waitForFunction(() => window.duckrobe.state.saved[0].thumbnail?.length > 3000, null, { timeout: 180000 });
      const saved = await legacyPage.evaluate(() => window.duckrobe.state.saved[0]); assert.deepEqual(saved.selection, expected); assert.equal(saved.date, '2026-10-01T20:00:00.000Z'); assert.notEqual(saved.thumbnail, oldThumbnail); assert.equal(saved.thumbnailVersion, 'microduck-accessories-v5');
      assert.match(await legacyPage.locator('[data-saved] .card-subtitle').innerText(), /2 Oct|Oct 2/); assert(await legacyPage.evaluate(id => window.duckrobe.state.favorites.has(`item:${id}`), piece.id));
      await revealControl('#clear-look', legacyPage); await legacyPage.locator('[data-saved] .card-open').click(); assert.deepEqual(await selection(legacyPage), expected); assert.deepEqual(await colors(legacyPage), { shell: '#bdace3', accent: '#f2dbac' });
      await snapshot('legacy-scalar-migration.png', legacyPage);
    } finally { await legacyContext.close(); await page.bringToFront(); }
  });
  await check('saved deletion persists and desktop 1366×768 exposes all workspace controls', async () => {
    await page.locator('#saved-nav').click(); while (await page.locator('[data-saved]').count()) await page.locator('[data-saved] .card-delete').first().click(); assert.equal(await page.locator('#saved-count').innerText(), '0');
    await page.locator('#clear-filters').click(); await switchSlot('all'); await page.setViewportSize({ width: 1366, height: 768 }); await workspace(); await noOverflow();
    for (const selector of ['#save-look', '#undo-look', '#colors-panel > summary', '#moves-panel > summary', '#frame-camera']) { const box = await page.locator(selector).boundingBox(); assert(box && box.y >= 0 && box.y + box.height <= 769, `${selector} outside the workspace`); }
    await snapshot('desktop-1366.png');
    await page.reload({ waitUntil: 'domcontentloaded' }); await ready(); assert.equal(await page.locator('#saved-count').innerText(), '0');
  });
  await check('340/390 mobile and tablet keep the preview visible while the wardrobe scrolls', async () => {
    for (const width of [390, 340, 768]) {
      await page.setViewportSize({ width, height: width === 768 ? 1024 : 844 }); await page.evaluate(() => scrollTo(0, 0)); await noOverflow();
      const natural = await page.locator('#catalog-scroll').evaluate(element => ({ style: getComputedStyle(element).overflowY, height: element.clientHeight, content: element.scrollHeight })); assert.equal(natural.style, 'auto'); assert(natural.content > natural.height);
      await snapshot(`${width === 768 ? 'tablet' : `mobile-${width}`}-top.png`);
      await switchSlot('accessory'); await page.locator('[data-accessory-region="back"]').click(); const item = items.find(item => item.slot === 'accessory' && item.region === 'back');
      const before = await selection(); await selectItem(item.id); const after = await selection(); unchangedOtherSlots(before, after, 'accessory'); assert.deepEqual(after.accessory, { ...before.accessory, back: before.accessory.back === item.id ? null : item.id });
      await openPanel('app-more'); assert(await page.locator('#export-look').isVisible()); await noOverflow(); await snapshot(`${width === 768 ? 'tablet' : `mobile-${width}`}-controls.png`);
      await revealControl('[data-language="zh"]', page); await noOverflow(); await revealControl('[data-language="en"]', page); await switchSlot('all');
    }
    await page.setViewportSize({ width: 1440, height: 900 }); await workspace();
  });
  await check('no browser page or console errors', async () => { assert.deepEqual(errors, []); });
  await switchSlot('all'); await selectLook(catalog[0].id); await workspace(); await snapshot('desktop-final.png');
} catch (error) { results.push({ name: 'Browser setup and application readiness', status: 'failed', error: error.stack || error.message }); console.error(error); }
finally {
  await writeFile(path.join(output, 'ui-validation.json'), JSON.stringify({ url, results, errors, warnings, screenshots }, null, 2));
  console.log(`${results.filter(result => result.status === 'passed').length}/${results.length} checks passed. Results: ${output}`);
  if (results.some(result => result.status === 'failed')) process.exitCode = 1;
  await browser.close();
}
