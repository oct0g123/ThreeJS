import * as THREE from 'three';
import { Builder } from './builder.js';

const TAU = Math.PI * 2;
const BARK = ['#7a5236', '#6e4a31', '#85593a'];

function canopy(B, rng, { trunkH, colors, blobs, spread = [0.45, 0.75], big = [0.85, 1.05], small = [0.5, 0.75], flatten = 1 }) {
  const centers = [];
  for (let i = 0; i < blobs; i++) {
    const a = (i / blobs) * TAU + rng() * 0.8;
    const rad = i === 0 ? 0 : rng.range(spread[0], spread[1]);
    const r = i === 0 ? rng.range(big[0], big[1]) : rng.range(small[0], small[1]);
    const y = trunkH + 0.5 + (i === 0 ? 0.35 : rng.range(-0.15, 0.35));
    const c = [Math.cos(a) * rad, y, Math.sin(a) * rad];
    centers.push({ c, r });
    B.ico(r, 1, rng.pick(colors), {
      p: c,
      s: [1, rng.range(0.82, 0.98) * flatten, 1],
      r: [rng() * 3, rng() * 3, 0],
      sway: [1, trunkH * 0.7, trunkH + 2.2],
    });
  }
  return centers;
}

function trunk(B, rng, h, rt = 0.11, rb = 0.2) {
  const col = rng.pick(BARK);
  B.cyl(rt, rb, h, 7, col, { p: [0, h / 2, 0] });
  B.cyl(0.045, 0.075, 0.7, 5, col, { p: [0.22, h * 0.72, 0], r: [0, rng() * TAU, -0.85] });
  // root flare
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU + rng();
    B.cone(0.09, 0.35, 4, col, { p: [Math.cos(a) * 0.17, 0.08, Math.sin(a) * 0.17], r: [0, -a, Math.PI / 2 - 0.35], s: [1, 1, 0.6] });
  }
}

function groundScatter(B, rng, colors, count, radius) {
  for (let i = 0; i < count; i++) {
    const a = rng() * TAU;
    const d = rng.range(0.3, radius);
    B.cyl(0.07, 0.07, 0.012, 5, rng.pick(colors), { p: [Math.cos(a) * d, 0.02, Math.sin(a) * d], r: [0, rng() * TAU, 0], s: [1, 1, rng.range(0.5, 1)] });
  }
}

export const NATURE = [
  {
    id: 'oak',
    name: 'Oak',
    cat: 'nature',
    radius: 0.9,
    solid: true,
    clear: 0.5,
    scale: [0.8, 1.2],
    build(rng) {
      const B = new Builder(rng);
      const h = rng.range(1.1, 1.5);
      trunk(B, rng, h);
      canopy(B, rng, { trunkH: h, colors: ['#5e9e3a', '#6aac43', '#4f8f35', '#78b84b'], blobs: rng.int(4, 6) });
      return B.build();
    },
  },
  {
    id: 'apple',
    name: 'Apple Tree',
    cat: 'nature',
    radius: 0.85,
    solid: true,
    clear: 0.5,
    scale: [0.75, 1.05],
    build(rng) {
      const B = new Builder(rng);
      const h = rng.range(1.0, 1.25);
      trunk(B, rng, h);
      const blobs = canopy(B, rng, { trunkH: h, colors: ['#6aa843', '#5c9b3c', '#78b64e'], blobs: rng.int(4, 5), big: [0.8, 0.9], small: [0.5, 0.65] });
      const fruit = rng.chance(0.25) ? '#f2c14e' : '#d8402f';
      for (let i = 0; i < 14; i++) {
        const b = rng.pick(blobs);
        const dir = new THREE.Vector3(rng() - 0.5, rng() * 0.9 - 0.25, rng() - 0.5).normalize();
        B.ico(0.075, 0, fruit, { p: [b.c[0] + dir.x * b.r * 0.97, b.c[1] + dir.y * b.r * 0.9, b.c[2] + dir.z * b.r * 0.97], sway: [1, h * 0.7, h + 2.2] });
      }
      for (let i = 0; i < 3; i++) {
        const a = rng() * TAU, d = rng.range(0.5, 1.0);
        B.ico(0.075, 0, fruit, { p: [Math.cos(a) * d, 0.06, Math.sin(a) * d] });
      }
      return B.build();
    },
  },
  {
    id: 'pine',
    name: 'Pine',
    cat: 'nature',
    radius: 0.75,
    solid: true,
    clear: 0.45,
    scale: [0.8, 1.35],
    build(rng) {
      const B = new Builder(rng);
      B.cyl(0.1, 0.17, 0.8, 6, rng.pick(BARK), { p: [0, 0.4, 0] });
      const layers = rng.int(3, 4);
      const greens = ['#2f6e4a', '#3a7d52', '#2a6342', '#367a4c'];
      for (let i = 0; i < layers; i++) {
        const f = i / layers;
        const r = 1.05 - f * 0.62;
        B.cone(r, 1.25 - f * 0.25, 7, rng.pick(greens), {
          p: [0, 0.75 + i * 0.68 + (1.25 - f * 0.25) / 2, 0],
          r: [0, rng() * TAU, 0],
          sway: [0.8, 0.5, 3.5],
        });
      }
      return B.build();
    },
  },
  {
    id: 'cherry',
    name: 'Cherry Blossom',
    cat: 'nature',
    radius: 0.95,
    solid: true,
    clear: 0.5,
    scale: [0.8, 1.15],
    build(rng) {
      const B = new Builder(rng);
      const col = '#5e3d2c';
      B.cyl(0.1, 0.18, 0.9, 6, col, { p: [0, 0.45, 0] });
      B.cyl(0.08, 0.1, 0.8, 6, col, { p: [0.15, 1.2, 0], r: [0, 0, -0.35] });
      B.cyl(0.05, 0.07, 0.7, 5, col, { p: [-0.25, 1.15, 0.1], r: [0.3, 0, 0.7] });
      const pinks = ['#f6a8c4', '#f9bfd3', '#ee93b4', '#fcd2e0'];
      canopy(B, rng, { trunkH: 1.1, colors: pinks, blobs: rng.int(5, 6), spread: [0.55, 0.85], big: [0.75, 0.85], small: [0.5, 0.65], flatten: 0.85 });
      groundScatter(B, rng, pinks, 14, 1.4);
      return B.build();
    },
  },
  {
    id: 'maple',
    name: 'Autumn Maple',
    cat: 'nature',
    radius: 0.9,
    solid: true,
    clear: 0.5,
    scale: [0.8, 1.15],
    build(rng) {
      const B = new Builder(rng);
      const h = rng.range(1.1, 1.4);
      trunk(B, rng, h);
      const cols = ['#e8873a', '#f0a640', '#d9612e', '#f2c14e', '#c94f2b'];
      canopy(B, rng, { trunkH: h, colors: cols, blobs: rng.int(4, 6) });
      groundScatter(B, rng, cols, 10, 1.3);
      return B.build();
    },
  },
  {
    id: 'bush',
    name: 'Bush',
    cat: 'nature',
    radius: 0.45,
    solid: false,
    clear: 0.3,
    scale: [0.8, 1.25],
    scatter: 0.9,
    build(rng) {
      const B = new Builder(rng);
      const greens = ['#5a9a3c', '#4e8c36', '#68a845'];
      const n = rng.int(3, 5);
      const pts = [];
      for (let i = 0; i < n; i++) {
        const a = rng() * TAU, d = i === 0 ? 0 : rng.range(0.15, 0.3);
        const r = rng.range(0.25, 0.38);
        const p = [Math.cos(a) * d, r * 0.75, Math.sin(a) * d];
        pts.push({ p, r });
        B.ico(r, 1, rng.pick(greens), { p, sway: [0.35, 0, 0.8] });
      }
      if (rng.chance(0.55)) {
        const berry = rng.pick(['#d8402f', '#5a63c9', '#f2f2f2']);
        for (let i = 0; i < 9; i++) {
          const b = rng.pick(pts);
          const dir = new THREE.Vector3(rng() - 0.5, rng() * 0.8, rng() - 0.5).normalize();
          B.ico(0.045, 0, berry, { p: [b.p[0] + dir.x * b.r, b.p[1] + dir.y * b.r, b.p[2] + dir.z * b.r], sway: [0.35, 0, 0.8] });
        }
      }
      return B.build();
    },
  },
  {
    id: 'flowers',
    name: 'Flowers',
    cat: 'nature',
    radius: 0.35,
    solid: false,
    scale: [0.9, 1.15],
    scatter: 0.55,
    build(rng) {
      const B = new Builder(rng);
      const palette = ['#ff7aa2', '#ffd166', '#fff6e8', '#b48cff', '#ff9f5a', '#7ec8ff', '#ff5d6c'];
      const main = rng.pick(palette);
      const n = rng.int(5, 8);
      for (let i = 0; i < n; i++) {
        const a = rng() * TAU, d = rng.range(0, 0.32);
        const x = Math.cos(a) * d, z = Math.sin(a) * d;
        const h = rng.range(0.16, 0.34);
        const col = rng.chance(0.7) ? main : rng.pick(palette);
        B.cyl(0.012, 0.016, h, 4, '#4f8f35', { p: [x, h / 2, z], sway: [1, 0, 0.4] });
        B.cone(0.035, 0.12, 3, '#5c9e3f', { p: [x + 0.03, 0.05, z], r: [0, rng() * TAU, 0.5], sway: [0.4, 0, 0.4] });
        const style = rng.int(0, 2);
        if (style === 0) {
          // daisy-like: ring of petals + centre
          for (let k = 0; k < 5; k++) {
            const pa = (k / 5) * TAU;
            B.ico(0.032, 0, col, { p: [x + Math.cos(pa) * 0.04, h, z + Math.sin(pa) * 0.04], s: [1.4, 0.45, 0.9], r: [0, -pa, 0], sway: [1, 0, 0.4] });
          }
          B.ico(0.024, 0, '#ffc93c', { p: [x, h + 0.012, z], sway: [1, 0, 0.4] });
        } else if (style === 1) {
          // tulip cup
          B.cyl(0.05, 0.03, 0.08, 5, col, { p: [x, h + 0.03, z], sway: [1, 0, 0.4] });
        } else {
          // round puff
          B.ico(0.05, 0, col, { p: [x, h + 0.02, z], sway: [1, 0, 0.4] });
        }
      }
      return B.build({ ao: false });
    },
  },
  {
    id: 'tallgrass',
    name: 'Tall Grass',
    cat: 'nature',
    radius: 0.3,
    solid: false,
    scale: [0.8, 1.3],
    scatter: 0.5,
    build(rng) {
      const B = new Builder(rng);
      const cols = ['#8fbf4f', '#a6c95a', '#7aae45', '#c2c766'];
      const n = rng.int(9, 14);
      for (let i = 0; i < n; i++) {
        const a = rng() * TAU, d = rng.range(0, 0.18);
        const h = rng.range(0.4, 0.75);
        B.cone(0.03, h, 3, rng.pick(cols), {
          p: [Math.cos(a) * d, h / 2, Math.sin(a) * d],
          r: [0, rng() * TAU, rng.range(-0.3, 0.3)],
          sway: [1.3, 0, 0.8],
        });
      }
      if (rng.chance(0.5)) {
        for (let i = 0; i < 3; i++) {
          const a = rng() * TAU, d = rng.range(0, 0.12);
          B.cyl(0.008, 0.008, 0.8, 3, '#b9b46a', { p: [Math.cos(a) * d, 0.4, Math.sin(a) * d], sway: [1.3, 0, 0.9] });
          B.cyl(0.025, 0.02, 0.12, 4, '#d8c27a', { p: [Math.cos(a) * d, 0.82, Math.sin(a) * d], sway: [1.3, 0, 0.9] });
        }
      }
      return B.build({ ao: false });
    },
  },
  {
    id: 'rock',
    name: 'Boulder',
    cat: 'nature',
    radius: 0.6,
    solid: true,
    clear: 0.35,
    scale: [0.6, 1.4],
    build(rng) {
      const B = new Builder(rng);
      const greys = ['#9a9c9f', '#a8a39a', '#8f8b84'];
      const moss = new THREE.Color('#7f9d4a');
      const mossy = rng.chance(0.6);
      const colorFn = (n, p, base) => (mossy && n.y > 0.72 ? moss : base);
      B.lump(0.5, 0, 0.18, rng.pick(greys), { p: [0, 0.18, 0], s: [1.2, rng.range(0.6, 0.85), 1], r: [0, rng() * TAU, 0], colorFn });
      const extra = rng.int(0, 2);
      for (let i = 0; i < extra; i++) {
        const a = rng() * TAU;
        B.lump(rng.range(0.14, 0.24), 0, 0.2, rng.pick(greys), { p: [Math.cos(a) * 0.65, 0.05, Math.sin(a) * 0.65], s: [1.2, 0.7, 1], colorFn });
      }
      return B.build();
    },
  },
  {
    id: 'mushroom',
    name: 'Mushrooms',
    cat: 'nature',
    radius: 0.25,
    solid: false,
    scale: [0.8, 1.4],
    scatter: 0.6,
    build(rng) {
      const B = new Builder(rng);
      const red = rng.chance(0.65);
      const cap = red ? '#d9443a' : rng.pick(['#b5773f', '#e0b07a']);
      const n = rng.int(1, 3);
      for (let i = 0; i < n; i++) {
        const a = rng() * TAU, d = i === 0 ? 0 : rng.range(0.12, 0.2);
        const x = Math.cos(a) * d, z = Math.sin(a) * d;
        const s = i === 0 ? 1 : rng.range(0.55, 0.8);
        const h = 0.22 * s;
        B.cyl(0.045 * s, 0.06 * s, h, 7, '#f3ead8', { p: [x, h / 2, z] });
        const r = 0.15 * s;
        B.add(new THREE.SphereGeometry(r, 10, 5, 0, TAU, 0, Math.PI / 2), cap, { p: [x, h - 0.01, z], s: [1, 0.8, 1], flat: true });
        if (red) {
          for (let k = 0; k < 5; k++) {
            const da = rng() * TAU, dr = rng.range(0.3, 0.8);
            const dy = Math.sqrt(1 - dr * dr) * 0.8;
            B.ico(0.022 * s, 0, '#fff8ee', { p: [x + Math.cos(da) * dr * r, h - 0.01 + dy * r, z + Math.sin(da) * dr * r] });
          }
        }
      }
      return B.build();
    },
  },
  {
    id: 'lilypad',
    name: 'Lily Pads',
    cat: 'nature',
    place: 'water',
    y: 'water',
    radius: 0.3,
    solid: false,
    scale: [0.8, 1.3],
    scatter: 0.6,
    build(rng) {
      const B = new Builder(rng);
      const n = rng.int(1, 3);
      for (let i = 0; i < n; i++) {
        const a = rng() * TAU, d = i === 0 ? 0 : rng.range(0.32, 0.45);
        const x = Math.cos(a) * d, z = Math.sin(a) * d;
        const r = i === 0 ? 0.28 : rng.range(0.15, 0.22);
        const notch = rng() * TAU;
        B.add(new THREE.CircleGeometry(r, 12, notch + 0.3, TAU - 0.6), rng.pick(['#5f9e48', '#6aa84f', '#558f40']), { p: [x, 0.015, z], r: [-Math.PI / 2, 0, 0], flat: true, jitter: 0.02, double: true });
        if (i === 0 && rng.chance(0.6)) {
          const pc = rng.pick(['#ffc0d6', '#fff4f8', '#ffd6a5']);
          for (let k = 0; k < 7; k++) {
            const pa = (k / 7) * TAU;
            B.cone(0.035, 0.11, 3, pc, { p: [x + Math.cos(pa) * 0.04, 0.07, z + Math.sin(pa) * 0.04], r: [0, -pa, -0.6], s: [1, 1, 0.5] });
          }
          B.ico(0.03, 0, '#ffd23f', { p: [x, 0.08, z] });
        }
      }
      return B.build({ ao: false });
    },
    anim(obj, t, dt, item) {
      obj.rotation.y = item.rot + Math.sin(t * 0.4 + item.seed) * 0.15;
      obj.position.y = item.baseY + Math.sin(t * 1.3 + item.seed) * 0.01;
    },
  },
  {
    id: 'reeds',
    name: 'Reeds',
    cat: 'nature',
    place: 'any',
    radius: 0.3,
    solid: false,
    scale: [0.85, 1.25],
    scatter: 0.55,
    build(rng) {
      const B = new Builder(rng);
      const n = rng.int(6, 10);
      for (let i = 0; i < n; i++) {
        const a = rng() * TAU, d = rng.range(0, 0.22);
        const x = Math.cos(a) * d, z = Math.sin(a) * d;
        const h = rng.range(0.8, 1.3);
        const tilt = rng.range(-0.12, 0.12);
        B.cyl(0.013, 0.02, h, 4, rng.pick(['#6f9a45', '#7da84f', '#5f8a3c']), { p: [x, h / 2, z], r: [0, rng() * TAU, tilt], sway: [1, 0, 1.3] });
        if (rng.chance(0.5)) {
          B.add(new THREE.CapsuleGeometry(0.035, 0.14, 2, 6), '#7a4e2d', { p: [x - Math.sin(tilt) * h * 0.85, h * 0.85, z], sway: [1, 0, 1.3] });
        }
      }
      for (let i = 0; i < 4; i++) {
        const a = rng() * TAU;
        B.cone(0.04, rng.range(0.5, 0.8), 3, '#86ad57', { p: [Math.cos(a) * 0.08, 0.3, Math.sin(a) * 0.08], r: [0, a, rng.range(0.15, 0.4)], s: [1, 1, 0.4], sway: [1, 0, 1] });
      }
      return B.build({ ao: false });
    },
  },
];
