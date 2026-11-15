import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// ---------------------------------------------------------------- aeroporti
// heading = prua di decollo (gradi) dalla testata di partenza; elev = quota (m)
const RAW_AIRPORTS = [
  { id: 'A', name: 'Volare Intl', x: 0, z: 0, elev: 0, heading: 0, length: 1200, width: 30, nums: ['36', '18'] },
  { id: 'B', name: 'Monte Alto', x: 4200, z: -7500, elev: 90, heading: 60, length: 900, width: 25, nums: ['06', '24'] },
];

export const AIRPORTS = RAW_AIRPORTS.map((a) => {
  const th = (-a.heading * Math.PI) / 180; // rotazione attorno a Y
  return { ...a, th, c: Math.cos(th), s: Math.sin(th) };
});

export function localToWorld(a, lx, lz) {
  return { x: a.x + lx * a.c + lz * a.s, z: a.z - lx * a.s + lz * a.c };
}
export function worldToLocal(a, x, z) {
  const dx = x - a.x, dz = z - a.z;
  return [dx * a.c - dz * a.s, dx * a.s + dz * a.c];
}
/** posizione di partenza (testata di decollo) */
export function spawnFor(a) {
  const p = localToWorld(a, 0, a.length / 2 - 60);
  return { x: p.x, z: p.z, yaw: a.th };
}

/** distanza dal rettangolo "piatto" dell'aeroporto (pista + margini) */
function flatDist(a, x, z) {
  const [lx, lz] = worldToLocal(a, x, z);
  return Math.hypot(Math.max(Math.abs(lx) - 60, 0), Math.max(Math.abs(lz) - a.length / 2 - 100, 0));
}
export function airportDist(x, z) {
  let d = Infinity;
  for (const a of AIRPORTS) d = Math.min(d, flatDist(a, x, z));
  return d;
}

export function isOnRunway(x, z) {
  for (const a of AIRPORTS) {
    const [lx, lz] = worldToLocal(a, x, z);
    if (Math.abs(lx) < a.width / 2 + 4 && Math.abs(lz) < a.length / 2 + 20) return true;
  }
  return false;
}

function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Altezza del terreno (m). Piatto attorno agli aeroporti, colline altrove. */
export function terrainHeight(x, z) {
  let h = 90 * (0.5 + 0.5 * Math.sin(x * 0.0011 + Math.sin(z * 0.0007) * 2.0));
  h += 60 * Math.sin(x * 0.0031 + 1.3) * Math.sin(z * 0.0027);
  h += 22 * Math.sin(x * 0.009 + z * 0.007);
  h += 8 * Math.sin(x * 0.03) * Math.sin(z * 0.027);
  h = Math.max(0, h);
  for (const a of AIRPORTS) {
    const w = smoothstep(250, 1700, flatDist(a, x, z));
    if (w < 1) h = a.elev + (h - a.elev) * w;
  }
  return h;
}

// ---------------------------------------------------------------- cielo
const HORIZON = new THREE.Color(0xbcd7ee);
const ZENITH = new THREE.Color(0x2b64b8);

function makeSky(sunDir) {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      sunDir: { value: sunDir },
      horCol: { value: HORIZON },
      topCol: { value: ZENITH },
    },
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      varying vec3 vDir;
      uniform vec3 sunDir, horCol, topCol;
      void main() {
        vec3 d = normalize(vDir);
        float h = clamp(d.y, 0.0, 1.0);
        vec3 c = mix(horCol, topCol, pow(h, 0.45));
        float s = max(dot(d, sunDir), 0.0);
        c += vec3(1.0, 0.92, 0.75) * (pow(s, 1200.0) * 4.0 + pow(s, 12.0) * 0.18 + pow(s, 3.0) * 0.04);
        if (d.y < 0.0) c = horCol;
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(20000, 32, 16), mat);
  mesh.renderOrder = -1;
  mesh.frustumCulled = false;
  return mesh;
}

// ---------------------------------------------------------------- texture
function makeRunwayTexture(a) {
  const L = a.length, Wd = a.width;
  const W = 256, H = Math.round(L * 5);
  const sx = W / Wd, sy = H / L;
  const mx = (m) => (m + Wd / 2) * sx;
  const mz = (m) => (m + L / 2) * sy; // z=-L/2 in alto
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#3b3c40';
  g.fillRect(0, 0, W, H);
  for (let i = 0; i < H * 2.2; i++) {
    const v = 50 + Math.random() * 28;
    g.fillStyle = `rgba(${v},${v},${v + 3},0.35)`;
    g.fillRect(Math.random() * W, Math.random() * H, 2, 2);
  }
  // segni di gomma nella zona di contatto
  g.fillStyle = 'rgba(15,15,17,0.35)';
  for (const end of [-1, 1]) {
    for (const off of [-3, 3]) g.fillRect(mx(off - 1), mz(end * (L / 2 - 250) - 50), 2 * sx, 100 * sy);
  }
  g.fillStyle = '#ececec';
  g.fillRect(mx(-Wd / 2 + 0.8), 0, 0.4 * sx, H);
  g.fillRect(mx(Wd / 2 - 1.2), 0, 0.4 * sx, H);
  for (let z = -L / 2 + 70; z < L / 2 - 70; z += 40) g.fillRect(mx(-0.3), mz(z), 0.6 * sx, 20 * sy);
  for (const end of [-1, 1]) {
    for (let i = -6; i <= 6; i++) {
      if (i === 0) continue;
      const z0 = end < 0 ? -L / 2 + 8 : L / 2 - 8 - 28;
      g.fillRect(mx(i * (Wd / 16) - 0.45), mz(z0), 0.9 * sx, 28 * sy);
    }
    for (const z of [L / 2 - 240, L / 2 - 300]) {
      for (const sgn of [-1, 1]) g.fillRect(mx(sgn * 4.5 - 1.1), mz(end * z - 10), 2.2 * sx, 20 * sy);
    }
  }
  g.font = `bold ${Math.round(9 * sx)}px Arial`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.save(); g.translate(mx(0), mz(L / 2 - 50)); g.scale(1, sy / sx); g.fillText(a.nums[0], 0, 0); g.restore();
  g.save(); g.translate(mx(0), mz(-L / 2 + 50)); g.rotate(Math.PI); g.scale(1, sy / sx); g.fillText(a.nums[1], 0, 0); g.restore();

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 16;
  return tex;
}

function makeDetailTexture() {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = '#d9d9d9';
  g.fillRect(0, 0, S, S);
  const rnd = mulberry32(7);
  for (let i = 0; i < 2600; i++) {
    const v = 150 + rnd() * 105;
    const r = 1.5 + rnd() * 9;
    g.fillStyle = `rgba(${v},${v},${v},0.2)`;
    for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
      const x = rnd() * 0 + (i * 97.13) % S, y = (i * 61.7 + rnd() * S) % S;
      g.beginPath(); g.arc(x + ox, y + oy, r, 0, Math.PI * 2); g.fill();
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(220, 220);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function makeCloudTexture() {
  const S = 128;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(S / 2, S / 2, 4, S / 2, S / 2, S / 2);
  grad.addColorStop(0, 'rgba(255,255,255,0.95)');
  grad.addColorStop(0.45, 'rgba(255,255,255,0.6)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, S, S);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ---------------------------------------------------------------- aeroporto
function buildAirport(scene, a) {
  const g = new THREE.Group();
  g.position.set(a.x, a.elev, a.z);
  g.rotation.y = a.th;
  scene.add(g);
  const L = a.length;

  const runway = new THREE.Mesh(
    new THREE.PlaneGeometry(a.width, L).rotateX(-Math.PI / 2),
    new THREE.MeshLambertMaterial({ map: makeRunwayTexture(a) })
  );
  runway.position.y = 0.06;
  runway.receiveShadow = true;
  g.add(runway);

  // luci di bordo pista
  const n = Math.floor(L / 60) + 1;
  const lights = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.35, 8, 6), new THREE.MeshBasicMaterial({ color: 0xfff2b0 }), n * 2 + 8);
  const m = new THREE.Matrix4();
  let li = 0;
  for (let i = 0; i < n; i++) {
    const z = -L / 2 + i * 60;
    for (const x of [-a.width / 2 - 1.5, a.width / 2 + 1.5]) { m.setPosition(x, 0.3, z); lights.setMatrixAt(li++, m); }
  }
  lights.count = li;
  g.add(lights);
  // luci di soglia (verdi/rosse)
  for (const [z, col] of [[L / 2 + 3, 0x30ff60], [-L / 2 - 3, 0xff3030]]) {
    for (let i = -4; i <= 4; i++) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 6), new THREE.MeshBasicMaterial({ color: col }));
      s.position.set(i * (a.width / 8), 0.3, z);
      g.add(s);
    }
  }

  // piazzale, raccordo
  const asphalt = new THREE.MeshLambertMaterial({ color: 0x55575b });
  const apron = new THREE.Mesh(new THREE.PlaneGeometry(70, 110).rotateX(-Math.PI / 2), asphalt);
  apron.position.set(62, 0.05, L * 0.1);
  apron.receiveShadow = true;
  g.add(apron);
  const taxi = new THREE.Mesh(new THREE.PlaneGeometry(40, 12).rotateX(-Math.PI / 2), asphalt);
  taxi.position.set(a.width / 2 + 20, 0.05, L * 0.1);
  taxi.receiveShadow = true;
  g.add(taxi);

  const addBox = (w, h, d, color, x, z, y = 0) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color, roughness: 0.8 }));
    b.position.set(x, y + h / 2, z);
    b.castShadow = b.receiveShadow = true;
    g.add(b);
    return b;
  };
  addBox(40, 8, 16, 0xd8d4c8, 112, L * 0.06);      // terminal
  addBox(40, 1, 17, 0x3d4a5c, 112, L * 0.06, 8);   // tetto
  addBox(26, 10, 30, 0x8c98a6, 108, L * 0.13);     // hangar
  addBox(5, 22, 5, 0xe8e8e8, 96, -L * 0.02);       // torre
  addBox(8, 4, 8, 0x3a5675, 96, -L * 0.02, 22);    // cabina torre
  // manica a vento
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 7, 6), new THREE.MeshLambertMaterial({ color: 0xdddddd }));
  pole.position.set(-40, 3.5, -L * 0.2);
  g.add(pole);
  const sock = new THREE.Mesh(new THREE.ConeGeometry(0.7, 3.5, 10, 1, true), new THREE.MeshLambertMaterial({ color: 0xff7a2a, side: THREE.DoubleSide }));
  sock.rotation.z = -Math.PI / 2 - 0.2;
  sock.position.set(-38.5, 7, -L * 0.2);
  g.add(sock);

  // faro visibile da lontano
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(4, 4, 600, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffd060, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
  );
  beam.position.set(96, 300, -L * 0.02);
  g.add(beam);
}

// ---------------------------------------------------------------- mondo
export function createWorld(scene) {
  const sunDir = new THREE.Vector3(0.5, 0.65, 0.35).normalize();
  scene.background = HORIZON.clone();
  scene.fog = new THREE.Fog(HORIZON.clone(), 1800, 12500);

  const sky = makeSky(sunDir);
  scene.add(sky);

  scene.add(new THREE.HemisphereLight(0xcfe6ff, 0x6b7a4a, 1.0));
  const sun = new THREE.DirectionalLight(0xfff1dc, 3.0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -45; sc.right = 45; sc.top = 45; sc.bottom = -45; sc.near = 1; sc.far = 600;
  sun.shadow.bias = -0.0003;
  sun.shadow.normalBias = 0.3;
  scene.add(sun, sun.target);

  // terreno
  const SIZE = 26000, SEG = 400;
  const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const col = new THREE.Color();
  const grass = new THREE.Color(0x4a8a36), dry = new THREE.Color(0x8a8a40), field = new THREE.Color(0x6fa04a);
  const rock = new THREE.Color(0x8a7d6b), snow = new THREE.Color(0xf2f4f7);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const h = terrainHeight(x, z);
    pos.setY(i, h);
    const n = 0.5 + 0.5 * Math.sin(x * 0.013) * Math.sin(z * 0.011);
    const patch = 0.5 + 0.5 * Math.sin(x * 0.0042 + 2) * Math.sin(z * 0.0051 - 1);
    col.copy(grass).lerp(dry, n * 0.6).lerp(field, patch * 0.5);
    col.lerp(rock, smoothstep(90, 150, h));
    col.lerp(snow, smoothstep(175, 205, h));
    colors[i * 3] = col.r; colors[i * 3 + 1] = col.g; colors[i * 3 + 2] = col.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const terrain = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, map: makeDetailTexture() }));
  terrain.receiveShadow = true;
  scene.add(terrain);

  for (const a of AIRPORTS) buildAirport(scene, a);

  // alberi (tronco + due coni)
  const rnd = mulberry32(1234);
  const tint = (geo, r, gr, b) => {
    const n = geo.attributes.position.count;
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(Array.from({ length: n }, () => [r, gr, b]).flat()), 3));
    return geo;
  };
  const trunk = tint(new THREE.CylinderGeometry(0.35, 0.5, 3, 6).translate(0, 1.5, 0), 0.9, 0.55, 0.3);
  const cone1 = tint(new THREE.ConeGeometry(3.3, 8, 7).translate(0, 7, 0), 1, 1, 1);
  const cone2 = tint(new THREE.ConeGeometry(2.4, 6.5, 7).translate(0, 11.2, 0), 1, 1, 1);
  const treeGeo = mergeGeometries([trunk, cone1, cone2]);
  const TREES = 9000;
  const trees = new THREE.InstancedMesh(treeGeo, new THREE.MeshLambertMaterial({ vertexColors: true }), TREES);
  const m = new THREE.Matrix4();
  const tc = new THREE.Color();
  let ti = 0, guard = 0;
  while (ti < TREES && guard++ < 200000) {
    let x, z;
    if (ti < 3000) { x = (rnd() - 0.5) * 6000; z = (rnd() - 0.5) * 6000; }
    else if (ti < 6000) { x = 4200 + (rnd() - 0.5) * 6000; z = -7500 + (rnd() - 0.5) * 6000; }
    else { x = (rnd() - 0.5) * 20000; z = (rnd() - 0.5) * 20000; }
    if (airportDist(x, z) < 280) continue;
    const h = terrainHeight(x, z);
    if (h > 170) continue;
    const s = 0.7 + rnd() * 1.1;
    m.compose(new THREE.Vector3(x, h, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd() * 6.28), new THREE.Vector3(s, s * (0.9 + rnd() * 0.4), s));
    trees.setMatrixAt(ti, m);
    tc.setHSL(0.27 + rnd() * 0.07, 0.6, 0.07 + rnd() * 0.06);
    trees.setColorAt(ti, tc);
    ti++;
  }
  trees.count = ti;
  scene.add(trees);

  // nuvole (sprite sfumati)
  const cloudTex = makeCloudTexture();
  const cloudMats = [0xffffff, 0xe3e9f0, 0xcdd6e2].map((c) =>
    new THREE.SpriteMaterial({ map: cloudTex, color: c, transparent: true, depthWrite: false, opacity: 0.9 }));
  for (let i = 0; i < 80; i++) {
    const cx = (rnd() - 0.5) * 22000, cz = (rnd() - 0.5) * 22000, cy = 950 + rnd() * 750;
    const puffs = 6 + Math.floor(rnd() * 5);
    for (let p = 0; p < puffs; p++) {
      const sp = new THREE.Sprite(cloudMats[Math.floor(rnd() * 3)]);
      const s = 350 + rnd() * 450;
      sp.scale.set(s * 1.4, s * 0.75, 1);
      sp.position.set(cx + (rnd() - 0.5) * 900, cy + (rnd() - 0.5) * 80, cz + (rnd() - 0.5) * 500);
      scene.add(sp);
    }
  }

  return {
    update(target, camera) {
      sky.position.copy(camera.position);
      sun.position.copy(target).addScaledVector(sunDir, 250);
      sun.target.position.copy(target);
      sun.target.updateMatrixWorld();
    },
  };
}
