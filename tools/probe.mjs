// Strumento di sviluppo: avvia l'app Electron (dopo `npm run build`), esegue uno script di prova via CDP.
// Uso: node tools/probe.mjs tools/prove/xyz.mjs   — lo script esporta default async ({ run, shot, sleep, errors }) => {}
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const electron = require('electron');
const root = resolve(import.meta.dirname, '..');
const outDir = resolve(root, '_tmp', 'shots');
mkdirSync(outDir, { recursive: true });
const PORT = 9341;
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
const run = async (expression) => {
  const r = await cdp('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) console.error('JS:', r.result.exceptionDetails.exception?.description);
  return r.result?.result?.value;
};
const shot = async (name) => {
  const r = await cdp('Page.captureScreenshot', { format: 'png' });
  writeFileSync(resolve(outDir, name + '.png'), Buffer.from(r.result.data, 'base64'));
};
await cdp('Runtime.enable');
await cdp('Emulation.setDeviceMetricsOverride', { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false });
for (let i = 0; i < 120; i++) { if (await run("!!window.__sim && document.getElementById('loading')?.className.includes('done')")) break; await sleep(500); }
await sleep(1000);
try {
  const fn = (await import(pathToFileURL(resolve(root, process.argv[2])).href)).default;
  await fn({ run, shot, sleep, errors });
} catch (e) { console.error('ERRORE script:', e); }
console.log('Errori pagina:', errors.length ? errors : 'nessuno');
app.kill();
process.exit(0);
