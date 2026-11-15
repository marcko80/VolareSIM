import * as THREE from 'three';

/**
 * Cockpit 3D rudimentale: cruscotto con strumenti disegnati su canvas
 * (anemometro, orizzonte, altimetro, giri, bussola, variometro), volantino
 * che segue i comandi e leva della manetta.
 */
export const EYE = new THREE.Vector3(-0.3, 0.52, -0.12);

export function createCockpit() {
  const group = new THREE.Group();
  group.visible = false;

  const mat = (c) => new THREE.MeshLambertMaterial({ color: c });
  const dark = mat(0x23262b), mid = mat(0x4b4f57), light = mat(0x7b7f88), seat = mat(0x3a3f4a);
  const box = (w, h, d, m, x, y, z) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    b.position.set(x, y, z);
    group.add(b);
    return b;
  };

  // scocca interna
  box(1.0, 0.04, 2.0, dark, 0, -0.45, 0.2);            // pavimento
  box(0.05, 0.62, 2.0, mid, -0.56, -0.1, 0.2);         // fianco sx
  box(0.05, 0.62, 2.0, mid, 0.56, -0.1, 0.2);          // fianco dx
  box(1.22, 0.06, 1.5, mid, 0, 0.9, 0.25);             // tetto
  box(1.1, 0.46, 0.22, dark, 0, 0.14, -1.13);          // cruscotto
  box(1.08, 0.04, 0.12, dark, 0, 0.39, -1.08);         // frontalino antiriflesso
  // montanti parabrezza (inclinati all'indietro)
  for (const s of [-1, 1]) {
    const p = box(0.06, 0.62, 0.06, mid, s * 0.52, 0.66, -1.0);
    p.rotation.x = 0.28;
  }
  const top = box(1.1, 0.05, 0.08, mid, 0, 0.9, -0.86);   // traversa superiore
  top.rotation.x = 0;
  const mid_post = box(0.04, 0.5, 0.04, mid, 0, 0.64, -1.02);
  mid_post.rotation.x = 0.28;
  // montanti porta
  for (const s of [-1, 1]) box(0.05, 0.6, 0.06, mid, s * 0.57, 0.6, 0.55);
  // sedili
  for (const s of [-0.3, 0.3]) {
    box(0.42, 0.09, 0.42, seat, s, -0.26, 0.2);
    box(0.42, 0.5, 0.09, seat, s, -0.02, 0.45);
    box(0.28, 0.12, 0.08, seat, s, 0.28, 0.45);
  }
  // consolle centrale
  box(0.14, 0.14, 0.6, dark, 0, -0.32, -0.6);

  // pannello strumenti (canvas)
  const cv = document.createElement('canvas');
  cv.width = 1024; cv.height = 400;
  const ctx = cv.getContext('2d');
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const panel = new THREE.Mesh(
    new THREE.PlaneGeometry(0.98, 0.382),
    new THREE.MeshBasicMaterial({ map: tex })
  );
  panel.position.set(0, 0.17, -0.97);
  panel.rotation.x = -0.28;
  group.add(panel);
  box(0.98, 0.03, 0.12, dark, 0, -0.025, -0.97); // mensola sotto il pannello inclinato

  // volantino
  const yoke = new THREE.Group();
  yoke.position.set(EYE.x, 0.08, -0.78);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.5, 8).rotateX(Math.PI / 2), light);
  shaft.position.z = -0.25;
  yoke.add(shaft);
  const hub = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), dark);
  yoke.add(hub);
  const grip = (x, y, w, h) => {
    const g = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.035), dark);
    g.position.set(x, y, 0);
    yoke.add(g);
  };
  grip(0, 0.0, 0.34, 0.03);      // traversa
  grip(-0.17, 0.09, 0.035, 0.2); // impugnatura sx
  grip(0.17, 0.09, 0.035, 0.2);  // impugnatura dx
  grip(0, -0.07, 0.03, 0.12);    // piantone
  group.add(yoke);

  // manetta
  const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.12, 10).rotateX(Math.PI / 2), mat(0x1d1d1f));
  knob.position.set(0.12, -0.04, -0.95);
  group.add(knob);
  const knobTip = new THREE.Mesh(new THREE.SphereGeometry(0.04, 10, 8), mat(0xc8282d));
  knobTip.position.set(0, 0, 0.07);
  knob.add(knobTip);

  let frame = 0;

  function update(f) {
    // volantino
    yoke.position.z = -0.78 + 0.1 * f.input.pitch;
    yoke.rotation.z = -0.9 * f.input.roll;
    knob.position.z = -0.95 + 0.1 * (1 - f.throttle);
    if ((frame++ & 1) === 0) { drawPanel(f); tex.needsUpdate = true; }
  }

  // --- disegno strumenti
  const R = 92;
  function dial(cx, cy, label) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = '#0b0b0d';
    ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#555a62'; ctx.lineWidth = 6; ctx.stroke();
    ctx.restore();
    ctx.fillStyle = '#9aa3ad'; ctx.font = '13px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(label, cx, cy + R + 16);
  }
  const rad = (d) => (d * Math.PI) / 180;
  function ticks(cx, cy, from, sweep, count, numEvery, valueFn, fontPx = 16) {
    ctx.save(); ctx.translate(cx, cy);
    ctx.strokeStyle = '#fff'; ctx.fillStyle = '#fff'; ctx.lineWidth = 2;
    ctx.font = `bold ${fontPx}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let i = 0; i <= count; i++) {
      const a = rad(from + (sweep * i) / count);
      const big = i % numEvery === 0;
      const r1 = R - 8, r2 = R - (big ? 24 : 16);
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * r1, Math.sin(a) * r1);
      ctx.lineTo(Math.cos(a) * r2, Math.sin(a) * r2);
      ctx.stroke();
      if (big) ctx.fillText(valueFn(i), Math.cos(a) * (R - 40), Math.sin(a) * (R - 40));
    }
    ctx.restore();
  }
  function arc(cx, cy, from, sweep, color, r = R - 12, w = 6) {
    ctx.save(); ctx.translate(cx, cy);
    ctx.strokeStyle = color; ctx.lineWidth = w;
    ctx.beginPath(); ctx.arc(0, 0, r, rad(from), rad(from + sweep)); ctx.stroke();
    ctx.restore();
  }
  function needle(cx, cy, angDeg, len, color = '#fff', w = 4) {
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(rad(angDeg));
    ctx.strokeStyle = color; ctx.lineWidth = w; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-14, 0); ctx.lineTo(len, 0); ctx.stroke();
    ctx.fillStyle = '#222'; ctx.beginPath(); ctx.arc(0, 0, 6, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function drawPanel(f) {
    ctx.fillStyle = '#17191d';
    ctx.fillRect(0, 0, 1024, 400);
    const cols = [190, 512, 834], rows = [105, 295];

    // anemometro (kt): 0-160 su 270°
    let [cx, cy] = [cols[0], rows[0]];
    dial(cx, cy, 'ANEMOMETRO kt');
    const asiA = (kt) => 135 + 270 * Math.min(kt, 165) / 165;
    arc(cx, cy, asiA(47), asiA(110) - asiA(47), '#2fd06a');
    arc(cx, cy, asiA(47), asiA(85) - asiA(47), '#fff', R - 20, 3);
    arc(cx, cy, asiA(110), asiA(160) - asiA(110), '#ffd23a');
    ticks(cx, cy, 135, 270, 8, 2, (i) => i * 20);
    needle(cx, cy, asiA(f.ias), R - 18);

    // orizzonte artificiale
    [cx, cy] = [cols[1], rows[0]];
    dial(cx, cy, 'ORIZZONTE');
    ctx.save();
    ctx.translate(cx, cy);
    ctx.beginPath(); ctx.arc(0, 0, R - 5, 0, Math.PI * 2); ctx.clip();
    ctx.rotate(-f.bank);
    ctx.translate(0, f.pitch * 190);
    ctx.fillStyle = '#3d8fd6'; ctx.fillRect(-200, -400, 400, 400);
    ctx.fillStyle = '#7a5a36'; ctx.fillRect(-200, 0, 400, 400);
    ctx.fillStyle = '#fff'; ctx.fillRect(-200, -1.5, 400, 3);
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
    for (let d = -20; d <= 20; d += 10) {
      if (!d) continue;
      const y = -rad(d) * 190, hw = 28;
      ctx.beginPath(); ctx.moveTo(-hw, y); ctx.lineTo(hw, y); ctx.stroke();
    }
    ctx.restore();
    ctx.strokeStyle = '#ffd23a'; ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(cx - 55, cy); ctx.lineTo(cx - 18, cy); ctx.lineTo(cx - 18, cy + 9);
    ctx.moveTo(cx + 55, cy); ctx.lineTo(cx + 18, cy); ctx.lineTo(cx + 18, cy + 9);
    ctx.stroke();

    // altimetro
    [cx, cy] = [cols[2], rows[0]];
    dial(cx, cy, 'ALTIMETRO ft');
    ticks(cx, cy, -90, 360, 50, 5, (i) => (i / 5) % 10, 18);
    const alt = Math.max(0, f.altFt);
    needle(cx, cy, -90 + 360 * ((alt % 1000) / 1000), R - 18);
    needle(cx, cy, -90 + 360 * ((alt % 10000) / 10000), R - 50, '#ffd23a', 6);

    // giri motore
    [cx, cy] = [cols[0], rows[1]];
    dial(cx, cy, 'GIRI x100');
    const rpm = 700 + f.throttle * 2000;
    const rpmA = (r) => 135 + 270 * r / 3000;
    arc(cx, cy, rpmA(2100), rpmA(2700) - rpmA(2100), '#2fd06a');
    arc(cx, cy, rpmA(2700), rpmA(3000) - rpmA(2700), '#e03030');
    ticks(cx, cy, 135, 270, 6, 1, (i) => i * 5);
    needle(cx, cy, rpmA(rpm), R - 18);
    ctx.fillStyle = '#9fe8b4'; ctx.font = 'bold 16px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('FLAP ' + Math.round(f.flapDeg) + '°', cx, cy + 40);

    // bussola
    [cx, cy] = [cols[1], rows[1]];
    dial(cx, cy, 'PRUA');
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(-rad(f.heading));
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#fff'; ctx.font = 'bold 20px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineWidth = 2;
    for (let d = 0; d < 360; d += 10) {
      const a = rad(d - 90), big = d % 30 === 0;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * (R - 8), Math.sin(a) * (R - 8));
      ctx.lineTo(Math.cos(a) * (R - (big ? 24 : 16)), Math.sin(a) * (R - (big ? 24 : 16)));
      ctx.stroke();
      if (big) {
        ctx.save(); ctx.translate(Math.cos(a) * (R - 40), Math.sin(a) * (R - 40)); ctx.rotate(rad(d));
        ctx.fillText(d % 90 === 0 ? 'NESO'[d / 90] : String(d / 10), 0, 0); ctx.restore();
      }
    }
    ctx.restore();
    ctx.fillStyle = '#ffd23a';
    ctx.beginPath(); ctx.moveTo(cx, cy - 18); ctx.lineTo(cx - 10, cy + 12); ctx.lineTo(cx, cy + 6); ctx.lineTo(cx + 10, cy + 12); ctx.fill();
    ctx.fillStyle = '#ff5a3a'; ctx.fillRect(cx - 2, cy - R + 2, 4, 16);

    // variometro
    [cx, cy] = [cols[2], rows[1]];
    dial(cx, cy, 'V/S ft/min');
    const vs = Math.max(-2000, Math.min(2000, f.vsFpm));
    ctx.save(); ctx.translate(cx, cy);
    ctx.strokeStyle = '#fff'; ctx.fillStyle = '#fff'; ctx.lineWidth = 2;
    ctx.font = 'bold 16px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let v = -2000; v <= 2000; v += 500) {
      const a = rad(180 + (v / 2000) * 160);
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * (R - 8), Math.sin(a) * (R - 8));
      ctx.lineTo(Math.cos(a) * (R - 22), Math.sin(a) * (R - 22));
      ctx.stroke();
      if (v % 1000 === 0) ctx.fillText(Math.abs(v) / 1000 * 10, Math.cos(a) * (R - 40), Math.sin(a) * (R - 40));
    }
    ctx.restore();
    needle(cx, cy, 180 + (vs / 2000) * 160, R - 18);
  }

  drawPanel({ ias: 0, bank: 0, pitch: 0, altFt: 0, throttle: 0, flapDeg: 0, heading: 0, vsFpm: 0 });
  tex.needsUpdate = true;

  return { group, update };
}
