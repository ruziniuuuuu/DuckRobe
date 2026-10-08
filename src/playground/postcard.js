import qrcode from 'qrcode-generator';
import { createLookLink, describeSharedLook } from '../shared-look.js';
import { drawMark } from './signage.js';

const PAPER = '#f4ead5', INK = '#40594c';
export const POSTCARD_WIDTH = 1400, POSTCARD_HEIGHT = 1200;

function outfitStamp(ctx, photo, language) {
  const ink = '#765744', code = qrcode(0, 'M'); code.addData(createLookLink(photo)); code.make();
  const modules = code.getModuleCount(), cell = Math.max(2, Math.floor(280 / (modules + 8) / 2) * 2), size = (modules + 8) * cell;
  const left = Math.round((1198 - size / 2) / 2) * 2, top = Math.round((1030 - size / 2) / 2) * 2;
  ctx.save();
  // Print onto the same paper as the signature. The fine perforation and
  // cancellation mark stay outside the QR's four-module quiet zone.
  ctx.strokeStyle = '#9c756068'; ctx.lineWidth = 1.4; ctx.lineCap = 'round'; ctx.setLineDash([1, 6]);
  ctx.beginPath(); ctx.roundRect(left - 8, top - 28, size + 16, size + 56, 4); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = ink; ctx.textAlign = 'center'; ctx.font = '16px Georgia'; ctx.fillText('DUCKROBE / POST', 1198, top - 10, size);
  ctx.fillStyle = PAPER; ctx.fillRect(left, top, size, size); ctx.fillStyle = ink;
  const origins = [[0, 0], [modules - 7, 0], [0, modules - 7]];
  for (let row = 0; row < modules; row++) for (let col = 0; col < modules; col++) {
    if (origins.some(([x, y]) => col >= x && col < x + 7 && row >= y && row < y + 7)) continue;
    if (code.isDark(row, col)) ctx.fillRect(left + (col + 4) * cell, top + (row + 4) * cell, cell, cell);
  }
  for (const [col, row] of origins) {
    const x = left + (col + 4) * cell, y = top + (row + 4) * cell;
    for (const [offset, width, color, radius] of [[0, 7, ink, 1], [1, 5, PAPER, .6], [2, 3, ink, .4]]) {
      ctx.fillStyle = color; ctx.beginPath(); ctx.roundRect(x + offset * cell, y + offset * cell, width * cell, width * cell, radius * cell); ctx.fill();
    }
  }
  ctx.fillStyle = ink; ctx.font = language === 'zh' ? '18px sans-serif' : '18px Georgia';
  ctx.fillText(language === 'zh' ? '扫码 · 收下这身穿搭' : 'Scan & wear this look', 1198, top + size + 19, size);

  ctx.save(); ctx.globalAlpha = .48; ctx.translate(972, 902); ctx.rotate(-.12);
  ctx.strokeStyle = ctx.fillStyle = '#9c7560'; ctx.lineWidth = 1.5;
  for (const radius of [33, 29]) { ctx.beginPath(); ctx.arc(0, 0, radius, 0, Math.PI * 2); ctx.stroke(); }
  ctx.font = '10px Georgia'; ctx.fillText('DUCKROBE', 0, -15); ctx.fillText('POST', 0, 25);
  drawMark(ctx, -20, -14, 40, '#9c7560');
  for (let line = 0; line < 3; line++) {
    ctx.beginPath(); ctx.moveTo(14, -14 + line * 8);
    ctx.bezierCurveTo(30, -22 + line * 8, 44, -6 + line * 8, 62, -14 + line * 8); ctx.stroke();
  }
  ctx.restore(); ctx.restore();
}

function signature(canvas, photo, language) {
  const ctx = canvas.getContext('2d'), look = describeSharedLook(photo, language);
  ctx.fillStyle = PAPER; ctx.fillRect(0, 900, POSTCARD_WIDTH, 300);
  ctx.fillStyle = '#9c7560'; ctx.font = '22px Georgia'; ctx.fillText(`DUCKROBE / ${photo.place}`, 54, 938, 930);
  ctx.fillStyle = INK; ctx.font = '500 36px Georgia'; ctx.fillText(photo.look || look.name, 54, 986, 930);
  ctx.font = '23px sans-serif';
  let line = '', y = 1027;
  for (const piece of look.pieces) {
    const next = line ? `${line} · ${piece}` : piece;
    if (line && ctx.measureText(next).width > 930) { ctx.fillText(line, 54, y, 930); y += 30; line = piece; }
    else line = next;
  }
  if (line) ctx.fillText(line, 54, y, 930);
  for (const [index, color] of Object.values(look.colors).entries()) {
    ctx.beginPath(); ctx.arc(65 + index * 32, 1140, 11, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill(); ctx.strokeStyle = '#826d5766'; ctx.lineWidth = 1; ctx.stroke();
  }
  ctx.fillStyle = '#826d57'; ctx.font = '21px sans-serif';
  ctx.fillText(new Date(photo.isoDate || photo.date).toLocaleDateString(language === 'zh' ? 'zh-CN' : 'en-GB'), 130, 1148, 470);
  ctx.font = '18px Georgia'; ctx.textAlign = 'right'; ctx.fillText(photo.badge || 'LITTLE TRAVELS', 1000, 1148, 250); ctx.textAlign = 'left';

  outfitStamp(ctx, photo, language);
  return canvas;
}
function blank() {
  const canvas = document.createElement('canvas'); canvas.width = POSTCARD_WIDTH; canvas.height = POSTCARD_HEIGHT;
  const ctx = canvas.getContext('2d'); ctx.fillStyle = PAPER; ctx.fillRect(0, 0, canvas.width, canvas.height);
  return canvas;
}
export function makePostcard(renderer, scene, camera, photo, language) {
  renderer.render(scene, camera);
  const canvas = blank(), ctx = canvas.getContext('2d'), image = renderer.domElement;
  const scale = Math.min(1320 / image.width, 820 / image.height), width = image.width * scale, height = image.height * scale;
  ctx.fillStyle = '#dcd5bf'; ctx.fillRect(40, 40, 1320, 820); ctx.drawImage(image, 40 + (1320 - width) / 2, 40 + (820 - height) / 2, width, height);
  return signature(canvas, photo, language);
}
export async function restorePostcard(photo, language) {
  const image = new Image(); image.src = photo.image; await image.decode();
  const canvas = blank();
  // Older album pages used a 1400×1100 card. Keep the photograph in place
  // and typeset a fresh signature/QR instead of enlarging a blurry code.
  const ctx = canvas.getContext('2d');
  if (photo.postcardVersion === 2) ctx.drawImage(image, 0, 0, image.naturalWidth, image.naturalHeight * 860 / POSTCARD_HEIGHT, 0, 0, POSTCARD_WIDTH, 860);
  else {
    const sx = image.naturalWidth / 1400, sy = image.naturalHeight / 1100, width = 1320 * 820 / 850;
    ctx.fillStyle = '#dcd5bf'; ctx.fillRect(40, 40, 1320, 820);
    ctx.drawImage(image, 40 * sx, 40 * sy, 1320 * sx, 850 * sy, 40 + (1320 - width) / 2, 40, width, 820);
  }
  return signature(canvas, photo, photo.language || language);
}
