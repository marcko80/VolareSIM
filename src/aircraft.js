import * as THREE from 'three';

/** Convenzione: avanti = -Z, su = +Y, destra = +X. Origine = baricentro. */
export function createCessna() {
  const group = new THREE.Group();
  const exterior = new THREE.Group(); // fusoliera, coda, carrello: nascosti nelle viste interne
  const always = new THREE.Group();   // ala, cofano, elica: sempre visibili
  group.add(exterior, always);

  const std = (color, rough = 0.4, metal = 0.2) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
  const white = std(0xf2f2ef, 0.35, 0.25);
  const red = std(0xc8282d, 0.4, 0.2);
  const blue = std(0x1f4e9c, 0.4, 0.2);
  const glass = new THREE.MeshStandardMaterial({ color: 0x182430, roughness: 0.08, metalness: 0.7 });
  const dark = std(0x1d1d1f, 0.8, 0.1);
  const grey = std(0x8a8d92, 0.5, 0.5);

  const add = (parent, mesh, x = 0, y = 0, z = 0) => {
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  };
  const box = (w, h, d, mat) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  const strut = (parent, x1, y1, z1, x2, y2, z2, t = 0.08) => {
    const a = new THREE.Vector3(x1, y1, z1), b = new THREE.Vector3(x2, y2, z2);
    const m = new THREE.Mesh(new THREE.BoxGeometry(t, t, a.distanceTo(b)), grey);
    m.position.copy(a).add(b).multiplyScalar(0.5);
    m.lookAt(b);
    m.castShadow = true;
    parent.add(m);
  };
  // profilo di rotazione: punti (raggio, y) con y = -z (muso a +y)
  const lathe = (pts, mat, seg = 24) => {
    const m = new THREE.Mesh(new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg), mat);
    m.rotation.x = -Math.PI / 2;
    return m;
  };

  // fusoliera affusolata
  add(exterior, lathe([
    [0.0, 2.1], [0.45, 2.1], [0.56, 1.9], [0.6, 1.5], [0.62, 0.6], [0.6, -0.4],
    [0.52, -1.5], [0.38, -2.7], [0.22, -3.7], [0.12, -4.2], [0.0, -4.3],
  ], white));
  // cofano motore + ogiva
  add(always, lathe([[0.0, 3.5], [0.22, 3.46], [0.4, 3.3], [0.5, 2.9], [0.55, 2.4], [0.58, 2.1], [0.0, 2.1]], white), 0, -0.12, 0);
  const spin = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.5, 16), red);
  spin.rotation.x = -Math.PI / 2;
  add(always, spin, 0, -0.12, -3.72);
  add(always, box(0.7, 0.16, 0.1, dark), 0, -0.32, -3.3);
  // banda blu e filetti rossi
  add(always, lathe([[0.575, 2.9], [0.585, 2.9], [0.585, 2.7], [0.575, 2.7]], blue), 0, -0.12, 0);
  for (const s of [-1, 1]) {
    add(exterior, box(0.02, 0.09, 4.3, red), s * 0.58, -0.05, 1.5);
    add(exterior, box(0.02, 0.2, 1.0, blue), s * 0.585, -0.05, -0.9);
  }
  // parabrezza e finestrini
  const ws = add(exterior, box(0.92, 0.5, 0.85, glass), 0, 0.62, -1.05);
  ws.rotation.x = 0.35;
  add(exterior, box(1.22, 0.5, 1.4, glass), 0, 0.62, 0.35);
  add(exterior, box(0.5, 0.2, 0.6, glass), 0, 0.3, 1.4).scale.set(1.6, 1, 1);
  add(exterior, box(1.0, 0.07, 2.0, white), 0, 0.88, 0.3);

  // ala alta con flap e alettoni
  const wing = new THREE.Group();
  always.add(wing);
  // ala alta appoggiata sul tetto della cabina
  add(exterior, box(1.3, 0.12, 1.2, white), 0, 0.95, -0.62); // tratto centrale: nascosto nelle viste interne
  add(wing, box(4.85, 0.12, 1.2, white), -3.075, 0.95, -0.62);
  add(wing, box(4.85, 0.12, 1.2, white), 3.075, 0.95, -0.62);
  add(wing, box(0.1, 0.1, 1.55, red), 5.52, 0.95, -0.4);
  add(wing, box(0.1, 0.1, 1.55, red), -5.52, 0.95, -0.4);
  const hinge = (x, len, chord = 0.4, mat = white) => {
    const p = new THREE.Group();
    p.position.set(x, 0.95, -0.02);
    const surf = box(len, 0.07, chord, mat);
    surf.position.z = chord / 2;
    surf.castShadow = true;
    p.add(surf);
    wing.add(p);
    return p;
  };
  const flapL = hinge(-1.75, 2.4), flapR = hinge(1.75, 2.4);
  const ailL = hinge(-4.25, 2.2), ailR = hinge(4.25, 2.2);
  for (const s of [-1, 1]) {
    strut(wing, s * 0.55, -0.45, -0.35, s * 3.4, 0.9, -0.35);
    strut(wing, s * 0.55, -0.45, -0.1, s * 3.4, 0.9, -0.1, 0.05);
  }
  // luci di navigazione e strobo
  const bulb = (color, x, y, z) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), new THREE.MeshBasicMaterial({ color }));
    m.position.set(x, y, z);
    always.add(m);
    return m;
  };
  bulb(0xff2020, -5.6, 0.95, -0.35);
  bulb(0x20ff40, 5.6, 0.95, -0.35);
  const strobes = [bulb(0xffffff, -5.62, 0.95, 0.25), bulb(0xffffff, 5.62, 0.95, 0.25), bulb(0xffffff, 0, 1.55, 4.0)];
  strobes.forEach((s) => s.scale.setScalar(1.6));

  // coda con equilibratore e timone
  add(exterior, box(3.6, 0.08, 0.7, white), 0, 0.12, 3.45);
  add(exterior, box(0.1, 1.2, 1.1, white), 0, 0.75, 3.55);
  const mkHinge = (x, y, z, w, h, d, mat) => {
    const p = new THREE.Group();
    p.position.set(x, y, z);
    exterior.add(p);
    return { p, mesh: add(p, box(w, h, d, mat), 0, 0, 0) };
  };
  const elev = mkHinge(0, 0.12, 3.8, 3.5, 0.06, 0.4, white);
  elev.mesh.position.z = 0.2;
  const rud = mkHinge(0, 0.8, 4.05, 0.07, 1.1, 0.45, red);
  rud.mesh.position.z = 0.22;

  // carrello fisso
  const wheelGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.14, 16).rotateZ(Math.PI / 2);
  strut(exterior, 0, -0.1, -2.3, 0, -1.05, -2.3, 0.1);
  add(exterior, new THREE.Mesh(wheelGeo, dark), 0, -1.05, -2.3);
  for (const s of [-1, 1]) {
    strut(exterior, s * 0.45, -0.3, 0.25, s * 1.1, -1.05, 0.3, 0.1);
    add(exterior, new THREE.Mesh(wheelGeo, dark), s * 1.1, -1.05, 0.3);
    add(exterior, box(0.24, 0.2, 0.7, white), s * 1.1, -0.82, 0.3);
  }

  // elica
  const prop = new THREE.Group();
  prop.position.set(0, -0.12, -3.95);
  const blade = box(0.15, 2.05, 0.04, dark);
  blade.castShadow = true;
  prop.add(blade);
  const tip1 = box(0.15, 0.2, 0.045, std(0xffcc22, 0.5, 0));
  tip1.position.y = 0.92; prop.add(tip1);
  const tip2 = tip1.clone(); tip2.position.y = -0.92; prop.add(tip2);
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(1.03, 32),
    new THREE.MeshBasicMaterial({ color: 0x222222, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide })
  );
  prop.add(disc);
  always.add(prop);

  /** anima superfici di comando e luci. ctrl: { pitch, roll, rudder, flapDeg, time } */
  function animate(ctrl) {
    ailL.rotation.x = 0.42 * ctrl.roll;
    ailR.rotation.x = -0.42 * ctrl.roll;
    elev.p.rotation.x = -0.4 * ctrl.pitch;
    rud.p.rotation.y = 0.4 * ctrl.rudder;
    const fr = (ctrl.flapDeg * Math.PI) / 180;
    flapL.rotation.x = fr; flapR.rotation.x = fr;
    const on = (ctrl.time % 1.2) < 0.08 || ((ctrl.time + 0.25) % 1.2) < 0.06;
    strobes.forEach((s) => (s.visible = on));
  }

  return { group, exterior, prop, disc, animate };
}
