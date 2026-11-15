import * as THREE from 'three';

/** Cumuli sulla sommità delle termiche attive (solo con l'aliante): ne indicano la posizione, come nella realtà. */
function puffTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const blob = (x, y, r, a) => {
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, `rgba(255,255,255,${a})`); gr.addColorStop(0.55, `rgba(246,248,252,${a * 0.7})`); gr.addColorStop(1, 'rgba(240,244,250,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
  };
  let s = 7;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let i = 0; i < 22; i++) blob(128 + (rnd() - 0.5) * 120, 118 + (rnd() - 0.5) * 70 - Math.abs(rnd() - 0.5) * 20, 34 + rnd() * 34, 0.55);
  // base piatta e più scura
  const base = g.createLinearGradient(0, 120, 0, 200);
  base.addColorStop(0, 'rgba(120,134,156,0)'); base.addColorStop(1, 'rgba(120,134,156,0.35)');
  g.globalCompositeOperation = 'source-atop'; g.fillStyle = base; g.fillRect(0, 120, 256, 100);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class ThermalClouds {
  constructor(scene) {
    this.group = new THREE.Group();
    this.group.visible = false;
    scene.add(this.group);
    this.tex = puffTexture();
    this.pool = [];
    this.acc = 1;
  }

  get active() { return this.group.visible; }

  setVisible(v) { this.group.visible = v; }

  update(atm, time, dt, camPos) {
    if (!this.group.visible) return;
    this.acc += dt;
    if (this.acc < 0.5) return;
    this.acc = 0;
    const list = atm.activeThermals(time).filter((th) => Math.hypot(th.x - camPos.x, th.z - camPos.z) < 22000);
    const need = list.length * 3;
    while (this.pool.length < need) {
      const m = new THREE.SpriteMaterial({ map: this.tex, transparent: true, depthWrite: false, fog: true, opacity: 0.95 });
      const sp = new THREE.Sprite(m);
      this.group.add(sp); this.pool.push(sp);
    }
    this.pool.forEach((sp, i) => {
      const th = list[Math.floor(i / 3)];
      if (!th) { sp.visible = false; return; }
      const k = i % 3, size = (520 + th.w * 150) * (k === 0 ? 1 : 0.7);
      sp.visible = true;
      sp.position.set(th.x + (k - 1) * size * 0.32, th.top + (k === 1 ? 70 : 0), th.z + (k === 2 ? size * 0.25 : -size * 0.1));
      sp.scale.set(size * 1.7, size * 0.95, 1);
      const d = Math.hypot(sp.position.x - camPos.x, sp.position.y - camPos.y, sp.position.z - camPos.z);
      sp.material.opacity = 0.95 * Math.min(1, Math.max(0, (d - 250) / 500));
    });
  }
}
