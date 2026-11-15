// Genera gli screenshot del README: node tools/screenshots.mjs
// Avvia l'app Electron (dopo `npm run build`), la controlla via Chrome DevTools Protocol e salva i PNG in docs/screenshots.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);
const electron = require('electron');
const root = resolve(import.meta.dirname, '..');
const out = resolve(root, 'docs', 'screenshots');
mkdirSync(out, { recursive: true });

const PORT = 9333;
const app = spawn(electron, ['.', `--remote-debugging-port=${PORT}`], { cwd: root, stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let page;
for (let i = 0; i < 40 && !page; i++) {
  await sleep(500);
  try { page = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find((t) => t.type === 'page'); } catch { /* attende */ }
}
if (!page) { app.kill(); throw new Error('Electron non raggiungibile'); }

const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let seq = 0;
const pending = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); pending.get(m.id)?.(m); pending.delete(m.id); };
const cdp = (method, params = {}) => new Promise((res) => { const id = ++seq; pending.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
const run = async (expression) => {
  const r = await cdp('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) console.error(r.result.exceptionDetails.exception?.description);
  return r.result?.result?.value;
};

await cdp('Emulation.setDeviceMetricsOverride', { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false });
await sleep(2500);

// stato di volo: posizione, rotta (gradi), beccheggio/rollio (rad), velocità (m/s), manetta, camera, lingua
const setup = (o) => `(() => {
  const s = window.__sim, f = s.flight, T = s.THREE;
  const o = ${JSON.stringify(o)};
  document.getElementById('help').classList.toggle('hidden', !o.help);
  s.setLang(o.lang || 'en');
  if (o.airport !== undefined) s.setAirport(o.airport);
  if (o.pos) {
    f.pos.set(...o.pos); f.onGround = false; f.airTime = 9;
    f.quat.setFromEuler(new T.Euler(o.pitch || 0, -o.heading * Math.PI / 180, -(o.bank || 0), 'YXZ'));
    f.vel.set(0, 0, -o.speed).applyQuaternion(f.quat);
    f.w.set(0, 0, 0);
  }
  f.throttle = o.throttle ?? f.throttle;
  f.flapTarget = o.flaps || 0; f.flapPos = o.flaps || 0;
  s.setCamera(o.camera);
  s.camReset();
  return true;
})()`;

const shots = [
  { name: 'hero-chase', o: { pos: [25, 75, 520], heading: 358, bank: 0.28, pitch: 0.04, speed: 40, throttle: 0.7, camera: 0 } },
  { name: 'cockpit', o: { pos: [-300, 320, -1500], heading: 340, bank: 0.18, pitch: 0.03, speed: 46, throttle: 0.75, camera: 2 } },
  { name: 'takeoff-hud', o: { help: true, camera: 0 }, ground: true },
  { name: 'airport-b', o: { airport: 1, camera: 0, throttle: 0 }, ground: true },
  { name: 'approach', o: { pos: [30, 95, 1500], heading: 0, pitch: -0.04, speed: 36, throttle: 0.25, flaps: 2, camera: 0, lang: 'it' } },
];

for (const s of shots) {
  if (s.ground) await run('window.__sim.setAirport(' + (s.o.airport ?? 0) + ')');
  await run(setup(s.o));
  await sleep(s.ground ? 1200 : 700);
  await run("document.getElementById('message').className=''");
  await sleep(300);
  const r = await cdp('Page.captureScreenshot', { format: 'png' });
  writeFileSync(resolve(out, `${s.name}.png`), Buffer.from(r.result.data, 'base64'));
  console.log('salvato', s.name);
}

ws.close();
app.kill();
process.exit(0);
