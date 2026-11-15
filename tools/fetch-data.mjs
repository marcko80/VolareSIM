// Prepara i dati reali dell'area di L'Aquila: node tools/fetch-data.mjs
//  - quota: tile "terrarium" (AWS Open Data, derivati da SRTM/NED/...) → public/data/heights.bin.gz
//  - immagini: Sentinel-2 cloudless 2016 di EOX (CC BY 4.0) → public/data/imagery.jpg
//  - OpenStreetMap (ODbL): piste, raccordi, piazzali, edifici aeroportuali, strade → public/data/osm.json
//  - classi di copertura (bosco, urbano, roccia, acqua) stimate da immagine, quota e pendenza → public/data/classes.bin.gz
// I tile scaricati restano in tools/.cache (ignorato da git).
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { resolve } from 'node:path';
import { PNG } from 'pngjs';
import jpeg from 'jpeg-js';

const root = resolve(import.meta.dirname, '..');
const CACHE = resolve(root, 'tools', '.cache');
const OUT = resolve(root, 'public', 'data');
mkdirSync(CACHE, { recursive: true });
mkdirSync(OUT, { recursive: true });

const R = 6371008.8;
const UA = 'VolareSIM-data-prep/1.0';
const EXT = { x0: -12000, x1: 26000, z0: -16000, z1: 22000 }; // metri rispetto all'origine (x est, z sud)
const NH = 2048, NI = 3072, NC = 1536;                          // celle: quota, immagine, classi

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function fetchBuf(url, cacheName, opts = {}) {
  const f = resolve(CACHE, cacheName);
  if (existsSync(f)) return readFileSync(f);
  for (let i = 0; i < 5; i++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: '*/*' }, ...opts });
      if (r.ok) { const b = Buffer.from(await r.arrayBuffer()); writeFileSync(f, b); return b; }
      if (r.status === 404) return null;
    } catch { /* riprova */ }
    await sleep(800 * (i + 1));
  }
  throw new Error('download fallito: ' + url);
}
async function pool(items, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; await fn(items[k], k); } }));
}

// ---- proiezione locale (sinusoidale): x = R·Δλ·cosφ, z = R·(φ0 − φ)
let LAT0 = 42.3797, LON0 = 13.3092;
const toLL = (x, z) => { const lat = LAT0 - (z / R) * 180 / Math.PI; return [lat, LON0 + (x / (R * Math.cos((lat * Math.PI) / 180))) * 180 / Math.PI]; };
const toXZ = (lat, lon) => [R * ((lon - LON0) * Math.PI / 180) * Math.cos((lat * Math.PI) / 180), R * ((LAT0 - lat) * Math.PI / 180)];
const merc = (lat, lon, z) => {
  const n = 2 ** z, s = Math.sin((lat * Math.PI) / 180);
  return [((lon + 180) / 360) * n, (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n];
};

// ================================================================== OpenStreetMap
async function overpass(name, query) {
  const f = resolve(CACHE, `osm_${name}.json`);
  if (existsSync(f)) return JSON.parse(readFileSync(f, 'utf8'));
  for (let i = 0; i < 4; i++) {
    const r = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST', headers: { 'User-Agent': UA, Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'data=' + encodeURIComponent(query),
    });
    if (r.ok) { const j = await r.json(); writeFileSync(f, JSON.stringify(j)); return j; }
    await sleep(4000 * (i + 1));
  }
  throw new Error('Overpass non risponde');
}

console.log('1/5 OpenStreetMap: aeroporti…');
const liap = await overpass('liap', '[out:json][timeout:90];(way["aeroway"~"runway|taxiway|apron"](around:3500,42.3797,13.3092);nwr["aeroway"~"terminal|hangar"](around:3500,42.3797,13.3092);way["building"](around:1800,42.3797,13.3092););out geom tags;');
const avio = await overpass('avio', '[out:json][timeout:90];(way["aeroway"~"runway|taxiway|apron"](around:1500,42.3005,13.5181);nwr["aeroway"~"terminal|hangar"](around:1500,42.3005,13.5181);way["building"](around:900,42.3005,13.5181););out geom tags;');
// origine = centro della pista di L'Aquila
const rw = liap.elements.find((e) => e.tags.aeroway === 'runway');
LAT0 = rw.geometry.reduce((s, p) => s + p.lat, 0) / rw.geometry.length;
LON0 = rw.geometry.reduce((s, p) => s + p.lon, 0) / rw.geometry.length;
console.log('   origine', LAT0.toFixed(5), LON0.toFixed(5));

console.log('   strade principali…');
const [laS, loW] = toLL(EXT.x0, EXT.z1), [laN, loE] = toLL(EXT.x1, EXT.z0);
const bbox = `${Math.min(laS, laN)},${Math.min(loW, loE)},${Math.max(laS, laN)},${Math.max(loW, loE)}`;
const roads = await overpass('roads', `[out:json][timeout:120];(way["highway"~"^(motorway|trunk|primary|secondary|tertiary)$"](${bbox}););out geom tags;`);
const rivers = await overpass('water', `[out:json][timeout:120];(way["waterway"~"^(river)$"](${bbox});way["natural"="water"](${bbox}););out geom tags;`);

// ================================================================== quota (terrarium z13)
console.log('2/5 Quota (terrarium)…');
const ZD = 13;
const corners = [[EXT.x0, EXT.z0], [EXT.x1, EXT.z0], [EXT.x0, EXT.z1], [EXT.x1, EXT.z1]].map(([x, z]) => merc(...toLL(x, z), ZD));
const dx0 = Math.floor(Math.min(...corners.map((c) => c[0])) - 1), dx1 = Math.floor(Math.max(...corners.map((c) => c[0])) + 1);
const dy0 = Math.floor(Math.min(...corners.map((c) => c[1])) - 1), dy1 = Math.floor(Math.max(...corners.map((c) => c[1])) + 1);
const TW = dx1 - dx0 + 1, TH = dy1 - dy0 + 1;
const demW = TW * 256, demH = TH * 256;
const dem = new Float32Array(demW * demH);
const dTiles = [];
for (let ty = dy0; ty <= dy1; ty++) for (let tx = dx0; tx <= dx1; tx++) dTiles.push([tx, ty]);
await pool(dTiles, 8, async ([tx, ty]) => {
  const b = await fetchBuf(`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${ZD}/${tx}/${ty}.png`, `dem_${ZD}_${tx}_${ty}.png`);
  if (!b) return;
  const png = PNG.sync.read(b);
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
    const i = (y * 256 + x) * 4;
    dem[((ty - dy0) * 256 + y) * demW + (tx - dx0) * 256 + x] = png.data[i] * 256 + png.data[i + 1] + png.data[i + 2] / 256 - 32768;
  }
});
function sampleDem(lat, lon) {
  const [tx, ty] = merc(lat, lon, ZD);
  const px = (tx - dx0) * 256 - 0.5, py = (ty - dy0) * 256 - 0.5;
  const x0 = Math.max(0, Math.min(demW - 2, Math.floor(px))), y0 = Math.max(0, Math.min(demH - 2, Math.floor(py)));
  const fx = Math.min(1, Math.max(0, px - x0)), fy = Math.min(1, Math.max(0, py - y0));
  const a = dem[y0 * demW + x0], b = dem[y0 * demW + x0 + 1], c = dem[(y0 + 1) * demW + x0], d = dem[(y0 + 1) * demW + x0 + 1];
  return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
}
const heights = new Int16Array(NH * NH);
let hmin = 1e9, hmax = -1e9;
for (let j = 0; j < NH; j++) for (let i = 0; i < NH; i++) {
  const [lat, lon] = toLL(EXT.x0 + ((i + 0.5) / NH) * (EXT.x1 - EXT.x0), EXT.z0 + ((j + 0.5) / NH) * (EXT.z1 - EXT.z0));
  const h = sampleDem(lat, lon);
  heights[j * NH + i] = Math.round(h * 10);
  hmin = Math.min(hmin, h); hmax = Math.max(hmax, h);
}
console.log(`   quote ${hmin.toFixed(0)}–${hmax.toFixed(0)} m, quota pista ≈ ${sampleDem(LAT0, LON0).toFixed(0)} m`);
writeFileSync(resolve(OUT, 'heights.bin.gz'), gzipSync(Buffer.from(heights.buffer), { level: 9 }));

// ================================================================== immagini (Sentinel-2 cloudless, z14)
console.log('3/5 Immagini Sentinel-2…');
const ZI = 14;
const ic = [[EXT.x0, EXT.z0], [EXT.x1, EXT.z0], [EXT.x0, EXT.z1], [EXT.x1, EXT.z1]].map(([x, z]) => merc(...toLL(x, z), ZI));
const ix0 = Math.floor(Math.min(...ic.map((c) => c[0])) - 1), ix1 = Math.floor(Math.max(...ic.map((c) => c[0])) + 1);
const iy0 = Math.floor(Math.min(...ic.map((c) => c[1])) - 1), iy1 = Math.floor(Math.max(...ic.map((c) => c[1])) + 1);
const IW = (ix1 - ix0 + 1) * 256, IH = (iy1 - iy0 + 1) * 256;
const img = new Uint8Array(IW * IH * 3).fill(110);
const iTiles = [];
for (let ty = iy0; ty <= iy1; ty++) for (let tx = ix0; tx <= ix1; tx++) iTiles.push([tx, ty]);
await pool(iTiles, 10, async ([tx, ty]) => {
  const b = await fetchBuf(`https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/g/${ZI}/${ty}/${tx}.jpg`, `img_${ZI}_${tx}_${ty}.jpg`);
  if (!b) return;
  const j = jpeg.decode(b, { useTArray: true, formatAsRGBA: false });
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
    const s = (y * 256 + x) * 3, d = (((ty - iy0) * 256 + y) * IW + (tx - ix0) * 256 + x) * 3;
    img[d] = j.data[s]; img[d + 1] = j.data[s + 1]; img[d + 2] = j.data[s + 2];
  }
});
function sampleImg(lat, lon, out) {
  const [tx, ty] = merc(lat, lon, ZI);
  const px = (tx - ix0) * 256 - 0.5, py = (ty - iy0) * 256 - 0.5;
  const x0 = Math.max(0, Math.min(IW - 2, Math.floor(px))), y0 = Math.max(0, Math.min(IH - 2, Math.floor(py)));
  const fx = Math.min(1, Math.max(0, px - x0)), fy = Math.min(1, Math.max(0, py - y0));
  for (let c = 0; c < 3; c++) {
    const a = img[(y0 * IW + x0) * 3 + c], b = img[(y0 * IW + x0 + 1) * 3 + c], cc = img[((y0 + 1) * IW + x0) * 3 + c], d = img[((y0 + 1) * IW + x0 + 1) * 3 + c];
    out[c] = (a * (1 - fx) + b * fx) * (1 - fy) + (cc * (1 - fx) + d * fx) * fy;
  }
}
const outImg = Buffer.alloc(NI * NI * 4);
const px3 = [0, 0, 0];
for (let j = 0; j < NI; j++) for (let i = 0; i < NI; i++) {
  const [lat, lon] = toLL(EXT.x0 + ((i + 0.5) / NI) * (EXT.x1 - EXT.x0), EXT.z0 + ((j + 0.5) / NI) * (EXT.z1 - EXT.z0));
  sampleImg(lat, lon, px3);
  const o = (j * NI + i) * 4;
  outImg[o] = px3[0]; outImg[o + 1] = px3[1]; outImg[o + 2] = px3[2]; outImg[o + 3] = 255;
}
{
  // unsharp mask 3x3 (raggio ~1 px, intensità 0.4): il Sentinel-2 a 10 m è morbido, così i bordi (strade, campi, boschi) risaltano
  const copy = Buffer.from(outImg);
  for (let y = 1; y < NI - 1; y++) for (let x = 1; x < NI - 1; x++) for (let c = 0; c < 3; c++) {
    const i = (y * NI + x) * 4 + c;
    const blur = (copy[i - 4] + copy[i + 4] + copy[i - NI * 4] + copy[i + NI * 4] + 4 * copy[i]) / 8;
    outImg[i] = Math.max(0, Math.min(255, copy[i] + 0.4 * (copy[i] - blur)));
  }
}
writeFileSync(resolve(OUT, 'imagery.jpg'), jpeg.encode({ data: outImg, width: NI, height: NI }, 88).data);

// ================================================================== classi di copertura dal colore dell'immagine
console.log('4/5 Classi di copertura…');
const cls = Buffer.alloc(NC * NC * 4);
const tmp = [0, 0, 0];
const slopeAt = (i, j) => {
  const x = (i / NC) * NH, z = (j / NC) * NH;
  const xi = Math.min(NH - 2, Math.max(1, Math.floor(x))), zi = Math.min(NH - 2, Math.max(1, Math.floor(z)));
  const cell = (EXT.x1 - EXT.x0) / NH;
  const gx = (heights[zi * NH + xi + 1] - heights[zi * NH + xi - 1]) / 10 / (2 * cell), gz = (heights[(zi + 1) * NH + xi] - heights[(zi - 1) * NH + xi]) / 10 / (2 * cell);
  return { h: heights[zi * NH + xi] / 10, s: Math.hypot(gx, gz) };
};
for (let j = 0; j < NC; j++) for (let i = 0; i < NC; i++) {
  const [lat, lon] = toLL(EXT.x0 + ((i + 0.5) / NC) * (EXT.x1 - EXT.x0), EXT.z0 + ((j + 0.5) / NC) * (EXT.z1 - EXT.z0));
  sampleImg(lat, lon, tmp);
  const [r, g, b] = tmp, lum = (r + g + b) / 3;
  const { h, s } = slopeAt(i, j);
  const exg = (2 * g - r - b) / Math.max(1, r + g + b);
  const clamp01 = (v) => Math.max(0, Math.min(1, v));
  const sstep = (e0, e1, x) => { const t = clamp01((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };
  const veg = exg > 0.11 ? 1 : 0;
  // bosco (stima): vegetazione scura nella fascia 600–1800 m, più probabile sui versanti che in pianura
  const band = sstep(600, 950, h) * (1 - sstep(1650, 1900, h));
  const forest = veg * clamp01((74 - lum) / 24) * band * (0.2 + 0.8 * clamp01(s / 0.3));
  const water = b / Math.max(1, g) > 1.12 && lum < 48 ? 1 : 0;
  const rock = clamp01((s - 0.45) * 2.5 + (h > 1750 ? (h - 1750) / 450 : 0) + (!veg && lum > 90 && s > 0.2 ? 0.5 : 0));
  const urban = !veg && lum > 75 && lum < 170 && s < 0.2 && h < 1300 && !water ? 1 : 0;
  const o = (j * NC + i) * 4;
  cls[o] = forest * 255; cls[o + 1] = urban * 255; cls[o + 2] = rock * 255; cls[o + 3] = water * 255;
}
const dbg = new PNG({ width: NC, height: NC });
for (let k = 0; k < NC * NC; k++) {
  const f = cls[k * 4] / 255, u = cls[k * 4 + 1] / 255, rk = cls[k * 4 + 2] / 255, w = cls[k * 4 + 3] / 255;
  dbg.data[k * 4] = 60 + 195 * Math.max(u, rk); dbg.data[k * 4 + 1] = 90 + 110 * f + 90 * rk; dbg.data[k * 4 + 2] = 60 + 190 * w + 120 * rk; dbg.data[k * 4 + 3] = 255;
}
writeFileSync(resolve(CACHE, 'class_debug.png'), PNG.sync.write(dbg));
writeFileSync(resolve(OUT, 'classes.bin.gz'), gzipSync(cls, { level: 9 })); // RGBA8: bosco, urbano, roccia, acqua

// ================================================================== OSM → JSON locale
console.log('5/5 Salvataggio…');
const loc = (g) => g.map((p) => toXZ(p.lat, p.lon).map((v) => Math.round(v * 10) / 10));
const pack = (j) => j.elements.filter((e) => e.geometry).map((e) => ({ t: e.tags, p: loc(e.geometry) }));
const meta = {
  origin: { lat: LAT0, lon: LON0 },
  extent: EXT, heights: { n: NH, scale: 0.1 }, imagery: { n: NI }, landclass: { n: NC },
  generated: new Date().toISOString().slice(0, 10),
};
const roadsPacked = roads.elements.filter((e) => e.geometry).map((e) => ({ k: e.tags.highway, p: loc(e.geometry).filter((_, i) => i % 2 === 0 || i === e.geometry.length - 1) }));
const waterPacked = rivers.elements.filter((e) => e.geometry).map((e) => ({ k: e.tags.waterway || 'lake', p: loc(e.geometry) }));
writeFileSync(resolve(OUT, 'osm.json'), JSON.stringify({
  meta, liap: pack(liap), avio: pack(avio), roads: roadsPacked, water: waterPacked,
}));
console.log(`fatto: ${roadsPacked.length} strade, ${waterPacked.length} corsi/specchi d'acqua, ${liap.elements.length + avio.elements.length} elementi aeroportuali`);
