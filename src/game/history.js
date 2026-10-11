// Snapshot-based undo/redo for terrain + objects.
export class History {
  constructor(terrain, objects, limit = 40) {
    this.terrain = terrain;
    this.objects = objects;
    this.limit = limit;
    this.undoStack = [];
    this.redoStack = [];
    this.listeners = new Set();
  }

  capture() {
    return { terrain: this.terrain.snapshot(), objects: this.objects.serialize() };
  }

  push() {
    this.undoStack.push(this.capture());
    if (this.undoStack.length > this.limit) this.undoStack.shift();
    this.redoStack.length = 0;
    this._emit();
  }

  _apply(s) {
    this.terrain.restore(s.terrain);
    this.objects.applyList(s.objects);
  }

  undo() {
    const s = this.undoStack.pop();
    if (!s) return false;
    this.redoStack.push(this.capture());
    this._apply(s);
    this._emit();
    return true;
  }

  redo() {
    const s = this.redoStack.pop();
    if (!s) return false;
    this.undoStack.push(this.capture());
    this._apply(s);
    this._emit();
    return true;
  }

  clear() {
    this.undoStack.length = 0;
    this.redoStack.length = 0;
    this._emit();
  }

  onChange(fn) {
    this.listeners.add(fn);
  }

  _emit() {
    for (const fn of this.listeners) fn(this);
  }
}
