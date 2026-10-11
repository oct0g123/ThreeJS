import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32 } from '../util/random.js';

// Puffy clouds that drift in a lazy ring around the floating island.
export class Clouds {
  constructor(count = 9) {
    const rng = mulberry32(5);
    this.group = new THREE.Group();
    this.material = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, emissive: '#c9d6ea', emissiveIntensity: 0.25 });
    this.clouds = [];
    for (let i = 0; i < count; i++) {
      const parts = [];
      const n = 4 + Math.floor(rng() * 4);
      for (let k = 0; k < n; k++) {
        const r = 1.2 + rng() * 1.6;
        const g = new THREE.IcosahedronGeometry(r, 3);
        g.scale(1, 0.75, 1);
        g.translate((k - n / 2) * 1.5 + rng(), rng() * 0.8 + r * 0.3, (rng() - 0.5) * 1.8);
        parts.push(g);
      }
      const geo = mergeGeometries(parts);
      parts.forEach((p) => p.dispose());
      const mesh = new THREE.Mesh(geo, this.material);
      const angle = (i / count) * Math.PI * 2 + rng() * 0.4;
      const dist = 38 + rng() * 22;
      const s = 0.8 + rng() * 0.9;
      mesh.scale.set(s, s, s);
      this.clouds.push({ mesh, angle, dist, y: -6 + rng() * 16, speed: 0.008 + rng() * 0.01 });
      this.group.add(mesh);
    }
    this.update(0);
  }

  update(dt, night = 0) {
    for (const c of this.clouds) {
      c.angle += c.speed * dt;
      c.mesh.position.set(Math.cos(c.angle) * c.dist, c.y, Math.sin(c.angle) * c.dist);
      c.mesh.rotation.y = -c.angle;
    }
    this.material.emissiveIntensity = 0.25 * (1 - night) + 0.05;
  }
}
