import * as THREE from 'three';
import { WORLD, HALF, CELL, GRID_N, PAINT_LAYERS } from '../config.js';
import { smoothstep, clamp } from '../util/noise.js';
import { patchShader } from '../render/patch.js';
import { NOISE_GLSL, GRASS_COLOR_GLSL, PALETTE, lin, WATER_LEVEL_GLSL } from '../render/glsl.js';

const N = GRID_N;
const WL = WORLD.waterLevel;

const falloff = (t) => (t >= 1 ? 0 : 0.5 + 0.5 * Math.cos(Math.PI * t));

export class Terrain {
  constructor(shared) {
    this.shared = shared;
    this.heights = new Float32Array(N * N);
    this.paint = new Float32Array(N * N * PAINT_LAYERS);
    this.flowers = new Float32Array(N * N);
    this.clear = new Float32Array(N * N);
    this.normals = new Float32Array(N * N * 3);
    this.positions = new Float32Array(N * N * 3);
    this.fieldData = new Float32Array(N * N * 4);
    this.clearProvider = null;
    this.listeners = new Set();
    this.dirty = true;
    this.revision = 0;

    this.fieldTex = new THREE.DataTexture(this.fieldData, N, N, THREE.RGBAFormat, THREE.FloatType);
    this.fieldTex.magFilter = THREE.NearestFilter;
    this.fieldTex.minFilter = THREE.NearestFilter;
    this.fieldTex.needsUpdate = true;
    shared.uniforms.uField = { value: this.fieldTex };

    this.group = new THREE.Group();
    this.group.name = 'terrain';
    this._buildSurface();
    this._buildSkirt();
  }

  // ---------------------------------------------------------------- geometry

  _buildSurface() {
    const pos = this.positions;
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const k = (j * N + i) * 3;
        pos[k] = -HALF + i * CELL;
        pos[k + 2] = -HALF + j * CELL;
      }
    }
    const index = [];
    for (let j = 0; j < N - 1; j++) {
      for (let i = 0; i < N - 1; i++) {
        const a = j * N + i, b = a + 1, c = a + N, d = c + 1;
        if ((i + j) & 1) index.push(a, c, b, b, c, d);
        else index.push(a, c, d, a, d, b);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setIndex(index);
    this.posAttr = new THREE.BufferAttribute(pos, 3);
    this.normAttr = new THREE.BufferAttribute(this.normals, 3);
    this.paintAttr = new THREE.BufferAttribute(this.paint, PAINT_LAYERS);
    geo.setAttribute('position', this.posAttr);
    geo.setAttribute('normal', this.normAttr);
    geo.setAttribute('aPaint', this.paintAttr);
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1, 0), HALF * 1.6);
    geo.boundingBox = new THREE.Box3(
      new THREE.Vector3(-HALF, WORLD.minHeight, -HALF),
      new THREE.Vector3(HALF, WORLD.maxHeight, HALF),
    );

    const P = PALETTE;
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0 });
    patchShader(mat, {
      key: 'terrain',
      uniforms: { uTime: this.shared.uniforms.uTime },
      vertexHeader: `attribute vec4 aPaint; varying vec4 vPaint; varying vec3 vWPos; varying vec3 vWNormal;`,
      vertex: {
        fog_vertex: `#include <fog_vertex>
          vPaint = aPaint;
          vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
          vWNormal = normalize(mat3(modelMatrix) * objectNormal);`,
      },
      fragmentHeader: `varying vec4 vPaint; varying vec3 vWPos; varying vec3 vWNormal;
        ${WATER_LEVEL_GLSL}
        ${NOISE_GLSL}
        ${GRASS_COLOR_GLSL}`,
      fragment: {
        color_fragment: /* glsl */ `
          vec3 wp = vWPos;
          vec3 wn = normalize(vWNormal);
          float n1 = vnoise(wp.xz * 2.3);
          float n2 = vnoise(wp.xz * 7.1);
          vec3 col = grassColor(wp.xz) * 0.8;

          // sandy beaches appear automatically along the shore
          float beach = 1.0 - smoothstep(WL + 0.1, WL + 0.3, wp.y + (n1 - 0.5) * 0.14);
          col = mix(col, ${lin(P.sand)} * (0.93 + 0.12 * n2), beach);
          float under = smoothstep(WL + 0.02, WL - 0.35, wp.y);
          vec3 bed = mix(${lin(P.wetSand)}, ${lin(P.bed)}, smoothstep(WL - 0.2, WL - 1.0, wp.y));
          col = mix(col, bed * (0.9 + 0.2 * n2), under);

          // painted layers, with wobbly organic edges
          vec4 pt = vPaint;
          float jit = (n1 - 0.5) * 0.34 + (n2 - 0.5) * 0.14;
          float wSand = smoothstep(0.4, 0.56, pt.y + jit);
          col = mix(col, ${lin(P.sand)} * (0.93 + 0.12 * n2), wSand);

          float wSoil = smoothstep(0.4, 0.56, pt.z + jit);
          float furrow = 0.5 + 0.5 * sin(wp.x * 8.0 + wp.z * 1.3 + n1 * 1.5);
          vec3 soil = mix(${lin(P.furrow)}, ${lin(P.soil)}, smoothstep(0.15, 0.6, furrow)) * (0.9 + 0.2 * n2);
          col = mix(col, soil, wSoil);

          float wPath = smoothstep(0.4, 0.56, pt.x + jit);
          float peb = smoothstep(0.62, 0.8, vnoise(wp.xz * 9.0 + 3.1));
          vec3 path = mix(${lin(P.path)} * (0.92 + 0.16 * n2), ${lin(P.pebble)}, peb * 0.8);
          col = mix(col, path, wPath);

          float wStone = smoothstep(0.4, 0.56, pt.w + jit * 0.6);
          vec2 q = wp.xz * 1.7;
          q.x += floor(q.y) * 0.5;
          vec2 cellF = fract(q) - 0.5;
          float edge = max(abs(cellF.x), abs(cellF.y));
          vec3 stone = ${lin(P.stone)} * (0.85 + 0.25 * hash12(floor(q)));
          stone = mix(stone, ${lin(P.grout)}, smoothstep(0.40, 0.46, edge));
          col = mix(col, stone, wStone);

          // rocky cliffs on steep slopes, snow on the peaks
          float cliff = smoothstep(0.3, 0.4, (1.0 - wn.y) + (n1 - 0.5) * 0.12);
          float strata = vnoise(vec2(wp.y * 3.5, (wp.x + wp.z) * 0.4));
          vec3 rock = mix(${lin(P.rockA)}, ${lin(P.rockB)}, strata) * (0.9 + 0.2 * n2);
          col = mix(col, rock, cliff);
          float snow = smoothstep(4.0, 4.3, wp.y + (n1 - 0.5) * 0.5) * (1.0 - cliff * 0.7);
          col = mix(col, ${lin(P.snow)}, snow);

          diffuseColor.rgb = col;
        `,
      },
    });
    this.material = mat;
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.receiveShadow = true;
    this.mesh.castShadow = true;
    this.mesh.name = 'terrain-surface';
    this.group.add(this.mesh);
  }

  _buildSkirt() {
    // Four outward-facing walls + a bottom, so the island reads as a cut-out diorama block.
    const sides = [
      { idx: (k) => (N - 1) * N + k, n: [0, 0, 1] }, // south (z+), x increasing
      { idx: (k) => (N - 1 - k) * N + (N - 1), n: [1, 0, 0] }, // east (x+), z decreasing
      { idx: (k) => (N - 1 - k), n: [0, 0, -1] }, // north (z-), x decreasing
      { idx: (k) => k * N, n: [-1, 0, 0] }, // west (x-), z increasing
    ];
    const verts = sides.length * N * 2 + 4;
    const pos = new Float32Array(verts * 3);
    const nor = new Float32Array(verts * 3);
    const top = new Float32Array(verts);
    const index = [];
    this.skirtMap = [];
    let v = 0;
    for (const s of sides) {
      const base = v;
      for (let k = 0; k < N; k++) {
        const gi = s.idx(k);
        this.skirtMap.push(gi);
        for (let r = 0; r < 2; r++) {
          pos[v * 3] = this.positions[gi * 3];
          pos[v * 3 + 2] = this.positions[gi * 3 + 2];
          pos[v * 3 + 1] = r === 0 ? 0 : WORLD.baseY;
          nor.set(s.n, v * 3);
          v++;
        }
      }
      for (let k = 0; k < N - 1; k++) {
        const t0 = base + k * 2, b0 = t0 + 1, t1 = t0 + 2, b1 = t0 + 3;
        index.push(t0, b0, t1, t1, b0, b1);
      }
    }
    // bottom
    const b = v;
    const corners = [[-HALF, -HALF], [HALF, -HALF], [HALF, HALF], [-HALF, HALF]];
    for (const [x, z] of corners) {
      pos.set([x, WORLD.baseY, z], v * 3);
      nor.set([0, -1, 0], v * 3);
      top[v] = WORLD.baseY;
      v++;
    }
    index.push(b, b + 1, b + 2, b, b + 2, b + 3);

    const geo = new THREE.BufferGeometry();
    geo.setIndex(index);
    this.skirtPos = new THREE.BufferAttribute(pos, 3);
    this.skirtTop = new THREE.BufferAttribute(top, 1);
    geo.setAttribute('position', this.skirtPos);
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setAttribute('aTop', this.skirtTop);
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), HALF * 1.8);

    const mat = new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0 });
    patchShader(mat, {
      key: 'skirt',
      vertexHeader: `attribute float aTop; varying float vTop; varying vec3 vWPos;`,
      vertex: {
        fog_vertex: `#include <fog_vertex>
          vTop = aTop;
          vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
      },
      fragmentHeader: `varying float vTop; varying vec3 vWPos;
        ${WATER_LEVEL_GLSL}
        ${NOISE_GLSL}
        ${GRASS_COLOR_GLSL}`,
      fragment: {
        color_fragment: /* glsl */ `
          vec2 hv = vec2((vWPos.x + vWPos.z) * 1.0, vWPos.y);
          float wob = (vnoise(vec2(hv.x * 0.5, 3.0)) - 0.5) * 0.5 + (vnoise(hv * vec2(2.0, 1.0)) - 0.5) * 0.15;
          float band = vWPos.y + wob;
          vec3 col = vec3(0.24, 0.13, 0.065);
          col = mix(col, vec3(0.30, 0.18, 0.09), smoothstep(-0.7, -1.0, band));
          col = mix(col, vec3(0.43, 0.24, 0.12), smoothstep(-1.6, -1.9, band));
          col = mix(col, vec3(0.20, 0.18, 0.16), smoothstep(-2.5, -2.8, band));
          float speck = smoothstep(0.78, 0.9, vnoise(hv * vec2(6.0, 9.0)));
          col *= 1.0 - speck * 0.25;
          col *= 0.9 + 0.2 * vnoise(hv * 3.0);
          float below = vTop - vWPos.y;
          vec3 lip = vTop > WL + 0.25 ? grassColor(vWPos.xz) * 0.85 : (vTop > WL - 0.02 ? ${lin(PALETTE.sand)} : ${lin(PALETTE.bed)});
          col = mix(col, lip, smoothstep(0.16 + wob * 0.2, 0.08, below));
          col *= mix(0.7, 1.0, smoothstep(0.1, 0.5, below)) ;
          diffuseColor.rgb = col;
        `,
      },
    });
    this.skirt = new THREE.Mesh(geo, mat);
    this.skirt.receiveShadow = true;
    this.skirt.castShadow = true;
    this.skirt.name = 'terrain-skirt';
    this.group.add(this.skirt);
  }

  // ---------------------------------------------------------------- queries

  index(i, j) {
    return j * N + i;
  }

  heightAt(x, z) {
    const gx = clamp((x + HALF) / CELL, 0, N - 1.0001);
    const gz = clamp((z + HALF) / CELL, 0, N - 1.0001);
    const i = Math.floor(gx), j = Math.floor(gz);
    const fx = gx - i, fz = gz - j;
    const h = this.heights;
    const a = h[j * N + i], b = h[j * N + i + 1];
    const c = h[(j + 1) * N + i], d = h[(j + 1) * N + i + 1];
    return (a * (1 - fx) + b * fx) * (1 - fz) + (c * (1 - fx) + d * fx) * fz;
  }

  // Height of whatever you'd stand on: terrain or the water surface.
  surfaceAt(x, z) {
    return Math.max(this.heightAt(x, z), WL);
  }

  slopeAt(x, z) {
    const e = CELL;
    const dx = this.heightAt(x + e, z) - this.heightAt(x - e, z);
    const dz = this.heightAt(x, z + e) - this.heightAt(x, z - e);
    return Math.sqrt(dx * dx + dz * dz) / (2 * e);
  }

  isInside(x, z, margin = 0) {
    return Math.abs(x) <= HALF - margin && Math.abs(z) <= HALF - margin;
  }

  // Ray-march the height field (or water surface). Returns {point, water} or null.
  raycast(ray, { water = true } = {}) {
    const o = ray.origin, d = ray.direction;
    let tmin = 0, tmax = 1000;
    const lo = [-HALF, WORLD.minHeight - 0.5, -HALF];
    const hi = [HALF, WORLD.maxHeight + 0.5, HALF];
    const oa = [o.x, o.y, o.z], da = [d.x, d.y, d.z];
    for (let a = 0; a < 3; a++) {
      if (Math.abs(da[a]) < 1e-9) {
        if (oa[a] < lo[a] || oa[a] > hi[a]) return null;
        continue;
      }
      let t1 = (lo[a] - oa[a]) / da[a];
      let t2 = (hi[a] - oa[a]) / da[a];
      if (t1 > t2) [t1, t2] = [t2, t1];
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return null;
    }
    const surf = (x, z) => (water ? this.surfaceAt(x, z) : this.heightAt(x, z));
    const step = CELL * 0.5;
    let prevT = tmin;
    for (let t = tmin; t <= tmax + step; t += step) {
      const tt = Math.min(t, tmax);
      const x = o.x + d.x * tt, y = o.y + d.y * tt, z = o.z + d.z * tt;
      if (y <= surf(x, z)) {
        let a = prevT, b = tt;
        for (let k = 0; k < 12; k++) {
          const m = (a + b) / 2;
          const mx = o.x + d.x * m, my = o.y + d.y * m, mz = o.z + d.z * m;
          if (my <= surf(mx, mz)) b = m;
          else a = m;
        }
        const p = new THREE.Vector3(o.x + d.x * b, o.y + d.y * b, o.z + d.z * b);
        return { point: p, water: this.heightAt(p.x, p.z) < WL };
      }
      prevT = tt;
      if (tt >= tmax) break;
    }
    return null;
  }

  // ---------------------------------------------------------------- brushes

  _each(x, z, r, fn) {
    const i0 = Math.max(0, Math.floor((x - r + HALF) / CELL));
    const i1 = Math.min(N - 1, Math.ceil((x + r + HALF) / CELL));
    const j0 = Math.max(0, Math.floor((z - r + HALF) / CELL));
    const j1 = Math.min(N - 1, Math.ceil((z + r + HALF) / CELL));
    for (let j = j0; j <= j1; j++) {
      const wz = -HALF + j * CELL;
      for (let i = i0; i <= i1; i++) {
        const wx = -HALF + i * CELL;
        const d = Math.hypot(wx - x, wz - z) / r;
        if (d < 1) fn(j * N + i, falloff(d), i, j);
      }
    }
    this.markDirty();
  }

  _clampH(v) {
    return clamp(v, WORLD.minHeight, WORLD.maxHeight);
  }

  raise(x, z, r, amount) {
    const h = this.heights;
    this._each(x, z, r, (k, f) => (h[k] = this._clampH(h[k] + amount * f)));
  }

  flatten(x, z, r, target, k) {
    const h = this.heights;
    this._each(x, z, r, (i, f) => (h[i] = this._clampH(h[i] + (target - h[i]) * Math.min(1, k * f))));
  }

  smooth(x, z, r, k) {
    const h = this.heights;
    const src = h.slice();
    this._each(x, z, r, (idx, f, i, j) => {
      let sum = 0, cnt = 0;
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          const ii = i + di, jj = j + dj;
          if (ii < 0 || jj < 0 || ii >= N || jj >= N) continue;
          sum += src[jj * N + ii];
          cnt++;
        }
      }
      h[idx] += (sum / cnt - h[idx]) * Math.min(1, k * f);
    });
  }

  // Flat top of radius r0 easing back into the surrounding land by r1 (used under buildings).
  plateau(x, z, r0, r1, target) {
    const h = this.heights;
    this._each(x, z, r1, (i, f, ii, jj) => {
      const d = Math.hypot(-HALF + ii * CELL - x, -HALF + jj * CELL - z);
      h[i] += (target - h[i]) * (1 - smoothstep(r0, r1, d));
    });
  }

  // Carve towards a riverbed depth; never raises.
  dig(x, z, r, k, depth = 0.65) {
    const h = this.heights;
    const target = WL - depth;
    this._each(x, z, r, (i, f) => {
      if (h[i] > target) h[i] = Math.max(target, h[i] + (target - h[i]) * Math.min(1, k * f));
    });
  }

  // Fill water areas back up to dry land.
  fill(x, z, r, k) {
    const h = this.heights;
    const target = WL + 0.45;
    this._each(x, z, r, (i, f) => {
      if (h[i] < target) h[i] = Math.min(target, h[i] + (target - h[i]) * Math.min(1, k * f));
    });
  }

  paintLayer(x, z, r, layer, k) {
    const p = this.paint;
    this._each(x, z, r, (i, f) => {
      const a = Math.min(1, k * f);
      for (let l = 0; l < PAINT_LAYERS; l++) {
        const o = i * PAINT_LAYERS + l;
        if (l === layer) p[o] += (1 - p[o]) * a;
        else p[o] *= 1 - a;
      }
    });
  }

  paintFlowers(x, z, r, k, erase = false) {
    const fl = this.flowers;
    this._each(x, z, r, (i, f) => {
      const a = Math.min(1, k * f);
      fl[i] += ((erase ? 0 : 1) - fl[i]) * a;
    });
  }

  stampClear(x, z, r) {
    const c = this.clear;
    const R = r * 1.25;
    const i0 = Math.max(0, Math.floor((x - R + HALF) / CELL));
    const i1 = Math.min(N - 1, Math.ceil((x + R + HALF) / CELL));
    const j0 = Math.max(0, Math.floor((z - R + HALF) / CELL));
    const j1 = Math.min(N - 1, Math.ceil((z + R + HALF) / CELL));
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const d = Math.hypot(-HALF + i * CELL - x, -HALF + j * CELL - z);
        const v = 1 - smoothstep(r * 0.8, R, d);
        const idx = j * N + i;
        if (v > c[idx]) c[idx] = v;
      }
    }
  }

  // ---------------------------------------------------------------- update

  markDirty() {
    this.dirty = true;
  }

  onChange(fn) {
    this.listeners.add(fn);
  }

  update() {
    if (!this.dirty) return;
    this.dirty = false;
    this.refresh();
  }

  refresh() {
    const h = this.heights, pos = this.positions, nor = this.normals;
    for (let k = 0; k < N * N; k++) pos[k * 3 + 1] = h[k];

    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const hl = h[j * N + Math.max(0, i - 1)];
        const hr = h[j * N + Math.min(N - 1, i + 1)];
        const hd = h[Math.max(0, j - 1) * N + i];
        const hu = h[Math.min(N - 1, j + 1) * N + i];
        let nx = hl - hr, ny = 2 * CELL, nz = hd - hu;
        const l = Math.hypot(nx, ny, nz);
        const k = (j * N + i) * 3;
        nor[k] = nx / l;
        nor[k + 1] = ny / l;
        nor[k + 2] = nz / l;
      }
    }

    this.clear.fill(0);
    if (this.clearProvider) this.clearProvider(this);

    const fd = this.fieldData, p = this.paint, c = this.clear, fl = this.flowers;
    for (let k = 0; k < N * N; k++) {
      const hk = h[k];
      const paintSum = p[k * 4] + p[k * 4 + 1] + p[k * 4 + 2] + p[k * 4 + 3];
      let g = 1 - Math.min(1, paintSum * 1.7);
      g *= smoothstep(WL + 0.2, WL + 0.42, hk);
      g *= smoothstep(0.74, 0.8, nor[k * 3 + 1]);
      g *= 1 - smoothstep(3.85, 4.15, hk);
      g *= 1 - c[k];
      fd[k * 4] = hk;
      fd[k * 4 + 1] = g;
      fd[k * 4 + 2] = fl[k] * g;
      fd[k * 4 + 3] = 0;
    }

    // skirt tops follow the edge heights
    const sp = this.skirtPos.array, st = this.skirtTop.array;
    for (let s = 0; s < this.skirtMap.length; s++) {
      const gi = this.skirtMap[s];
      sp[(s * 2) * 3 + 1] = h[gi];
      st[s * 2] = h[gi];
      st[s * 2 + 1] = h[gi];
    }

    this.posAttr.needsUpdate = true;
    this.normAttr.needsUpdate = true;
    this.paintAttr.needsUpdate = true;
    this.skirtPos.needsUpdate = true;
    this.skirtTop.needsUpdate = true;
    this.fieldTex.needsUpdate = true;
    this.revision++;
    for (const fn of this.listeners) fn(this);
  }

  // ---------------------------------------------------------------- state

  snapshot() {
    return { heights: this.heights.slice(), paint: this.paint.slice(), flowers: this.flowers.slice() };
  }

  restore(s) {
    this.heights.set(s.heights);
    this.paint.set(s.paint);
    this.flowers.set(s.flowers);
    this.markDirty();
  }
}
