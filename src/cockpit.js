import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { t } from './i18n.js';
import { pbr } from './materials.js';

/**
 * Interno del Cessna: cruscotto con strumenti disegnati su canvas ad alta risoluzione (lancette dinamiche),
 * ghiere e vetrini 3D, due volantini collegati, manetta e miscela, sedili, pannelli porta, consolle.
 * Si inserisce nel gruppo dell'aereo (il guscio interno e i finestrini sono in aircraft.js).
 */
export const EYE = new THREE.Vector3(-0.33, 0.5, 0.12);

const PW = 2048, PH = 872;            // texture del pannello
const PANEL = { w: 1.08, h: 0.46, y: 0.14, z: -1.215 };
const GAUGES = [
  { id: 'asi', cx: 175, cy: 190, r: 84 }, { id: 'ai', cx: 365, cy: 190, r: 84 }, { id: 'alt', cx: 555, cy: 190, r: 84 },
  { id: 'tc', cx: 175, cy: 390, r: 84 }, { id: 'hdg', cx: 365, cy: 390, r: 84 }, { id: 'vsi', cx: 555, cy: 390, r: 84 },
  { id: 'rpm', cx: 1520, cy: 200, r: 100 },
];
const rad = (d) => (d * Math.PI) / 180;

export function createCockpit() {
  const group = new THREE.Group();
  const mat = (c, rough = 0.8, metal = 0) => new THREE.MeshStandardMaterial({ color: c, roughness: rough, metalness: metal });
  const dark = pbr('plastic', { repeat: 3.3, color: 0x5d6168, normalScale: 0.9 }), grey = pbr('plastic', { repeat: 2.2, color: 0x8d929b, normalScale: 0.7 });
  const seatMat = pbr('leather', { repeat: 1.8, color: 0x8a93a6, normalScale: 1.3 });
  const chrome = pbr('metal', { repeat: 1, color: 0xe3e6ec, metalness: 1, roughness: 0.55, normalScale: 0.25 });
  const black = mat(0x0c0d0e, 0.55);
  const add = (parent, geo, material, x = 0, y = 0, z = 0) => {
    const m = new THREE.Mesh(geo, material);
    m.position.set(x, y, z);
    m.castShadow = false; m.receiveShadow = true;
    parent.add(m);
    return m;
  };

  // ---------------------------------------------------------------- cruscotto (profilo estruso)
  const prof = [[-1.58, -0.57], [-1.58, 0.43], [-1.3, 0.43], [-1.25, 0.37], [-1.205, -0.12], [-1.02, -0.2], [-0.98, -0.57]];
  const shape = new THREE.Shape(prof.map(([z, y]) => new THREE.Vector2(-z, y)));
  const dashGeo = new THREE.ExtrudeGeometry(shape, { depth: 1.14, bevelEnabled: false });
  dashGeo.translate(0, 0, -0.57);
  dashGeo.rotateY(Math.PI / 2);
  add(group, dashGeo, dark);
  // frontalino antiriflesso
  add(group, new RoundedBoxGeometry(1.14, 0.03, 0.34, 2, 0.012), black, 0, 0.445, -1.36);

  // ---------------------------------------------------------------- pannello strumenti
  const bg = document.createElement('canvas');
  bg.width = PW; bg.height = PH;
  const cv = document.createElement('canvas');
  cv.width = PW; cv.height = PH;
  const bctx = bg.getContext('2d'), ctx = cv.getContext('2d');
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 16;
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(PANEL.w, PANEL.h), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.22 }));
  panel.position.set(0, PANEL.y, PANEL.z);
  panel.rotation.x = -0.083;
  group.add(panel);
  const toM = (cx, cy) => [(cx / PW - 0.5) * PANEL.w, PANEL.y + (0.5 - cy / PH) * PANEL.h];

  // ghiere e vetrini degli strumenti
  const glassMat = new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.07, roughness: 0.02, metalness: 0, envMapIntensity: 2 });
  for (const g of GAUGES) {
    const [mx, my] = toM(g.cx, g.cy);
    const rr = (g.r / PW) * PANEL.w;
    const bezel = new THREE.Mesh(new THREE.TorusGeometry(rr + 0.003, 0.0045, 10, 40), chrome);
    bezel.position.set(mx, my, PANEL.z - 0.083 * (my - PANEL.y) + 0.0035);
    bezel.rotation.x = -0.083;
    group.add(bezel);
    const cover = new THREE.Mesh(new THREE.CircleGeometry(rr, 32), glassMat);
    cover.position.copy(bezel.position); cover.position.z += 0.002;
    cover.rotation.x = -0.083;
    group.add(cover);
  }

  // ---------------------------------------------------------------- disegno strumenti
  function dialFace(c, cx, cy, r) {
    c.save(); c.translate(cx, cy);
    const grd = c.createRadialGradient(0, -r * 0.3, r * 0.1, 0, 0, r);
    grd.addColorStop(0, '#1b1c20'); grd.addColorStop(1, '#050506');
    c.fillStyle = grd; c.beginPath(); c.arc(0, 0, r, 0, Math.PI * 2); c.fill();
    c.restore();
  }
  function ticks(c, cx, cy, r, from, sweep, count, every, valueFn, font = 22) {
    c.save(); c.translate(cx, cy);
    c.strokeStyle = '#f2f2f2'; c.fillStyle = '#f2f2f2'; c.lineWidth = 3;
    c.font = `bold ${font}px Arial`; c.textAlign = 'center'; c.textBaseline = 'middle';
    for (let i = 0; i <= count; i++) {
      const a = rad(from + (sweep * i) / count), big = i % every === 0;
      const r1 = r - 8, r2 = r - (big ? 26 : 17);
      c.beginPath(); c.moveTo(Math.cos(a) * r1, Math.sin(a) * r1); c.lineTo(Math.cos(a) * r2, Math.sin(a) * r2); c.stroke();
      if (big && valueFn) c.fillText(valueFn(i), Math.cos(a) * (r - 44), Math.sin(a) * (r - 44));
    }
    c.restore();
  }
  function arc(c, cx, cy, r, from, sweep, color, w = 7) {
    c.save(); c.translate(cx, cy); c.strokeStyle = color; c.lineWidth = w;
    c.beginPath(); c.arc(0, 0, r, rad(from), rad(from + sweep)); c.stroke(); c.restore();
  }
  function needle(c, cx, cy, ang, len, color = '#fff', w = 5) {
    c.save(); c.translate(cx, cy); c.rotate(rad(ang));
    c.strokeStyle = color; c.lineWidth = w; c.lineCap = 'round';
    c.beginPath(); c.moveTo(-len * 0.18, 0); c.lineTo(len, 0); c.stroke();
    c.fillStyle = '#2a2b2f'; c.beginPath(); c.arc(0, 0, 8, 0, Math.PI * 2); c.fill();
    c.restore();
  }
  const label = (c, txt, cx, cy, size = 15, color = '#aab1ba') => {
    c.fillStyle = color; c.font = `${size}px Arial`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(txt, cx, cy);
  };
  function led(c, x, y, w, h, text, color = '#6dff9a') {
    c.fillStyle = '#04120a'; c.fillRect(x, y, w, h);
    c.strokeStyle = '#3a3d44'; c.lineWidth = 2; c.strokeRect(x, y, w, h);
    c.fillStyle = color; c.font = `bold ${h * 0.62}px "Courier New", monospace`; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(text, x + w / 2, y + h / 2 + 2);
  }
  function knob(c, x, y, r) {
    const g = c.createRadialGradient(x - r * 0.3, y - r * 0.3, 1, x, y, r);
    g.addColorStop(0, '#9aa0aa'); g.addColorStop(1, '#2a2c31');
    c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
  }

  // sfondo statico: pannello, radio, strumenti motore, interruttori
  function drawBackground() {
    const c = bctx;
    const base = c.createLinearGradient(0, 0, 0, PH);
    base.addColorStop(0, '#2d3036'); base.addColorStop(1, '#1d1f23');
    c.fillStyle = base; c.fillRect(0, 0, PW, PH);
    // venatura/texture leggera
    for (let i = 0; i < 9000; i++) { c.fillStyle = `rgba(255,255,255,${Math.random() * 0.025})`; c.fillRect(Math.random() * PW, Math.random() * PH, 2, 1); }
    for (const g of GAUGES) {
      dialFace(c, g.cx, g.cy, g.r);
      c.strokeStyle = '#6b7079'; c.lineWidth = 5; c.beginPath(); c.arc(g.cx, g.cy, g.r + 2, 0, Math.PI * 2); c.stroke();
    }
    // indicatore di virata (statico)
    const tc = GAUGES[3];
    c.strokeStyle = '#f2f2f2'; c.lineWidth = 4;
    c.beginPath(); c.moveTo(tc.cx - 64, tc.cy); c.lineTo(tc.cx - 24, tc.cy); c.moveTo(tc.cx + 64, tc.cy); c.lineTo(tc.cx + 24, tc.cy); c.stroke();
    c.fillStyle = '#ffd23a'; c.beginPath(); c.moveTo(tc.cx, tc.cy - 6); c.lineTo(tc.cx - 26, tc.cy + 10); c.lineTo(tc.cx + 26, tc.cy + 10); c.closePath(); c.fill();
    c.fillStyle = '#f2f2f2'; c.fillRect(tc.cx - 38, tc.cy + 40, 76, 14);
    c.fillStyle = '#d0d0d0'; c.beginPath(); c.arc(tc.cx, tc.cy + 47, 7, 0, Math.PI * 2); c.fill();
    label(c, 'TURN COORD', tc.cx, tc.cy - 52, 14);

    // pila radio
    const rx = 790, rw = 470;
    const rows = [['AUDIO', '', 80], ['COM 1', '118.300 · 121.500', 62], ['NAV 1', '110.500 · 113.200', 62], ['GPS', 'DIRECT TO · I-VOLA', 150], ['XPDR', '7000 · ALT', 62], ['COM 2', '122.800 · 123.450', 62]];
    let ry = 60;
    for (const [name, val, hh] of rows) {
      c.fillStyle = '#17181c'; c.fillRect(rx, ry, rw, hh);
      c.strokeStyle = '#4a4e56'; c.lineWidth = 3; c.strokeRect(rx, ry, rw, hh);
      if (name === 'AUDIO') {
        for (let i = 0; i < 9; i++) { c.fillStyle = i % 3 === 0 ? '#c8cdd4' : '#7c828c'; c.fillRect(rx + 22 + i * 48, ry + 20, 30, 40); }
      } else if (name === 'GPS') {
        c.fillStyle = '#06140c'; c.fillRect(rx + 14, ry + 12, rw - 28, hh - 24);
        c.strokeStyle = '#1d6b3d'; c.lineWidth = 2;
        for (let g = 0; g < 7; g++) { c.beginPath(); c.moveTo(rx + 14, ry + 24 + g * 18); c.lineTo(rx + rw - 14, ry + 24 + g * 18); c.stroke(); }
        c.fillStyle = '#6dff9a'; c.font = 'bold 24px "Courier New", monospace'; c.textAlign = 'left'; c.textBaseline = 'middle';
        c.fillText('VOLARE INTL  ▶ MONTE ALTO', rx + 26, ry + 34); c.fillText('DIS 8.9NM   BRG 028°', rx + 26, ry + 68); c.fillText('ETE 04:20   GS 112KT', rx + 26, ry + 102);
        c.strokeStyle = '#6dff9a'; c.lineWidth = 3; c.beginPath(); c.moveTo(rx + 330, ry + 118); c.lineTo(rx + 420, ry + 50); c.stroke();
      } else {
        led(c, rx + 14, ry + 10, rw - 120, hh - 20, val);
        knob(c, rx + rw - 55, ry + hh / 2, 16);
        knob(c, rx + rw - 18, ry + hh / 2, 11);
      }
      label(c, name, rx + 40, ry - 1 + 0, 13, '#8e95a0');
      ry += hh + 16;
    }
    // strumenti motore a destra
    const eng = [
      { cx: 1740, cy: 200, r: 62, name: 'OIL T/P', a: 40, b: 60 }, { cx: 1900, cy: 200, r: 62, name: 'FUEL L/R', a: 70, b: 55 },
      { cx: 1520, cy: 400, r: 62, name: 'EGT', a: 60, b: 80 }, { cx: 1690, cy: 400, r: 62, name: 'AMPS', a: 20, b: 30 }, { cx: 1860, cy: 400, r: 62, name: 'VAC', a: 50, b: 55 },
    ];
    for (const e of eng) {
      dialFace(c, e.cx, e.cy, e.r);
      c.strokeStyle = '#6b7079'; c.lineWidth = 4; c.beginPath(); c.arc(e.cx, e.cy, e.r + 2, 0, Math.PI * 2); c.stroke();
      arc(c, e.cx, e.cy, e.r - 10, 135, 270, '#2a2d33', 5);
      arc(c, e.cx, e.cy, e.r - 10, 135 + 270 * 0.2, 270 * 0.55, '#2fd06a', 5);
      needle(c, e.cx, e.cy, 135 + 270 * (e.a / 100), e.r - 16, '#fff', 4);
      needle(c, e.cx, e.cy, 135 + 270 * (e.b / 100), e.r - 26, '#ffd23a', 3);
      label(c, e.name, e.cx, e.cy + e.r + 16, 14);
    }
    // interruttori e interruttori magnetici
    for (let i = 0; i < 12; i++) {
      const x = 90 + i * 70, y = 640;
      c.fillStyle = '#101113'; c.fillRect(x - 17, y - 8, 34, 70);
      c.fillStyle = i < 4 ? '#c8282d' : '#b9bec6'; c.fillRect(x - 6, y + (i % 3 === 0 ? 4 : 26), 12, 28);
      label(c, ['BCN', 'LAND', 'TAXI', 'NAV', 'STRB', 'PUMP', 'PITOT', 'AVN', 'MAST', 'ALT', 'FAN', 'HEAT'][i], x, y + 78, 12);
    }
    for (let i = 0; i < 18; i++) {
      c.fillStyle = '#0e0f12'; c.fillRect(800 + i * 36, 760, 26, 38);
      c.fillStyle = i % 5 === 0 ? '#c8282d' : '#e5e5e5'; c.fillRect(805 + i * 36, 750, 16, 18);
    }
    // placche
    c.fillStyle = '#c9ced6'; c.font = 'bold 26px Arial'; c.textAlign = 'left';
    c.fillText('VOLARE · I-VOLA', 1450, 780);
    c.fillStyle = '#8e95a0'; c.font = '16px Arial';
    c.fillText('MAX 1100 kg   Vne 163 kt   Vno 129 kt   Vfe 85 kt', 1450, 806);
  }
  drawBackground();

  // ---------------------------------------------------------------- strumenti dinamici
  // ogni quadrante ha un suo piccolo canvas, ridisegnato solo se il valore cambia in modo visibile
  const asiA = (kt) => 135 + (270 * Math.min(kt, 190)) / 190;
  const rpmA = (r) => 135 + (270 * r) / 3000;
  const DIALS = {
    asi: {
      sig: (f) => Math.round(f.ias * 1.5),
      draw(c, g, f) {
        arc(c, g.cx, g.cy, g.r - 10, asiA(47), asiA(110) - asiA(47), '#2fd06a', 9);
        arc(c, g.cx, g.cy, g.r - 20, asiA(40), asiA(85) - asiA(40), '#f2f2f2', 4);
        arc(c, g.cx, g.cy, g.r - 10, asiA(110), asiA(163) - asiA(110), '#ffd23a', 9);
        c.fillStyle = '#e03030'; c.save(); c.translate(g.cx, g.cy); c.rotate(rad(asiA(163))); c.fillRect(g.r - 26, -3, 18, 6); c.restore();
        ticks(c, g.cx, g.cy, g.r, 135, 270, 9, 1, (i) => (i * 20 + 20 <= 180 ? (i + 1) * 20 : ''), 18);
        label(c, 'KNOTS', g.cx, g.cy + 36, 13);
        needle(c, g.cx, g.cy, asiA(f.ias), g.r - 12);
      },
    },
    ai: {
      sig: (f) => Math.round(f.pitch * 150) + '|' + Math.round(f.bank * 150),
      draw(c, g, f) {
        c.save(); c.translate(g.cx, g.cy);
        c.beginPath(); c.arc(0, 0, g.r - 4, 0, Math.PI * 2); c.clip();
        c.rotate(-f.bank); c.translate(0, f.pitch * 210);
        c.fillStyle = '#3d8fd6'; c.fillRect(-300, -600, 600, 600);
        c.fillStyle = '#7a5a36'; c.fillRect(-300, 0, 600, 600);
        c.fillStyle = '#fff'; c.fillRect(-300, -1.5, 600, 3);
        c.strokeStyle = '#fff'; c.lineWidth = 2; c.font = '12px Arial'; c.fillStyle = '#fff'; c.textAlign = 'center';
        for (let d = -30; d <= 30; d += 5) {
          if (!d) continue;
          const y = -rad(d) * 210, hw = d % 10 === 0 ? 34 : 17;
          c.beginPath(); c.moveTo(-hw, y); c.lineTo(hw, y); c.stroke();
          if (d % 10 === 0) { c.fillText(Math.abs(d), -hw - 14, y + 4); c.fillText(Math.abs(d), hw + 14, y + 4); }
        }
        c.restore();
        c.strokeStyle = '#ffd23a'; c.lineWidth = 5;
        c.beginPath(); c.moveTo(g.cx - 62, g.cy); c.lineTo(g.cx - 20, g.cy); c.lineTo(g.cx - 20, g.cy + 11); c.moveTo(g.cx + 62, g.cy); c.lineTo(g.cx + 20, g.cy); c.lineTo(g.cx + 20, g.cy + 11); c.stroke();
        c.fillStyle = '#ffd23a'; c.fillRect(g.cx - 3, g.cy - 3, 6, 6);
      },
    },
    alt: {
      sig: (f) => Math.round(Math.max(0, f.altFt) / 4),
      draw(c, g, f) {
        ticks(c, g.cx, g.cy, g.r, -90, 360, 50, 5, (i) => (i / 5) % 10, 20);
        label(c, 'ALT ft', g.cx, g.cy + 36, 13);
        const alt = Math.max(0, f.altFt);
        needle(c, g.cx, g.cy, -90 + 360 * ((alt % 10000) / 10000), g.r - 46, '#ffd23a', 7);
        needle(c, g.cx, g.cy, -90 + 360 * ((alt % 1000) / 1000), g.r - 12);
      },
    },
    hdg: {
      sig: (f) => Math.round(f.heading * 3),
      draw(c, g, f) {
        c.save(); c.translate(g.cx, g.cy); c.rotate(-rad(f.heading));
        c.fillStyle = '#f2f2f2'; c.strokeStyle = '#f2f2f2'; c.font = 'bold 22px Arial'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineWidth = 3;
        for (let d = 0; d < 360; d += 10) {
          const a = rad(d - 90), big = d % 30 === 0;
          c.beginPath(); c.moveTo(Math.cos(a) * (g.r - 8), Math.sin(a) * (g.r - 8)); c.lineTo(Math.cos(a) * (g.r - (big ? 26 : 17)), Math.sin(a) * (g.r - (big ? 26 : 17))); c.stroke();
          if (big) { c.save(); c.translate(Math.cos(a) * (g.r - 44), Math.sin(a) * (g.r - 44)); c.rotate(rad(d)); c.fillText(d % 90 === 0 ? t('compass')[d / 90] : String(d / 10), 0, 0); c.restore(); }
        }
        c.restore();
        c.fillStyle = '#ffd23a'; c.beginPath(); c.moveTo(g.cx, g.cy - 22); c.lineTo(g.cx - 13, g.cy + 15); c.lineTo(g.cx, g.cy + 8); c.lineTo(g.cx + 13, g.cy + 15); c.fill();
        c.fillStyle = '#ff5a3a'; c.fillRect(g.cx - 3, g.cy - g.r + 2, 6, 20);
      },
    },
    vsi: {
      sig: (f) => Math.round(f.vsFpm / 25),
      draw(c, g, f) {
        c.save(); c.translate(g.cx, g.cy);
        c.strokeStyle = '#f2f2f2'; c.fillStyle = '#f2f2f2'; c.lineWidth = 3; c.font = 'bold 20px Arial'; c.textAlign = 'center'; c.textBaseline = 'middle';
        for (let v = -2000; v <= 2000; v += 250) {
          const a = rad(180 + (v / 2000) * 165), big = v % 500 === 0;
          c.beginPath(); c.moveTo(Math.cos(a) * (g.r - 8), Math.sin(a) * (g.r - 8)); c.lineTo(Math.cos(a) * (g.r - (big ? 24 : 16)), Math.sin(a) * (g.r - (big ? 24 : 16))); c.stroke();
          if (v % 1000 === 0 || v === 500 || v === -500 || v === 1500 || v === -1500) c.fillText(String(Math.abs(v) / 100), Math.cos(a) * (g.r - 42), Math.sin(a) * (g.r - 42));
        }
        c.restore();
        label(c, 'V/S x100 ft/min', g.cx, g.cy + 38, 12);
        needle(c, g.cx, g.cy, 180 + (Math.max(-2000, Math.min(2000, f.vsFpm)) / 2000) * 165, g.r - 12);
      },
    },
    rpm: {
      sig: (f) => Math.round(f.throttle * 80) + '|' + Math.round(f.flapDeg),
      draw(c, g, f) {
        arc(c, g.cx, g.cy, g.r - 12, rpmA(2100), rpmA(2700) - rpmA(2100), '#2fd06a', 10);
        arc(c, g.cx, g.cy, g.r - 12, rpmA(2700), rpmA(3000) - rpmA(2700), '#e03030', 10);
        ticks(c, g.cx, g.cy, g.r, 135, 270, 12, 2, (i) => i * 2.5, 20);
        label(c, 'RPM x100', g.cx, g.cy + 44, 14);
        needle(c, g.cx, g.cy, rpmA(700 + f.throttle * 2000), g.r - 14);
        led(c, g.cx - 62, g.cy + 62, 124, 30, 'FLAPS ' + String(Math.round(f.flapDeg)).padStart(2, '0') + '°', '#ffd23a');
      },
    },
  };
  const DIAL_PX = 256;
  const dials = GAUGES.filter((g) => DIALS[g.id]).map((g) => {
    const c = document.createElement('canvas');
    c.width = c.height = DIAL_PX;
    const dctx = c.getContext('2d');
    const dtex = new THREE.CanvasTexture(c);
    dtex.colorSpace = THREE.SRGBColorSpace;
    dtex.anisotropy = 4;
    const half = ((g.r + 4) / PW) * PANEL.w;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2 * half, 2 * half), new THREE.MeshBasicMaterial({ map: dtex, transparent: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    const [mx, my] = toM(g.cx, g.cy);
    mesh.position.set(mx, my, PANEL.z - 0.083 * (my - PANEL.y) + 0.0012);
    mesh.rotation.x = -0.083;
    group.add(mesh);
    return { g, dctx, dtex, mesh, sig: null, def: DIALS[g.id] };
  });
  function drawDials(f, force) {
    for (const d of dials) {
      const sig = d.def.sig(f);
      if (!force && sig === d.sig) continue;
      d.sig = sig;
      const c = d.dctx, k = (DIAL_PX / 2) / (d.g.r + 4);
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.clearRect(0, 0, DIAL_PX, DIAL_PX);
      c.setTransform(k, 0, 0, k, DIAL_PX / 2 - d.g.cx * k, DIAL_PX / 2 - d.g.cy * k);
      dialFace(c, d.g.cx, d.g.cy, d.g.r);
      d.def.draw(c, d.g, f);
      d.dtex.needsUpdate = true;
    }
  }

  // ---------------------------------------------------------------- volantini
  const yokes = [];
  const yokeCurve = new THREE.CatmullRomCurve3([
    [-0.19, 0.13], [-0.205, 0.05], [-0.16, -0.03], [-0.06, -0.055], [0.06, -0.055], [0.16, -0.03], [0.205, 0.05], [0.19, 0.13],
  ].map(([x, y]) => new THREE.Vector3(x, y, 0)));
  for (const sx of [-1, 1]) {
    const y = new THREE.Group();
    y.position.set(sx * 0.33, 0.06, -0.8);
    add(y, new THREE.TubeGeometry(yokeCurve, 48, 0.0125, 8), black);
    for (const gx of [-0.19, 0.19]) {
      const grip = add(y, new THREE.CylinderGeometry(0.02, 0.02, 0.085, 12), mat(0x151618, 0.5), gx, 0.115, 0);
    }
    add(y, new RoundedBoxGeometry(0.1, 0.07, 0.05, 2, 0.015), dark, 0, -0.04, 0);
    const shaft = add(y, new THREE.CylinderGeometry(0.022, 0.022, 0.42, 12).rotateX(Math.PI / 2), mat(0x8e949c, 0.3, 0.9), 0, -0.04, -0.21);
    group.add(y);
    yokes.push(y);
  }

  // ---------------------------------------------------------------- manetta, miscela, consolle
  const thrKnob = new THREE.Group();
  thrKnob.position.set(-0.04, -0.14, -0.98);
  add(thrKnob, new THREE.CylinderGeometry(0.008, 0.008, 0.22, 8).rotateX(Math.PI / 2), mat(0x777777, 0.3, 0.9), 0, 0, -0.11);
  add(thrKnob, new THREE.SphereGeometry(0.026, 14, 10), black, 0, 0, 0);
  group.add(thrKnob);
  const mix = new THREE.Group();
  mix.position.set(0.05, -0.14, -1.06);
  add(mix, new THREE.CylinderGeometry(0.008, 0.008, 0.16, 8).rotateX(Math.PI / 2), mat(0x777777, 0.3, 0.9), 0, 0, -0.08);
  add(mix, new THREE.SphereGeometry(0.026, 14, 10), mat(0xc8282d, 0.4), 0, 0, 0);
  group.add(mix);
  add(group, new RoundedBoxGeometry(0.2, 0.3, 0.55, 3, 0.03), dark, 0, -0.42, -0.45);
  const trim = add(group, new THREE.CylinderGeometry(0.07, 0.07, 0.025, 20).rotateZ(Math.PI / 2), grey, 0, -0.2, -0.3);
  add(group, new THREE.CylinderGeometry(0.014, 0.014, 0.1, 8), chrome, 0.04, -0.2, -0.6);

  // ---------------------------------------------------------------- sedili, pannelli porta, dettagli
  for (const sx of [-0.33, 0.33]) {
    add(group, new RoundedBoxGeometry(0.46, 0.12, 0.46, 3, 0.045), seatMat, sx, -0.28, 0.15);
    const back = add(group, new RoundedBoxGeometry(0.46, 0.62, 0.12, 3, 0.05), seatMat, sx, 0.06, 0.47);
    back.rotation.x = 0.14;
    add(group, new RoundedBoxGeometry(0.22, 0.22, 0.08, 3, 0.03), seatMat, sx, 0.5, 0.52).rotation.x = 0.14;
    add(group, new THREE.BoxGeometry(0.4, 0.02, 0.3), mat(0x15171b, 0.9), sx, -0.52, -0.88); // pedaliera
  }
  add(group, new RoundedBoxGeometry(1.02, 0.12, 0.44, 3, 0.045), seatMat, 0, -0.28, 1.17);
  add(group, new RoundedBoxGeometry(1.02, 0.5, 0.1, 3, 0.05), seatMat, 0, 0.03, 1.44).rotation.x = 0.12;
  for (const sx of [-1, 1]) {
    add(group, new RoundedBoxGeometry(0.035, 0.5, 1.45, 2, 0.012), mat(0x6a6e76, 0.8), sx * 0.575, -0.16, -0.2);
    add(group, new RoundedBoxGeometry(0.1, 0.05, 0.62, 2, 0.02), mat(0x555960, 0.8), sx * 0.54, 0.1, -0.2);
    add(group, new RoundedBoxGeometry(0.04, 0.04, 0.14, 2, 0.015), chrome, sx * 0.555, 0.0, -0.62);
    add(group, new RoundedBoxGeometry(0.3, 0.02, 0.2, 1, 0.005), black, sx * 0.3, 0.93, -0.9); // aletta parasole
  }
  const compass = add(group, new THREE.CylinderGeometry(0.028, 0.03, 0.03, 16), black, 0.02, 0.9, -1.0);

  group.traverse((o) => { if (o.isMesh) o.castShadow = false; });

  // luce d'ambiente dell'abitacolo (spenta fuori dalla vista cockpit)
  const cabinLight = new THREE.PointLight(0xfff2e0, 0, 4.5, 1.4);
  cabinLight.position.set(0, 0.75, 0.1);
  group.add(cabinLight);

  let frame = 0, active = false;
  ctx.drawImage(bg, 0, 0);
  tex.needsUpdate = true;
  drawDials({ ias: 0, bank: 0, pitch: 0, altFt: 0, throttle: 0, flapDeg: 0, heading: 0, vsFpm: 0 }, true);

  return {
    group,
    setActive(v) { active = v; cabinLight.intensity = v ? 1.4 : 0; },
    update(f) {
      for (const y of yokes) { y.position.z = -0.8 + 0.09 * f.input.pitch; y.rotation.z = -0.9 * f.input.roll; }
      thrKnob.position.z = -0.98 - 0.09 * f.throttle;
      if (active && (frame++ % 2) === 0) drawDials(f, false);
    },
  };
}
