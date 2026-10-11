import * as THREE from 'three';
import { HALF } from '../config.js';

// Day/night keyframes (hour of day -> palette). Colours are sRGB hex.
const KEYS = [
  { t: 0.0, top: '#101a3c', hor: '#2c3a6b', bot: '#1c2548', sun: '#9fb6ff', si: 0.55, hs: '#3a4d82', hg: '#1c2036', hi: 0.75, glow: 1, stars: 1 },
  { t: 4.6, top: '#101a3c', hor: '#2c3a6b', bot: '#1c2548', sun: '#9fb6ff', si: 0.55, hs: '#3a4d82', hg: '#1c2036', hi: 0.75, glow: 1, stars: 1 },
  { t: 5.7, top: '#2b3a6e', hor: '#e8977d', bot: '#3a3550', sun: '#ffb08a', si: 0.5, hs: '#6d719e', hg: '#3a3040', hi: 0.75, glow: 0.7, stars: 0.3 },
  { t: 7.0, top: '#609fdc', hor: '#ffd4ab', bot: '#a3b6d0', sun: '#ffc995', si: 2.2, hs: '#a9c3e6', hg: '#6a5a48', hi: 1.0, glow: 0.05, stars: 0 },
  { t: 10.0, top: '#4f9be6', hor: '#cfe6ff', bot: '#a9c8e6', sun: '#fff3df', si: 2.9, hs: '#bcd6f2', hg: '#6d6450', hi: 1.19, glow: 0, stars: 0 },
  { t: 14.0, top: '#4f9be6', hor: '#d4e8fc', bot: '#a9c8e6', sun: '#fff1da', si: 2.9, hs: '#bcd6f2', hg: '#6d6450', hi: 1.19, glow: 0, stars: 0 },
  { t: 16.6, top: '#5a9ddf', hor: '#ffe3ba', bot: '#b7c6dc', sun: '#ffdcaa', si: 2.7, hs: '#c4d1e6', hg: '#76634a', hi: 1.12, glow: 0, stars: 0 },
  { t: 18.3, top: '#4b5c9a', hor: '#ff9868', bot: '#6c5c74', sun: '#ff9d5e', si: 1.7, hs: '#9d8db2', hg: '#5a4038', hi: 0.94, glow: 0.35, stars: 0 },
  { t: 19.5, top: '#212a5c', hor: '#8b4f78', bot: '#2c2440', sun: '#ff7a50', si: 0.5, hs: '#5a5a8c', hg: '#2a2230', hi: 0.75, glow: 0.9, stars: 0.35 },
  { t: 20.8, top: '#101a3c', hor: '#2c3a6b', bot: '#1c2548', sun: '#9fb6ff', si: 0.55, hs: '#3a4d82', hg: '#1c2036', hi: 0.75, glow: 1, stars: 1 },
  { t: 24.0, top: '#101a3c', hor: '#2c3a6b', bot: '#1c2548', sun: '#9fb6ff', si: 0.55, hs: '#3a4d82', hg: '#1c2036', hi: 0.75, glow: 1, stars: 1 },
];
const COLOR_KEYS = ['top', 'hor', 'bot', 'sun', 'hs', 'hg'];
for (const k of KEYS) for (const c of COLOR_KEYS) k[c] = new THREE.Color(k[c]);

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;

const SKY_FRAG = /* glsl */ `
uniform vec3 uTop, uHorizon, uBottom, uSunColor, uSunDir, uMoonDir;
uniform float uStars, uSunVis, uTime;
varying vec3 vDir;
float h13(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
void main() {
  vec3 d = normalize(vDir);
  float y = d.y;
  vec3 col = mix(uHorizon, uTop, pow(smoothstep(-0.02, 0.65, y), 0.75));
  col = mix(col, uBottom, smoothstep(0.0, -0.3, y));
  float sd = max(dot(d, uSunDir), 0.0);
  col += uSunColor * (pow(sd, 6.0) * 0.22 + pow(sd, 60.0) * 0.5) * uSunVis;
  col += uSunColor * smoothstep(0.9990, 0.9994, sd) * 4.0 * uSunVis;
  float md = max(dot(d, uMoonDir), 0.0);
  col += vec3(0.95, 0.97, 1.0) * (smoothstep(0.9993, 0.9996, md) * 2.0 + pow(md, 40.0) * 0.06) * uStars;
  vec3 cell = floor(d * 220.0);
  float h = h13(cell);
  float star = step(0.9975, h) * smoothstep(0.02, 0.25, y);
  star *= 0.55 + 0.45 * sin(uTime * (1.5 + h * 3.0) + h * 80.0);
  col += vec3(star) * uStars * 1.4;
  gl_FragColor = vec4(col, 1.0);
}`;

export class Environment {
  constructor(scene, shared) {
    this.scene = scene;
    this.shared = shared;
    this.time = 15.8; // golden afternoon
    this.cycle = false;
    this.cycleSpeed = 24 / 360; // hours per second when cycling (6-minute day)
    this.state = {};

    this.skyUniforms = {
      uTop: { value: new THREE.Color() },
      uHorizon: { value: new THREE.Color() },
      uBottom: { value: new THREE.Color() },
      uSunColor: { value: new THREE.Color() },
      uSunDir: { value: new THREE.Vector3() },
      uMoonDir: { value: new THREE.Vector3() },
      uStars: { value: 0 },
      uSunVis: { value: 1 },
      uTime: shared.uniforms.uTime,
    };
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(500, 32, 16),
      new THREE.ShaderMaterial({
        uniforms: this.skyUniforms,
        vertexShader: SKY_VERT,
        fragmentShader: SKY_FRAG,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
      }),
    );
    sky.frustumCulled = false;
    sky.renderOrder = -10;
    sky.name = 'sky';
    this.sky = sky;
    scene.add(sky);

    this.sun = new THREE.DirectionalLight(0xffffff, 2.5);
    this.sun.castShadow = true;
    const cam = this.sun.shadow.camera;
    const ext = HALF * 1.32;
    cam.left = -ext;
    cam.right = ext;
    cam.top = ext;
    cam.bottom = -ext;
    cam.near = 1;
    cam.far = 140;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.035;
    this.sun.shadow.radius = 2.5;
    scene.add(this.sun, this.sun.target);

    this.hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
    scene.add(this.hemi);

    this.fogColor = new THREE.Color();
    scene.fog = new THREE.Fog(this.fogColor, 95, 320);
    this._tmp = {};
    this.update(0);
  }

  setShadowQuality(size) {
    if (this.sun.shadow.mapSize.x === size) return;
    this.sun.shadow.mapSize.set(size, size);
    this.sun.shadow.map?.dispose();
    this.sun.shadow.map = null;
  }

  _sample(t) {
    let a = KEYS[0], b = KEYS[1];
    for (let i = 0; i < KEYS.length - 1; i++) {
      if (t >= KEYS[i].t && t <= KEYS[i + 1].t) {
        a = KEYS[i];
        b = KEYS[i + 1];
        break;
      }
    }
    const f = b.t === a.t ? 0 : (t - a.t) / (b.t - a.t);
    const s = f * f * (3 - 2 * f);
    const out = this._tmp;
    for (const c of COLOR_KEYS) {
      out[c] = out[c] || new THREE.Color();
      out[c].copy(a[c]).lerp(b[c], s);
    }
    for (const k of ['si', 'hi', 'glow', 'stars']) out[k] = a[k] + (b[k] - a[k]) * s;
    return out;
  }

  update(dt) {
    if (this.cycle) this.time = (this.time + dt * this.cycleSpeed) % 24;
    const t = this.time;
    const p = this._sample(t);
    const theta = ((t - 6) / 24) * Math.PI * 2;
    const sunUp = Math.sin(theta);
    const sunDir = new THREE.Vector3(Math.cos(theta), sunUp * 0.88, 0.55).normalize();
    const moonDir = new THREE.Vector3(-Math.cos(theta) * 0.8, -sunUp * 0.85, 0.7).normalize();
    const isDay = sunUp > -0.02;
    const lightDir = isDay ? sunDir : moonDir;
    const phase = isDay ? THREE.MathUtils.smoothstep(sunUp, -0.02, 0.14) : THREE.MathUtils.smoothstep(-sunUp, 0.02, 0.2);

    this.sun.position.copy(lightDir).multiplyScalar(60);
    this.sun.target.position.set(0, 0, 0);
    this.sun.color.copy(p.sun);
    this.sun.intensity = p.si * phase;
    this.hemi.color.copy(p.hs);
    this.hemi.groundColor.copy(p.hg);
    this.hemi.intensity = p.hi;

    const su = this.skyUniforms;
    su.uTop.value.copy(p.top);
    su.uHorizon.value.copy(p.hor);
    su.uBottom.value.copy(p.bot);
    su.uSunColor.value.copy(p.sun);
    su.uSunDir.value.copy(sunDir);
    su.uMoonDir.value.copy(moonDir);
    su.uStars.value = p.stars;
    su.uSunVis.value = THREE.MathUtils.smoothstep(sunUp, -0.1, 0.05);

    this.fogColor.copy(p.hor).lerp(p.top, 0.25);
    this.scene.fog.color.copy(this.fogColor);
    const u = this.shared.uniforms;
    u.uSkyColor.value.copy(p.hor).lerp(p.top, 0.5);
    u.uNightGlow.value = p.glow;
    this.state = { night: p.glow, stars: p.stars, sunUp, hour: t };
  }

  followCamera(camera) {
    this.sky.position.copy(camera.position);
  }
}
