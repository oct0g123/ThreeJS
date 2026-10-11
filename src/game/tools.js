import * as THREE from 'three';
import { WORLD, PAINT } from '../config.js';
import { CATALOG } from '../objects/catalog.js';
import { ObjectManager } from '../objects/manager.js';
import { randomSeed } from '../util/random.js';

export const LAND_TOOLS = [
  { id: 'raise', name: 'Raise', icon: 'raise', hint: 'Hold to lift the land. Shift lowers.' },
  { id: 'lower', name: 'Lower', icon: 'lower', hint: 'Hold to dig the land down. Shift raises.' },
  { id: 'flatten', name: 'Flatten', icon: 'flatten', hint: 'Levels the land to where you first clicked.' },
  { id: 'smooth', name: 'Smooth', icon: 'smooth', hint: 'Softens bumps and cliffs.' },
  { id: 'water', name: 'River', icon: 'water', hint: 'Drag to carve rivers, streams and ponds.' },
  { id: 'fill', name: 'Fill', icon: 'fill', hint: 'Fills water back in with dry land.' },
  { id: 'paint-grass', name: 'Grass', swatch: 'grass', layer: -1, hint: 'Paints lush grass back over anything.' },
  { id: 'paint-path', name: 'Path', swatch: 'path', layer: PAINT.path, hint: 'Paint winding dirt paths.' },
  { id: 'paint-stone', name: 'Cobbles', swatch: 'stone', layer: PAINT.stone, hint: 'Paint a cobbled square.' },
  { id: 'paint-sand', name: 'Sand', swatch: 'sand', layer: PAINT.sand, hint: 'Paint sandy beaches.' },
  { id: 'paint-soil', name: 'Soil', swatch: 'soil', layer: PAINT.soil, hint: 'Paint tilled farm soil.' },
  { id: 'wildflowers', name: 'Meadow', swatch: 'flowers', hint: 'Sprinkle wildflowers into the grass. Shift removes.' },
];

export const UTILITY_TOOLS = [
  { id: 'look', name: 'Look', icon: 'look', hint: 'Drag to spin the camera. Scroll or pinch to zoom.' },
  { id: 'move', name: 'Move', icon: 'move', hint: 'Click something to pick it up, click again to drop it. R rotates.' },
  { id: 'remove', name: 'Remove', icon: 'remove', hint: 'Click or drag over things to tidy them away.' },
];

const BRUSH_COLORS = {
  raise: '#ffe2a8', lower: '#b8d6ff', flatten: '#ffffff', smooth: '#e8ffd8', water: '#8fe3ff', fill: '#f0d6a0',
  'paint-grass': '#b6f08a', 'paint-path': '#f3d9a8', 'paint-stone': '#e6e2da', 'paint-sand': '#fff0c8', 'paint-soil': '#c9a07c', wildflowers: '#ffc2dc',
  remove: '#ff8a7a',
};

const SEG = 72;

export class ToolController {
  constructor(ctx) {
    Object.assign(this, ctx); // camera, canvas, terrain, objects, materials, history, sound, controls, scene
    this.tool = 'look';
    this.placeType = null;
    this.brush = 2.2;
    this.pointer = new THREE.Vector2();
    this.hasPointer = false;
    this.down = false;
    this.shift = false;
    this.hit = null;
    this.raycaster = new THREE.Raycaster();
    this.highlighted = new Map();
    this.listeners = new Set();
    this.userRot = 0;
    this.carry = null;
    this.touches = new Set();
    this._makeCursor();
    this._bind();
    this.select({ tool: 'look' });
  }

  // ------------------------------------------------------------------ selection

  select({ tool = null, place = null }) {
    this._cancelCarry();
    this.tool = place ? 'place' : tool;
    this.placeType = place;
    this._clearGhost();
    if (place) this._newSpec();
    const look = this.tool === 'look';
    this.controls.mouseButtons.LEFT = look ? THREE.MOUSE.ROTATE : null;
    this.controls.touches.ONE = look ? THREE.TOUCH.ROTATE : null;
    this.canvas.style.cursor = look ? 'grab' : 'crosshair';
    this._emit();
  }

  get def() {
    return this.placeType ? CATALOG.get(this.placeType) : null;
  }

  get toolInfo() {
    if (this.tool === 'place') return { id: 'place', name: this.def.name };
    return [...LAND_TOOLS, ...UTILITY_TOOLS].find((t) => t.id === this.tool);
  }

  isBrushTool() {
    return LAND_TOOLS.some((t) => t.id === this.tool);
  }

  _newSpec() {
    const def = this.def;
    const [a, b] = def.scale;
    this.spec = {
      type: def.id,
      seed: randomSeed(),
      scale: a + Math.random() * (b - a),
      rot: def.randomRot ? Math.random() * Math.PI * 2 : this.userRot,
    };
    this._clearGhost();
    this.ghost = ObjectManager.createObject(def, this.spec, this.materials.ghost);
    this.ghost.traverse((o) => (o.castShadow = false));
    this.ghost.visible = false;
    this.scene.add(this.ghost);
  }

  _clearGhost() {
    if (!this.ghost) return;
    this.scene.remove(this.ghost);
    ObjectManager.dispose(this.ghost);
    this.ghost = null;
  }

  rotate(dir = 1) {
    if (this.tool !== 'place') return;
    const step = this.def.rotStep || Math.PI / 4;
    this.spec.rot += step * dir;
    if (!this.def.randomRot) this.userRot = this.spec.rot;
    if (this.ghost) this.ghost.rotation.y = this.spec.rot;
    this.sound.click();
  }

  setBrush(r) {
    this.brush = THREE.MathUtils.clamp(r, 0.5, 6);
    this._emit();
  }

  onChange(fn) {
    this.listeners.add(fn);
  }

  _emit() {
    for (const fn of this.listeners) fn(this);
  }

  // ------------------------------------------------------------------ input

  _bind() {
    const c = this.canvas;
    c.addEventListener('pointermove', (e) => {
      this._setPointer(e);
      if (this.down) this._strokeMove();
    });
    c.addEventListener('pointerdown', (e) => {
      this.sound.unlock();
      if (e.pointerType === 'touch') {
        this.touches.add(e.pointerId);
        if (this.touches.size > 1) {
          this._endStroke();
          return;
        }
      }
      if (e.button !== 0 || this.tool === 'look') return;
      this._setPointer(e);
      this._updateHit();
      this.down = true;
      this.shift = e.shiftKey;
      this._strokeStart();
    });
    const up = (e) => {
      this.touches.delete(e.pointerId);
      if (this.down) this._endStroke();
    };
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
    c.addEventListener('pointerleave', () => {
      this.hasPointer = false;
      if (this.down) this._endStroke();
    });
    window.addEventListener('keydown', (e) => (this.shift = e.shiftKey));
    window.addEventListener('keyup', (e) => (this.shift = e.shiftKey));
  }

  _setPointer(e) {
    const r = this.canvas.getBoundingClientRect();
    this.pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.hasPointer = true;
  }

  _updateHit() {
    if (!this.hasPointer) {
      this.hit = null;
      return;
    }
    this.raycaster.setFromCamera(this.pointer, this.camera);
    this.hit = this.terrain.raycast(this.raycaster.ray);
  }

  // ------------------------------------------------------------------ strokes

  _strokeStart() {
    const hit = this.hit;
    this.stroke = { placed: 0, last: null, anchor: null, pushed: false };
    if (this.isBrushTool()) {
      if (!hit) return;
      this._push();
      this.stroke.flatTarget = this.terrain.heightAt(hit.point.x, hit.point.z);
    } else if (this.tool === 'place') {
      if (!hit) return;
      if (this.def.line) this.stroke.anchor = hit.point.clone();
      else this._placeAt(hit.point.x, hit.point.z);
    } else if (this.tool === 'remove') {
      this._removeUnderCursor();
    } else if (this.tool === 'move') {
      const target = this._hoverItem();
      if (target) this._pickUp(target);
    }
  }

  _strokeMove() {
    const hit = this.hit;
    if (!hit || !this.stroke) return;
    if (this.tool === 'place') {
      const def = this.def;
      if (def.line && this.stroke.anchor) {
        const a = this.stroke.anchor;
        const dx = hit.point.x - a.x, dz = hit.point.z - a.z;
        const d = Math.hypot(dx, dz);
        if (d >= def.line) {
          const ux = dx / d, uz = dz / d;
          this.spec.rot = Math.atan2(-uz, ux);
          this.userRot = this.spec.rot;
          this._placeAt(a.x + ux * def.line * 0.5, a.z + uz * def.line * 0.5);
          a.x += ux * def.line;
          a.z += uz * def.line;
        }
      } else if (def.scatter && this.stroke.last) {
        const [lx, lz] = this.stroke.last;
        if (Math.hypot(hit.point.x - lx, hit.point.z - lz) >= def.scatter * this.spec.scale) {
          this._placeAt(hit.point.x + (Math.random() - 0.5) * 0.2, hit.point.z + (Math.random() - 0.5) * 0.2);
        }
      }
    } else if (this.tool === 'remove') {
      this._removeUnderCursor();
    }
  }

  _endStroke() {
    if (this.tool === 'place' && this.def?.line && this.stroke && this.stroke.placed === 0 && this.hit) {
      this._placeAt(this.hit.point.x, this.hit.point.z);
    }
    this.down = false;
    this.stroke = null;
  }

  _push() {
    if (this.stroke && !this.stroke.pushed) {
      this.history.push();
      this.stroke.pushed = true;
    }
  }

  _placeAt(x, z, { force = false } = {}) {
    if (!this.def) return false;
    const def = this.def;
    if (!force && !this.objects.canPlace(def, x, z, this.spec.scale)) return false;
    if (!this.carry) this._push();
    if (def.flatten) {
      const t = this.terrain;
      t.plateau(x, z, def.flatten * this.spec.scale, (def.flatten + 1.4) * this.spec.scale, t.heightAt(x, z));
      t.refresh();
    }
    const item = this.objects.add({ ...this.spec, x, z });
    this.sound.pop(def.cat === 'critters' ? 1.3 : def.radius > 0.8 ? 0.75 : 1);
    if (this.stroke) {
      this.stroke.placed++;
      this.stroke.last = [x, z];
    }
    if (this.carry) {
      this.carry = null;
      this.select({ tool: 'move' });
      return item;
    }
    this._newSpec();
    return item;
  }

  _removeUnderCursor() {
    const targets = this._removeTargets();
    if (!targets.length) return;
    this._push();
    for (const it of targets) this.objects.remove(it.id);
    this.sound.poof();
  }

  _removeTargets() {
    const out = new Set();
    if (this.hit) for (const it of this.objects.inRadius(this.hit.point.x, this.hit.point.z, this.brush * 0.45)) out.add(it);
    if (this.hasPointer) {
      this.raycaster.setFromCamera(this.pointer, this.camera);
      const p = this.objects.pick(this.raycaster.ray);
      if (p) out.add(p.item);
    }
    return [...out];
  }

  _hoverItem() {
    if (!this.hasPointer) return null;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const p = this.objects.pick(this.raycaster.ray);
    if (p) return p.item;
    if (!this.hit) return null;
    let best = null, bd = 0.9;
    for (const it of this.objects.inRadius(this.hit.point.x, this.hit.point.z, 0.9)) {
      const [x, z] = this.objects.posOf(it);
      const d = Math.hypot(x - this.hit.point.x, z - this.hit.point.z);
      if (d < bd) {
        bd = d;
        best = it;
      }
    }
    return best;
  }

  _pickUp(item) {
    this.history.push();
    const [x, z] = this.objects.posOf(item);
    const spec = { type: item.type, x, z, rot: item.rot, scale: item.scale, seed: item.seed };
    this.objects.remove(item.id, { animate: false });
    this.tool = 'place';
    this.placeType = item.type;
    this.carry = { original: { ...spec, id: item.id } };
    this.spec = { type: spec.type, seed: spec.seed, scale: spec.scale, rot: spec.rot };
    this._clearGhost();
    this.ghost = ObjectManager.createObject(this.def, this.spec, this.materials.ghost);
    this.ghost.traverse((o) => (o.castShadow = false));
    this.scene.add(this.ghost);
    this.sound.click();
    this.down = false;
    this.stroke = null;
    this._emit();
  }

  _cancelCarry() {
    if (!this.carry) return;
    const o = this.carry.original;
    this.carry = null;
    this.objects.add(o, { id: o.id });
    this.history.undoStack.pop();
    this.history._emit();
  }

  cancel() {
    if (this.carry) {
      this._cancelCarry();
      this.select({ tool: 'move' });
    } else this.select({ tool: 'look' });
  }

  // ------------------------------------------------------------------ per frame

  update(dt) {
    this._updateHit();
    const hit = this.hit;

    if (this.down && hit && this.isBrushTool()) this._applyBrush(hit.point, dt);

    // hover highlights
    const want = new Map();
    if (this.tool === 'remove' && !this.down) for (const it of this._removeTargets()) want.set(it.id, this.materials.highlight);
    if (this.tool === 'move' && !this.carry) {
      const it = this._hoverItem();
      if (it) want.set(it.id, this.materials.hover);
    }
    for (const [id] of this.highlighted) {
      if (!want.has(id)) {
        const it = this.objects.items.get(id);
        if (it) this.objects.setMaterial(it, this.materials.solid);
      }
    }
    for (const [id, mat] of want) {
      const it = this.objects.items.get(id);
      if (it) this.objects.setMaterial(it, mat);
    }
    this.highlighted = want;

    // ghost + cursor
    let ringR = 0, ringColor = '#ffffff', ringVisible = false;
    if (this.ghost) this.ghost.visible = false;
    if (hit && this.hasPointer) {
      const { x, z } = hit.point;
      if (this.tool === 'place' && this.ghost) {
        const def = this.def;
        const ok = this.objects.canPlace(def, x, z, this.spec.scale);
        this.ghost.visible = true;
        let gx = x, gz = z;
        if (def.line && this.down && this.stroke?.anchor) {
          const a = this.stroke.anchor;
          const d = Math.hypot(x - a.x, z - a.z);
          if (d > 0.05) {
            const ux = (x - a.x) / d, uz = (z - a.z) / d;
            this.ghost.rotation.y = Math.atan2(-uz, ux);
            gx = a.x + ux * def.line * 0.5;
            gz = a.z + uz * def.line * 0.5;
          }
        } else this.ghost.rotation.y = this.spec.rot;
        this.ghost.position.set(gx, this.objects.groundY(def, gx, gz, this.spec.scale) + 0.02, gz);
        this.ghost.scale.setScalar(this.spec.scale);
        this.materials.ghost.color.set(ok ? '#ffffff' : '#ff6a5a');
        ringR = Math.max(0.3, def.radius * this.spec.scale);
        ringColor = ok ? '#ffffff' : '#ff6a5a';
        ringVisible = true;
      } else if (this.isBrushTool()) {
        ringR = this.brush;
        ringColor = BRUSH_COLORS[this.tool];
        ringVisible = true;
      } else if (this.tool === 'remove') {
        ringR = this.brush * 0.45;
        ringColor = BRUSH_COLORS.remove;
        ringVisible = true;
      }
    }
    this._updateCursor(hit?.point, ringR, ringColor, ringVisible);
  }

  _applyBrush(p, dt) {
    const t = this.terrain, r = this.brush;
    const s = this.shift;
    switch (this.tool) {
      case 'raise':
        t.raise(p.x, p.z, r, (s ? -1.4 : 1.4) * dt);
        break;
      case 'lower':
        t.raise(p.x, p.z, r, (s ? 1.4 : -1.4) * dt);
        break;
      case 'flatten':
        t.flatten(p.x, p.z, r, this.stroke?.flatTarget ?? p.y, 5 * dt);
        break;
      case 'smooth':
        t.smooth(p.x, p.z, r, 6 * dt);
        break;
      case 'water':
        t.dig(p.x, p.z, r, 4.5 * dt);
        break;
      case 'fill':
        t.fill(p.x, p.z, r, 4.5 * dt);
        break;
      case 'wildflowers':
        t.paintFlowers(p.x, p.z, r, 4 * dt, s);
        break;
      default: {
        const info = LAND_TOOLS.find((x) => x.id === this.tool);
        t.paintLayer(p.x, p.z, r, s ? -1 : info.layer, 6 * dt);
      }
    }
    this.sound.brush(this.tool === 'water' ? 'water' : 'dirt');
  }

  // ------------------------------------------------------------------ cursor

  _makeCursor() {
    const ringPos = new Float32Array((SEG + 1) * 2 * 3);
    const ringIdx = [];
    for (let i = 0; i < SEG; i++) {
      const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
      ringIdx.push(a, b, c, c, b, d);
    }
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.BufferAttribute(ringPos, 3));
    rg.setIndex(ringIdx);
    const discPos = new Float32Array((SEG + 2) * 3);
    const discIdx = [];
    for (let i = 0; i < SEG; i++) discIdx.push(0, i + 2, i + 1);
    const dg = new THREE.BufferGeometry();
    dg.setAttribute('position', new THREE.BufferAttribute(discPos, 3));
    dg.setIndex(discIdx);
    const mk = (opacity) =>
      new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity, depthTest: false, depthWrite: false, fog: false, side: THREE.DoubleSide });
    this.ring = new THREE.Mesh(rg, mk(0.9));
    this.disc = new THREE.Mesh(dg, mk(0.13));
    for (const m of [this.ring, this.disc]) {
      m.frustumCulled = false;
      m.renderOrder = 20;
      m.visible = false;
      this.scene.add(m);
    }
  }

  _updateCursor(p, R, color, visible) {
    this.ring.visible = this.disc.visible = visible && !!p;
    if (!this.ring.visible) return;
    this.ring.material.color.set(color);
    this.disc.material.color.set(color);
    const t = this.terrain;
    const w = THREE.MathUtils.clamp(R * 0.05, 0.05, 0.11);
    const rp = this.ring.geometry.attributes.position.array;
    const dp = this.disc.geometry.attributes.position.array;
    const lift = 0.05;
    dp[0] = p.x;
    dp[1] = t.surfaceAt(p.x, p.z) + lift;
    dp[2] = p.z;
    for (let i = 0; i <= SEG; i++) {
      const a = (i / SEG) * Math.PI * 2;
      const c = Math.cos(a), s = Math.sin(a);
      for (let k = 0; k < 2; k++) {
        const r = k === 0 ? R - w : R;
        const x = p.x + c * r, z = p.z + s * r;
        const o = (i * 2 + k) * 3;
        rp[o] = x;
        rp[o + 1] = t.surfaceAt(x, z) + lift;
        rp[o + 2] = z;
      }
      const x = p.x + c * (R - w), z = p.z + s * (R - w);
      dp[(i + 1) * 3] = x;
      dp[(i + 1) * 3 + 1] = t.surfaceAt(x, z) + lift;
      dp[(i + 1) * 3 + 2] = z;
    }
    this.ring.geometry.attributes.position.needsUpdate = true;
    this.disc.geometry.attributes.position.needsUpdate = true;
  }
}

export const WATER_LEVEL = WORLD.waterLevel;
