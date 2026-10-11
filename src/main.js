import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { HALF } from './config.js';
import { Terrain } from './world/terrain.js';
import { Water } from './world/water.js';
import { Grass } from './world/grass.js';
import { Environment } from './world/environment.js';
import { Clouds } from './world/clouds.js';
import { Fireflies, Smoke } from './world/particles.js';
import { createObjectMaterials } from './objects/materials.js';
import { ObjectManager } from './objects/manager.js';
import { CATALOG } from './objects/catalog.js';
import { loadCustomModels } from './objects/custom.js';
import { Post } from './render/post.js';
import { LampLights } from './render/lamps.js';
import { renderThumbnails } from './render/thumbnails.js';
import { ToolController } from './game/tools.js';
import { History } from './game/history.js';
import { Sound } from './game/audio.js';
import { generateStarter, generateMeadow } from './game/starter.js';
import { encodeWorld, decodeWorld, saveLocal, loadLocal, downloadJSON } from './game/storage.js';
import { UI } from './ui/ui.js';
import './style.css';

const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(36, innerWidth / innerHeight, 0.1, 1500);
camera.position.set(33, 31, 39);
{
  // portrait screens need to stand further back to see the whole island
  const aspect = innerWidth / innerHeight;
  if (aspect < 1.3) camera.position.multiplyScalar(Math.min(2.2, Math.pow(1.3 / aspect, 0.85)));
}

const controls = new OrbitControls(camera, canvas);
controls.target.set(0, 0.6, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 6;
controls.maxDistance = Math.max(85, camera.position.length() * 1.15);
controls.maxPolarAngle = 1.36;
controls.minPolarAngle = 0.12;
controls.zoomToCursor = true;
controls.screenSpacePanning = false;
controls.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.ROTATE };
controls.touches = { ONE: null, TWO: THREE.TOUCH.DOLLY_ROTATE };

const shared = {
  uniforms: {
    uTime: { value: 0 },
    uWind: { value: 0.8 },
    uWindDir: { value: new THREE.Vector2(1, 0.45).normalize() },
    uNightGlow: { value: 0 },
    uGlowColor: { value: new THREE.Color('#ffb45a') },
    uSkyColor: { value: new THREE.Color('#cfe6ff') },
  },
};

const terrain = new Terrain(shared);
const water = new Water(terrain, shared);
const grass = new Grass(shared);
const env = new Environment(scene, shared);
const materials = createObjectMaterials(shared);
const objects = new ObjectManager({ terrain, materials });
const clouds = new Clouds();
const fireflies = new Fireflies(shared, 190);
const smoke = new Smoke();
const lamps = new LampLights(scene, 8);
scene.add(terrain.group, water.group, grass.group, objects.group, clouds.group, fireflies.points, smoke.points);

const post = new Post(renderer, scene, camera);
const sound = new Sound();
const history = new History(terrain, objects);
addEventListener('pointerdown', () => sound.unlock(), { once: true, capture: true });
const tools = new ToolController({ camera, canvas, terrain, objects, materials, history, sound, controls, scene });

// ---------------------------------------------------------------- persistence

let saveTimer = null;
const scheduleSave = () => {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveLocal(encodeWorld(terrain, objects, { time: env.time })), 1200);
};
objects.onChange(scheduleSave);
let lastRev = -1;

function newWorld(kind) {
  history.push();
  if (kind === 'meadow') generateMeadow(terrain, objects);
  else generateStarter(terrain, objects);
  terrain.refresh();
  scheduleSave();
}

// Blender models must be in the catalog before a saved garden that uses them is loaded.
await loadCustomModels();

const saved = loadLocal();
let loaded = false;
if (saved) {
  try {
    decodeWorld(saved, terrain, objects);
    if (typeof saved.time === 'number') env.time = saved.time;
    loaded = true;
  } catch (e) {
    console.warn('Could not load saved garden', e);
  }
}
if (!loaded) generateStarter(terrain, objects);
terrain.refresh();
lastRev = terrain.revision;

// ---------------------------------------------------------------- quality

const QUALITY = {
  low: { pr: 1, shadow: 1024, grass: 0.35, bloom: false, tilt: false, lamps: 0 },
  medium: { pr: Math.min(devicePixelRatio, 1.5), shadow: 2048, grass: 0.65, bloom: true, tilt: true, lamps: 4 },
  high: { pr: Math.min(devicePixelRatio, 2), shadow: 4096, grass: 1, bloom: true, tilt: true, lamps: 8 },
};
const coarse = matchMedia('(pointer: coarse)').matches;
let quality = 'high';
try {
  quality = localStorage.getItem('little-garden/quality') || (coarse ? 'medium' : 'high');
} catch (e) {
  quality = coarse ? 'medium' : 'high';
}

function applyQuality(q) {
  quality = QUALITY[q] ? q : 'high';
  const p = QUALITY[quality];
  renderer.setPixelRatio(p.pr);
  env.setShadowQuality(p.shadow);
  grass.setDensity(p.grass);
  post.setOptions({ bloom: p.bloom, tilt: p.tilt });
  lamps.setActive(p.lamps);
  resize();
  try {
    localStorage.setItem('little-garden/quality', quality);
  } catch (e) {
    /* storage unavailable */
  }
}

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  post.setSize(w, h);
  const ph = h * renderer.getPixelRatio();
  fireflies.setPixelScale(ph, camera.fov);
  smoke.setPixelScale(ph, camera.fov);
}
addEventListener('resize', resize);

// ---------------------------------------------------------------- actions + UI

let shotRequested = false;
const actions = {
  undo() {
    if (history.undo()) ui.toast('Undone');
  },
  redo() {
    if (history.redo()) ui.toast('Redone');
  },
  starter() {
    newWorld('starter');
    ui.toast('A fresh island!');
  },
  meadow() {
    newWorld('meadow');
    ui.toast('An empty meadow to fill');
  },
  export() {
    downloadJSON(encodeWorld(terrain, objects, { time: env.time }), 'my-little-garden.json');
  },
  import() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = async () => {
      const f = input.files[0];
      if (!f) return;
      try {
        history.push();
        const data = decodeWorld(JSON.parse(await f.text()), terrain, objects);
        if (typeof data.time === 'number') env.time = data.time;
        terrain.refresh();
        scheduleSave();
        ui.toast('Garden opened');
      } catch (e) {
        history.undo();
        ui.toast("That file isn't a garden");
      }
    };
    input.click();
  },
  shot() {
    shotRequested = true;
  },
  photo(on) {
    document.body.classList.toggle('photo', on);
    if (on) tools.select({ tool: 'look' });
  },
  quality(q) {
    applyQuality(q);
  },
  help() {
    ui.showHelp(true);
  },
};
const ui = new UI({ tools, env, sound, history, actions });
ui.syncQuality(quality);
applyQuality(quality);

try {
  if (!localStorage.getItem('little-garden/seen-help')) {
    ui.showHelp(true);
    localStorage.setItem('little-garden/seen-help', '1');
  }
} catch (e) {
  ui.showHelp(true);
}

// ---------------------------------------------------------------- keyboard

const keys = new Set();
addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement && e.target.type !== 'range') return;
  const k = e.key.toLowerCase();
  const mod = e.ctrlKey || e.metaKey;
  if (mod && k === 'z') {
    e.preventDefault();
    e.shiftKey ? actions.redo() : actions.undo();
    return;
  }
  if (mod && k === 'y') {
    e.preventDefault();
    actions.redo();
    return;
  }
  if (mod) return;
  if (e.target instanceof HTMLInputElement && ['arrowleft', 'arrowright', 'arrowup', 'arrowdown'].includes(k)) return;
  if (k === 'r') tools.rotate(e.shiftKey ? -1 : 1);
  else if (k === '[' || k === '-') tools.setBrush(tools.brush - 0.3);
  else if (k === ']' || k === '=') tools.setBrush(tools.brush + 0.3);
  else if (k === 'escape') {
    if (document.body.classList.contains('photo')) actions.photo(false);
    else tools.cancel();
  } else if (k === 'p') actions.photo(!document.body.classList.contains('photo'));
  else if (k === 'h' || k === '?') ui.showHelp(true);
  else keys.add(k);
});
addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
addEventListener('blur', () => keys.clear());

const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _off = new THREE.Vector3();
function keyboardCamera(dt) {
  if (!keys.size) return;
  const dist = camera.position.distanceTo(controls.target);
  const speed = dist * 0.9 * dt;
  camera.getWorldDirection(_fwd);
  _fwd.y = 0;
  _fwd.normalize();
  _right.crossVectors(_fwd, camera.up).normalize();
  const move = new THREE.Vector3();
  if (keys.has('w') || keys.has('arrowup')) move.add(_fwd);
  if (keys.has('s') || keys.has('arrowdown')) move.sub(_fwd);
  if (keys.has('d') || keys.has('arrowright')) move.add(_right);
  if (keys.has('a') || keys.has('arrowleft')) move.sub(_right);
  if (move.lengthSq() > 0) {
    move.normalize().multiplyScalar(speed);
    camera.position.add(move);
    controls.target.add(move);
  }
  const rot = (keys.has('q') ? 1 : 0) - (keys.has('e') ? 1 : 0);
  if (rot) {
    _off.subVectors(camera.position, controls.target).applyAxisAngle(THREE.Object3D.DEFAULT_UP, rot * dt * 1.4);
    camera.position.copy(controls.target).add(_off);
  }
}

function clampTarget() {
  const t = controls.target;
  const lim = HALF * 0.95;
  const cx = THREE.MathUtils.clamp(t.x, -lim, lim);
  const cz = THREE.MathUtils.clamp(t.z, -lim, lim);
  const cy = THREE.MathUtils.clamp(t.y, -1, 5);
  if (cx !== t.x || cz !== t.z || cy !== t.y) {
    const dx = cx - t.x, dy = cy - t.y, dz = cz - t.z;
    t.set(cx, cy, cz);
    camera.position.x += dx;
    camera.position.y += dy;
    camera.position.z += dz;
  }
}

// ---------------------------------------------------------------- thumbnails

renderThumbnails([...CATALOG.values()], shared, 112, (id, url) => ui.setThumb(id, url));

// ---------------------------------------------------------------- loop

let t = 0;
let lastNow = performance.now();
let first = true;

function frame() {
  const now = performance.now();
  const dt = Math.min((now - lastNow) / 1000, 1 / 20);
  lastNow = now;
  t += dt;
  const u = shared.uniforms;
  u.uTime.value = t;
  u.uWind.value = 0.75 + Math.sin(t * 0.13) * 0.2 + Math.sin(t * 0.47) * 0.1;

  keyboardCamera(dt);
  controls.update(dt);
  clampTarget();

  env.update(dt);
  env.followCamera(camera);
  terrain.update();
  if (terrain.revision !== lastRev) {
    lastRev = terrain.revision;
    scheduleSave();
  }
  tools.update(dt);
  objects.update(dt, t);
  const night = u.uNightGlow.value;
  clouds.update(dt, night);
  smoke.update(dt, objects.chimneys(), u.uWindDir.value, night);
  lamps.update(objects.lightEmitters(), controls.target, night, t);
  sound.ambient(dt, night);
  ui.tick();

  post.render(dt);

  if (shotRequested) {
    shotRequested = false;
    const a = document.createElement('a');
    a.href = renderer.domElement.toDataURL('image/png');
    a.download = 'little-garden.png';
    a.click();
    ui.toast('Picture saved');
  }
  if (first) {
    first = false;
    document.getElementById('loading').classList.add('done');
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// handy for tinkering from the dev console
window.garden = { scene, camera, controls, renderer, terrain, objects, env, tools, history, CATALOG };
