import { WORLD } from '../config.js';

const WL = WORLD.waterLevel;
const rand = (a, b) => a + Math.random() * (b - a);

function angleDelta(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

// Simple wander-around-home behaviour for ducks, sheep, villagers and butterflies.
export class Agent {
  constructor(item, cfg, manager) {
    this.item = item;
    this.cfg = cfg;
    this.mgr = manager;
    this.terrain = manager.terrain;
    this.x = item.x;
    this.z = item.z;
    this.heading = item.rot;
    this.state = 'idle';
    this.timer = rand(0.3, 2);
    this.target = null;
    this.phase = Math.random() * 100;
    this.moving = 0;
  }

  valid(x, z) {
    const t = this.terrain;
    if (!t.isInside(x, z, 0.4)) return false;
    const h = t.heightAt(x, z);
    if (this.cfg.medium === 'water') return h < WL - 0.12;
    if (this.cfg.medium === 'land') {
      return h > WL + 0.08 && t.slopeAt(x, z) < 0.9 && !this.mgr.blocked(x, z, 0.12, this.item.id);
    }
    return true;
  }

  pickTarget() {
    const r = this.cfg.range;
    for (let i = 0; i < 10; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = Math.sqrt(Math.random()) * r;
      const x = this.item.x + Math.cos(a) * d;
      const z = this.item.z + Math.sin(a) * d;
      if (this.valid(x, z)) return { x, z };
    }
    return null;
  }

  update(dt, t, obj) {
    if (this.cfg.medium === 'air') return this._fly(dt, t, obj);
    const s = this.item.scale;
    if (this.state === 'idle') {
      this.timer -= dt;
      this.moving = Math.max(0, this.moving - dt * 4);
      if (this.timer <= 0) {
        this.target = this.pickTarget();
        this.state = this.target ? 'move' : 'idle';
        this.timer = rand(1, 3);
      }
    } else {
      const dx = this.target.x - this.x, dz = this.target.z - this.z;
      const dist = Math.hypot(dx, dz);
      const want = Math.atan2(dx, dz);
      this.heading += angleDelta(this.heading, want) * Math.min(1, dt * 4);
      const step = this.cfg.speed * s * dt * Math.max(0.2, Math.cos(angleDelta(this.heading, want)));
      const nx = this.x + Math.sin(this.heading) * step;
      const nz = this.z + Math.cos(this.heading) * step;
      this.moving = Math.min(1, this.moving + dt * 4);
      if (dist < 0.12 || !this.valid(nx, nz)) {
        this.state = 'idle';
        const [a, b] = this.cfg.idle;
        this.timer = rand(a, b);
      } else {
        this.x = nx;
        this.z = nz;
      }
    }

    const T = t + this.phase;
    let y;
    if (this.cfg.medium === 'water') {
      y = WL - 0.015 + Math.sin(T * 2.2) * 0.012;
      obj.rotation.z = Math.sin(T * 1.7) * 0.06;
    } else {
      y = this.terrain.heightAt(this.x, this.z);
      if (this.cfg.walker) {
        y += Math.abs(Math.sin(T * 9)) * 0.045 * this.moving;
        obj.rotation.z = Math.sin(T * 9) * 0.06 * this.moving;
      } else {
        y += Math.abs(Math.sin(T * 7)) * 0.02 * this.moving;
      }
      const head = obj.userData.parts?.head;
      if (this.cfg.graze && head) {
        const grazing = this.state === 'idle' && Math.sin(T * 0.6) > 0.1 ? 1 : 0;
        head.rotation.x += (grazing * 0.7 + Math.sin(T * 6) * 0.05 * grazing - head.rotation.x) * Math.min(1, dt * 3);
      }
    }
    obj.position.set(this.x, y, this.z);
    obj.rotation.y = this.heading;
  }

  _fly(dt, t, obj) {
    const T = t * this.cfg.speed + this.phase;
    const R = this.cfg.range;
    const x = this.item.x + Math.sin(T * 0.7) * R * 0.6 + Math.sin(T * 1.9) * R * 0.15;
    const z = this.item.z + Math.cos(T * 0.53) * R * 0.6 + Math.cos(T * 1.3) * R * 0.15;
    const ground = this.terrain.surfaceAt(x, z);
    const y = ground + 0.7 + Math.sin(T * 2.3) * 0.3 + Math.sin(t * 9 + this.phase) * 0.04;
    const dx = x - this.x, dz = z - this.z;
    if (dx * dx + dz * dz > 1e-8) this.heading = Math.atan2(dx, dz);
    this.x = x;
    this.z = z;
    obj.position.set(x, y, z);
    obj.rotation.y = this.heading;
    const flap = Math.sin(t * 22 + this.phase) * 0.9 + 0.2;
    const p = obj.userData.parts;
    if (p.wl) p.wl.rotation.z = -flap;
    if (p.wr) p.wr.rotation.z = flap;
  }
}
