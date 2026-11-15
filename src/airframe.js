import * as THREE from 'three';
import { pchip, loftRings } from './geometry.js';
import { canvasTex } from './decals.js';

const spow = (v, e) => Math.sign(v) * Math.pow(Math.abs(v), e);

/**
 * Fusoliera loftata da sezioni superellittiche. keys: [z, semilarghezza, quota superiore, quota inferiore, esponente]
 * Stessa convenzione di buildFuselage (avanti = −Z, phi 0 = ventre, π/2 = destra).
 */
export function loftBody(keys, { rings = 120, seg = 56 } = {}) {
  const zs = keys.map((k) => k[0]);
  const f = [1, 2, 3, 4].map((c) => pchip(zs, keys.map((k) => k[c])));
  const z0 = zs[0], z1 = zs[zs.length - 1];
  const rs = [], us = [];
  for (let r = 0; r < rings; r++) {
    const z = z0 + ((z1 - z0) * r) / (rings - 1);
    const W = Math.max(f[0](z), 0.004), top = f[1](z), bot = f[2](z), n = f[3](z), e = 2 / n;
    const mid = (top + bot) / 2, half = (top - bot) / 2;
    const ring = [];
    for (let k = 0; k < seg; k++) {
      const phi = (2 * Math.PI * k) / seg;
      ring.push(new THREE.Vector3(spow(Math.sin(phi), e) * W, mid + half * spow(-Math.cos(phi), e), z));
    }
    rs.push(ring); us.push(r / (rings - 1));
  }
  return loftRings(rs, { uvU: us, capStart: true, capEnd: true });
}

/** ruota con pneumatico e cerchio, asse X */
export function makeWheel(r, w, rubber, rim) {
  const g = new THREE.Group();
  const tire = new THREE.Mesh(new THREE.TorusGeometry(r - w * 0.5, w * 0.5, 12, 24).rotateY(Math.PI / 2), rubber);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.55, r * 0.55, w * 0.9, 18).rotateZ(Math.PI / 2), rim);
  g.add(tire, hub);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

/**
 * Plancia semplificata con strumenti disegnati su canvas (anemometro, orizzonte, altimetro, variometro, bussola, manetta),
 * montante e cloche. Per jet e aliante: nessun guscio interno, solo ciò che si vede dal posto di guida.
 *  opts: { z, y, w, h, tilt, stickZ, jet }
 */
export function createSimpleCockpit({ z = -3.2, y = 0.1, w = 0.78, h = 0.3, tilt = -0.3, stickZ = -2.2, stickY = -0.55, jet = false, vsMax = jet ? 6000 : 5 } = {}) {
  const group = new THREE.Group();
  const PW = 1024, PH = Math.round(1024 * h / w);
  const cv = document.createElement('canvas');
  cv.width = PW; cv.height = PH;
  const g = cv.getContext('2d');
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.25 }));
  panel.position.set(0, y, z);
  panel.rotation.x = tilt;
  group.add(panel);
  // cappottina antiriflesso e fianchi
  const dark = new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.7 });
  const hood = new THREE.Mesh(new THREE.BoxGeometry(w + 0.1, 0.05, 0.3), dark);
  hood.position.set(0, y + h / 2 + 0.01, z - 0.07);
  hood.rotation.x = tilt * 0.5;
  group.add(hood);
  const body = new THREE.Mesh(new THREE.BoxGeometry(w + 0.14, 0.7, 0.5), dark);
  body.position.set(0, y - h / 2 - 0.3, z - 0.02);
  group.add(body);
  // cloche
  const stick = new THREE.Group();
  stick.position.set(0, stickY, stickZ);
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.018, 0.4, 8), new THREE.MeshStandardMaterial({ color: 0x202226, roughness: 0.5, metalness: 0.5 }));
  rod.position.y = 0.2;
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.02, 0.1, 10), dark);
  grip.position.y = 0.43;
  stick.add(rod, grip);
  group.add(stick);
  const light = new THREE.PointLight(0xfff0dc, 0, 3, 2);
  light.position.set(0, y + 0.4, z + 0.8);
  group.add(light);

  const DIALS = [
    { id: 'asi', cx: 0.14, cy: 0.5 }, { id: 'ai', cx: 0.30, cy: 0.5 }, { id: 'alt', cx: 0.46, cy: 0.5 },
    { id: 'vsi', cx: 0.62, cy: 0.5 }, { id: 'hdg', cx: 0.78, cy: 0.5 },
  ];
  const R = PW * 0.072;
  const needle = (cx, cy, a, len, wd, col = '#f4f4f0') => {
    g.save(); g.translate(cx, cy); g.rotate(a); g.strokeStyle = col; g.lineWidth = wd; g.lineCap = 'round';
    g.beginPath(); g.moveTo(0, len * 0.12); g.lineTo(0, -len); g.stroke(); g.restore();
  };
  const face = (cx, cy, label) => {
    g.fillStyle = '#0b0c0e'; g.beginPath(); g.arc(cx, cy, R * 1.12, 0, 7); g.fill();
    g.strokeStyle = '#8a8f98'; g.lineWidth = 4; g.beginPath(); g.arc(cx, cy, R * 1.12, 0, 7); g.stroke();
    g.fillStyle = '#cfd5dd'; g.font = `${R * 0.2}px Arial`; g.textAlign = 'center'; g.fillText(label, cx, cy + R * 0.62);
  };
  function draw(f) {
    g.fillStyle = '#25282d'; g.fillRect(0, 0, PW, PH);
    const cyy = PH * 0.5;
    const kmax = jet ? 600 : 160;
    for (const d of DIALS) {
      const cx = d.cx * PW;
      if (d.id === 'ai') {
        g.save(); g.beginPath(); g.arc(cx, cyy, R * 1.05, 0, 7); g.clip(); g.translate(cx, cyy); g.rotate(-f.bank);
        g.translate(0, f.pitch * R * 2.2);
        g.fillStyle = '#3b83c8'; g.fillRect(-R * 2, -R * 4, R * 4, R * 4);
        g.fillStyle = '#7b5a35'; g.fillRect(-R * 2, 0, R * 4, R * 4);
        g.fillStyle = '#fff'; g.fillRect(-R * 2, -1.5, R * 4, 3);
        g.restore();
        g.strokeStyle = '#ffd23a'; g.lineWidth = 5; g.beginPath(); g.moveTo(cx - R * 0.7, cyy); g.lineTo(cx - R * 0.2, cyy); g.moveTo(cx + R * 0.7, cyy); g.lineTo(cx + R * 0.2, cyy); g.stroke();
        g.strokeStyle = '#8a8f98'; g.lineWidth = 4; g.beginPath(); g.arc(cx, cyy, R * 1.12, 0, 7); g.stroke();
        continue;
      }
      face(cx, cyy, d.id === 'asi' ? 'KT' : d.id === 'alt' ? 'FT' : d.id === 'vsi' ? (jet ? 'FPM' : 'M/S') : 'HDG');
      if (d.id === 'asi') needle(cx, cyy, Math.min(1, f.ias / kmax) * 5.2 - 0.4 - Math.PI * 0.0, R * 0.85, 5);
      if (d.id === 'alt') { needle(cx, cyy, ((f.altFt % 1000) / 1000) * Math.PI * 2, R * 0.85, 4); needle(cx, cyy, ((f.altFt % 10000) / 10000) * Math.PI * 2, R * 0.55, 7); }
      if (d.id === 'vsi') needle(cx, cyy, Math.max(-1, Math.min(1, (jet ? f.vsFpm : f.vsMs) / vsMax)) * 2.4 + Math.PI / 2, R * 0.85, 4, '#ffd23a');
      if (d.id === 'hdg') needle(cx, cyy, (f.heading * Math.PI) / 180, R * 0.8, 5, '#ff5a44');
    }
    g.fillStyle = '#9fb3c8'; g.font = '30px Arial'; g.textAlign = 'left';
    g.fillText(jet ? 'RPM ' + Math.round(40 + f.throttle * 60) + '%' : '', PW * 0.04, PH * 0.9);
    tex.needsUpdate = true;
  }
  let active = false, n = 0;
  group.visible = false;
  draw({ ias: 0, bank: 0, pitch: 0, altFt: 0, throttle: 0, heading: 0, vsFpm: 0, vsMs: 0 });
  return {
    group,
    setActive(v) { active = v; group.visible = v; light.intensity = v ? 1.2 : 0; },
    update(f) {
      stick.rotation.x = 0.35 * f.input.pitch; stick.rotation.z = -0.35 * f.input.roll;
      if (active && (n++ % 3) === 0) draw(f);
    },
  };
}
