import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { createCessna } from '../src/aircraft.js';
import { createCockpit, EYE } from '../src/cockpit.js';

const q = new URLSearchParams(location.search);
const r = new THREE.WebGLRenderer({ antialias: true });
r.setSize(innerWidth, innerHeight);
r.shadowMap.enabled = true;
r.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(r.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9fc0e0);
scene.environment = new THREE.PMREMGenerator(r).fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.7;
const sun = new THREE.DirectionalLight(0xfff1dc, 3);
sun.position.set(6, 9, 5); sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
Object.assign(sun.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8, near: 1, far: 40 });
sun.shadow.bias = -0.0002; sun.shadow.normalBias = 0.02;
scene.add(sun);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 60).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x55843f, roughness: 1 }));
ground.position.y = -1.25; ground.receiveShadow = true;
scene.add(ground);
const plane = createCessna();
scene.add(plane.group);
const ck = createCockpit();
plane.group.add(ck.group);
ck.setActive(true);
ck.update({ input: { pitch: +(q.get('pitch') || 0), roll: 0 }, throttle: 0.75, ias: 95, bank: 0.05, pitch: 0.03, altFt: 2350, flapDeg: 0, heading: 28, vsFpm: 400 });
plane.animate({ pitch: 0, roll: 0, rudder: 0, flapDeg: +(q.get('flaps') || 0), time: 0, rpmNorm: +(q.get('rpm') || 0) });
const cam = new THREE.PerspectiveCamera(+(q.get('fov') || 40), innerWidth / innerHeight, 0.05, 200);
const az = +(q.get('az') || 35) * Math.PI / 180, el = +(q.get('el') || 14) * Math.PI / 180, d = +(q.get('d') || 14);
const tgt = new THREE.Vector3(+(q.get('tx') || 0), +(q.get('ty') || 0.2), +(q.get('tz') || 0.3));
if (q.get('pos')) { const p = q.get('pos').split(',').map(Number); cam.position.set(...p); } else
  cam.position.set(Math.sin(az) * Math.cos(el) * d, Math.sin(el) * d, Math.cos(az) * Math.cos(el) * d).add(tgt);
cam.lookAt(tgt);
if (q.get('inside')) { cam.position.copy(EYE); cam.lookAt(EYE.x + (+(q.get('yaw')||0))*0.5, EYE.y - 0.02 + (+(q.get('up')||0))*0.5, -5); cam.fov = +(q.get('fov')||70); cam.updateProjectionMatrix(); }
if (q.get('look')) { const p = q.get('look').split(',').map(Number); cam.lookAt(...p); }
r.render(scene, cam);
window.__ready = true;
