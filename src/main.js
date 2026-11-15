import * as THREE from 'three';
import { createWorld, AIRPORTS, spawnFor, localToWorld, terrainHeight } from './world.js';
import { getAircraft } from './fleet.js';
import { SPECS, AIRCRAFT_IDS } from './specs.js';
import { Atmosphere } from './atmosphere.js';
import { ThermalClouds } from './thermalvis.js';
import { createMenu } from './menu.js';
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
const atmosphere = new Atmosphere();
atmosphere.init();
const clouds = new ThermalClouds(scene);
let plane = null, cockpit = null, EYE = null, acId = 'c172';
let post = null; // composer (livelli 1-2); a livello 0 si disegna direttamente

const hud = new Hud();
const audio = new SimAudio();
let airportIdx = 0;

// impostazioni ricordate tra una sessione e l'altra
const SETTINGS_KEY = 'volaresim.settings.v1';
const settings = { aircraft: 'c172', start: 'rwy', windKt: 0, windDir: 270, turb: 30, thermals: true, help: true };
try { Object.assign(settings, JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}')); } catch { /* ignora */ }
if (!SPECS[settings.aircraft]) settings.aircraft = 'c172';
const saveSettings = () => { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* ignora */ } };
atmosphere.turbulence = settings.turb / 100;
atmosphere.thermals = settings.thermals;
atmosphere.setWind(settings.windKt, settings.windDir);

const flight = new Flight((ev) => {
  if (ev.type === 'release') { hud.message(t('released'), '', 'ok', 2.5); return; }
  if (ev.type === 'landing') {
    hud.message(t(ev.key), `${ev.fpm} ft/min${ev.offRunway ? ' — ' + t('offRunway') : ''}`, ev.grade, 5);
    audio.thump(ev.grade === 'good' ? 0.5 : ev.grade === 'ok' ? 1 : 1.8);
  } else if (ev.type === 'crash') {
    hud.message(t('crash'), `${t(ev.reason)} — ${t('pressR')}`, 'bad', 999);
    audio.thump(2.5);
  }
});
flight.air = atmosphere;

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

let gearOut = 1;
function applyCameraMode() {
  const id = CAMERAS[camIndex].id;
  if (cockpit) cockpit.setActive(id === 'cockpit');
  document.getElementById('adi').classList.toggle('hidden', id === 'cockpit');
  camera.near = id === 'cockpit' ? 0.08 : id === 'tower' ? 2 : 0.4;
  camera.fov = id === 'cockpit' ? zoom.cockpitFov : 60;
  camera.updateProjectionMatrix();
}

/** punto di partenza in volo: a monte di un massiccio, in rotta verso di esso, a quota AGL sopra la cima */
function airSpawn(agl) {
  const a = AIRPORTS[airportIdx];
  const sites = atmosphere.sites.filter((s) => Math.hypot(s.x - a.x, s.z - a.z) < 30000);
  const site = (sites.length ? sites : atmosphere.sites)[0];
  if (!site) return spawnFor(a);
  const wl = Math.hypot(atmosphere.wx, atmosphere.wz);
  // controvento verso il rilievo se c'è vento, altrimenti dall'aeroporto verso il rilievo
  let dx = wl > 1 ? -atmosphere.wx / wl : site.x - a.x, dz = wl > 1 ? -atmosphere.wz / wl : site.z - a.z;
  const dl = Math.hypot(dx, dz) || 1; dx /= dl; dz /= dl;
  const x = site.x - dx * 1800, z = site.z - dz * 1800;
  let top = 0;
  for (let i = -3; i <= 3; i++) for (let j = -3; j <= 3; j++) top = Math.max(top, terrainHeight(site.x + i * 500, site.z + j * 500));
  const y = Math.max(top, terrainHeight(x, z)) + agl;
  return { x, z, y, yaw: -Math.atan2(dx, -dz), speed: flight.spec.spawn.speed };
}

function reset() {
  const agl = settings.start === 'rwy' ? 0 : +settings.start;
  flight.reset(agl ? airSpawn(agl) : spawnFor(AIRPORTS[airportIdx]));
  camQuat.copy(flight.quat);
  hud.hideMessage();
  const kind = flight.spec.kind;
  const msg = agl ? t('readyAir') : kind === 'jet' ? t('readyJet') : kind === 'glider' ? t('readyGlider') : t('ready');
  hud.message(agl ? t('ac_' + acId) : AIRPORTS[airportIdx].name, msg, 'ok', 6);
  world.warmup?.(camera);
}

const ZOOMS = { c172: [13, 11], mb339: [21, 17], glider: [24, 19] };
function setAircraft(id, announce = true) {
  if (plane) plane.group.visible = false;
  acId = id; settings.aircraft = id; saveSettings();
  plane = getAircraft(id);
  if (!plane.group.parent) scene.add(plane.group);
  plane.group.visible = true;
  cockpit = plane.cockpit; EYE = plane.eye;
  flight.setSpec(SPECS[id]);
  zoom.chase = ZOOMS[id][0]; orbit.d = ZOOMS[id][1];
  gearOut = 1;
  hud.setAircraft(SPECS[id]);
  clouds.setVisible(id === 'glider' && settings.thermals);
  applyCameraMode();
  if (announce) reset();
}

const controls = new Controls(flight, {
  camera: () => {
    camIndex = (camIndex + 1) % CAMERAS.length;
    applyCameraMode();
    hud.message(t('camera'), t(CAMERAS[camIndex].name), 'ok', 1.2);
    menu.sync();
  },
  pause: () => { paused = !paused; },
  reset,
  help: () => { settings.help = hud.toggleHelp(); saveSettings(); menu.sync(); },
  tow: () => { const r = flight.toggleTow(); if (r === true) hud.message(t('readyGlider'), '', 'ok', 4); },
  menu: () => menu.toggle(),
  airport: () => { airportIdx = (airportIdx + 1) % AIRPORTS.length; reset(); menu.sync(); },
  mute: () => { audio.start(); hud.message(t('audio'), t(audio.toggleMute() ? 'audioOff' : 'audioOn'), 'ok', 1.2); menu.sync(); },
  notify: (key, d, raw) => hud.message(t(key), raw ? d : t(d), 'ok', 2.5),
  lang: () => { toggleLang(); hud.message(t('language'), t('langName'), 'ok', 1.2); },
  quality: () => { applyQuality((quality + 2) % 3, true, true); menu.sync(); },
});

// ---------------------------------------------------------------- menu a discesa
const menu = createMenu({
  aircraft: AIRCRAFT_IDS.map((id) => [id, 'ac_' + id]),
  airports: AIRPORTS.map((a, i) => [String(i), a.name, true]),
  cameras: CAMERAS.map((c, i) => [String(i), c.name]),
  qualities: QUALITY.map((q, i) => [String(i), q]),
  get: (k) => ({
    aircraft: acId, airport: airportIdx, start: settings.start, camera: camIndex, quality,
    windKt: settings.windKt, windDir: settings.windDir, turb: settings.turb, thermals: settings.thermals,
    sound: !audio.muted, help: !document.getElementById('help').classList.contains('hidden'), langName: t('langName'),
  })[k],
  set: (k, v) => {
    if (k === 'aircraft') setAircraft(v);
    else if (k === 'airport') { airportIdx = +v; reset(); }
    else if (k === 'start') { settings.start = v; saveSettings(); reset(); }
    else if (k === 'camera') { camIndex = +v; applyCameraMode(); }
    else if (k === 'quality') applyQuality(+v, true, true);
    else if (k === 'windKt' || k === 'windDir') { settings[k] = v; atmosphere.setWind(settings.windKt, settings.windDir); saveSettings(); }
    else if (k === 'turb') { settings.turb = v; atmosphere.turbulence = v / 100; saveSettings(); }
    else if (k === 'thermals') { settings.thermals = v; atmosphere.thermals = v; clouds.setVisible(acId === 'glider' && v); saveSettings(); }
    else if (k === 'sound') { audio.start(); if (audio.muted === v) audio.toggleMute(); }
    else if (k === 'help') { hud.toggleHelp(v); settings.help = v; saveSettings(); }
    else if (k === 'lang') { toggleLang(); menu.sync(); }
  },
  reset: () => controls.actions.reset(),
});
document.getElementById('helpClose').addEventListener('click', (e) => { controls.actions.help(); e.currentTarget.blur(); });
hud.toggleHelp(settings.help);

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
setAircraft(settings.aircraft, false);
reset();
menu.sync();

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
  if (plane.prop) {
    if (!paused) propAngle += (flight.crashed ? 0 : 8 + flight.throttle * 70) * dt;
    plane.prop.rotation.z = propAngle;
  }
  // carrello: fisso sul Cessna, si ritrae in volo su jet e aliante
  const gearTarget = flight.spec.kind === 'prop' || flight.onGround || flight.agl < 40 ? 1 : flight.agl > 90 ? 0 : gearOut > 0.5 ? 1 : 0;
  gearOut += Math.max(-1.6 * dt, Math.min(1.6 * dt, gearTarget - gearOut));
  plane.animate({ ...flight.input, flapDeg: flight.flapDeg, time, rpmNorm, brakeExt: flight.brakeExt, gearOut });
  cockpit.update(flight);

  const t0 = performance.now();
  updateCamera(dt);
  world.update(flight.pos, camera, dt, time);
  clouds.update(atmosphere, flight.simTime, dt, camera.position);
  const t1 = performance.now();
  updateNav();
  hud.setWind(settings.windKt < 1 ? t('calm') : String(settings.windDir).padStart(3, '0') + '° / ' + settings.windKt);
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
  flight, controls, camera, atmosphere, settings, setAircraft, menu, clouds, scene, THREE, setLang, world, renderer, gpuName, look,
  setAdaptive: (v) => { adaptive = v; },
  get resScale() { return resScale; }, get quality() { return quality; }, setResScale: (v) => { resScale = v; applyResolution(); },
  setCamera: (i) => { camIndex = i; applyCameraMode(); },
  setOrbit: (o) => Object.assign(orbit, o),
  setAirport: (i) => { airportIdx = i; reset(); },
  setQuality: (l) => applyQuality(l, false),
  camReset: () => camQuat.copy(flight.quat),
};
