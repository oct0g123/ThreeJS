import * as THREE from 'three';
import { WORLD } from '../config.js';
import { mulberry32 } from '../util/random.js';
import { CATALOG } from './catalog.js';
import { Agent } from './agents.js';

const WL = WORLD.waterLevel;
const POP_TIME = 0.42;
const easeOutBack = (x) => {
  const c1 = 1.9, c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
};

export class ObjectManager {
  constructor({ terrain, materials }) {
    this.terrain = terrain;
    this.materials = materials;
    this.group = new THREE.Group();
    this.group.name = 'objects';
    this.items = new Map();
    this.dying = [];
    this.nextId = 1;
    this.listeners = new Set();
    this.time = 0;

    terrain.clearProvider = (t) => {
      for (const it of this.items.values()) {
        if (it.def.clear) t.stampClear(it.x, it.z, it.def.clear * it.scale);
      }
    };
    terrain.onChange(() => this._reground());
  }

  // Builds the Object3D for a spec. Used for real objects, the ghost preview and thumbnails.
  static createObject(def, spec, material) {
    const res = def.build(mulberry32(spec.seed));
    const { geo, parts = [] } = res.isBufferGeometry ? { geo: res } : res;
    const root = new THREE.Group();
    root.userData.parts = {};
    root.userData.chimney = geo.userData.chimney || null;
    const mesh = new THREE.Mesh(geo, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    root.add(mesh);
    for (const p of parts) {
      const m = new THREE.Mesh(p.geo, material);
      m.position.fromArray(p.position);
      m.castShadow = true;
      m.receiveShadow = true;
      root.add(m);
      root.userData.parts[p.name] = m;
    }
    root.rotation.y = spec.rot || 0;
    return root;
  }

  static dispose(obj) {
    obj.traverse((o) => o.geometry?.dispose());
  }

  setMaterial(item, mat) {
    item.obj.traverse((o) => {
      if (o.isMesh) o.material = mat;
    });
  }

  groundY(def, x, z, scale = 1) {
    const t = this.terrain;
    if (def.y === 'water') return WL;
    if (def.y === 'surface') return t.surfaceAt(x, z);
    if (def.solid && def.radius > 0.6) {
      const r = def.radius * scale * 0.55;
      let m = t.heightAt(x, z);
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2;
        m = Math.min(m, t.heightAt(x + Math.cos(a) * r, z + Math.sin(a) * r));
      }
      return m;
    }
    return t.heightAt(x, z);
  }

  canPlace(def, x, z, scale = 1, ignoreId = null) {
    const t = this.terrain;
    const r = def.radius * scale;
    if (!t.isInside(x, z, Math.min(r * 0.6, 1))) return false;
    const h = t.heightAt(x, z);
    if (def.place === 'land' && h < WL + 0.04) return false;
    if (def.place === 'water' && h > WL - 0.1) return false;
    if (def.place === 'land' && def.solid && def.radius > 0.6 && t.slopeAt(x, z) > 1.3) return false;
    if (def.solid) {
      for (const it of this.items.values()) {
        if (it.id === ignoreId || !it.def.solid) continue;
        const rr = (it.def.radius * it.scale + r) * 0.72;
        const dx = it.x - x, dz = it.z - z;
        if (dx * dx + dz * dz < rr * rr) return false;
      }
    }
    return true;
  }

  // Is (x,z) inside a solid object? Used by walking critters.
  blocked(x, z, pad = 0, ignoreId = null) {
    for (const it of this.items.values()) {
      if (it.id === ignoreId || !it.def.solid) continue;
      const rr = it.def.radius * it.scale * 0.8 + pad;
      const dx = it.x - x, dz = it.z - z;
      if (dx * dx + dz * dz < rr * rr) return true;
    }
    return false;
  }

  add(spec, { animate = true, id = null, delay = 0 } = {}) {
    const def = CATALOG.get(spec.type);
    if (!def) return null;
    const item = {
      id: id ?? this.nextId++,
      type: spec.type,
      x: spec.x,
      z: spec.z,
      rot: spec.rot || 0,
      scale: spec.scale || 1,
      seed: spec.seed >>> 0,
      def,
      spawn: animate ? -delay / POP_TIME : 1,
    };
    this.nextId = Math.max(this.nextId, item.id + 1);
    item.obj = ObjectManager.createObject(def, item, this.materials.solid);
    item.obj.userData.itemId = item.id;
    item.baseY = this.groundY(def, item.x, item.z, item.scale);
    item.obj.position.set(item.x, item.baseY, item.z);
    item.obj.scale.setScalar(item.scale * (animate ? 0.001 : 1));
    if (def.agent) item.agent = new Agent(item, def.agent, this);
    this.group.add(item.obj);
    this.items.set(item.id, item);
    if (def.clear) this.terrain.markDirty();
    this._emit();
    return item;
  }

  remove(id, { animate = true } = {}) {
    const item = this.items.get(id);
    if (!item) return;
    this.items.delete(id);
    if (item.def.clear) this.terrain.markDirty();
    if (animate) {
      item.dieT = 0;
      this.dying.push(item);
    } else {
      this.group.remove(item.obj);
      ObjectManager.dispose(item.obj);
    }
    this._emit();
  }

  clearAll() {
    for (const id of [...this.items.keys()]) this.remove(id, { animate: false });
  }

  // Current position (critters wander away from their home spot).
  posOf(item) {
    return item.agent ? [item.agent.x, item.agent.z] : [item.x, item.z];
  }

  inRadius(x, z, r) {
    const out = [];
    for (const it of this.items.values()) {
      const [ix, iz] = this.posOf(it);
      const rr = r + it.def.radius * it.scale * 0.4;
      if ((ix - x) ** 2 + (iz - z) ** 2 < rr * rr) out.push(it);
    }
    return out;
  }

  _raycaster = new THREE.Raycaster();
  pick(ray) {
    this._raycaster.ray.copy(ray);
    const hits = this._raycaster.intersectObjects(this.group.children, true);
    for (const h of hits) {
      let o = h.object;
      while (o && o.userData.itemId == null) o = o.parent;
      if (o && this.items.has(o.userData.itemId)) return { item: this.items.get(o.userData.itemId), distance: h.distance };
    }
    return null;
  }

  lightEmitters() {
    const out = [];
    for (const it of this.items.values()) {
      const L = it.def.light;
      if (!L) continue;
      const s = it.scale;
      const lz = (L.z || 0) * s;
      out.push({
        x: it.x + Math.sin(it.rot) * lz,
        y: it.baseY + L.y * s,
        z: it.z + Math.cos(it.rot) * lz,
        intensity: L.intensity,
      });
    }
    return out;
  }

  chimneys() {
    const out = [];
    for (const it of this.items.values()) {
      const c = it.obj.userData.chimney;
      if (!c || it.spawn < 1) continue;
      const s = it.scale, cs = Math.cos(it.rot), sn = Math.sin(it.rot);
      out.push([it.x + (c[0] * cs + c[2] * sn) * s, it.baseY + c[1] * s, it.z + (-c[0] * sn + c[2] * cs) * s, it.seed]);
    }
    return out;
  }

  _reground() {
    for (const it of this.items.values()) {
      it.baseY = this.groundY(it.def, it.x, it.z, it.scale);
      if (!it.agent) it.obj.position.y = it.baseY;
    }
  }

  update(dt, t) {
    this.time = t;
    for (let i = this.dying.length - 1; i >= 0; i--) {
      const it = this.dying[i];
      it.dieT += dt / 0.22;
      const k = Math.max(0, 1 - it.dieT);
      it.obj.scale.set(it.scale * k * (1 + (1 - k) * 0.3), it.scale * k * k, it.scale * k * (1 + (1 - k) * 0.3));
      if (it.dieT >= 1) {
        this.group.remove(it.obj);
        ObjectManager.dispose(it.obj);
        this.dying.splice(i, 1);
      }
    }
    for (const it of this.items.values()) {
      if (it.spawn < 1) {
        const was = it.spawn;
        it.spawn = Math.min(1, it.spawn + dt / POP_TIME);
        if (was <= 0 && it.spawn > 0 && this.onPop) this.onPop(it);
        const k = Math.max(0, it.spawn);
        const e = Math.max(0.001, easeOutBack(k));
        const squash = 1 + Math.sin(k * Math.PI) * 0.12;
        it.obj.scale.set(it.scale * e * squash, it.scale * e / squash, it.scale * e * squash);
      }
      if (it.agent) it.agent.update(dt, t, it.obj);
      if (it.def.anim) it.def.anim(it.obj, t, dt, it);
    }
  }

  serialize() {
    return [...this.items.values()].map((it) => ({
      id: it.id,
      type: it.type,
      x: +it.x.toFixed(3),
      z: +it.z.toFixed(3),
      rot: +it.rot.toFixed(3),
      scale: +it.scale.toFixed(3),
      seed: it.seed,
    }));
  }

  // Bring the scene in line with a serialized list, touching only what changed (used by undo).
  applyList(list, { animate = false } = {}) {
    const want = new Map(list.map((s) => [s.id, s]));
    for (const [id, it] of [...this.items]) {
      const s = want.get(id);
      if (!s || s.type !== it.type || s.seed !== it.seed || s.x !== +it.x.toFixed(3) || s.z !== +it.z.toFixed(3) || s.rot !== +it.rot.toFixed(3)) {
        this.remove(id, { animate });
      }
    }
    for (const s of list) if (!this.items.has(s.id)) this.add(s, { animate, id: s.id });
  }

  onChange(fn) {
    this.listeners.add(fn);
  }

  _emit() {
    for (const fn of this.listeners) fn(this);
  }
}
