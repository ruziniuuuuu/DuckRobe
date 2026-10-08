import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import jsQR from 'jsqr';
import { createLookLink, readSharedLook } from '../src/shared-look.js';
import { normalizeSelection, OUTFITS } from '../src/outfits.js';

export async function scanPostcard(page, bytes, scale = 1) {
  const pixels = await page.evaluate(async ({ imageUrl, scale }) => {
    const image = new Image(); image.src = imageUrl; await image.decode();
    const canvas = document.createElement('canvas'); canvas.width = image.width * scale; canvas.height = image.height * scale;
    const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    const factor = image.width / 1400 * scale;
    const width = Math.round(340 * factor), height = Math.round(340 * factor), data = ctx.getImageData(Math.round(1030 * factor), Math.round(860 * factor), width, height);
    return { width, height, data: Array.from(data.data) };
  }, { imageUrl: `data:image/${bytes[0] === 0xff ? 'jpeg' : 'png'};base64,${bytes.toString('base64')}`, scale });
  const code = jsQR(new Uint8ClampedArray(pixels.data), pixels.width, pixels.height);
  assert(code, `The actual ${scale === 1 ? 'full-size' : '700px'} exported postcard must be scannable`);
  return code.data;
}

export async function checkPostcardSharing({ page, check, base, appUrl, bytes }) {
  const source = await page.evaluate(() => ({ selection: structuredClone(window.duckrobe.state.selection), colors: { ...window.duckrobe.state.colors } }));
  let link;
  await check(`${base} actual PNG and 700px postcard QR, copy fallback and native-share payload`, async () => {
    link = await scanPostcard(page, bytes); assert.equal(await scanPostcard(page, bytes, .5), link);
    assert.deepEqual(readSharedLook(new URL(link).hash), source);
    // Browser API fixtures never write the user's clipboard or send a file.
    await page.evaluate(() => {
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async value => { window.__copiedLook = value; } } });
      Object.defineProperty(navigator, 'canShare', { configurable: true, value: ({ files }) => files?.[0]?.type === 'image/png' });
      Object.defineProperty(navigator, 'share', { configurable: true, value: async data => { window.__sharedPostcard = { url: data.url, name: data.files?.[0]?.name, size: data.files?.[0]?.size }; } });
    });
    await page.locator('[data-photo-share]').click(); assert.equal(await page.locator('.journal-sharing input').inputValue(), link);
    await page.locator('[data-share-copy]').click(); assert.equal(await page.evaluate(() => window.__copiedLook), link);
    assert((await page.locator('[data-share-status]').textContent()).length > 0);
    await page.evaluate(() => { navigator.clipboard.writeText = async () => { throw new DOMException('Blocked for this fixture', 'NotAllowedError'); }; });
    await page.locator('[data-share-copy]').click();
    assert(await page.locator('.journal-sharing input').evaluate(input => document.activeElement === input && input.selectionEnd === input.value.length));
    await page.locator('[data-share-native]').click(); await page.waitForFunction(() => window.__sharedPostcard);
    const shared = await page.evaluate(() => window.__sharedPostcard); assert.equal(shared.url, link); assert(shared.name.endsWith('.png')); assert(shared.size > 10000);
    await page.locator('[data-journal-close]').focus(); await page.keyboard.press('Shift+Tab'); assert(await page.locator('[data-share-native]').evaluate(node => node === document.activeElement));
  });
  await check(`${base} independent recipient restores exact pieces/colors, saves, reloads and rejects damaged links`, async () => {
    const context = await page.context().browser().newContext({ viewport: { width: 1440, height: 900 } });
    const receiver = await context.newPage(), errors = []; receiver.on('pageerror', error => errors.push(error.message));
    const prior = { language: 'zh', colorLocked: true, favorites: [`look:${OUTFITS[0].id}`], selection: OUTFITS[1].selection,
      colors: { shell: '#010203', accent: '#040506' }, saved: [{ id: 'previous-keepsake', selection: OUTFITS[1].selection, colors: { shell: '#010203', accent: '#040506' }, date: '2026-01-01' }] };
    await context.addInitScript(prior => { if (!localStorage.getItem('duckrobe.wardrobe.v2')) localStorage.setItem('duckrobe.wardrobe.v2', JSON.stringify(prior)); }, prior);
    const ready = () => receiver.waitForFunction(() => window.duckrobe?.ready);
    const look = () => receiver.evaluate(() => ({ selection: structuredClone(window.duckrobe.state.selection), colors: { ...window.duckrobe.state.colors } }));
    try {
      // Only remap the host/base to the isolated build. The scanned payload
      // is exactly the one shipped in the postcard, with no sender storage.
      await receiver.goto(appUrl + new URL(link).hash); await ready(); assert.deepEqual(await look(), source);
      assert.deepEqual(await receiver.evaluate(() => window.duckrobe.rig.metadata.bodyColors), source.colors);
      assert(await receiver.locator('#shared-look-note').isVisible()); assert.equal(new URL(receiver.url()).hash, '');
      assert.deepEqual(await receiver.evaluate(() => ({ locked: window.duckrobe.state.colorLocked, favorites: [...window.duckrobe.state.favorites], saved: window.duckrobe.state.saved.map(look => look.id) })), { locked: true, favorites: prior.favorites, saved: ['previous-keepsake'] });
      await receiver.locator('#undo-look').click(); assert.deepEqual(await look(), { selection: normalizeSelection(prior.selection), colors: prior.colors });
      await receiver.goto(appUrl + new URL(link).hash); await receiver.waitForFunction(() => !document.querySelector('#shared-look-note').hidden);
      await receiver.locator('#save-look').click(); assert.equal(await receiver.evaluate(() => window.duckrobe.state.saved.length), 2);
      await receiver.evaluate(() => window.duckrobe.selectLook('harbour-day')); const changed = await look();
      await receiver.reload(); await ready(); assert.deepEqual(await look(), changed); assert.equal(await receiver.evaluate(() => window.duckrobe.state.saved.length), 2);
      await receiver.goto(appUrl + '#look=v1.broken.00000000'); await ready(); assert.deepEqual(await look(), changed);
      assert.match(await receiver.locator('#toast').textContent(), /无效|损坏/);
      const bare = { selection: normalizeSelection({}), colors: { shell: '#aabbcc', accent: '#eeddff' } };
      await receiver.evaluate(hash => { location.hash = hash; }, new URL(createLookLink(bare)).hash);
      await receiver.waitForFunction(() => !document.querySelector('#shared-look-note').hidden); assert.deepEqual(await look(), bare);
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  });
}

export async function checkAlbumSharing({ page, check, base }) {
  await check(`${base} stored album exports regenerate a sharp postage QR`, async () => {
    await page.locator('[data-memory-share]').click(); const link = await page.locator('.journal-sharing input').inputValue();
    const storedImage = await page.evaluate(() => JSON.parse(localStorage.getItem('duckrobe.travels.v1')).photos[0].image);
    assert.equal(await scanPostcard(page, Buffer.from(storedImage.split(',')[1], 'base64')), link);
    const pending = page.waitForEvent('download'); await page.locator('[data-memory-download]').click();
    const bytes = await readFile(await (await pending).path());
    assert.equal(bytes.readUInt32BE(16), 1400); assert.equal(bytes.readUInt32BE(20), 1200);
    assert.equal(await scanPostcard(page, bytes), link); assert.equal(await scanPostcard(page, bytes, .5), link);
  });
}

export async function checkLegacyPostcard({ page, check, base, appUrl }) {
  await check(`${base} legacy 700×550 album, intact photograph and incoming link during playground`, async () => {
    const context = await page.context().browser().newContext({ viewport: { width: 1440, height: 900 } }), receiver = await context.newPage();
    await context.addInitScript(() => {
      localStorage.setItem('duckrobe.wardrobe.v2', JSON.stringify({ language: 'zh' }));
      window.__legacyWorkers = 0; const NativeWorker = window.Worker;
      window.Worker = class extends NativeWorker {
        constructor(...args) { super(...args); window.__legacyWorkers++; }
        terminate() { window.__legacyWorkers--; super.terminate(); }
      };
    });
    const source = { selection: normalizeSelection(OUTFITS.find(look => look.id === 'harbour-day').selection), colors: { shell: '#acbdce', accent: '#efdecd' } };
    try {
      await receiver.goto(appUrl); await receiver.waitForFunction(() => window.duckrobe?.ready);
      await receiver.evaluate(source => {
        // An old-format image fixture includes a red photograph edge. Export
        // must retain that edge, rather than crop off the duck's feet.
        const canvas = document.createElement('canvas'); canvas.width = 700; canvas.height = 550;
        const ctx = canvas.getContext('2d'); ctx.fillStyle = '#f4ead5'; ctx.fillRect(0, 0, 700, 550); ctx.fillStyle = '#b5c8b4'; ctx.fillRect(20, 20, 660, 425); ctx.fillStyle = '#ef4422'; ctx.fillRect(20, 435, 660, 10);
        localStorage.setItem('duckrobe.travels.v1', JSON.stringify({ photos: [{ id: 'legacy-card', worldId: 'harbor', place: '海盐港湾', date: '2026-01-01T12:00:00Z', ...source, image: canvas.toDataURL('image/jpeg', .85) }], records: {} }));
      }, source);
      await receiver.locator('#open-playground').click(); await receiver.waitForFunction(() => document.querySelector('.playground-view')?.dataset.playgroundStatus === 'running', null, { timeout: 65000 });
      await receiver.locator('[data-album]').click(); await receiver.locator('[data-memory-share]').click();
      const link = await receiver.locator('.journal-sharing input').inputValue(); assert.deepEqual(readSharedLook(new URL(link).hash), source);
      await receiver.waitForFunction(() => {
        const source = JSON.parse(localStorage.getItem('duckrobe.travels.v1')).photos[0].image;
        return document.querySelector('[data-memory] img').src !== source;
      });
      const preview = await receiver.locator('[data-memory] img').getAttribute('src');
      assert.equal(await scanPostcard(receiver, Buffer.from(preview.split(',')[1], 'base64')), link);
      const pending = receiver.waitForEvent('download'); await receiver.locator('[data-memory-download]').click(); const bytes = await readFile(await (await pending).path());
      assert.equal(await scanPostcard(receiver, bytes), link); assert.equal(await scanPostcard(receiver, bytes, .5), link);
      const edge = await receiver.evaluate(async url => {
        const image = new Image(); image.src = url; await image.decode(); const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height; const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0); return Array.from(ctx.getImageData(700, 852, 1, 1).data);
      }, `data:image/png;base64,${bytes.toString('base64')}`); assert(edge[0] > 200 && edge[1] < 120);
      assert.equal(await receiver.evaluate(() => window.__legacyWorkers), 1);
      await receiver.evaluate(hash => { location.hash = hash; }, new URL(link).hash);
      await receiver.waitForFunction(() => !document.querySelector('#playground-dialog').open);
      assert.deepEqual(await receiver.evaluate(() => ({ selection: structuredClone(window.duckrobe.state.selection), colors: { ...window.duckrobe.state.colors } })), source);
      assert.equal(await receiver.evaluate(() => window.__legacyWorkers), 0);
    } finally { await context.close(); }
  });
}
