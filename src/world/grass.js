import * as THREE from 'three';
import { WORLD, HALF } from '../config.js';
import { patchShader } from '../render/patch.js';
import { NOISE_GLSL, FIELD_GLSL, GRASS_COLOR_GLSL, lin } from '../render/glsl.js';
import { mulberry32 } from '../util/random.js';

// Instanced grass blades + wildflowers. Positions are fixed; height, density and
// visibility come from the terrain field texture, so terrain edits are free.
const SHARED_VERT = /* glsl */ `
attribute vec4 aInst;
uniform float uTime;
uniform float uWind;
uniform vec2 uWindDir;
${NOISE_GLSL}
${FIELD_GLSL}
${GRASS_COLOR_GLSL}
vec2 windAt(vec2 xz, float seed) {
  float gust = vnoise(xz * 0.12 - uWindDir * uTime * 0.7);
  float flutter = sin(uTime * 2.4 + xz.x * 0.8 + xz.y * 0.6 + seed * 6.0) * 0.22;
  return uWindDir * (gust * 1.1 + flutter) * uWind;
}
`;

const NORMAL_FRAG = `
  float faceDirection = gl_FrontFacing ? 1.0 : -1.0;
  vec3 normal = normalize(vNormal);
  vec3 nonPerturbedNormal = normal;
`;

export class Grass {
  constructor(shared, { count = 42000, flowers = 9000 } = {}) {
    this.shared = shared;
    this.group = new THREE.Group();
    this.group.name = 'grass';
    this.blades = this._makeBlades(count);
    this.flowers = this._makeFlowers(flowers);
    this.group.add(this.blades, this.flowers);
  }

  setDensity(fraction) {
    this.blades.geometry.instanceCount = Math.floor(this.bladeMax * fraction);
    this.flowers.geometry.instanceCount = Math.floor(this.flowerMax * Math.max(0.4, fraction));
  }

  _instances(count, seed) {
    const rng = mulberry32(seed);
    const arr = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
      arr[i * 4] = (rng() - 0.5) * (WORLD.size - 0.1);
      arr[i * 4 + 1] = (rng() - 0.5) * (WORLD.size - 0.1);
      arr[i * 4 + 2] = rng();
      arr[i * 4 + 3] = rng() * Math.PI * 2;
    }
    return arr;
  }

  _makeBlades(count) {
    this.bladeMax = count;
    const geo = new THREE.InstancedBufferGeometry();
    const ys = [0, 0.35, 0.7, 1.0];
    const ws = [0.5, 0.42, 0.24, 0];
    const pos = [];
    for (let l = 0; l < 3; l++) pos.push(-ws[l], ys[l], 0, ws[l], ys[l], 0);
    pos.push(0, 1, 0);
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(pos.length).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
    geo.setIndex([0, 1, 2, 2, 1, 3, 2, 3, 4, 4, 3, 5, 4, 5, 6]);
    geo.setAttribute('aInst', new THREE.InstancedBufferAttribute(this._instances(count, 1234), 4));
    geo.instanceCount = count;

    const mat = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide });
    const u = this.shared.uniforms;
    patchShader(mat, {
      key: 'grass-blades',
      uniforms: { uTime: u.uTime, uWind: u.uWind, uWindDir: u.uWindDir, uField: u.uField },
      vertexHeader: SHARED_VERT + `varying float vH; varying vec3 vBase;`,
      vertex: {
        beginnormal_vertex: `vec3 objectNormal = vec3(0.0, 1.0, 0.0);`,
        begin_vertex: /* glsl */ `
          vec4 fld = sampleField(aInst.xy);
          float dens = fld.g;
          float r = aInst.z;
          float vis = step(r, dens * 1.2 - 0.05);
          float patchN = vnoise(aInst.xy * 0.3);
          float hgt = (0.16 + 0.26 * patchN) * (0.65 + 0.5 * fract(r * 13.7)) * smoothstep(0.0, 0.6, dens) * vis;
          float wdt = 0.075 * (0.8 + 0.4 * fract(r * 7.3));
          vec3 p = vec3(position.x * wdt, position.y * hgt, 0.0);
          float ca = cos(aInst.w), sa = sin(aInst.w);
          p = vec3(p.x * ca, p.y, p.x * sa);
          float bend = position.y * position.y * hgt;
          vec2 lean = vec2(cos(r * 40.0), sin(r * 40.0)) * 0.35;
          p.xz += (windAt(aInst.xy, r) + lean) * bend * 0.6;
          p.y -= length(windAt(aInst.xy, r)) * bend * 0.15;
          vec3 transformed = p + vec3(aInst.x, fld.r - 0.03, aInst.y);
          vH = position.y;
          vBase = grassColor(aInst.xy);
        `,
      },
      fragmentHeader: `varying float vH; varying vec3 vBase;`,
      fragment: {
        color_fragment: `diffuseColor.rgb = vBase * mix(0.62, 1.22, vH);`,
        normal_fragment_begin: NORMAL_FRAG,
      },
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.receiveShadow = true;
    mesh.name = 'grass-blades';
    return mesh;
  }

  _makeFlowers(count) {
    this.flowerMax = count;
    const geo = new THREE.InstancedBufferGeometry();
    // stem quad + crossed head quads. aPart: 0 = stem, 1 = head
    const pos = [], part = [], uv = [];
    const quad = (pts, p) => {
      pos.push(...pts);
      part.push(p, p, p, p);
      uv.push(0, 0, 1, 0, 0, 1, 1, 1);
    };
    const sw = 0.012;
    quad([-sw, 0, 0, sw, 0, 0, -sw, 1, 0, sw, 1, 0], 0);
    const hs = 0.075;
    quad([-hs, 1 - hs * 0.4, 0, hs, 1 - hs * 0.4, 0, -hs, 1 + hs, 0, hs, 1 + hs, 0], 1);
    quad([0, 1 - hs * 0.4, -hs, 0, 1 - hs * 0.4, hs, 0, 1 + hs, -hs, 0, 1 + hs, hs], 1);
    quad([-hs, 1 + hs * 0.3, -hs, hs, 1 + hs * 0.3, -hs, -hs, 1 + hs * 0.3, hs, hs, 1 + hs * 0.3, hs], 1);
    const index = [];
    for (let q = 0; q < 4; q++) {
      const b = q * 4;
      index.push(b, b + 1, b + 2, b + 2, b + 1, b + 3);
    }
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(pos.map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
    geo.setAttribute('aPart', new THREE.Float32BufferAttribute(part, 1));
    geo.setAttribute('aUv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(index);
    geo.setAttribute('aInst', new THREE.InstancedBufferAttribute(this._instances(count, 777), 4));
    const palette = ['#ff8fb1', '#ffd45e', '#fffaf0', '#b99cff', '#ff9a5c', '#8fd3ff', '#ff6f7d'];
    const rng = mulberry32(99);
    const cols = new Float32Array(count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < count; i++) {
      c.set(palette[Math.floor(rng() * palette.length)]);
      cols.set([c.r, c.g, c.b], i * 3);
    }
    geo.setAttribute('aColor', new THREE.InstancedBufferAttribute(cols, 3));
    geo.instanceCount = count;

    const mat = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide });
    const u = this.shared.uniforms;
    patchShader(mat, {
      key: 'grass-flowers',
      uniforms: { uTime: u.uTime, uWind: u.uWind, uWindDir: u.uWindDir, uField: u.uField },
      vertexHeader: SHARED_VERT + `attribute float aPart; attribute vec3 aColor; attribute vec2 aUv; varying vec3 vCol; varying vec2 vFUv; varying float vPart;`,
      vertex: {
        beginnormal_vertex: `vec3 objectNormal = vec3(0.0, 1.0, 0.0);`,
        begin_vertex: /* glsl */ `
          vec4 fld = sampleField(aInst.xy);
          float wild = smoothstep(0.62, 0.8, vnoise(aInst.xy * 0.11 + 4.0)) * 0.22 + 0.012;
          float chance = fld.b * 0.95 + fld.g * wild;
          float vis = step(aInst.z, chance) * step(0.3, fld.g + fld.b);
          float hgt = (0.2 + 0.14 * fract(aInst.z * 91.7)) * vis;
          vec3 p = position;
          p.y *= hgt;
          p.xz *= vis;
          float ca = cos(aInst.w), sa = sin(aInst.w);
          p = vec3(p.x * ca - p.z * sa, p.y, p.x * sa + p.z * ca);
          p.xz += windAt(aInst.xy, aInst.z) * position.y * position.y * hgt * 0.4;
          vec3 transformed = p + vec3(aInst.x, fld.r - 0.02, aInst.y);
          vCol = aPart > 0.5 ? aColor : grassColor(aInst.xy) * 0.8;
          vFUv = aUv;
          vPart = aPart;
        `,
      },
      fragmentHeader: `varying vec3 vCol; varying vec2 vFUv; varying float vPart;`,
      fragment: {
        color_fragment: /* glsl */ `
          diffuseColor.rgb = vCol;
          if (vPart > 0.5) {
            vec2 d = vFUv - 0.5;
            float r = length(d) * 2.0;
            float petal = 0.6 + 0.4 * cos(atan(d.y, d.x) * 5.0);
            if (r > petal) discard;
            if (r < 0.26) diffuseColor.rgb = vec3(1.0, 0.72, 0.18);
          }`,
        normal_fragment_begin: NORMAL_FRAG,
      },
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.receiveShadow = true;
    mesh.name = 'grass-flowers';
    return mesh;
  }
}
