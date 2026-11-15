import * as THREE from 'three';
import { createWorld, AIRPORTS, spawnFor, localToWorld, terrainHeight } from './world.js';
import { createCessna } from './aircraft.js';
import { createCockpit, EYE } from './cockpit.js';
import { Flight } from './flight.js';
import { Controls } from './controls.js';
import { Hud } from './hud.js';
import { SimAudio } from './audio.js';
import { PostFX } from './postfx.js';
import { t, applyStatic, toggleLang, setLang } from './i18n.js';

applyStatic();
// lascia dipingere la schermata di caricamento prima del lavoro pesante (texture procedurali, terreno)
await Promise.race([new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))), new Promise((r) => setTimeout(r, 250))]);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
document.getElementById('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.4, 40000);

const world = await createWorld(scene, renderer);
const plane = createCessna();
scene.add(plane.group);
const cockpit = createCockpit();
plane.group.add(cockpit.group);
let post = null; // composer (livelli 1-2); a livello 0 si disegna direttamente

const hud = new Hud();
const audio = new SimAudio();
let airportIdx = 0;

const flight = new Flight((ev) => {
  if (ev.type === 'landing') {
    hud.message(t(ev.key), `${ev.fpm} ft/min${ev.offRunway ? ' — ' + t('offRunway') : ''}`, ev.grade, 5);
    audio.thump(ev.grade === 'good' ? 0.5 : ev.grade === 'ok' ? 1 : 1.8);
  } else if (ev.type === 'crash') {
    hud.message(t('crash'), `${t(ev.reason)} — ${t('pressR')}`, 'bad', 999);
    audio.thump(2.5);
  }
});

// ---------------------------------------------------------------- qualità grafica
const QUALITY = ['qLow', 'qMed', 'qHigh'];
let holdUntil = 0; // dopo ogni cambio di qualità/risoluzione il controllo adattivo resta fermo (ricompilazione shader)
// GPU integrata (Intel UHD/Iris): parte da qualità media e risoluzione ridotta; la risoluzione si adatta da sola
const gpuName = (() => {
  try { const gl = renderer.getContext(); const e = gl.getExtension('WEBGL_debug_renderer_info'); return e ? String(gl.getParameter(e.UNMASKED_RENDERER_WEBGL)) : ''; } catch { return ''; }
})();
const integrated = /intel/i.test(gpuName) && !/\barc\b/i.test(gpuName);
// livello predefinito: Alta solo su GPU di fascia alta (RTX, Radeon RX serie 5000+); altrimenti Media
const highEnd = /RTX|RX ?[5-9]\d{3}|Radeon Pro W|Apple/i.test(gpuName);
let quality = highEnd ? 2 : 1;
// la chiave è nuova: le versioni precedenti salvavano anche il livello predefinito, non solo le scelte manuali
try { const q = parseInt(localStorage.getItem('volaresim.quality.v2'), 10); if (q >= 0 && q <= 2) quality = q; } catch { /* ignora */ }
const basePR = Math.min(window.devicePixelRatio, 2);
let resScale = integrated ? 0.75 : 1;
function applyResolution() {
  renderer.setPixelRatio(basePR * resScale);
  renderer.setSize(window.innerWidth, window.innerHeight);
  post?.setSize(window.innerWidth, window.innerHeight);
}
function applyQuality(level, announce, persist = false) {
  quality = level;
  holdUntil = performance.now() / 1000 + 4;
  if (post) { post.dispose(); post = null; }
  if (level > 0) post = new PostFX(renderer, scene, camera, level);
  world.setQuality(level);
  applyResolution();
  if (persist) { try { localStorage.setItem('volaresim.quality.v2', String(level)); } catch { /* ignora */ } }
  if (announce) hud.message(t('quality'), t(QUALITY[level]), 'ok', 1.5);
}

// ---------------------------------------------------------------- camere
let paused = false;
const CAMERAS = [
  { id: 'chase', name: 'camChase' },
  { id: 'cockpit', name: 'camCockpit' },
  { id: 'tower', name: 'camTower' },
  { id: 'orbit', name: 'camOrbit' },
];
let camIndex = 0;
const camQuat = new THREE.Quaternion();
const look = { yaw: 0, pitch: 0, drag: false };
const orbit = { az: 0.7, el: 0.28, d: 11 };
const zoom = { chase: 13, cockpitFov: 72 };

function applyCameraMode() {
  const id = CAMERAS[camIndex].id;
  cockpit.setActive(id === 'cockpit');
  document.getElementById('adi').classList.toggle('hidden', id === 'cockpit');
  camera.near = id === 'cockpit' ? 0.08 : id === 'tower' ? 2 : 0.4;
  camera.fov = id === 'cockpit' ? zoom.cockpitFov : 60;
  camera.updateProjectionMatrix();
}

function reset() {
  flight.reset(spawnFor(AIRPORTS[airportIdx]));
  camQuat.copy(flight.quat);
  hud.hideMessage();
  hud.message(AIRPORTS[airportIdx].name, t('ready'), 'ok', 5);
  world.warmup?.(camera);
}

const controls = new Controls(flight, {
  camera: () => {
    camIndex = (camIndex + 1) % CAMERAS.length;
    applyCameraMode();
    hud.message(t('camera'), t(CAMERAS[camIndex].name), 'ok', 1.2);
  },
  pause: () => { paused = !paused; },
  reset,
  help: () => hud.toggleHelp(),
  airport: () => { airportIdx = (airportIdx + 1) % AIRPORTS.length; reset(); },
  mute: () => { audio.start(); hud.message(t('audio'), t(audio.toggleMute() ? 'audioOff' : 'audioOn'), 'ok', 1.2); },
  notify: (key, d, raw) => hud.message(t(key), raw ? d : t(d), 'ok', 2.5),
  lang: () => { toggleLang(); hud.message(t('language'), t('langName'), 'ok', 1.2); },
  quality: () => applyQuality((quality + 2) % 3, true, true),
});

const wake = () => audio.start();
window.addEventListener('keydown', wake);
window.addEventListener('pointerdown', wake);
window.addEventListener('gamepadconnected', wake);

// mouse: sguardo (cockpit/inseguimento) o orbita; rotella: zoom
const dom = renderer.domElement;
dom.addEventListener('pointerdown', (e) => { look.drag = true; dom.setPointerCapture(e.pointerId); });
dom.addEventListener('pointerup', () => { look.drag = false; });
dom.addEventListener('pointermove', (e) => {
  if (!look.drag) return;
  if (CAMERAS[camIndex].id === 'orbit') {
    orbit.az -= e.movementX * 0.006;
    orbit.el = THREE.MathUtils.clamp(orbit.el + e.movementY * 0.006, -0.3, 1.45);
  } else {
    look.yaw -= e.movementX * 0.005;
    look.pitch = THREE.MathUtils.clamp(look.pitch - e.movementY * 0.005, -1.2, 1.2);
  }
});
dom.addEventListener('wheel', (e) => {
  e.preventDefault();
  const id = CAMERAS[camIndex].id, k = Math.sign(e.deltaY);
  if (id === 'cockpit') { zoom.cockpitFov = THREE.MathUtils.clamp(zoom.cockpitFov + k * 4, 38, 95); camera.fov = zoom.cockpitFov; camera.updateProjectionMatrix(); }
  else if (id === 'chase') zoom.chase = THREE.MathUtils.clamp(zoom.chase * (1 + k * 0.08), 6, 40);
  else if (id === 'orbit') orbit.d = THREE.MathUtils.clamp(orbit.d * (1 + k * 0.08), 4, 60);
}, { passive: false });

const _e = new THREE.Euler();
const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

function updateCamera(dt) {
  const id = CAMERAS[camIndex].id;
  const p = flight.pos;
  if (!look.drag) { const k = Math.exp(-3 * dt); look.yaw *= k; look.pitch *= k; }
  _e.set(look.pitch, look.yaw, 0, 'YXZ');

  if (id === 'cockpit') {
    camera.position.copy(EYE).applyQuaternion(flight.quat).add(p);
    camera.quaternion.copy(flight.quat).multiply(_q.setFromEuler(_e));
  } else if (id === 'chase') {
    camQuat.slerp(flight.quat, 1 - Math.exp(-3 * dt));
    camera.position.set(0, zoom.chase * 0.21, zoom.chase).applyEuler(_e).applyQuaternion(camQuat).add(p);
    const gh = terrainHeight(camera.position.x, camera.position.z) + 2;
    if (camera.position.y < gh) camera.position.y = gh;
    camera.up.set(0, 1, 0);
    camera.lookAt(p.x, p.y + 0.8, p.z);
  } else if (id === 'tower') {
    const a = AIRPORTS[airportIdx];
    const tw = localToWorld(a, 135, a.length * 0.12);
    camera.position.set(tw.x, a.elev + 14, tw.z);
    camera.up.set(0, 1, 0);
    camera.lookAt(p);
    const dist = camera.position.distanceTo(p);
    const fov = THREE.MathUtils.clamp((Math.atan(9 / dist) * 2 * 180) / Math.PI, 4, 60);
    if (Math.abs(fov - camera.fov) > 0.05) { camera.fov = fov; camera.updateProjectionMatrix(); }
  } else {
    // orbita attorno all'aereo, relativa alla sua prua
    const yaw = -THREE.MathUtils.degToRad(flight.heading);
    _v.set(Math.sin(orbit.az) * Math.cos(orbit.el), Math.sin(orbit.el), Math.cos(orbit.az) * Math.cos(orbit.el)).multiplyScalar(orbit.d);
    _v.applyAxisAngle(UP, yaw);
    camera.position.copy(p).add(_v);
    const gh = terrainHeight(camera.position.x, camera.position.z) + 1;
    if (camera.position.y < gh) camera.position.y = gh;
    camera.up.set(0, 1, 0);
    camera.lookAt(p.x, p.y + 0.4, p.z);
  }
}

function updateNav() {
  let best = 0, bd = Infinity;
  AIRPORTS.forEach((a, i) => {
    const d = Math.hypot(a.x - flight.pos.x, a.z - flight.pos.z);
    if (d < bd) { bd = d; best = i; }
  });
  const dest = AIRPORTS[(best + 1) % AIRPORTS.length];
  const dx = dest.x - flight.pos.x, dz = dest.z - flight.pos.z;
  const brg = ((Math.atan2(dx, -dz) * 180) / Math.PI + 360) % 360;
  hud.setNav(`${AIRPORTS[best].name} · ${(bd / 1000).toFixed(1)} km`,
    `→ ${dest.name}  ${String(Math.round(brg) % 360).padStart(3, '0')}°  ${(Math.hypot(dx, dz) / 1000).toFixed(1)} km`);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  applyResolution();
});

document.getElementById('lang').addEventListener('click', (e) => { controls.actions.lang(); e.currentTarget.blur(); });
applyQuality(quality, false);
applyCameraMode();
reset();

const STEP = 1 / 120;
let last = performance.now(), acc = 0, propAngle = 0, time = 0;
let winT = 0, winN = 0, lowCount = 0, highCount = 0, frames = 0, adaptive = true;

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  time += dt;

  controls.update(dt);
  if (!paused) {
    acc += dt;
    while (acc >= STEP) { flight.step(STEP); acc -= STEP; }
  }

  plane.group.position.copy(flight.pos);
  plane.group.quaternion.copy(flight.quat);
  const rpmNorm = flight.crashed ? 0 : Math.min(1, flight.throttle * 1.15);
  if (!paused) propAngle += (flight.crashed ? 0 : 8 + flight.throttle * 70) * dt;
  plane.prop.rotation.z = propAngle;
  plane.animate({ ...flight.input, flapDeg: flight.flapDeg, time, rpmNorm });
  cockpit.update(flight);

  const t0 = performance.now();
  updateCamera(dt);
  world.update(flight.pos, camera, dt, time);
  const t1 = performance.now();
  updateNav();
  hud.update(flight, dt, paused);
  audio.update(flight, dt, paused, CAMERAS[camIndex].id === 'cockpit');
  const t2 = performance.now();
  if (post) post.render(dt); else renderer.render(scene, camera);
  const t3 = performance.now();
  const P = window.__prof;
  if (P) { P.world = Math.max(P.world, t1 - t0); P.ui = Math.max(P.ui, t2 - t1); P.render = Math.max(P.render, t3 - t2); }

  // qualità adattiva: se il frame rate resta basso per qualche secondo, scende di un livello
  frames++;
  if (adaptive && frames > 150 && performance.now() / 1000 > holdUntil && !paused && document.visibilityState === 'visible') {
    winT += dt; winN++;
    if (winT >= 1.5) {
      const avg = winT / winN;
      winT = 0; winN = 0;
      if (avg > 0.0245) {                      // sotto ~41 fps
        highCount = 0;
        if (resScale > 0.56) { resScale = Math.max(0.55, resScale * 0.88); applyResolution(); lowCount = 0; }
        else if (++lowCount >= 2 && quality > 0) { lowCount = 0; resScale = 0.8; applyQuality(quality - 1, true); }
      } else if (avg < 0.0178 && resScale < 1) { // stabilmente a 60 fps: riporta su la risoluzione
        lowCount = 0;
        if (++highCount >= 3) { resScale = Math.min(1, resScale * 1.08); applyResolution(); highCount = 0; }
      } else { lowCount = 0; highCount = 0; }
    }
  }
  if (frames === 3) document.getElementById('loading')?.classList.add('done');
}
requestAnimationFrame(frame);

// utile per debug e per gli screenshot
window.__sim = {
  flight, controls, camera, scene, THREE, setLang, world, renderer, gpuName, look,
  setAdaptive: (v) => { adaptive = v; },
  get resScale() { return resScale; }, get quality() { return quality; }, setResScale: (v) => { resScale = v; applyResolution(); },
  setCamera: (i) => { camIndex = i; applyCameraMode(); },
  setOrbit: (o) => Object.assign(orbit, o),
  setAirport: (i) => { airportIdx = i; reset(); },
  setQuality: (l) => applyQuality(l, false),
  camReset: () => camQuat.copy(flight.quat),
};
