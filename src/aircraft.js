import * as THREE from 'three';
import { buildFuselage, liftingSurface, tubeBetween } from './geometry.js';
import { getFuselageTextures, stripeTable } from './livery.js';
import { pbr, skinDetail, acTex } from './materials.js';
import { addLivery } from './decals.js';

/**
 * Cessna 172 procedurale. Convenzione: avanti = -Z, su = +Y, destra = +X, origine = baricentro.
 * Fusoliera loftata con finestrini ad alfa (aperture reali), guscio interno, ala con profilo NACA 2412,
 * superfici mobili cernierate, carrello con carenature, elica svergolata.
 */
export function createCessna() {
  const tex = getFuselageTextures();
  const group = new THREE.Group();

  // ---------------------------------------------------------------- materiali
  const paint = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.3, metalness: 0.12, ...extra });
  const white = skinDetail(paint(0xe6e6e2), { seed: 1, chips: 0.55, grime: 0.75 });
  const red = skinDetail(paint(0xbe2028), { seed: 4, panel: [0.5, 0.4], chips: 0.4, grime: 0.6 });
  const steel = pbr('metal', { repeat: 1, repeatY: 3, color: 0xcfd3d9, metalness: 1, roughness: 0.9, normalScale: 0.6 });
  const darkMetal = pbr('metal', { repeat: 1, repeatY: 2, color: 0x4a4d54, metalness: 0.9, roughness: 0.9, normalScale: 0.5 });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x151517, roughness: 0.95, metalness: 0 });
  const black = new THREE.MeshStandardMaterial({ color: 0x0b0b0c, roughness: 0.6 });

  const skinMat = new THREE.MeshStandardMaterial({
    map: tex.skin, alphaMap: tex.mask, alphaTest: 0.5, alphaToCoverage: true,
    roughness: 0.28, metalness: 0.1,
  });
  skinDetail(skinMat, { seed: 2, panel: [0.8, 0.55], chips: 0, grime: 0.7, stripe: stripeTable() });
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x16303a, roughness: 0.04, metalness: 0, transparent: true, opacity: 0.22,
    alphaMap: tex.glass, depthWrite: false, side: THREE.DoubleSide, envMapIntensity: 0.9,
  });
  const shellMat = new THREE.MeshStandardMaterial({
    map: tex.interior, alphaMap: tex.mask, alphaTest: 0.5, alphaToCoverage: true, side: THREE.BackSide, roughness: 0.92, envMapIntensity: 1.0,
  });
  shellMat.normalMap = acTex('fabric_n', 26, 11); shellMat.normalScale.set(0.7, 0.7);   // trama del rivestimento interno

  const add = (parent, obj, mat, x = 0, y = 0, z = 0) => {
    const m = obj.isObject3D ? obj : new THREE.Mesh(obj, mat);
    m.position.x += x; m.position.y += y; m.position.z += z;
    m.castShadow = true; m.receiveShadow = true;
    parent.add(m);
    return m;
  };

  // ---------------------------------------------------------------- fusoliera
  const fusGeo = buildFuselage({ rings: 220, seg: 96 });
  const fusMesh = add(group, fusGeo, skinMat);
  const glass = new THREE.Mesh(fusGeo, glassMat);
  glass.renderOrder = 2;
  glass.scale.setScalar(1.002); // leggermente fuori dalla pelle: niente z-fighting sui bordi
  group.add(glass);
  const shellGeo = buildFuselage({ zStart: -1.58, zEnd: 1.98, rings: 70, seg: 88, inset: 0.05, caps: true });
  // le calotte anteriore e posteriore usano un punto scuro della texture (paratia / moquette)
  for (let i = 70 * 89; i < shellGeo.attributes.uv.count; i++) shellGeo.attributes.uv.setXY(i, 0.5, 0.01);
  const shell = new THREE.Mesh(shellGeo, shellMat);
  group.add(shell);

  // prese d'aria, luci di atterraggio, scarico
  for (const s of [-1, 1]) {
    const intake = new THREE.Mesh(new THREE.CircleGeometry(0.1, 24), black);
    intake.scale.set(1.7, 0.9, 1);
    intake.rotation.y = Math.PI;
    intake.position.set(s * 0.21, -0.22, -3.352);
    group.add(intake);
  }
  add(group, tubeBetween([0.22, -0.64, -2.4], [0.22, -0.66, -1.7], 0.042, 0.04, darkMetal, 12));
  // antenne e sonda di Pitot
  add(group, new THREE.BoxGeometry(0.03, 0.26, 0.14), darkMetal, 0.12, 1.12, 0.35);
  add(group, tubeBetween([-0.05, 1.0, 1.2], [-0.05, 1.32, 1.5], 0.008, 0.004, darkMetal, 6));
  add(group, tubeBetween([-2.62, 0.99, -0.55], [-2.62, 0.93, -1.2], 0.012, 0.012, steel, 8));

  // ---------------------------------------------------------------- ala
  const Y_W = 1.07, Z_TE = 0.2, HALF = 5.5, HINGE = 0.38;
  const wingPlan = (s) => ({
    zTE: Z_TE, chord: s < 2.9 ? 1.62 : 1.62 - (0.5 * (s - 2.9)) / (HALF - 2.9), y: Y_W + 0.026 * s,
  });
  const naca = [0.12, 0.02, 0.4];
  const parts = {}, wingMesh = {};
  for (const side of [-1, 1]) {
    const mk = (piece, s0, s1, extra = {}) => liftingSurface({ planform: wingPlan, s0, s1, steps: Math.max(2, Math.round((s1 - s0) * 2)), naca, piece, hinge: HINGE, side, ...extra });
    wingMesh[side] = add(group, mk('main', 0, HALF, { tip: 0.18 }).geometry, white);
    add(group, mk('te', 0, 0.55).geometry, white);
    add(group, mk('te', 5.34, HALF, { tip: 0.18 }).geometry, white);
    for (const [name, s0, s1] of [['flap', 0.6, 2.95], ['ail', 3.05, 5.3]]) {
      const part = mk('te', s0, s1, { pivotize: true });
      const pivotGroup = new THREE.Group();
      pivotGroup.position.copy(part.pivot);
      group.add(pivotGroup);
      add(pivotGroup, part.geometry, white);
      parts[name + side] = pivotGroup;
    }
    add(group, tubeBetween([side * 0.55, -0.5, -0.35], [side * 2.95, 1.02 + 0.026 * 2.95, -0.3], 0.032, 0.028, white, 10));
    add(group, tubeBetween([side * 1.75, 0.3, -0.33], [side * 1.75, 1.04, -0.31], 0.018, 0.018, white, 8));
    // luci di navigazione (rosso a sinistra, verde a destra) e strobo
    const tipY = Y_W + 0.026 * HALF;
    const nav = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 8), new THREE.MeshStandardMaterial({
      color: side < 0 ? 0xff2020 : 0x20ff50, emissive: side < 0 ? 0xff1010 : 0x10ff40, emissiveIntensity: 3,
    }));
    nav.position.set(side * (HALF + 0.12), tipY, -0.45);
    group.add(nav);
    const strobe = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 6 }));
    strobe.position.set(side * (HALF + 0.1), tipY, 0.12);
    group.add(strobe);
    parts['strobe' + side] = strobe;
  }

  // ---------------------------------------------------------------- coda
  const stabPlan = (s) => ({ zTE: 4.22, chord: 0.92 - (0.3 * s) / 1.75, y: 0.17 });
  const stabNaca = [0.09, 0, 0];
  const elev = {};
  for (const side of [-1, 1]) {
    const mk = (piece, extra = {}) => liftingSurface({ planform: stabPlan, s0: 0, s1: 1.75, steps: 5, naca: stabNaca, piece, hinge: 0.3, side, n: 16, tip: 0.1, ...extra });
    add(group, mk('main').geometry, white);
    const part = mk('te', { pivotize: true });
    const pg = new THREE.Group();
    pg.position.copy(part.pivot);
    group.add(pg);
    add(pg, part.geometry, white);
    elev[side] = pg;
  }
  // deriva e timone: costruiti come ala orizzontale e ruotati di 90°
  const finG = new THREE.Group();
  finG.position.set(0, 0.34, 0);
  finG.rotation.z = Math.PI / 2;
  group.add(finG);
  const finPlan = (s) => ({ zTE: 4.25, chord: 1.12 - (0.62 * s) / 1.25, y: 0 });
  const finOpts = { planform: finPlan, s0: 0, s1: 1.25, steps: 6, naca: [0.09, 0, 0], hinge: 0.4, n: 16, tip: 0.1 };
  const finMesh = add(finG, liftingSurface({ ...finOpts, piece: 'main' }).geometry, white);
  const rudPart = liftingSurface({ ...finOpts, piece: 'te', pivotize: true });
  const rudG = new THREE.Group();
  rudG.position.copy(rudPart.pivot);
  finG.add(rudG);
  add(rudG, rudPart.geometry, red);
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 8), new THREE.MeshStandardMaterial({ color: 0xff3020, emissive: 0xff2010, emissiveIntensity: 4 }));
  beacon.position.set(0, 1.62, 4.1);
  group.add(beacon);
  const tailLight = new THREE.Mesh(new THREE.SphereGeometry(0.04, 10, 8), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 3 }));
  tailLight.position.set(0, 0.28, 4.36);
  group.add(tailLight);

  // ---------------------------------------------------------------- carrello
  const wheel = (r) => {
    const g = new THREE.Group();
    const tire = new THREE.Mesh(new THREE.TorusGeometry(r - 0.065, 0.065, 14, 28).rotateY(Math.PI / 2), rubber);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.52, r * 0.52, 0.11, 20).rotateZ(Math.PI / 2), steel);
    tire.castShadow = true;
    g.add(tire, hub);
    return g;
  };
  add(group, tubeBetween([0, -0.5, -2.1], [0, -0.98, -2.28], 0.045, 0.04, steel, 10));
  add(group, tubeBetween([0, -0.72, -2.2], [0, -0.88, -2.25], 0.06, 0.06, darkMetal, 10));
  add(group, wheel(0.17), null, 0, -1.08, -2.3);
  for (const s of [-1, 1]) add(group, tubeBetween([s * 0.09, -0.95, -2.28], [s * 0.09, -1.08, -2.3], 0.012, 0.012, steel, 6));
  for (const s of [-1, 1]) {
    add(group, tubeBetween([s * 0.5, -0.5, 0.35], [s * 1.06, -0.95, 0.3], 0.05, 0.036, steel, 10));
    add(group, wheel(0.25), null, s * 1.1, -1.0, 0.3);
    const pant = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), white);
    pant.scale.set(0.095, 0.27, 0.62);
    pant.position.set(s * 1.13, -0.965, 0.3);
    pant.castShadow = true;
    group.add(pant);
  }

  // ---------------------------------------------------------------- elica e ogiva
  const spinner = new THREE.Mesh(
    new THREE.LatheGeometry([[0.0, 0.0], [0.14, 0.004], [0.155, 0.07], [0.125, 0.2], [0.06, 0.33], [0.0, 0.4]].map(([r, y]) => new THREE.Vector2(r, y)), 28),
    pbr('metal', { repeat: 2, repeatY: 1, color: 0xe4e7ec, metalness: 1, roughness: 0.8, normalScale: 0.4 }));
  spinner.rotation.x = -Math.PI / 2;
  spinner.position.set(0, -0.12, -3.37);
  spinner.castShadow = true;
  group.add(spinner);

  const prop = new THREE.Group();
  prop.position.set(0, -0.12, -3.4);
  const bladePlan = (s) => ({
    zTE: 0, chord: 0.1 + 0.075 * Math.sin(Math.min(1, (s - 0.12) / 0.55) * Math.PI * 0.5) - 0.05 * Math.max(0, (s - 0.55) / 0.4),
    y: 0, twist: Math.PI / 2 - (0.62 - 0.45 * ((s - 0.12) / 0.83)), thick: 0.9,
  });
  const bladeGeo = liftingSurface({ planform: bladePlan, s0: 0.12, s1: 0.95, steps: 10, naca: [0.09, 0.03, 0.4], n: 12, tip: 0.02 }).geometry;
  const bc = [];
  const bp = bladeGeo.attributes.position;
  for (let i = 0; i < bp.count; i++) {
    const tipBand = Math.abs(bp.getX(i)) > 0.84;
    bc.push(tipBand ? 1 : 0.1, tipBand ? 0.78 : 0.1, tipBand ? 0.1 : 0.11);
  }
  bladeGeo.setAttribute('color', new THREE.Float32BufferAttribute(bc, 3));
  const bladeMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.5, transparent: true });
  const bladeA = new THREE.Mesh(bladeGeo, bladeMat);
  const bladeB = bladeA.clone();
  bladeA.rotation.z = Math.PI / 2; bladeB.rotation.z = -Math.PI / 2;
  bladeA.castShadow = bladeB.castShadow = true;
  prop.add(bladeA, bladeB);
  const dc = document.createElement('canvas');
  dc.width = dc.height = 128;
  const dg = dc.getContext('2d');
  const grad = dg.createRadialGradient(64, 64, 8, 64, 64, 64);
  grad.addColorStop(0, 'rgba(40,40,44,0)'); grad.addColorStop(0.2, 'rgba(40,40,44,0.35)'); grad.addColorStop(0.95, 'rgba(40,40,44,0.5)'); grad.addColorStop(1, 'rgba(40,40,44,0)');
  dg.fillStyle = grad; dg.fillRect(0, 0, 128, 128);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(0.98, 40), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(dc), transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
  prop.add(disc);
  group.add(prop);

  addLivery(group, { fin: finMesh, wingL: wingMesh[-1], wingR: wingMesh[1], fus: fusMesh });
  group.traverse((o) => { if (o.isMesh && o !== shell && o !== glass) o.receiveShadow = true; });
  shell.castShadow = false; shell.receiveShadow = true;

  /** anima le superfici e le luci. ctrl: { pitch, roll, rudder, flapDeg, time, rpmNorm } */
  function animate(ctrl) {
    parts['ail-1'].rotation.x = 0.42 * ctrl.roll;
    parts['ail1'].rotation.x = -0.42 * ctrl.roll;
    elev[-1].rotation.x = elev[1].rotation.x = -0.45 * ctrl.pitch;
    rudG.rotation.x = -0.45 * ctrl.rudder;
    const fr = (ctrl.flapDeg * Math.PI) / 180;
    parts['flap-1'].rotation.x = parts['flap1'].rotation.x = fr;
    const on = (ctrl.time % 1.2) < 0.08 || ((ctrl.time + 0.25) % 1.2) < 0.06;
    parts['strobe-1'].visible = parts['strobe1'].visible = on;
    beacon.visible = (ctrl.time % 1.0) < 0.15;
    const blur = Math.min(1, ctrl.rpmNorm ?? 0);
    bladeMat.opacity = 1 - 0.65 * blur;
    disc.material.opacity = 0.9 * blur;
  }

  return { group, prop, disc, animate, shell };
}
