import { deflateSync, inflateSync, strFromU8, strToU8 } from 'fflate';
import { ITEMS, OUTFITS, normalizeSelection, selectedItemIds, selectionKey } from './outfits.js';
import { normalizeRobotColors } from './robot.js';
import { localized, t } from './i18n.js';

const itemById = new Map(ITEMS.map(item => [item.id, item]));
const PUBLIC_URL = 'https://ruziniuuuuu.github.io/DuckRobe/';
const MAX_BYTES = 1024;
const values = selection => [selection.hat, selection.eyewear, selection.body, ...['chest', 'side', 'back'].map(region => selection.accessory[region]), selection.legwear];

// A checksum catches damaged/copied codes; it is not an authentication token.
function checksum(bytes) {
  let hash = 2166136261;
  for (const byte of bytes) hash = Math.imul(hash ^ byte, 16777619);
  return (hash >>> 0).toString(16).padStart(8, '0');
}
export function encodeSharedLook({ selection, colors }) {
  const chosen = normalizeSelection(selection), palette = normalizeRobotColors(colors);
  const bytes = strToU8(JSON.stringify([values(chosen), `${palette.shell.slice(1)}${palette.accent.slice(1)}`]));
  const encoded = btoa(String.fromCharCode(...deflateSync(bytes, { level: 9 }))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `v1.${encoded}.${checksum(bytes)}`;
}
export function decodeSharedLook(token) {
  if (typeof token !== 'string' || token.length > 768 || !/^v1\.[A-Za-z0-9_-]+\.[a-f\d]{8}$/.test(token)) return null;
  try {
    const [, encoded, sum] = token.split('.');
    const compressed = Uint8Array.from(atob(encoded.replace(/-/g, '+').replace(/_/g, '/')), character => character.charCodeAt(0));
    const bytes = inflateSync(compressed, { out: new Uint8Array(MAX_BYTES + 1) });
    if (bytes.length > MAX_BYTES || checksum(bytes) !== sum) return null;
    const data = JSON.parse(strFromU8(bytes));
    if (!Array.isArray(data) || data.length !== 2 || !Array.isArray(data[0]) || data[0].length !== 7 || typeof data[1] !== 'string' || !/^[a-f\d]{12}$/.test(data[1])) return null;
    const ids = data[0];
    if (ids.some(id => id !== null && (typeof id !== 'string' || !itemById.has(id)))) return null;
    const selection = normalizeSelection({ hat: ids[0], eyewear: ids[1], body: ids[2], accessory: { chest: ids[3], side: ids[4], back: ids[5] }, legwear: ids[6] });
    // Reject unavailable items and wrong attachment positions instead of
    // silently wearing a different look after a catalogue change.
    if (values(selection).some((id, index) => id !== ids[index])) return null;
    return { selection, colors: { shell: `#${data[1].slice(0, 6)}`, accent: `#${data[1].slice(6)}` } };
  } catch { return null; }
}
export function readSharedLook(hash) {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  return params.has('look') ? decodeSharedLook(params.get('look')) : undefined;
}
export function createLookLink(look, base) {
  // A local preview should still produce a link friends can open. Deployed
  // forks retain their own origin/base; there is no short-link service.
  if (!base) {
    const local = typeof location === 'undefined' || /^(localhost|127\.[\d.]+|\[::1\])$/.test(location.hostname);
    base = local ? PUBLIC_URL : new URL(import.meta.env?.BASE_URL || '/', location.origin).href;
  }
  const url = new URL(base); url.search = ''; url.hash = `look=${encodeSharedLook(look)}`;
  return url.href;
}
export function describeSharedLook(look, language) {
  const selection = normalizeSelection(look.selection);
  const outfit = OUTFITS.find(outfit => selectionKey(outfit.selection) === selectionKey(selection));
  const pieces = selectedItemIds(selection).map(id => localized(itemById.get(id), language));
  return { name: outfit ? localized(outfit, language) : t(pieces.length ? 'mixName' : 'bareName', language), pieces, colors: normalizeRobotColors(look.colors) };
}
