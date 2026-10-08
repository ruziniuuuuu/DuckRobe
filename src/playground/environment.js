import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { makeInfiniteGrid, makeArenaWalls } from './arena.js';
import { circuitPoint } from './worlds.js';
import { createSurfaceMaps } from './textures.js';
import { createCircuitSigns, createParkSigns, createHarborSigns } from './signage.js';

function capsule(path, radius) {
  path.moveTo(-.6, -radius); path.lineTo(.6, -radius);
  path.absarc(.6, 0, radius, -Math.PI / 2, Math.PI / 2, false);
  path.lineTo(-.6, radius); path.absarc(-.6, 0, radius, Math.PI / 2, 3 * Math.PI / 2, false);
  return path;
}

// The environment owns its geometry/materials/textures. Its Z-up group has
// exactly the same transform as the dressed robot; no per-prop axis swapping.
export function createEnvironment(world) {
  const group = new THREE.Group(), geometries = new Map(), materials = new Map(), textures = new Set(), maps = new Map(), instances = new Map();
  group.name = `environment:${world.id}`;
  let disposed = false, arenaMaterials = [], animations = [], actorShadow, signs, skyDome;
  const interactionVisuals = new Map(), deliveries = new Map(), raceLights = [], checkpointMarkers = [], parkMarkers = [];
  const reducedMotion = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  let seed = 847;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  function geometry(key, create) { if (!geometries.has(key)) geometries.set(key, create()); return geometries.get(key); }
  function material(color, kind = '') {
    const key = `${color}:${kind}`;
    if (!materials.has(key)) {
      if (kind && !maps.has(kind)) { const surface = createSurfaceMaps(kind); maps.set(kind, surface); for (const map of [surface.map, surface.bumpMap]) if (map) textures.add(map); }
      const surface = maps.get(kind) || {};
      materials.set(key, new THREE.MeshStandardMaterial({ color: ['asphalt', 'grass', 'paving', 'stonePaving'].includes(kind) ? 0xffffff : color, ...surface,
        roughness: ['asphalt', 'stone', 'sand'].includes(kind) ? .94 : kind === 'wood' ? .79 : .58, metalness: [0x596266, 0x929997, 0xbac0b7].includes(color) ? .7 : color === 0xba9252 ? .55 : 0,
        ...(kind === 'leaf' ? { side: THREE.DoubleSide, alphaTest: .45, alphaToCoverage: true } : {}),
        ...(kind === 'light' ? { emissive: 0xffb55d, emissiveIntensity: .8 } : {}) }));
    }
    return materials.get(key);
  }
  function mesh(geom, mat, pos, scale = [1, 1, 1], parent = group) {
    const m = new THREE.Mesh(geom, mat); m.position.fromArray(pos); m.scale.fromArray(scale);
    m.castShadow = m.receiveShadow = true; parent.add(m); return m;
  }
  const boxGeometry = () => geometry('box', () => new RoundedBoxGeometry(1, 1, 1, 2, .035));
  const cylinderGeometry = () => geometry('cylinder', () => new THREE.CylinderGeometry(1, 1, 2, 20).rotateX(Math.PI / 2));
  const sphereGeometry = () => geometry('sphere', () => new THREE.SphereGeometry(1, 14, 10));
  const leafGeometry = () => geometry('leaf', () => new THREE.PlaneGeometry(1, 1));
  const box = (pos, size, color, parent = group) => mesh(boxGeometry(), material(color), pos, size, parent);
  const cylinder = (pos, radius, height, color, parent = group) => mesh(cylinderGeometry(), material(color), pos, [radius, radius, height / 2], parent);
  function instance(geom, mat, pos, scale, rotation = [0, 0, 0], tint) {
    const key = `${geom.uuid}:${mat.uuid}`;
    if (!instances.has(key)) instances.set(key, { geom, mat, transforms: [], colors: [] });
    const bucket = instances.get(key), transform = new THREE.Object3D();
    transform.position.fromArray(pos); transform.scale.fromArray(scale); transform.rotation.set(...rotation); transform.updateMatrix();
    bucket.transforms.push(transform.matrix); bucket.colors.push(new THREE.Color(tint ?? 0xffffff));
  }
  function leaves(pos, radius, height, count = 240) {
    const mat = material(0xffffff, 'leaf');
    for (let i = 0; i < count; i++) {
      const a = random() * Math.PI * 2, z = random() * 2 - 1, r = Math.sqrt(1 - z * z) * Math.cbrt(random()), size = .038 + random() * .038;
      instance(leafGeometry(), mat, [pos[0] + Math.cos(a) * radius * r, pos[1] + Math.sin(a) * radius * r, pos[2] + z * height * .5],
        [size, size * 1.5, 1], [random() * Math.PI, random() * Math.PI, random() * Math.PI], new THREE.Color().setHSL(.20 + random() * .06, .35 + random() * .15, .40 + random() * .22));
    }
  }
  function label(text, pos, size, { background = '#283d33', color = '#fff4df' } = {}, parent = group) {
    if (typeof document === 'undefined') return;
    const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 128;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = background; ctx.fillRect(0, 0, 512, 128);
    ctx.fillStyle = color; ctx.font = text.includes('\n') ? '600 40px Georgia' : '600 47px Georgia'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const lines = text.split('\n'); lines.forEach((line, i) => ctx.fillText(line, 256, 64 + (i - (lines.length - 1) / 2) * 48, 470));
    const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace; textures.add(map);
    const mat = new THREE.MeshStandardMaterial({ map, roughness: .85 }); materials.set(`label:${textures.size}`, mat);
    const plane = geometry('label', () => new THREE.PlaneGeometry(1, 1).rotateX(Math.PI / 2));
    return mesh(plane, mat, pos, [size[0], 1, size[1]], parent);
  }
  function graphic(map, pos, size, parent = group, { glowing = false, cutout = false } = {}) {
    if (!map) return;
    const options = { map, transparent: cutout, ...(cutout ? { alphaTest: .03, depthWrite: false } : {}) };
    const mat = glowing ? new THREE.MeshBasicMaterial({ ...options, toneMapped: false }) : new THREE.MeshStandardMaterial({ ...options, roughness: .85 });
    materials.set(`graphic:${materials.size}`, mat);
    const plane = geometry('label', () => new THREE.PlaneGeometry(1, 1).rotateX(Math.PI / 2));
    const sign = mesh(plane, mat, pos, [size[0], 1, size[1]], parent);
    sign.castShadow = sign.receiveShadow = false; return sign;
  }
  function tree(x, y, height = .8) {
    mesh(cylinderGeometry(), material(0x8d7051, 'wood'), [x, y, height * .24], [.028, .028, height * .24]);
    for (let i = 0; i < 7; i++) {
      const a = i * 2.39996, r = height * (.10 + random() * .07), z = height * (.56 + random() * .27);
      const tip = [x + Math.cos(a) * r, y + Math.sin(a) * r, z];
      beam([x, y, height * .38], tip, .01, 0x8d7051);
      leaves(tip, height * .19, height * .28, 270);
    }
    leaves([x, y, height * .80], height * .22, height * .31, 320);
  }
  function bench(x, y, yaw = 0, z = 0) {
    const b = new THREE.Group(); b.position.set(x, y, z); b.rotation.z = yaw; group.add(b);
    for (const bx of [-.2, .2]) { box([bx, 0, .09], [.035, .20, .18], 0x596266, b); box([bx, .07, .22], [.024, .028, .27], 0x596266, b); }
    for (const by of [-.07, 0, .07]) mesh(boxGeometry(), material(0xb28b5a, 'wood'), [0, by, .19], [.52, .055, .025], b);
    for (const z of [.27, .33]) mesh(boxGeometry(), material(0xb28b5a, 'wood'), [0, .082, z], [.52, .024, .048], b);
    for (const x of [-.20, .20]) { const arm = box([x, 0, .27], [.025, .18, .018], 0x344540, b); arm.rotation.x = -.09; }
  }
  function flowers(x, y, radius = .22, ground = 0, petalColor) {
    leaves([x, y, ground + .075], radius, .12, 90);
    for (let i = 0; i < 24; i++) {
      const a = i * 2.39996, r = radius * Math.sqrt((i + 1) / 24), px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
      const z = ground + .06 + random() * .09;
      instance(cylinderGeometry(), material(0x6b7b3c), [px, py, ground + (z - ground) / 2], [.0015, .0015, (z - ground) / 2]);
      for (let j = 0; j < 6; j++) { const angle = j * Math.PI / 3; instance(sphereGeometry(), material(petalColor ?? (i % 4 ? 0xf4efe0 : 0xca967e)), [px + Math.cos(angle) * .013, py + Math.sin(angle) * .013, z], [.012, .006, .003], [0, 0, angle]); }
      instance(sphereGeometry(), material(0xd2ad4f), [px, py, z + .002], [.006, .006, .004]);
    }
  }
  function verge(points) {
    const blade = geometry('verge-blade', () => {
      const s = new THREE.Shape(); s.moveTo(-.003, 0); s.quadraticCurveTo(.005, .035, 0, .055); s.lineTo(.003, 0); s.closePath(); return new THREE.ShapeGeometry(s).rotateX(Math.PI / 2);
    });
    const mat = material(0x8c9b63); mat.side = THREE.DoubleSide;
    for (const [x, y] of points) for (let i = 0; i < 5; i++) instance(blade, mat, [x + (random() - .5) * .025, y + (random() - .5) * .025, .002], [.6 + random() * .6, 1, .35 + random() * .55], [0, 0, random() * Math.PI * 2], new THREE.Color().setHSL(.20, .23, .42 + random() * .15));
  }
  function ground(kind) {
    const plane = geometry('ground', () => {
      const g = new THREE.PlaneGeometry(120, 120), uv = g.attributes.uv, p = g.attributes.position;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, p.getX(i), p.getY(i)); return g;
    });
    const floor = mesh(plane, material(0xa9b08d, kind), [0, 0, -.015]); floor.castShadow = false;
  }
  function paving(pos, size, kind = 'paving') {
    const geom = geometry(`paving:${kind}:${size.join(':')}:${pos.join(':')}`, () => {
      let g;
      if (kind === 'paving') {
        const [w, h] = size, x = -w / 2, y = -h / 2, r = Math.min(.18, w / 4, h / 4), shape = new THREE.Shape();
        shape.moveTo(x + r, y); shape.lineTo(x + w - r, y); shape.quadraticCurveTo(x + w, y, x + w, y + r);
        shape.lineTo(x + w, y + h - r); shape.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        shape.lineTo(x + r, y + h); shape.quadraticCurveTo(x, y + h, x, y + h - r);
        shape.lineTo(x, y + r); shape.quadraticCurveTo(x, y, x + r, y); shape.closePath(); g = new THREE.ShapeGeometry(shape, 12);
      } else g = new THREE.PlaneGeometry(...size);
      const p = g.attributes.position, uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, p.getX(i) + pos[0], p.getY(i) + pos[1]); return g;
    });
    const floor = mesh(geom, material(0xffffff, kind), pos); floor.castShadow = false;
  }
  function ring(radius, tube, pos, color, parent = group, vertical = false) {
    const geom = geometry(`ring:${radius}:${tube}:${vertical}`, () => {
      const g = new THREE.TorusGeometry(radius, tube, 8, 64); if (vertical) g.rotateX(Math.PI / 2); return g;
    });
    return mesh(geom, material(color), pos, [1, 1, 1], parent);
  }
  function planter(x, y, radius = .18) {
    mesh(cylinderGeometry(), material(0xc8bc9f, 'stone'), [x, y, .08], [radius, radius, .08]);
    cylinder([x, y, .163], radius * .92, .008, 0x5e5740); flowers(x, y, radius * .85, .16);
  }
  function lamp(x, y, height = .85) {
    cylinder([x, y, .045], .05, .09, 0x344540); cylinder([x, y, height / 2], .015, height, 0x344540);
    const bulb = box([x, y, height], [.075, .075, .12], 0xffe4b3); bulb.material = material(0xffe4b3, 'light'); bulb.castShadow = false;
    for (const dx of [-.042, .042]) for (const dy of [-.042, .042]) cylinder([x + dx, y + dy, height], .004, .15, 0x344540);
    const cap = geometry('lamp-roof', () => new THREE.ConeGeometry(.074, .075, 4).rotateX(Math.PI / 2).rotateZ(Math.PI / 4));
    mesh(cap, material(0x344540), [x, y, height + .10]); cylinder([x, y, height + .16], .007, .045, 0x344540);
  }
  function tires(x, y, count = 3) {
    for (let i = 0; i < count; i++) ring(.075, .023, [x, y, .029 + i * .045], 0x292d2a);
  }
  function cone(x, y) {
    box([x, y, .009], [.085, .085, .018], 0x4c4e45);
    const geom = geometry('cone', () => new THREE.ConeGeometry(.033, .12, 16).rotateX(Math.PI / 2));
    mesh(geom, material(0xc46d40), [x, y, .073]); cylinder([x, y, .09], .022, .024, 0xf1dfbf);
  }
  function sky() {
    const mat = new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false,
      uniforms: { top: { value: new THREE.Color(world.atmosphere?.top || 0x6ea9d0) }, bottom: { value: new THREE.Color(world.atmosphere?.horizon || 0xd7e3e5) } },
      vertexShader: 'varying vec3 direction; void main() { direction = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `varying vec3 direction; uniform vec3 top; uniform vec3 bottom;
        void main() { float h = pow(max(normalize(direction).z, 0.0), .25); gl_FragColor = vec4(mix(bottom, top, h), 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        }` });
    materials.set('sky', mat);
    const dome = mesh(geometry('sky', () => new THREE.SphereGeometry(45, 24, 16)), mat, [0, 0, 0]); dome.castShadow = dome.receiveShadow = false;
    skyDome = dome;
    if (typeof document === 'undefined') return;
    const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 256;
    const ctx = canvas.getContext('2d');
    for (let i = 0; i < 24; i++) {
      const x = 80 + random() * 350, y = 80 + random() * 100, radius = 24 + random() * 44;
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius); gradient.addColorStop(0, '#ffffffd0'); gradient.addColorStop(.6, '#ffffff80'); gradient.addColorStop(1, '#ffffff00');
      ctx.fillStyle = gradient; ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    }
    const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace; textures.add(map);
    const clouds = new THREE.SpriteMaterial({ map, transparent: true, opacity: .7, depthWrite: false }); materials.set('clouds', clouds);
    for (const [x, y, z, scale] of [[-7, 13, 4, 6], [2, 17, 5, 7], [8, 12, 4.5, 5]]) { const cloud = new THREE.Sprite(clouds); cloud.position.set(x, y, z); cloud.scale.set(scale, scale / 2, 1); group.add(cloud); }
    const shadowCanvas = document.createElement('canvas'); shadowCanvas.width = shadowCanvas.height = 128;
    const shadowCtx = shadowCanvas.getContext('2d'), gradient = shadowCtx.createRadialGradient(64, 64, 3, 64, 64, 64);
    gradient.addColorStop(0, '#000000a0'); gradient.addColorStop(.35, '#00000065'); gradient.addColorStop(1, '#00000000'); shadowCtx.fillStyle = gradient; shadowCtx.fillRect(0, 0, 128, 128);
    const shadowMap = new THREE.CanvasTexture(shadowCanvas); textures.add(shadowMap);
    const shadowMaterial = new THREE.MeshBasicMaterial({ map: shadowMap, transparent: true, opacity: .4, depthWrite: false }); materials.set('actor-shadow', shadowMaterial);
    actorShadow = mesh(geometry('actor-shadow', () => new THREE.PlaneGeometry(.28, .22)), shadowMaterial, [0, 0, .009]); actorShadow.castShadow = actorShadow.receiveShadow = false;
  }
  function collider(record) {
    const geom = record.type === 'box' ? boxGeometry() : cylinderGeometry();
    const scale = record.type === 'box' ? record.size.map(v => v * 2) : [record.size[0], record.size[0], record.size[1]];
    const color = ['flowerbed', 'stone'].includes(record.kind) ? 0xd3c4a9 : record.kind === 'island' ? 0x99ad72 : ['fence', 'post', 'wood'].includes(record.kind) ? 0xa58a61
      : record.kind === 'building' ? 0xe2d8bd : record.kind === 'slide' ? 0xb87f77 : 0xa6aca8;
    const m = mesh(geom, material(color, ['post', 'wood', 'building'].includes(record.kind) ? 'wood' : ['island', 'stone', 'flowerbed'].includes(record.kind) ? 'stone' : ''), record.pos, scale);
    m.rotation.set(record.roll || 0, 0, record.yaw, 'ZYX'); m.name = record.name; m.userData.collider = record.name;
    // Detailed slats/foliage are rendered below, with conservative contact
    // proxies supplied by the same placement records.
    if (['trunk', 'bench', 'rail', 'fence', 'building', 'post'].includes(record.kind)) m.visible = false;
    if (record.kind === 'rail' || record.kind === 'fence') {
      const railing = new THREE.Group(); railing.position.fromArray(record.pos); railing.rotation.z = record.yaw; group.add(railing);
      const alongY = record.size[1] > record.size[0], length = (alongY ? record.size[1] : record.size[0]) * 2;
      if (alongY) railing.rotation.z += Math.PI / 2;
      const h = record.size[2] * 2, wood = record.kind === 'fence';
      for (const z of [-h * .15, h * .28]) box([0, 0, z], [length, .024, wood ? .022 : .016], wood ? 0x8f9b79 : 0x929997, railing);
      if (wood || Number(record.name.split('_').at(-1)) % 3 === 0) {
        const count = wood ? Math.max(1, Math.ceil(length / .22)) : 0;
        for (let i = 0; i <= count; i++) box([count ? -length / 2 + i * length / count : 0, 0, 0], [.024, .032, h], wood ? 0x8f9b79 : 0x596266, railing);
      }
      if (record.name.startsWith('park_play_fence')) {
        for (let x = -length / 2; x < length / 2; x += .075) {
          cylinder([x, 0, -.015], .005, h * .82, 0xeadcbe, railing);
          mesh(sphereGeometry(), material(0xeadcbe), [x, 0, h * .39], [.007, .007, .009], railing);
        }
      }
    }
    return m;
  }
  function circuit() {
    signs = createCircuitSigns();
    ground('grass'); world.colliders.forEach(collider);
    paving([0, 0, -.001], [5.6, 4.9], 'stonePaving');
    const verge = capsule(new THREE.Shape(), 1.68); verge.holes.push(capsule(new THREE.Path(), 1.51));
    const border = mesh(geometry('circuit-verge', () => new THREE.ShapeGeometry(verge, 48)), material(0xffffff, 'grass'), [0, 0, .002]); border.castShadow = false;
    for (let i = 0; i < 30; i++) { const p = circuitPoint((i + .25) / 30, 1.60); flowers(p[0], p[1], .055 + random() * .025); }
    const lawn = capsule(new THREE.Shape(), .75);
    const grass = mesh(geometry('circuit-lawn', () => new THREE.ShapeGeometry(lawn, 48)), material(0xffffff, 'grass'), [0, 0, .131]); grass.castShadow = false;
    for (let i = 0; i < 72; i++) {
      const a = circuitPoint(i / 72, .75), b = circuitPoint((i + 1) / 72, .75);
      const stone = mesh(boxGeometry(), material(0xc8bc9f, 'stone'), [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, .065], [Math.hypot(b[0] - a[0], b[1] - a[1]) - .003, .022, .13]);
      stone.rotation.z = Math.atan2(b[1] - a[1], b[0] - a[0]);
    }
    const road = capsule(new THREE.Shape(), 1.44); road.holes.push(capsule(new THREE.Path(), .75));
    const roadGeometry = geometry('circuit-road', () => new THREE.ShapeGeometry(road, 48));
    const lane = mesh(roadGeometry, material(0x555b59, 'asphalt'), [0, 0, .001]); lane.castShadow = false;
    for (let i = 0; i < 64; i++) {
      for (const radius of [1.38, .80]) {
        const p = circuitPoint(i / 64, radius), ahead = circuitPoint((i + .2) / 64, radius);
        const curb = mesh(boxGeometry(), material(i % 2 ? 0xf0e8d8 : 0xc45543, 'paint'), [p[0], p[1], .005], [radius === .80 ? .112 : .16, .09, .004]);
        curb.rotation.z = Math.atan2(ahead[1] - p[1], ahead[0] - p[0]); curb.castShadow = false;
      }
    }
    for (let i = 0; i < 34; i++) {
      const p = circuitPoint(i / 34), q = circuitPoint((i + .15) / 34);
      const dash = box([p[0], p[1], .004], [.09, .018, .003], 0xdce0d6);
      dash.rotation.z = Math.atan2(q[1] - p[1], q[0] - p[0]); dash.castShadow = false;
    }
    for (let i = 0; i < 8; i++) {
      const p = circuitPoint((i + .4) / 8), q = circuitPoint((i + .42) / 8), a = Math.atan2(q[1] - p[1], q[0] - p[0]);
      const arrow = new THREE.Shape(); arrow.moveTo(-.07, -.025); arrow.lineTo(.015, -.025); arrow.lineTo(.015, -.06); arrow.lineTo(.09, 0); arrow.lineTo(.015, .06); arrow.lineTo(.015, .025); arrow.lineTo(-.07, .025); arrow.closePath();
      const mark = mesh(geometry('arrow', () => new THREE.ShapeGeometry(arrow)), material(0xebe7db), [...p, .008]); mark.rotation.z = a; mark.castShadow = false;
    }
    for (let row = 0; row < 2; row++) for (let col = 0; col < 8; col++) {
      const tile = box([-.03 + row * .06, -1.1 + (col - 3.5) * .08, .005], [.06, .08, .003], (row + col) % 2 ? 0xf1ece2 : 0x303936);
      tile.castShadow = false;
    }
    world.gates.slice(1).forEach((gate, index) => {
      const yaw = Math.atan2(gate.normal[1], gate.normal[0]);
      const line = box([...gate.pos, .006], [.025, gate.width, .004], 0xd89a57); line.rotation.z = yaw; line.castShadow = false;
      line.material = material(0xd89a57).clone(); materials.set(`checkpoint:${index}`, line.material); checkpointMarkers.push({ line, gate: index + 1 });
      const sign = new THREE.Group(); sign.position.set(gate.pos[0] + gate.normal[1] * .45, gate.pos[1] - gate.normal[0] * .45, .15);
      sign.rotation.z = yaw + Math.PI; group.add(sign);
      cylinder([0, 0, 0], .012, .30, 0x596266, sign); label(String(index + 1).padStart(2, '0'), [0, -.016, .16], [.13, .07], {}, sign);
    });
    timingGate();
    brandFlag(.78, -1.86, -.22); brandFlag(-2.27, .18, .25, .86);
    tree(-.35, .10, .95); flowers(-.4, -.34, .23, .13); flowers(.52, -.34, .23, .13);
    for (let i = 0; i < 22; i++) { const p = circuitPoint(i / 22, .58); flowers(p[0], p[1], .10 + random() * .045, .13); }
    grassClumps();
    brandStone(.33, .08, .13, .36); brandStone(-.95, -2.17, 0, .44);
    bench(.32, -.37, -.08, .13); bench(-1.35, 1.75, -.35); bench(-1.75, -1.78, -.12);
    for (const [x, y] of [[-2.3, 1.05], [2.6, 2.3], [-2.35, -1.8], [-.2, 2.1]]) tree(x, y, .95);
    pit();
    circuitWear();
    paving([1.62, 1.58, -.0005], [.57, .82], 'stonePaving');
    label('PIT ENTRY', [1.64, 1.45, .10], [.29, .07], { background: '#dfd1b4', color: '#40594c' });
    for (const [x, y] of [[-1.7, -1.36], [1.95, -.8], [.85, 1.56], [-1.7, .8]]) { tires(x, y); tires(x + .17, y + .05, 2); cone(x - .19, y); }
    for (const [x, y] of [[-.95, -1.9], [1.4, 1.66], [-2.2, .4], [2.2, .5]]) planter(x, y);
    for (const [x, y] of [[-.95, .28], [.86, -.30], [.6, .4]]) lamp(x, y, .35);
  }
  function timingGate() {
    const center = world.gates[0].pos;
    for (const side of [-1, 1]) {
      const y = center[1] + side * .39;
      box([center[0], y, .37], [.052, .052, .74], 0x929997);
      box([center[0], y, .014], [.12, .10, .028], 0xbac0b7);
      box([center[0], y, .75], [.066, .066, .018], 0xbac0b7);
      for (const x of [-.039, .039]) for (const dy of [-.03, .03]) cylinder([center[0] + x, y + dy, .032], .005, .008, 0x596266);
    }
    const board = new THREE.Group(); board.name = 'circuit-timing-gate'; board.position.set(...center, .67); board.rotation.z = Math.PI / 2; group.add(board);
    box([0, 0, 0], [.82, .07, .16], 0x596266, board);
    for (const z of [-.085, .085]) box([0, 0, z], [.85, .086, .018], 0xbac0b7, board);
    for (const side of [-1, 1]) {
      const face = new THREE.Group(); face.position.y = side * .047; face.rotation.z = side < 0 ? 0 : Math.PI; board.add(face);
      const screen = graphic(signs?.clock, [0, 0, 0], [.55, .142], face, { glowing: true });
      if (screen) screen.name = `circuit-clock-${side < 0 ? 'front' : 'back'}`;
      for (const x of [-.38, .38]) {
        for (const z of [-.06, .06]) { const bolt = cylinder([x, -.004, z], .005, .005, 0xbac0b7, face); bolt.rotation.x = Math.PI / 2; }
        beam([x - .025, 0, -.06], [x + .025, 0, .06], .005, 0xbac0b7, face);
        beam([x + .025, 0, -.06], [x - .025, 0, .06], .005, 0xbac0b7, face);
      }
      for (const x of [-.308, .308]) for (const z of [-.037, .037]) {
        const housing = cylinder([x, -.006, z], .019, .018, 0x252e2b, face); housing.rotation.x = Math.PI / 2;
        const lightMaterial = material(z > 0 ? 0xb87c38 : 0x668c64).clone(); materials.set(`signal:${raceLights.length}`, lightMaterial);
        const lens = mesh(sphereGeometry(), lightMaterial, [x, -.019, z], [.012, .005, .012], face);
        raceLights.push({ lens, green: z < 0 });
        lens.castShadow = false;
      }
    }
  }
  function brandFlag(x, y, yaw = 0, scale = 1) {
    const stand = new THREE.Group(); stand.name = 'circuit-brand-flag'; stand.position.set(x, y, 0); stand.rotation.z = yaw; stand.scale.setScalar(scale); group.add(stand);
    cylinder([-.17, 0, .028], .105, .056, 0xc8bc9f, stand);
    cylinder([-.17, 0, .66], .009, 1.28, 0x929997, stand);
    beam([-.19, 0, 1.28], [.20, 0, 1.28], .007, 0x929997, stand);
    mesh(sphereGeometry(), material(0xba9252), [-.17, 0, 1.315], [.015, .015, .015], stand);
    if (!signs) return;
    const cloth = geometry(`flag:${x}:${y}`, () => new THREE.PlaneGeometry(.34, .98, 12, 24).rotateX(Math.PI / 2));
    const mat = new THREE.MeshStandardMaterial({ map: signs.flag, roughness: .95, side: THREE.DoubleSide }); materials.set(`flag:${x}:${y}`, mat);
    const flag = mesh(cloth, mat, [.005, -.006, .765], [1, 1, 1], stand); flag.receiveShadow = false;
    const position = cloth.attributes.position;
    const wave = time => {
      for (let i = 0; i < position.count; i++) { const x = position.getX(i), z = position.getZ(i), free = (.49 - z) / .98; position.setY(i, free * (.014 * Math.sin(x * 35 + z * 11 + time * 1.6) + .006 * Math.cos(z * 20 - time))); }
      position.needsUpdate = true; cloth.computeVertexNormals();
    };
    wave(0); if (!reducedMotion) animations.push(wave);
    for (const z of [.30, 1.22]) { const tie = ring(.011, .002, [-.166, -.008, z], 0xba9252, stand); tie.rotation.x = Math.PI / 2; }
  }
  function brandStone(x, y, ground, height) {
    const stone = new THREE.Group(); stone.position.set(x, y, ground); stone.rotation.z = -.12; group.add(stone);
    mesh(boxGeometry(), material(0xc5b99d, 'stone'), [0, 0, height / 2], [.30, .23, height], stone);
    box([0, 0, height + .012], [.32, .25, .024], 0xd5c9b1, stone);
    graphic(signs?.mark, [0, -.117, height * .59], [.235, .235], stone, { cutout: true });
  }
  function grassClumps() {
    const blade = geometry('grass-blade', () => {
      const shape = new THREE.Shape(); shape.moveTo(-.002, 0); shape.quadraticCurveTo(.006, .025, .001, .040); shape.lineTo(.002, 0); shape.closePath();
      return new THREE.ShapeGeometry(shape).rotateX(Math.PI / 2);
    });
    const mat = material(0x7a8f4a); mat.side = THREE.DoubleSide;
    for (let i = 0; i < 1800; i++) {
      const x = (random() - .5) * 2.6, y = (random() - .5) * 1.4;
      if (Math.hypot(Math.max(Math.abs(x) - .6, 0), y) > .70) continue;
      instance(blade, mat, [x, y, .132], [1, 1, .5 + random()], [0, 0, random() * Math.PI * 2], new THREE.Color().setHSL(.20, .30, .60 + random() * .2));
    }
  }
  function pit() {
    const base = new THREE.Group(); base.position.set(1.4, 1.97, 0); group.add(base);
    const wood = material(0xc19b6f, 'wood');
    mesh(boxGeometry(), wood, [0, .28, .35], [1.5, .025, .70], base);
    mesh(boxGeometry(), wood, [-.55, .08, .36], [.40, .035, .72], base);
    graphic(signs?.workshop, [-.55, .057, .40], [.39, .54], base);
    for (const x of [-.72, .72]) box([x, -.30, .38], [.035, .035, .76], 0x596266, base);
    box([0, 0, .78], [1.68, .78, .055], 0x929997, base); box([0, -.395, .765], [1.72, .03, .08], 0xd6cdb7, base);
    for (let i = 0; i < 7; i++) box([-.7 + i * .23, 0, .813], [.008, .76, .005], 0xc5c3b7, base);
    box([.02, .16, .17], [.30, .22, .34], 0x7b7567, base); box([.52, .11, .17], [.26, .24, .34], 0xab5845, base);
    for (const x of [.02, .52]) for (let i = 0; i < 5; i++) {
      box([x, x > .4 ? -.016 : .039, .055 + i * .055], [.23, .006, .035], x > .4 ? 0xb55e48 : 0x888778, base);
      box([x, x > .4 ? -.023 : .032, .064 + i * .055], [.16, .009, .006], 0xe1ded1, base);
    }
    mesh(boxGeometry(), wood, [.2, .13, .36], [1.02, .31, .032], base);
    for (let i = 0; i < 9; i++) { const tool = box([-.22 + i * .075, .25, .52], [.017, .018, .09 + i % 3 * .028], 0x596266, base); tool.rotation.y = (i % 2 - .5) * .3; }
    for (const x of [-.18, .15, .45]) { cylinder([x, .17, .40], .024, .064, 0x929997, base); box([x, .17, .438], [.030, .04, .012], 0x596266, base); }
    for (let i = 0; i < 4; i++) {
      mesh(boxGeometry(), wood, [-.29 + i * .12, -.18, .083], [.112, .14, .166], base);
      box([-.29 + i * .12, -.255, .09], [.064, .006, .013], 0x6e5941, base);
    }
    for (const x of [-.58, .58]) for (const y of [-.21, .21]) { const bolt = cylinder([x, y, .819], .005, .007, 0x596266, base); bolt.castShadow = false; }
    for (const x of [-.72, .72]) { beam([x, -.30, .71], [x, -.44, .67], .006, 0x344540, base); const shade = mesh(geometry('pit-light', () => new THREE.ConeGeometry(.033, .022, 16).rotateX(Math.PI / 2)), material(0x344540), [x, -.45, .67], [1, 1, 1], base); cylinder([x, -.45, .656], .020, .005, 0xf3dfac, base); shade.castShadow = false; }
    label('PIT / GOOD WALKS', [0, -.406, .766], [.9, .075], {}, base);
    bench(.48, 1.82, 0); cone(2.23, 1.61);
    const sign = new THREE.Group(); sign.position.set(2.42, 1.17, 0); sign.rotation.z = -.12; group.add(sign);
    for (const x of [-.15, .15]) { beam([x, -.08, 0], [x, 0, .58], .013, 0xb28b5a, sign); beam([x, .18, 0], [x, 0, .58], .013, 0xb28b5a, sign); }
    mesh(boxGeometry(), wood, [0, 0, .37], [.35, .035, .46], sign); graphic(signs?.motto, [0, -.02, .37], [.305, .419], sign);
    for (let i = 0; i < 4; i++) { const mark = box([1.56 + i * .12, 1.52, .004], [.015, .23, .002], 0xc5a45d); mark.rotation.z = -.50; mark.castShadow = false; }
    const cable = geometry('pit-cable', () => new THREE.TubeGeometry(new THREE.CatmullRomCurve3([[.42, .27, .41], [.56, .22, .13], [.48, -.05, .012], [.65, -.13, .012], [.56, -.24, .012]].map(p => new THREE.Vector3(...p))), 30, .004, 6, false));
    mesh(cable, material(0x37433a), [0, 0, 0], [1, 1, 1], base);
    for (const x of [-.43, -.30]) { const wrench = box([x, .07, .386], [.010, .090, .006], 0xbac0b7, base); wrench.rotation.z = -.3; ring(.014, .003, [x + .012, .10, .387], 0xbac0b7, base); }
    label('SERVICE / 01', [.52, -.028, .31], [.15, .034], { background: '#ab5845', color: '#f3e7c9' }, base);
  }
  function circuitWear() {
    const skidMaterial = new THREE.MeshStandardMaterial({ color: 0x252d2b, transparent: true, opacity: .16, depthWrite: false, roughness: 1 }); materials.set('skids', skidMaterial);
    for (const start of [.13, .53]) for (const offset of [-.028, .028]) {
      const points = Array.from({ length: 20 }, (_, i) => { const p = circuitPoint(start + i * .0022, 1.13 + offset); return new THREE.Vector3(...p, .009); });
      const skid = mesh(geometry(`skid:${start}:${offset}`, () => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 36, .004, 4, false)), skidMaterial, [0, 0, 0]); skid.castShadow = skid.receiveShadow = false;
    }
    const pebbles = material(0xc5bea7, 'stone');
    for (let i = 0; i < 160; i++) {
      const p = circuitPoint(random(), .765 + random() * .018);
      instance(sphereGeometry(), pebbles, [...p, .012], [.005 + random() * .007, .004, .003]);
    }
    verge(Array.from({ length: 260 }, () => circuitPoint(random(), 1.53 + random() * .10)));
  }
  function beam(a, b, radius, color, parent = group) {
    const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b), axis = end.clone().sub(start);
    const m = cylinder(start.clone().add(end).multiplyScalar(.5).toArray(), radius, axis.length(), color, parent);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), axis.normalize()); return m;
  }
  function roof(pos, radius, height, parent = group) {
    const geom = geometry(`roof:${radius}:${height}`, () => {
      const points = [[0, height], [radius * .15, height * .91], [radius * .40, height * .60], [radius * .78, height * .20], [radius, 0]].map(p => new THREE.Vector2(...p)).reverse();
      const dome = new THREE.LatheGeometry(points, 48).rotateX(Math.PI / 2), buckets = [[], []], indices = dome.index.array;
      for (let i = 0; i < indices.length; i += 3) { const side = Math.floor(i / ((points.length - 1) * 6)); buckets[Math.floor(side / 4) % 2].push(indices[i], indices[i + 1], indices[i + 2]); }
      dome.setIndex([...buckets[0], ...buckets[1]]); dome.clearGroups(); dome.addGroup(0, buckets[0].length, 0); dome.addGroup(buckets[0].length, buckets[1].length, 1); return dome;
    });
    return mesh(geom, [material(0xf0dfbc), material(0xb44f42)], pos, [1, 1, 1], parent);
  }
  function carousel() {
    const record = world.colliders.find(c => c.name === 'park_carousel'), base = new THREE.Group();
    base.position.set(record.pos[0], record.pos[1], record.size[1] * 2); group.add(base);
    cylinder([0, 0, .45], .06, .9, 0xba9252, base); roof([0, 0, .98], .66, .35, base);
    cylinder([0, 0, .95], .61, .025, 0xf0dfbc, base);
    cylinder([0, 0, .43], .11, .68, 0xf0dfbc, base);
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4, panel = new THREE.Group(); panel.rotation.z = a; base.add(panel);
      box([0, -.109, .47], [.075, .014, .47], 0xba9252, panel);
      const mirror = box([0, -.120, .47], [.058, .008, .42], 0xaab7a3, panel); mirror.material = material(0xbac0b7);
      cylinder([.12, 0, .44], .008, .72, 0xba9252, panel);
    }
    ring(.64, .018, [0, 0, .98], 0xba9252, base); ring(.61, .014, [0, 0, .86], 0xba9252, base);
    cylinder([0, 0, 1.34], .035, .07, 0xba9252, base); mesh(sphereGeometry(), material(0xba9252), [0, 0, 1.40], [.042, .042, .042], base);
    for (let i = 0; i < 64; i++) { const a = i * Math.PI / 32; mesh(sphereGeometry(), material(0xffe4b3, 'light'), [Math.cos(a) * .64, Math.sin(a) * .64, .982], [.010, .010, .010], base); }
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4, panel = new THREE.Group(); panel.position.set(Math.cos(a) * .635, Math.sin(a) * .635, .93); panel.rotation.z = a + Math.PI / 2; base.add(panel);
      const plate = cylinder([0, 0, 0], .085, .025, 0xf0dfbc, panel); plate.scale.y *= .78; plate.rotation.x = Math.PI / 2;
      const border = ring(.083, .008, [0, -.018, 0], 0xba9252, panel); border.rotation.x = Math.PI / 2;
      graphic(signs?.goldMark, [0, -.036, 0], [.116, .116], panel, { cutout: true });
      for (let j = 0; j < 10; j++) { const b = j * Math.PI / 5; mesh(sphereGeometry(), material(0xffe4b3, 'light'), [Math.cos(b) * .093, -.03, Math.sin(b) * .077], [.006, .006, .006], panel); }
      mesh(sphereGeometry(), material(0xba9252), [0, 0, .103], [.018, .012, .022], panel);
      for (const x of [-.11, .11]) cylinder([x, 0, -.005], .008, .10, 0xba9252, panel);
    }
    const turntable = new THREE.Group(); turntable.name = 'park-carousel-turntable'; base.add(turntable);
    cylinder([0, 0, .04], .52, .08, 0xbd9e72, turntable); ring(.52, .012, [0, 0, .083], 0xba9252, base);
    for (let i = 0; i < 6; i++) {
      const a = i * Math.PI / 3, horse = new THREE.Group(); horse.position.set(Math.cos(a) * .34, Math.sin(a) * .34, 0); horse.rotation.z = a; turntable.add(horse);
      cylinder([0, 0, .48], .012, .9, 0xc9a26c, horse);
      mesh(sphereGeometry(), material(0xe9dfca), [0, 0, .27], [.14, .045, .065], horse);
      beam([.09, 0, .27], [.14, 0, .40], .032, 0xe9dfca, horse);
      mesh(sphereGeometry(), material(0xe9dfca), [.16, 0, .40], [.06, .035, .038], horse);
      for (const x of [-.08, .06]) for (const y of [-.035, .035]) beam([x, y, .24], [x + .025, y, .15], .009, 0xe9dfca, horse);
      box([-.02, 0, .324], [.095, .076, .018], 0xba9252, horse);
      box([-.02, 0, .337], [.078, .07, .017], [0xb87f77, 0x708b8f, 0x809276][i % 3], horse);
      for (const x of [-.055, .085]) for (const y of [-.035, .035]) cylinder([x, y, .145], .012, .016, 0x8a714b, horse);
      for (const y of [-.037, .037]) beam([.12, y, .385], [.18, y, .414], .003, 0xba9252, horse);
      mesh(sphereGeometry(), material(0xba9252), [-.13, 0, .27], [.045, .023, .013], horse);
      for (const y of [-.036, .036]) mesh(sphereGeometry(), material(0x3b3930), [.18, y, .405], [.004, .002, .004], horse);
      beam([.075, 0, .32], [.10, 0, .42], .01, 0xc29f62, horse);
      for (const y of [-.018, .018]) mesh(geometry('horse-ear', () => new THREE.ConeGeometry(.012, .035, 8).rotateX(Math.PI / 2)), material(0xe9dfca), [.135, y, .437], [1, 1, 1], horse);
      for (let j = 0; j < 6; j++) mesh(sphereGeometry(), material(0xc1a66e), [.08 + j * .008, 0, .31 + j * .018], [.017, .020, .012], horse);
      const tail = geometry('horse-tail', () => new THREE.TubeGeometry(new THREE.CubicBezierCurve3(new THREE.Vector3(-.12, 0, .29), new THREE.Vector3(-.20, 0, .32), new THREE.Vector3(-.19, 0, .17), new THREE.Vector3(-.22, 0, .17)), 12, .008, 6, false));
      mesh(tail, material(0xc1a66e), [0, 0, 0], [1, 1, 1], horse);
    }
    animations.push(time => { turntable.rotation.z = reducedMotion ? 0 : time * .16; });
    for (let i = 0; i < 32; i++) { const a = i * Math.PI * 2 / 32; cylinder([Math.cos(a) * .60, Math.sin(a) * .60, .12], .006, .24, 0xba9252, base); }
    ring(.6, .007, [0, 0, .24], 0xba9252, base);
    label('CAROUSEL', [0, -.615, .09], [.42, .07], { background: '#ede0bc', color: '#755433' }, base);
  }
  function ferrisWheel() {
    const record = world.colliders.find(c => c.name === 'park_wheel_base'), base = new THREE.Group(); base.position.set(record.pos[0], record.pos[1], 0); group.add(base);
    for (const y of [-.17, .17]) for (const x of [-.66, .66]) beam([x, y, .24], [0, y, 1.24], .025, 0xddd5bd, base);
    const wheel = new THREE.Group(); wheel.name = 'park-ferris-wheel'; wheel.position.z = 1.24; base.add(wheel);
    for (const y of [-.055, .055]) ring(.8, .016, [0, y, 0], 0xe5d7b4, wheel, true);
    cylinder([0, 0, 0], .15, .18, 0xe5d7b4, wheel).rotation.x = Math.PI / 2;
    ring(.142, .011, [0, -.098, 0], 0xba9252, wheel, true);
    graphic(signs?.goldMark, [0, -.10, 1.24], [.22, .22], base, { cutout: true });
    const cabins = [];
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4, x = Math.cos(a) * .8, z = Math.sin(a) * .8;
      for (const y of [-.055, .055]) beam([0, y, 0], [x, y, z], .010, 0xe5d7b4, wheel);
      beam([x, -.075, z], [x, .075, z], .012, 0xba9252, wheel);
      const cabin = new THREE.Group(); cabin.position.set(x, 0, z); wheel.add(cabin); cabins.push(cabin);
      const color = [0x698e98, 0xb58e50, 0xad6754, 0x879b73][i % 4];
      cylinder([0, 0, -.12], .105, .15, color, cabin); ring(.104, .006, [0, 0, -.045], 0xe5d7b4, cabin);
      for (let j = 0; j < 6; j++) { const a = j * Math.PI / 3; cylinder([Math.cos(a) * .087, Math.sin(a) * .087, .012], .005, .15, 0xe5d7b4, cabin); }
      const top = geometry('cabin-roof', () => new THREE.SphereGeometry(.118, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2));
      mesh(top, material(color), [0, 0, .09], [1, 1, .35], cabin); ring(.113, .005, [0, 0, .09], 0xe5d7b4, cabin);
      mesh(sphereGeometry(), material(0xba9252), [0, 0, .15], [.015, .015, .020], cabin);
      ring(.097, .005, [0, 0, -.09], 0xe5d7b4, cabin);
      for (const y of [-.049, .049]) box([0, y, -.024], [.12, .030, .013], 0xe5d7b4, cabin);
    }
    cylinder([0, 0, 1.24], .085, .11, 0xc3aa78, base).rotation.x = Math.PI / 2;
    for (const side of [-1, 1]) {
      for (const x of [.44, .65, .87]) { cylinder([side * x, -.24, .425], .009, .25, 0x486052, base); mesh(sphereGeometry(), material(0xba9252), [side * x, -.24, .56], [.016, .016, .016], base); }
      for (const z of [.36, .53]) beam([side * .44, -.24, z], [side * .90, -.24, z], .009, 0x486052, base);
    }
    label('THE BIG WHEEL', [0, -.255, .265], [.56, .08], { background: '#dfd1b4', color: '#40594c' }, base);
    animations.push(time => { wheel.rotation.y = reducedMotion ? 0 : time * .12; cabins.forEach(cabin => { cabin.rotation.y = -wheel.rotation.y; }); });
  }
  function gazebo() {
    const base = new THREE.Group(); group.add(base);
    cylinder([0, 0, .003], .7, .006, 0xc9b994, base);
    for (let i = 0; i < 16; i++) { const y = -.63 + i * .08, width = Math.sqrt(Math.max(0, .67 ** 2 - y ** 2)) * 2; mesh(boxGeometry(), material(0xc8a478, 'wood'), [0, y, .008], [width, .075, .006], base); }
    for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4 + Math.PI / 8; cylinder([Math.cos(a) * .6, Math.sin(a) * .6, .45], .015, .9, 0xb6a077, base); }
    const geom = geometry('gazebo-roof', () => new THREE.ConeGeometry(.8, .37, 8).rotateX(Math.PI / 2));
    mesh(geom, material(0x687c73, 'roof'), [0, 0, 1.02], [1, 1, 1], base);
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4 + Math.PI / 8, b = (i + 1) * Math.PI / 4 + Math.PI / 8;
      beam([Math.cos(a) * .80, Math.sin(a) * .80, .84], [0, 0, 1.205], .009, 0xa3b8a1, base);
      beam([Math.cos(a) * .6, Math.sin(a) * .6, .87], [Math.cos(b) * .6, Math.sin(b) * .6, .87], .01, 0xb6a077, base);
      beam([Math.cos(a) * .78, Math.sin(a) * .78, .845], [Math.cos(b) * .78, Math.sin(b) * .78, .845], .016, 0x9eac8c, base);
      beam([Math.cos(a) * .60, Math.sin(a) * .60, .62], [Math.cos(a) * .42, Math.sin(a) * .42, .86], .011, 0xb6a077, base);
      for (let j = 0; j < 5; j++) { const f = j / 5; const x = .6 * ((1 - f) * Math.cos(a) + f * Math.cos(b)), y = .6 * ((1 - f) * Math.sin(a) + f * Math.sin(b)); mesh(sphereGeometry(), material(0xffe4b3, 'light'), [x, y, .85], [.009, .009, .009], base); }
    }
    mesh(sphereGeometry(), material(0xba9252), [0, 0, 1.24], [.036, .036, .055], base);
    label('MUSIC GARDEN', [0, -.61, .73], [.62, .13], {}, base);
    const music = new THREE.Group(); music.position.set(.33, -.74, 0); music.rotation.z = -.14; base.add(music);
    for (const x of [-.10, .10]) { beam([x, -.055, 0], [x, 0, .34], .009, 0xb6a077, music); beam([x, .1, 0], [x, 0, .34], .009, 0xb6a077, music); }
    box([0, 0, .21], [.24, .023, .28], 0xb6a077, music); graphic(signs?.music, [0, -.014, .21], [.21, .25], music);
  }
  function park() {
    signs = createParkSigns();
    ground('grass'); world.colliders.forEach(collider);
    paving([0, 0, -.008], [6.8, 6.5], 'grass');
    for (const [x, y, width, depth] of [[0, -2.65, 1.6, 1.9], [-2.35, 0, 1.65, 1.55], [.6, 2.17, 2.90, 1.35],
      [2.32, .1, 1.87, 2.75], [1.80, -2.32, 1.62, 1.55], [.95, -2.35, .90, .85], [.95, -1.77, .5, .8], [1.5, 1.5, .6, .6],
      [-1.1, -2.17, .9, .8], [-1.85, 1.7, 1.18, .9], [-2.05, 1.10, .7, .85]]) {
      paving([x, y, -.001], [width, depth]);
    }
    const lawn = mesh(geometry('park-lawn', () => new THREE.CircleGeometry(1.07, 64)), material(0xffffff, 'grass'), [0, 0, -.004]); lawn.castShadow = false;
    paving([0, -.92, .001], [.48, .85]);
    const path = new THREE.Shape(); path.absarc(0, 0, 1.88, 0, Math.PI * 2, false);
    const inside = new THREE.Path(); inside.absarc(0, 0, 1.15, 0, Math.PI * 2, true); path.holes.push(inside);
    const walkway = mesh(geometry('park-path', () => new THREE.ShapeGeometry(path, 64)), material(0xbba68e, 'paving'), [0, 0, .001]); walkway.castShadow = false;
    for (const record of world.colliders.filter(record => record.kind === 'flowerbed')) flowerbed(record);
    entrance(); ticketKiosk(); swing();
    directionSign();
    carousel(); ferrisWheel(); gazebo();
    for (const [x, y, yaw] of world.benches) bench(x, y, yaw);
    for (const [x, y, h] of world.trees) tree(x, y, h);
    for (let i = 0; i < 14; i++) { const a = i * Math.PI / 7; if (Math.sin(a) < -.7) continue; flowers(Math.cos(a) * .97, Math.sin(a) * .97, .10, .01); }
    gardeningStation();
    for (const [x, y] of [[-1.8, -1.4], [-1.65, 1.3], [1.8, 1.7], [.9, 2.7], [-1, 2.6], [-.8, -2.4], [1.1, -2.8], [2.8, -1.5]]) planter(x, y, .2);
    for (const [x, y] of [[-1.8, -.9], [-1.3, 2], [1.3, 2], [2, -1.6], [-1.65, -2.15]]) lamp(x, y, 1.05);
    for (const [x, y] of [[-1.65, -2.15], [-1.3, 2], [2, -1.6]]) parkBanner(x, y);
    for (let i = 0; i < 22; i++) {
      const a = i * Math.PI / 11, x = Math.cos(a) * 2.82, y = Math.sin(a) * 2.65;
      if (y < -1.9 && Math.abs(x) < .8) continue;
      leaves([x, y, .13], .20, .25, 230); flowers(x + .11, y - .1, .12);
    }
    for (let i = 0; i < 22; i++) {
      const p = -3.15 + i * .3;
      for (const x of [-3.50, 3.50]) leaves([x, p, .24], .22, .48, 170);
      leaves([p, 3.36, .24], .22, .48, 170);
      if (Math.abs(p) > .9) leaves([p, -3.36, .24], .22, .48, 170);
    }
    bunting([-2.8, 1.3, 1.0], [2.8, 1.7, 1.05]);
    verge(Array.from({ length: 200 }, () => { const a = random() * Math.PI * 2; return [Math.cos(a) * 1.91, Math.sin(a) * 1.91]; }));
    world.stops.forEach((stop, index) => {
      const circle = geometry('stop', () => new THREE.RingGeometry(.105, .12, 32));
      const marker = mesh(circle, material(0xd89a57), [...stop.pos, .006]); marker.castShadow = false;
      marker.material = marker.material.clone(); materials.set(`park-stop:${stop.id}`, marker.material); parkMarkers.push({ marker, id: stop.id });
      const sign = new THREE.Group(); sign.position.set(stop.pos[0] * 1.32 - stop.pos[1] * .30, stop.pos[1] * 1.32 + stop.pos[0] * .30, .15); sign.rotation.z = Math.atan2(stop.pos[0], -stop.pos[1]); group.add(sign);
      cylinder([0, 0, 0], .012, .30, 0x596266, sign); label(String(index + 1).padStart(2, '0'), [0, -.016, .16], [.13, .07], {}, sign);
    });
  }
  function gardeningStation() {
    const action = world.interactions[0], [x, y, z] = action.target, blooms = new THREE.Group(); blooms.name = 'park-garden-blooms'; group.add(blooms);
    for (let i = 0; i < 9; i++) {
      const a = i * 2.4, r = .12 * Math.sqrt(i / 9), px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
      cylinder([px, py, z + .19], .0025, .30, 0x70856b, blooms);
      for (let j = 0; j < 6; j++) { const b = j * Math.PI / 3; mesh(sphereGeometry(), material(i % 2 ? 0xd4a0a1 : 0xe3c76d), [px + Math.cos(b) * .026, py + Math.sin(b) * .026, z + .34], [.029, .015, .008], blooms); }
      mesh(sphereGeometry(), material(0xba9252), [px, py, z + .349], [.015, .015, .008], blooms);
    }
    blooms.scale.z = .16; interactionVisuals.set(action.id, blooms);
    box([-1.80, -.65, .18], [.21, .20, .36], 0xc8a478);
    const can = new THREE.Group(); can.name = 'park-public-watering-can'; can.position.set(-1.8, -.65, .405); group.add(can);
    cylinder([0, 0, 0], .055, .09, 0x789387, can);
    beam([.04, 0, .015], [.11, -.02, .045], .018, 0x789387, can); ring(.036, .006, [-.055, 0, .015], 0x789387, can, true);
    interactionVisuals.set('public-can', can);
    label('BORROW A CAN', [-1.8, -.76, .26], [.20, .07], { background: '#40594c' });
    const stream = new THREE.Group(); stream.name = 'garden-water-drops'; group.add(stream); stream.visible = false;
    for (let i = 0; i < 14; i++) mesh(sphereGeometry(), material(0xadd6de), [x + .18 - i * .012, y, z + .55 - i * .028], [.005, .005, .012], stream);
    interactionVisuals.set('water-drops', stream);
  }
  function harbor() {
    signs = createHarborSigns(); ground('sand'); world.colliders.forEach(collider);
    paving([0, -.55, -.001], [6.6, 3.7], 'stonePaving');
    harborWater();
    for (let i = 0; i < 32; i++) box([-3.2 + i * .205, 1.36, -.04], [.198, .14, .08], 0xb8ab91);
    harborPostOffice(); harborCafe(); lighthouse(); harborDetails();
    for (const record of world.colliders.filter(record => record.name.startsWith('harbor_mailbox'))) {
      const mail = new THREE.Group(); mail.position.set(record.pos[0], record.pos[1], 0); group.add(mail);
      cylinder([0, 0, .09], .024, .18, 0x315975, mail); box([0, 0, .28], [.15, .14, .23], 0xb16f57, mail);
      box([0, -.075, .31], [.09, .008, .012], 0x314743, mail); box([0, -.075, .24], [.09, .008, .065], 0xe9dfc9, mail);
      const lid = box([0, 0, .405], [.18, .18, .035], 0x315975, mail); lid.rotation.x = -.1;
      const index = Number(record.name.at(-1)), stamp = label('✓', [0, -.086, .25], [.07, .055], { background: '#40594c' }, mail);
      if (stamp) { stamp.visible = false; interactionVisuals.set(world.interactions[index + 1].id, stamp); }
      const id = world.interactions[index + 1].id, flag = new THREE.Group(); flag.name = `mail-flag:${id}`; flag.position.set(.089, .025, .32); mail.add(flag);
      cylinder([0, 0, .035], .003, .07, 0xba9252, flag); box([.025, 0, .065], [.05, .007, .030], 0xc6a766, flag); flag.rotation.y = Math.PI / 2;
      const envelope = new THREE.Group(); envelope.name = `mail-envelope:${id}`; mail.add(envelope); envelope.visible = false;
      box([0, 0, 0], [.066, .004, .045], 0xf4ead5, envelope);
      beam([-.031, -.003, .020], [0, -.003, -.004], .0009, 0x9c7560, envelope); beam([.031, -.003, .020], [0, -.003, -.004], .0009, 0x9c7560, envelope);
      box([.021, -.003, .009], [.010, .002, .012], 0x789387, envelope); deliveries.set(id, { flag, envelope, stamp });
    }
    for (const action of world.interactions) {
      const marker = mesh(geometry('harbor-action-ring', () => new THREE.RingGeometry(.14, .16, 32)), material(0xc6a766), [...action.pos, .004]); marker.castShadow = false;
    }
    for (const [x, y] of [[-2.8, .65], [-.9, 1.0], [1.7, -.75]]) planter(x, y, .17);
    for (const [x, y] of [[-2.9, -.55], [.85, -.8], [2.9, .70]]) lamp(x, y, .9);
    bench(.35, -1.94, Math.PI); bench(-2.6, -2.10, 0);
    for (const [x, y] of [[-3.85, -.5], [-3.6, -2.6], [3.8, -2.5]]) tree(x, y, 1.05);
    bunting([-2.7, .15, 1.20], [-.8, .15, 1.20], .13);
    label('SEA SALT WALK', [0, -2.30, .16], [.65, .10], { background: '#315975' });
    // Boats and the timber jetty sit beyond the contact-enabled quay railing.
    paving([1.15, 2.25, .035], [.48, 1.8], 'wood');
    for (const y of [1.55, 2.35, 3.05]) for (const x of [.85, 1.45]) { cylinder([x, y, .1], .028, .32, 0x957d5c); ring(.028, .005, [x, y, .22], 0xe4d7b8); }
    sailboat(-.75, 2.28, .70, -.16); sailboat(2.15, 3.8, .52, .28);
  }
  function harborWater() {
    const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { time: { value: 0 }, deep: { value: new THREE.Color(0x4e8998) }, shallow: { value: new THREE.Color(0x9cc3bd) }, sky: { value: new THREE.Color(world.atmosphere.horizon) } }]);
    const water = new THREE.ShaderMaterial({ uniforms, fog: true,
      vertexShader: `varying vec2 seaPoint; varying vec3 worldPoint;
        #include <fog_pars_vertex>
        void main() { seaPoint = position.xy + vec2(0.0, 41.36); worldPoint = (modelMatrix * vec4(position, 1.0)).xyz;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: `uniform float time; uniform vec3 deep; uniform vec3 shallow; uniform vec3 sky;
        varying vec2 seaPoint; varying vec3 worldPoint;
        #include <fog_pars_fragment>
        void main() {
          vec2 p = seaPoint; float a = p.x * 5.8 + p.y * 3.1 - time * .65, b = p.x * 2.3 - p.y * 6.1 + time * .48;
          vec3 normal = normalize(vec3(-cos(a) * .10 - cos(b) * .055, 1.0, cos(a) * .055 - cos(b) * .11));
          vec3 view = normalize(cameraPosition - worldPoint), light = normalize(vec3(-.4, 1.0, .6));
          float fresnel = pow(1.0 - max(dot(normal, view), 0.0), 4.0);
          float glint = pow(max(dot(normal, normalize(view + light)), 0.0), 100.0);
          float coast = exp(-max(p.y - 1.36, 0.0) * .30);
          vec3 color = mix(deep, shallow, coast * .8) + (sin(a) * sin(b)) * .017;
          color = mix(color, sky, fresnel * .48); color += glint * .28;
          float foam = exp(-abs(p.y - 1.36) * 23.0) * (.30 + .35 * sin(p.x * 8.0 + time * .6));
          gl_FragColor = vec4(mix(color, vec3(.82, .86, .75), foam), 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <fog_fragment>
        }` });
    materials.set('harbor-water', water);
    const sea = mesh(geometry('harbor-sea', () => new THREE.PlaneGeometry(80, 80)), water, [0, 41.36, -.009]); sea.name = 'harbor-water'; sea.castShadow = sea.receiveShadow = false;
    animations.push(time => { uniforms.time.value = reducedMotion ? 0 : time; });
  }
  function harborDetails() {
    const wood = material(0xb89c78, 'wood');
    paving([1.6, 1.04, .002], [3.1, .48], 'wood');
    for (let i = 0; i < 16; i++) { const seam = box([.12 + i * .19, 1.04, .003], [.003, .48, .002], 0x87735b); seam.castShadow = false; }
    for (const record of world.colliders.filter(record => record.name.startsWith('harbor_crate_'))) {
      const crate = new THREE.Group(); crate.position.fromArray(record.pos); group.add(crate); const [w, d, h] = record.size;
      mesh(boxGeometry(), wood, [0, 0, 0], [2 * w, 2 * d, 2 * h], crate);
      for (const z of [-h * .6, 0, h * .6]) box([0, -d - .002, z], [2 * w, .012, .006], 0x927955, crate);
      for (const x of [-w * .75, w * .75]) box([x, -d - .007, 0], [.016, .012, 2 * h], 0xc3ae89, crate);
      label('DUCKROBE / POST', [0, -d - .015, .015], [w * 1.4, .044], { background: '#b89c78', color: '#536450' }, crate);
    }
    for (const record of world.colliders.filter(record => record.name.startsWith('harbor_cafe_chair_'))) {
      const chair = new THREE.Group(); chair.position.set(record.pos[0], record.pos[1], 0); chair.rotation.z = record.yaw; group.add(chair);
      for (const x of [-.052, .052]) for (const y of [-.042, .042]) cylinder([x, y, .08], .006, .16, 0x40594c, chair);
      mesh(boxGeometry(), wood, [0, 0, .165], [.13, .11, .018], chair);
      for (const x of [-.052, .052]) cylinder([x, .045, .215], .005, .13, 0x40594c, chair);
      for (const z of [.23, .27]) mesh(boxGeometry(), wood, [0, .046, z], [.12, .014, .020], chair);
    }
    const menu = world.colliders.find(record => record.name === 'harbor_menu'), stand = new THREE.Group(); stand.position.set(menu.pos[0], menu.pos[1], 0); group.add(stand);
    for (const x of [-.075, .075]) { beam([x, -.035, 0], [x, 0, .40], .007, 0x8d795b, stand); beam([x, .06, 0], [x, 0, .40], .007, 0x8d795b, stand); }
    mesh(boxGeometry(), wood, [0, 0, .24], [.17, .035, .30], stand); graphic(signs?.menu, [0, -.019, .24], [.15, .275], stand);
    const buoy = ring(.125, .026, [-2.85, 1.255, .34], 0xf0e1bd, group, true);
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; const band = box([-2.85 + Math.cos(a) * .125, 1.23, .34 + Math.sin(a) * .125], [.047, .046, .045], 0xae6956); band.rotation.y = -a; }
    const rope = geometry('harbor-rope', () => new THREE.TubeGeometry(new THREE.CatmullRomCurve3([[-2.85, 1.24, .51], [-2.96, 1.23, .60], [-3.04, 1.23, .36], [-2.98, 1.23, .15]].map(p => new THREE.Vector3(...p))), 24, .0035, 6, false));
    mesh(rope, material(0xc3ae89), [0, 0, 0]); buoy.name = 'harbor-life-buoy';
    for (const x of [.85, 1.45]) for (let i = 0; i < 3; i++) ring(.031, .003, [x, 1.55, .23 + i * .006], 0xc7b38c);
    const mooring = geometry('mooring-line', () => new THREE.TubeGeometry(new THREE.CatmullRomCurve3([[.85, 2.35, .20], [.3, 2.1, .07], [-.42, 2.26, .11]].map(p => new THREE.Vector3(...p))), 28, .003, 6, false)); mesh(mooring, material(0xc7b38c), [0, 0, 0]);
    label('01 / POST', [-.65, -.112, .24], [.078, .036], { background: '#e9dfc9', color: '#315975' });
    verge(Array.from({ length: 90 }, (_, i) => [-3.2 + i * .072, -2.36 + (random() - .5) * .02]));
    for (const [x, y] of [[-3.05, .85], [3.05, .15], [1.55, -1.95]]) { flowers(x, y, .07, 0, 0xe5dbc0); }
  }
  function pitchedRoof(pos, width, depth, height, color, parent) {
    const shape = new THREE.Shape(); shape.moveTo(-width / 2, 0); shape.lineTo(0, height); shape.lineTo(width / 2, 0); shape.closePath();
    const geom = geometry(`harbor-roof:${width}:${depth}:${height}`, () => new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false }).rotateX(Math.PI / 2));
    return mesh(geom, material(color, 'roof'), pos, [1, 1, 1], parent);
  }
  function harborPostOffice() {
    const base = new THREE.Group(); base.position.set(-1.75, .65, 0); group.add(base);
    mesh(boxGeometry(), material(0xe7dbc3, 'wood'), [0, 0, .52], [1.16, .72, 1.04], base);
    pitchedRoof([0, .43, 1.02], 1.35, .86, .34, 0x46657a, base);
    graphic(signs?.post, [0, -.368, .81], [1.07, .267], base);
    box([0, -.367, .32], [.24, .025, .64], 0x315975, base); box([0, -.384, .46], [.16, .015, .23], 0x95b0ac, base);
    cylinder([.075, -.39, .30], .010, .024, 0xba9252, base).rotation.x = Math.PI / 2;
    for (const x of [-.39, .39]) {
      box([x, -.37, .38], [.26, .023, .33], 0x315975, base); box([x, -.386, .40], [.20, .008, .26], 0x9dbbb8, base);
      for (const z of [.40, .535]) box([x, -.394, z], [.23, .012, .017], 0xe8dfc7, base);
      box([x, -.396, .40], [.017, .012, .28], 0xe8dfc7, base);
      box([x, -.405, .18], [.29, .12, .085], 0xb27f60, base); flowers(-1.75 + x, .23, .10, .22);
    }
    for (const x of [-.58, .58]) box([x, -.37, .53], [.035, .035, 1.05], 0xf1e4cc, base);
    label('POSTCARDS HERE', [0, -.40, .11], [.22, .075], { background: '#f4e8cc', color: '#315975' }, base);
    graphic(signs?.mark, [0, -.018, 1.21], [.20, .20], base, { cutout: true });
  }
  function harborCafe() {
    const base = new THREE.Group(); base.position.set(.05, .74, 0); group.add(base);
    mesh(boxGeometry(), material(0xc9a179, 'wood'), [0, 0, .38], [.96, .64, .76], base); pitchedRoof([0, .38, .76], 1.08, .76, .23, 0x7d8e7b, base);
    box([0, -.326, .42], [.76, .025, .34], 0xe4dec4, base); box([0, -.34, .42], [.67, .013, .25], 0x688d8b, base);
    for (let i = 0; i < 10; i++) { const awning = box([-.45 + i * .1, -.47, .67], [.10, .35, .018], i % 2 ? 0xf3e5c8 : 0x8ba59b, base); awning.rotation.x = .18; }
    label('SEA SALT CAFÉ', [0, -.33, .72], [.69, .085], { background: '#40594c' }, base);
    cylinder([.23, -.66, .16], .10, .035, 0xb78c63, base); cylinder([.23, -.66, .075], .015, .15, 0x315975, base);
    cylinder([.23, -.66, .202], .018, .05, 0xf3e5c8, base); cylinder([.23, -.66, .23], .014, .006, 0x735344, base);
  }
  function lighthouse() {
    const base = new THREE.Group(); base.position.set(2.25, .65, 0); group.add(base);
    cylinder([0, 0, .72], .27, 1.44, 0xeee4cc, base);
    for (const z of [.34, .80, 1.30]) cylinder([0, 0, z], .274, .12, 0x315975, base);
    for (const z of [.60, 1.03]) { box([0, -.274, z], [.07, .009, .13], 0x315975, base); box([0, -.28, z], [.05, .007, .09], 0xabc5be, base); }
    cylinder([0, 0, 1.46], .34, .045, 0xb79e6a, base); cylinder([0, 0, 1.58], .23, .21, 0xbdd5ca, base);
    for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; cylinder([Math.cos(a) * .23, Math.sin(a) * .23, 1.58], .011, .23, 0x315975, base); }
    cylinder([0, 0, 1.57], .09, .10, 0xffe4b3, base); pitchedRoof([0, .34, 1.70], .68, .68, .20, 0x315975, base);
    label('GOOD WALKS / FAIR WINDS', [0, -.281, .19], [.40, .11], { background: '#eee4cc', color: '#315975' }, base);
    graphic(signs?.mark, [0, -.278, .92], [.17, .17], base, { cutout: true });
  }
  function sailboat(x, y, scale, angle) {
    const boat = new THREE.Group(); boat.position.set(x, y, .015); boat.rotation.z = angle; boat.scale.setScalar(scale); group.add(boat);
    const hull = geometry('boat-hull', () => new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2));
    mesh(hull, material(0x315975), [0, 0, .10], [.62, .22, .18], boat); box([0, 0, .10], [1.08, .33, .035], 0xd3b68e, boat);
    cylinder([0, 0, .69], .016, 1.28, 0x957d5c, boat);
    const shape = new THREE.Shape(); shape.moveTo(.025, .23); shape.lineTo(.025, 1.29); shape.lineTo(.49, .23); shape.closePath();
    const sail = mesh(geometry('sail', () => new THREE.ShapeGeometry(shape).rotateX(Math.PI / 2)), material(0xf3e5c8), [0, 0, 0], [1, 1, 1], boat); sail.material.side = THREE.DoubleSide;
    graphic(signs?.mark, [.17, -.004, .54], [.20, .20], boat, { cutout: true });
    if (!reducedMotion) animations.push(time => { boat.rotation.x = Math.sin(time * .6 + x) * .018; boat.position.z = .015 + Math.sin(time * .7 + y) * .008; });
  }
  function flowerbed(record) {
    const [x, y, z] = record.pos, [radius, height] = record.size, top = z + height;
    const lawn = mesh(geometry(`bed-lawn:${radius}`, () => new THREE.CircleGeometry(radius - .018, 40)), material(0xffffff, 'grass'), [x, y, top + .001]); lawn.castShadow = false;
    const count = Math.ceil(radius * 60);
    for (let i = 0; i < count; i++) {
      const a = i * Math.PI * 2 / count, block = mesh(boxGeometry(), material(0xd3c4a9, 'stone'), [x + Math.cos(a) * radius, y + Math.sin(a) * radius, z], [radius * Math.PI * 2 / count - .003, .025, height * 2]); block.rotation.z = a + Math.PI / 2;
    }
    const palette = x < -1 ? [0xbcb0cf, 0xf3ead4] : y > 1 ? [0xe2c278, 0xf3ead4] : [0xd4a0a1, 0xf3ead4], heightVariation = radius > .35 ? .36 : .19;
    leaves([x - radius * .13, y + radius * .10, top + heightVariation / 2], radius * .48, heightVariation, 470);
    for (let i = 0; i < 7; i++) { const a = i * 2.39996; flowers(x + Math.cos(a) * radius * .67, y + Math.sin(a) * radius * .67, radius * (.16 + random() * .08), top, palette[i % 2]); }
  }
  function parkBanner(x, y) {
    beam([x, y, .98], [x + .24, y, .98], .006, 0x344540);
    const banner = graphic(signs?.banner, [x + .135, y - .012, .81], [.19, .32], group, { cutout: true });
    if (banner) banner.material.side = THREE.DoubleSide;
  }
  function directionSign() {
    const record = world.colliders.find(record => record.name === 'park_wayfinding'), post = new THREE.Group(); post.position.set(record.pos[0], record.pos[1], 0); post.rotation.z = -.15; group.add(post);
    mesh(sphereGeometry(), material(0xba9252), [0, 0, .75], [.029, .029, .035], post);
    for (let i = 0; i < 4; i++) {
      const z = .65 - i * .11, color = [0xb1725d, 0x70856b, 0x557384, 0xb5965c][i];
      box([0, -.025, z], [.36, .028, .09], color, post);
      const arrow = new THREE.Shape(); arrow.moveTo(0, -.045); arrow.lineTo(.06, 0); arrow.lineTo(0, .045); arrow.closePath();
      const tip = mesh(geometry('direction-arrow', () => new THREE.ShapeGeometry(arrow).rotateX(Math.PI / 2)), material(color), [i % 2 ? .18 : -.18, -.041, z], [1, 1, 1], post); if (!(i % 2)) tip.scale.x = -1;
      graphic(signs?.directions[i], [0, -.041, z], [.33, .083], post);
    }
  }
  function entrance() {
    const posts = world.colliders.filter(c => c.name.startsWith('park_gate_')), y = posts[0].pos[1];
    for (const post of posts) {
      const x = post.pos[0];
      mesh(boxGeometry(), material(0xd9cbb0, 'stone'), [x, y, .5], [.10, .13, 1]);
      for (const z of [.08, .88, 1]) box([x, y, z], [.15, .16, .08], 0xe2d5b8);
      for (let i = 1; i < 7; i++) box([x, y - .067, .12 + i * .105], [.10, .004, .006], 0xb4a58b);
      box([x, y - .095, .66], [.06, .055, .09], 0x344c3e);
      const light = box([x, y - .127, .66], [.042, .015, .065], 0xffe4b3); light.material = material(0xffe4b3, 'light'); light.castShadow = false;
      cylinder([x, y, 1.105], .019, .09, 0xba9252);
      const globe = geometry('gate-balloon', () => {
        const g = new THREE.SphereGeometry(1, 20, 14).rotateX(Math.PI / 2), p = g.attributes.position, colors = [];
        for (let i = 0; i < p.count; i++) { const a = Math.atan2(p.getY(i), p.getX(i)); const color = new THREE.Color([0xd9aa91, 0xe3ce9f, 0x90a9a0, 0xe3ce9f][Math.floor((a + Math.PI) / (Math.PI / 2)) % 4]); colors.push(color.r, color.g, color.b); }
        g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); return g;
      });
      if (!materials.has('balloon')) materials.set('balloon', new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .6 }));
      const balloonMaterial = materials.get('balloon');
      mesh(globe, balloonMaterial, [x, y, 1.21], [.056, .056, .082]);
      ring(.033, .004, [x, y, 1.145], 0xba9252);
    }
    const shape = new THREE.Shape(); shape.moveTo(-.81, 0); shape.lineTo(.81, 0); shape.lineTo(.81, .18); shape.quadraticCurveTo(.5, .37, .17, .34);
    shape.bezierCurveTo(.17, .55, -.17, .55, -.17, .34); shape.quadraticCurveTo(-.5, .37, -.81, .18); shape.closePath();
    const arch = geometry('park-arch', () => new THREE.ExtrudeGeometry(shape, { depth: .04, bevelEnabled: true, bevelSegments: 3, steps: 1, bevelSize: .009, bevelThickness: .006 }));
    const border = mesh(arch, material(0x967a50), [0, y, 1.01]); border.rotation.x = Math.PI / 2;
    const inset = mesh(arch, material(0xe5d4b4), [0, y - .025, 1.024], [.97, .92, 1]); inset.rotation.x = Math.PI / 2;
    graphic(signs?.entrance, [0, y - .08, 1.265], [1.34, .49], group, { cutout: true });
    bunting([-.69, y + .01, .97], [.69, y + .01, .97], .10);
    for (const x of [-.91, .91]) planter(x, y, .15);
  }
  function ticketKiosk() {
    const record = world.colliders.find(c => c.name === 'park_kiosk'), base = new THREE.Group(); base.position.set(record.pos[0], record.pos[1], 0); group.add(base);
    mesh(boxGeometry(), material(0xd1b48c, 'wood'), [0, 0, .35], [.70, .50, .70], base);
    for (let i = 0; i < 8; i++) box([0, -.252, .045 + i * .085], [.69, .005, .008], 0x9e825d, base);
    box([0, -.265, .42], [.34, .025, .29], 0x4b5750, base); box([0, -.28, .285], [.41, .11, .028], 0xead7b4, base);
    for (const x of [-.21, .21]) box([x, -.27, .42], [.028, .035, .35], 0xe8d8b7, base);
    const roof = geometry('kiosk-roof', () => new THREE.CylinderGeometry(.42, .42, .64, 32, 1, false, 0, Math.PI).rotateY(-Math.PI / 2));
    mesh(roof, material(0x5c7769, 'roof'), [0, 0, .71], [1, 1, .68], base);
    for (const y of [-.325, 0, .325]) {
      const trim = geometry('kiosk-roof-trim', () => new THREE.TorusGeometry(.423, .006, 6, 32, Math.PI));
      const rib = mesh(trim, material(0xc3b28b), [0, y, .71], [1, .68, 1], base); rib.rotation.x = Math.PI / 2;
    }
    for (const x of [-.34, .34]) for (const y of [-.25, .25]) box([x, y, .37], [.025, .025, .71], 0xebddbd, base);
    const valance = geometry('awning-valance', () => {
      const s = new THREE.Shape(); s.moveTo(-.05, .02); s.lineTo(.05, .02); s.lineTo(.05, -.015); s.quadraticCurveTo(0, -.07, -.05, -.015); s.closePath(); return new THREE.ShapeGeometry(s).rotateX(Math.PI / 2);
    });
    for (let i = 0; i < 8; i++) {
      const color = i % 2 ? 0xf1dfbc : 0xb75d4c, flap = box([-.35 + i * .1, -.36, .64], [.10, .24, .018], color, base); flap.rotation.x = .24;
      const hem = mesh(valance, material(color), [-.35 + i * .1, -.485, .61], [1, 1, 1], base); hem.material.side = THREE.DoubleSide;
    }
    box([0, -.33, .74], [.61, .045, .135], 0xe5d4b4, base); graphic(signs?.ticket, [0, -.355, .74], [.56, .105], base);
    const badge = cylinder([0, -.337, .885], .095, .022, 0xe5d4b4, base); badge.rotation.x = Math.PI / 2;
    graphic(signs?.goldMark, [0, -.352, .885], [.146, .146], base, { cutout: true });
    mesh(sphereGeometry(), material(0xba9252), [0, 0, 1.035], [.028, .028, .045], base);
    for (const x of [-.10, 0, .10]) { box([x, -.291, .38], [.055, .006, .10], [0xc08770, 0x8da294, 0xd4bd89][Math.round(x * 10) + 1], base); }
    for (const x of [-.44, .44]) {
      box([x, -.15, .085], [.19, .19, .17], 0xd1b48c, base);
      for (let i = 0; i < 4; i++) box([x, -.25, .025 + i * .04], [.19, .005, .005], 0x9e825d, base);
      flowers(record.pos[0] + x, record.pos[1] - .15, .105, .17, 0xd4a0a1);
    }
  }
  function swing() {
    for (const x of [2.22, 2.98]) for (const y of [-.86, -.32]) beam([x, y, .03], [x, -.59, .82], .024, 0xb99a70);
    beam([2.16, -.59, .82], [3.04, -.59, .82], .03, 0xb99a70);
    for (const x of [2.49, 2.71]) beam([x, -.59, .80], [x, -.59, .24], .003, 0x596266);
    const seat = box([2.6, -.59, .23], [.27, .16, .025], 0x465a4d); seat.rotation.x = -.06;
    paving([2.62, .1, .001], [1.05, 2.5], 'sand');
    for (const x of [2.49, 2.71]) for (let i = 0; i < 19; i++) { const link = ring(.007, .0015, [x, -.59, .27 + i * .026], 0x929997); link.rotation.x = Math.PI / 2; if (i % 2) link.rotation.z = Math.PI / 2; }
    for (const x of [2.28, 2.72]) for (const y of [.49, .75]) cylinder([x, y, 1.01], .013, .28, 0xb99a70);
    const roof = geometry('play-roof', () => {
      const s = new THREE.Shape(); s.moveTo(-.29, 0); s.lineTo(0, .19); s.lineTo(.29, 0); s.closePath(); return new THREE.ExtrudeGeometry(s, { depth: .48, bevelEnabled: false }).rotateX(Math.PI / 2);
    });
    mesh(roof, material(0xad6c55), [2.5, .86, 1.15]);
    const fenceBadge = new THREE.Group(); fenceBadge.position.set(2.018, -.75, .18); fenceBadge.rotation.z = -Math.PI / 2; group.add(fenceBadge);
    box([0, 0, 0], [.21, .018, .19], 0xe5d4b4, fenceBadge); graphic(signs?.goldMark, [0, -.012, 0], [.16, .16], fenceBadge, { cutout: true });
  }
  function bunting(start, end, sag = .15) {
    for (let i = 0; i < 18; i++) {
      const f = i / 18, g = (i + 1) / 18;
      const point = t => start.map((v, j) => v + (end[j] - v) * t - (j === 2 ? Math.sin(t * Math.PI) * sag : 0));
      const a = point(f), b = point(g); beam(a, b, .0015, 0x8d795b);
      const s = new THREE.Shape(); s.moveTo(0, 0); s.lineTo(.10, 0); s.lineTo(.05, -.13); s.closePath();
      const mat = material([0xb66c51, 0xd8bb7a, 0x789387][i % 3]); mat.side = THREE.DoubleSide;
      const flag = mesh(geometry('bunting', () => new THREE.ShapeGeometry(s)), mat, a); flag.rotation.set(Math.PI / 2, 0, Math.atan2(b[1] - a[1], b[0] - a[0]), 'ZYX'); flag.castShadow = false;
    }
  }
  if (world.id === 'arena') {
    const grid = makeInfiniteGrid(), { wallMats, wallMeshes } = makeArenaWalls(); group.add(grid, ...wallMeshes);
    arenaMaterials = [grid.material, ...wallMats]; arenaMaterials.forEach(mat => { mat.uniforms.uReveal.value = 1; });
  } else {
    group.rotation.x = -Math.PI / 2;
    sky();
    if (world.id === 'circuit') circuit(); else if (world.id === 'harbor') harbor(); else park();
    for (let i = 0; i < 16; i++) {
      const a = .1 + i * Math.PI / 8, r = world.id === 'park' ? 4.7 : 3.9;
      if (world.id === 'harbor' || world.id === 'park' && Math.sin(a) < -.65) continue;
      tree(Math.cos(a) * r, Math.sin(a) * r, 1.5 + random() * .6);
    }
  }
  function update(pose, target, activity, interactions = { completed: [] }) {
    arenaMaterials.forEach(mat => mat.uniforms.uFocus.value.copy(target));
    animations.forEach(animate => animate(pose.time));
    signs?.update(activity);
    for (const { lens, green } of raceLights) { lens.material.emissive.setHex(green ? 0x668c64 : 0xb87c38); lens.material.emissiveIntensity = (green ? pose.time >= 3 : pose.time < 3) ? 1.7 : 0; }
    for (const { line, gate } of checkpointMarkers) { line.material.emissive.setHex(0xd5af64); line.material.emissiveIntensity = activity.started && activity.nextGate === gate ? .32 : 0; }
    for (const { marker, id } of parkMarkers) marker.material.color.setHex(activity.stamps.includes(id) ? 0x789b72 : 0xd89a57);
    for (const [id, visual] of interactionVisuals) {
      if (['water-drops', 'public-can'].includes(id)) continue;
      const done = interactions.completed.includes(id);
      if (world.id === 'park') {
        const elapsed = pose.time - (interactions.wateredAt ?? Infinity), f = reducedMotion ? 1 : THREE.MathUtils.smoothstep(elapsed, 0, 1.4);
        visual.scale.z = done ? .16 + .84 * f : .16;
      } else visual.visible = done;
    }
    for (const [id, { flag, envelope, stamp }] of deliveries) {
      const done = interactions.completed.includes(id), elapsed = pose.time - (interactions.performedAt?.[id] ?? Infinity), f = reducedMotion ? 1 : THREE.MathUtils.smoothstep(elapsed, 0, .75);
      flag.rotation.y = done ? (1 - f) * Math.PI / 2 : Math.PI / 2;
      envelope.visible = done && elapsed >= 0 && elapsed < .75 && !reducedMotion;
      envelope.position.set(0, -.16 + .13 * f, .37 - .10 * f); if (stamp) stamp.visible = done && f === 1;
    }
    const drops = interactionVisuals.get('water-drops');
    if (drops) drops.visible = interactions.completed.includes('garden') && pose.time - (interactions.wateredAt ?? -Infinity) < 2 && !reducedMotion;
    const can = interactionVisuals.get('public-can');
    if (can) {
      const watering = drops.visible && !interactions.wateringCan;
      can.position.set(watering ? -1.90 : -1.8, watering ? -1.0 : -.65, watering ? .38 : .405); can.rotation.y = watering ? .4 : 0;
    }
    if (actorShadow) { actorShadow.position.set(pose.root[0], pose.root[1], .009); actorShadow.material.opacity = Math.max(0, .4 - Math.max(0, pose.root[2] - .12)); }
  }
  function dispose() {
    if (disposed) return; disposed = true;
    group.removeFromParent();
    group.traverse(node => { if (node.isInstancedMesh) node.dispose(); if (node.geometry) geometries.set(node.geometry.uuid, node.geometry); if (node.material) (Array.isArray(node.material) ? node.material : [node.material]).forEach(mat => materials.set(mat.uuid, mat)); });
    new Set(geometries.values()).forEach(geom => geom.dispose()); new Set(materials.values()).forEach(mat => mat.dispose()); textures.forEach(texture => texture.dispose());
    signs?.dispose(); animations = []; arenaMaterials = [];
  }
  for (const { geom, mat, transforms, colors } of instances.values()) {
    const batch = new THREE.InstancedMesh(geom, mat, transforms.length);
    transforms.forEach((matrix, i) => { batch.setMatrixAt(i, matrix); batch.setColorAt(i, colors[i]); });
    batch.castShadow = batch.receiveShadow = true; batch.computeBoundingSphere(); group.add(batch);
  }
  instances.clear();
  return { group, sky: skyDome, update, dispose };
}
