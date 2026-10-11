import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();
const _n = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();

// Appends a reversed copy of every triangle so thin sheets render from both sides.
function withBackFaces(g) {
  const src = g.attributes.position.array;
  const out = new Float32Array(src.length * 2);
  out.set(src);
  for (let t = 0; t < src.length; t += 9) {
    const o = src.length + t;
    out.set(src.subarray(t, t + 3), o);
    out.set(src.subarray(t + 6, t + 9), o + 3);
    out.set(src.subarray(t + 3, t + 6), o + 6);
  }
  const r = new THREE.BufferGeometry();
  r.setAttribute('position', new THREE.BufferAttribute(out, 3));
  return r;
}

// Assembles a low-poly model out of primitives into ONE vertex-coloured geometry
// (one draw call per object). Per-vertex extras:
//   aSway - how much the vertex moves in the wind
//   aGlow - lights up at night (windows, lanterns)
export class Builder {
  constructor(rng) {
    this.rng = rng;
    this.parts = [];
  }

  static transform(geo, o = {}) {
    const p = o.p || [0, 0, 0];
    const r = o.r || [0, 0, 0];
    const s = o.s === undefined ? [1, 1, 1] : typeof o.s === 'number' ? [o.s, o.s, o.s] : o.s;
    _m.compose(_v.set(p[0], p[1], p[2]), _q.setFromEuler(_e.set(r[0], r[1], r[2], 'YXZ')), _s.set(s[0], s[1], s[2]));
    geo.applyMatrix4(_m);
    return geo;
  }

  add(geo, color, o = {}) {
    const { flat = true, sway = null, glow = 0, jitter = 0.06, colorFn = null, double = false } = o;
    Builder.transform(geo, o);
    let g = geo.index ? geo.toNonIndexed() : geo;
    if (double) g = withBackFaces(g);
    if (flat) g.computeVertexNormals();
    for (const name of Object.keys(g.attributes)) {
      if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
    }
    const pos = g.attributes.position;
    const nor = g.attributes.normal;
    const count = pos.count;
    const col = new Float32Array(count * 3);
    const sw = new Float32Array(count);
    const gl = new Float32Array(count);
    const base = new THREE.Color(color);
    for (let t = 0; t < count; t += 3) {
      const j = 1 + (this.rng() - 0.5) * 2 * jitter;
      for (let k = 0; k < 3 && t + k < count; k++) {
        const v = t + k;
        if (colorFn) {
          _n.fromBufferAttribute(nor, v);
          _a.fromBufferAttribute(pos, v);
          _c.set(colorFn(_n, _a, base) || base);
        } else _c.copy(base);
        col[v * 3] = _c.r * j;
        col[v * 3 + 1] = _c.g * j;
        col[v * 3 + 2] = _c.b * j;
        if (sway) {
          const y = pos.getY(v);
          const f = Math.min(1, Math.max(0, (y - sway[1]) / (sway[2] - sway[1])));
          sw[v] = sway[0] * f;
        }
        gl[v] = glow;
      }
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('aSway', new THREE.BufferAttribute(sw, 1));
    g.setAttribute('aGlow', new THREE.BufferAttribute(gl, 1));
    this.parts.push(g);
    return this;
  }

  box(w, h, d, color, o) {
    return this.add(new THREE.BoxGeometry(w, h, d), color, o);
  }
  cyl(rt, rb, h, seg, color, o) {
    return this.add(new THREE.CylinderGeometry(rt, rb, h, seg), color, o);
  }
  cone(r, h, seg, color, o) {
    return this.add(new THREE.ConeGeometry(r, h, seg), color, o);
  }
  ico(r, detail, color, o) {
    return this.add(new THREE.IcosahedronGeometry(r, detail), color, o);
  }
  sphere(r, ws, hs, color, o) {
    return this.add(new THREE.SphereGeometry(r, ws, hs), color, { flat: false, ...o });
  }
  // A lumpy rock-like blob: icosahedron with jittered (but still watertight) vertices.
  lump(r, detail, amount, color, o) {
    let g = new THREE.IcosahedronGeometry(r, detail);
    g.deleteAttribute('normal');
    g.deleteAttribute('uv');
    g = mergeVertices(g);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const f = 1 + (this.rng() - 0.5) * 2 * amount;
      p.setXYZ(i, p.getX(i) * f, p.getY(i) * f, p.getZ(i) * f);
    }
    return this.add(g, color, o);
  }
  // Triangular prism: triangle (base b along z, height h) extruded along x by length L.
  prism(b, h, L, color, o) {
    const x0 = -L / 2, x1 = L / 2, z0 = -b / 2, z1 = b / 2;
    const A = [x0, 0, z0], B = [x0, 0, z1], C = [x0, h, 0];
    const A2 = [x1, 0, z0], B2 = [x1, 0, z1], C2 = [x1, h, 0];
    const tris = [A, B, C, A2, C2, B2, A, A2, B2, A, B2, B, B, B2, C2, B, C2, C, A, C, C2, A, C2, A2];
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(tris.flat(), 3));
    return this.add(g, color, o);
  }
  shape(shape, color, o) {
    return this.add(new THREE.ShapeGeometry(shape), color, o);
  }
  geometry(g, color, o) {
    return this.add(g, color, o);
  }

  build({ ao = true } = {}) {
    const geo = mergeGeometries(this.parts, false);
    for (const p of this.parts) p.dispose();
    this.parts = [];
    if (ao) {
      const pos = geo.attributes.position;
      const col = geo.attributes.color;
      for (let i = 0; i < pos.count; i++) {
        const y = pos.getY(i);
        const f = 0.62 + 0.38 * Math.min(1, Math.max(0, y / 0.35));
        col.setXYZ(i, col.getX(i) * f, col.getY(i) * f, col.getZ(i) * f);
      }
    }
    geo.computeBoundingSphere();
    geo.computeBoundingBox();
    return geo;
  }
}
