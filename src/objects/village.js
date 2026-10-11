import * as THREE from 'three';
import { Builder } from './builder.js';

const TAU = Math.PI * 2;
const WOOD = '#a07850';
const DARKWOOD = '#6b4a32';
const GLASS = '#bcd3df';

// A window with frame, cross mullions and night glow. Faces +z unless rotated.
function windowPane(B, x, y, z, ry = 0, w = 0.36, h = 0.36) {
  const rot = [0, ry, 0];
  const off = (dx, dy, dz) => {
    const c = Math.cos(ry), s = Math.sin(ry);
    return [x + dx * c + dz * s, y + dy, z - dx * s + dz * c];
  };
  B.box(w + 0.09, h + 0.09, 0.04, '#f7f1e6', { p: off(0, 0, 0), r: rot });
  B.box(w, h, 0.06, GLASS, { p: off(0, 0, 0.005), r: rot, glow: 1, jitter: 0 });
  B.box(w, 0.03, 0.075, '#f7f1e6', { p: off(0, 0, 0.01), r: rot });
  B.box(0.03, h, 0.075, '#f7f1e6', { p: off(0, 0, 0.01), r: rot });
  B.box(w + 0.14, 0.04, 0.1, '#f7f1e6', { p: off(0, -h / 2 - 0.05, 0.03), r: rot });
}

function gableRoof(B, rng, { W, D, base, color, overhang = 0.22, pitch = 0.78, wall }) {
  const t = Math.tan(pitch);
  const ridge = (D / 2) * t;
  B.prism(D, ridge, W, wall, { p: [0, base, 0] });
  const half = D / 2 + overhang;
  const slope = half / Math.cos(pitch);
  const thick = 0.09;
  const rows = 4;
  const seg = slope / rows;
  const shade = new THREE.Color(color);
  for (const side of [1, -1]) {
    for (let k = 0; k < rows; k++) {
      const s = (k + 0.5) * seg; // distance from eave along slope
      const zEave = side * half;
      const yEave = base - overhang * t;
      const z = zEave - side * Math.cos(pitch) * s;
      const y = yEave + Math.sin(pitch) * s;
      const nz = side * Math.sin(pitch), ny = Math.cos(pitch);
      const lift = thick / 2 + (rows - k) * 0.012;
      const c = shade.clone().multiplyScalar(k % 2 ? 1 : 0.9);
      B.box(W + overhang * 2, thick, seg + 0.05, c, { p: [0, y + ny * lift, z + nz * lift], r: [side * pitch, 0, 0] });
    }
  }
  B.box(W + overhang * 2 + 0.06, 0.1, 0.16, shade.clone().multiplyScalar(0.75), { p: [0, base + ridge + 0.07, 0] });
  return base + ridge;
}

export const VILLAGE = [
  {
    id: 'cottage',
    name: 'Cottage',
    cat: 'village',
    radius: 1.35,
    solid: true,
    clear: 1.45,
    flatten: 1.4,
    rotStep: Math.PI / 4,
    light: { y: 1.1, z: 1.2, intensity: 1 },
    build(rng) {
      const B = new Builder(rng);
      const W = rng.range(1.8, 2.3), D = rng.range(1.5, 1.75), H = rng.range(1.15, 1.45);
      const wall = rng.pick(['#f3e6d0', '#f6d8c8', '#e9eef0', '#f8e7b5', '#dfe9d6', '#f2d4dc']);
      const roof = rng.pick(['#c8553d', '#4f6d8f', '#6b8f4e', '#d9a95a', '#8e5a7a', '#b8483a']);
      const f = 0.25;
      B.box(W + 0.2, f, D + 0.2, '#a39d93', { p: [0, f / 2, 0] });
      B.box(W, H, D, wall, { p: [0, f + H / 2, 0] });
      if (rng.chance(0.5)) {
        for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
          B.box(0.09, H, 0.09, DARKWOOD, { p: [x * (W / 2 + 0.005), f + H / 2, z * (D / 2 + 0.005)] });
        }
        B.box(W + 0.02, 0.07, D + 0.02, DARKWOOD, { p: [0, f + H - 0.04, 0] });
      }
      gableRoof(B, rng, { W, D, base: f + H, color: roof, wall });
      // door + step
      const dx = rng.range(-0.25, 0.3) * W * 0.5;
      B.box(0.46, 0.8, 0.05, '#f7f1e6', { p: [dx, f + 0.4, D / 2 + 0.01] });
      B.box(0.38, 0.74, 0.07, rng.pick(['#8a5a3b', '#4e6e8e', '#a34a3a', '#5e7d4a']), { p: [dx, f + 0.37, D / 2 + 0.02] });
      B.ico(0.025, 0, '#e8c25a', { p: [dx + 0.12, f + 0.38, D / 2 + 0.07] });
      B.box(0.6, 0.1, 0.32, '#a39d93', { p: [dx, 0.05, D / 2 + 0.25] });
      // windows
      const wy = f + H * 0.58;
      const wx = dx > 0 ? -W * 0.25 : W * 0.25;
      windowPane(B, wx, wy, D / 2 + 0.02);
      windowPane(B, W / 2 + 0.02, wy, 0, Math.PI / 2);
      windowPane(B, -W / 2 - 0.02, wy, 0, -Math.PI / 2);
      windowPane(B, -wx * 0.6, wy, -D / 2 - 0.02, Math.PI);
      // flower box under the front window
      B.box(0.48, 0.1, 0.13, DARKWOOD, { p: [wx, wy - 0.3, D / 2 + 0.09] });
      const fc = rng.pick(['#ff7aa2', '#ffd166', '#ff5d6c', '#b48cff']);
      for (let i = 0; i < 4; i++) B.ico(0.05, 0, i % 2 ? fc : '#5c9e3f', { p: [wx - 0.16 + i * 0.105, wy - 0.22, D / 2 + 0.1] });
      // chimney
      const cx = rng.chance(0.5) ? W * 0.28 : -W * 0.28;
      B.box(0.3, 1.0, 0.3, '#a65a45', { p: [cx, f + H + 0.55, -D * 0.18] });
      B.box(0.36, 0.08, 0.36, '#7c4434', { p: [cx, f + H + 1.06, -D * 0.18] });
      const geo = B.build();
      geo.userData.chimney = [cx, f + H + 1.15, -D * 0.18];
      return geo;
    },
  },
  {
    id: 'windmill',
    name: 'Windmill',
    cat: 'village',
    radius: 1.1,
    solid: true,
    clear: 1.2,
    flatten: 1.2,
    rotStep: Math.PI / 4,
    light: { y: 0.9, z: 1.0, intensity: 0.9 },
    build(rng) {
      const B = new Builder(rng);
      B.cyl(0.95, 1.0, 0.3, 8, '#a39d93', { p: [0, 0.15, 0] });
      B.cyl(0.52, 0.82, 2.6, 8, rng.pick(['#f0e5cd', '#f6efe2', '#ead7bf']), { p: [0, 0.3 + 1.3, 0], r: [0, Math.PI / 8, 0] });
      B.cyl(0.6, 0.6, 0.12, 8, DARKWOOD, { p: [0, 2.95, 0], r: [0, Math.PI / 8, 0] });
      B.cone(0.68, 0.95, 8, rng.pick(['#a5503a', '#5d6f8f', '#7b5a43']), { p: [0, 3.48, 0], r: [0, Math.PI / 8, 0] });
      B.box(0.42, 0.75, 0.08, '#7d5236', { p: [0, 0.3 + 0.37, 0.73] });
      windowPane(B, 0, 1.75, 0.62, 0, 0.28, 0.3);
      windowPane(B, 0.62, 1.15, 0.2, Math.PI / 2.5, 0.24, 0.26);
      const geo = B.build();

      const S = new Builder(rng);
      S.cyl(0.11, 0.11, 0.25, 8, DARKWOOD, { r: [Math.PI / 2, 0, 0] });
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * TAU;
        const c = Math.cos(a), s = Math.sin(a);
        S.box(0.07, 1.95, 0.05, DARKWOOD, { p: [-s * 0.98, c * 0.98, 0.06], r: [0, 0, a] });
        S.box(0.4, 1.4, 0.02, '#f4efe2', { p: [-s * 1.15 + c * 0.24, c * 1.15 + s * 0.24, 0.04], r: [0, 0, a] });
        for (let j = 0; j < 4; j++) {
          const d = 0.55 + j * 0.42;
          S.box(0.42, 0.03, 0.04, DARKWOOD, { p: [-s * d + c * 0.22, c * d + s * 0.22, 0.06], r: [0, 0, a] });
        }
      }
      const blades = S.build({ ao: false });
      return { geo, parts: [{ name: 'blades', geo: blades, position: [0, 2.55, 0.86] }] };
    },
    anim(obj, t, dt) {
      const b = obj.userData.parts.blades;
      if (b) b.rotation.z -= dt * 0.7;
    },
  },
  {
    id: 'well',
    name: 'Well',
    cat: 'village',
    radius: 0.65,
    solid: true,
    clear: 0.75,
    flatten: 0.7,
    rotStep: Math.PI / 4,
    build(rng) {
      const B = new Builder(rng);
      const stone = '#a7a39a';
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * TAU;
        for (let row = 0; row < 3; row++) {
          const ao = row % 2 ? Math.PI / 10 : 0;
          B.box(0.3, 0.17, 0.16, rng.chance(0.5) ? stone : '#b8b3a8', {
            p: [Math.cos(a + ao) * 0.5, 0.09 + row * 0.17, Math.sin(a + ao) * 0.5],
            r: [0, -(a + ao) + Math.PI / 2, 0],
          });
        }
      }
      B.cyl(0.44, 0.44, 0.04, 12, '#3f8fb5', { p: [0, 0.4, 0], flat: false, jitter: 0 });
      B.box(0.09, 1.15, 0.09, WOOD, { p: [-0.55, 0.6, 0] });
      B.box(0.09, 1.15, 0.09, WOOD, { p: [0.55, 0.6, 0] });
      B.cyl(0.04, 0.04, 1.15, 6, DARKWOOD, { p: [0, 0.98, 0], r: [0, 0, Math.PI / 2] });
      B.prism(1.05, 0.42, 1.4, '#a5503a', { p: [0, 1.16, 0] });
      B.cyl(0.006, 0.006, 0.3, 3, '#d8cfb8', { p: [0, 0.82, 0] });
      B.cyl(0.09, 0.07, 0.13, 8, '#8a6a4a', { p: [0, 0.64, 0] });
      return B.build();
    },
  },
  {
    id: 'lantern',
    name: 'Lantern',
    cat: 'village',
    radius: 0.2,
    solid: true,
    rotStep: Math.PI / 4,
    light: { y: 1.4, intensity: 1 },
    build(rng) {
      const B = new Builder(rng);
      const iron = '#3b3633';
      B.box(0.22, 0.12, 0.22, '#a39d93', { p: [0, 0.06, 0] });
      B.cyl(0.04, 0.05, 1.25, 6, iron, { p: [0, 0.7, 0] });
      B.box(0.22, 0.03, 0.22, iron, { p: [0, 1.3, 0] });
      B.box(0.17, 0.24, 0.17, '#ffe2a6', { p: [0, 1.43, 0], glow: 1.4, jitter: 0 });
      for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) B.box(0.025, 0.26, 0.025, iron, { p: [x * 0.095, 1.43, z * 0.095] });
      B.cone(0.17, 0.14, 4, iron, { p: [0, 1.62, 0], r: [0, Math.PI / 4, 0] });
      B.ico(0.03, 0, iron, { p: [0, 1.71, 0] });
      return B.build();
    },
  },
  {
    id: 'fence',
    name: 'Fence',
    cat: 'village',
    radius: 0.5,
    solid: false,
    line: 1.0,
    rotStep: Math.PI / 8,
    build(rng) {
      const B = new Builder(rng);
      const wood = rng.pick([WOOD, '#b08560']);
      for (const x of [-0.5, 0.5]) {
        B.box(0.09, 0.58, 0.09, wood, { p: [x, 0.25, 0] });
        B.cone(0.07, 0.07, 4, wood, { p: [x, 0.575, 0], r: [0, Math.PI / 4, 0] });
      }
      B.box(1.02, 0.06, 0.04, wood, { p: [0, 0.2, 0], r: [0, 0, (rng() - 0.5) * 0.04] });
      B.box(1.02, 0.06, 0.04, wood, { p: [0, 0.42, 0], r: [0, 0, (rng() - 0.5) * 0.04] });
      return B.build();
    },
  },
  {
    id: 'bridge',
    name: 'Bridge',
    cat: 'village',
    y: 'surface',
    radius: 1.2,
    solid: false,
    place: 'any',
    rotStep: Math.PI / 8,
    build(rng) {
      const B = new Builder(rng);
      const L = 3.6, rise = 0.5, w = 1.05;
      const yAt = (x) => 0.1 + rise * (1 - (x / (L / 2)) ** 2);
      const slope = (x) => (-2 * rise * x) / ((L / 2) ** 2);
      const planks = 13;
      for (let i = 0; i < planks; i++) {
        const x = -L / 2 + (i + 0.5) * (L / planks);
        B.box(L / planks - 0.025, 0.08, w, i % 2 ? '#b98a5e' : '#ad7f54', { p: [x, yAt(x), 0], r: [0, 0, Math.atan(slope(x))] });
      }
      for (const z of [-0.45, 0.45]) {
        // stringer beam under the planks
        for (let i = 0; i < 8; i++) {
          const x0 = -L / 2 + (i / 8) * L, x1 = x0 + L / 8;
          const xm = (x0 + x1) / 2;
          B.box(L / 8 + 0.02, 0.12, 0.1, DARKWOOD, { p: [xm, yAt(xm) - 0.1, z], r: [0, 0, Math.atan(slope(xm))] });
        }
        const posts = [-1.6, -0.8, 0, 0.8, 1.6];
        for (const x of posts) B.box(0.08, 0.45, 0.08, '#8d6440', { p: [x, yAt(x) + 0.22, z * 1.04] });
        for (let i = 0; i < posts.length - 1; i++) {
          const x0 = posts[i], x1 = posts[i + 1];
          const y0 = yAt(x0) + 0.42, y1 = yAt(x1) + 0.42;
          const len = Math.hypot(x1 - x0, y1 - y0);
          B.box(len + 0.04, 0.06, 0.07, '#8d6440', { p: [(x0 + x1) / 2, (y0 + y1) / 2, z * 1.04], r: [0, 0, Math.atan2(y1 - y0, x1 - x0)] });
        }
      }
      return B.build({ ao: false });
    },
  },
  {
    id: 'bench',
    name: 'Bench',
    cat: 'village',
    radius: 0.45,
    solid: true,
    rotStep: Math.PI / 8,
    build(rng) {
      const B = new Builder(rng);
      const wood = rng.pick(['#a77b52', '#b98a5e']);
      B.box(0.95, 0.06, 0.34, wood, { p: [0, 0.38, 0] });
      B.box(0.95, 0.24, 0.05, wood, { p: [0, 0.62, -0.17], r: [-0.18, 0, 0] });
      for (const x of [-0.4, 0.4]) {
        B.box(0.06, 0.38, 0.06, '#3b3633', { p: [x, 0.19, 0.12] });
        B.box(0.06, 0.7, 0.06, '#3b3633', { p: [x, 0.35, -0.14] });
        B.box(0.06, 0.04, 0.34, '#3b3633', { p: [x, 0.52, 0], r: [0, 0, 0] });
      }
      return B.build();
    },
  },
  {
    id: 'stall',
    name: 'Market Stall',
    cat: 'village',
    radius: 1.0,
    solid: true,
    clear: 1.0,
    flatten: 1.0,
    rotStep: Math.PI / 4,
    light: { y: 1.4, z: 0.8, intensity: 0.7 },
    build(rng) {
      const B = new Builder(rng);
      B.box(1.7, 0.75, 0.7, '#b08560', { p: [0, 0.375, 0.1] });
      B.box(1.78, 0.06, 0.78, '#8d6440', { p: [0, 0.77, 0.1] });
      for (const [x, z] of [[-0.82, -0.25], [0.82, -0.25], [-0.82, 0.45], [0.82, 0.45]]) {
        B.box(0.07, z < 0 ? 2.0 : 1.7, 0.07, DARKWOOD, { p: [x, z < 0 ? 1.0 : 0.85, z] });
      }
      const [c1, c2] = rng.pick([['#e85a4f', '#fff3e0'], ['#4f8fd8', '#fff3e0'], ['#5aa86a', '#fff3e0'], ['#f2a93b', '#fff3e0']]);
      const stripes = 7;
      for (let i = 0; i < stripes; i++) {
        const x = -0.9 + (i + 0.5) * (1.8 / stripes);
        B.box(1.8 / stripes + 0.005, 0.04, 1.05, i % 2 ? c2 : c1, { p: [x, 1.85, 0.12], r: [0.28, 0, 0] });
        B.cone(0.13, 0.12, 3, i % 2 ? c2 : c1, { p: [x, 1.66, 0.62], r: [Math.PI, 0, 0], s: [1, 1, 0.25] });
      }
      const produce = [['#d8402f', 0.06], ['#f2a33a', 0.065], ['#7fbf5a', 0.09], ['#f2d35b', 0.06], ['#8e4fa0', 0.05]];
      for (let c = 0; c < 3; c++) {
        const x = -0.55 + c * 0.55;
        B.box(0.45, 0.14, 0.4, '#c69a6a', { p: [x, 0.87, 0.18] });
        const [col, r] = rng.pick(produce);
        for (let k = 0; k < 6; k++) B.ico(r, 0, col, { p: [x - 0.12 + (k % 3) * 0.12, 0.97, 0.1 + Math.floor(k / 3) * 0.14] });
      }
      return B.build();
    },
  },
  {
    id: 'garden',
    name: 'Veggie Patch',
    cat: 'village',
    radius: 0.9,
    solid: true,
    clear: 1.0,
    rotStep: Math.PI / 4,
    build(rng) {
      const B = new Builder(rng);
      const W = 1.7, D = 1.25;
      B.box(W, 0.16, D, '#5a3d2a', { p: [0, 0.08, 0] });
      for (const s of [-1, 1]) {
        B.box(W + 0.1, 0.2, 0.08, '#9a7048', { p: [0, 0.1, s * (D / 2)] });
        B.box(0.08, 0.2, D, '#9a7048', { p: [s * (W / 2), 0.1, 0] });
      }
      const kind = rng.int(0, 3);
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 4; c++) {
          const x = -W / 2 + 0.25 + c * ((W - 0.5) / 3);
          const z = -D / 2 + 0.25 + r * ((D - 0.5) / 2);
          const k = kind === 3 ? (r + c) % 3 : kind;
          if (k === 0) {
            B.ico(0.13, 1, '#8ccf6a', { p: [x, 0.25, z], s: [1, 0.8, 1] });
            B.ico(0.16, 0, '#5f9e48', { p: [x, 0.2, z], s: [1, 0.5, 1] });
          } else if (k === 1) {
            for (let l = 0; l < 3; l++) B.cone(0.03, 0.26, 3, '#5fae45', { p: [x, 0.3, z], r: [0, l * 2, 0.3], sway: [0.5, 0.15, 0.45] });
            B.cone(0.04, 0.1, 5, '#f08a2c', { p: [x, 0.17, z], r: [Math.PI, 0, 0] });
          } else {
            B.sphere(0.13, 8, 6, '#f08a2c', { p: [x, 0.25, z], s: [1, 0.75, 1], flat: true });
            B.cyl(0.015, 0.02, 0.08, 4, '#5a7a3a', { p: [x, 0.37, z] });
          }
        }
      }
      return B.build();
    },
  },
  {
    id: 'boat',
    name: 'Rowboat',
    cat: 'village',
    place: 'water',
    y: 'water',
    radius: 0.6,
    solid: false,
    rotStep: Math.PI / 8,
    build(rng) {
      const B = new Builder(rng);
      const hull = rng.pick(['#9a6a43', '#c96f4a', '#5d7fa6', '#e8dcc4']);
      B.add(new THREE.SphereGeometry(1, 10, 5, 0, TAU, Math.PI / 2, Math.PI / 2), hull, { s: [0.42, 0.3, 1.0], p: [0, 0.16, 0], flat: true });
      B.add(new THREE.CircleGeometry(1, 10), '#7a5236', { r: [-Math.PI / 2, 0, 0], s: [0.36, 0.86, 1], p: [0, 0.12, 0], flat: true });
      B.box(0.75, 0.04, 0.14, '#b98a5e', { p: [0, 0.16, 0.1] });
      B.box(0.6, 0.04, 0.12, '#b98a5e', { p: [0, 0.16, -0.45] });
      B.cyl(0.015, 0.015, 1.1, 4, '#b98a5e', { p: [0.32, 0.2, 0.05], r: [Math.PI / 2 - 0.1, 0, 0.2] });
      B.cyl(0.015, 0.015, 1.1, 4, '#b98a5e', { p: [-0.32, 0.2, 0.05], r: [Math.PI / 2 - 0.1, 0, -0.2] });
      return B.build({ ao: false });
    },
    anim(obj, t, dt, item) {
      obj.position.y = item.baseY + Math.sin(t * 1.4 + item.seed) * 0.025;
      obj.rotation.z = Math.sin(t * 1.1 + item.seed) * 0.04;
      obj.rotation.x = Math.sin(t * 0.9 + item.seed * 2) * 0.025;
    },
  },
];
