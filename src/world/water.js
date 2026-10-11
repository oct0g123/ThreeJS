import * as THREE from 'three';
import { WORLD, HALF, GRID_N } from '../config.js';
import { patchShader } from '../render/patch.js';
import { NOISE_GLSL, FIELD_GLSL, lin, WATER_LEVEL_GLSL } from '../render/glsl.js';

const N = GRID_N;
const WL = WORLD.waterLevel;

// One big transparent sheet at sea level. The shader reads the terrain height
// field to work out depth, so digging anywhere below WL simply "fills" with water.
export class Water {
  constructor(terrain, shared) {
    this.terrain = terrain;
    this.group = new THREE.Group();
    this.group.name = 'water';

    const geo = new THREE.PlaneGeometry(WORLD.size, WORLD.size, 1, 1);
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, WL, 0);

    const mat = new THREE.MeshStandardMaterial({
      roughness: 0.08,
      metalness: 0,
      transparent: true,
      depthWrite: false,
    });
    const u = shared.uniforms;
    patchShader(mat, {
      key: 'water',
      uniforms: { uTime: u.uTime, uField: u.uField, uSkyColor: u.uSkyColor },
      vertexHeader: `varying vec3 vWPos;`,
      vertex: {
        fog_vertex: `#include <fog_vertex>
          vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
      },
      fragmentHeader: `varying vec3 vWPos; uniform float uTime; uniform vec3 uSkyColor;
        ${WATER_LEVEL_GLSL}
        ${NOISE_GLSL}
        ${FIELD_GLSL}
        float wave(vec2 p, float t) {
          return vnoise(p * 1.1 + vec2(t * 0.32, t * 0.21)) * 0.07
               + vnoise(p * 2.9 - vec2(t * 0.28, -t * 0.37)) * 0.03;
        }`,
      fragment: {
        color_fragment: /* glsl */ `
          vec4 fld = sampleField(vWPos.xz);
          float depth = WL - fld.r;
          if (depth < -0.04) discard;
          float t = uTime;
          vec2 p = vWPos.xz;
          float e = 0.06;
          float w0 = wave(p, t);
          vec3 wN = normalize(vec3(-(wave(p + vec2(e, 0.0), t) - w0) / e, 1.0, -(wave(p + vec2(0.0, e), t) - w0) / e));

          float d01 = smoothstep(0.0, 1.2, depth);
          vec3 col = mix(${lin('#7fd6d0')}, ${lin('#2f7fa8')}, d01);
          col = mix(col, ${lin('#235f8c')}, smoothstep(0.9, 1.6, depth));
          float caust = vnoise(p * 1.6 + vec2(t * 0.25, t * 0.17)) * vnoise(p * 2.3 - vec2(t * 0.21, -t * 0.12));
          col += (1.0 - d01) * caust * 0.18;

          float nf = vnoise(p * 2.0 + t * 0.25);
          float shore = 1.0 - smoothstep(0.015, 0.07 + nf * 0.07, depth);
          float ring = sin(depth * 26.0 - t * 2.0 + nf * 4.0);
          float lines = smoothstep(0.8, 0.97, ring) * (1.0 - smoothstep(0.04, 0.28, depth)) * smoothstep(0.35, 0.65, nf);
          float foam = clamp(max(shore, lines * 0.8), 0.0, 1.0);

          vec3 V = normalize(cameraPosition - vWPos);
          float fres = pow(1.0 - clamp(dot(V, wN), 0.0, 1.0), 4.0);
          col = mix(col, uSkyColor, fres * 0.6);
          col = mix(col, ${lin('#f4fbff')}, foam);

          diffuseColor.rgb = col;
          float alpha = mix(0.42, 0.9, smoothstep(0.0, 0.9, depth));
          diffuseColor.a = mix(alpha, 0.95, foam) * smoothstep(-0.04, 0.0, depth);
        `,
        normal_fragment_maps: `normal = normalize((viewMatrix * vec4(wN, 0.0)).xyz);`,
      },
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.receiveShadow = true;
    this.mesh.renderOrder = 1;
    this.group.add(this.mesh);

    this._buildWalls();
    terrain.onChange(() => this._updateWalls());
  }

  // Translucent water "glass" on the island edge wherever the terrain dips below sea level.
  _buildWalls() {
    const map = this.terrain.skirtMap;
    const count = map.length;
    const pos = new Float32Array(count * 2 * 3);
    const nor = new Float32Array(count * 2 * 3);
    const tpos = this.terrain.positions;
    const index = [];
    const normals = [[0, 0, 1], [1, 0, 0], [0, 0, -1], [-1, 0, 0]];
    for (let s = 0; s < count; s++) {
      const gi = map[s];
      const side = Math.floor(s / N);
      for (let r = 0; r < 2; r++) {
        const v = s * 2 + r;
        pos[v * 3] = tpos[gi * 3];
        pos[v * 3 + 2] = tpos[gi * 3 + 2];
        pos[v * 3 + 1] = WL;
        nor.set(normals[side], v * 3);
      }
      if (s % N !== N - 1) {
        const t0 = s * 2, b0 = t0 + 1, t1 = t0 + 2, b1 = t0 + 3;
        index.push(t0, b0, t1, t1, b0, b1);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setIndex(index);
    this.wallPos = new THREE.BufferAttribute(pos, 3);
    geo.setAttribute('position', this.wallPos);
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), HALF * 1.6);
    const mat = new THREE.MeshStandardMaterial({
      color: '#3f9cc4',
      roughness: 0.2,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
    });
    this.walls = new THREE.Mesh(geo, mat);
    this.walls.renderOrder = 1;
    this.group.add(this.walls);
  }

  _updateWalls() {
    const h = this.terrain.heights;
    const map = this.terrain.skirtMap;
    const p = this.wallPos.array;
    for (let s = 0; s < map.length; s++) {
      p[(s * 2 + 1) * 3 + 1] = Math.min(WL, h[map[s]]);
    }
    this.wallPos.needsUpdate = true;
  }
}
