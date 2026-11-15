import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createSky, createEnvironment, SUN_DIR, HORIZON_COL } from './sky.js';
import { createCessna } from './aircraft.js';

// ================================================================== aeroporti
// heading = prua di decollo (gradi) dalla testata di partenza; elev = quota (m)
const RAW_AIRPORTS = [
  { id: 'A', name: 'Volare Intl', x: 0, z: 0, elev: 0, heading: 0, length: 1200, width: 30, nums: ['36', '18'] },
  { id: 'B', name: 'Monte Alto', x: 4200, z: -7500, elev: 90, heading: 60, length: 900, width: 25, nums: ['06', '24'] },
];

export const AIRPORTS = RAW_AIRPORTS.map((a) => {
  const th = (-a.heading * Math.PI) / 180; // rotazione attorno a Y
  return { ...a, th, c: Math.cos(th), s: Math.sin(th) };
});

export function localToWorld(a, lx, lz) {
  return { x: a.x + lx * a.c + lz * a.s, z: a.z - lx * a.s + lz * a.c };
}
export function worldToLocal(a, x, z) {
  const dx = x - a.x, dz = z - a.z;
  return [dx * a.c - dz * a.s, dx * a.s + dz * a.c];
}
export function spawnFor(a) {
  const p = localToWorld(a, 0, a.length / 2 - 95);
  return { x: p.x, z: p.z, yaw: a.th };
}
function flatDist(a, x, z) {
  const [lx, lz] = worldToLocal(a, x, z);
  return Math.hypot(Math.max(Math.abs(lx) - 60, 0), Math.max(Math.abs(lz) - a.length / 2 - 100, 0));
}
export function airportDist(x, z) {
  let d = Infinity;
  for (const a of AIRPORTS) d = Math.min(d, flatDist(a, x, z));
  return d;
}
export function isOnRunway(x, z) {
  for (const a of AIRPORTS) {
    const [lx, lz] = worldToLocal(a, x, z);
    if (Math.abs(lx) < a.width / 2 + 4 && Math.abs(lz) < a.length / 2 + 20) return true;
  }
  return false;
}

// ================================================================== terreno (funzioni analitiche)
const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hash2(ix, iz) {
  let h = Math.imul(ix, 374761393) + Math.imul(iz, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  return lerp(lerp(hash2(ix, iz), hash2(ix + 1, iz), u), lerp(hash2(ix, iz + 1), hash2(ix + 1, iz + 1), u), v);
}

export function terrainHeight(x, z) {
  let h = 90 * (0.5 + 0.5 * Math.sin(x * 0.0011 + Math.sin(z * 0.0007) * 2.0));
  h += 60 * Math.sin(x * 0.0031 + 1.3) * Math.sin(z * 0.0027);
  h += 22 * Math.sin(x * 0.009 + z * 0.007);
  h += 8 * Math.sin(x * 0.03) * Math.sin(z * 0.027);
  h = Math.max(0, h);
  for (const a of AIRPORTS) {
    const w = smoothstep(250, 1700, flatDist(a, x, z));
    if (w < 1) h = a.elev + (h - a.elev) * w;
  }
  return h;
}

/** densità di bosco 0..1 (macchie di foresta) */
export function forestDensity(x, z) {
  const n = 0.6 * vnoise(x * 0.0012, z * 0.0012) + 0.3 * vnoise(x * 0.0035 + 7, z * 0.0035) + 0.1 * vnoise(x * 0.01, z * 0.01);
  return smoothstep(0.5, 0.66, n);
}

// ================================================================== texture
function makeRunwayTexture(a) {
  const L = a.length, Wd = a.width;
  const W = 256, H = Math.round(L * 5);
  const sx = W / Wd, sy = H / L;
  const mx = (m) => (m + Wd / 2) * sx;
  const mz = (m) => (m + L / 2) * sy;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#3b3c40';
  g.fillRect(0, 0, W, H);
  for (let i = 0; i < H * 3; i++) {
    const v = 48 + Math.random() * 30;
    g.fillStyle = `rgba(${v},${v},${v + 3},0.35)`;
    g.fillRect(Math.random() * W, Math.random() * H, 2, 2);
  }
  // fessure e rattoppi
  g.strokeStyle = 'rgba(20,20,22,0.5)'; g.lineWidth = 1;
  for (let i = 0; i < 40; i++) { g.beginPath(); const x = Math.random() * W, y = Math.random() * H; g.moveTo(x, y); g.lineTo(x + (Math.random() - 0.5) * 60, y + (Math.random() - 0.5) * 60); g.stroke(); }
  g.fillStyle = 'rgba(15,15,17,0.35)';
  for (const end of [-1, 1]) for (const off of [-3, 3]) g.fillRect(mx(off - 1), mz(end * (L / 2 - 250) - 50), 2 * sx, 100 * sy);
  g.fillStyle = '#ececec';
  g.fillRect(mx(-Wd / 2 + 0.8), 0, 0.4 * sx, H);
  g.fillRect(mx(Wd / 2 - 1.2), 0, 0.4 * sx, H);
  for (let z = -L / 2 + 70; z < L / 2 - 70; z += 40) g.fillRect(mx(-0.3), mz(z), 0.6 * sx, 20 * sy);
  for (const end of [-1, 1]) {
    for (let i = -6; i <= 6; i++) {
      if (i === 0) continue;
      const z0 = end < 0 ? -L / 2 + 8 : L / 2 - 8 - 28;
      g.fillRect(mx(i * (Wd / 16) - 0.45), mz(z0), 0.9 * sx, 28 * sy);
    }
    for (const z of [L / 2 - 240, L / 2 - 300]) for (const sgn of [-1, 1]) g.fillRect(mx(sgn * 4.5 - 1.1), mz(end * z - 10), 2.2 * sx, 20 * sy);
  }
  g.font = `bold ${Math.round(9 * sx)}px Arial`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.save(); g.translate(mx(0), mz(L / 2 - 50)); g.scale(1, sy / sx); g.fillText(a.nums[0], 0, 0); g.restore();
  g.save(); g.translate(mx(0), mz(-L / 2 + 50)); g.rotate(Math.PI); g.scale(1, sy / sx); g.fillText(a.nums[1], 0, 0); g.restore();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 16;
  return tex;
}

function facadeTexture(rows, cols, wall = '#d9d6cc', glass = '#2b4258') {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = wall; g.fillRect(0, 0, 512, 256);
  const mw = 512 / cols, mh = 256 / rows;
  for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++) {
    const grd = g.createLinearGradient(0, r * mh, 0, (r + 1) * mh);
    grd.addColorStop(0, '#5f7f9a'); grd.addColorStop(1, glass);
    g.fillStyle = grd; g.fillRect(k * mw + mw * 0.1, r * mh + mh * 0.18, mw * 0.8, mh * 0.64);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

// ================================================================== aeroporto
function buildAirport(scene, a) {
  const g = new THREE.Group();
  g.position.set(a.x, a.elev, a.z);
  g.rotation.y = a.th;
  scene.add(g);
  const L = a.length;
  const std = (color, rough = 0.8, metal = 0) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
  const asphaltMat = (extra = {}) => new THREE.MeshStandardMaterial({ roughness: 0.88, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6, ...extra });

  const runway = new THREE.Mesh(new THREE.PlaneGeometry(a.width, L).rotateX(-Math.PI / 2), asphaltMat({ map: makeRunwayTexture(a) }));
  runway.position.y = 0.1;
  runway.receiveShadow = true;
  g.add(runway);

  // luci (emissive: il bloom le fa brillare)
  const lampMat = new THREE.MeshStandardMaterial({ color: 0xffeeb0, emissive: 0xffe9a0, emissiveIntensity: 3 });
  const n = Math.floor(L / 60) + 1;
  const lights = new THREE.InstancedMesh(new THREE.SphereGeometry(0.3, 8, 6), lampMat, n * 2);
  const m4 = new THREE.Matrix4();
  let li = 0;
  for (let i = 0; i < n; i++) for (const x of [-a.width / 2 - 1.5, a.width / 2 + 1.5]) { m4.setPosition(x, 0.3, -L / 2 + i * 60); lights.setMatrixAt(li++, m4); }
  g.add(lights);
  for (const [z, col] of [[L / 2 + 3, 0x30ff60], [-L / 2 - 3, 0xff3030]]) {
    const mat = new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 3 });
    const th = new THREE.InstancedMesh(new THREE.SphereGeometry(0.35, 8, 6), mat, 9);
    for (let i = -4; i <= 4; i++) { m4.setPosition(i * (a.width / 8), 0.3, z); th.setMatrixAt(i + 4, m4); }
    g.add(th);
  }
  // PAPI (2 bianchi + 2 rossi) a sinistra della pista, vicino alla testata
  for (let i = 0; i < 4; i++) {
    const col = i < 2 ? 0xff3a2a : 0xfff4e0;
    const p = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.6, 1.2), new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 2.5 }));
    p.position.set(-a.width / 2 - 12 - i * 9, 0.4, L / 2 - 300);
    g.add(p);
  }

  // piazzale, raccordo e segnaletica
  const apronMat = asphaltMat({ color: 0x5a5c61 });
  const apron = new THREE.Mesh(new THREE.PlaneGeometry(90, 120).rotateX(-Math.PI / 2), apronMat);
  apron.position.set(68, 0.06, L * 0.1);
  apron.receiveShadow = true;
  g.add(apron);
  const taxi = new THREE.Mesh(new THREE.PlaneGeometry(40, 12).rotateX(-Math.PI / 2), apronMat);
  taxi.position.set(a.width / 2 + 20, 0.06, L * 0.1);
  taxi.receiveShadow = true;
  g.add(taxi);
  const yellow = new THREE.MeshStandardMaterial({ color: 0xe8c020, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8 });
  const line = new THREE.Mesh(new THREE.PlaneGeometry(40, 0.25).rotateX(-Math.PI / 2), yellow);
  line.position.set(a.width / 2 + 20, 0.12, L * 0.1);
  g.add(line);
  const line2 = new THREE.Mesh(new THREE.PlaneGeometry(0.25, 70).rotateX(-Math.PI / 2), yellow);
  line2.position.set(58, 0.12, L * 0.1 + 10);
  g.add(line2);

  // edifici
  const addMesh = (geo, mat, x, y, z, ry = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z); m.rotation.y = ry;
    m.castShadow = m.receiveShadow = true;
    g.add(m);
    return m;
  };
  // terminal
  const fz = L * 0.06;
  const termMats = [std(0xcfcbc0), std(0xcfcbc0), std(0x555a63), std(0x555a63), new THREE.MeshStandardMaterial({ map: facadeTexture(2, 9), roughness: 0.35, metalness: 0.2 }), new THREE.MeshStandardMaterial({ map: facadeTexture(2, 9), roughness: 0.35, metalness: 0.2 })];
  addMesh(new THREE.BoxGeometry(44, 9, 17), termMats, 114, 4.5, fz);
  addMesh(new THREE.BoxGeometry(48, 0.8, 21), std(0x39414d, 0.6), 114, 9.4, fz);
  addMesh(new THREE.BoxGeometry(14, 3.2, 3), std(0xc9d4e0, 0.3, 0.3), 92.5, 3.4, fz);
  // hangar ad arco
  const hw = 24, hh = 5, hl = 32;
  const hs = new THREE.Shape();
  hs.moveTo(-hw / 2, 0); hs.lineTo(hw / 2, 0); hs.lineTo(hw / 2, hh); hs.absarc(0, hh, hw / 2, 0, Math.PI, false); hs.lineTo(-hw / 2, 0);
  const hGeo = new THREE.ExtrudeGeometry(hs, { depth: hl, bevelEnabled: false });
  hGeo.translate(0, 0, -hl / 2);
  addMesh(hGeo, std(0x9aa3ad, 0.5, 0.55), 112, 0, L * 0.14);
  addMesh(new THREE.BoxGeometry(18, 7, 0.4), std(0x4a5560, 0.6, 0.3), 112, 3.5, L * 0.14 + hl / 2 + 0.1);
  // torre di controllo
  addMesh(new THREE.CylinderGeometry(2.1, 2.7, 18, 16), std(0xe6e6e2, 0.7), 98, 9, -L * 0.02);
  addMesh(new THREE.CylinderGeometry(4.2, 3.4, 3.6, 16), new THREE.MeshStandardMaterial({ color: 0x1e3040, roughness: 0.08, metalness: 0.6, envMapIntensity: 1.6 }), 98, 19.8, -L * 0.02);
  addMesh(new THREE.CylinderGeometry(4.6, 4.6, 0.5, 16), std(0xe6e6e2), 98, 21.8, -L * 0.02);
  addMesh(new THREE.CylinderGeometry(0.08, 0.08, 6, 6), std(0x888888, 0.4, 0.8), 98, 25, -L * 0.02);
  const redLamp = addMesh(new THREE.SphereGeometry(0.3, 8, 6), new THREE.MeshStandardMaterial({ color: 0xff2010, emissive: 0xff2010, emissiveIntensity: 4 }), 98, 28.2, -L * 0.02);
  redLamp.castShadow = false;
  // serbatoi
  for (const dz of [-8, 8]) addMesh(new THREE.CylinderGeometry(3, 3, 7, 18), std(0xd6d4cb, 0.65, 0.1), 92, 3.5, L * 0.28 + dz);
  // lampioni
  for (let i = 0; i < 4; i++) {
    const x = 36 + i * 22;
    addMesh(new THREE.CylinderGeometry(0.1, 0.12, 9, 6), std(0x777b82, 0.5, 0.7), x, 4.5, L * 0.1 + 38);
    const lamp = addMesh(new THREE.BoxGeometry(1.2, 0.2, 0.5), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff2cc, emissiveIntensity: 2 }), x, 9.1, L * 0.1 + 38);
    lamp.castShadow = false;
  }
  // manica a vento
  addMesh(new THREE.CylinderGeometry(0.1, 0.12, 7, 6), std(0xdddddd, 0.5, 0.5), -40, 3.5, -L * 0.2);
  const sock = addMesh(new THREE.ConeGeometry(0.7, 3.5, 12, 1, true), new THREE.MeshStandardMaterial({ color: 0xff7a2a, roughness: 0.8, side: THREE.DoubleSide }), -38.5, 7, -L * 0.2);
  sock.rotation.z = -Math.PI / 2 - 0.2;

  // aerei parcheggiati
  const parkYaw = [0.25, -0.3, 0.1];
  for (let i = 0; i < 3; i++) {
    const p = createCessna();
    p.group.position.set(48 + i * 16, 1.25, L * 0.1 - 22 + (i % 2) * 8);
    p.group.rotation.y = Math.PI * (0.5 + parkYaw[i] * 0.2) + Math.PI;
    p.group.rotation.y = parkYaw[i] + Math.PI * 0.5;
    g.add(p.group);
    p.animate({ pitch: 0, roll: 0, rudder: 0, flapDeg: 0, time: 0, rpmNorm: 0 });
  }

  // faro visibile da lontano
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(2.2, 3.5, 420, 14, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffb030, transparent: true, opacity: 0.08, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false })
  );
  beam.position.set(98, 210, -L * 0.02);
  g.add(beam);
}

// ================================================================== alberi
function colorize(geo, fn) {
  const p = geo.attributes.position, c = [];
  for (let i = 0; i < p.count; i++) { const [r, gr, b] = fn(p.getX(i), p.getY(i), p.getZ(i)); c.push(r, gr, b); }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
  return geo;
}
function jitter(geo, amt, seed) {
  const p = geo.attributes.position, r = mulberry32(seed);
  const map = new Map();
  for (let i = 0; i < p.count; i++) {
    const key = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
    if (!map.has(key)) map.set(key, [(r() - 0.5) * amt, (r() - 0.5) * amt, (r() - 0.5) * amt]);
    const d = map.get(key);
    p.setXYZ(i, p.getX(i) + d[0], p.getY(i) + d[1], p.getZ(i) + d[2]);
  }
  geo.computeVertexNormals();
  return geo;
}
function makeTreeGeometries() {
  const bark = () => [0.32, 0.2, 0.12];
  // conifera: tronco + 4 coni sovrapposti
  const trunk = colorize(new THREE.CylinderGeometry(0.22, 0.34, 2.6, 6).translate(0, 1.3, 0), bark);
  const tiers = [[2.3, 4.6, 4.0], [1.9, 4.0, 6.2], [1.45, 3.4, 8.2], [0.95, 2.8, 10.0]].map(([r, h, y], i) =>
    colorize(jitter(new THREE.ConeGeometry(r, h, 9, 1).translate(0, y, 0), 0.18, 11 + i), (x, yy) => { const k = 0.55 + 0.45 * Math.min(1, Math.max(0, (yy - 2) / 10)); return [0.55 * k, 0.9 * k, 0.5 * k]; }));
  const flat = (list) => mergeGeometries(list.map((g) => (g.index ? g.toNonIndexed() : g)));
  const conifer = flat([trunk, ...tiers]);
  // latifoglia: tronco + chioma a sfere deformate
  const trunk2 = colorize(new THREE.CylinderGeometry(0.28, 0.5, 3.4, 7).translate(0, 1.7, 0), bark);
  const blobs = [[0, 6.3, 0, 3.0], [1.9, 5.2, 0.8, 2.2], [-1.7, 5.5, -0.9, 2.4], [0.3, 8.0, 0.4, 2.1], [-0.4, 5.0, 1.8, 2.0]].map(([x, y, z, r], i) =>
    colorize(jitter(new THREE.IcosahedronGeometry(r, 1).translate(x, y, z), 0.7, 31 + i), (xx, yy) => { const k = 0.6 + 0.4 * Math.min(1, Math.max(0, (yy - 3) / 6)); return [0.7 * k, 0.95 * k, 0.55 * k]; }));
  const broad = flat([trunk2, ...blobs]);
  const shrub = colorize(jitter(new THREE.IcosahedronGeometry(1.1, 1).translate(0, 0.9, 0), 0.4, 77), (x, y) => { const k = 0.6 + 0.4 * y / 2; return [0.75 * k, 0.95 * k, 0.5 * k]; });
  return { conifer, broad, shrub };
}

// ================================================================== mondo
const CHUNK = 1600, HALF = 12800, NCH = (HALF * 2) / CHUNK;

export function createWorld(scene, renderer) {
  scene.fog = new THREE.FogExp2(HORIZON_COL.clone(), 0.000078);
  scene.background = HORIZON_COL.clone();
  scene.environment = createEnvironment(renderer);
  scene.environmentIntensity = 0.6;

  const sky = createSky();
  scene.add(sky);

  scene.add(new THREE.HemisphereLight(0xcfe3ff, 0x939d82, 0.5));
  const sun = new THREE.DirectionalLight(0xfff0dc, 2.7);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  const sc = sun.shadow.camera;
  sc.left = -75; sc.right = 75; sc.top = 75; sc.bottom = -75; sc.near = 1; sc.far = 520;
  sun.shadow.bias = -0.00025;
  sun.shadow.normalBias = 0.035;
  scene.add(sun, sun.target);

  // ---- terreno a chunk con LOD ----
  const terrainMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96, metalness: 0 });
  terrainMat.defines = { TQ: 2 };
  terrainMat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vWPos;
        float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
        float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
          return mix(mix(h21(i), h21(i+vec2(1,0)), f.x), mix(h21(i+vec2(0,1)), h21(i+vec2(1,1)), f.x), f.y); }
        float fbm2(vec2 p){ return 0.5*n2(p) + 0.25*n2(p*2.03+7.1) + 0.125*n2(p*4.1+3.3) + 0.0625*n2(p*8.3+1.7); }
        float fbm2L(vec2 p){ return 0.67*n2(p) + 0.33*n2(p*2.03+7.1); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          float dist = length(vWPos - cameraPosition);
          float nearF = 1.0 - smoothstep(120.0, 1500.0, dist);
          vec2 p = vWPos.xz;
          #if TQ >= 2
          float large = fbm2(p * 0.0035);
          float mid = n2(p * 0.09), fine = n2(p * 0.9), micro = n2(p * 5.0);
          float detail = (large - 0.5) * 0.34 + (mid - 0.5) * 0.42 * nearF + (fine - 0.5) * 0.34 * nearF + (micro - 0.5) * 0.26 * nearF;
          #elif TQ == 1
          float large = fbm2L(p * 0.0035);
          float mid = n2(p * 0.09), fine = n2(p * 0.9);
          float detail = (large - 0.5) * 0.34 + (mid - 0.5) * 0.42 * nearF + (fine - 0.5) * 0.34 * nearF;
          #else
          float large = fbm2L(p * 0.0035);
          float mid = n2(p * 0.09), fine = mid;
          float detail = (large - 0.5) * 0.34 + (mid - 0.5) * 0.5 * nearF;
          #endif
          diffuseColor.rgb *= 1.0 + detail;
          #if TQ >= 1
          float fmask = smoothstep(0.52, 0.6, fbm2L(p * 0.00045 + 11.0));
          if (fmask > 0.0 && vWPos.y < 130.0) {
            vec2 cell = floor(p / 190.0 + 0.6 * vec2(n2(p * 0.002), n2(p * 0.002 + 4.0)));
            float hh = h21(cell);
            vec3 crop = mix(vec3(0.62, 0.55, 0.2), vec3(0.2, 0.42, 0.1), step(0.45, hh));
            crop = mix(crop, vec3(0.4, 0.28, 0.16), step(0.85, hh));
            float ang = hh * 6.2831; vec2 dir = vec2(cos(ang), sin(ang));
            float rows = 0.5 + 0.5 * sin(dot(p, dir) * 2.4);
            crop *= 0.86 + 0.14 * mix(1.0, rows, nearF);
            diffuseColor.rgb = mix(diffuseColor.rgb, crop * (1.0 + detail * 0.6), fmask * 0.85 * step(0.28, hh));
          }
          #endif
          vec3 gn = normalize(cross(dFdx(vWPos), dFdy(vWPos)));
          float slope = 1.0 - abs(gn.y);
          float rock = smoothstep(0.2, 0.4, slope + (fine - 0.5) * 0.15);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.2, 0.17, 0.14) * (0.85 + detail), rock);
        }`);
  };

  const grass = new THREE.Color(0x3f7a2c), dry = new THREE.Color(0x7d8a3c), forestC = new THREE.Color(0x1f4a1d);
  const rockC = new THREE.Color(0x6e655a), snow = new THREE.Color(0xeef1f5);
  const tmp = new THREE.Color();
  function groundColor(x, z, h, forest) {
    const n = 0.5 + 0.5 * Math.sin(x * 0.013) * Math.sin(z * 0.011);
    tmp.copy(grass).lerp(dry, n * 0.55);
    tmp.lerp(forestC, forest * 0.55);
    tmp.lerp(rockC, smoothstep(95, 150, h));
    tmp.lerp(snow, smoothstep(178, 208, h));
    return tmp;
  }

  function buildChunkGeometry(cx, cz, seg) {
    const x0 = -HALF + cx * CHUNK, z0 = -HALF + cz * CHUNK, cell = CHUNK / seg, n = seg + 1;
    const pos = [], nor = [], col = [], idx = [];
    const e = Math.max(cell, 8);
    const pushVertex = (x, z, drop) => {
      const h = terrainHeight(x, z);
      const nx = terrainHeight(x - e, z) - terrainHeight(x + e, z), nz = terrainHeight(x, z - e) - terrainHeight(x, z + e), ny = 2 * e;
      const l = Math.hypot(nx, ny, nz);
      pos.push(x, h - drop, z); nor.push(nx / l, ny / l, nz / l);
      const c = groundColor(x, z, h, forestDensity(x, z));
      col.push(c.r, c.g, c.b);
    };
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) pushVertex(x0 + i * cell, z0 + j * cell, 0);
    for (let j = 0; j < seg; j++) for (let i = 0; i < seg; i++) {
      const a = j * n + i, b = a + 1, c = a + n, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    // gonne per nascondere le fessure tra livelli di dettaglio
    const base = pos.length / 3;
    const edge = [];
    for (let i = 0; i < n; i++) edge.push([i, 0]);          // z0
    for (let j = 1; j < n; j++) edge.push([seg, j]);        // x1
    for (let i = seg - 1; i >= 0; i--) edge.push([i, seg]); // z1
    for (let j = seg - 1; j > 0; j--) edge.push([0, j]);    // x0
    edge.forEach(([i, j]) => pushVertex(x0 + i * cell, z0 + j * cell, 70));
    const m = edge.length;
    for (let k = 0; k < m; k++) {
      const [i0, j0] = edge[k], [i1, j1] = edge[(k + 1) % m];
      const a = j0 * n + i0, b = j1 * n + i1, c = base + k, d = base + ((k + 1) % m);
      idx.push(a, b, c, b, d, c, a, c, b, b, c, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeBoundingSphere();
    return g;
  }

  // ---- alberi per chunk ----
  const treeGeos = makeTreeGeometries();
  const treeMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 });
  const tc = new THREE.Color();
  function buildTrees(cx, cz) {
    const x0 = -HALF + cx * CHUNK, z0 = -HALF + cz * CHUNK;
    const rnd = mulberry32(cx * 977 + cz * 131 + 5);
    const lists = { conifer: [], broad: [], shrub: [] };
    for (let i = 0; i < 620; i++) {
      const x = x0 + rnd() * CHUNK, z = z0 + rnd() * CHUNK;
      const f = forestDensity(x, z);
      if (rnd() > 0.05 + f * 0.95) continue;
      if (airportDist(x, z) < 270) continue;
      const h = terrainHeight(x, z);
      if (h > 165) continue;
      const roll = rnd();
      const species = h > 70 || (f > 0.5 && roll < 0.55) ? 'conifer' : roll < 0.9 ? 'broad' : 'shrub';
      lists[species].push([x, h, z, rnd]);
    }
    const out = [];
    for (const [name, list] of Object.entries(lists)) {
      if (!list.length) continue;
      const mesh = new THREE.InstancedMesh(treeGeos[name], treeMat, list.length);
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
      list.forEach(([x, h, z], k) => {
        const sc2 = (name === 'shrub' ? 0.8 : 0.75) + rnd() * 0.75;
        q.setFromAxisAngle(up, rnd() * 6.283);
        s.set(sc2 * (0.9 + rnd() * 0.25), sc2 * (0.85 + rnd() * 0.4), sc2 * (0.9 + rnd() * 0.25));
        m.compose(p.set(x, h - 0.3, z), q, s);
        mesh.setMatrixAt(k, m);
        const hue = name === 'conifer' ? 0.3 + rnd() * 0.05 : 0.18 + rnd() * 0.12;
        tc.setHSL(hue, 0.45 + rnd() * 0.25, 0.4 + rnd() * 0.18);
        mesh.setColorAt(k, tc);
      });
      mesh.castShadow = quality.level >= 1; mesh.receiveShadow = true;
      mesh.computeBoundingSphere();
      out.push(mesh);
    }
    return out;
  }

  const chunks = [];
  const terrainGroup = new THREE.Group();
  scene.add(terrainGroup);
  for (let cz = 0; cz < NCH; cz++) for (let cx = 0; cx < NCH; cx++) {
    const mesh = new THREE.Mesh(new THREE.BufferGeometry(), terrainMat);
    mesh.receiveShadow = true;
    mesh.visible = false;
    terrainGroup.add(mesh);
    chunks.push({
      cx, cz, mesh, geos: [null, null, null], lod: -1, trees: null,
      x: -HALF + (cx + 0.5) * CHUNK, z: -HALF + (cz + 0.5) * CHUNK,
    });
  }
  const LOD_SEG = [64, 32, 16];
  const quality = { level: 2, treeR: 5500, lod0: 2600, lod1: 6500 };

  function updateChunks(cam, force) {
    for (const ch of chunks) {
      const d = Math.hypot(ch.x - cam.x, ch.z - cam.z);
      const lod = d < quality.lod0 ? 0 : d < quality.lod1 ? 1 : 2;
      if (lod !== ch.lod || force) {
        if (!ch.geos[lod]) ch.geos[lod] = buildChunkGeometry(ch.cx, ch.cz, LOD_SEG[lod]);
        ch.mesh.geometry = ch.geos[lod];
        ch.mesh.visible = true;
        ch.lod = lod;
      }
      const wantTrees = d < quality.treeR;
      if (wantTrees && !ch.trees) {
        ch.trees = buildTrees(ch.cx, ch.cz);
        ch.trees.forEach((t) => terrainGroup.add(t));
      }
      if (ch.trees) ch.trees.forEach((t) => { t.visible = wantTrees; });
    }
  }

  // mare oltre il bordo del mondo
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(90000, 90000).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x23506b, roughness: 0.1, metalness: 0, envMapIntensity: 1.4 }));
  sea.position.y = -5;
  scene.add(sea);

  for (const a of AIRPORTS) buildAirport(scene, a);

  // ---- aggiornamento ----
  const right = new THREE.Vector3(), upv = new THREE.Vector3(), snapped = new THREE.Vector3();
  let acc = 1, started = false;
  function snapToTexel(target) {
    right.crossVectors(new THREE.Vector3(0, 1, 0), SUN_DIR).normalize();
    upv.crossVectors(SUN_DIR, right).normalize();
    const texel = 150 / sun.shadow.mapSize.x;
    const a = Math.round(target.dot(right) / texel) * texel, b = Math.round(target.dot(upv) / texel) * texel;
    return snapped.copy(right).multiplyScalar(a).addScaledVector(upv, b).addScaledVector(SUN_DIR, target.dot(SUN_DIR));
  }

  return {
    update(target, camera, dt, time) {
      sky.position.copy(camera.position);
      sky.material.uniforms.time.value = time;
      sea.position.x = camera.position.x; sea.position.z = camera.position.z;
      acc += dt;
      if (acc > 0.3 || !started) { updateChunks(camera.position, false); acc = 0; started = true; }
      const t = snapToTexel(target);
      sun.target.position.copy(t);
      sun.position.copy(t).addScaledVector(SUN_DIR, 260);
      sun.target.updateMatrixWorld();
    },
    warmup(camera) { updateChunks(camera.position, true); },
    setQuality(level) {
      quality.level = level;
      const sets = [
        { size: 1024, treeR: 2800, lod0: 1800, lod1: 4500 },
        { size: 2048, treeR: 4200, lod0: 2200, lod1: 5500 },
        { size: 4096, treeR: 5500, lod0: 2600, lod1: 6500 },
      ][level];
      Object.assign(quality, sets);
      terrainMat.defines.TQ = level;
      terrainMat.needsUpdate = true;
      for (const ch of chunks) if (ch.trees) ch.trees.forEach((t) => { t.castShadow = level >= 1; });
      if (sun.shadow.mapSize.x !== sets.size) {
        sun.shadow.mapSize.set(sets.size, sets.size);
        sun.shadow.map?.dispose(); sun.shadow.map = null;
      }
    },
  };
}
