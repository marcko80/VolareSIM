import * as THREE from 'three';
import { DecalGeometry } from 'three/examples/jsm/geometries/DecalGeometry.js';

/**
 * Livrea: adesivi proiettati sulle superfici (DecalGeometry, seguono la curvatura): logo sulla deriva,
 * bandiera tricolore, scritta VolareSIM sulla cappottatura, marche di immatricolazione sotto le ali.
 */
const NAVY = '#183a82', RED = '#be2028';

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 16;
  return t;
}

/** logo: disco blu con ala stilizzata a "V", filetto rosso e scia bianca */
function logoTexture() {
  return canvasTex(512, 512, (g) => {
    g.translate(256, 256);
    g.fillStyle = '#ffffff'; g.beginPath(); g.arc(0, 0, 250, 0, Math.PI * 2); g.fill();
    g.fillStyle = NAVY; g.beginPath(); g.arc(0, 0, 232, 0, Math.PI * 2); g.fill();
    g.strokeStyle = RED; g.lineWidth = 9; g.beginPath(); g.arc(0, 0, 210, 0, Math.PI * 2); g.stroke();
    // ala a V: due lame che convergono verso il basso
    g.fillStyle = '#ffffff';
    g.beginPath(); g.moveTo(-150, -105); g.quadraticCurveTo(-40, -95, 0, 105); g.quadraticCurveTo(-20, -5, -150, -105); g.fill();
    g.beginPath(); g.moveTo(150, -105); g.quadraticCurveTo(40, -95, 0, 105); g.quadraticCurveTo(20, -5, 150, -105); g.fill();
    g.fillStyle = RED;
    g.beginPath(); g.moveTo(-95, -60); g.quadraticCurveTo(-30, -60, 0, 40); g.quadraticCurveTo(-10, -20, -95, -60); g.fill();
    g.beginPath(); g.moveTo(95, -60); g.quadraticCurveTo(30, -60, 0, 40); g.quadraticCurveTo(10, -20, 95, -60); g.fill();
    g.fillStyle = '#ffffff'; g.font = 'bold 40px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('VOLARE', 0, 150);
  });
}

function flagTexture() {
  return canvasTex(300, 200, (g, w, h) => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#008c45'; g.fillRect(8, 8, w / 3 - 8, h - 16);
    g.fillStyle = '#f4f5f0'; g.fillRect(w / 3, 8, w / 3, h - 16);
    g.fillStyle = '#cd212a'; g.fillRect((2 * w) / 3, 8, w / 3 - 8, h - 16);
    g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 3; g.strokeRect(8, 8, w - 16, h - 16);
  });
}

/** scritta in corsivo con contorno bianco, trasparente intorno */
function wordTexture(text, w, h, size, color = NAVY, accent = RED) {
  return canvasTex(w, h, (g) => {
    g.font = `italic 800 ${size}px "Segoe UI", Arial, sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineJoin = 'round';
    g.strokeStyle = '#ffffff'; g.lineWidth = size * 0.1; g.strokeText(text, w / 2, h * 0.46);
    g.fillStyle = color; g.fillText(text, w / 2, h * 0.46);
    g.fillStyle = accent; g.fillRect(w * 0.08, h * 0.82, w * 0.84, h * 0.06);
  });
}

/** marche di immatricolazione: lettere grandi, tratto pieno, contorno bianco sottile */
function regTexture(text) {
  return canvasTex(1024, 256, (g, w, h) => {
    g.font = 'bold 190px Arial, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineJoin = 'round';
    g.strokeStyle = '#ffffff'; g.lineWidth = 14; g.strokeText(text, w / 2, h / 2 + 6);
    g.fillStyle = '#111a33'; g.fillText(text, w / 2, h / 2 + 6);
  });
}

const helper = new THREE.Object3D();

/**
 * incolla un adesivo sulla mesh nel punto `pos` (coordinate del gruppo), con normale `n` e verso "alto" `up`.
 * Le coordinate sono quelle del gruppo dell'aereo, che al momento della costruzione coincidono con il mondo.
 */
function decal(group, mesh, tex, pos, n, up, size, { mirror = false, order = 1 } = {}) {
  // porta il centro esattamente sulla superficie (raggio da fuori) e usa una profondità sottile: un solo lato dell'ala/deriva
  pos = pos.clone();
  const hit = new THREE.Raycaster(pos.clone().addScaledVector(n, 2), n.clone().negate(), 0, 4).intersectObject(mesh, false)[0];
  if (hit) pos.copy(hit.point);
  size = [size[0], size[1], 0.1];
  helper.position.copy(pos);
  helper.up.copy(up);
  helper.lookAt(pos.clone().add(n));
  helper.updateMatrixWorld(true);
  const geo = new DecalGeometry(mesh, pos, new THREE.Euler().setFromQuaternion(helper.quaternion), new THREE.Vector3(size[0], size[1], size[2] ?? 0.4));
  if (mirror) { tex = tex.clone(); tex.needsUpdate = true; tex.repeat.set(-1, 1); tex.offset.set(1, 0); }
  const mat = new THREE.MeshStandardMaterial({
    map: tex, transparent: true, roughness: 0.35, metalness: 0.05,
    polygonOffset: true, polygonOffsetFactor: -4 - order, polygonOffsetUnits: -4 - order, depthWrite: false,
  });
  const m = new THREE.Mesh(geo, mat);
  m.renderOrder = 1 + order;
  m.receiveShadow = true;
  group.add(m);
  return m;
}

/**
 * @param parts { fin, wings: {left,right}, fus }  mesh su cui proiettare (coordinate locali del gruppo = coordinate aereo)
 */
export function addLivery(group, { fin, finGroup, wingL, wingR, fus }) {
  group.updateMatrixWorld(true);
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const logo = logoTexture(), flag = flagTexture();

  // logo sulla deriva: sui due lati (x = ±) a circa metà altezza, a monte della cerniera del timone
  for (const s of [-1, 1]) {
    decal(group, fin, logo, V(0, 0.92, 3.69), V(s, 0, 0), V(0, 1, 0), [0.4, 0.4, 0.5], { mirror: false });
    decal(group, fin, flag, V(0, 1.33, 3.64), V(s, 0, 0), V(0, 1, 0), [0.2, 0.135, 0.5], { mirror: false });
  }
  // scritta VolareSIM sui due lati della cappottatura (davanti alle strisce)
  const word = wordTexture('VolareSIM', 1024, 256, 150);
  for (const s of [-1, 1]) decal(group, fus, word, V(s * 0.48, -0.02, -2.72), V(s, 0, 0), V(0, 1, 0), [0.78, 0.2, 0.5], { mirror: false });
  // marche sotto le ali (lette da davanti, parte alta verso il muso) e sopra l'ala destra
  const reg = regTexture('I-VOLA');
  decal(group, wingL, reg, V(-2.9, 1.15, -0.55), V(0, -1, 0), V(0, 0, -1), [1.9, 0.48, 0.5], { mirror: false, order: 0 });
  decal(group, wingR, reg, V(2.9, 1.15, -0.55), V(0, 1, 0), V(0, 0, -1), [1.9, 0.48, 0.5], { mirror: false, order: 0 });
}
