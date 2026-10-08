import * as THREE from 'three';

// Local, repeatable surface maps keep the scenes self-contained. Dimensions
// are tuned for native metre UVs on the paths, rather than screen-space noise.
export function createSurfaceMaps(kind) {
  if (typeof document === 'undefined') return {};
  const size = 512, canvas = document.createElement('canvas'), height = document.createElement('canvas');
  canvas.width = canvas.height = height.width = height.height = size;
  const ctx = canvas.getContext('2d'), bump = height.getContext('2d');
  let seed = 173;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  if (kind === 'leaf') {
    ctx.clearRect(0, 0, size, size);
    const shade = ctx.createLinearGradient(0, 0, size, size); shade.addColorStop(0, '#e3e0af'); shade.addColorStop(.5, '#b8c888'); shade.addColorStop(1, '#718b50');
    ctx.fillStyle = shade; ctx.beginPath(); ctx.moveTo(256, 15); ctx.bezierCurveTo(485, 165, 430, 372, 256, 496);
    ctx.bezierCurveTo(82, 372, 27, 165, 256, 15); ctx.fill();
    ctx.strokeStyle = '#d1d2a080'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(256, 40); ctx.lineTo(256, 478); ctx.stroke();
    ctx.lineWidth = 3;
    for (let y = 110; y < 440; y += 48) for (const sign of [-1, 1]) { ctx.beginPath(); ctx.moveTo(256, y + 30); ctx.lineTo(256 + sign * (y < 280 ? y * .48 : (500 - y) * .60), y - 20); ctx.stroke(); }
  } else {
    const base = kind === 'asphalt' ? [72, 74, 73] : kind === 'grass' ? [100, 120, 60] : kind === 'wood' ? [207, 191, 166] : kind === 'paint' ? [239, 238, 232] : kind === 'sand' ? [209, 192, 155] : kind === 'roof' ? [215, 221, 207] : [185, 179, 165];
    const pixels = ctx.createImageData(size, size), heights = bump.createImageData(size, size);
    for (let i = 0; i < pixels.data.length; i += 4) {
      const x = i / 4 % size, y = Math.floor(i / 4 / size);
      const broad = Math.sin(x * Math.PI * 2 / size) * Math.cos(y * Math.PI * 4 / size) * 3;
      const grain = (random() - .5) * (kind === 'asphalt' ? 24 : 15), n = grain + broad;
      for (let channel = 0; channel < 3; channel++) { pixels.data[i + channel] = base[channel] + n; heights.data[i + channel] = 165 + grain * 3; }
      pixels.data[i + 3] = heights.data[i + 3] = 255;
    }
    ctx.putImageData(pixels, 0, 0); bump.putImageData(heights, 0, 0);
    if (kind === 'paving' || kind === 'stonePaving') {
      ctx.fillStyle = '#958779'; ctx.fillRect(0, 0, size, size); bump.fillStyle = '#424242'; bump.fillRect(0, 0, size, size);
      for (let row = 0; row < 8; row++) for (let col = -1; col < 5; col++) {
        const x = col * 128 + (row % 2) * 64, y = row * 64, shade = random() * 23, cool = random() * 5;
        ctx.fillStyle = kind === 'paving' ? `rgb(${178 + shade},${129 + shade + cool},${102 + shade + cool})` : `rgb(${164 + shade},${158 + shade + cool},${143 + shade + cool})`;
        ctx.beginPath(); ctx.roundRect(x + 2, y + 2, 124, 60, 3); ctx.fill();
        const face = ctx.createLinearGradient(x, y, x + 128, y + 64); face.addColorStop(0, '#fff8d817'); face.addColorStop(.5, '#00000000'); face.addColorStop(1, '#5748381a');
        ctx.fillStyle = face; ctx.fillRect(x + 5, y + 5, 118, 54);
        bump.fillStyle = '#999'; bump.fillRect(x + 2, y + 2, 124, 60); bump.fillStyle = '#dedede'; bump.fillRect(x + 5, y + 5, 118, 54);
        for (let i = 0; i < 110; i++) { ctx.fillStyle = i % 2 ? '#4d352c16' : '#ffe7c324'; ctx.fillRect(x + random() * 120 + 4, y + random() * 56 + 4, 1 + random() * 3, 1); }
        for (let i = 0; i < 3; i++) { ctx.fillStyle = '#6d625d45'; ctx.fillRect(x + 4 + random() * 116, y + (i % 2 ? 2 : 59), 2 + random() * 5, 2); }
      }
    } else if (kind === 'roof') {
      ctx.strokeStyle = '#56615460'; ctx.lineWidth = 3; bump.strokeStyle = '#555'; bump.lineWidth = 4;
      for (let row = 0; row < 8; row++) for (let col = -1; col < 9; col++) {
        const x = col * 64 + (row % 2) * 32, y = row * 64; ctx.strokeRect(x, y, 64, 64); bump.strokeRect(x, y, 64, 64);
      }
    } else if (kind === 'paint') {
      for (let i = 0; i < 1600; i++) { const x = random() * size, y = random() * size; ctx.fillStyle = '#575c4c55'; ctx.fillRect(x, y, 1 + random() * 4, 1 + random() * 2); }
    } else if (kind === 'wood') {
      for (let i = 0; i < 180; i++) {
        const x = random() * size, sway = random() * 10;
        ctx.strokeStyle = i % 3 ? '#72503028' : '#fff3d530'; ctx.lineWidth = .5 + random() * 2;
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.bezierCurveTo(x + sway, 170, x - sway, 340, x, size); ctx.stroke();
      }
      for (let i = 0; i < 9; i++) { const x = random() * size, y = random() * size; ctx.strokeStyle = '#6e4e3430'; for (let r = 2; r < 15; r += 3) { ctx.beginPath(); ctx.ellipse(x, y, r * .5, r * 2.5, 0, 0, Math.PI * 2); ctx.stroke(); } }
    } else if (kind === 'stone') {
      for (let i = 0; i < 2200; i++) { const x = random() * size, y = random() * size; ctx.fillStyle = i % 3 ? '#675d4922' : '#fff4dd35'; ctx.fillRect(x, y, 1 + random() * 3, 1 + random() * 2); }
    } else if (kind === 'grass') {
      for (let i = 0; i < 18000; i++) {
        const x = random() * size, y = random() * size, v = random();
        ctx.strokeStyle = v < .5 ? '#dae4a12c' : '#3b55292c'; ctx.lineWidth = .7;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (random() - .5) * 5, y - random() * 8 - 2); ctx.stroke();
      }
    } else if (kind === 'asphalt') {
      for (let i = 0; i < 35; i++) {
        const x = random() * size, y = random() * size, r = 20 + random() * 60;
        const patch = ctx.createRadialGradient(x, y, 0, x, y, r); patch.addColorStop(0, i % 2 ? '#d5d4c512' : '#15202012'); patch.addColorStop(1, '#00000000');
        ctx.fillStyle = patch; ctx.fillRect(x - r, y - r, r * 2, r * 2);
      }
      for (let i = 0; i < 6500; i++) { const x = random() * size, y = random() * size, v = random(); ctx.fillStyle = v < .5 ? '#c7bdb438' : '#171c1c30'; ctx.fillRect(x, y, 1 + v * 1.5, 1 + v); }
      ctx.strokeStyle = '#383a3428'; ctx.lineWidth = .8; ctx.beginPath(); ctx.moveTo(0, 186); ctx.lineTo(160, 200); ctx.lineTo(340, 174); ctx.lineTo(size, 186); ctx.stroke();
    }
  }
  const texture = source => { const map = new THREE.CanvasTexture(source); map.wrapS = map.wrapT = THREE.RepeatWrapping; map.anisotropy = 4; return map; };
  const map = texture(canvas); map.colorSpace = THREE.SRGBColorSpace;
  const repeat = kind === 'grass' ? 1 : ['paving', 'stonePaving'].includes(kind) ? 2 : kind === 'asphalt' ? 2.5 : 1;
  map.repeat.setScalar(repeat);
  if (kind === 'leaf') return { map };
  const bumpMap = texture(height); bumpMap.repeat.copy(map.repeat);
  return { map, bumpMap, bumpScale: kind === 'grass' ? .006 : ['paving', 'stonePaving'].includes(kind) ? .004 : .0015 };
}
