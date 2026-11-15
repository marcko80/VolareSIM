import * as THREE from 'three';
import { terrainHeight, isOnRunway } from './world.js';

const G = 9.81;
const MASS = 1100;      // kg (Cessna 172 circa)
const S = 16.2;         // m² superficie alare
const RHO0 = 1.225;
export const GEAR_H = 1.25;
const POWER = 135000;   // W
const STATIC_THRUST = 3400; // N
const PROP_EFF = 0.78;

const CONTACTS = [
  new THREE.Vector3(0, -GEAR_H, -2.3),   // ruotino anteriore
  new THREE.Vector3(-1.1, -GEAR_H, 0.3), // principale sx
  new THREE.Vector3(1.1, -GEAR_H, 0.3),  // principale dx
];

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

const _q = new THREE.Quaternion();
const _dq = new THREE.Quaternion();
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _f = new THREE.Vector3();
const _e = new THREE.Euler();

export class Flight {
  constructor(onEvent) {
    this.onEvent = onEvent || (() => {});
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.quat = new THREE.Quaternion();
    this.w = new THREE.Vector3(); // rates corpo: x=beccheggio(+su), y=imbardata(+sx), z=rollio(+sx)
    this.input = { pitch: 0, roll: 0, rudder: 0, brake: false };
    this.reset();
  }

  /** spawn = { x, z, yaw } posizione di partenza in pista */
  reset(spawn = { x: 0, z: 540, yaw: 0 }) {
    this.pos.set(spawn.x, terrainHeight(spawn.x, spawn.z) + GEAR_H, spawn.z);
    this.vel.set(0, 0, 0);
    this.quat.setFromAxisAngle(_v1.set(0, 1, 0), spawn.yaw);
    this.w.set(0, 0, 0);
    this.throttle = 0;
    this.flapTarget = 0;
    this.flapPos = 0;
    this.onGround = true;
    this.airTime = 0;
    this.crashed = false;
    this.stalled = false;
    this.prevOnGround = true;
    this.aoa = 0;
    this.load = 1;
    this.updateDerived();
  }

  get flapDeg() { return this.flapPos * 10; }

  setFlaps(step) { this.flapTarget = clamp(this.flapTarget + step, 0, 3); }

  step(dt) {
    if (this.crashed) { this.updateDerived(); return; }
    const { pos, vel, quat: q, w, input } = this;

    // flap graduali
    const df = this.flapTarget - this.flapPos;
    this.flapPos += clamp(df, -1.2 * dt, 1.2 * dt);
    const fl = this.flapPos / 3;

    // velocità in assi corpo
    _q.copy(q).invert();
    const vb = _v1.copy(vel).applyQuaternion(_q);
    const speed = vel.length();
    const u = -vb.z; // velocità lungo l'asse longitudinale
    const uc = Math.max(u, 0.5);
    const alpha = Math.atan2(-vb.y, uc);
    const beta = Math.atan2(vb.x, uc);
    this.aoa = alpha;

    const dens = Math.exp(-pos.y / 9000);
    const rho = RHO0 * dens;
    const qbar = 0.5 * rho * speed * speed;

    // coefficiente di portanza (con stallo)
    const a0 = -0.08 - 0.05 * fl;
    const aHi = 0.30, aLo = -0.25;
    const CLhi = 5.0 * (aHi - a0), CLlo = 5.0 * (aLo - a0);
    let CL;
    if (alpha > aHi) CL = Math.max(CLhi * (1 - 3.0 * (alpha - aHi)), 0.6);
    else if (alpha < aLo) CL = Math.min(CLlo * (1 - 3.0 * (aLo - alpha)), -0.4);
    else CL = 5.0 * (alpha - a0);
    this.stalled = alpha > aHi && speed > 8;

    let CD = 0.028 + 0.058 * CL * CL + 0.075 * fl * fl + 0.35 * beta * beta;
    if (alpha > aHi) CD += 2.0 * (alpha - aHi);
    else if (alpha < aLo) CD += 2.0 * (aLo - alpha);

    // spinta (potenza costante con limite statico)
    const thr = this.throttle;
    const thrust = Math.min(STATIC_THRUST * thr * dens, (PROP_EFF * POWER * thr * dens) / Math.max(u, 10));

    // forze
    _f.set(qbar * S * -0.9 * beta, qbar * S * CL, 0).applyQuaternion(q); // laterale + portanza
    _v2.set(0, 0, -1).applyQuaternion(q).multiplyScalar(thrust);
    _f.add(_v2);
    if (speed > 0.01) _f.addScaledVector(vel, -(qbar * S * CD) / speed); // resistenza
    _f.y -= MASS * G;

    // frazione di peso sostenuta dalle ali (serve per attrito a terra)
    const liftN = qbar * S * CL;
    this.load = clamp(1 - liftN / (MASS * G), 0, 1);

    vel.addScaledVector(_f, dt / MASS);
    pos.addScaledVector(vel, dt);

    // momenti / rotazioni
    const e = clamp((u * u) / (28 * 28) + 0.12 * thr, 0.03, 1.6);
    const alphaTrim = 0.05;
    // la rigidezza in beccheggio cresce vicino allo stallo: a barra tutta indietro
    // l'incidenza si ferma appena sotto l'angolo di stallo (si stalla solo troppo lenti)
    let ax = 2.2 * e * input.pitch - (1.2 + 2.0 * e) * w.x - 4.0 * e * (alpha - alphaTrim)
      - 14 * e * Math.max(0, alpha - 0.18);
    if (alpha > aHi && speed > 8) ax -= 8.0 * (alpha - aHi);
    const az = -2.4 * e * input.roll - (1.5 + 2.0 * e) * w.z + 1.5 * e * beta;
    const ay = -1.2 * e * input.rudder - (1.0 + 1.5 * e) * w.y - 2.5 * e * beta;
    w.x += ax * dt; w.y += ay * dt; w.z += az * dt;

    // buffeting in stallo
    if (this.stalled) { w.z += (Math.random() - 0.5) * 1.2 * dt * 10; w.x += (Math.random() - 0.5) * 0.3 * dt * 10; }

    const wl = w.length();
    if (wl > 1e-6) {
      _dq.setFromAxisAngle(_v2.copy(w).divideScalar(wl), wl * dt);
      q.multiply(_dq).normalize();
    }

    this.resolveGround(dt, u);
    this.updateDerived();
  }

  resolveGround(dt, u) {
    const { pos, vel, quat: q, w, input } = this;

    let pen = 0;
    for (const c of CONTACTS) {
      const p = _v1.copy(c).applyQuaternion(q).add(pos);
      const d = terrainHeight(p.x, p.z) - p.y;
      if (d > pen) pen = d;
    }

    if (pen <= 0) {
      this.onGround = false;
      this.airTime += dt;
      return;
    }

    _e.setFromQuaternion(q, 'YXZ');
    const speedH = Math.hypot(vel.x, vel.z);

    if (pen > 1.5) return this.crash('Impatto contro il terreno');

    pos.y += pen;
    if (vel.y < 0) {
      const sink = -vel.y;
      if (this.airTime > 1.0) {
        const onRwy = isOnRunway(pos.x, pos.z);
        const roll = Math.abs(_e.z);
        if (sink > 5.0 || (!onRwy && sink > 3.5) || roll > 0.6 || (_e.x < -0.2 && speedH > 15)) {
          return this.crash(sink > 5 ? 'Impatto violento' : roll > 0.6 ? 'Ala toccata a terra' : 'Atterraggio fuori controllo');
        }
        const fpm = Math.round(sink * 196.85);
        const grade = sink < 1.2 ? 'good' : sink < 2.5 ? 'ok' : 'bad';
        const text = sink < 1.2 ? 'Atterraggio morbido' : sink < 2.5 ? 'Atterraggio buono' : 'Atterraggio duro';
        this.onEvent({ type: 'landing', text, detail: `${fpm} ft/min${onRwy ? '' : ' — fuori pista'}`, grade });
      }
      vel.y = 0;
    }
    this.onGround = true;
    this.airTime = 0;

    // assetto a terra
    let pitch = _e.x, roll = _e.z;
    if (pitch < 0) { pitch = 0; if (w.x < 0) w.x = 0; }
    if (pitch > 0.22) { pitch = 0.22; if (w.x > 0) w.x = 0; }
    roll *= Math.exp(-8 * dt);
    w.z = 0;
    q.setFromEuler(_e.set(pitch, _e.y, roll, 'YXZ'));

    // attrito e frenata sul piano orizzontale
    const fwd = _v1.set(0, 0, -1).applyQuaternion(q);
    fwd.y = 0; fwd.normalize();
    const right = _v2.set(-fwd.z, 0, fwd.x);
    let vF = vel.x * fwd.x + vel.z * fwd.z;
    let vR = vel.x * right.x + vel.z * right.z;
    vR *= Math.exp(-6 * dt * this.load);
    const mu = isOnRunway(pos.x, pos.z) ? 0.02 : 0.09;
    const decel = (mu + (input.brake ? 0.5 : 0)) * G * this.load * dt;
    vF = Math.sign(vF) * Math.max(Math.abs(vF) - decel, 0);
    vel.x = fwd.x * vF + right.x * vR;
    vel.z = fwd.z * vF + right.z * vR;

    // sterzo del ruotino / pedaliera
    if (this.load > 0.4) {
      const sp = Math.max(u, 0);
      w.y = -input.rudder * 0.55 * Math.min(sp / 5, 1) / (1 + sp / 22);
    }
  }

  crash(reason) {
    this.crashed = true;
    this.vel.set(0, 0, 0);
    this.w.set(0, 0, 0);
    this.onEvent({ type: 'crash', text: 'INCIDENTE', detail: reason });
  }

  updateDerived() {
    const { pos, vel, quat } = this;
    _e.setFromQuaternion(quat, 'YXZ');
    this.pitch = _e.x;
    this.bank = -_e.z; // + = ala destra giù
    const f = _v1.set(0, 0, -1).applyQuaternion(quat);
    this.heading = ((Math.atan2(f.x, -f.z) * 180) / Math.PI + 360) % 360;
    this.ias = vel.length() * 1.94384;
    this.altFt = (pos.y - GEAR_H) * 3.28084;
    this.agl = pos.y - GEAR_H - terrainHeight(pos.x, pos.z);
    this.vsFpm = vel.y * 196.85;
  }
}
