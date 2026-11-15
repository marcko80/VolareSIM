const fs = require('fs');
let s = fs.readFileSync('src/world.js', 'utf8');
const r = (a, b) => { if (!s.includes(a)) throw new Error(a.slice(0, 60)); s = s.split(a).join(b); };
r("g.fillStyle = grass ? '#5f8a3c' : '#3b3c40';", "g.fillStyle = grass ? '#6a8240' : '#3b3c40';");
r("for (let i = 0; i < 18; i++) { g.fillStyle = i % 2 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'; g.fillRect(mx(-Wd / 2 + (i * Wd) / 18), 0, sx * (Wd / 18), H); }",
  "for (let i = 0; i < 9000; i++) { g.fillStyle = `rgba(${70 + Math.random() * 70},${85 + Math.random() * 55},${35 + Math.random() * 25},0.22)`; g.fillRect(Math.random() * W, Math.random() * H, 3 + Math.random() * 12, 1 + Math.random() * 3); }");
for (let i = 0; i < 10; i++) { try { fs.writeFileSync('src/world.js', s); console.log('ok'); break; } catch (e) { if (i === 9) throw e; Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 600); } }
