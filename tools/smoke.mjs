// Test di fumo: avvia l'app, decolla, cambia camere/qualità/aeroporto/lingua e riporta eventuali eccezioni.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);
const electron = require('electron');
const root = resolve(import.meta.dirname, '..');
const PORT = 9336;
const app = spawn(electron, ['.', `--remote-debugging-port=${PORT}`], { cwd: root, stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let page;
for (let i = 0; i < 40 && !page; i++) { await sleep(500); try { page = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find((t) => t.type === 'page'); } catch { /* attende */ } }
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let seq = 0; const pending = new Map(); const errors = [];
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push('console.error: ' + m.params.args.map((a) => a.value ?? a.description).join(' '));
  pending.get(m.id)?.(m); pending.delete(m.id);
};
const cdp = (method, params = {}) => new Promise((res) => { const id = ++seq; pending.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
const run = async (expression) => (await cdp('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result?.result?.value;
await cdp('Runtime.enable');
await cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
await sleep(4000);

const key = (code, down = true) => run(`window.__sim.controls.keys.${down ? 'add' : 'delete'}('${code}')`);
const state = () => run('(() => { const f = window.__sim.flight; return JSON.stringify({ ias: Math.round(f.ias), alt: Math.round(f.altFt), onGround: f.onGround, crashed: f.crashed, hdg: Math.round(f.heading) }); })()');

await run('window.__sim.flight.throttle = 1');
await sleep(9000);
await key('KeyS');
await sleep(2500);
await key('KeyS', false);
await sleep(6000);
console.log('dopo il decollo:', await state());

for (let i = 0; i < 4; i++) { await run('window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyC" }))'); await sleep(1500); }
for (const code of ['KeyV', 'KeyV', 'KeyV', 'KeyL', 'KeyL', 'KeyH', 'KeyM']) { await run(`window.dispatchEvent(new KeyboardEvent("keydown", { code: "${code}" }))`); await sleep(1200); }
await run('window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyK" }))');
await sleep(3000);
console.log('dopo il cambio aeroporto:', await state(), 'camera/qualità ok');
await run('window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyR" }))');
await sleep(2000);
console.log('errori JS:', errors.length ? errors : 'nessuno');
ws.close(); app.kill(); process.exit(errors.length ? 1 : 0);
