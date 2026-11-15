import * as THREE from 'three';
import { liftingSurface, tubeBetween } from './geometry.js';
import { loftBody, makeWheel, createSimpleCockpit } from './airframe.js';
import { pbr, skinDetail } from './materials.js';
import { canvasTex, decal, flagTexture, logoTexture, regTexture } from './decals.js';

/**
 * Aliante acrobatico biposto, procedurale: apertura 16 m, ala a profilo simmetrico, cappottina a goccia,
 * impennaggio a T, ruota centrale. Marche I-IVVQ. Avanti = −Z, su = +Y, destra = +X.
 */
export const GLIDER_REG = 'I-IVVQ';


/** fusoliera bianca con la fascia blu sul fianco, che sale lungo la bottazza della capottina e si assottiglia verso la coda */
function gliderFuselageTexture() {
  const W = 4096, H = 512;
  return canvasTex(W, H, (g) => {
    g.fillStyle = '#f3f3f0'; g.fillRect(0, 0, W, H);
    for (let x = 0; x < W; x += 2) {
      const u = x / W;
      const vc = 0.255 + 0.03 * u, hw = u < 0.04 ? 0.004 + u * 0.3 : 0.016 * (1 - 0.8 * Math.pow(u, 1.5));
      g.fillStyle = '#1b4aa0';
      for (const side of [0, 1]) {
        const a = (1 - (side ? 1 - (vc - hw) : vc - hw)) * H, b = (1 - (side ? 1 - (vc + hw) : vc + hw)) * H;
        g.fillRect(x, Math.min(a, b), 2.5, Math.abs(b - a));
      }
    }
  });
}

export function createGlider() {
  const group = new THREE.Group();
  const paint = (color, extra = {}) => new THREE.MeshPhysicalMaterial({ color, roughness: 0.28, metalness: 0.02, clearcoat: 1, clearcoatRoughness: 0.1, ...extra });
  const white = skinDetail(paint(0xffffff, { map: gliderFuselageTexture() }), { seed: 8, panel: [1.1, 0.8], chips: 0.05, grime: 0.35, rivets: 0 });
  const whiteTail = skinDetail(paint(0xf3f3f0), { seed: 12, panel: [1.1, 0.8], chips: 0.05, grime: 0.35, rivets: 0 });
  const whiteW = skinDetail(paint(0xf1f1ee), { seed: 9, panel: [1.4, 0.9], chips: 0.15, grime: 0.5, rivets: 0 });
  const red = skinDetail(paint(0xb81d28), { seed: 10, panel: [1.0, 0.7], chips: 0.1, grime: 0.4, rivets: 0 });
  const navy = skinDetail(paint(0x143a85), { seed: 11, panel: [1.0, 0.7], chips: 0.1, grime: 0.4, rivets: 0 });
  const steel = pbr('metal', { repeat: 1, repeatY: 3, color: 0xcfd3d9, metalness: 1, roughness: 0.9, normalScale: 0.6 });
  const darkMetal = pbr('metal', { repeat: 1, repeatY: 2, color: 0x3d4047, metalness: 0.9, roughness: 0.9, normalScale: 0.5 });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x151517, roughness: 0.95 });
  const glassMat = new THREE.MeshPhysicalMaterial({ color: 0x3a5864, roughness: 0.02, metalness: 0.1, transparent: true, opacity: 0.4, depthWrite: false, envMapIntensity: 1.4, clearcoat: 1 });
  const add = (parent, obj, mat, x = 0, y = 0, z = 0) => {
    const m = obj.isObject3D ? obj : new THREE.Mesh(obj, mat);
    m.position.x += x; m.position.y += y; m.position.z += z;
    m.castShadow = true; m.receiveShadow = true;
    parent.add(m);
    return m;
  };

  // ---------------------------------------------------------------- fusoliera
  const keys = [
    [-2.95, 0.03, 0.03, -0.12, 2.0],
    [-2.8, 0.15, 0.14, -0.30, 2.0],
    [-2.3, 0.30, 0.32, -0.46, 2.2],
    [-1.6, 0.40, 0.46, -0.50, 2.4],
    [-0.6, 0.43, 0.52, -0.50, 2.5],
    [0.4, 0.38, 0.50, -0.44, 2.4],
    [1.4, 0.24, 0.34, -0.28, 2.3],
    [2.6, 0.14, 0.22, -0.15, 2.2],
    [3.9, 0.085, 0.15, -0.085, 2.1],
    [5.2, 0.05, 0.11, -0.04, 2.0],
  ];
  const fusMesh = add(group, loftBody(keys, { rings: 200, seg: 96 }), white);
  const canopy = new THREE.Mesh(loftBody([
    [-2.62, 0.04, 0.24, 0.14, 2.2], [-2.35, 0.2, 0.46, 0.14, 2.2], [-1.9, 0.33, 0.66, 0.14, 2.2], [-1.2, 0.39, 0.77, 0.14, 2.3],
    [-0.4, 0.39, 0.77, 0.14, 2.3], [0.2, 0.34, 0.66, 0.14, 2.3], [0.62, 0.22, 0.52, 0.14, 2.2], [0.82, 0.05, 0.46, 0.14, 2.0],
  ], { rings: 80, seg: 56 }), glassMat);
  canopy.renderOrder = 2;
  group.add(canopy);
  const rail = new THREE.MeshStandardMaterial({ color: 0x1d1f23, roughness: 0.5 });
  const arch = new THREE.Mesh(new THREE.TorusGeometry(1, 0.016, 6, 40, Math.PI).rotateZ(0), rail);
  arch.scale.set(0.385, 0.55, 1); arch.position.set(0, 0.22, -0.72); arch.rotation.z = 0; group.add(arch);
  const arch2 = arch.clone(); arch2.scale.set(0.3, 0.42, 1); arch2.position.set(0, 0.24, -2.2); group.add(arch2);
  // sedili e piloti
  const seatMat = pbr('leather', { repeat: 1.6, color: 0x3a3c42, normalScale: 1 });
  const helmet = new THREE.MeshStandardMaterial({ color: 0xf4f4f0, roughness: 0.35 });
  const visor = new THREE.MeshStandardMaterial({ color: 0x1a1a1c, roughness: 0.1, metalness: 0.6 });
  for (const sz of [-1.45, -0.35]) {
    add(group, new THREE.BoxGeometry(0.42, 0.1, 0.46), seatMat, 0, -0.18, sz);
    add(group, new THREE.BoxGeometry(0.42, 0.55, 0.09), seatMat, 0, 0.1, sz + 0.26).rotation.x = -0.45;
    const body = add(group, new THREE.SphereGeometry(0.18, 14, 10), red, 0, 0.1, sz + 0.05); body.scale.set(1, 1.2, 0.8);
    const head = add(group, new THREE.SphereGeometry(0.105, 16, 12), helmet, 0, 0.5, sz + 0.12);
    add(head, new THREE.SphereGeometry(0.092, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), visor, 0, 0, -0.04).rotation.x = 0.5;
  }
  // pitot
  add(group, tubeBetween([0, 0.02, -2.9], [0, 0.02, -3.2], 0.01, 0.004, steel, 6));

  // ---------------------------------------------------------------- ala (profilo simmetrico, rastremata)
  const HALF = 8.75, Y0 = 0.3, TE = 0.34;
  const wingPlan = (s) => ({ zTE: TE + 0.03 * (s / HALF), chord: 1.34 - 0.66 * (s / HALF), y: Y0 + 0.026 * s, thick: 1 - 0.22 * (s / HALF) });
  const naca = [0.15, 0, 0];
  const parts = {}, wingMesh = {};
  for (const side of [-1, 1]) {
    const mk = (piece, s0, s1, extra = {}) => liftingSurface({ planform: wingPlan, s0, s1, steps: Math.max(3, Math.round((s1 - s0) * 1.8)), naca, piece, hinge: 0.32, side, n: 22, ...extra });
    wingMesh[side] = add(group, mk('main', 0, HALF, { tip: 0.2 }).geometry, whiteW);
    add(group, mk('te', 0, 0.6).geometry, whiteW);
    add(group, mk('te', 8.45, HALF, { tip: 0.2 }).geometry, whiteW);
    const ail = mk('te', 4.3, 8.4, { pivotize: true });
    const pg = new THREE.Group();
    pg.position.copy(ail.pivot);
    group.add(pg);
    add(pg, ail.geometry, whiteW);
    parts['ail' + side] = pg;
    const rest = mk('te', 0.65, 4.25);
    add(group, rest.geometry, whiteW);
    // estremità alare rossa: calotta colorata sul bordo marginale
    const tipCap = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), red);
    tipCap.scale.set(0.045, 0.1, 0.34);
    tipCap.position.set(side * (HALF + 0.17), Y0 + 0.026 * HALF + 0.01, TE - 0.31 + 0.12);
    tipCap.castShadow = true;
    group.add(tipCap);
    // aerofreni sul dorso
    const brake = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.012, 0.16).translate(0, 0.006, 0), red);
    const bx = 3.0, by = Y0 + 0.026 * bx + 0.15 * (1 - 0.22 * bx / HALF) * 0.5 * 0.92;
    brake.position.set(side * bx, by, TE - 0.42);
    brake.castShadow = true;
    group.add(brake);
    parts['brake' + side] = brake;
    // luci
    const nav = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), new THREE.MeshStandardMaterial({
      color: side < 0 ? 0xff2020 : 0x20ff50, emissive: side < 0 ? 0xff1010 : 0x10ff40, emissiveIntensity: 3,
    }));
    nav.position.set(side * (HALF + 0.25), Y0 + 0.026 * HALF + 0.03, TE - 0.25);
    group.add(nav);
  }

  // ---------------------------------------------------------------- coda a T
  const finG = new THREE.Group();
  finG.position.set(0, 0.04, 0);
  finG.rotation.z = Math.PI / 2;
  group.add(finG);
  const finPlan = (s) => ({ zTE: 4.97, chord: 1.55 - 0.95 * (s / 1.25), y: 0, thick: 1 });
  const finOpts = { planform: finPlan, s0: 0, s1: 1.25, steps: 6, naca: [0.1, 0, 0], hinge: 0.4, n: 16, tip: 0.06 };
  const finMesh = add(finG, liftingSurface({ ...finOpts, piece: 'main' }).geometry, whiteTail);
  const rudPart = liftingSurface({ ...finOpts, piece: 'te', pivotize: true });
  const rudG = new THREE.Group();
  rudG.position.copy(rudPart.pivot);
  finG.add(rudG);
  add(rudG, rudPart.geometry, red);
  const stabPlan = (s) => ({ zTE: 4.88, chord: 0.72 - 0.26 * (s / 1.45), y: 1.3 });
  const elev = {};
  for (const side of [-1, 1]) {
    const mk = (piece, extra = {}) => liftingSurface({ planform: stabPlan, s0: 0, s1: 1.45, steps: 5, naca: [0.09, 0, 0], piece, hinge: 0.26, side, n: 14, tip: 0.07, ...extra });
    add(group, mk('main').geometry, white);
    const part = mk('te', { pivotize: true });
    const pg = new THREE.Group();
    pg.position.copy(part.pivot);
    group.add(pg);
    add(pg, part.geometry, white);
    elev[side] = pg;
  }

  // ---------------------------------------------------------------- carrello: ruota centrale e ruotino anteriore
  const gear = new THREE.Group();
  group.add(gear);
  add(gear, makeWheel(0.18, 0.1, rubber, steel), null, 0, -0.77, 0.35);
  add(gear, tubeBetween([0, -0.48, 0.3], [0, -0.74, 0.35], 0.03, 0.025, steel, 8));
  add(gear, makeWheel(0.09, 0.06, rubber, steel), null, 0, -0.85, -2.2);
  add(gear, tubeBetween([0, -0.45, -2.2], [0, -0.82, -2.2], 0.018, 0.014, steel, 8));
  add(gear, new THREE.BoxGeometry(0.03, 0.04, 0.5), darkMetal, 0, -0.01, 4.62);
  const keel = add(gear, new THREE.BoxGeometry(0.02, 0.1, 0.4), navy, 0, -0.1, 4.5);

  // ---------------------------------------------------------------- livrea e marche
  group.updateMatrixWorld(true);
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const reg = regTexture(GLIDER_REG), flag = flagTexture(), logo = logoTexture();
  for (const s of [-1, 1]) {
    decal(group, fusMesh, reg, V(s * 0.17, 0.0, 3.55), V(s, 0, 0), V(0, 1, 0), [1.1, 0.28, 0.5], { mirror: false, order: 1 });
    decal(group, finMesh, logo, V(0, 0.68, 4.45), V(s, 0, 0), V(0, 1, 0), [0.34, 0.34, 0.5], { mirror: false });
    decal(group, finMesh, flag, V(0, 0.96, 4.48), V(s, 0, 0), V(0, 1, 0), [0.17, 0.115, 0.5], { mirror: false });
  }
  decal(group, wingMesh[-1], reg, V(-4.9, 0.4, -0.15), V(0, -1, 0), V(0, 0, -1), [1.55, 0.4, 0.5], { mirror: false, order: 0 });
  decal(group, wingMesh[1], reg, V(4.9, 0.4, -0.15), V(0, 1, 0), V(0, 0, -1), [1.55, 0.4, 0.5], { mirror: false, order: 0 });

  group.traverse((o) => { if (o.isMesh) o.receiveShadow = true; });
  canopy.castShadow = false;

  const cockpit = createSimpleCockpit({ z: -2.2, y: 0.55, w: 0.66, h: 0.24, tilt: -0.55, stickZ: -1.45, stickY: -0.3, jet: false, vsMax: 5 });
  group.add(cockpit.group);
  const eye = new THREE.Vector3(0, 0.74, -1.3);

  function animate(ctrl) {
    parts['ail-1'].rotation.x = 0.45 * ctrl.roll;
    parts['ail1'].rotation.x = -0.45 * ctrl.roll;
    elev[-1].rotation.x = elev[1].rotation.x = -0.5 * ctrl.pitch;
    rudG.rotation.x = -0.5 * ctrl.rudder;
    const b = ctrl.brakeExt || 0;
    for (const s of [-1, 1]) { parts['brake' + s].scale.y = 1 + 22 * b; parts['brake' + s].visible = b > 0.02; }   // lamelle sul dorso
    gear.visible = ctrl.gearOut > 0.02;
  }
  return { group, animate, cockpit, eye, prop: null };
}
