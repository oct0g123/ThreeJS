import { GRID_N, PAINT_LAYERS } from '../config.js';

const KEY = 'little-garden/save-v1';

function toB64(bytes) {
  let s = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) s += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  return btoa(s);
}
function fromB64(str) {
  const s = atob(str);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export function encodeWorld(terrain, objects, extra = {}) {
  const h = new Int16Array(terrain.heights.length);
  for (let i = 0; i < h.length; i++) h[i] = Math.round(terrain.heights[i] * 1000);
  const p = new Uint8Array(terrain.paint.length);
  for (let i = 0; i < p.length; i++) p[i] = Math.round(terrain.paint[i] * 255);
  const f = new Uint8Array(terrain.flowers.length);
  for (let i = 0; i < f.length; i++) f[i] = Math.round(terrain.flowers[i] * 255);
  return {
    v: 1,
    n: GRID_N,
    heights: toB64(new Uint8Array(h.buffer)),
    paint: toB64(p),
    flowers: toB64(f),
    objects: objects.serialize(),
    ...extra,
  };
}

export function decodeWorld(data, terrain, objects) {
  if (!data || data.v !== 1 || data.n !== GRID_N) throw new Error('Unrecognised garden file');
  const hb = fromB64(data.heights);
  const h = new Int16Array(hb.buffer, hb.byteOffset, hb.byteLength / 2);
  for (let i = 0; i < h.length; i++) terrain.heights[i] = h[i] / 1000;
  const p = fromB64(data.paint);
  if (p.length === GRID_N * GRID_N * PAINT_LAYERS) for (let i = 0; i < p.length; i++) terrain.paint[i] = p[i] / 255;
  const f = fromB64(data.flowers);
  for (let i = 0; i < f.length; i++) terrain.flowers[i] = f[i] / 255;
  terrain.markDirty();
  objects.clearAll();
  for (const s of data.objects || []) objects.add(s, { animate: false, id: s.id });
  return data;
}

export function saveLocal(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch (e) {
    return false;
  }
}

export function loadLocal() {
  try {
    const s = localStorage.getItem(KEY);
    return s ? JSON.parse(s) : null;
  } catch (e) {
    return null;
  }
}

export function downloadJSON(data, name) {
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
