import * as THREE from 'three';

/* ------------------------------------------------------------------ interpolazione monotona (PCHIP) */
function pchip(xs, ys) {
  const n = xs.length;
  const h = [], d = [], m = new Array(n);
  for (let i = 0; i < n - 1; i++) { h[i] = xs[i + 1] - xs[i]; d[i] = (ys[i + 1] - ys[i]) / h[i]; }
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) {
    if (d[i - 1] * d[i] <= 0) m[i] = 0;
    else {
      const w1 = 2 * h[i] + h[i - 1], w2 = h[i] + 2 * h[i - 1];
      m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i]);
    }
  }
  return (x) => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0;
    while (x > xs[i + 1]) i++;
    const t = (x - xs[i]) / h[i], t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h[i] * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h[i] * m[i + 1];
  };
}

/* ------------------------------------------------------------------ fusoliera
   Sezioni superellittiche: z (avanti = -Z), semi-larghezza, quota superiore/inferiore, esponente. */
export const FUS = { z0: -3.36, z1: 4.35 };
const KEYS = [
  [-3.36, 0.05, -0.07, -0.17, 2.0],
  [-3.34, 0.44, 0.32, -0.56, 2.1],
  [-3.10, 0.50, 0.38, -0.62, 2.1],
  [-2.60, 0.54, 0.42, -0.62, 2.2],
  [-2.10, 0.58, 0.46, -0.62, 2.3],
  [-1.65, 0.62, 0.50, -0.64, 2.5],
  [-1.30, 0.64, 0.74, -0.66, 3.0],
  [-0.95, 0.64, 0.98, -0.66, 3.2],
  [-0.40, 0.64, 1.00, -0.66, 3.4],
  [0.50, 0.62, 1.00, -0.64, 3.4],
  [0.95, 0.60, 0.96, -0.60, 3.2],
  [1.60, 0.50, 0.82, -0.50, 2.8],
  [2.40, 0.40, 0.64, -0.38, 2.4],
  [3.20, 0.27, 0.46, -0.22, 2.2],
  [3.80, 0.17, 0.36, -0.10, 2.1],
  [4.25, 0.09, 0.28, 0.00, 2.0],
  [4.35, 0.02, 0.23, 0.05, 2.0],
];
const zs = KEYS.map((k) => k[0]);
const fW = pchip(zs, KEYS.map((k) => k[1]));
const fT = pchip(zs, KEYS.map((k) => k[2]));
const fB = pchip(zs, KEYS.map((k) => k[3]));
const fN = pchip(zs, KEYS.map((k) => k[4]));

export function fusParams(z) {
  return { W: fW(z), top: fT(z), bot: fB(z), n: fN(z) };
}
const spow = (v, e) => Math.sign(v) * Math.pow(Math.abs(v), e);

/** punto della sezione a z con angolo phi (0 = ventre, π/2 = destra, π = tetto) */
export function fusPoint(z, phi, inset = 0) {
  const p = fusParams(z);
  const e = 2 / p.n;
  const mid = (p.top + p.bot) / 2, half = (p.top - p.bot) / 2 - inset;
  return [spow(Math.sin(phi), e) * Math.max(p.W - inset, 0.001), mid + half * spow(-Math.cos(phi), e)];
}

/* ------------------------------------------------------------------ loft generico */
/**
 * Costruisce una superficie da anelli di punti (stesso numero di punti in ogni anello).
 * Convenzione: anelli antiorari visti dalla fine del loft → normali verso l'esterno; flip inverte.
 */
export function loftRings(rings, { uvU = null, flip = false, capStart = false, capEnd = false, weld = true } = {}) {
  const R = rings.length, M = rings[0].length;
  const pos = [], uv = [], idx = [];
  for (let r = 0; r < R; r++) {
    for (let k = 0; k <= M; k++) {
      const p = rings[r][k % M];
      pos.push(p.x, p.y, p.z);
      uv.push(uvU ? uvU[r] : r / (R - 1), k / M);
    }
  }
  const W = M + 1;
  for (let r = 0; r < R - 1; r++) {
    for (let k = 0; k < M; k++) {
      const a = r * W + k, b = a + 1, c = a + W, d = c + 1;
      if (!flip) idx.push(a, b, c, b, d, c); else idx.push(a, c, b, b, c, d);
    }
  }
  const addCap = (ring, atEnd, base) => {
    let cx = 0, cy = 0, cz = 0;
    for (const p of ring) { cx += p.x; cy += p.y; cz += p.z; }
    cx /= M; cy /= M; cz /= M;
    const ci = pos.length / 3;
    pos.push(cx, cy, cz); uv.push(0.5, 0.5);
    for (const p of ring) { pos.push(p.x, p.y, p.z); uv.push(0.5, 0.5); }
    for (let k = 0; k < M; k++) {
      const p0 = ci + 1 + k, p1 = ci + 1 + ((k + 1) % M);
      const outward = atEnd !== flip;
      if (outward) idx.push(ci, p0, p1); else idx.push(ci, p1, p0);
    }
  };
  if (capStart) addCap(rings[0], false);
  if (capEnd) addCap(rings[R - 1], true);

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  if (weld) {
    const n = g.attributes.normal;
    const v = new THREE.Vector3(), w = new THREE.Vector3();
    for (let r = 0; r < R; r++) {
      v.fromBufferAttribute(n, r * W); w.fromBufferAttribute(n, r * W + M);
      v.add(w).normalize();
      n.setXYZ(r * W, v.x, v.y, v.z); n.setXYZ(r * W + M, v.x, v.y, v.z);
    }
  }
  return g;
}

/** geometria della fusoliera (esterna o guscio interno con inset) */
export function buildFuselage({ zStart = FUS.z0, zEnd = FUS.z1, rings = 150, seg = 80, inset = 0, caps = false } = {}) {
  const rs = [], us = [];
  for (let r = 0; r < rings; r++) {
    const z = zStart + ((zEnd - zStart) * r) / (rings - 1);
    const ring = [];
    for (let k = 0; k < seg; k++) {
      const [x, y] = fusPoint(z, (2 * Math.PI * k) / seg, inset);
      ring.push(new THREE.Vector3(x, y, z));
    }
    rs.push(ring);
    us.push((z - FUS.z0) / (FUS.z1 - FUS.z0));
  }
  return loftRings(rs, { uvU: us, capStart: caps, capEnd: caps });
}

/* ------------------------------------------------------------------ profili alari NACA 4 cifre */
export function nacaThickness(x, t) {
  return 5 * t * (0.2969 * Math.sqrt(x) - 0.126 * x - 0.3516 * x * x + 0.2843 * x ** 3 - 0.1036 * x ** 4);
}
export function nacaCamber(x, m, p) {
  if (m === 0) return 0;
  return x < p ? (m / (p * p)) * (2 * p * x - x * x) : (m / ((1 - p) ** 2)) * ((1 - 2 * p) + 2 * p * x - x * x);
}

/** anello 2D chiuso [x,y] frazione di corda per il tratto x0..x1: ventre→dorso */
export function airfoilLoop(x0, x1, n, [t, m, p]) {
  const xs = [];
  for (let i = 0; i <= n; i++) {
    const s = (1 - Math.cos((Math.PI * i) / n)) / 2; // più punti al bordo d'attacco
    xs.push(x0 + (x1 - x0) * s);
  }
  const up = xs.map((x) => [x, nacaCamber(x, m, p) + nacaThickness(x, t)]);
  const lo = xs.map((x) => [x, nacaCamber(x, m, p) - nacaThickness(x, t)]);
  const ring = [...up];
  for (let i = n; i >= 0; i--) {
    if (i === n && x1 >= 0.9999) continue; // bordo d'uscita chiuso: niente duplicato
    if (i === 0 && x0 <= 0.0001) continue;
    ring.push(lo[i]);
  }
  return ring;
}

/**
 * Superficie portante. planform(s) → { zTE, chord, y, twist?, thick? }; s = coordinata lungo l'apertura (+X).
 * piece: 'full' | 'main' | 'te' con cerniera a `hinge` metri dal bordo d'uscita.
 * Ritorna { geometry, pivot } (per 'te' la geometria è centrata sulla cerniera).
 */
export function liftingSurface({
  planform, s0, s1, steps = 8, naca = [0.12, 0.02, 0.4], piece = 'full', hinge = 0, flip = false, n = 20,
  tip = 0, side = 1, capStart = true, pivotize = false,
}) {
  const stations = [];
  for (let i = 0; i <= steps; i++) stations.push({ s: s0 + ((s1 - s0) * i) / steps, k: 1 });
  if (tip > 0) {
    for (let j = 1; j <= 6; j++) {
      const a = (j / 6) * Math.PI * 0.5 * 0.96;
      stations.push({ s: s1 + tip * Math.sin(a), k: Math.cos(a) });
    }
  }
  const rings = [];
  let pyAcc = 0, zh = 0;
  for (const st of stations) {
    const pf = planform(Math.min(st.s, s1));
    const c = pf.chord;
    const xh = hinge > 0 ? 1 - hinge / c : 1;
    const [x0, x1] = piece === 'main' ? [0, xh] : piece === 'te' ? [xh, 1] : [0, 1];
    const loop = airfoilLoop(x0, x1, n, naca);
    const ring = [];
    const thick = (pf.thick ?? 1) * st.k;
    const cs = Math.cos(pf.twist ?? 0), sn = Math.sin(pf.twist ?? 0);
    for (const [xf, yf] of loop) {
      const kx = 0.4 + (xf - 0.4) * st.k; // il profilo si rimpicciolisce attorno al 40% della corda
      let z = (kx - 0.5) * c, y = yf * c * thick - (0.0);
      if (pf.twist) { const zz = z * cs - y * sn; y = z * sn + y * cs; z = zz; }
      ring.push(new THREE.Vector3(side * st.s, pf.y + y, pf.zTE - c * 0.5 + z));
    }
    rings.push(ring);
    if (st.s <= s1 + 1e-6) {
      zh = pf.zTE - hinge;
      pyAcc += pf.y + nacaCamber(xh, naca[1], naca[2]) * c;
    }
  }
  const geometry = loftRings(rings, { flip: flip !== (side < 0), capStart, capEnd: true });
  const pivot = new THREE.Vector3(0, pyAcc / (steps + 1), zh);
  if (pivotize && piece === 'te' && hinge > 0) geometry.translate(0, -pivot.y, -pivot.z);
  return { geometry, pivot };
}

/** cilindro/cono tra due punti */
export function tubeBetween(p0, p1, r0, r1, material, seg = 10) {
  const a = new THREE.Vector3(...p0), b = new THREE.Vector3(...p1);
  const len = a.distanceTo(b);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, len, seg, 1), material);
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  return m;
}
