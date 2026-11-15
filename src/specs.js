import * as THREE from 'three';

/**
 * Dati di volo dei tre velivoli. Unità SI. Il modello è lo stesso per tutti (portanza lineare con stallo,
 * polare parabolica, momenti proporzionali alla pressione dinamica); cambiano i coefficienti.
 */
const V = (x, y, z) => new THREE.Vector3(x, y, z);

export const SPECS = {
  c172: {
    id: 'c172', name: 'Cessna 172', kind: 'prop',
    mass: 1100, S: 16.2, gearH: 1.25,
    contacts: [V(0, -1.25, -2.3), V(-1.1, -1.25, 0.3), V(1.1, -1.25, 0.3)],
    power: 135000, staticThrust: 3400, propEff: 0.78, thrustFn: 'prop',
    CLa: 5.0, a0: -0.08, a0Flap: -0.05, aHi: 0.30, aLo: -0.25,
    CD0: 0.028, k: 0.058, CDflap: 0.075, airbrakeCD: 0,
    vRef: 28, alphaTrim: 0.05,
    pitchGain: 2.2, rollGain: 2.4, yawGain: 1.2, pitchDamp: [1.2, 2.0], rollDamp: [1.5, 2.0], yawDamp: [1.0, 1.5],
    flaps: 3, flapStep: 10, tow: false, maxIasKt: 160,
    spawn: { speed: 45, agl: 450 },
  },
  mb339: {
    id: 'mb339', name: 'Aermacchi MB-339 PAN', kind: 'jet',
    mass: 5000, S: 19.3, gearH: 1.55,
    contacts: [V(0, -1.55, -4.6), V(-1.15, -1.55, 0.6), V(1.15, -1.55, 0.6)],
    power: 0, staticThrust: 17800, propEff: 1, thrustFn: 'jet',
    CLa: 4.4, a0: -0.05, a0Flap: -0.07, aHi: 0.30, aLo: -0.25,
    CD0: 0.024, k: 0.056, CDflap: 0.05, airbrakeCD: 0.055, machDrag: true,
    vRef: 62, alphaTrim: 0.05,
    pitchGain: 3.2, rollGain: 10.5, yawGain: 1.6, pitchDamp: [1.4, 2.0], rollDamp: [1.5, 2.0], yawDamp: [1.0, 1.5],
    flaps: 3, flapStep: 10, tow: false, maxIasKt: 520,
    spawn: { speed: 120, agl: 900 },
  },
  glider: {
    id: 'glider', name: 'Grob G 103C Twin III Acro I-IVVQ', kind: 'glider',
    mass: 580, S: 17.52, gearH: 0.95,
    contacts: [V(0, -0.95, -2.2), V(0, -0.95, 0.35), V(-8.5, -0.1, 0.4), V(8.5, -0.1, 0.4)],
    power: 0, staticThrust: 0, propEff: 1, thrustFn: 'none',
    CLa: 5.4, a0: -0.03, a0Flap: 0, aHi: 0.26, aLo: -0.25,
    CD0: 0.0098, k: 0.0205, CDflap: 0, airbrakeCD: 0.075,
    vRef: 24, alphaTrim: 0.06,
    pitchGain: 2.6, rollGain: 7.4, yawGain: 1.3, pitchDamp: [1.2, 2.0], rollDamp: [1.5, 2.0], yawDamp: [1.0, 1.5],
    flaps: 0, flapStep: 0, tow: true, maxIasKt: 140,
    spawn: { speed: 33, agl: 350 },
  },
};

export const AIRCRAFT_IDS = ['c172', 'mb339', 'glider'];
