const fs = require('fs');
const edit = (file, pairs) => {
  let s = fs.readFileSync(file, 'utf8');
  for (const [a, b] of pairs) {
    if (a instanceof RegExp) { if (!a.test(s)) throw new Error(file + ' regex ' + a); s = s.replace(a, b); continue; }
    if (!s.includes(a)) throw new Error(file + ' missing: ' + a.slice(0, 70));
    s = s.split(a).join(b);
  }
  for (let i = 0; i < 8; i++) { try { fs.writeFileSync(file, s); break; } catch (e) { if (i === 7) throw e; Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500); } }
};

edit('index.html', [["    <div class=\"pad\"><b data-i18n=\"padTitle\">JOYSTICK / GAMEPAD</b>", "    <div class=\"attr\">Terrain: Sentinel-2 cloudless by EOX (CC BY 4.0, contains modified Copernicus Sentinel data 2016) · Elevation: AWS Terrain Tiles · Map data © OpenStreetMap contributors (ODbL) · Textures: ambientCG (CC0)</div>\n    <div class=\"pad\"><b data-i18n=\"padTitle\">JOYSTICK / GAMEPAD</b>"]]);
edit('src/style.css', [["#help .pad div { margin-top: 2px; }", "#help .pad div { margin-top: 2px; }\n#help .attr { margin-top: 8px; max-width: 330px; font-size: 9.5px; line-height: 1.4; color: #8da2b8; }"]]);

fs.writeFileSync('public/data/CREDITS.txt', `Dati reali dell'area di L'Aquila (generati da tools/fetch-data.mjs)

Immagini: Sentinel-2 cloudless 2016 (https://s2maps.eu) di EOX IT Services GmbH.
  Licenza CC BY 4.0. Contiene dati Copernicus Sentinel modificati (2016).
Quote: Terrain Tiles / Terrarium su AWS Open Data (https://registry.opendata.aws/terrain-tiles/),
  derivati da SRTM, USGS 3DEP, GMTED2010 e altre fonti pubbliche.
Piste, raccordi, piazzali, edifici, strade e acque: © OpenStreetMap contributors, licenza ODbL 1.0
  (https://www.openstreetmap.org/copyright).
Le classi di copertura (bosco, urbano, roccia, acqua) sono una stima automatica da colore, quota e pendenza.
`);

const p = JSON.parse(fs.readFileSync('package.json', 'utf8'));
p.version = '0.6.0';
p.scripts['fetch-data'] = 'node tools/fetch-data.mjs';
p.description = 'Civil flight simulator (Cessna) over the real terrain of L\'Aquila, Italy - Three.js + Electron';
fs.writeFileSync('package.json', JSON.stringify(p, null, 2) + '\n');
console.log('ok');
