import * as THREE from 'three';

const BASE = import.meta.env.BASE_URL;
const loader = new THREE.TextureLoader();
const cache = new Map();

/** texture CC0 (ambientCG) dell'aereo, in public/textures/aircraft; ripetute nello spazio UV della mesh */
export function acTex(name, repeatX = 1, repeatY = repeatX, srgb = false) {
  const key = `${name}|${repeatX}|${repeatY}`;
  if (cache.has(key)) return cache.get(key);
  const t = loader.load(`${BASE}textures/aircraft/${name}.jpg`);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeatX, repeatY);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 8;
  cache.set(key, t);
  return t;
}

/** materiale PBR da un set di texture (nome_c, nome_n, nome_r) */
export function pbr(name, { repeat = 1, repeatY = repeat, color = 0xffffff, roughness = 1, metalness = 0, normalScale = 1, rough = true } = {}) {
  const m = new THREE.MeshStandardMaterial({
    color, roughness, metalness,
    map: acTex(name + '_c', repeat, repeatY, true),
    normalMap: acTex(name + '_n', repeat, repeatY),
  });
  if (rough) m.roughnessMap = acTex(name + '_r', repeat, repeatY);
  m.normalScale.set(normalScale, normalScale);
  return m;
}

/**
 * Dettagli di una pelle di alluminio verniciata, calcolati nello shader in coordinate locali dell'oggetto
 * (nessuna UV): linee dei pannelli con file di rivetti (rilievo vero, tramite derivate), sporco a strisce,
 * vernice scheggiata sui bordi d'attacco con alluminio a vista. Il dettaglio sfuma con la distanza e quando
 * un pixel copre più di qualche millimetro (niente aliasing).
 *   panel: passo dei pannelli (m) lungo u e v; grime/chips: intensità 0..1.5
 */
export function skinDetail(material, { panel = [0.9, 0.62], grime = 1, chips = 1, rivets = 1, seed = 0, stripe = null } = {}) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uPanel = { value: new THREE.Vector4(panel[0], panel[1], grime, chips) };
    shader.uniforms.uRivets = { value: rivets };
    shader.uniforms.uSeed = { value: seed };
    if (stripe) shader.uniforms.uYc = { value: stripe };
    if (stripe) shader.defines = { ...shader.defines, STRIPE: 1 };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vLP;\nvarying vec3 vLN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLP = position;\nvLN = normal;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vLP;
        varying vec3 vLN;
        uniform vec4 uPanel;
        uniform float uRivets, uSeed;
        #ifdef STRIPE
        uniform float uYc[65];
        #endif
        float skH, skGrime, skChip;
        float skHash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
        float skNoise(vec2 p){
          vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(skHash(i), skHash(i + vec2(1, 0)), f.x), mix(skHash(i + vec2(0, 1)), skHash(i + vec2(1, 1)), f.x), f.y);
        }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          vec3 an = abs(vLN);
          vec2 uv; float side = 0.0;
          if (an.y > an.x && an.y > an.z) uv = vLP.xz;
          else if (an.x > an.z) uv = vLP.zy + vec2(0.0, 3.1) * sign(vLP.x);
          else uv = vLP.xy;
          uv += vec2(uSeed * 1.7, uSeed * 0.9);
          float fp = max(length(vec2(dFdx(uv.x), dFdy(uv.x))), length(vec2(dFdx(uv.y), dFdy(uv.y))));   // metri per pixel
          float fineFade = 1.0 - smoothstep(0.0025, 0.009, fp);                                          // rivetti
          float seamFade = 1.0 - smoothstep(0.012, 0.05, fp);                                             // giunzioni
          // pannelli sfalsati: ogni fila ha una giunzione verticale in posizione diversa
          float row = floor(uv.y / uPanel.y);
          float u2 = uv.x + skHash(vec2(row, 7.0 + uSeed)) * uPanel.x;
          float du = abs(fract(u2 / uPanel.x + 0.5) - 0.5) * uPanel.x;    // distanza dalla giunzione verticale
          float dv = abs(fract(uv.y / uPanel.y + 0.5) - 0.5) * uPanel.y;  // distanza da quella orizzontale
          float groove = (1.0 - smoothstep(0.0007, 0.0022, min(du, dv))) * seamFade;
          // rivetti: due file affiancate a ciascuna giunzione, passo 4 cm
          float rv = 0.0;
          if (uRivets > 0.0 && fineFade > 0.0) {
            float cu = abs(fract(uv.y / 0.042 + 0.5) - 0.5) * 0.042;
            float cv = abs(fract(u2 / 0.042 + 0.5) - 0.5) * 0.042;
            float r1 = length(vec2(abs(du - 0.0125), cu)), r2 = length(vec2(abs(dv - 0.0125), cv));
            float rr = du < 0.03 ? r1 : (dv < 0.03 ? r2 : 1.0);
            rv = (1.0 - smoothstep(0.0022, 0.0038, rr)) * fineFade;
          }
          skH = (rv * 0.0007 - groove * 0.0005);
          // sporco: strisce lungo la corda (flusso d'aria) + macchie larghe, più forte sul ventre
          float belly = smoothstep(0.0, -0.9, vLN.y) * 0.5 + smoothstep(0.0, -0.5, vLP.y - 0.1) * 0.3;
          float streak = skNoise(vec2(uv.x * 2.2, uv.y * 14.0) + uSeed) * 0.6 + skNoise(uv * 3.1 + 5.0 + uSeed) * 0.4;
          skGrime = clamp((streak - 0.42) * 1.5 + belly * 0.6, 0.0, 1.0) * uPanel.z;
          float edge = smoothstep(0.68, 0.96, -vLN.z);                    // superfici rivolte in avanti
          float ch = skNoise(uv * 38.0 + uSeed) * 0.6 + skNoise(uv * 120.0) * 0.4;
          skChip = smoothstep(0.7, 0.78, ch) * edge * uPanel.w;
          diffuseColor.rgb *= 1.0 - 0.38 * skGrime - 0.30 * groove * seamFade - 0.10 * rv;
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.56, 0.58, 0.61), skChip);
          #ifdef STRIPE
          if (vLP.z > -2.2 && vLP.z < 4.2) {
            float fz = (vLP.z + 2.2) * 10.0; int i0 = int(floor(fz));
            float yc = mix(uYc[i0], uYc[min(i0 + 1, 64)], fract(fz));
            float dy = vLP.y - yc, w = max(fwidth(vLP.y), 0.0006);
            float red = 1.0 - smoothstep(0.065 - w, 0.065 + w, abs(dy));
            float blue = smoothstep(-0.15 - w, -0.15 + w, dy) * (1.0 - smoothstep(-0.095 - w, -0.095 + w, dy));
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.60, 0.018, 0.026), red);
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.009, 0.036, 0.188), blue);
          }
          #endif
        }`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = clamp(roughnessFactor + 0.28 * skGrime + 0.3 * skChip, 0.0, 1.0);`)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
        metalnessFactor = mix(metalnessFactor, 0.9, skChip);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          vec3 dpx = dFdx(-vViewPosition), dpy = dFdy(-vViewPosition);
          vec3 R1 = cross(dpy, normal), R2 = cross(normal, dpx);
          float det = dot(dpx, R1);
          vec3 grad = sign(det) * (dFdx(skH) * R1 + dFdy(skH) * R2);
          normal = normalize(abs(det) * normal - grad);
        }`);
  };
  material.customProgramCacheKey = () => `skin${panel.join('_')}_${grime}_${chips}_${rivets}_${stripe ? 's' : ''}`;
  return material;
}
