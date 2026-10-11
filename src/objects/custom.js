import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { addToCatalog } from './catalog.js';

// ---------------------------------------------------------------------------
// Models made in Blender (or anything that exports glTF).
//
// Drop a .glb file into the top-level models/ folder and it appears in the game
// (in the Village tab, with sensible defaults). To fine-tune it, add an entry to
// MODEL_OPTIONS keyed by the file name. Any option a built-in item uses works
// (name, cat, radius, solid, clear, flatten, scatter, line, rotStep, place, y, light...).
//
// Conventions the importer understands (see README for the full Blender guide):
//   - 1 Blender unit = 1 metre. Origin/base at the bottom centre, front facing -Y.
//   - Plain material colours (Principled BSDF "Base Color") and vertex colours.
//   - Materials with Emission, or a name containing "glow", light up at night.
//   - Materials named like "leaves" / "foliage" / "grass" / "sway" move in the wind.
// ---------------------------------------------------------------------------
export const MODEL_OPTIONS = {
  'mushroom_house.glb': {
    name: 'Mushroom House',
    cat: 'village',
    radius: 1.15,
    solid: true,
    clear: 1.2,
    flatten: 1.1,
    rotStep: Math.PI / 4,
    light: { y: 0.9, z: 1.1, intensity: 0.9 },
  },
};

// Vite finds every .glb in models/ at build time (and inlines them in the single-file build).
const FILES = import.meta.glob('../../models/*.glb', { query: '?url', import: 'default', eager: true });

const SWAY_RE = /leaf|leaves|foliage|grass|sway/i;
const GLOW_RE = /glow|light|lamp|emiss/i;

function toGameGeometry(root) {
  root.updateMatrixWorld(true);
  const parts = [];
  const c = new THREE.Color();
  root.traverse((o) => {
    if (!o.isMesh) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    let g = o.geometry.clone();
    g.applyMatrix4(o.matrixWorld);
    if (!g.attributes.normal) g.computeVertexNormals();
    const groups = g.groups.length ? g.groups : [{ start: 0, count: g.index ? g.index.count : g.attributes.position.count, materialIndex: 0 }];
    if (g.index) g = g.toNonIndexed();
    const n = g.attributes.position.count;
    const vc = g.attributes.color;
    const col = new Float32Array(n * 3);
    const sway = new Float32Array(n);
    const glow = new Float32Array(n);
    for (const grp of groups) {
      const m = mats[grp.materialIndex ?? 0] || mats[0];
      c.copy(m.color || new THREE.Color(1, 1, 1));
      if (m.map) console.info(`[custom models] "${m.name}" uses a texture; only its base colour is used.`);
      const e = m.emissive;
      const isGlow = GLOW_RE.test(m.name || '') || (e && (m.emissiveIntensity ?? 1) * Math.max(e.r, e.g, e.b) > 0.05);
      if (isGlow && e && Math.max(e.r, e.g, e.b) > 0.05) c.copy(e).lerp(new THREE.Color(1, 1, 1), 0.3);
      const isSway = SWAY_RE.test(m.name || '');
      const end = Math.min(n, grp.start + grp.count);
      for (let v = grp.start; v < end; v++) {
        let r = c.r, gg = c.g, b = c.b;
        if (vc) {
          r *= vc.getX(v);
          gg *= vc.getY(v);
          b *= vc.getZ(v);
        }
        col[v * 3] = r;
        col[v * 3 + 1] = gg;
        col[v * 3 + 2] = b;
        glow[v] = isGlow ? 1 : 0;
        sway[v] = isSway ? 1 : 0;
      }
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', g.attributes.position);
    out.setAttribute('normal', g.attributes.normal);
    out.setAttribute('color', new THREE.BufferAttribute(col, 3));
    out.setAttribute('aSway', new THREE.BufferAttribute(sway, 1));
    out.setAttribute('aGlow', new THREE.BufferAttribute(glow, 1));
    parts.push(out);
  });
  if (!parts.length) throw new Error('model contains no meshes');
  const geo = mergeGeometries(parts, false);
  geo.computeBoundingBox();
  const bb = geo.boundingBox;
  geo.translate(-(bb.min.x + bb.max.x) / 2, -bb.min.y, -(bb.min.z + bb.max.z) / 2);
  // Swaying parts move more the higher up they are.
  const pos = geo.attributes.position, sw = geo.attributes.aSway;
  const height = Math.max(0.01, bb.max.y - bb.min.y);
  for (let i = 0; i < pos.count; i++) sw.setX(i, sw.getX(i) * Math.min(1, pos.getY(i) / height) * 1.2);
  geo.computeBoundingSphere();
  return geo;
}

const titleCase = (s) => s.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

export async function loadCustomModels() {
  const loader = new GLTFLoader();
  await Promise.all(
    Object.entries(FILES).map(async ([path, url]) => {
      const file = path.split('/').pop();
      const stem = file.replace(/\.glb$/i, '');
      try {
        const gltf = await loader.loadAsync(url);
        const geo = toGameGeometry(gltf.scene);
        const bb = geo.boundingBox;
        const size = Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z);
        addToCatalog({
          id: stem.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
          name: titleCase(stem),
          cat: 'village',
          radius: Math.max(0.2, size * 0.45),
          solid: size > 0.8,
          clear: size > 0.8 ? size * 0.5 : 0,
          ...MODEL_OPTIONS[file],
          build: () => geo.clone(),
        });
      } catch (e) {
        console.warn(`[custom models] couldn't load ${file}`, e);
      }
    }),
  );
}
