import { Color } from 'three';
import { HALF, CELL, GRID_N, WORLD } from '../config.js';

// sRGB hex -> linear vec3 literal for use inside shaders.
export function lin(hex) {
  const c = new Color(hex); // Color() converts sRGB hex into linear working space
  return `vec3(${c.r.toFixed(4)}, ${c.g.toFixed(4)}, ${c.b.toFixed(4)})`;
}

export const NOISE_GLSL = /* glsl */ `
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x),
             mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm2(vec2 p) {
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) { s += a * vnoise(p); p = p * 2.03 + 11.7; a *= 0.5; }
  return s / 0.9375;
}
`;

// The "field" texture: R = terrain height, G = grass density, B = wildflower paint.
export const FIELD_GLSL = /* glsl */ `
uniform sampler2D uField;
vec4 sampleField(vec2 xz) {
  vec2 g = (xz + ${HALF.toFixed(4)}) / ${CELL.toFixed(6)};
  g = clamp(g, vec2(0.0), vec2(${(GRID_N - 1.001).toFixed(4)}));
  ivec2 i0 = ivec2(floor(g));
  ivec2 i1 = min(i0 + 1, ivec2(${GRID_N - 1}));
  vec2 f = g - vec2(i0);
  vec4 a = texelFetch(uField, i0, 0);
  vec4 b = texelFetch(uField, ivec2(i1.x, i0.y), 0);
  vec4 c = texelFetch(uField, ivec2(i0.x, i1.y), 0);
  vec4 d = texelFetch(uField, i1, 0);
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
`;

export const PALETTE = {
  grassA: '#7cb24c',
  grassB: '#5a9a3e',
  grassDry: '#b3bb5c',
  sand: '#ead6a4',
  wetSand: '#b9a274',
  bed: '#6f6650',
  path: '#d9be8f',
  pebble: '#b49668',
  soil: '#6e4b33',
  furrow: '#4a3222',
  stone: '#bdb6aa',
  grout: '#8b8478',
  rockA: '#a3927c',
  rockB: '#c0b29b',
  snow: '#f3f6fb',
};

export const GRASS_COLOR_GLSL = /* glsl */ `
vec3 grassColor(vec2 xz) {
  float n = fbm2(xz * 0.09);
  vec3 c = mix(${lin(PALETTE.grassA)}, ${lin(PALETTE.grassB)}, smoothstep(0.35, 0.65, n));
  c = mix(c, ${lin(PALETTE.grassDry)}, smoothstep(0.6, 0.78, fbm2(xz * 0.05 + 17.0)) * 0.7);
  return c * (0.93 + 0.14 * vnoise(xz * 0.7));
}
`;

export const WATER_LEVEL_GLSL = `const float WL = ${WORLD.waterLevel.toFixed(3)};`;
