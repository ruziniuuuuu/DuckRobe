import assert from 'node:assert/strict';
import { deflateSync, strToU8 } from 'fflate';
import { ITEMS, OUTFITS, normalizeSelection, equipItem } from '../src/outfits.js';
import { normalizeRobotColors } from '../src/robot.js';
import { createLookLink, decodeSharedLook, encodeSharedLook, readSharedLook } from '../src/shared-look.js';

const palettes = [{ shell: '#123456', accent: '#fedcba' }, { shell: '#FFFFFF', accent: '#000000' }];
for (const outfit of OUTFITS) for (const colors of [outfit.bodyColors, ...palettes]) {
  const source = { selection: normalizeSelection(outfit.selection), colors: normalizeRobotColors(colors) };
  const link = createLookLink(source, 'https://example.com/DuckRobe/');
  assert.deepEqual(readSharedLook(new URL(link).hash), source);
  assert.equal(new URL(link).pathname, '/DuckRobe/');
}
let selection = normalizeSelection({});
for (const item of ITEMS) {
  selection = equipItem(selection, item.id);
  const source = { selection, colors: palettes[0] };
  assert.deepEqual(decodeSharedLook(encodeSharedLook(source)), source);
}
assert.deepEqual(decodeSharedLook(encodeSharedLook({ selection: {}, colors: palettes[1] })), { selection: normalizeSelection({}), colors: normalizeRobotColors(palettes[1]) });
console.log(`PASS ${OUTFITS.length} complete looks with three palettes, ${ITEMS.length} mixed-item transitions, three accessory regions and bare duck`);

// Construct external v1 messages, including catalogue entries a future
// producer might know but this recipient cannot wear exactly.
function message(data) {
  const bytes = strToU8(typeof data === 'string' ? data : JSON.stringify(data));
  let hash = 2166136261; for (const byte of bytes) hash = Math.imul(hash ^ byte, 16777619);
  return `v1.${Buffer.from(deflateSync(bytes)).toString('base64url')}.${(hash >>> 0).toString(16).padStart(8, '0')}`;
}
const empty = Array(7).fill(null);
assert.equal(decodeSharedLook(message([[...empty.slice(0, 6), 'unavailable-shoes'], '123456fedcba'])), null);
assert.equal(decodeSharedLook(message([[ITEMS.find(item => item.slot === 'body').id, ...empty.slice(1)], '123456fedcba'])), null);
assert.equal(decodeSharedLook(message([[...empty.slice(0, 3), ITEMS.find(item => item.region === 'back').id, ...empty.slice(4)], '123456fedcba'])), null);
for (const payload of [[empty, 'red'], [empty.slice(1), '123456fedcba'], [empty, '123456fedcba', 'extra'], { selection: empty }, [empty.map(() => 3), '123456fedcba'], JSON.stringify([empty, '123456fedcba']) + ' '.repeat(10000)]) {
  assert.equal(decodeSharedLook(message(payload)), null);
}
const token = encodeSharedLook({ selection: OUTFITS[0].selection, colors: palettes[0] });
for (const damaged of [undefined, '', token.slice(0, -1), token.replace(/^v1/, 'v2'), token.slice(0, -8) + '00000000', 'v1.' + 'A'.repeat(800) + '.00000000']) assert.equal(decodeSharedLook(damaged), null);
assert.equal(readSharedLook('#other=hello'), undefined);
assert.equal(readSharedLook('#look=broken'), null);
assert.deepEqual(readSharedLook(`#other=hello&look=${token}`), decodeSharedLook(token));
console.log('PASS damaged codes, unavailable items, wrong slots/regions, future versions and bounded decompression reject without partial restoration');
