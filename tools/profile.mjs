// Profilo a esclusione: spegne un componente alla volta e misura gli FPS. node tools/profile.mjs [larghezza] [altezza]
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
const require = createRequire(import.meta.url);
const electron = require('electron');
const root = resolve(import.meta.dirname, '..');
const W = +(process.argv[2] || 1280), H = +(process.argv[3] || 720), CAM = +(process.argv[4] || 0), QL = +(process.argv[5] || 0);
const PORT = 9335;
const app = spawn(electron, ['.', `--remote-debugging-port=${PORT}`], { cwd: root, stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let page;
for (let i = 0; i < 40 && !page; i++) { await sleep(500); try { page = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find((t) => t.type === 'page'); } catch {} }
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let seq = 0; const pending = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); pending.get(m.id)?.(m); pending.delete(m.id); };
const cdp = (method, params = {}) => new Promise((res) => { const id = ++seq; pending.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
const run = async (expression) => (await cdp('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result?.result?.value;
await cdp('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
await sleep(3500);
const measure = `new Promise((res) => { let n = 0, last = performance.now(); const t0 = last;
  const tick = (now) => { n++; if (now - t0 > 3000) res((n / ((now - t0) / 1000)).toFixed(1)); else requestAnimationFrame(tick); };
  requestAnimationFrame(tick); })`;
const base = `(() => { const s = window.__sim, f = s.flight, T = s.THREE;
  f.pos.set(300, 900, 200); f.onGround = false; f.airTime = 9;
  f.quat.setFromEuler(new T.Euler(0.02, -0.4, -0.2, 'YXZ')); f.vel.set(0, 0, 0); f.throttle = 0.0; f.crashed = false;
  window.__hide = (pred, v) => s.scene.traverse((o) => { if (pred(o)) o.visible = v; });
  s.setCamera(${CAM}); s.camReset(); return true; })()`;
await run(base);
const tests = [
  ['base', `window.__sim.setQuality(${QL})`],
  ['risoluzione 1.0', 'window.__sim.setResScale(1.0)'],
  ['risoluzione 0.6', 'window.__sim.setResScale(0.6)'],
  ['pannello OFF', 'window.__sim.scene.traverse((o)=>{ if(o.isMesh&&o.material.map&&o.material.map.image&&o.material.map.image.width===2048&&o.material.map.image.height===872) o.visible=false; })'],
  ['senza cielo', 'window.__hide((o)=>o.material&&o.material.type==="ShaderMaterial",false)'],
  ['cielo di nuovo ON', 'window.__hide((o)=>o.material&&o.material.type==="ShaderMaterial",true)'],
  ['senza alberi', 'window.__hide((o)=>o.isInstancedMesh&&o.geometry.attributes.color,false)'],
  ['alberi ON', 'window.__hide((o)=>o.isInstancedMesh&&o.geometry.attributes.color,true)'],
  ['senza terreno', 'window.__hide((o)=>o.isMesh&&o.geometry.attributes.color&&!o.isInstancedMesh,false)'],
  ['terreno ON', 'window.__hide((o)=>o.isMesh&&o.geometry.attributes.color&&!o.isInstancedMesh,true)'],
  ['senza ombre', 'window.__sim.scene.traverse((o)=>{o.castShadow=false}); window.__sim.scene.traverse((o)=>{if(o.isLight)o.castShadow=false})'],
];
for (const [name, js] of tests) {
  await run(js); await sleep(1200);
  console.log(name.padEnd(22), (await run(measure)) + ' fps');
}
ws.close(); app.kill(); process.exit(0);
