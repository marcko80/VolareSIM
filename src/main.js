import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { createWorld, AIRPORTS, spawnFor, localToWorld, terrainHeight } from './world.js';
import { createCessna } from './aircraft.js';
import { createCockpit, EYE } from './cockpit.js';
import { Flight } from './flight.js';
import { Controls } from './controls.js';
import { Hud } from './hud.js';
import { SimAudio } from './audio.js';
import { t, applyStatic, toggleLang, setLang } from './i18n.js';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
document.getElementById('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.15, 40000);

// riflessi morbidi sulla carrozzeria
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
if ('environmentIntensity' in scene) scene.environmentIntensity = 0.45;

const world = createWorld(scene);
const plane = createCessna();
scene.add(plane.group);
const cockpit = createCockpit();
plane.group.add(cockpit.group);

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

let paused = false;
const CAMERAS = [
  { id: 'chase', name: 'camChase' },
  { id: 'cabin', name: 'camCabin' },
  { id: 'cockpit', name: 'camCockpit' },
  { id: 'tower', name: 'camTower' },
];
let camIndex = 0;
const camQuat = new THREE.Quaternion();
const cockpitFrame = document.getElementById('cockpit-frame');
const look = { yaw: 0, pitch: 0, drag: false };

function applyCameraMode() {
  const id = CAMERAS[camIndex].id;
  plane.exterior.visible = id !== 'cabin' && id !== 'cockpit';
  cockpit.group.visible = id === 'cockpit';
  cockpitFrame.classList.toggle('hidden', id !== 'cabin');
  document.getElementById('adi').classList.toggle('hidden', id === 'cockpit'); // c'è l'orizzonte nel cruscotto
  camera.fov = id === 'cockpit' ? 75 : id === 'cabin' ? 70 : 60;
  camera.updateProjectionMatrix();
}

function reset() {
  flight.reset(spawnFor(AIRPORTS[airportIdx]));
  camQuat.copy(flight.quat);
  hud.hideMessage();
  hud.message(AIRPORTS[airportIdx].name, t('ready'), 'ok', 5);
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
});

// l'audio parte alla prima interazione (policy dei browser)
const wake = () => audio.start();
window.addEventListener('keydown', wake);
window.addEventListener('pointerdown', wake);
window.addEventListener('gamepadconnected', wake);

// sguardo con il mouse
const dom = renderer.domElement;
dom.addEventListener('pointerdown', (e) => { look.drag = true; dom.setPointerCapture(e.pointerId); });
dom.addEventListener('pointerup', () => { look.drag = false; });
dom.addEventListener('pointermove', (e) => {
  if (!look.drag) return;
  look.yaw -= e.movementX * 0.005;
  look.pitch = THREE.MathUtils.clamp(look.pitch - e.movementY * 0.005, -1.2, 1.2);
});

const _e = new THREE.Euler();
const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();

function updateCamera(dt) {
  const id = CAMERAS[camIndex].id;
  const p = flight.pos;
  if (!look.drag) { const k = Math.exp(-3 * dt); look.yaw *= k; look.pitch *= k; }
  _e.set(look.pitch, look.yaw, 0, 'YXZ');

  if (id === 'cockpit' || id === 'cabin') {
    const eye = id === 'cockpit' ? EYE : _v.copy(EYE).setY(EYE.y + 0.3);
    camera.position.copy(eye).applyQuaternion(flight.quat).add(p);
    camera.quaternion.copy(flight.quat).multiply(_q.setFromEuler(_e));
  } else if (id === 'chase') {
    camQuat.slerp(flight.quat, 1 - Math.exp(-3 * dt));
    camera.position.set(0, 2.8, 13).applyEuler(_e).applyQuaternion(camQuat).add(p);
    const gh = terrainHeight(camera.position.x, camera.position.z) + 2;
    if (camera.position.y < gh) camera.position.y = gh;
    camera.up.set(0, 1, 0);
    camera.lookAt(p.x, p.y + 0.8, p.z);
  } else {
    const a = AIRPORTS[airportIdx];
    const t = localToWorld(a, 135, a.length * 0.12);
    camera.position.set(t.x, a.elev + 14, t.z);
    camera.up.set(0, 1, 0);
    camera.lookAt(p);
    const dist = camera.position.distanceTo(p);
    const fov = THREE.MathUtils.clamp((Math.atan(9 / dist) * 2 * 180) / Math.PI, 4, 60);
    if (Math.abs(fov - camera.fov) > 0.05) { camera.fov = fov; camera.updateProjectionMatrix(); }
  }
}

// aeroporto più vicino e destinazione (l'altro)
function updateNav() {
  let best = 0, bd = Infinity;
  AIRPORTS.forEach((a, i) => {
    const d = Math.hypot(a.x - flight.pos.x, a.z - flight.pos.z);
    if (d < bd) { bd = d; best = i; }
  });
  const dest = AIRPORTS[(best + 1) % AIRPORTS.length];
  const dx = dest.x - flight.pos.x, dz = dest.z - flight.pos.z;
  const brg = ((Math.atan2(dx, -dz) * 180) / Math.PI + 360) % 360;
  const km = Math.hypot(dx, dz) / 1000;
  hud.setNav(`${AIRPORTS[best].name} · ${(bd / 1000).toFixed(1)} km`,
    `→ ${dest.name}  ${String(Math.round(brg) % 360).padStart(3, '0')}°  ${km.toFixed(1)} km`);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

applyStatic();
document.getElementById('lang').addEventListener('click', (e) => { controls.actions.lang(); e.currentTarget.blur(); });
reset();
applyCameraMode();

const STEP = 1 / 120;
let last = performance.now();
let acc = 0;
let propAngle = 0;
let time = 0;

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
  const rpm = flight.crashed ? 0 : 8 + flight.throttle * 70;
  if (!paused) propAngle += rpm * dt;
  plane.prop.rotation.z = propAngle;
  plane.disc.material.opacity = Math.min(0.28, flight.throttle * 0.35) * (flight.crashed ? 0 : 1);
  plane.animate({ ...flight.input, flapDeg: flight.flapDeg, time });
  if (cockpit.group.visible) cockpit.update(flight);

  updateCamera(dt);
  world.update(flight.pos, camera);
  updateNav();
  hud.update(flight, dt, paused);
  audio.update(flight, dt, paused, CAMERAS[camIndex].id === 'cabin' || CAMERAS[camIndex].id === 'cockpit');
  renderer.render(scene, camera);
}
requestAnimationFrame(frame);

// utile per il debug dalla console del browser
window.__sim = {
  flight, controls, camera, scene, THREE, setLang,
  setCamera: (i) => { camIndex = i; applyCameraMode(); },
  setAirport: (i) => { airportIdx = i; reset(); },
  camReset: () => camQuat.copy(flight.quat),
};
