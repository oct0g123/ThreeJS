import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

// Separable blur whose strength grows towards the top/bottom of the screen:
// the "tilt-shift" look that makes scenes feel like a tiny diorama.
const TiltShiftShader = {
  uniforms: {
    tDiffuse: { value: null },
    uDir: { value: new THREE.Vector2(1, 0) },
    uRes: { value: new THREE.Vector2(1, 1) },
    uAmount: { value: 2.2 },
    uFocus: { value: 0.48 },
    uBand: { value: 0.42 },
    uVignette: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec2 uDir, uRes;
    uniform float uAmount, uFocus, uBand, uVignette;
    varying vec2 vUv;
    void main() {
      float d = abs(vUv.y - uFocus);
      float k = smoothstep(uBand * 0.5, uBand * 0.5 + 0.38, d) * uAmount;
      vec2 off = uDir / uRes * k;
      vec4 c = texture2D(tDiffuse, vUv) * 0.2270;
      c += (texture2D(tDiffuse, vUv + off * 1.3846) + texture2D(tDiffuse, vUv - off * 1.3846)) * 0.3162;
      c += (texture2D(tDiffuse, vUv + off * 3.2308) + texture2D(tDiffuse, vUv - off * 3.2308)) * 0.0703;
      if (uVignette > 0.0) {
        float v = smoothstep(0.95, 0.35, length((vUv - 0.5) * vec2(1.1, 1.0)));
        c.rgb *= mix(1.0 - uVignette, 1.0, v);
      }
      gl_FragColor = c;
    }`,
};

export class Post {
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(renderer, rt);
    this.renderPass = new RenderPass(scene, camera);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.42, 0.55, 0.92);
    this.output = new OutputPass();
    this.tiltH = new ShaderPass(TiltShiftShader);
    this.tiltV = new ShaderPass(TiltShiftShader);
    this.tiltV.uniforms.uDir.value.set(0, 1);
    this.tiltV.uniforms.uVignette.value = 0.22;
    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.bloom);
    this.composer.addPass(this.output);
    this.composer.addPass(this.tiltH);
    this.composer.addPass(this.tiltV);
    this.setOptions({ bloom: true, tilt: true });
  }

  setOptions({ bloom, tilt }) {
    this.bloom.enabled = bloom;
    this.tiltH.enabled = tilt;
    // vertical pass also carries the vignette, so keep it but zero the blur
    this.tiltV.uniforms.uAmount.value = tilt ? 2.2 : 0;
  }

  setSize(w, h) {
    this.composer.setSize(w, h);
    const s = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    for (const p of [this.tiltH, this.tiltV]) p.uniforms.uRes.value.copy(s);
  }

  render(dt) {
    this.composer.render(dt);
  }
}
