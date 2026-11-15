import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createSky, createEnvironment, SUN_DIR, HORIZON_COL } from './sky.js';
import { createCessna } from './aircraft.js';
import { DATA, loadData, sampleH, sampleClass } from './data.js';

// ================================================================== aeroporti (da OpenStreetMap)
/** riempito da createWorld(); main.js tiene il riferimento all'array */
export const AIRPORTS = [];

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
  return Math.hypot(Math.max(Math.abs(lx) - 45, 0), Math.max(Math.abs(lz) - a.length / 2 - 70, 0));
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

function defineAirport(list, id, name) {
  const rw = list.find((e) => e.t.aeroway === 'runway');
  const p = rw.p, a = p[0], b = p[p.length - 1];
  const cx = (a[0] + b[0]) / 2, cz = (a[1] + b[1]) / 2, dx = b[0] - a[0], dz = b[1] - a[1];
  const brg = ((Math.atan2(dx, -dz) * 180) / Math.PI + 360) % 360;
  const ref = (rw.t.ref || '18/36').split('/').map((s) => parseInt(s, 10));
  // testata di decollo: la prua più vicina a una delle designazioni della pista
  let best = null;
  for (const h of [brg, (brg + 180) % 360]) for (const rf of ref) {
    const diff = Math.abs((((h - rf * 10 + 540) % 360)) - 180);
    if (!best || diff < best.diff) best = { h, rf, diff };
  }
  const other = ref.find((r) => r !== best.rf) ?? (best.rf + 18) % 36;
  const th = (-best.h * Math.PI) / 180;
  return {
    id, name, x: cx, z: cz, elev: 0, heading: best.h, length: Math.hypot(dx, dz), width: parseFloat(rw.t.width) || 25,
    surface: rw.t.surface || 'asphalt', nums: [String(best.rf).padStart(2, '0'), String(other).padStart(2, '0')],
    th, c: Math.cos(th), s: Math.sin(th), osm: list,
  };
}

// ================================================================== terreno (da dati reali)
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
  // la griglia reale ha celle di ~18 m: un po' di rugosità fine aggiunge naturalezza
  let h = sampleH(x, z) + 1.3 * (vnoise(x * 0.012, z * 0.012) - 0.5) * 2;
  for (const a of AIRPORTS) {
    const w = smoothstep(90, 480, flatDist(a, x, z));
    if (w < 1) h = a.elev + (h - a.elev) * w;
  }
  return h;
}

/** densità di bosco 0..1 dalle classi di copertura, con radure naturali */
export function forestDensity(x, z) {
  const c = sampleClass(x, z);
  const n = vnoise(x * 0.008, z * 0.008) * 0.6 + vnoise(x * 0.03 + 5, z * 0.03) * 0.4;
  return Math.max(0, Math.min(1, c.forest * 1.25 - (1 - n) * 0.35)) * (1 - c.urban) * (1 - c.water) * (1 - Math.min(1, c.rock * 1.3));
}

// ================================================================== texture
const BASE = import.meta.env.BASE_URL;
const loadImage = (name) => new Promise((res, rej) => {
  const i = new Image();
  i.onload = () => res(i);
  i.onerror = () => rej(new Error('texture mancante: ' + name));
  i.src = `${BASE}${name}`;
});

/** carica le texture CC0 (ambientCG) e prepara quelle derivate; più immagine satellitare, classi e strade */
async function loadAssets(renderer) {
  const aniso = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  const names = ['grass', 'meadow', 'forest', 'soil', 'dirt', 'rock', 'bark', 'asphalt'];
  const imgs = await Promise.all([...names.map((n) => loadImage(`textures/${n}.jpg`)), loadImage('textures/grass_n.jpg'), loadImage('textures/rock_n.jpg'), loadImage('textures/leaf.jpg'), loadImage('textures/leaf_a.jpg'), loadImage('textures/needles_a.jpg'), loadImage('data/imagery.jpg')]);
  const by = Object.fromEntries(names.map((n, i) => [n, imgs[i]]));
  const [grassN, rockN, leaf, leafA, needlesA, imagery] = imgs.slice(names.length);
  const tex = (img, srgb = true) => {
    const t = new THREE.Texture(img);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = aniso;
    t.needsUpdate = true;
    return t;
  };
  const T = Object.fromEntries(names.map((n) => [n, tex(by[n])]));
  T.avg = {};
  for (const n of names) {
    const c = document.createElement('canvas');
    c.width = c.height = 1;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(by[n], 0, 0, 1, 1);
    const d = g.getImageData(0, 0, 1, 1).data;
    T.avg[n] = new THREE.Vector3(...[d[0], d[1], d[2]].map((v) => Math.pow(v / 255, 2.2)));
  }
  // rumore tileable a 4 canali: ricrea ciuffi e variazioni a 1–40 m che i mipmap delle texture cancellano
  {
    const N = 256, data = new Uint8Array(N * N * 4);
    for (let ch = 0; ch < 4; ch++) {
      const rnd = mulberry32(1000 + ch * 77);
      const oct = [4, 8, 16, 32].map((cells) => {
        const g = new Float32Array(cells * cells);
        for (let i = 0; i < g.length; i++) g[i] = rnd();
        return { cells, g };
      });
      const wts = [0.38, 0.3, 0.22, 0.10];
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

  // immagine satellitare Sentinel-2 (riga 0 = nord = v 0)
  T.imagery = new THREE.Texture(imagery);
  T.imagery.colorSpace = THREE.SRGBColorSpace;
  T.imagery.flipY = false;
  T.imagery.wrapS = T.imagery.wrapT = THREE.ClampToEdgeWrapping;
  T.imagery.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  T.imagery.needsUpdate = true;

  // classi di copertura (R bosco, G urbano, B roccia, A acqua)
  T.classes = new THREE.DataTexture(DATA.cls, DATA.CN, DATA.CN, THREE.RGBAFormat);
  T.classes.minFilter = T.classes.magFilter = THREE.LinearFilter;
  T.classes.wrapS = T.classes.wrapT = THREE.ClampToEdgeWrapping;
  T.classes.needsUpdate = true;

  // strade (R) e acque (G) rasterizzate da OpenStreetMap
  {
    const N = 3072, { x0, x1, z0, z1 } = DATA.ext;
    const c = document.createElement('canvas');
    c.width = c.height = N;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.fillStyle = '#000'; g.fillRect(0, 0, N, N);
    g.lineCap = 'round'; g.lineJoin = 'round';
    const px = (p) => [((p[0] - x0) / (x1 - x0)) * N, ((p[1] - z0) / (z1 - z0)) * N];
    const mpp = (x1 - x0) / N;
    const W = { motorway: 11, trunk: 9, primary: 7, secondary: 5.5, tertiary: 4 };
    const stroke = (pts, color, width) => {
      g.strokeStyle = color; g.lineWidth = Math.max(0.8, width / mpp);
      g.beginPath();
      pts.forEach((p, i) => { const [a, b] = px(p); if (i) g.lineTo(a, b); else g.moveTo(a, b); });
      g.stroke();
    };
    for (const r of DATA.osm.water) {
      if (r.k === 'lake') { g.fillStyle = '#0f0'; g.beginPath(); r.p.forEach((p, i) => { const [a, b] = px(p); if (i) g.lineTo(a, b); else g.moveTo(a, b); }); g.closePath(); g.fill(); }
      else stroke(r.p, '#0f0', 12);
    }
    for (const r of DATA.osm.roads) stroke(r.p, '#f00', W[r.k] || 6);
    const id = g.getImageData(0, 0, N, N).data;
    const rg = new Uint8Array(N * N * 2);
    for (let i = 0; i < N * N; i++) { rg[i * 2] = id[i * 4]; rg[i * 2 + 1] = id[i * 4 + 1]; }
    T.roads = new THREE.DataTexture(rg, N, N, THREE.RGFormat);
    T.roads.minFilter = THREE.LinearMipmapLinearFilter; T.roads.magFilter = THREE.LinearFilter;
    T.roads.generateMipmaps = true;
    T.roads.wrapS = T.roads.wrapT = THREE.ClampToEdgeWrapping;
    T.roads.needsUpdate = true;
  }

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
        const px2 = x + dx, py = y + dy;
        if (px2 < -120 || px2 > S + 120 || py < -120 || py > S + 120) continue;
        g.save(); g.translate(px2, py); g.rotate(rot); g.scale(sc, sc);
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
  const grass = a.surface === 'grass';
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = grass ? '#6a8240' : '#3b3c40';
  g.fillRect(0, 0, W, H);
  if (grass) {
    // pista in erba: strisce di taglio e testate segnate
    // erba tagliata: macchie morbide di tono diverso + fili sottili
    for (let i = 0; i < 520; i++) {
      const x = Math.random() * W, y = Math.random() * H, r = 18 + Math.random() * 55, dark = Math.random() > 0.5;
      const grd = g.createRadialGradient(x, y, 0, x, y, r);
      grd.addColorStop(0, dark ? 'rgba(40,64,28,0.20)' : 'rgba(150,165,80,0.16)');
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grd; g.fillRect(x - r, y - r, 2 * r, 2 * r);
    }
    for (let i = 0; i < 9000; i++) { g.fillStyle = `rgba(${60 + Math.random() * 80},${80 + Math.random() * 60},${35 + Math.random() * 25},0.16)`; g.fillRect(Math.random() * W, Math.random() * H, 1 + Math.random() * 5, 1 + Math.random() * 3); }
    g.fillStyle = '#f2f2ee';
    g.fillRect(0, mz(L / 2 - 12), W, 3 * sy); g.fillRect(0, mz(-L / 2 + 9), W, 3 * sy);
  } else {
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
  }
  g.fillStyle = grass ? '#f2f2ee' : '#ececec';
  g.font = `bold ${Math.round(9 * sx)}px Arial`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.save(); g.translate(mx(0), mz(L / 2 - (grass ? 40 : 50))); g.scale(1, sy / sx); g.fillText(a.nums[0], 0, 0); g.restore();
  g.save(); g.translate(mx(0), mz(-L / 2 + (grass ? 40 : 50))); g.rotate(Math.PI); g.scale(1, sy / sx); g.fillText(a.nums[1], 0, 0); g.restore();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 16;
  return tex;
}

/** asfalto reale: la texture dei segni mantiene i colori chiari, il resto prende il grano dell'asfalto */
function asphaltMaterial(assets, { map = null, rw, rl, color = 0xffffff, tint = 1, grass = false }) {
  const m = new THREE.MeshStandardMaterial({
    map, color, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6,
  });
  if (grass) return m;
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

// ================================================================== aeroporto reale
const CLOSED = (pts) => pts.length > 2 && Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]) < 0.5;

function buildAirport(scene, a, assets, terrainFn) {
  const g = new THREE.Group();
  g.position.set(a.x, a.elev, a.z);
  g.rotation.y = a.th;
  scene.add(g);
  const L = a.length;
  const grassStrip = a.surface === 'grass';
  const std = (color, rough = 0.8, metal = 0) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
  const loc = (p) => worldToLocal(a, p[0], p[1]);

  const runway = new THREE.Mesh(
    new THREE.PlaneGeometry(a.width, L).rotateX(-Math.PI / 2),
    asphaltMaterial(assets, { map: makeRunwayTexture(a), rw: a.width / 2.2, rl: L / 2.2, tint: 0.62, grass: grassStrip }));
  runway.position.y = 0.1;
  runway.receiveShadow = true;
  g.add(runway);

  // luci di pista (emissive: il bloom le fa brillare)
  if (!grassStrip) {
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
  } else {
    // aviosuperficie: coni bianchi alle testate
    for (const z of [L / 2 + 6, -L / 2 - 6]) for (const x of [-a.width / 2 - 2, a.width / 2 + 2]) {
      const c = new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.9, 8), std(0xff7a2a, 0.7));
      c.position.set(x, 0.45, z);
      g.add(c);
    }
  }

  // raccordi e piazzali veri (OpenStreetMap)
  const apronMat = asphaltMaterial(assets, { rw: 30, rl: 30, tint: 0.9 });
  const aprons = [];
  for (const e of a.osm) {
    if (e.t.aeroway === 'taxiway' && e.p.length > 1) {
      const wd = parseFloat(e.t.width) || 14, pts = e.p.map(loc);
      const pos = [], idx = [], uv = [];
      for (let i = 0; i < pts.length; i++) {
        const p0 = pts[Math.max(0, i - 1)], p1 = pts[Math.min(pts.length - 1, i + 1)];
        let dx = p1[0] - p0[0], dz = p1[1] - p0[1];
        const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
        pos.push(pts[i][0] - dz * wd / 2, 0.07, pts[i][1] + dx * wd / 2, pts[i][0] + dz * wd / 2, 0.07, pts[i][1] - dx * wd / 2);
        uv.push(0, i * 0.5, 1, i * 0.5);
        if (i) { const k = i * 2; idx.push(k - 2, k, k - 1, k - 1, k, k + 1); }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      if (geo.attributes.normal.getY(0) < 0) geo.setIndex(idx.map((v, i2) => idx[i2 - (i2 % 3) + [0, 2, 1][i2 % 3]]));
      geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, apronMat);
      m.receiveShadow = true;
      g.add(m);
    } else if (e.t.aeroway === 'apron' && CLOSED(e.p)) {
      const shape = new THREE.Shape(e.p.map((p) => { const [lx, lz] = loc(p); return new THREE.Vector2(lx, -lz); }));
      const geo = new THREE.ShapeGeometry(shape);
      geo.rotateX(-Math.PI / 2);
      geo.translate(0, 0.06, 0);
      const uv = geo.attributes.uv; const pp = geo.attributes.position;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, pp.getX(i) / 30, pp.getZ(i) / 30);
      const m = new THREE.Mesh(geo, apronMat);
      m.receiveShadow = true;
      g.add(m);
      aprons.push(e.p);
    }
  }

  // edifici veri: impronte estruse alla quota del terreno
  const wallGeos = [];
  const rnd = mulberry32(a.id.charCodeAt(0) * 31);
  const tints = [[0.9, 0.86, 0.78], [0.85, 0.8, 0.72], [0.92, 0.9, 0.86], [0.78, 0.72, 0.64], [0.88, 0.8, 0.7]];
  for (const e of a.osm) {
    const isAero = e.t.aeroway === 'terminal' || e.t.aeroway === 'hangar';
    if (!(isAero || e.t.building) || !CLOSED(e.p)) continue;
    let cx = 0, cz = 0;
    for (const p of e.p) { cx += p[0]; cz += p[1]; }
    cx /= e.p.length; cz /= e.p.length;
    const hGround = terrainFn(cx, cz);
    const levels = parseFloat(e.t['building:levels']);
    const h = e.t.aeroway === 'terminal' ? 11 : e.t.aeroway === 'hangar' || e.t.building === 'hangar' ? 10 : (levels ? levels * 3.1 : 5 + rnd() * 3);
    const shape = new THREE.Shape(e.p.slice(0, -1).map((p) => new THREE.Vector2(p[0], -p[1])));
    let geo;
    try { geo = new THREE.ExtrudeGeometry(shape, { depth: h + 1.5, bevelEnabled: false }); } catch { continue; }
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, hGround - 1.5, 0);
    geo.deleteAttribute('uv');
    const t = tints[Math.floor(rnd() * tints.length)];
    const k = e.t.aeroway === 'hangar' || e.t.building === 'hangar' || e.t.building === 'industrial' ? [0.62, 0.66, 0.7] : t;
    const col = [];
    for (let i = 0; i < geo.attributes.position.count; i++) col.push(k[0], k[1], k[2]);
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    wallGeos.push(geo.index ? geo.toNonIndexed() : geo);
  }
  if (wallGeos.length) {
    // coordinate già in assi mondo: la mesh va nella scena, non nel gruppo ruotato dell'aeroporto
    const merged = mergeGeometries(wallGeos, true);
    if (merged) {
      const roof = new THREE.MeshStandardMaterial({ vertexColors: true, color: 0xb24a36, roughness: 0.85 });
      const wall = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
      const bm = new THREE.Mesh(merged, [roof, wall]);
      bm.castShadow = bm.receiveShadow = true;
      scene.add(bm);
    }
  }

  // manica a vento
  const addMesh = (geo, mat, x, y, z, ry = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z); m.rotation.y = ry;
    m.castShadow = m.receiveShadow = true;
    g.add(m);
    return m;
  };
  addMesh(new THREE.CylinderGeometry(0.1, 0.12, 7, 6), std(0xdddddd, 0.5, 0.5), -40, 3.5, -L * 0.2);
  const sock = addMesh(new THREE.ConeGeometry(0.7, 3.5, 12, 1, true), new THREE.MeshStandardMaterial({ color: 0xff7a2a, roughness: 0.8, side: THREE.DoubleSide }), -38.5, 7, -L * 0.2);
  sock.rotation.z = -Math.PI / 2 - 0.2;

  // aerei parcheggiati sul piazzale più grande
  if (aprons.length) {
    let big = aprons[0], bs = 0;
    for (const p of aprons) { const xs = p.map((q) => q[0]), zs = p.map((q) => q[1]); const s = (Math.max(...xs) - Math.min(...xs)) * (Math.max(...zs) - Math.min(...zs)); if (s > bs) { bs = s; big = p; } }
    let cx = 0, cz = 0;
    for (const p of big) { cx += p[0]; cz += p[1]; }
    const [lx, lz] = loc([cx / big.length, cz / big.length]);
    const yaws = [0.25, -0.3, 0.1];
    for (let i = 0; i < 3; i++) {
      const p = createCessna();
      p.group.position.set(lx + (i - 1) * 14, 1.25, lz + (i % 2) * 7);
      p.group.rotation.y = yaws[i] + Math.PI * 0.5;
      g.add(p.group);
      p.animate({ pitch: 0, roll: 0, rudder: 0, flapDeg: 0, time: 0, rpmNorm: 0 });
    }
  }

  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(2.2, 3.5, 420, 14, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffb030, transparent: true, opacity: 0.08, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false })
  );
  beam.position.set(60, 210, -L * 0.1);
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

/** sagome (impostori) degli alberi: il modello 3D viene "fotografato" una volta in una texture */
function makeImpostors(renderer, treeGeos, treeMats) {
  const specs = {
    conifer: { parts: [['conTrunk', 'bark'], ['conFoliage', 'needles']], w: 7.2, h: 13.5 },
    broad: { parts: [['broadTrunk', 'bark'], ['broadFoliage', 'leaves']], w: 11.5, h: 12.2 },
    shrub: { parts: [['shrubFoliage', 'leaves']], w: 3.6, h: 2.8 },
  };
  const scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0xffffff, 1.6));
  const d = new THREE.DirectionalLight(0xfff4e8, 2.4);
  d.position.set(2, 4, 3);
  scene.add(d);
  const out = {};
  const prevT = renderer.getRenderTarget();
  const prevC = renderer.getClearColor(new THREE.Color()), prevA = renderer.getClearAlpha();
  for (const [name, s] of Object.entries(specs)) {
    const W = 128, H = Math.round(128 * (s.h / s.w));
    const rt = new THREE.WebGLRenderTarget(W, Math.max(64, H), { samples: 4 });
    const g = new THREE.Group();
    for (const [gn, mn] of s.parts) g.add(new THREE.Mesh(treeGeos[gn], treeMats[mn]));
    scene.add(g);
    const cam = new THREE.OrthographicCamera(-s.w / 2, s.w / 2, s.h, 0, 0.1, 50);
    cam.position.set(0, 0, 20);
    renderer.setRenderTarget(rt);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    renderer.render(scene, cam);
    scene.remove(g);
    out[name] = { map: rt.texture, w: s.w, h: s.h };
  }
  renderer.setRenderTarget(prevT);
  renderer.setClearColor(prevC, prevA);
  // due quadrati incrociati
  for (const s of Object.values(out)) {
    const a = new THREE.PlaneGeometry(s.w, s.h).translate(0, s.h / 2, 0);
    const b = new THREE.PlaneGeometry(s.w, s.h).translate(0, s.h / 2, 0).rotateY(Math.PI / 2);
    s.geo = mergeGeometries([a, b]);
    s.mat = new THREE.MeshBasicMaterial({ map: s.map, alphaTest: 0.45, side: THREE.DoubleSide, fog: true });
  }
  return out;
}

// ================================================================== mondo
const CHUNK = 1600;

export async function createWorld(scene, renderer) {
  scene.fog = new THREE.FogExp2(HORIZON_COL.clone(), 0.000085);
  scene.background = HORIZON_COL.clone();
  scene.environment = createEnvironment(renderer);
  scene.environmentIntensity = 0.6;

  await loadData();
  const ext = DATA.ext;
  // aeroporti reali: L'Aquila-Preturo (LIAP) e l'aviosuperficie di L'Aquila
  AIRPORTS.push(defineAirport(DATA.osm.liap, 'A', "L'Aquila-Preturo"), defineAirport(DATA.osm.avio, 'B', "Aviosuperficie L'Aquila"));
  for (const a of AIRPORTS) { a.elev = 0; a.elev = sampleH(a.x, a.z); }
  AIRPORTS.length && console.log('Aeroporti:', AIRPORTS.map((a) => `${a.name} ${a.heading.toFixed(0)}° ${a.length.toFixed(0)} m @ ${a.elev.toFixed(0)} m`).join(' | '));

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

  // ---- terreno: immagine Sentinel-2 + classi + strade, con dettaglio fotografico da vicino ----
  const terrainMat = new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0 });
  terrainMat.defines = { TQ: 2 };
  terrainMat.onBeforeCompile = (shader) => {
    for (const k of ['grass', 'forest', 'rock', 'asphalt']) shader.uniforms['t_' + k] = { value: assets[k] };
    for (const k of ['grass', 'forest', 'rock', 'asphalt']) shader.uniforms['a_' + k] = { value: assets.avg[k] };
    shader.uniforms.n_grass = { value: assets.grassN };
    shader.uniforms.n_rock = { value: assets.rockN };
    shader.uniforms.tNoise = { value: assets.noise };
    shader.uniforms.tImg = { value: assets.imagery };
    shader.uniforms.tCls = { value: assets.classes };
    shader.uniforms.tRoad = { value: assets.roads };
    shader.uniforms.uExt = { value: new THREE.Vector4(ext.x0, ext.z0, ext.x1 - ext.x0, ext.z1 - ext.z0) };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vWPos;
        uniform sampler2D t_grass, t_forest, t_rock, t_asphalt, n_grass, n_rock, tImg, tCls, tRoad, tNoise;
        uniform vec3 a_grass, a_forest, a_rock, a_asphalt;
        uniform vec4 uExt;
        float gRock, gNear, gFar;
        #if TQ >= 1
        vec3 TX(sampler2D t, vec2 p, float s, vec3 avg){
          vec3 a = texture2D(t, p / s).rgb;
          vec3 b = texture2D(t, (mat2(0.8, -0.6, 0.6, 0.8) * p) / (s * 4.3) + 0.37).rgb;
          return mix(mix(a, b, 0.4), avg, gFar * 0.6);
        }
        #else
        vec3 TX(sampler2D t, vec2 p, float s, vec3 avg){ return mix(texture2D(t, p / s).rgb, avg, gFar * 0.6); }
        #endif`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          vec2 p = vWPos.xz;
          vec2 uvw = (p - uExt.xy) / uExt.zw;
          float dist = length(vWPos - cameraPosition);
          gNear = 1.0 - smoothstep(60.0, 900.0, dist);
          gFar = smoothstep(140.0, 650.0, dist);
          // colore reale dal satellite (Sentinel-2 è scuro: schiarito e un po' saturato)
          vec3 im = texture2D(tImg, uvw).rgb;
          float l0 = dot(im, vec3(0.2126, 0.7152, 0.0722));
          vec3 base = mix(vec3(l0), im, 1.2);
          base *= vec3(1.08, 1.0, 0.86);                       // via il cast ciano, verdi più caldi
          base = pow(max(base, vec3(0.0)), vec3(0.72)) * 0.95;
          base = mix(base, base * base * 2.0, 0.25);          // un po' più di contrasto: via l'effetto lavato
          vec4 cl = texture2D(tCls, uvw);                // bosco, urbano, roccia, acqua
          vec2 rd = texture2D(tRoad, uvw).rg;            // strade, acque
          float forest = cl.r, urban = cl.g, rockC = cl.b, water = max(cl.a, rd.g);
          // il dettaglio fotografico modula il colore reale (rapporto rispetto alla texture media)
          // solo luminosità: il colore viene dal satellite, la texture aggiunge grana (niente rumore cromatico)
          const vec3 LW = vec3(0.2126, 0.7152, 0.0722);
          float detail = dot(TX(t_grass, p, 5.2, a_grass), LW) / max(dot(a_grass, LW), 0.02);
          if (forest > 0.02) detail = mix(detail, dot(TX(t_forest, p, 4.8, a_forest), LW) / max(dot(a_forest, LW), 0.02), clamp(forest * 1.2, 0.0, 1.0));
          float dtl = clamp((detail - 1.0) * 2.1 + 1.0, 0.3, 2.2);   // grana più marcata
          vec3 col = base * mix(1.0, dtl, 1.0 - 0.5 * gFar);
          // microvariazione a media distanza: spezza la sfocatura dei pixel satellitari (12 m)
// variazioni a più scale: ciuffi (~1.5 m), chiazze (~8 m), macchie (~40 m); più forti nel bosco
          mat2 R1 = mat2(0.8, -0.6, 0.6, 0.8), R2 = mat2(0.6, 0.8, -0.8, 0.6);
          vec4 n1 = texture2D(tNoise, R1 * p / 38.0), n2 = texture2D(tNoise, R2 * p / 9.0 + 0.31), n3 = texture2D(tNoise, R1 * p / 3.3 + 0.67);
          float amp = 1.0 - 0.35 * gFar;
          col *= clamp(1.0 + amp * ((n1.r - 0.5) * 1.5 + (n2.g - 0.5) * 2.2 + (n3.b - 0.5) * 2.6 * (1.0 - 0.7 * gFar) + forest * (n2.r - 0.5) * 1.2), 0.45, 1.7);
          // roccia sulle pendenze: dalla normale interpolata
          vec3 wn = normalize(vNormal * mat3(viewMatrix));
          float slope = 1.0 - clamp(wn.y, 0.0, 1.0);
          gRock = clamp(rockC * 0.9 + smoothstep(0.38, 0.6, slope) * 0.8, 0.0, 1.0);
          if (gRock > 0.02) col = mix(col, base * clamp(dot(TX(t_rock, p, 7.5, a_rock), LW) / max(dot(a_rock, LW), 0.02), 0.4, 2.0) * 1.05, gRock * 0.75);
          // zone urbane: tono neutro con grana d'asfalto
          if (urban > 0.02) col = mix(col, base * clamp(dot(TX(t_asphalt, p, 3.0, a_asphalt), LW) / max(dot(a_asphalt, LW), 0.02), 0.4, 2.0) * 1.1, urban * 0.55);
          // strade
          col = mix(col, vec3(0.10, 0.10, 0.11) * (0.8 + 0.5 * texture2D(t_asphalt, p / 2.0).r * 3.0), clamp(rd.r * 1.3, 0.0, 0.8));
          // acqua
          col = mix(col, vec3(0.012, 0.045, 0.06), clamp(water * 1.3, 0.0, 0.92));
          // neve in quota
          col = mix(col, vec3(0.8, 0.82, 0.86), smoothstep(2300.0, 2650.0, vWPos.y) * (1.0 - smoothstep(0.35, 0.55, slope)));
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
    const x0 = cx * CHUNK, z0 = cz * CHUNK, cell = CHUNK / seg, n = seg + 1;
    const pos = [], nor = [], idx = [];
    const e = Math.max(cell, 8);
    const pushVertex = (x, z, drop) => {
      const h = terrainHeight(x, z);
      const nx = terrainHeight(x - e, z) - terrainHeight(x + e, z), nz = terrainHeight(x, z - e) - terrainHeight(x, z + e), ny = 2 * e;
      const l = Math.hypot(nx, ny, nz);
      pos.push(x, h - drop, z); nor.push(nx / l, ny / l, nz / l);
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
    g.setIndex(idx);
    g.computeBoundingSphere();
    return g;
  }

  // ---- alberi per chunk: modelli 3D vicino, sagome a media distanza ----
  const treeGeos = makeTreeGeometries();
  const mkMat = (map, rough = 0.92) => new THREE.MeshStandardMaterial({ map, vertexColors: true, roughness: rough, metalness: 0 });
  const treeMats = { bark: mkMat(assets.bark, 0.95), needles: mkMat(assets.needleTile), leaves: mkMat(assets.leafTile, 0.85) };
  const impostors = makeImpostors(renderer, treeGeos, treeMats);
  const tc = new THREE.Color();
  const SPECIES = {
    conifer: [['conTrunk', 'bark'], ['conFoliage', 'needles']],
    broad: [['broadTrunk', 'bark'], ['broadFoliage', 'leaves']],
    shrub: [['shrubFoliage', 'leaves']],
  };
  function treeList(cx, cz) {
    const x0 = cx * CHUNK, z0 = cz * CHUNK;
    const rnd = mulberry32(cx * 977 + cz * 131 + 5);
    const lists = { conifer: [], broad: [], shrub: [] };
    for (let i = 0; i < 1500; i++) {
      const x = x0 + rnd() * CHUNK, z = z0 + rnd() * CHUNK;
      const f = forestDensity(x, z);
      const cls = sampleClass(x, z);
      // fuori dal bosco restano pochi alberi isolati (campi, giardini); mai su roccia, acqua, città
      const p = 0.015 + f * 0.95 + (1 - f) * 0.04 * (1 - cls.urban);
      if (rnd() > p) continue;
      if (cls.water > 0.3 || cls.urban > 0.5 || airportDist(x, z) < 200) continue;
      const h = terrainHeight(x, z);
      if (h > 1850) continue;
      const roll = rnd();
      const species = h > 1150 || (f > 0.45 && roll < 0.5) ? 'conifer' : roll < 0.88 ? 'broad' : 'shrub';
      lists[species].push([x, h, z, rnd(), rnd(), rnd(), rnd()]);
    }
    return lists;
  }
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
  function matrixFor(item, name) {
    const [x, h, z, r1, r2, r3] = item;
    const sc2 = (name === 'shrub' ? 0.9 : 1.0) + r1 * 0.9;
    _q.setFromAxisAngle(UP, r2 * 6.283);
    _s.set(sc2 * (0.9 + r3 * 0.25), sc2 * (0.85 + r2 * 0.45), sc2 * (0.9 + r1 * 0.25));
    return _m.compose(_p.set(x, h - 0.3, z), _q, _s);
  }
  function tintFor(item, name, bark) {
    const c = item[5], k = item[6];
    if (bark) return tc.setRGB(0.8 + k * 0.2, 0.75 + k * 0.2, 0.7 + k * 0.2);
    if (name === 'conifer') return tc.setHSL(0.27 + c * 0.06, 0.4 + k * 0.2, 1.0 + k * 0.2);
    return tc.setHSL(0.18 + c * 0.12, 0.35 + k * 0.25, 0.85 + k * 0.3);
  }
  function nearMeshes(lists) {
    const out = [];
    for (const [name, list] of Object.entries(lists)) {
      if (!list.length) continue;
      for (const [geoName, matName] of SPECIES[name]) {
        const mesh = new THREE.InstancedMesh(treeGeos[geoName], treeMats[matName], list.length);
        list.forEach((it, i) => { mesh.setMatrixAt(i, matrixFor(it, name)); mesh.setColorAt(i, tintFor(it, name, matName === 'bark')); });
        mesh.castShadow = false; mesh.receiveShadow = true;
        mesh.computeBoundingSphere();
        out.push(mesh);
      }
    }
    return out;
  }
  function farMeshes(lists) {
    const out = [];
    for (const [name, list] of Object.entries(lists)) {
      if (!list.length) continue;
      const imp = impostors[name];
      const mesh = new THREE.InstancedMesh(imp.geo, imp.mat, list.length);
      list.forEach((it, i) => { mesh.setMatrixAt(i, matrixFor(it, name)); mesh.setColorAt(i, tintFor(it, name, false).setRGB(1, 1, 1).multiplyScalar(0.9 + it[6] * 0.2)); });
      mesh.computeBoundingSphere();
      out.push(mesh);
    }
    return out;
  }

  // ---- griglia di chunk ----
  const cxMin = Math.floor(ext.x0 / CHUNK), cxMax = Math.ceil(ext.x1 / CHUNK) - 1;
  const czMin = Math.floor(ext.z0 / CHUNK), czMax = Math.ceil(ext.z1 / CHUNK) - 1;
  const chunks = [];
  const terrainGroup = new THREE.Group();
  scene.add(terrainGroup);
  for (let cz = czMin; cz <= czMax; cz++) for (let cx = cxMin; cx <= cxMax; cx++) {
    const mesh = new THREE.Mesh(new THREE.BufferGeometry(), terrainMat);
    mesh.receiveShadow = true;
    mesh.visible = false;
    terrainGroup.add(mesh);
    chunks.push({ cx, cz, mesh, geos: [null, null, null], lod: -1, lists: null, near: null, far: null, x: (cx + 0.5) * CHUNK, z: (cz + 0.5) * CHUNK });
  }
  const LOD_SEG = [64, 32, 16];
  const quality = { level: 2, nearR: 2000, farR: 6000, lod0: 2600, lod1: 6500 };

  let queue = [];
  function planChunks(cam) {
    queue = [];
    for (const ch of chunks) {
      const d = Math.hypot(ch.x - cam.x, ch.z - cam.z);
      const lod = d < quality.lod0 ? 0 : d < quality.lod1 ? 1 : 2;
      if (lod !== ch.lod) queue.push({ d: ch.lod < 0 ? d - 1e6 : d, ch, lod, kind: 'geo' });
      const wantNear = d < quality.nearR, wantFar = !wantNear && d < quality.farR;
      if ((wantNear && !ch.near) || (wantFar && !ch.far)) queue.push({ d: d + 50, ch, kind: wantNear ? 'near' : 'far' });
      if (ch.near) ch.near.forEach((t) => { t.visible = wantNear; t.castShadow = wantNear && quality.level >= 2 && d < 520; });
      if (ch.far) ch.far.forEach((t) => { t.visible = wantFar; });
    }
    queue.sort((a, b) => a.d - b.d);
  }
  function runQueue(budgetMs) {
    const t0 = performance.now();
    while (queue.length && performance.now() - t0 < budgetMs) {
      const w = queue.shift(), ch = w.ch;
      if (w.kind === 'geo') {
        if (!ch.geos[w.lod]) ch.geos[w.lod] = buildChunkGeometry(ch.cx, ch.cz, LOD_SEG[w.lod]);
        ch.mesh.geometry = ch.geos[w.lod];
        ch.mesh.visible = true;
        ch.lod = w.lod;
      } else {
        if (!ch.lists) ch.lists = treeList(ch.cx, ch.cz);
        if (w.kind === 'near' && !ch.near) { ch.near = nearMeshes(ch.lists); ch.near.forEach((t) => terrainGroup.add(t)); }
        if (w.kind === 'far' && !ch.far) { ch.far = farMeshes(ch.lists); ch.far.forEach((t) => terrainGroup.add(t)); }
      }
    }
  }

  for (const a of AIRPORTS) buildAirport(scene, a, assets, terrainHeight);

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
    ext,
    update(target, camera, dt, time) {
      sky.position.copy(camera.position);
      sky.material.uniforms.time.value = time;
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
        { size: 1024, nearR: 900, farR: 3200, lod0: 1800, lod1: 4500 },
        { size: 2048, nearR: 1500, farR: 4800, lod0: 2200, lod1: 5500 },
        { size: 4096, nearR: 2000, farR: 6500, lod0: 2600, lod1: 6500 },
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
