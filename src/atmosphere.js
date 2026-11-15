import { terrainHeight } from './world.js';

/**
 * Atmosfera: vento medio regolabile (velocità e direzione di provenienza), turbolenza, portanza dinamica
 * lungo i versanti esposti al vento e termiche. Le termiche nascono sui rilievi più massicci della zona
 * (massimi del rilievo livellato su ~2 km) e cicliche: salgono, si piegano con il vento e muoiono.
 */
const KT = 0.514444;
const EXT = { x0: -12000, x1: 26000, z0: -16000, z1: 22000 };

const hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

export class Atmosphere {
  constructor() {
    this.speedKt = 0;        // velocità del vento al suolo
    this.dirFrom = 270;      // provenienza (gradi, come i bollettini)
    this.turbulence = 0.3;   // 0..1
    this.thermals = true;
    this.sites = [];
    this.wx = 0; this.wz = 0;
    this.setWind(0, 270);
  }

  setWind(kt, dirFrom) {
    this.speedKt = kt; this.dirFrom = dirFrom;
    const to = ((dirFrom + 180) * Math.PI) / 180;           // verso cui soffia
    const v = kt * KT;
    this.wx = Math.sin(to) * v; this.wz = -Math.cos(to) * v; // +X = est, −Z = nord
  }

  /** individua i massicci: massimi del rilievo livellato, più alti della media regionale */
  init() {
    const STEP = 500, nx = Math.floor((EXT.x1 - EXT.x0) / STEP), nz = Math.floor((EXT.z1 - EXT.z0) / STEP);
    const H = new Float32Array(nx * nz);
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) H[j * nx + i] = terrainHeight(EXT.x0 + (i + 0.5) * STEP, EXT.z0 + (j + 0.5) * STEP);
    // integrale per medie su finestre quadrate
    const I = new Float64Array((nx + 1) * (nz + 1));
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) I[(j + 1) * (nx + 1) + i + 1] = H[j * nx + i] + I[j * (nx + 1) + i + 1] + I[(j + 1) * (nx + 1) + i] - I[j * (nx + 1) + i];
    const box = (i, j, r) => {
      const i0 = Math.max(0, i - r), i1 = Math.min(nx, i + r + 1), j0 = Math.max(0, j - r), j1 = Math.min(nz, j + r + 1);
      return (I[j1 * (nx + 1) + i1] - I[j0 * (nx + 1) + i1] - I[j1 * (nx + 1) + i0] + I[j0 * (nx + 1) + i0]) / ((i1 - i0) * (j1 - j0));
    };
    const cand = [];
    for (let j = 2; j < nz - 2; j++) for (let i = 2; i < nx - 2; i++) {
      const local = box(i, j, 4), region = box(i, j, 16);       // ±2 km e ±8 km
      cand.push({ i, j, local, mass: local - region });
    }
    cand.sort((a, b) => b.mass - a.mass);
    const picked = [];
    for (const c of cand) {
      if (c.mass < 120) break;
      const x = EXT.x0 + (c.i + 0.5) * STEP, z = EXT.z0 + (c.j + 0.5) * STEP;
      if (picked.some((p) => Math.hypot(p.x - x, p.z - z) < 4500)) continue;
      picked.push({ x, z, mass: c.mass, elev: c.local });
      if (picked.length >= 12) break;
    }
    // per ogni massiccio: tre termiche sfasate, innescate sul versante soleggiato (sud-ovest della cima)
    this.sites = picked.map((s, n) => {
      const strength = Math.min(4.6, 1.9 + s.mass / 330);
      const slots = [0, 1, 2].map((k) => {
        const a = hash(n * 7 + k) * Math.PI * 2, d = 500 + hash(n * 11 + k + 3) * 1100;
        const sx = s.x + Math.cos(a) * d - 600, sz = s.z + Math.sin(a) * d + 800;     // spostate verso sud-ovest
        return { sx, sz, base: terrainHeight(sx, sz), life: 520 + hash(n * 5 + k) * 380, phase: (k / 3 + hash(n) * 0.3) % 1, R: 200 + hash(n * 3 + k) * 140, w: strength * (0.8 + hash(n * 9 + k) * 0.4) };
      });
      return { ...s, strength, slots };
    });
    return this.sites;
  }

  /** termiche attive (per i cumuli e per la ricerca delle sorgenti): { x, z, base, top, w } a quota di cima */
  activeThermals(time) {
    const out = [];
    for (const s of this.sites) for (const t of s.slots) {
      const age = (((time / t.life + t.phase) % 1) + 1) % 1;
      const env = Math.sin(Math.PI * age);
      if (env < 0.12) continue;
      const top = t.base + 1500 + 700 * env;
      const rise = (top - t.base) * 0.55;
      out.push({ x: t.sx + this.wx * (rise / Math.max(2.5, 0.65 * t.w)), z: t.sz + this.wz * (rise / Math.max(2.5, 0.65 * t.w)), base: t.base, top, w: t.w * env, R: t.R });
    }
    return out;
  }

  /**
   * velocità dell'aria (m/s) nel punto: scrive in out {x,y,z}. glider: attiva le termiche.
   */
  sample(x, y, z, time, out, useThermals = true) {
    const agl = Math.max(0, y - terrainHeight(x, z));
    // il vento cresce con la quota (strato limite)
    const k = 0.62 + 0.38 * Math.min(1, agl / 350) + 0.25 * Math.min(1, agl / 2500);
    let vx = this.wx * k, vz = this.wz * k, vy = 0;

    // versanti: il vento che sale lungo il pendio solleva, quello che scende affonda
    if (this.speedKt > 1) {
      const d = 130;
      const gx = (terrainHeight(x + d, z) - terrainHeight(x - d, z)) / (2 * d), gz = (terrainHeight(x, z + d) - terrainHeight(x, z - d)) / (2 * d);
      vy += Math.max(-3, Math.min(4.5, (this.wx * gx + this.wz * gz) * 0.9)) * Math.exp(-agl / 380);
    }

    // turbolenza: somma di onde lente, più forte al suolo
    if (this.turbulence > 0) {
      const amp = this.turbulence * (0.25 + 0.07 * this.speedKt) * (1 + 1.2 * Math.exp(-agl / 250));
      const p = time * 0.9;
      vx += amp * (Math.sin(x * 0.011 + p * 1.3) * 0.6 + Math.sin(z * 0.017 - p * 0.7 + 2) * 0.4);
      vz += amp * (Math.sin(z * 0.013 + p * 1.1 + 1) * 0.6 + Math.sin(x * 0.019 + p * 0.9 + 4) * 0.4);
      vy += amp * 0.8 * (Math.sin(x * 0.009 + z * 0.012 + p * 1.7) * 0.6 + Math.sin(x * 0.021 - z * 0.015 + p * 1.2 + 3) * 0.4);
    }

    // termiche
    if (useThermals && this.thermals) {
      for (const s of this.sites) {
        if (Math.abs(x - s.x) > 9000 || Math.abs(z - s.z) > 9000) continue;
        for (const t of s.slots) {
          const age = (((time / t.life + t.phase) % 1) + 1) % 1;
          const env = Math.sin(Math.PI * age);
          if (env < 0.05) continue;
          const top = t.base + 1500 + 700 * env, h = y - t.base;
          if (h < 0 || h > top - t.base) continue;
          const up = Math.min(1, h / 120) * (1 - Math.min(1, Math.max(0, (h - (top - t.base) * 0.75) / ((top - t.base) * 0.25))));
          const drift = h / Math.max(2.5, 0.65 * t.w);               // la colonna si piega con il vento
          const dx = x - (t.sx + this.wx * drift), dz = z - (t.sz + this.wz * drift);
          const R = t.R * (1 + h / 1800);
          const r2 = (dx * dx + dz * dz) / (R * R);
          if (r2 > 9) continue;
          const core = Math.exp(-r2 * 1.6);                           // nucleo
          const sink = 0.22 * Math.exp(-Math.pow(Math.sqrt(r2) - 1.7, 2) * 2.2);   // aria che scende intorno
          vy += t.w * env * up * (core - sink);
        }
      }
    }
    out.x = vx; out.y = vy; out.z = vz;
    return out;
  }
}
