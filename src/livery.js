import * as THREE from 'three';
import { FUS, fusParams } from './geometry.js';

/**
 * Texture procedurali della fusoliera, tutte nello stesso spazio UV (u = quota z, v = angolo attorno):
 *  skin     colore della vernice (strisce, linee dei pannelli, guarnizioni, marche)
 *  mask     alfa della pelle: 0 dove ci sono i finestrini (le aperture vere, bordi anti-alias)
 *  glass    alfa del vetro (inverso della maschera)
 *  interior rivestimento interno (moquette, pannelli, cielo)
 * Calcolate una sola volta e condivise da tutte le istanze dell'aereo.
 */
const spow = (v, e) => Math.sign(v) * Math.pow(Math.abs(v), e);
const sdRoundBox = (px, py, cx, cy, hx, hy, r) => {
  const dx = Math.abs(px - cx) - hx + r, dy = Math.abs(py - cy) - hy + r;
  return Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0) - r;
};

/** distanza con segno (m) dai finestrini; negativa all'interno */
function windowSdf(z, x, y, p) {
  let sd = 1e9;
  const ax = Math.abs(x);
  if (ax > 0.5 * p.W) {
    const sh = 0.22 * (y - 0.5); // montanti inclinati all'indietro
    sd = Math.min(sd, sdRoundBox(z - sh, y, -0.19, 0.5, 0.72, 0.3, 0.09));
    sd = Math.min(sd, sdRoundBox(z - sh * 0.7, y, 1.1, 0.43, 0.4, 0.2, 0.07));
  }
  if (y > 0.4 && ax < 0.62) {
    const hw = 0.57 - (0.16 * (z + 1.5)) / 0.52;
    let w = Math.max(ax - hw, -1.5 - z, z + 0.97);
    w = Math.max(w, 0.035 - ax); // montante centrale
    sd = Math.min(sd, w);
    if (z > 0.95) {
      const hw2 = 0.2 + (0.1 * (z - 1.0)) / 0.45;
      sd = Math.min(sd, Math.max(ax - hw2, 1.02 - z, z - 1.46));
    }
  }
  return sd;
}

function findPhi(z, y, side) {
  let lo = 0, hi = Math.PI;
  const f = (phi) => { const p = fusParams(z); const e = 2 / p.n; const mid = (p.top + p.bot) / 2, half = (p.top - p.bot) / 2; return mid + half * spow(-Math.cos(phi), e); };
  for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (f(m) < y) lo = m; else hi = m; }
  return side > 0 ? lo : 2 * Math.PI - lo;
}

let cache = null;

export function getFuselageTextures() {
  if (cache) return cache;
  const W = 2048, H = 1024;
  const skin = new Uint8ClampedArray(W * H * 4);
  const mask = new Uint8ClampedArray(W * H * 4);
  const glass = new Uint8ClampedArray(W * H * 4);
  const IW = 2048, IH = 1024;
  const inner = new Uint8ClampedArray(IW * IH * 4);

  const sinT = new Float32Array(H), cosT = new Float32Array(H);
  for (let j = 0; j < H; j++) { const v = 1 - (j + 0.5) / H; sinT[j] = Math.sin(2 * Math.PI * v); cosT[j] = Math.cos(2 * Math.PI * v); }

  for (let i = 0; i < W; i++) {
    const z = FUS.z0 + ((i + 0.5) / W) * (FUS.z1 - FUS.z0);
    const p = fusParams(z);
    const e = 2 / p.n, mid = (p.top + p.bot) / 2, half = (p.top - p.bot) / 2;
    const yc = Math.min(0.1, p.top - 0.18);
    for (let j = 0; j < H; j++) {
      const x = spow(sinT[j], e) * p.W;
      const y = mid + half * spow(-cosT[j], e);
      const sd = windowSdf(z, x, y, p);
      const ax = Math.abs(x);
      let r = 232, g = 232, b = 228;
      // ventre grigio chiaro
      const bt = Math.min(1, Math.max(0, (p.bot + 0.16 - y) / 0.1));
      r += (205 - r) * bt; g += (208 - g) * bt; b += (214 - b) * bt;
      // cappottatura: parte alta antiriflesso e labbro anteriore blu
      if (z < -1.62 && ax < 0.34 && y > p.top - 0.16) { r = 38; g = 40; b = 46; }
      if (z < -3.18) { r = 24; g = 52; b = 120; }
      // strisce
      if (z > -2.2 && z < 4.2) {
        const dy = y - yc;
        if (Math.abs(dy) < 0.065) { r = 190; g = 32; b = 40; }
        else if (dy < -0.095 && dy > -0.15) { r = 24; g = 52; b = 120; }
      }
      // linee dei pannelli
      const seam = Math.min(1, Math.max(0, (0.0055 - Math.abs(z + 2.1)) / 0.0025));
      if (seam > 0) { r += (120 - r) * seam; g += (124 - g) * seam; b += (130 - b) * seam; }
      if (ax > 0.5 * p.W) {
        const sdd = sdRoundBox(z, y, -0.185, 0.17, 0.765, 0.67, 0.1);
        const dl = Math.min(1, Math.max(0, (0.0045 - Math.abs(sdd)) / 0.002));
        if (dl > 0) { r += (112 - r) * dl; g += (115 - g) * dl; b += (120 - b) * dl; }
      }
      // guarnizione dei finestrini
      const gk = Math.min(1, Math.max(0, sd / 0.004 + 0.5)) * Math.min(1, Math.max(0, (0.014 - sd) / 0.004 + 0.5));
      if (gk > 0) { r += (30 - r) * gk; g += (30 - g) * gk; b += (33 - b) * gk; }
      const k = (j * W + i) * 4;
      skin[k] = r; skin[k + 1] = g; skin[k + 2] = b; skin[k + 3] = 255;
      const a = Math.min(1, Math.max(0, sd / 0.004 + 0.5)) * 255;
      mask[k] = mask[k + 1] = mask[k + 2] = a; mask[k + 3] = 255;
      const ga = 255 - a;
      glass[k] = glass[k + 1] = glass[k + 2] = ga; glass[k + 3] = 255;
    }
  }

  // rivestimento interno (risoluzione dimezzata)
  for (let i = 0; i < IW; i++) {
    const z = FUS.z0 + ((i + 0.5) / IW) * (FUS.z1 - FUS.z0);
    const p = fusParams(z);
    const e = 2 / p.n, mid = (p.top + p.bot) / 2, half = (p.top - p.bot) / 2;
    for (let j = 0; j < IH; j++) {
      const v = 1 - (j + 0.5) / IH;
      const x = spow(Math.sin(2 * Math.PI * v), e) * p.W;
      const y = mid + half * spow(-Math.cos(2 * Math.PI * v), e);
      const sd = windowSdf(z, x, y, p);
      let r = 196, g = 196, b = 202; // pilastri
      if (y < p.bot + 0.22) { r = 44; g = 46; b = 52; } // moquette
      else if (y < 0.2) { r = 70; g = 73; b = 80; }      // pannelli porta
      else if (y < 0.26) { r = 104; g = 108; b = 116; }  // bordo bracciolo
      else if (y > 0.82) { r = 214; g = 214; b = 218; }  // cielo
      const ik = Math.min(1, Math.max(0, sd / 0.004 + 0.5)) * Math.min(1, Math.max(0, (0.022 - sd) / 0.004 + 0.5));
      if (ik > 0) { r += (34 - r) * ik; g += (34 - g) * ik; b += (38 - b) * ik; }
      const k = (j * IW + i) * 4;
      inner[k] = r; inner[k + 1] = g; inner[k + 2] = b; inner[k + 3] = 255;
    }
  }

  const mk = (data, w, h, srgb) => {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    ctx.putImageData(new ImageData(data, w, h), 0, 0);
    return { c, ctx };
  };
  const S = mk(skin, W, H);

  // marche di immatricolazione sui due lati
  const text = 'I-VOLA';
  const zc = 2.8, yt = 0.3;
  const kx = W / (FUS.z1 - FUS.z0);
  for (const side of [-1, 1]) {
    const i = ((zc - FUS.z0) / (FUS.z1 - FUS.z0)) * W;
    const j0 = (1 - findPhi(zc, yt, side) / (2 * Math.PI)) * H;
    const jA = (1 - findPhi(zc, yt + 0.1, side) / (2 * Math.PI)) * H, jB = (1 - findPhi(zc, yt - 0.1, side) / (2 * Math.PI)) * H;
    const ky = Math.abs(jA - jB) / 0.2;
    S.ctx.save();
    S.ctx.translate(i, j0);
    // sul lato sinistro la v è capovolta; sul destro la u è speculare rispetto a chi guarda
    S.ctx.scale(side > 0 ? -1 : 1, (side > 0 ? 1 : -1) * (ky / kx));
    S.ctx.fillStyle = '#183a82';
    S.ctx.font = `bold ${Math.round(0.2 * kx)}px Arial`;
    S.ctx.textAlign = 'center'; S.ctx.textBaseline = 'middle';
    S.ctx.fillText(text, 0, 0);
    S.ctx.restore();
  }

  const tex = (canvas, srgb) => {
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = 16;
    t.wrapS = THREE.ClampToEdgeWrapping; t.wrapT = THREE.RepeatWrapping;
    return t;
  };
  cache = {
    skin: tex(S.c, true),
    mask: tex(mk(mask, W, H).c, false),
    glass: tex(mk(glass, W, H).c, false),
    interior: tex(mk(inner, IW, IH).c, true),
  };
  return cache;
}
