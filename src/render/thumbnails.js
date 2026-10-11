import * as THREE from 'three';
import { ObjectManager } from '../objects/manager.js';
import { createObjectMaterials } from '../objects/materials.js';

// Renders a little portrait of every catalog item for the toolbar, using a
// throwaway offscreen renderer so the main canvas is never disturbed.
export async function renderThumbnails(defs, shared, size = 112, onEach) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  } catch (e) {
    return;
  }
  renderer.setPixelRatio(1);
  renderer.setSize(size, size, false);
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.05;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#e8f2ff', '#7a6a50', 1.3));
  const key = new THREE.DirectionalLight('#fff1dc', 2.6);
  key.position.set(3, 5, 4);
  scene.add(key);
  const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 100);
  const mats = createObjectMaterials(shared);
  const box = new THREE.Box3();
  const sphere = new THREE.Sphere();

  for (const def of defs) {
    const spec = { seed: def.thumbSeed ?? 7, rot: def.randomRot ? 0.6 : -0.45 };
    const obj = ObjectManager.createObject(def, spec, mats.solid);
    scene.add(obj);
    box.setFromObject(obj);
    box.getBoundingSphere(sphere);
    const dist = sphere.radius / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2)) * 1.02;
    const dir = new THREE.Vector3(0.55, 0.62, 1).normalize();
    camera.position.copy(sphere.center).addScaledVector(dir, dist);
    camera.lookAt(sphere.center);
    renderer.render(scene, camera);
    onEach(def.id, canvas.toDataURL('image/png'));
    scene.remove(obj);
    ObjectManager.dispose(obj);
    await new Promise((r) => setTimeout(r, 0));
  }
  for (const m of Object.values(mats)) m.dispose();
  renderer.dispose();
  renderer.forceContextLoss();
}
