// Ortofoto ad alta risoluzione (AGEA 2012 a colori, pixel nativo 50 cm) dal WMS del Geoportale Nazionale (MASE/PCN):
// nessuna condizione d'uso ("Fees: nessuna condizione applicata", "AccessConstraints: nessuno").
// Scarica due finestre attorno ai due aeroporti, ricampionate a 2 m/px (1 m/px nel nucleo di 4 km di LIAP) → public/data/ortho_a/b/c.jpg
// Uso: node tools/fetch-ortho.mjs   (dopo tools/fetch-data.mjs; i tile restano in tools/.cache)
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import jpeg from 'jpeg-js';

const root = resolve(import.meta.dirname, '..');
const CACHE = resolve(root, 'tools', '.cache', 'ortho');
const OUT = resolve(root, 'public', 'data');
mkdirSync(CACHE, { recursive: true });

const R = 6371008.8, LAT0 = 42.37980906923077, LON0 = 13.309244000000003;
const toLL = (x, z) => { const lat = LAT0 - (z / R) * 180 / Math.PI; return [lat, LON0 + (x / (R * Math.cos((lat * Math.PI) / 180))) * 180 / Math.PI]; };
const WMS = 'http://wms.pcn.minambiente.it/ogc?map=/ms_ogc/WMS_v1.3/raster/ortofoto_colore_12.map';
const LAYER = 'OI.ORTOIMMAGINI.2012.33';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// finestre: centro e semi-lato in metri, pixel
export const INSETS = [
  { name: 'ortho_a', cx: 0, cz: 0, half: 4000, n: 4096 },
  { name: 'ortho_c', cx: 0, cz: 0, half: 2000, n: 4096 },
  { name: 'ortho_b', cx: 17000, cz: 8200, half: 3000, n: 3072 },
];

async function getTile(x0, z0, x1, z1, w, key) {
  const f = resolve(CACHE, key + '.jpg');
  if (existsSync(f)) return readFileSync(f);
  const [latN, lonW] = toLL(x0, z0), [latS, lonE] = toLL(x1, z1);
  const url = `${WMS}&SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&LAYERS=${LAYER}&STYLES=&SRS=EPSG:4326&BBOX=${lonW},${latS},${lonE},${latN}&WIDTH=${w}&HEIGHT=${w}&FORMAT=image/jpeg`;
  for (let i = 0; i < 5; i++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'VolareSIM-data-prep/1.0' } });
      if (r.ok && (r.headers.get('content-type') || '').includes('jpeg')) { const b = Buffer.from(await r.arrayBuffer()); writeFileSync(f, b); return b; }
    } catch { /* riprova */ }
    await sleep(1000 * (i + 1));
  }
  throw new Error('tile fallito ' + key);
}

// replica della correzione colore del Sentinel-2 nello shader (per allineare il tono dell'ortofoto)
function gradeS2(r, g, b) {
  const l = 0.2126 * r + 0.7152 * g + 0.0722 * b, out = [];
  const m = [r, g, b].map((v, i) => (l + (v - l) * 1.2) * [1.08, 1.0, 0.86][i]);
  for (const v of m) { let c = Math.pow(Math.max(v, 0), 0.72) * 0.95; c = c + (c * c * 2 - c) * 0.25; out.push(c); }
  return out;
}

const sent = jpeg.decode(readFileSync(resolve(OUT, 'imagery.jpg')), { useTArray: true, formatAsRGBA: true });
const EXT = { x0: -12000, x1: 26000, z0: -16000, z1: 22000 };

for (const I of INSETS) {
  console.log(`Ortofoto ${I.name}: ${I.half * 2 / 1000} km → ${I.n}² px`);
  const TS = 1024, nt = I.n / TS, out = Buffer.alloc(I.n * I.n * 4);
  const side = (I.half * 2) / nt;
  for (let ty = 0; ty < nt; ty++) for (let tx = 0; tx < nt; tx++) {
    const x0 = I.cx - I.half + tx * side, z0 = I.cz - I.half + ty * side;
    const b = await getTile(x0, z0, x0 + side, z0 + side, TS, `${I.name}_${tx}_${ty}`);
    const j = jpeg.decode(b, { useTArray: true, formatAsRGBA: true });
    for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
      const s = (y * TS + x) * 4, d = ((ty * TS + y) * I.n + tx * TS + x) * 4;
      out[d] = j.data[s]; out[d + 1] = j.data[s + 1]; out[d + 2] = j.data[s + 2]; out[d + 3] = 255;
    }
    process.stdout.write('.');
  }
  console.log();
  // tono: guadagno per canale = media Sentinel (corretto come nello shader) / media ortofoto
  const mo = [0, 0, 0], ms = [0, 0, 0]; let cnt = 0;
  for (let y = 0; y < I.n; y += 8) for (let x = 0; x < I.n; x += 8) {
    const o = (y * I.n + x) * 4;
    const wx = I.cx - I.half + ((x + 0.5) / I.n) * I.half * 2, wz = I.cz - I.half + ((y + 0.5) / I.n) * I.half * 2;
    const sx = Math.min(sent.width - 1, Math.floor(((wx - EXT.x0) / (EXT.x1 - EXT.x0)) * sent.width));
    const sy = Math.min(sent.height - 1, Math.floor(((wz - EXT.z0) / (EXT.z1 - EXT.z0)) * sent.height));
    const si = (sy * sent.width + sx) * 4;
    const g = gradeS2(sent.data[si] / 255, sent.data[si + 1] / 255, sent.data[si + 2] / 255);
    for (let c = 0; c < 3; c++) { mo[c] += out[o + c] / 255; ms[c] += g[c]; }
    cnt++;
  }
  const gain = mo.map((v, c) => Math.max(0.75, Math.min(1.35, ms[c] / v)));
  console.log('   guadagno colore', gain.map((v) => v.toFixed(2)).join(' '));
  for (let i = 0; i < I.n * I.n; i++) for (let c = 0; c < 3; c++) out[i * 4 + c] = Math.min(255, out[i * 4 + c] * gain[c]);
  writeFileSync(resolve(OUT, I.name + '.jpg'), jpeg.encode({ data: out, width: I.n, height: I.n }, 84).data);
}
console.log('Fatto.');
