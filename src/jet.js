import * as THREE from 'three';
import { liftingSurface, tubeBetween } from './geometry.js';
import { loftBody, makeWheel, createSimpleCockpit } from './airframe.js';
import { pbr, skinDetail } from './materials.js';
import { canvasTex, decal, flagTexture, regTexture } from './decals.js';

/**
 * Aermacchi MB-339 in livrea Frecce Tricolori (blu con tricolore), procedurale.
 * Avanti = −Z, su = +Y, destra = +X. Lunghezza 11 m, apertura 10,9 m con serbatoi di estremità.
 */
const BLUE = 0x0b2c75;

function tricoloreTail() {
  return canvasTex(256, 512, (g, w, h) => {
    ['#009246', '#ffffff', '#ce2b37'].forEach((c, i) => { g.fillStyle = c; g.fillRect(0, (h / 3) * i, w, h / 3 + 1); });
  });
}

/** fusoliera: blu scuro, ventre grigio chiaro, fascia bianca sul fianco con filetti verde e rosso (come sulle foto del PAN) */
function jetFuselageTexture() {
  const W = 4096, H = 1024;
  return canvasTex(W, H, (g) => {
    g.fillStyle = '#0a2266'; g.fillRect(0, 0, W, H);
    const Y = (v) => (1 - v) * H;
    // ventre
    const grd = g.createLinearGradient(0, Y(0.2), 0, Y(0.15));
    g.fillStyle = '#cdd2da';
    g.fillRect(0, Y(0.16), W, H * 0.16); g.fillRect(0, 0, W, 0);
    g.fillRect(0, Y(1), W, H * 0.16);
    for (let x = 0; x < W; x += 2) {
      const u = x / W;
      const vc = 0.235 + 0.06 * Math.pow(u, 1.4) - 0.03 * Math.max(0, 0.12 - u) * 8;   // la fascia sale verso la coda
      const hw = u < 0.05 ? 0.005 + u * 0.8 : 0.045 - 0.02 * Math.max(0, (u - 0.6) / 0.4);
      for (const side of [0, 1]) {
        const f = (v) => Y(side ? 1 - v : v);
        const band = (v0, v1, col) => { g.fillStyle = col; const a = f(v0), b = f(v1); g.fillRect(x, Math.min(a, b), 2.5, Math.abs(b - a) + 0.5); };
        band(vc - hw, vc + hw, '#f1f2f0');
        band(vc + hw + 0.008, vc + hw + 0.02, '#008c45');
        band(vc - hw - 0.02, vc - hw - 0.008, '#cd212a');
      }
    }
  });
}
function jetWingTexture() {
  return canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#0a2266'; g.fillRect(0, 0, w, h);                       // dorso (v < 0,5 → metà bassa della canvas)
    g.fillStyle = '#d3d7de'; g.fillRect(0, 0, w, h / 2);                   // ventre grigio chiaro
    g.fillStyle = '#f1f2f0'; g.fillRect(0, h * 0.5 - 3, w, 6);
  });
}
function noseArrows() {
  return canvasTex(256, 256, (g) => {
    g.translate(128, 140);
    const arrow = (dx, rot, col) => { g.save(); g.translate(dx, 0); g.rotate(rot); g.fillStyle = col; g.beginPath(); g.moveTo(0, -100); g.lineTo(26, 70); g.lineTo(0, 46); g.lineTo(-26, 70); g.closePath(); g.fill(); g.restore(); };
    arrow(-48, -0.22, '#009246'); arrow(48, 0.22, '#ce2b37'); arrow(0, 0, '#f4f4f0');
  });
}
function numberTexture(txt) {
  return canvasTex(256, 256, (g) => {
    g.font = 'bold 230px "Arial Narrow", Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 8; g.strokeStyle = '#0a2266'; g.strokeText(txt, 128, 136);
    g.fillStyle = '#f2c500'; g.fillText(txt, 128, 136);
  });
}
function finTextTexture() {
  return canvasTex(1024, 128, (g, w, h) => {
    g.font = 'italic 600 78px Georgia, "Times New Roman", serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#f2c500'; g.fillText('Frecce Tricolori', w / 2, h / 2);
  });
}

export function createMB339() {
  const group = new THREE.Group();
  const paint = (color, extra = {}) => new THREE.MeshPhysicalMaterial({ color, roughness: 0.3, metalness: 0.28, clearcoat: 1, clearcoatRoughness: 0.06, ...extra });
  const blue = skinDetail(paint(BLUE), { seed: 3, panel: [0.7, 0.5], chips: 0.15, grime: 0.4 });
  const fusSkin = skinDetail(paint(0xffffff, { map: jetFuselageTexture() }), { seed: 3, panel: [0.7, 0.5], chips: 0.1, grime: 0.4 });
  const blueWing = skinDetail(paint(0xffffff, { map: jetWingTexture() }), { seed: 6, panel: [0.8, 0.5], chips: 0.1, grime: 0.45 });
  const tankMat = skinDetail(paint(0xffffff, { vertexColors: true }), { seed: 7, panel: [1.0, 0.6], chips: 0.1, grime: 0.3 });
  const white = skinDetail(paint(0xe8e8e4), { seed: 5, chips: 0.2, grime: 0.5 });
  const steel = pbr('metal', { repeat: 1, repeatY: 3, color: 0xcfd3d9, metalness: 1, roughness: 0.9, normalScale: 0.6 });
  const darkMetal = pbr('metal', { repeat: 1, repeatY: 2, color: 0x3d4047, metalness: 0.9, roughness: 0.9, normalScale: 0.5 });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x151517, roughness: 0.95 });
  const black = new THREE.MeshStandardMaterial({ color: 0x08080a, roughness: 0.5 });
  const burn = new THREE.MeshStandardMaterial({ color: 0x6a5a50, roughness: 0.45, metalness: 0.85 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x1b2f3a, roughness: 0.03, metalness: 0.2, transparent: true, opacity: 0.45, depthWrite: false, envMapIntensity: 1.4 });

  const add = (parent, obj, mat, x = 0, y = 0, z = 0) => {
    const m = obj.isObject3D ? obj : new THREE.Mesh(obj, mat);
    m.position.x += x; m.position.y += y; m.position.z += z;
    m.castShadow = true; m.receiveShadow = true;
    parent.add(m);
    return m;
  };

  // ---------------------------------------------------------------- fusoliera
  const fusKeys = [
    [-5.2, 0.03, 0.04, -0.12, 2.0],
    [-5.1, 0.17, 0.2, -0.30, 2.0],
    [-4.6, 0.36, 0.38, -0.58, 2.1],
    [-3.7, 0.52, 0.52, -0.80, 2.3],
    [-2.6, 0.60, 0.58, -0.86, 2.6],
    [-1.2, 0.64, 0.60, -0.88, 3.0],
    [0.4, 0.64, 0.56, -0.86, 3.0],
    [1.8, 0.57, 0.46, -0.74, 2.7],
    [3.2, 0.46, 0.36, -0.56, 2.4],
    [4.6, 0.38, 0.26, -0.38, 2.2],
    [5.5, 0.34, 0.20, -0.28, 2.1],
    [5.9, 0.31, 0.18, -0.25, 2.0],
  ];
  const fusMesh = add(group, loftBody(fusKeys, { rings: 200, seg: 96 }), fusSkin);
  // ugello
  add(group, new THREE.CylinderGeometry(0.26, 0.31, 0.5, 24, 1, true).rotateX(Math.PI / 2), burn, 0, -0.03, 5.95).material.side = THREE.DoubleSide;
  add(group, new THREE.CircleGeometry(0.25, 20), black, 0, -0.03, 5.74);
  // dorso (carenatura dietro l'abitacolo)
  add(group, new THREE.SphereGeometry(1, 20, 12), blue, 0, 0.42, 0.3).scale.set(0.34, 0.2, 1.7);
  // prese d'aria laterali
  for (const s of [-1, 1]) {
    const intake = add(group, new THREE.BoxGeometry(0.2, 0.46, 1.0), blue, s * 0.62, -0.1, -1.35);
    intake.rotation.y = s * 0.05;
    add(group, new THREE.BoxGeometry(0.05, 0.36, 0.08), black, s * 0.67, -0.1, -1.86);
    add(group, new THREE.PlaneGeometry(0.34, 0.4), black, s * 0.52, -0.1, -1.89).rotation.y = s > 0 ? Math.PI / 2 : -Math.PI / 2;
  }
  // sonda di Pitot e prese
  add(group, tubeBetween([0, 0.0, -5.2], [0, -0.01, -5.95], 0.018, 0.006, steel, 8));
  // aerofreno ventrale
  const airbrake = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.03, 0.9), blue);
  airbrake.geometry.translate(0, 0, -0.45);
  airbrake.position.set(0, -0.72, 2.0);
  airbrake.castShadow = true;
  group.add(airbrake);

  // ---------------------------------------------------------------- abitacolo
  const canopy = new THREE.Mesh(loftBody([
    [-4.1, 0.05, 0.5, 0.3, 2.2], [-3.75, 0.27, 0.78, 0.3, 2.2], [-3.2, 0.4, 0.96, 0.3, 2.3], [-2.5, 0.45, 1.02, 0.3, 2.4],
    [-1.9, 0.46, 1.0, 0.3, 2.4], [-1.35, 0.46, 1.1, 0.3, 2.4], [-0.7, 0.44, 1.0, 0.3, 2.3], [-0.3, 0.32, 0.8, 0.3, 2.2], [-0.05, 0.06, 0.58, 0.3, 2.0],
  ], { rings: 90, seg: 56 }), glassMat);
  canopy.renderOrder = 2;
  group.add(canopy);
  const rail = new THREE.MeshStandardMaterial({ color: 0x1b1d21, roughness: 0.5 });
  for (const [z, w, h] of [[-3.55, 0.3, 0.55], [-1.72, 0.46, 0.7], [-0.62, 0.42, 0.72]]) {
    const arch = new THREE.Mesh(new THREE.TorusGeometry(1, 0.018, 6, 40, Math.PI), rail);
    arch.scale.set(w, h, 1); arch.position.set(0, 0.45, z); group.add(arch);
  }
  // due sedili con piloti
  const seatMat = pbr('leather', { repeat: 1.8, color: 0x35373c, normalScale: 1 });
  const helmet = new THREE.MeshStandardMaterial({ color: 0xf2f2ee, roughness: 0.35 });
  const visor = new THREE.MeshStandardMaterial({ color: 0x1a1a1c, roughness: 0.1, metalness: 0.6 });
  for (const sz of [-2.45, -1.2]) {
    add(group, new THREE.BoxGeometry(0.46, 0.12, 0.5), seatMat, 0, -0.1, sz);
    add(group, new THREE.BoxGeometry(0.46, 0.6, 0.1), seatMat, 0, 0.2, sz + 0.28).rotation.x = -0.12;
    const body = add(group, new THREE.SphereGeometry(0.2, 14, 10), blue, 0, 0.18, sz + 0.1); body.scale.set(1, 1.3, 0.8);
    const head = add(group, new THREE.SphereGeometry(0.115, 16, 12), helmet, 0, 0.6, sz + 0.1);
    add(head, new THREE.SphereGeometry(0.1, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), visor, 0, 0, -0.04).rotation.x = 0.5;
  }

  // ---------------------------------------------------------------- ala
  const Y0 = -0.28, HALF = 4.9, TE = 0.55;
  const wingPlan = (s) => ({ zTE: TE + 0.18 * (s / HALF), chord: 2.6 - 1.4 * (s / HALF), y: Y0 + 0.03 * s, thick: 1 - 0.18 * (s / HALF) });
  const naca = [0.1, 0.012, 0.4];
  const parts = {}, wingMesh = {};
  for (const side of [-1, 1]) {
    const mk = (piece, s0, s1, extra = {}) => liftingSurface({ planform: wingPlan, s0, s1, steps: Math.max(2, Math.round((s1 - s0) * 2.4)), naca, piece, hinge: 0.5, side, n: 22, ...extra });
    wingMesh[side] = add(group, mk('main', 0, HALF).geometry, blueWing);
    add(group, mk('te', 0, 0.62).geometry, blueWing);
    add(group, mk('te', 4.7, HALF).geometry, blueWing);
    for (const [name, s0, s1] of [['flap', 0.7, 2.35], ['ail', 2.45, 4.62]]) {
      const part = mk('te', s0, s1, { pivotize: true });
      const pg = new THREE.Group();
      pg.position.copy(part.pivot);
      group.add(pg);
      add(pg, part.geometry, blueWing);
      parts[name + side] = pg;
    }
    // serbatoio di estremità
    const tx = side * (HALF + 0.15), ty = Y0 + 0.03 * HALF - 0.12;
    const tg = new THREE.CapsuleGeometry(0.2, 2.5, 12, 28).rotateX(Math.PI / 2);
    const tp = tg.attributes.position, tc = [];
    for (let i = 0; i < tp.count; i++) { const up = tp.getY(i) > -0.02; tc.push(up ? 0.04 : 0.8, up ? 0.13 : 0.82, up ? 0.4 : 0.85); }
    tg.setAttribute('color', new THREE.Float32BufferAttribute(tc, 3));
    const tank = new THREE.Mesh(tg, tankMat);
    tank.position.set(tx, ty, -0.35);
    tank.scale.set(1, 1, 1);
    tank.castShadow = tank.receiveShadow = true;
    group.add(tank);
    // luci di navigazione
    const nav = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), new THREE.MeshStandardMaterial({
      color: side < 0 ? 0xff2020 : 0x20ff50, emissive: side < 0 ? 0xff1010 : 0x10ff40, emissiveIntensity: 3,
    }));
    nav.position.set(side * (HALF + 0.38), ty + 0.1, -0.35);
    group.add(nav);
    const strobe = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 6 }));
    strobe.position.set(side * (HALF + 0.35), ty + 0.2, 1.1);
    group.add(strobe);
    parts['strobe' + side] = strobe;
  }

  // ---------------------------------------------------------------- coda
  const stabPlan = (s) => ({ zTE: 5.55 + 0.1 * s, chord: 1.55 - 0.8 * (s / 2.0), y: 0.0 + 0.02 * s });
  const elev = {};
  for (const side of [-1, 1]) {
    const mk = (piece, extra = {}) => liftingSurface({ planform: stabPlan, s0: 0, s1: 2.0, steps: 6, naca: [0.08, 0, 0], piece, hinge: 0.45, side, n: 16, tip: 0.08, ...extra });
    add(group, mk('main').geometry, blue);
    const part = mk('te', { pivotize: true });
    const pg = new THREE.Group();
    pg.position.copy(part.pivot);
    group.add(pg);
    add(pg, part.geometry, blue);
    elev[side] = pg;
  }
  const finG = new THREE.Group();
  finG.position.set(0, 0.15, 0);
  finG.rotation.z = Math.PI / 2;
  group.add(finG);
  const finPlan = (s) => ({ zTE: 5.75, chord: 2.5 - 1.3 * (s / 2.0), y: 0, thick: 1 });
  const finOpts = { planform: finPlan, s0: 0, s1: 2.0, steps: 8, naca: [0.09, 0, 0], hinge: 0.55, n: 16, tip: 0.1 };
  const finMesh = add(finG, liftingSurface({ ...finOpts, piece: 'main' }).geometry, blue);
  const rudPart = liftingSurface({ ...finOpts, piece: 'te', pivotize: true });
  const rudG = new THREE.Group();
  rudG.position.copy(rudPart.pivot);
  finG.add(rudG);
  add(rudG, rudPart.geometry, blue);
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), new THREE.MeshStandardMaterial({ color: 0xff3020, emissive: 0xff2010, emissiveIntensity: 4 }));
  beacon.position.set(0, 2.18, 5.2);
  group.add(beacon);

  // ---------------------------------------------------------------- carrello (si ritrae in volo)
  const gear = new THREE.Group();
  group.add(gear);
  const gnose = new THREE.Group();
  gnose.position.set(0, -0.4, -4.55);
  add(gnose, tubeBetween([0, 0, 0], [0, -0.82, -0.12], 0.05, 0.04, steel, 10));
  add(gnose, makeWheel(0.23, 0.17, rubber, steel), null, 0, -0.9, -0.12);
  gear.add(gnose);
  for (const s of [-1, 1]) {
    const gm = new THREE.Group();
    gm.position.set(s * 0.55, -0.55, 0.6);
    add(gm, tubeBetween([0, 0, 0], [s * 0.6, -0.78, 0], 0.06, 0.045, steel, 10));
    add(gm, makeWheel(0.31, 0.2, rubber, steel), null, s * 0.6, -0.72, 0);
    add(gm, new THREE.BoxGeometry(0.05, 0.62, 0.7), blue, s * 0.2, -0.05, 0).rotation.z = s * 0.2;
    gear.add(gm);
  }

  // ---------------------------------------------------------------- livrea (adesivi)
  group.updateMatrixWorld(true);
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const arrows = noseArrows(), num = numberTexture('1'), ftext = finTextTexture(), tail = tricoloreTail(), serial = regTexture('MM54482');
  decal(group, fusMesh, arrows, V(0, 0.2, -4.78), V(0, 0.85, -0.5).normalize(), V(0, 0, -1), [0.5, 0.5, 0.6], { mirror: false });
  for (const s of [-1, 1]) {
    decal(group, finMesh, num, V(0, 1.2, 4.85), V(s, 0, 0), V(0, 1, 0), [0.62, 0.62, 0.5], { mirror: false });
    decal(group, finMesh, ftext, V(0, 0.78, 5.0), V(s, 0, 0), V(0, 1, 0), [1.0, 0.125, 0.5], { mirror: false, order: 0 });
    decal(group, finMesh, tail, V(0, 0.42, 5.4), V(s, 0, 0), V(0, 1, 0), [0.14, 0.5, 0.5], { mirror: false, order: 0 });
    decal(group, fusMesh, serial, V(s * 0.33, 0.0, 5.0), V(s, 0, 0), V(0, 1, 0), [0.8, 0.2, 0.5], { mirror: false, order: 0 });
  }

  group.traverse((o) => { if (o.isMesh) o.receiveShadow = true; });
  canopy.castShadow = false;

  const cockpit = createSimpleCockpit({ z: -3.12, y: 0.56, w: 0.74, h: 0.28, tilt: -0.5, stickZ: -2.35, stickY: -0.42, jet: true });
  group.add(cockpit.group);
  const eye = new THREE.Vector3(0, 0.74, -2.35);

  /** ctrl: { pitch, roll, rudder, flapDeg, time, brakeExt, gearOut } */
  function animate(ctrl) {
    parts['ail-1'].rotation.x = 0.4 * ctrl.roll;
    parts['ail1'].rotation.x = -0.4 * ctrl.roll;
    elev[-1].rotation.x = elev[1].rotation.x = -0.4 * ctrl.pitch;
    rudG.rotation.x = -0.4 * ctrl.rudder;
    const fr = (ctrl.flapDeg * Math.PI) / 180 * 1.6;
    parts['flap-1'].rotation.x = parts['flap1'].rotation.x = fr;
    airbrake.rotation.x = -1.0 * (ctrl.brakeExt || 0);
    gear.visible = ctrl.gearOut > 0.02;
    gear.scale.setScalar(0.35 + 0.65 * ctrl.gearOut);
    parts['strobe-1'].visible = parts['strobe1'].visible = (ctrl.time % 1.2) < 0.08 || ((ctrl.time + 0.25) % 1.2) < 0.06;
    beacon.visible = (ctrl.time % 1.0) < 0.15;
  }
  return { group, animate, cockpit, eye, prop: null };
}
