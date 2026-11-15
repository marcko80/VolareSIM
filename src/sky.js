import * as THREE from 'three';

export const SUN_DIR = new THREE.Vector3(0.48, 0.52, 0.42).normalize();
export const HORIZON_COL = new THREE.Color(0xb4cfe8);
const ZENITH_COL = new THREE.Color(0x2a62b8);
const GROUND_COL = new THREE.Color(0x3a4a2a);

const vert = `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;

const frag = `
  varying vec3 vDir;
  uniform vec3 sunDir, horCol, topCol, groundCol;
  uniform float time, cover, env;

  float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
  }
  float fbm(vec2 p) {
    float s = 0.0, a = 0.5;
    for (int i = 0; i < 4; i++) { s += a * noise(p); p = p * 2.03 + vec2(17.1, 9.2); a *= 0.5; }
    return s;
  }

  float fbm3(vec2 p) { return 0.57 * noise(p) + 0.29 * noise(p * 2.03 + vec2(17.1, 9.2)) + 0.14 * noise(p * 4.12 + vec2(5.3, 31.7)); }

  void main() {
    vec3 d = normalize(vDir);
    float h = max(d.y, 0.0);
    // diffusione atmosferica: più chiaro e caldo verso l'orizzonte
    vec3 col = mix(horCol, topCol, pow(h, 0.42));
    float sd = max(dot(d, sunDir), 0.0);
    col += vec3(1.0, 0.82, 0.55) * (pow(sd, 6.0) * 0.12 + pow(sd, 40.0) * 0.3);
    col += vec3(1.0, 0.95, 0.85) * smoothstep(0.99955, 0.9998, sd) * 40.0; // disco solare (HDR, innesca il bloom)

    // strato di nubi proiettato su un piano alto
    if (d.y > 0.005) {
      vec2 p = d.xz / (d.y + 0.1) * 1.4 + vec2(time * 0.012, time * 0.005);
      float n = fbm3(p);
      float c = smoothstep(0.47 - cover, 0.72 - cover, n);
      vec2 po = p + sunDir.xz * 0.12;
      float nl = fbm3(po); // verso il sole: spessore → ombreggiatura
      float lit = clamp(0.62 + (n - nl) * 5.0, 0.0, 1.0);
      vec3 cloud = mix(vec3(0.46, 0.52, 0.62), vec3(1.0, 0.99, 0.96), lit);
      cloud = mix(cloud, horCol, smoothstep(0.35, 0.0, d.y) * 0.6);   // foschia in lontananza
      col = mix(col, cloud, c * smoothstep(0.0, 0.12, d.y));
    }
    if (d.y < 0.0) {
      vec3 below = mix(horCol, groundCol, env * smoothstep(0.0, -0.25, d.y));
      col = mix(col, below, smoothstep(0.0, -0.01, d.y));
    }
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

function makeMaterial(env, cover) {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      sunDir: { value: SUN_DIR }, horCol: { value: HORIZON_COL }, topCol: { value: ZENITH_COL }, groundCol: { value: GROUND_COL },
      time: { value: 0 }, cover: { value: cover }, env: { value: env },
    },
    vertexShader: vert, fragmentShader: frag,
  });
}

export function createSky(radius = 20000) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 48, 24), makeMaterial(0, 0.0));
  mesh.renderOrder = -1;
  mesh.frustumCulled = false;
  return mesh;
}

/** mappa ambiente (PMREM) generata dallo stesso cielo, per i riflessi su carrozzeria e vetri */
export function createEnvironment(renderer) {
  const s = new THREE.Scene();
  const m = new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), makeMaterial(1, 0.02));
  s.add(m);
  const pm = new THREE.PMREMGenerator(renderer);
  const rt = pm.fromScene(s, 0.015, 0.1, 100);
  pm.dispose();
  m.geometry.dispose(); m.material.dispose();
  return rt.texture;
}
