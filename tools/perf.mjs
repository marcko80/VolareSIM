// Misura gli FPS dell'app Electron ai tre livelli di qualità: node tools/perf.mjs
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);
const electron = require('electron');
const root = resolve(import.meta.dirname, '..');
const PORT = 9334;
const app = spawn(electron, ['.', `--remote-debugging-port=${PORT}`], { cwd: root, stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let page;
for (let i = 0; i < 40 && !page; i++) {
  await sleep(500);
  try { page = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find((t) => t.type === 'page'); } catch { /* attende */ }
}
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let seq = 0; const pending = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); pending.get(m.id)?.(m); pending.delete(m.id); };
const cdp = (method, params = {}) => new Promise((res) => { const id = ++seq; pending.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
const run = async (expression) => (await cdp('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result?.result?.value;

await cdp('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
await sleep(3000);
const info = await run('(() => { const gl = document.createElement("canvas").getContext("webgl2"); const e = gl.getExtension("WEBGL_debug_renderer_info"); return gl.getParameter(e.UNMASKED_RENDERER_WEBGL); })()');
console.log('GPU:', info);

const setup = (cam) => `(() => { const s = window.__sim, f = s.flight, T = s.THREE;
  f.pos.set(300, 160, 200); f.onGround = false; f.airTime = 9;
  f.quat.setFromEuler(new T.Euler(0.02, -0.4, -0.2, 'YXZ')); f.vel.set(0, 0, -45).applyQuaternion(f.quat); f.throttle = 0.7;
  s.setCamera(${cam}); s.camReset(); return true; })()`;
const measure = `new Promise((res) => { let n = 0, worst = 0, last = performance.now(); const t0 = last;
  const tick = (now) => { n++; worst = Math.max(worst, now - last); last = now;
    if (now - t0 > 4000) res(JSON.stringify({ fps: +(n / ((now - t0) / 1000)).toFixed(1), worstMs: +worst.toFixed(1) })); else requestAnimationFrame(tick); };
  requestAnimationFrame(tick); })`;

for (const cam of [0, 1]) {
  for (const q of [2, 1, 0]) {
    await run(setup(cam));
    await run(`window.__sim.setQuality(${q})`);
    await sleep(6500);
    console.log(`camera=${['chase', 'cockpit'][cam]} qualità=${['bassa', 'media', 'alta'][q]}:`, await run(measure), 'resScale=' + (await run('window.__sim.resScale')));
  }
}
ws.close();
app.kill();
process.exit(0);
