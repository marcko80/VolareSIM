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
  // rilievo più minuto e irregolare: colline secondarie, dossi e valli (niente "dune" lisce)
  h += 15 * (vnoise(x * 0.0021, z * 0.0021) - 0.5) * 2;
  h += 7 * (vnoise(x * 0.0058 + 40, z * 0.0058 - 17) - 0.5) * 2;
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
  return smoothstep(0.45, 0.6, n);
}

// ================================================================== texture
const BASE = import.meta.env.BASE_URL;
const loadImage = (name) => new Promise((res, rej) => {
  const i = new Image();
  i.onload = () => res(i);
  i.onerror = () => rej(new Error('texture mancante: ' + name));
  i.src = `${BASE}textures/${name}`;
});

/** carica le texture CC0 (ambientCG) e prepara quelle derivate per gli alberi */
async function loadAssets(renderer) {
  const aniso = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  const names = ['grass', 'meadow', 'forest', 'soil', 'dirt', 'rock', 'bark', 'asphalt'];
  const imgs = await Promise.all([...names.map((n) => loadImage(n + '.jpg')), loadImage('grass_n.jpg'), loadImage('rock_n.jpg'), loadImage('leaf.jpg'), loadImage('leaf_a.jpg'), loadImage('needles_a.jpg')]);
  const by = Object.fromEntries(names.map((n, i) => [n, imgs[i]]));
  const [grassN, rockN, leaf, leafA, needlesA] = imgs.slice(names.length);
  const tex = (img, srgb = true) => {
    const t = new THREE.Texture(img);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = aniso;
    t.generateMipmaps = true;
    t.needsUpdate = true;
    return t;
  };
  const T = Object.fromEntries(names.map((n) => [n, tex(by[n])]));
  // colore medio (lineare) di ogni texture: da lontano si usa questo invece di campionare
  T.avg = {};
  for (const n of names) {
    const c = document.createElement('canvas');
    c.width = c.height = 1;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(by[n], 0, 0, 1, 1);
    const d = g.getImageData(0, 0, 1, 1).data;
    T.avg[n] = new THREE.Vector3(...[d[0], d[1], d[2]].map((v) => Math.pow(v / 255, 2.2)));
  }
  {
    const N = 256, data = new Uint8Array(N * N * 4);
    for (let ch = 0; ch < 4; ch++) {
      const rnd = mulberry32(1000 + ch * 77);
      const oct = [8, 16, 32, 64].map((cells) => {
        const g = new Float32Array(cells * cells);
        for (let i = 0; i < g.length; i++) g[i] = rnd();
        return { cells, g };
      });
      const wts = [0.5, 0.27, 0.15, 0.08];
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        let v = 0;
        oct.forEach(({ cells, g }, k) => {
          const fx = (x / N) * cells, fy = (y / N) * cells;
          const ix = Math.floor(fx), iy = Math.floor(fy);
          let tx = fx - ix, ty = fy - iy;
          tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
          const a = g[(iy % cells) * cells + (ix % cells)], b = g[(iy % cells) * cells + ((ix + 1) % cells)];
          const c = g[((iy + 1) % cells) * cells + (ix % cells)], d = g[((iy + 1) % cells) * cells + ((ix + 1) % cells)];
          v += wts[k] * ((a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty);
        });
        data[(y * N + x) * 4 + ch] = Math.max(0, Math.min(255, Math.round(v * 255)));
      }
    }
    const nt = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
    nt.wrapS = nt.wrapT = THREE.RepeatWrapping;
    nt.minFilter = THREE.LinearMipmapLinearFilter; nt.magFilter = THREE.LinearFilter;
    nt.generateMipmaps = true;
    nt.needsUpdate = true;
    T.noise = nt;
  }
  T.grassN = tex(grassN, false);
  T.rockN = tex(rockN, false);

  // immagine con canale alfa da due JPG (colore + opacità)
  const withAlpha = (colorImg, alphaImg, rgb) => {
    const c = document.createElement('canvas');
    c.width = alphaImg.width; c.height = alphaImg.height;
    const g = c.getContext('2d', { willReadFrequently: true });
    if (colorImg) g.drawImage(colorImg, 0, 0, c.width, c.height);
    const id = g.getImageData(0, 0, c.width, c.height);
    const a = document.createElement('canvas');
    a.width = c.width; a.height = c.height;
    const ag = a.getContext('2d', { willReadFrequently: true });
    ag.drawImage(alphaImg, 0, 0, c.width, c.height);
    const ad = ag.getImageData(0, 0, c.width, c.height).data;
    for (let i = 0; i < id.data.length; i += 4) {
      if (rgb) { id.data[i] = rgb[0]; id.data[i + 1] = rgb[1]; id.data[i + 2] = rgb[2]; }
      id.data[i + 3] = ad[i];
    }
    g.putImageData(id, 0, 0);
    return c;
  };
  // mattonella di chioma: foglie vere (Leaf001) o aghi (PineNeedles001) sparsi su una base scura
  const foliageTile = (stamp, base, count, scaleRange, seed, tints) => {
    const S = 512;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d');
    g.fillStyle = base; g.fillRect(0, 0, S, S);
    const rnd = mulberry32(seed);
    for (let n = 0; n < count; n++) {
      const x = rnd() * S, y = rnd() * S, rot = rnd() * 6.283;
      const sc = scaleRange[0] + rnd() * (scaleRange[1] - scaleRange[0]);
      const tint = tints[Math.floor(rnd() * tints.length)];
      g.filter = `brightness(${0.55 + rnd() * 0.6}) hue-rotate(${(rnd() - 0.5) * 24}deg) ${tint}`;
      for (const dx of [-S, 0, S]) for (const dy of [-S, 0, S]) {
        const px = x + dx, py = y + dy;
        if (px < -120 || px > S + 120 || py < -120 || py > S + 120) continue;
        g.save(); g.translate(px, py); g.rotate(rot); g.scale(sc, sc);
        g.drawImage(stamp, -stamp.width / 2, -stamp.height / 2);
        g.restore();
      }
    }
    g.filter = 'none';
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  };
  T.leafTile = foliageTile(withAlpha(leaf, leafA), '#14300d', 520, [0.07, 0.13], 5, ['saturate(1.1)', 'saturate(0.8)', 'sepia(0.2)']);
  T.needleTile = foliageTile(withAlpha(null, needlesA, [96, 140, 58]), '#1b3a17', 1100, [0.2, 0.4], 9, ['saturate(1.0)', 'saturate(0.7)', 'brightness(1.15)']);
  return T;
}

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
  // segni di gomma nella zona di contatto (più scuri dell'asfalto di base)
  g.fillStyle = 'rgba(8,8,10,0.55)';
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

/** asfalto reale: la texture dei segni mantiene i colori chiari, il resto prende il grano dell'asfalto */
function asphaltMaterial(assets, { map = null, rw, rl, color = 0xffffff, tint = 1 }) {
  const m = new THREE.MeshStandardMaterial({
    map, color, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6,
  });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.tAsphalt = { value: assets.asphalt };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vAUv;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>\nvAUv = uv * vec2(${rw.toFixed(2)}, ${rl.toFixed(2)});`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vAUv;\nuniform sampler2D tAsphalt;')
      .replace('#include <map_fragment>', `#include <map_fragment>
        {
          vec3 det = texture2D(tAsphalt, vAUv).rgb * ${(1.05 * tint).toFixed(2)};
          ${map ? 'float lum = dot(diffuseColor.rgb, vec3(0.33)); float mk = smoothstep(0.12, 0.35, lum); diffuseColor.rgb = mix(det, diffuseColor.rgb, mk);' : 'diffuseColor.rgb = det * diffuseColor.rgb;'}
        }`);
  };
  return m;
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
function buildAirport(scene, a, assets) {
  const g = new THREE.Group();
  g.position.set(a.x, a.elev, a.z);
  g.rotation.y = a.th;
  scene.add(g);
  const L = a.length;
  const std = (color, rough = 0.8, metal = 0) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });

  const runway = new THREE.Mesh(
    new THREE.PlaneGeometry(a.width, L).rotateX(-Math.PI / 2),
    asphaltMaterial(assets, { map: makeRunwayTexture(a), rw: a.width / 2.2, rl: L / 2.2, tint: 0.62 }));
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
  for (let i = 0; i < 4; i++) {
    const col = i < 2 ? 0xff3a2a : 0xfff4e0;
    const p = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.6, 1.2), new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 2.5 }));
    p.position.set(-a.width / 2 - 12 - i * 9, 0.4, L / 2 - 300);
    g.add(p);
  }

  // piazzale, raccordo e segnaletica
  const apron = new THREE.Mesh(new THREE.PlaneGeometry(90, 120).rotateX(-Math.PI / 2), asphaltMaterial(assets, { rw: 40, rl: 54, tint: 0.9 }));
  apron.position.set(68, 0.06, L * 0.1);
  apron.receiveShadow = true;
  g.add(apron);
  const taxi = new THREE.Mesh(new THREE.PlaneGeometry(40, 12).rotateX(-Math.PI / 2), asphaltMaterial(assets, { rw: 18, rl: 5.4, tint: 0.9 }));
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

  const addMesh = (geo, mat, x, y, z, ry = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z); m.rotation.y = ry;
    m.castShadow = m.receiveShadow = true;
    g.add(m);
    return m;
  };
  const fz = L * 0.06;
  const termMats = [std(0xcfcbc0), std(0xcfcbc0), std(0x555a63), std(0x555a63), new THREE.MeshStandardMaterial({ map: facadeTexture(2, 9), roughness: 0.35, metalness: 0.2 }), new THREE.MeshStandardMaterial({ map: facadeTexture(2, 9), roughness: 0.35, metalness: 0.2 })];
  addMesh(new THREE.BoxGeometry(44, 9, 17), termMats, 114, 4.5, fz);
  addMesh(new THREE.BoxGeometry(48, 0.8, 21), std(0x39414d, 0.6), 114, 9.4, fz);
  addMesh(new THREE.BoxGeometry(14, 3.2, 3), std(0xc9d4e0, 0.3, 0.3), 92.5, 3.4, fz);
  const hw = 24, hh = 5, hl = 32;
  const hs = new THREE.Shape();
  hs.moveTo(-hw / 2, 0); hs.lineTo(hw / 2, 0); hs.lineTo(hw / 2, hh); hs.absarc(0, hh, hw / 2, 0, Math.PI, false); hs.lineTo(-hw / 2, 0);
  const hGeo = new THREE.ExtrudeGeometry(hs, { depth: hl, bevelEnabled: false });
  hGeo.translate(0, 0, -hl / 2);
  addMesh(hGeo, std(0x9aa3ad, 0.5, 0.55), 112, 0, L * 0.14);
  addMesh(new THREE.BoxGeometry(18, 7, 0.4), std(0x4a5560, 0.6, 0.3), 112, 3.5, L * 0.14 + hl / 2 + 0.1);
  addMesh(new THREE.CylinderGeometry(2.1, 2.7, 18, 16), std(0xe6e6e2, 0.7), 98, 9, -L * 0.02);
  addMesh(new THREE.CylinderGeometry(4.2, 3.4, 3.6, 16), new THREE.MeshStandardMaterial({ color: 0x1e3040, roughness: 0.08, metalness: 0.6, envMapIntensity: 1.6 }), 98, 19.8, -L * 0.02);
  addMesh(new THREE.CylinderGeometry(4.6, 4.6, 0.5, 16), std(0xe6e6e2), 98, 21.8, -L * 0.02);
  addMesh(new THREE.CylinderGeometry(0.08, 0.08, 6, 6), std(0x888888, 0.4, 0.8), 98, 25, -L * 0.02);
  const redLamp = addMesh(new THREE.SphereGeometry(0.3, 8, 6), new THREE.MeshStandardMaterial({ color: 0xff2010, emissive: 0xff2010, emissiveIntensity: 4 }), 98, 28.2, -L * 0.02);
  redLamp.castShadow = false;
  for (const dz of [-8, 8]) addMesh(new THREE.CylinderGeometry(3, 3, 7, 18), std(0xd6d4cb, 0.65, 0.1), 92, 3.5, L * 0.28 + dz);
  for (let i = 0; i < 4; i++) {
    const x = 36 + i * 22;
    addMesh(new THREE.CylinderGeometry(0.1, 0.12, 9, 6), std(0x777b82, 0.5, 0.7), x, 4.5, L * 0.1 + 38);
    const lamp = addMesh(new THREE.BoxGeometry(1.2, 0.2, 0.5), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff2cc, emissiveIntensity: 2 }), x, 9.1, L * 0.1 + 38);
    lamp.castShadow = false;
  }
  addMesh(new THREE.CylinderGeometry(0.1, 0.12, 7, 6), std(0xdddddd, 0.5, 0.5), -40, 3.5, -L * 0.2);
  const sock = addMesh(new THREE.ConeGeometry(0.7, 3.5, 12, 1, true), new THREE.MeshStandardMaterial({ color: 0xff7a2a, roughness: 0.8, side: THREE.DoubleSide }), -38.5, 7, -L * 0.2);
  sock.rotation.z = -Math.PI / 2 - 0.2;

  const parkYaw = [0.25, -0.3, 0.1];
  for (let i = 0; i < 3; i++) {
    const p = createCessna();
    p.group.position.set(48 + i * 16, 1.25, L * 0.1 - 22 + (i % 2) * 8);
    p.group.rotation.y = parkYaw[i] + Math.PI * 0.5;
    g.add(p.group);
    p.animate({ pitch: 0, roll: 0, rudder: 0, flapDeg: 0, time: 0, rpmNorm: 0 });
  }

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
function scaleUV(geo, su, sv) {
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
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
const flat = (list) => mergeGeometries(list.map((g) => (g.index ? g.toNonIndexed() : g)));

/** tronco e chioma separati: ogni parte ha la sua texture (corteccia, foglie, aghi) */
function makeTreeGeometries() {
  const white = () => [1, 1, 1];
  const trunkC = scaleUV(colorize(new THREE.CylinderGeometry(0.22, 0.36, 3.4, 8).translate(0, 1.7, 0), white), 1, 1.2);
  const tiers = [[2.5, 4.8, 4.2], [2.05, 4.2, 6.5], [1.6, 3.6, 8.6], [1.05, 3.0, 10.5]].map(([r, h, y], i) =>
    scaleUV(colorize(jitter(new THREE.ConeGeometry(r, h, 11, 2).translate(0, y, 0), 0.22, 11 + i), (x, yy) => { const k = 0.7 + 0.3 * Math.min(1, Math.max(0, (yy - 2) / 10)); return [k, k, k]; }), 3.4, 1.6));
  const trunkB = scaleUV(colorize(new THREE.CylinderGeometry(0.3, 0.52, 3.6, 8).translate(0, 1.8, 0), white), 1, 1.2);
  const blobs = [[0, 6.4, 0, 3.1], [2.0, 5.3, 0.8, 2.3], [-1.8, 5.6, -0.9, 2.5], [0.3, 8.2, 0.4, 2.2], [-0.4, 5.1, 1.9, 2.1], [1.2, 7.2, -1.4, 1.9]].map(([x, y, z, r], i) =>
    scaleUV(colorize(jitter(new THREE.IcosahedronGeometry(r, 2).translate(x, y, z), 0.9, 31 + i), (xx, yy) => { const k = 0.62 + 0.38 * Math.min(1, Math.max(0, (yy - 3) / 6)); return [k, k, k]; }), 5, 2.6));
  const shrub = scaleUV(colorize(jitter(new THREE.IcosahedronGeometry(1.15, 2).translate(0, 0.95, 0), 0.5, 77), (x, y) => { const k = 0.6 + 0.4 * y / 2; return [k, k, k]; }), 3, 1.6);
  return { conTrunk: trunkC, conFoliage: flat(tiers), broadTrunk: trunkB, broadFoliage: flat(blobs), shrubFoliage: shrub };
}

// ================================================================== mondo
const CHUNK = 1600, HALF = 12800, NCH = (HALF * 2) / CHUNK;

export async function createWorld(scene, renderer) {
  scene.fog = new THREE.FogExp2(HORIZON_COL.clone(), 0.000085);
  scene.background = HORIZON_COL.clone();
  scene.environment = createEnvironment(renderer);
  scene.environmentIntensity = 0.6;

  const assets = await loadAssets(renderer);

  const sky = createSky();
  scene.add(sky);

  scene.add(new THREE.HemisphereLight(0xcfe3ff, 0x939d82, 0.5));
  const sun = new THREE.DirectionalLight(0xfff4e8, 2.7);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  const sc = sun.shadow.camera;
  sc.left = -75; sc.right = 75; sc.top = 75; sc.bottom = -75; sc.near = 1; sc.far = 520;
  sun.shadow.bias = -0.00025;
  sun.shadow.normalBias = 0.035;
  scene.add(sun, sun.target);

  // ---- terreno: texture reali (ambientCG, CC0) miscelate con rumore morbido, niente campi a quadretti ----
  const terrainMat = new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0 });
  terrainMat.defines = { TQ: 2 };
  terrainMat.onBeforeCompile = (shader) => {
    for (const k of ['grass', 'meadow', 'forest', 'soil', 'dirt', 'rock']) shader.uniforms['t_' + k] = { value: assets[k] };
    for (const k of ['grass', 'meadow', 'forest', 'soil', 'dirt', 'rock']) shader.uniforms['a_' + k] = { value: assets.avg[k] };
    shader.uniforms.tNoise = { value: assets.noise };
    shader.uniforms.n_grass = { value: assets.grassN };
    shader.uniforms.n_rock = { value: assets.rockN };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aForest;\nvarying float vForest;\nvarying vec3 vWPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvForest = aForest;\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying float vForest;
        varying vec3 vWPos;
        uniform sampler2D t_grass, t_meadow, t_forest, t_soil, t_dirt, t_rock, n_grass, n_rock;
        uniform vec3 a_grass, a_meadow, a_forest, a_soil, a_dirt, a_rock;
        uniform sampler2D tNoise;
        float gRock, gNear, gFar;
        float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
        float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
          return mix(mix(h21(i), h21(i+vec2(1,0)), f.x), mix(h21(i+vec2(0,1)), h21(i+vec2(1,1)), f.x), f.y); }
        float fbm3(vec2 p){ return 0.57*n2(p) + 0.29*n2(p*2.03+7.1) + 0.14*n2(p*4.1+3.3); }
        // due scale con rotazione: spezza la ripetizione della texture
        #if TQ >= 1
        vec3 TX(sampler2D t, vec2 p, float s, vec3 avg){
          if (gFar > 0.999) return avg;                   // lontano: niente ripetizione visibile e zero campionamenti
          vec3 a = texture2D(t, p / s).rgb;
          vec3 b = texture2D(t, (mat2(0.8, -0.6, 0.6, 0.8) * p) / (s * 4.3) + 0.37).rgb;
          return mix(mix(a, b, 0.4), avg, gFar);
        }
        #else
        vec3 TX(sampler2D t, vec2 p, float s, vec3 avg){ if (gFar > 0.999) return avg; return mix(texture2D(t, p / s).rgb, avg, gFar); }
        #endif`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          vec2 p = vWPos.xz;
          float dist = length(vWPos - cameraPosition);
          gNear = 1.0 - smoothstep(60.0, 900.0, dist);
          gFar = smoothstep(140.0, 650.0, dist);
          float forest = clamp(vForest, 0.0, 1.0);
          float zoneA = texture2D(tNoise, p * 0.0011).r;                       // zone vaste (~900 m)
          float zoneB = texture2D(tNoise, p * 0.0042 + vec2(0.37, 0.11)).g;    // macchie medie (~250 m)
          float nFine = texture2D(tNoise, p * 0.05).r;
          // zone coltivate: grandi aree dai bordi morbidi e irregolari
          float farm = smoothstep(0.5, 0.7, texture2D(tNoise, p * 0.00048 + vec2(0.2, 0.6)).b) * (1.0 - forest) * (1.0 - smoothstep(110.0, 160.0, vWPos.y));
          float soilW = farm * smoothstep(0.38, 0.72, zoneB + (nFine - 0.5) * 0.25);
          float dirtW = farm * (1.0 - soilW) * smoothstep(0.55, 0.85, texture2D(tNoise, p * 0.0028 + vec2(0.7, 0.3)).a);
          float meadowW = smoothstep(0.28, 0.58, zoneA) * (1.0 - farm) * (1.0 - forest);
          vec3 col = TX(t_grass, p, 5.2, a_grass) * vec3(0.66, 0.92, 0.64);
          if (meadowW > 0.01) col = mix(col, TX(t_meadow, p, 6.4, a_meadow) * vec3(0.8, 1.05, 0.82), meadowW * 0.9);
          #if TQ >= 1
          if (soilW > 0.01) col = mix(col, TX(t_soil, p, 4.4, a_soil) * 0.85, soilW * 0.85);
          if (dirtW > 0.01) col = mix(col, TX(t_dirt, p, 5.0, a_dirt) * 0.8, dirtW * 0.7);
          #endif
          if (forest > 0.01) col = mix(col, TX(t_forest, p, 4.8, a_forest) * 1.15, forest * 0.92);
          // roccia sulle pendenze e in quota; neve sulle cime
          // pendenza dalla normale interpolata (liscia): niente motivo a triangoli
          vec3 wn = normalize(vNormal * mat3(viewMatrix));
          float slope = 1.0 - clamp(wn.y, 0.0, 1.0);
          gRock = clamp(smoothstep(0.2, 0.4, slope + (nFine - 0.5) * 0.18) + smoothstep(105.0, 160.0, vWPos.y) * 0.55, 0.0, 1.0);
          if (gRock > 0.01) col = mix(col, TX(t_rock, p, 7.5, a_rock) * 1.1, gRock);
          col = mix(col, vec3(0.78, 0.8, 0.84), smoothstep(178.0, 208.0, vWPos.y) * (1.0 - smoothstep(0.3, 0.5, slope)));
          // variazione di tono a grande scala: rompe l'effetto "tappeto"
          col *= 0.78 + 0.34 * zoneA + (zoneB - 0.5) * 0.16;
          diffuseColor.rgb = col;
        }`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        #if TQ >= 1
        if (length(vWPos - cameraPosition) < 220.0) {
          vec2 p = vWPos.xz;
          vec3 ng = texture2D(n_grass, p / 5.2).xyz * 2.0 - 1.0;
          vec2 t = ng.xy * 0.9;
          #if TQ >= 2
          vec3 nr = texture2D(n_rock, p / 7.5).xyz * 2.0 - 1.0;
          t = mix(t, nr.xy * 1.3, gRock);
          #endif
          t *= 1.0 - smoothstep(25.0, 220.0, length(vWPos - cameraPosition));
          normal = normalize(normal + (viewMatrix * vec4(t.x, 0.0, -t.y, 0.0)).xyz * 0.55);
        }
        #endif`);
  };

  function buildChunkGeometry(cx, cz, seg) {
    const x0 = -HALF + cx * CHUNK, z0 = -HALF + cz * CHUNK, cell = CHUNK / seg, n = seg + 1;
    const pos = [], nor = [], forest = [], idx = [];
    const e = Math.max(cell, 8);
    const pushVertex = (x, z, drop) => {
      const h = terrainHeight(x, z);
      const nx = terrainHeight(x - e, z) - terrainHeight(x + e, z), nz = terrainHeight(x, z - e) - terrainHeight(x, z + e), ny = 2 * e;
      const l = Math.hypot(nx, ny, nz);
      pos.push(x, h - drop, z); nor.push(nx / l, ny / l, nz / l);
      forest.push(forestDensity(x, z));
    };
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) pushVertex(x0 + i * cell, z0 + j * cell, 0);
    for (let j = 0; j < seg; j++) for (let i = 0; i < seg; i++) {
      const a = j * n + i, b = a + 1, c = a + n, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    const base = pos.length / 3;
    const edge = [];
    for (let i = 0; i < n; i++) edge.push([i, 0]);
    for (let j = 1; j < n; j++) edge.push([seg, j]);
    for (let i = seg - 1; i >= 0; i--) edge.push([i, seg]);
    for (let j = seg - 1; j > 0; j--) edge.push([0, j]);
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
    g.setAttribute('aForest', new THREE.Float32BufferAttribute(forest, 1));
    g.setIndex(idx);
    g.computeBoundingSphere();
    return g;
  }

  // ---- alberi per chunk ----
  const treeGeos = makeTreeGeometries();
  const mkMat = (map, rough = 0.92) => new THREE.MeshStandardMaterial({ map, vertexColors: true, roughness: rough, metalness: 0 });
  const treeMats = {
    bark: mkMat(assets.bark, 0.95),
    needles: mkMat(assets.needleTile),
    leaves: mkMat(assets.leafTile, 0.85),
  };
  const tc = new THREE.Color();
  const SPECIES = {
    conifer: [['conTrunk', 'bark'], ['conFoliage', 'needles']],
    broad: [['broadTrunk', 'bark'], ['broadFoliage', 'leaves']],
    shrub: [['shrubFoliage', 'leaves']],
  };
  function buildTrees(cx, cz) {
    const x0 = -HALF + cx * CHUNK, z0 = -HALF + cz * CHUNK;
    const rnd = mulberry32(cx * 977 + cz * 131 + 5);
    const lists = { conifer: [], broad: [], shrub: [] };
    for (let i = 0; i < 1700; i++) {
      const x = x0 + rnd() * CHUNK, z = z0 + rnd() * CHUNK;
      const f = forestDensity(x, z);
      if (rnd() > 0.1 + f * 0.9) continue;
      if (airportDist(x, z) < 270) continue;
      const h = terrainHeight(x, z);
      if (h > 165) continue;
      const roll = rnd();
      const species = h > 70 || (f > 0.5 && roll < 0.55) ? 'conifer' : roll < 0.9 ? 'broad' : 'shrub';
      lists[species].push([x, h, z]);
    }
    const out = [];
    const q = new THREE.Quaternion(), s = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    for (const [name, list] of Object.entries(lists)) {
      if (!list.length) continue;
      // matrici e tinte condivise fra tronco e chioma della stessa pianta
      const mats = list.map(([x, h, z]) => {
        const sc2 = (name === 'shrub' ? 0.9 : 1.0) + rnd() * 0.9;
        q.setFromAxisAngle(up, rnd() * 6.283);
        s.set(sc2 * (0.9 + rnd() * 0.25), sc2 * (0.85 + rnd() * 0.45), sc2 * (0.9 + rnd() * 0.25));
        return { m: new THREE.Matrix4().compose(new THREE.Vector3(x, h - 0.3, z), q.clone(), s.clone()), c: rnd(), k: rnd() };
      });
      for (const [geoName, matName] of SPECIES[name]) {
        const mesh = new THREE.InstancedMesh(treeGeos[geoName], treeMats[matName], list.length);
        mats.forEach((o, i) => {
          mesh.setMatrixAt(i, o.m);
          if (matName === 'bark') tc.setRGB(0.8 + o.k * 0.2, 0.75 + o.k * 0.2, 0.7 + o.k * 0.2);
          else if (name === 'conifer') tc.setHSL(0.27 + o.c * 0.06, 0.4 + o.k * 0.2, 1.0 + o.k * 0.2);
          else tc.setHSL(0.18 + o.c * 0.12, 0.35 + o.k * 0.25, 0.85 + o.k * 0.3);
          mesh.setColorAt(i, tc);
        });
        mesh.castShadow = false; mesh.receiveShadow = true;
        mesh.computeBoundingSphere();
        out.push(mesh);
      }
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

  // generazione a coda: ogni frame si lavora al massimo ~5 ms (niente scatti mentre si vola)
  let queue = [];
  function planChunks(cam) {
    queue = [];
    for (const ch of chunks) {
      const d = Math.hypot(ch.x - cam.x, ch.z - cam.z);
      const lod = d < quality.lod0 ? 0 : d < quality.lod1 ? 1 : 2;
      if (lod !== ch.lod) queue.push({ d: ch.lod < 0 ? d - 1e6 : d, ch, lod, kind: 'geo' });
      const wantTrees = d < quality.treeR;
      if (wantTrees && !ch.trees) queue.push({ d: d + 50, ch, kind: 'trees' });
      // le ombre degli alberi costano molto: solo in qualità Alta e solo vicino all'aereo
      if (ch.trees) ch.trees.forEach((t) => { t.visible = wantTrees; t.castShadow = quality.level >= 2 && d < 520; });
    }
    queue.sort((a, b) => a.d - b.d);
  }
  function runQueue(budgetMs) {
    const t0 = performance.now();
    while (queue.length && performance.now() - t0 < budgetMs) {
      const w = queue.shift();
      const ch = w.ch;
      if (w.kind === 'geo') {
        if (!ch.geos[w.lod]) ch.geos[w.lod] = buildChunkGeometry(ch.cx, ch.cz, LOD_SEG[w.lod]);
        ch.mesh.geometry = ch.geos[w.lod];
        ch.mesh.visible = true;
        ch.lod = w.lod;
      } else if (!ch.trees) {
        ch.trees = buildTrees(ch.cx, ch.cz);
        ch.trees.forEach((t) => terrainGroup.add(t));
      }
    }
  }

  const sea = new THREE.Mesh(new THREE.PlaneGeometry(90000, 90000).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x23506b, roughness: 0.1, metalness: 0, envMapIntensity: 1.4 }));
  sea.position.y = -5;
  scene.add(sea);

  for (const a of AIRPORTS) buildAirport(scene, a, assets);

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
      if (acc > 0.3 || !started) { planChunks(camera.position); acc = 0; started = true; }
      runQueue(5);
      const t = snapToTexel(target);
      sun.target.position.copy(t);
      sun.position.copy(t).addScaledVector(SUN_DIR, 260);
      sun.target.updateMatrixWorld();
    },
    warmup(camera) { planChunks(camera.position); runQueue(Infinity); },
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
      if (sun.shadow.mapSize.x !== sets.size) {
        sun.shadow.mapSize.set(sets.size, sets.size);
        sun.shadow.map?.dispose(); sun.shadow.map = null;
      }
    },
  };
}
