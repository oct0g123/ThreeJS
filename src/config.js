// World-wide constants. Units are roughly metres: a cottage is ~2.4 wide.
export const WORLD = {
  size: 40, // island is size x size
  res: 120, // heightfield segments per side (cell = size / res)
  waterLevel: 0,
  minHeight: -1.6,
  maxHeight: 6,
  baseY: -3.4, // bottom of the dirt block
};

export const HALF = WORLD.size / 2;
export const CELL = WORLD.size / WORLD.res;
export const GRID_N = WORLD.res + 1; // vertices per side

export const PAINT = { path: 0, sand: 1, soil: 2, stone: 3 };
export const PAINT_LAYERS = 4;
