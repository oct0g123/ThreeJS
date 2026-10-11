import { NATURE } from './nature.js';
import { VILLAGE } from './village.js';
import { CRITTERS } from './critters.js';

const DEFAULTS = {
  place: 'land', // land | water | any
  y: 'ground', // ground | surface | water
  radius: 0.5,
  solid: false,
  clear: 0,
  scale: [1, 1],
  scatter: null, // drag spacing for brush-like placement
  line: null, // drag spacing for fence-like placement
  rotStep: null, // null => random rotation per placement
};

export const CATALOG = new Map();

export function addToCatalog(def) {
  CATALOG.set(def.id, { ...DEFAULTS, ...def, randomRot: def.rotStep == null });
}

for (const def of [...NATURE, ...VILLAGE, ...CRITTERS]) addToCatalog(def);

export const itemsInCategory = (cat) => [...CATALOG.values()].filter((d) => d.cat === cat);
