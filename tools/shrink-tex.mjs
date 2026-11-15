// Riduce a 512 px (filtro a scatola) le texture CC0 dell'aereo copiate da tools/.cache/amb: node tools/shrink-tex.mjs <file...>
import { readFileSync, writeFileSync } from 'node:fs';
import jpeg from 'jpeg-js';
for (const f of process.argv.slice(2)) {
  const j = jpeg.decode(readFileSync(f), { useTArray: true, formatAsRGBA: true });
  const N = 512, k = j.width / N, out = new Uint8Array(N * N * 4);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) for (let c = 0; c < 4; c++) {
    let s = 0, n = 0;
    for (let yy = Math.floor(y * k); yy < Math.floor((y + 1) * k); yy++) for (let xx = Math.floor(x * k); xx < Math.floor((x + 1) * k); xx++) { s += j.data[(yy * j.width + xx) * 4 + c]; n++; }
    out[(y * N + x) * 4 + c] = s / n;
  }
  writeFileSync(f, jpeg.encode({ data: out, width: N, height: N }, 86).data);
}
