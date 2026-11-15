// Test di fumo sull'eseguibile impacchettato (release/win-unpacked): avvio, rendering e assenza di errori JS.
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const exe = resolve(import.meta.dirname, '..', 'release', 'win-unpacked', 'VolareSIM.exe');
const PORT = 9337;
const app = spawn(exe, [`--remote-debugging-port=${PORT}`], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let page;
for (let i = 0; i < 40 && !page; i++) { await sleep(500); try { page = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find((t) => t.type === 'page'); } catch { /* attende */ } }
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let seq = 0; const pending = new Map(); const errors = [];
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
  pending.get(m.id)?.(m); pending.delete(m.id);
};
const cdp = (method, params = {}) => new Promise((res) => { const id = ++seq; pending.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
const run = async (expression) => (await cdp('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result?.result?.value;
await cdp('Runtime.enable');
let t0 = Date.now();
for (let i = 0; i < 80; i++) { await sleep(500); if (await run('document.getElementById("loading")?.className.includes("done")')) break; }
console.log(`caricamento: ${((Date.now() - t0) / 1000).toFixed(1)} s dopo l'avvio della finestra`);
console.log(await run('JSON.stringify({ sim: !!window.__sim, gpu: window.__sim?.gpuName, quality: window.__sim?.quality, res: window.__sim?.resScale, loadingDone: document.getElementById("loading")?.className, lang: document.documentElement.lang })'));
console.log('errori JS:', errors.length ? errors : 'nessuno');
ws.close(); app.kill(); process.exit(errors.length ? 1 : 0);
