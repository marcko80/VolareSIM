import { createCessna } from './aircraft.js';
import { createCockpit, EYE } from './cockpit.js';
import { createMB339 } from './jet.js';
import { createGlider } from './glider.js';
import { SPECS } from './specs.js';

/**
 * Costruisce (una sola volta) il modello 3D, l'abitacolo e l'occhio del pilota di ogni velivolo.
 * Interfaccia: { spec, group, cockpit, eye, animate(ctrl), spin(angle, rpmNorm) }
 */
const cache = {};

export function getAircraft(id) {
  if (cache[id]) return cache[id];
  let a;
  if (id === 'c172') {
    const plane = createCessna();
    const cockpit = createCockpit();
    plane.group.add(cockpit.group);
    a = { group: plane.group, cockpit, eye: EYE, prop: plane.prop, animate: plane.animate };
  } else if (id === 'mb339') a = createMB339();
  else a = createGlider();
  a.spec = SPECS[id];
  a.group.visible = false;
  cache[id] = a;
  return a;
}
