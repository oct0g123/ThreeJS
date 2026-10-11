import * as THREE from 'three';

// A fixed pool of warm point lights handed out to the lanterns/windows closest to
// the camera at night. A fixed count avoids shader recompiles as you build.
export class LampLights {
  constructor(scene, count = 8) {
    this.lights = [];
    for (let i = 0; i < count; i++) {
      const l = new THREE.PointLight('#ffb35c', 0, 7.5, 1.6);
      l.castShadow = false;
      scene.add(l);
      this.lights.push(l);
    }
    this.active = count;
  }

  setActive(n) {
    this.active = n;
    this.lights.forEach((l, i) => (l.visible = i < n));
  }

  update(emitters, focus, night, t) {
    const n = this.active;
    if (!n) return;
    const sorted = emitters
      .map((e) => ({ e, d: (e.x - focus.x) ** 2 + (e.z - focus.z) ** 2 }))
      .sort((a, b) => a.d - b.d);
    for (let i = 0; i < n; i++) {
      const l = this.lights[i];
      const s = sorted[i];
      if (!s || night < 0.02) {
        l.intensity = 0;
        continue;
      }
      l.position.set(s.e.x, s.e.y, s.e.z);
      const flicker = 1 + Math.sin(t * 7.3 + i * 1.7) * 0.04 + Math.sin(t * 13.1 + i) * 0.03;
      l.intensity = night * s.e.intensity * 3.4 * flicker;
    }
  }
}
