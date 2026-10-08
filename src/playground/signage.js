import * as THREE from 'three';
import { formatRaceTime } from './activity.js';

// The same single-eyed head geometry as public/brand/logo-mark.svg, drawn
// locally so every sign shares the mark without asynchronous image loading.
export function drawMark(ctx, x, y, size, color) {
  ctx.save(); ctx.translate(x, y); ctx.scale(size / 64, size / 64);
  ctx.strokeStyle = ctx.fillStyle = color; ctx.lineWidth = 3.4; ctx.lineCap = ctx.lineJoin = 'round';
  ctx.stroke(new Path2D('M7 30c0-11 9-18 21-18h10c11 0 18 7 19 18l1 9c1 8-4 13-13 13H20C12 52 7 47 7 39Z'));
  ctx.stroke(new Path2D('M8 38h19c4 0 7 2 8 5'));
  ctx.beginPath(); ctx.arc(44, 30, 9, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(44, 30, 3.7, 0, Math.PI * 2); ctx.fill(); ctx.restore();
}

// Canvas signs own their maps; the environment owns the meshes using them.
function createSurfaces() {
  const textures = [];
  function surface(width, height, draw) {
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d'); draw(ctx, width, height);
    const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 4; textures.push(map); return map;
  }
  return { surface, dispose: () => textures.forEach(texture => texture.dispose()) };
}
function weave(ctx, width, height) {
  ctx.fillStyle = '#ffffff08';
  for (let y = 0; y < height; y += 4) ctx.fillRect(0, y, width, 1);
  for (let x = 0; x < width; x += 4) ctx.fillRect(x, 0, 1, height);
}
// Only the clock changes at runtime, at the same 10 Hz cadence as the HUD.
export function createCircuitSigns() {
  if (typeof document === 'undefined') return null;
  const { surface, dispose } = createSurfaces();
  const mark = surface(512, 512, ctx => drawMark(ctx, 16, 16, 480, '#384238'));
  const flag = surface(512, 1536, (ctx, w, h) => {
    ctx.fillStyle = '#253a4b'; ctx.fillRect(0, 0, w, h); weave(ctx, w, h);
    ctx.strokeStyle = '#c7bb9848'; ctx.lineWidth = 2; ctx.setLineDash([6, 5]); ctx.strokeRect(18, 18, w - 36, h - 36); ctx.setLineDash([]);
    drawMark(ctx, 91, 85, 330, '#f2e7cf');
    ctx.save(); ctx.translate(256, 875); ctx.rotate(Math.PI / 2);
    ctx.fillStyle = '#f2e7cf'; ctx.font = '500 126px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.letterSpacing = '8px'; ctx.fillText('DUCKROBE', 0, 0); ctx.restore();
    ctx.fillStyle = '#c9b895'; ctx.font = '500 29px sans-serif'; ctx.textAlign = 'center'; ctx.letterSpacing = '6px'; ctx.fillText('CIRCUIT', 256, 1435);
  });
  const workshop = surface(768, 768, (ctx, w, h) => {
    ctx.fillStyle = '#dfd7c4'; ctx.fillRect(0, 0, w, h); weave(ctx, w, h);
    ctx.strokeStyle = '#827b6544'; ctx.lineWidth = 5; ctx.strokeRect(22, 22, w - 44, h - 44);
    drawMark(ctx, 148, 95, 472, '#354337');
    ctx.fillStyle = '#354337'; ctx.textAlign = 'center'; ctx.font = '500 45px sans-serif'; ctx.letterSpacing = '9px'; ctx.fillText('DUCKROBE', w / 2, 613);
    ctx.font = '26px sans-serif'; ctx.letterSpacing = '5px'; ctx.fillText('CIRCUIT WORKSHOP', w / 2, 674);
  });
  const motto = surface(512, 704, (ctx, w, h) => {
    ctx.fillStyle = '#303832'; ctx.fillRect(0, 0, w, h); ctx.strokeStyle = '#d8c6a15c'; ctx.lineWidth = 2; ctx.strokeRect(22, 22, w - 44, h - 44);
    ctx.fillStyle = '#f0dfbc'; ctx.textAlign = 'center'; ctx.font = '500 49px sans-serif'; ctx.letterSpacing = '3px';
    ['GOOD', 'WALKS', 'BRIGHTER', 'DAYS'].forEach((line, i) => ctx.fillText(line, w / 2, 167 + i * 83));
    ctx.fillRect(227, 509, 58, 3); ctx.font = '22px sans-serif'; ctx.letterSpacing = '4px'; ctx.fillText('DUCKROBE', w / 2, 606);
  });
  const clock = surface(1024, 224, () => {});
  let previous;
  function update(activity = { elapsed: 0, started: false, laps: 0 }) {
    const finish = activity.lastLap && activity.elapsed < 4, text = formatRaceTime(finish ? activity.lastLap.duration : activity.elapsed);
    const delta = activity.lastLap?.delta, footer = finish ? delta === null ? 'FIRST LITTLE LAP' : `${delta <= 0 ? '−' : '+'}${Math.abs(delta).toFixed(2)}s / DEVICE BEST` : activity.best === null || activity.best === undefined ? 'GOOD WALKS / BRIGHTER DAYS' : `BEST ${formatRaceTime(activity.best)}`;
    const stamp = `${Math.floor(activity.elapsed * 10)}:${activity.started}:${activity.laps}:${footer}`;
    if (stamp === previous) return; previous = stamp;
    const ctx = clock.image.getContext('2d');
    ctx.fillStyle = '#17201e'; ctx.fillRect(0, 0, 1024, 224);
    ctx.fillStyle = '#a69e82'; ctx.font = '500 26px sans-serif'; ctx.letterSpacing = '6px'; ctx.textAlign = 'left'; ctx.fillText('DUCKROBE / CIRCUIT', 35, 37);
    ctx.textAlign = 'right'; ctx.fillText(`${finish ? 'FINISH' : 'LAP'} ${String(finish ? activity.laps : activity.laps + 1).padStart(2, '0')}`, 989, 37);
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.font = '500 126px monospace'; ctx.letterSpacing = '0px'; ctx.fillStyle = finish && delta !== null && delta <= 0 ? '#c9e2b5' : '#fff1d5'; ctx.fillText(text, 512, 163);
    ctx.font = '22px sans-serif'; ctx.fillStyle = '#b8bd9f'; ctx.fillText(footer, 512, 206);
    clock.needsUpdate = true;
  }
  update();
  return { mark, flag, workshop, motto, clock, update, dispose };
}

export function createParkSigns() {
  if (typeof document === 'undefined') return null;
  const { surface, dispose } = createSurfaces();
  const mark = surface(512, 512, ctx => drawMark(ctx, 16, 16, 480, '#40594c'));
  const goldMark = surface(512, 512, ctx => drawMark(ctx, 16, 16, 480, '#a48044'));
  const entrance = surface(1400, 512, ctx => {
    drawMark(ctx, 610, 6, 180, '#9e7d48');
    ctx.fillStyle = '#40594c'; ctx.textAlign = 'center'; ctx.font = '600 126px Georgia'; ctx.letterSpacing = '4px'; ctx.fillText('DUCKROBE', 700, 300);
    ctx.font = '600 96px Georgia'; ctx.letterSpacing = '10px'; ctx.fillText('PARK', 700, 411);
    ctx.strokeStyle = '#bfa472'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(330, 365); ctx.lineTo(447, 365); ctx.moveTo(953, 365); ctx.lineTo(1070, 365); ctx.stroke();
  });
  const banner = surface(384, 640, (ctx, w, h) => {
    ctx.fillStyle = '#c28c78'; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(w, 0); ctx.lineTo(w, h - 105); ctx.lineTo(w / 2, h); ctx.lineTo(0, h - 105); ctx.closePath(); ctx.fill();
    weave(ctx, w, h - 105); ctx.strokeStyle = '#f1e0bf'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(14, 14); ctx.lineTo(w - 14, 14); ctx.lineTo(w - 14, h - 114); ctx.lineTo(w / 2, h - 20); ctx.lineTo(14, h - 114); ctx.closePath(); ctx.stroke();
    drawMark(ctx, 57, 107, 270, '#f7e8c9'); ctx.fillStyle = '#f7e8c9'; ctx.font = '500 33px Georgia'; ctx.textAlign = 'center'; ctx.letterSpacing = '5px'; ctx.fillText('PARK', w / 2, 447);
  });
  const ticket = surface(768, 192, (ctx, w, h) => {
    ctx.fillStyle = '#a95f4f'; ctx.fillRect(0, 0, w, h); ctx.strokeStyle = '#eedabd'; ctx.lineWidth = 4; ctx.strokeRect(12, 12, w - 24, h - 24);
    ctx.fillStyle = '#fff0d4'; ctx.textAlign = 'center'; ctx.font = '600 85px Georgia'; ctx.letterSpacing = '8px'; ctx.fillText('TICKETS', w / 2, 125);
  });
  const music = surface(384, 512, (ctx, w, h) => {
    ctx.fillStyle = '#31483c'; ctx.fillRect(0, 0, w, h); ctx.strokeStyle = '#bfa472'; ctx.lineWidth = 3; ctx.strokeRect(16, 16, w - 32, h - 32);
    ctx.fillStyle = '#f3e5c8'; ctx.textAlign = 'center'; ctx.font = '190px serif'; ctx.fillText('♫', w / 2, 280);
    ctx.font = '28px Georgia'; ctx.letterSpacing = '3px'; ctx.fillText('MUSIC GARDEN', w / 2, 379);
    ctx.font = '22px Georgia'; ctx.fillText('TAKE A LITTLE BREAK', w / 2, 432);
  });
  const directions = ['CAROUSEL', 'GARDEN', 'BIG WHEEL', 'PLAYGROUND'].map((text, i) => surface(512, 128, (ctx, w, h) => {
    ctx.fillStyle = ['#aa6755', '#70856b', '#557384', '#b5965c'][i]; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#f8e9cb'; ctx.font = '600 40px Georgia'; ctx.textAlign = 'center'; ctx.letterSpacing = '2px'; ctx.fillText(text, w / 2, 80, 450);
  }));
  return { mark, goldMark, entrance, banner, ticket, music, directions, update() {}, dispose };
}

export function createHarborSigns() {
  if (typeof document === 'undefined') return null;
  const { surface, dispose } = createSurfaces();
  const mark = surface(512, 512, ctx => drawMark(ctx, 16, 16, 480, '#315975'));
  const post = surface(1024, 256, (ctx, w, h) => {
    ctx.fillStyle = '#315975'; ctx.fillRect(0, 0, w, h); weave(ctx, w, h);
    ctx.strokeStyle = '#d8c6a1'; ctx.lineWidth = 4; ctx.strokeRect(12, 12, w - 24, h - 24);
    drawMark(ctx, 24, 35, 170, '#f4e8cc'); ctx.fillStyle = '#f4e8cc'; ctx.textAlign = 'center'; ctx.font = '600 72px Georgia'; ctx.fillText('DUCKROBE POST', 600, 111);
    ctx.font = '28px Georgia'; ctx.letterSpacing = '7px'; ctx.fillText('LETTERS BY THE SEA', 600, 177);
  });
  const menu = surface(384, 640, (ctx, w, h) => {
    ctx.fillStyle = '#40594c'; ctx.fillRect(0, 0, w, h); ctx.strokeStyle = '#c7b38c'; ctx.lineWidth = 3; ctx.strokeRect(16, 16, w - 32, h - 32);
    ctx.fillStyle = '#f4ead5'; ctx.textAlign = 'center'; ctx.font = '40px Georgia'; ctx.fillText('SEA SALT', w / 2, 105); ctx.fillText('CAFÉ', w / 2, 160);
    ctx.font = '29px Georgia'; ['COFFEE', 'LEMON TEA', 'A LITTLE REST'].forEach((line, i) => ctx.fillText(line, w / 2, 280 + i * 63));
    drawMark(ctx, 132, 477, 120, '#c7b38c');
  });
  return { mark, post, menu, update() {}, dispose };
}
