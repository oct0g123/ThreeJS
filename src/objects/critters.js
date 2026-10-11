import * as THREE from 'three';
import { Builder } from './builder.js';

const TAU = Math.PI * 2;
const SKIN = ['#f2d0b1', '#e0ac85', '#c68863', '#8d5a3b', '#5c3a28'];
const HAIR = ['#3b2a20', '#6b4423', '#c99a5b', '#1f1a17', '#a3482e', '#d9d4cc'];
const CLOTHES = ['#e85a4f', '#4f8fd8', '#5aa86a', '#f2a93b', '#b48cff', '#f2f0e6', '#6c7a8f', '#d97aa6'];

function eyes(B, y, z, spread, r = 0.018) {
  for (const s of [-1, 1]) B.ico(r, 0, '#1d1a1a', { p: [s * spread, y, z] });
}

// Critters are regular placed objects with an "agent" that wanders around their home spot.
export const CRITTERS = [
  {
    id: 'duck',
    name: 'Duck',
    cat: 'critters',
    place: 'water',
    y: 'water',
    radius: 0.2,
    solid: false,
    scale: [0.9, 1.1],
    agent: { medium: 'water', speed: 0.45, range: 4.5, idle: [1, 4] },
    build(rng) {
      const B = new Builder(rng);
      const mallard = rng.chance(0.5);
      const body = mallard ? '#8a6f55' : '#fbf7ee';
      B.sphere(0.16, 10, 8, body, { p: [0, 0.07, 0], s: [0.85, 0.65, 1.2] });
      B.cone(0.07, 0.14, 5, body, { p: [0, 0.14, -0.2], r: [-1.0, 0, 0] });
      B.sphere(0.085, 9, 7, mallard ? '#2f7a4c' : body, { p: [0, 0.23, 0.13] });
      if (mallard) B.cyl(0.07, 0.075, 0.02, 8, '#f6f2ea', { p: [0, 0.165, 0.12] });
      B.box(0.07, 0.025, 0.09, '#f2a33a', { p: [0, 0.215, 0.23] });
      eyes(B, 0.25, 0.2, 0.045, 0.014);
      return B.build({ ao: false });
    },
  },
  {
    id: 'sheep',
    name: 'Sheep',
    cat: 'critters',
    radius: 0.3,
    solid: false,
    scale: [0.9, 1.1],
    agent: { medium: 'land', speed: 0.35, range: 4, idle: [2, 6], graze: true },
    build(rng) {
      const B = new Builder(rng);
      const wool = rng.chance(0.15) ? '#5a4e48' : '#f6f2ea';
      for (let i = 0; i < 9; i++) {
        const a = rng() * TAU;
        B.ico(rng.range(0.13, 0.17), 1, wool, {
          p: [Math.cos(a) * 0.12, 0.38 + rng.range(-0.04, 0.06), (i / 8 - 0.5) * 0.36 + Math.sin(a) * 0.05],
          jitter: 0.03,
        });
      }
      for (const [x, z] of [[-0.1, -0.15], [0.1, -0.15], [-0.1, 0.13], [0.1, 0.13]]) {
        B.cyl(0.03, 0.03, 0.26, 5, '#3d3530', { p: [x, 0.13, z] });
      }
      const geo = B.build({ ao: false });
      const H = new Builder(rng);
      H.sphere(0.1, 8, 6, '#3d3530', { s: [0.85, 0.9, 1.15], p: [0, 0, 0.05] });
      H.ico(0.09, 1, wool, { p: [0, 0.07, -0.01], s: [1, 0.6, 1] });
      for (const s of [-1, 1]) H.box(0.1, 0.035, 0.05, '#3d3530', { p: [s * 0.1, 0.02, 0], r: [0, 0, s * 0.4] });
      eyes(H, 0.03, 0.12, 0.045, 0.016);
      return { geo, parts: [{ name: 'head', geo: H.build({ ao: false }), position: [0, 0.45, 0.25] }] };
    },
  },
  {
    id: 'villager',
    name: 'Villager',
    cat: 'critters',
    radius: 0.2,
    solid: false,
    scale: [0.92, 1.08],
    agent: { medium: 'land', speed: 0.6, range: 6, idle: [1, 5], walker: true },
    build(rng) {
      const B = new Builder(rng);
      const skin = rng.pick(SKIN);
      const shirt = rng.pick(CLOTHES);
      const dress = rng.chance(0.4);
      for (const s of [-1, 1]) B.cyl(0.035, 0.035, 0.16, 5, '#4a3b33', { p: [s * 0.055, 0.08, 0] });
      if (dress) B.cyl(0.1, 0.17, 0.3, 8, shirt, { p: [0, 0.27, 0] });
      else {
        B.cyl(0.11, 0.12, 0.18, 8, rng.pick(['#4a5a78', '#6b5a48', '#3f4a3f']), { p: [0, 0.22, 0] });
        B.cyl(0.1, 0.12, 0.17, 8, shirt, { p: [0, 0.37, 0] });
      }
      for (const s of [-1, 1]) B.add(new THREE.CapsuleGeometry(0.032, 0.14, 2, 5), shirt, { p: [s * 0.135, 0.33, 0], r: [0, 0, s * 0.18] });
      for (const s of [-1, 1]) B.ico(0.03, 0, skin, { p: [s * 0.15, 0.24, 0] });
      B.sphere(0.13, 10, 8, skin, { p: [0, 0.57, 0] });
      eyes(B, 0.58, 0.115, 0.045, 0.016);
      B.ico(0.018, 0, '#e8968a', { p: [0.075, 0.545, 0.1], s: [1.2, 0.6, 0.5] });
      B.ico(0.018, 0, '#e8968a', { p: [-0.075, 0.545, 0.1], s: [1.2, 0.6, 0.5] });
      const hair = rng.pick(HAIR);
      if (rng.chance(0.35)) {
        B.cyl(0.24, 0.24, 0.025, 12, '#e3c27a', { p: [0, 0.66, 0], flat: false });
        B.cyl(0.11, 0.13, 0.11, 10, '#e3c27a', { p: [0, 0.72, 0] });
        B.cyl(0.132, 0.132, 0.03, 10, '#c85a4a', { p: [0, 0.69, 0] });
      } else {
        B.add(new THREE.SphereGeometry(0.138, 10, 6, 0, TAU, 0, Math.PI * 0.55), hair, { p: [0, 0.585, -0.012], r: [-0.25, 0, 0], flat: false });
        if (rng.chance(0.4)) B.sphere(0.06, 6, 5, hair, { p: [0, 0.6, -0.14] });
      }
      return B.build({ ao: false });
    },
  },
  {
    id: 'butterfly',
    name: 'Butterflies',
    cat: 'critters',
    radius: 0.2,
    solid: false,
    scale: [0.9, 1.2],
    agent: { medium: 'air', speed: 0.8, range: 3 },
    build(rng) {
      const B = new Builder(rng);
      B.add(new THREE.CapsuleGeometry(0.012, 0.07, 2, 4), '#2b2422', { r: [Math.PI / 2, 0, 0] });
      const geo = B.build({ ao: false });
      const col = rng.pick(['#ffb347', '#8ec5ff', '#ff8fb1', '#fff27a', '#c49bff', '#ffffff']);
      const wing = (side) => {
        const W = new Builder(rng);
        const s = new THREE.Shape();
        s.moveTo(0, 0);
        s.bezierCurveTo(side * 0.06, 0.09, side * 0.13, 0.07, side * 0.12, 0.0);
        s.bezierCurveTo(side * 0.12, -0.05, side * 0.06, -0.08, 0, -0.02);
        W.add(new THREE.ShapeGeometry(s, 4), col, { r: [-Math.PI / 2, 0, 0], flat: true, jitter: 0, double: true });
        return W.build({ ao: false });
      };
      return { geo, parts: [{ name: 'wl', geo: wing(-1), position: [0, 0, 0] }, { name: 'wr', geo: wing(1), position: [0, 0, 0] }] };
    },
  },
];
