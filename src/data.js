// Dati reali dell'area di L'Aquila (vedi tools/fetch-data.mjs): quote, classi di copertura, OpenStreetMap.
const BASE = import.meta.env.BASE_URL;

export const DATA = { ext: null, H: null, HN: 0, cls: null, CN: 0, osm: null };

// XMLHttpRequest e non fetch: funziona anche con file:// dentro Electron
function xhr(url, type) {
  return new Promise((res, rej) => {
    const r = new XMLHttpRequest();
    r.open('GET', `${BASE}data/${url}`);
    r.responseType = type;
    r.onload = () => (r.status === 200 || r.status === 0 ? res(r.response) : rej(new Error(`${url}: ${r.status}`)));
    r.onerror = () => rej(new Error(`dati mancanti: ${url}`));
    r.send();
  });
}
async function gunzip(buf) {
  const stream = new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).arrayBuffer();
}

export async function loadData() {
  const [osm, hz, cz] = await Promise.all([xhr('osm.json', 'json'), xhr('heights.bin.gz', 'arraybuffer'), xhr('classes.bin.gz', 'arraybuffer')]);
  DATA.osm = osm;
  DATA.ext = osm.meta.extent;
  DATA.HN = osm.meta.heights.n;
  DATA.CN = osm.meta.landclass.n;
  [DATA.H, DATA.cls] = await Promise.all([gunzip(hz).then((b) => new Int16Array(b)), gunzip(cz).then((b) => new Uint8Array(b))]);
}

/** quota (m) per interpolazione bilineare; fuori mappa si ripete il valore del bordo */
export function sampleH(x, z) {
  const { x0, x1, z0, z1 } = DATA.ext, N = DATA.HN;
  const u = ((x - x0) / (x1 - x0)) * N - 0.5, v = ((z - z0) / (z1 - z0)) * N - 0.5;
  const i = Math.max(0, Math.min(N - 2, Math.floor(u))), j = Math.max(0, Math.min(N - 2, Math.floor(v)));
  const fx = Math.max(0, Math.min(1, u - i)), fz = Math.max(0, Math.min(1, v - j));
  const H = DATA.H, k = j * N + i;
  return ((H[k] * (1 - fx) + H[k + 1] * fx) * (1 - fz) + (H[k + N] * (1 - fx) + H[k + N + 1] * fx) * fz) * 0.1;
}

const _c = { forest: 0, urban: 0, rock: 0, water: 0 };
/** classi di copertura 0..1 nel punto (campionamento al più vicino) */
export function sampleClass(x, z) {
  const { x0, x1, z0, z1 } = DATA.ext, N = DATA.CN;
  const i = Math.max(0, Math.min(N - 1, Math.floor(((x - x0) / (x1 - x0)) * N)));
  const j = Math.max(0, Math.min(N - 1, Math.floor(((z - z0) / (z1 - z0)) * N)));
  const k = (j * N + i) * 4;
  _c.forest = DATA.cls[k] / 255; _c.urban = DATA.cls[k + 1] / 255; _c.rock = DATA.cls[k + 2] / 255; _c.water = DATA.cls[k + 3] / 255;
  return _c;
}
