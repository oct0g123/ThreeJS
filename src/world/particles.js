import * as THREE from 'three';
import { WORLD } from '../config.js';
import { FIELD_GLSL } from '../render/glsl.js';
import { mulberry32 } from '../util/random.js';

// Fireflies at night, drifting pollen by day. Heights come from the terrain field texture.
export class Fireflies {
  constructor(shared, count = 260) {
    const rng = mulberry32(42);
    const pos = new Float32Array(count * 3);
    const seed = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (rng() - 0.5) * (WORLD.size - 2);
      pos[i * 3 + 2] = (rng() - 0.5) * (WORLD.size - 2);
      seed.set([rng(), rng(), rng(), rng()], i * 4);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
    const u = shared.uniforms;
    this.material = new THREE.ShaderMaterial({
      uniforms: { uTime: u.uTime, uNight: u.uNightGlow, uField: u.uField, uScale: { value: 300 } },
      vertexShader: /* glsl */ `
        attribute vec4 aSeed;
        uniform float uTime, uNight, uScale;
        varying float vAlpha;
        varying float vNight;
        ${FIELD_GLSL}
        void main() {
          float t = uTime * (0.15 + aSeed.x * 0.2) + aSeed.y * 50.0;
          vec3 p = position;
          p.x += sin(t * 1.3) * 1.2 + sin(t * 2.9) * 0.3;
          p.z += cos(t * 1.1) * 1.2 + cos(t * 2.3) * 0.3;
          float ground = max(sampleField(p.xz).r, 0.0);
          float lift = mix(0.6 + aSeed.z * 2.2, 0.35 + aSeed.z * 1.1, uNight);
          p.y = ground + lift + sin(t * 2.0) * 0.25;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          float blink = 0.5 + 0.5 * sin(uTime * (1.5 + aSeed.w * 2.5) + aSeed.x * 30.0);
          vNight = uNight;
          vAlpha = mix(0.45 * step(0.72, aSeed.w), smoothstep(0.15, 0.9, blink), uNight);
          gl_PointSize = mix(0.07, 0.2 + aSeed.z * 0.1, uNight) * uScale / -mv.z;
        }`,
      fragmentShader: /* glsl */ `
        varying float vAlpha;
        varying float vNight;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.0, d);
          vec3 day = vec3(1.0, 0.98, 0.9);
          vec3 night = vec3(0.85, 1.0, 0.45) * 3.0;
          gl_FragColor = vec4(mix(day, night, vNight) * a, a * vAlpha);
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 3;
  }

  setPixelScale(h, fov) {
    this.material.uniforms.uScale.value = h / (2 * Math.tan(THREE.MathUtils.degToRad(fov) / 2));
  }
}

// Soft puffs drifting out of cottage chimneys.
export class Smoke {
  constructor(count = 160) {
    this.count = count;
    this.pos = new Float32Array(count * 3);
    this.age = new Float32Array(count).fill(1);
    this.vel = new Float32Array(count * 3);
    this.next = 0;
    this.timers = new Map();
    const geo = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(this.pos, 3);
    this.ageAttr = new THREE.BufferAttribute(this.age, 1);
    geo.setAttribute('position', this.posAttr);
    geo.setAttribute('aAge', this.ageAttr);
    this.material = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 300 }, uColor: { value: new THREE.Color('#f2efe9') } },
      vertexShader: /* glsl */ `
        attribute float aAge;
        uniform float uScale;
        varying float vAge;
        void main() {
          vAge = aAge;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = (0.22 + aAge * 0.75) * uScale / -mv.z * step(aAge, 0.999);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        varying float vAge;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.15, d) * smoothstep(0.0, 0.08, vAge) * (1.0 - vAge) * 0.55;
          gl_FragColor = vec4(uColor, a);
        }`,
      transparent: true,
      depthWrite: false,
    });
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 2;
  }

  setPixelScale(h, fov) {
    this.material.uniforms.uScale.value = h / (2 * Math.tan(THREE.MathUtils.degToRad(fov) / 2));
  }

  update(dt, chimneys, wind, night) {
    for (const [x, y, z, seed] of chimneys) {
      const t = (this.timers.get(seed) ?? Math.random()) - dt;
      if (t <= 0) {
        const i = this.next;
        this.next = (this.next + 1) % this.count;
        this.pos.set([x + (Math.random() - 0.5) * 0.08, y, z + (Math.random() - 0.5) * 0.08], i * 3);
        this.vel.set([wind.x * 0.25 + (Math.random() - 0.5) * 0.06, 0.38 + Math.random() * 0.12, wind.y * 0.25 + (Math.random() - 0.5) * 0.06], i * 3);
        this.age[i] = 0;
        this.timers.set(seed, 0.55 + Math.random() * 0.4);
      } else this.timers.set(seed, t);
    }
    for (let i = 0; i < this.count; i++) {
      if (this.age[i] >= 1) continue;
      this.age[i] = Math.min(1, this.age[i] + dt / 4.2);
      const k = i * 3;
      this.pos[k] += this.vel[k] * dt;
      this.pos[k + 1] += this.vel[k + 1] * dt;
      this.pos[k + 2] += this.vel[k + 2] * dt;
      this.vel[k] += wind.x * 0.05 * dt;
      this.vel[k + 2] += wind.y * 0.05 * dt;
    }
    this.posAttr.needsUpdate = true;
    this.ageAttr.needsUpdate = true;
    this.material.uniforms.uColor.value.set(night > 0.5 ? '#9aa4c4' : '#f2efe9');
  }
}
