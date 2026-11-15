import * as THREE from 'three';
import { terrainHeight, isOnRunway } from './world.js';
import { SPECS } from './specs.js';

const G = 9.81;
const RHO0 = 1.225;

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

const _q = new THREE.Quaternion();
const _dq = new THREE.Quaternion();
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _f = new THREE.Vector3();
const _e = new THREE.Euler();
const _w = { x: 0, y: 0, z: 0 };
const _vr = new THREE.Vector3();

export class Flight {
  constructor(onEvent) {
    this.onEvent = onEvent || (() => {});
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.quat = new THREE.Quaternion();
    this.w = new THREE.Vector3(); // rates corpo: x=beccheggio(+su), y=imbardata(+sx), z=rollio(+sx)
    this.input = { pitch: 0, roll: 0, rudder: 0, brake: false };
    this.spec = SPECS.c172;
    this.air = null;        // Atmosphere (vento, termiche)
    this.simTime = 0;
    this.wind = new THREE.Vector3();
    this.reset();
  }

  setSpec(spec) { this.spec = spec; }

  /** spawn = { x, z, yaw, y?, speed? }: in pista (speed assente) o in volo */
  reset(spawn = { x: 0, z: 540, yaw: 0 }) {
    const sp = this.spec;
    this.pos.set(spawn.x, spawn.y ?? terrainHeight(spawn.x, spawn.z) + sp.gearH, spawn.z);
    this.quat.setFromAxisAngle(_v1.set(0, 1, 0), spawn.yaw);
    // in volo: parte alla velocità di equilibrio (portanza = peso) per l'assetto di trim, così non innesca fugoidi
    let vSpawn = spawn.speed || 0;
    if (vSpawn) {
      const rho = RHO0 * Math.exp(-this.pos.y / 9000), clt = sp.CLa * (sp.alphaTrim - sp.a0);
      vSpawn = Math.sqrt((2 * sp.mass * G) / (rho * sp.S * clt));
    }
    this.vel.set(0, 0, -vSpawn).applyQuaternion(this.quat);
    if (spawn.speed) this.quat.multiply(_dq.setFromAxisAngle(_v2.set(1, 0, 0), sp.alphaTrim));   // già in assetto di volo livellato
    this.w.set(0, 0, 0);
    this.throttle = spawn.speed && sp.kind === 'prop' ? 0.55 : spawn.speed && sp.kind === 'jet' ? 0.5 : 0;
    this.towing = !!(sp.tow && !spawn.speed);
    this.brakeExt = 0;
    this.wind.set(0, 0, 0);
    this.flapTarget = 0;
    this.flapPos = 0;
    this.onGround = !spawn.speed;
    this.airTime = 0;
    this.crashed = false;
    this.stalled = false;
    this.prevOnGround = true;
    this.aoa = 0;
    this.load = 1;
    this.tas = this.vel.length();
    this.updateDerived();
  }

  get flapDeg() { return this.flapPos * this.spec.flapStep; }

  setFlaps(step) { this.flapTarget = clamp(this.flapTarget + step, 0, this.spec.flaps); }

  /** traino: sgancia (o riaggancia a terra) */
  toggleTow() {
    if (!this.spec.tow) return null;
    if (this.towing) { this.towing = false; this.onEvent({ type: 'release' }); }
    else if (this.onGround) this.towing = true;
    return this.towing;
  }

  step(dt) {
    if (this.crashed) { this.updateDerived(); return; }
    const sp = this.spec, MASS = sp.mass, S = sp.S;
    const { pos, vel, quat: q, w, input } = this;
    this.simTime += dt;

    // vento: l'aerodinamica vede la velocità rispetto all'aria
    if (this.air) { this.air.sample(pos.x, pos.y, pos.z, this.simTime, _w, sp.kind === 'glider'); this.wind.set(_w.x, _w.y, _w.z); }
    else this.wind.set(0, 0, 0);
    const vrel = _vr.copy(vel).sub(this.wind);

    // flap graduali
    const df = this.flapTarget - this.flapPos;
    this.flapPos += clamp(df, -1.2 * dt, 1.2 * dt);
    const fl = sp.flaps ? this.flapPos / sp.flaps : 0;
    // aerofreni (jet e aliante): solo in volo, con il tasto freni
    this.brakeExt += clamp((input.brake && !this.onGround && sp.airbrakeCD > 0 ? 1 : 0) - this.brakeExt, -2 * dt, 2 * dt);

    // velocità in assi corpo
    _q.copy(q).invert();
    const vb = _v1.copy(vrel).applyQuaternion(_q);
    const speed = vrel.length();
    const u = -vb.z; // velocità lungo l'asse longitudinale
    const uc = Math.max(u, 0.5);
    const alpha = Math.atan2(-vb.y, uc);
    const beta = Math.atan2(vb.x, uc);
    this.aoa = alpha;
    this.tas = speed;

    const dens = Math.exp(-pos.y / 9000);
    const rho = RHO0 * dens;
    const qbar = 0.5 * rho * speed * speed;

    // coefficiente di portanza (con stallo)
    const a0 = sp.a0 + sp.a0Flap * fl;
    const aHi = sp.aHi, aLo = sp.aLo, CLa = sp.CLa;
    const CLhi = CLa * (aHi - a0), CLlo = CLa * (aLo - a0);
    let CL;
    if (alpha > aHi) CL = Math.max(CLhi * (1 - 3.0 * (alpha - aHi)), 0.6);
    else if (alpha < aLo) CL = Math.min(CLlo * (1 - 3.0 * (aLo - alpha)), -0.4);
    else CL = CLa * (alpha - a0);
    CL *= 1 - 0.18 * this.brakeExt;
    this.stalled = alpha > aHi && speed > 8;

    let CD = sp.CD0 + sp.k * CL * CL + sp.CDflap * fl * fl + 0.35 * beta * beta + sp.airbrakeCD * this.brakeExt;
    if (sp.machDrag) { const m = speed / 340.3; if (m > 0.74) CD += 6 * (m - 0.74) ** 2; }
    if (alpha > aHi) CD += 2.0 * (alpha - aHi);
    else if (alpha < aLo) CD += 2.0 * (aLo - alpha);

    // spinta
    const thr = this.throttle;
    let thrust = 0;
    if (sp.thrustFn === 'prop') thrust = Math.min(sp.staticThrust * thr * dens, (sp.propEff * sp.power * thr * dens) / Math.max(u, 10));
    else if (sp.thrustFn === 'jet') thrust = sp.staticThrust * thr * Math.pow(dens, 0.85) * (1 - 0.0007 * Math.max(0, speed - 60));
    // aliante: traino semplificato (velivolo trainatore e fune non modellati): spinta lungo l'asse fino alla quota di sgancio
    if (this.towing) {
      const agl = pos.y - terrainHeight(pos.x, pos.z);
      if (agl > 520) { this.towing = false; this.onEvent({ type: 'release' }); }
      else thrust = clamp(1300 + 230 * (33 - Math.max(u, 0)), 0, 3500);
    }

    // forze
    _f.set(qbar * S * -0.9 * beta, qbar * S * CL, 0).applyQuaternion(q); // laterale + portanza
    _v2.set(0, 0, -1).applyQuaternion(q).multiplyScalar(thrust);
    _f.add(_v2);
    if (speed > 0.01) _f.addScaledVector(vrel, -(qbar * S * CD) / speed); // resistenza
    _f.y -= MASS * G;

    // frazione di peso sostenuta dalle ali (serve per attrito a terra)
    const liftN = qbar * S * CL;
    this.load = clamp(1 - liftN / (MASS * G), 0, 1);
    this.gLoad = liftN / (MASS * G);

    vel.addScaledVector(_f, dt / MASS);
    pos.addScaledVector(vel, dt);

    // momenti / rotazioni
    const e = clamp((u * u) / (sp.vRef * sp.vRef) + 0.12 * thr, 0.03, 1.6);
    const pd = sp.pitchDamp, rd = sp.rollDamp, yd = sp.yawDamp;
    // la rigidezza in beccheggio cresce vicino allo stallo: a barra tutta indietro
    // l'incidenza si ferma appena sotto l'angolo di stallo (si stalla solo troppo lenti)
    let ax = sp.pitchGain * e * input.pitch - (pd[0] + pd[1] * e) * w.x - 4.0 * e * (alpha - sp.alphaTrim)
      - 14 * e * Math.max(0, alpha - (aHi - 0.12));
    if (alpha > aHi && speed > 8) ax -= 8.0 * (alpha - aHi);
    const az = -sp.rollGain * e * input.roll - (rd[0] + rd[1] * e) * w.z + 1.5 * e * beta;
    const ay = -sp.yawGain * e * input.rudder - (yd[0] + yd[1] * e) * w.y - 2.5 * e * beta;
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
    for (const c of this.spec.contacts) {
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

    if (pen > 1.5) return this.crash('cTerrain');

    pos.y += pen;
    if (vel.y < 0) {
      const sink = -vel.y;
      if (this.airTime > 1.0) {
        const onRwy = isOnRunway(pos.x, pos.z);
        const roll = Math.abs(_e.z);
        if (sink > 5.0 || (!onRwy && sink > 3.5) || roll > 0.6 || (_e.x < -0.2 && speedH > 15)) {
          return this.crash(sink > 5 ? 'cHard' : roll > 0.6 ? 'cWing' : 'cControl');
        }
        const fpm = Math.round(sink * 196.85);
        const grade = sink < 1.2 ? 'good' : sink < 2.5 ? 'ok' : 'bad';
        const key = sink < 1.2 ? 'landSoft' : sink < 2.5 ? 'landGood' : 'landHard';
        this.onEvent({ type: 'landing', key, fpm, offRunway: !onRwy, grade });
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
    this.onEvent({ type: 'crash', reason });
  }

  updateDerived() {
    const { pos, vel, quat } = this;
    _e.setFromQuaternion(quat, 'YXZ');
    this.pitch = _e.x;
    this.bank = -_e.z; // + = ala destra giù
    const f = _v1.set(0, 0, -1).applyQuaternion(quat);
    this.heading = ((Math.atan2(f.x, -f.z) * 180) / Math.PI + 360) % 360;
    const gh = this.spec.gearH;
    this.ias = (this.tas ?? vel.length()) * Math.sqrt(Math.exp(-pos.y / 9000)) * 1.94384;   // velocità indicata (equivalente)
    this.gs = Math.hypot(vel.x, vel.z) * 1.94384;
    this.altFt = (pos.y - gh) * 3.28084;
    this.agl = pos.y - gh - terrainHeight(pos.x, pos.z);
    this.vsFpm = vel.y * 196.85;
    this.vsMs = vel.y;
    this.windKt = Math.hypot(this.wind.x, this.wind.z) * 1.94384;
    this.windFrom = ((Math.atan2(-this.wind.x, this.wind.z) * 180) / Math.PI + 360) % 360;
  }
}
