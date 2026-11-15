import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';

/**
 * Pipeline di post-processing (solo desktop). Livello 1 (GPU integrate): render HDR, bloom, tone mapping ACES, SMAA.
 * Livello 2 (GPU dedicate): come 1 ma con MSAA 4x al posto dello SMAA, più vignettatura e grading.
 */
const GradeShader = {
  uniforms: { tDiffuse: { value: null }, vignette: { value: 0.28 }, sat: { value: 1.08 }, contrast: { value: 1.05 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float vignette, sat, contrast; varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      c.rgb = mix(vec3(l), c.rgb, sat);
      c.rgb = (c.rgb - 0.5) * contrast + 0.5;
      vec2 q = vUv - 0.5;
      c.rgb *= 1.0 - vignette * smoothstep(0.25, 0.85, length(q * vec2(1.0, 0.9)) * 1.25);
      gl_FragColor = vec4(c.rgb, c.a);
    }`,
};

export class PostFX {
  constructor(renderer, scene, camera, level = 1) {
    this.renderer = renderer;
    this.level = level;
    const msaa = level >= 2;
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: msaa ? 4 : 0 });
    this.composer = new EffectComposer(renderer, rt);
    this.composer.addPass(new RenderPass(scene, camera));
    this.composer.addPass(new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.18, 0.45, 1.7));
    this.composer.addPass(new OutputPass());
    if (!msaa) this.composer.addPass(new SMAAPass());
    if (msaa) this.composer.addPass(new ShaderPass(GradeShader));
  }

  setSize(w, h) {
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(w, h);
  }

  render(dt) { this.composer.render(dt); }

  dispose() {
    // libera davvero tutti i render target (passi, bloom, SMAA e i due buffer del composer)
    for (const p of this.composer.passes) { try { p.dispose?.(); } catch { /* ignora */ } }
    try { this.composer.renderTarget1.dispose(); this.composer.renderTarget2.dispose(); } catch { /* ignora */ }
  }
}
