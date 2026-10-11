import * as THREE from 'three';
import { patchShader } from '../render/patch.js';

// Every placed object shares one material (vertex colours + wind sway + night glow).
function patchObject(mat, shared, key) {
  const u = shared.uniforms;
  return patchShader(mat, {
    key,
    uniforms: { uTime: u.uTime, uWind: u.uWind, uNightGlow: u.uNightGlow, uGlowColor: u.uGlowColor },
    vertexHeader: `attribute float aSway; attribute float aGlow; uniform float uTime; uniform float uWind; varying float vGlow;`,
    vertex: {
      begin_vertex: /* glsl */ `#include <begin_vertex>
        if (aSway > 0.0) {
          vec4 wp0 = modelMatrix * vec4(0.0, 0.0, 0.0, 1.0);
          float ph = wp0.x * 0.37 + wp0.z * 0.29 + transformed.y * 0.6;
          float sw = aSway * (0.5 + 0.8 * uWind);
          transformed.x += (sin(uTime * 1.7 + ph) * 0.7 + sin(uTime * 3.3 + ph * 1.9) * 0.3) * sw * 0.07;
          transformed.z += cos(uTime * 1.3 + ph * 1.3) * sw * 0.05;
        }
        vGlow = aGlow;`,
    },
    fragmentHeader: `uniform float uNightGlow; uniform vec3 uGlowColor; varying float vGlow;`,
    fragment: {
      emissivemap_fragment: `#include <emissivemap_fragment>
        totalEmissiveRadiance += uGlowColor * vGlow * uNightGlow * 3.2;`,
    },
  });
}

export function createObjectMaterials(shared) {
  const solid = patchObject(
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0 }),
    shared,
    'objects',
  );
  const ghost = patchObject(
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.8,
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
    }),
    shared,
    'objects-ghost',
  );
  const highlight = patchObject(
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.8,
      emissive: new THREE.Color('#ff5a4a'),
      emissiveIntensity: 0.55,
    }),
    shared,
    'objects-hl',
  );
  const hover = patchObject(
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.8,
      emissive: new THREE.Color('#ffe9a8'),
      emissiveIntensity: 0.35,
    }),
    shared,
    'objects-hover',
  );
  return { solid, ghost, highlight, hover };
}
