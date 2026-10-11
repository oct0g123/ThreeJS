import { WORLD, HALF, CELL, GRID_N, PAINT } from '../config.js';
import { createNoise2D, fbm, smoothstep, lerp } from '../util/noise.js';
import { mulberry32 } from '../util/random.js';
import { CATALOG } from '../objects/catalog.js';

const N = GRID_N;
const WL = WORLD.waterLevel;

const riverX = (z) => -2 + 3.6 * Math.sin(z * 0.15 + 0.4) + 1.5 * Math.sin(z * 0.37 + 2.0);

function riverPoints() {
  const pts = [];
  for (let z = -HALF - 4; z <= HALF + 4; z += 0.2) pts.push([riverX(z), z]);
  return pts;
}

function distToPoints(x, z, pts) {
  let best = Infinity;
  for (const [px, pz] of pts) {
    if (Math.abs(pz - z) > 5) continue;
    const d = (px - x) ** 2 + (pz - z) ** 2;
    if (d < best) best = d;
  }
  return Math.sqrt(best);
}

function forEachVertex(fn) {
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) fn(j * N + i, -HALF + i * CELL, -HALF + j * CELL);
}

function paintLine(terrain, pts, layer, r = 0.85) {
  for (let s = 0; s < pts.length - 1; s++) {
    const [x0, z0] = pts[s], [x1, z1] = pts[s + 1];
    const len = Math.hypot(x1 - x0, z1 - z0);
    for (let d = 0; d <= len; d += 0.3) {
      const t = d / len;
      terrain.paintLayer(lerp(x0, x1, t), lerp(z0, z1, t), r, layer, 0.9);
    }
  }
}

export function resetTerrain(terrain) {
  terrain.heights.fill(0.5);
  terrain.paint.fill(0);
  terrain.flowers.fill(0);
}

// A gentle meadow with a little pond: a blank canvas.
export function generateMeadow(terrain, objects, seed = 3) {
  objects.clearAll();
  resetTerrain(terrain);
  const n = createNoise2D(seed);
  forEachVertex((k, x, z) => {
    let h = 0.55 + fbm(n, x * 0.05, z * 0.05, 3) * 0.35;
    const d = Math.hypot(x - 6, z - 5);
    h = lerp(WL - 0.7, h, smoothstep(1.8, 4.2, d + n(x * 0.3, z * 0.3) * 0.6));
    terrain.heights[k] = h;
  });
  terrain.markDirty();
}

// The cosy starting island: a river, a pond, a hill with a windmill and a tiny village.
export function generateStarter(terrain, objects, seed = 11) {
  objects.clearAll();
  resetTerrain(terrain);
  const n = createNoise2D(seed);
  const rng = mulberry32(seed);
  const river = riverPoints();

  forEachVertex((k, x, z) => {
    let h = 0.6 + fbm(n, x * 0.045, z * 0.045, 4) * 0.55 + fbm(n, x * 0.16 + 50, z * 0.16, 2) * 0.08;
    const dm = Math.hypot(x + 14.5, z + 13.5);
    h += 4.0 * Math.exp(-(dm * dm) / (2 * 4.4 * 4.4)) * (0.85 + 0.3 * fbm(n, x * 0.2, z * 0.2, 2));
    const dh = Math.hypot(x - 12.5, z + 10.5);
    h += 1.4 * Math.exp(-(dh * dh) / (2 * 3.6 * 3.6));
    const dv = Math.hypot(x - 5, z - 1);
    h = lerp(h, 0.7 + (h - 0.7) * 0.25, smoothstep(10, 4, dv));
    const dr = distToPoints(x, z, river) + n(x * 0.25, z * 0.25) * 0.25;
    h = lerp(WL - 0.65, Math.max(h, WL + 0.3), smoothstep(0.9, 2.7, dr));
    const pr = 3.1 + n(x * 0.3 + 9, z * 0.3) * 0.6;
    const dp = Math.hypot(x - 10, z - 9);
    h = lerp(WL - 0.85, h, smoothstep(pr - 1.8, pr + 0.9, dp));
    terrain.heights[k] = h;
  });
  terrain.markDirty();

  // Paths and a little cobbled square around the well
  const bridgeZ = 4.2;
  const bx = riverX(bridgeZ);
  paintLine(terrain, [[-11.5, 8.5], [-8, 6.3], [bx - 2.2, bridgeZ]], PAINT.path);
  paintLine(terrain, [[bx + 2.2, bridgeZ], [2.5, 3.3], [5.5, 1.6], [7.5, -1.2], [9, -4], [11.5, -8.5], [12.4, -9.4]], PAINT.path);
  paintLine(terrain, [[5.5, 1.6], [7, 4.5], [7.2, 6.4]], PAINT.path, 0.7);
  terrain.paintLayer(6.6, 0.3, 1.5, PAINT.stone, 1);
  terrain.paintLayer(1.5, -5.4, 1.8, PAINT.soil, 1);
  terrain.paintLayer(-0.6, -5.6, 1.4, PAINT.soil, 1);
  for (const [x, z, r] of [[-8, 13, 3.5], [14, 3, 3], [-15, 1, 3], [2, 12, 3], [15, 15, 2.5]]) terrain.paintFlowers(x, z, r, 0.9);
  terrain.refresh();

  const pathAt = (x, z) => {
    const i = Math.round((x + HALF) / CELL), j = Math.round((z + HALF) / CELL);
    if (i < 0 || j < 0 || i >= N || j >= N) return 0;
    const k = (j * N + i) * 4;
    return terrain.paint[k] + terrain.paint[k + 3];
  };

  const placed = [];
  const put = (type, x, z, o = {}) => {
    const def = CATALOG.get(type);
    const scale = o.scale ?? def.scale[0] + rng() * (def.scale[1] - def.scale[0]);
    if (!o.force && !objects.canPlace(def, x, z, scale)) return null;
    if (!o.force && !o.onPath && def.place !== 'water' && pathAt(x, z) > 0.25) return null;
    if (!o.force && !def.solid && objects.blocked(x, z, 0.2)) return null;
    const rot = o.rot ?? (def.randomRot ? rng() * Math.PI * 2 : 0);
    const spec = { type, x, z, rot, scale, seed: (rng() * 0xffffffff) >>> 0 };
    const delay = 0.25 + Math.hypot(x - 4, z - 2) * 0.045 + rng() * 0.25;
    const it = objects.add(spec, { animate: true, delay });
    if (it) placed.push(it);
    return it;
  };
  const scatter = (type, count, region, o = {}) => {
    let made = 0;
    for (let tries = 0; tries < count * 12 && made < count; tries++) {
      const [x, z] = region();
      if (put(type, x, z, o)) made++;
    }
  };
  const around = (cx, cz, r0, r1) => () => {
    const a = rng() * Math.PI * 2, d = r0 + rng() * (r1 - r0);
    return [cx + Math.cos(a) * d, cz + Math.sin(a) * d];
  };
  const anywhere = () => [(rng() - 0.5) * (WORLD.size - 3), (rng() - 0.5) * (WORLD.size - 3)];

  // Village (flatten the ground under buildings first)
  const building = (type, x, z, rot) => {
    const def = CATALOG.get(type);
    terrain.plateau(x, z, def.flatten, def.flatten + 1.6, terrain.heightAt(x, z));
    terrain.refresh();
    return put(type, x, z, { rot, scale: 1, force: true });
  };
  building('cottage', 3.6, 0.2, 0.15);
  building('cottage', 9.2, -2.4, -0.45);
  building('cottage', -11.5, 6.2, 0.5);
  building('windmill', 12.6, -11.2, -0.5);
  building('well', 6.6, 0.3, 0.3);
  building('stall', 5.8, 4.4, -1.2);
  put('garden', 1.5, -5.4, { rot: 0.1, scale: 1, force: true });
  put('garden', -0.7, -5.6, { rot: 0.1, scale: 1, force: true });
  for (let i = 0; i < 4; i++) put('fence', -2.2 + i * 1.02, -7.0, { rot: 0.1, scale: 1, force: true });

  // Bridge across the river, aligned perpendicular to the flow
  const dz = 0.5, tx = riverX(bridgeZ + dz) - riverX(bridgeZ - dz);
  put('bridge', bx, bridgeZ, { rot: Math.atan2(tx, 2 * dz), scale: 1, force: true });

  for (const [x, z] of [[bx + 2.6, bridgeZ - 0.9], [bx - 2.6, bridgeZ + 0.9], [5.3, -1.4], [8.4, 0.6], [10.8, -6.5], [-9.4, 7.8]]) put('lantern', x, z, { scale: 1, rot: 0, onPath: true });
  put('bench', 7.6, 5.8, { rot: 2.3, scale: 1 });
  put('boat', 10.6, 9.6, { rot: 0.8, scale: 1 });

  // Trees
  scatter('pine', 18, around(-14, -13, 2.5, 8));
  scatter('pine', 5, around(-17, -4, 0, 3));
  scatter('oak', 10, anywhere);
  scatter('apple', 3, around(3.5, -1, 2.5, 4.5));
  scatter('cherry', 4, around(10, 9, 4.2, 6));
  scatter('maple', 3, around(14, -7, 2, 5));
  scatter('oak', 4, around(-12, 12, 1, 6));
  scatter('cherry', 2, around(-13, 5, 2, 4));

  // Undergrowth
  scatter('bush', 16, anywhere);
  scatter('flowers', 10, around(4.5, 1, 1.8, 4));
  scatter('flowers', 8, around(-11.5, 6.2, 1.8, 3.6));
  scatter('flowers', 6, around(9.2, -2.4, 1.8, 3.5));
  scatter('flowers', 12, anywhere);
  scatter('tallgrass', 14, anywhere);
  scatter('rock', 8, around(-14, -13, 2, 8));
  scatter('rock', 4, anywhere);
  scatter('mushroom', 8, around(-13, -12, 3, 8));
  scatter('mushroom', 3, anywhere);
  scatter('reeds', 12, () => {
    const z = (rng() - 0.5) * 36;
    return [riverX(z) + (rng() < 0.5 ? -1 : 1) * (1.4 + rng() * 0.8), z];
  });
  scatter('reeds', 5, around(10, 9, 2.4, 3.4));
  scatter('lilypad', 7, around(10, 9, 0, 2.2));
  scatter('lilypad', 4, () => {
    const z = (rng() - 0.5) * 34;
    return [riverX(z) + (rng() - 0.5) * 0.8, z];
  });

  // Critters
  scatter('duck', 3, around(10, 9, 0, 1.6));
  scatter('duck', 2, () => {
    const z = -8 + rng() * 6;
    return [riverX(z), z];
  });
  scatter('sheep', 4, around(-9, 13, 0, 3));
  scatter('villager', 2, around(6, 1, 1.5, 3));
  scatter('villager', 1, around(-10, 7.5, 1, 2));
  scatter('butterfly', 3, anywhere);

  terrain.markDirty();
  return placed.length;
}
