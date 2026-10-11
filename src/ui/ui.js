import { ICONS } from './icons.js';
import { LAND_TOOLS, UTILITY_TOOLS } from '../game/tools.js';
import { itemsInCategory } from '../objects/catalog.js';

const TABS = [
  { id: 'land', name: 'Land', emoji: '⛰️' },
  { id: 'nature', name: 'Nature', emoji: '🌳' },
  { id: 'village', name: 'Village', emoji: '🏡' },
  { id: 'critters', name: 'Critters', emoji: '🦆' },
];

const $ = (sel, root = document) => root.querySelector(sel);
const el = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
};

export class UI {
  constructor({ tools, env, sound, history, actions }) {
    this.tools = tools;
    this.env = env;
    this.sound = sound;
    this.history = history;
    this.actions = actions;
    this.thumbs = new Map();
    this.tab = 'nature';
    this._build();
    tools.onChange(() => this._syncSelection());
    history.onChange(() => this._syncHistory());
    this._syncHistory();
    this.setTab('nature');
  }

  _build() {
    // top-right controls
    const top = $('#top-actions');
    top.innerHTML = `
      <div class="pill time" title="Time of day">
        <span class="time-icon">${ICONS.sun}</span>
        <input id="time" type="range" min="0" max="24" step="0.05" aria-label="Time of day">
        <button id="cycle" class="icon-btn small" title="Let the day pass">${ICONS.play}</button>
      </div>
      <button id="undo" class="icon-btn" title="Undo (Ctrl+Z)">${ICONS.undo}</button>
      <button id="redo" class="icon-btn" title="Redo (Ctrl+Shift+Z)">${ICONS.redo}</button>
      <button id="sound" class="icon-btn" title="Sound">${ICONS.sound}</button>
      <button id="photo" class="icon-btn" title="Photo mode (P)">${ICONS.camera}</button>
      <button id="menu" class="icon-btn" title="Menu">${ICONS.menu}</button>`;

    const time = $('#time');
    time.value = this.env.time;
    time.addEventListener('input', () => {
      this.env.time = +time.value;
      this.env.cycle = false;
      this._syncTime();
    });
    $('#cycle').addEventListener('click', () => {
      this.env.cycle = !this.env.cycle;
      this._syncTime();
      this.sound.click();
    });
    $('#undo').addEventListener('click', () => this.actions.undo());
    $('#redo').addEventListener('click', () => this.actions.redo());
    $('#sound').addEventListener('click', () => {
      this.sound.unlock();
      this.sound.setEnabled(!this.sound.enabled);
      $('#sound').innerHTML = this.sound.enabled ? ICONS.sound : ICONS.mute;
    });
    $('#photo').addEventListener('click', () => this.actions.photo(true));
    $('#menu').addEventListener('click', (e) => {
      e.stopPropagation();
      $('#menu-panel').classList.toggle('open');
    });
    document.addEventListener('click', (e) => {
      if (!e.target.closest('#menu-panel')) $('#menu-panel').classList.remove('open');
    });

    // menu
    const menu = $('#menu-panel');
    menu.innerHTML = `
      <button data-act="starter">🏡 New starter island</button>
      <button data-act="meadow">🌱 New empty meadow</button>
      <hr>
      <button data-act="export">💾 Save garden to file</button>
      <button data-act="import">📂 Open garden file</button>
      <button data-act="shot">📸 Save a picture</button>
      <hr>
      <div class="quality">Quality
        <div class="seg" id="quality">
          <button data-q="low">Low</button><button data-q="medium">Medium</button><button data-q="high">High</button>
        </div>
      </div>
      <button data-act="help">❔ How to play</button>`;
    menu.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.q) {
        this.actions.quality(b.dataset.q);
        this.syncQuality(b.dataset.q);
        return;
      }
      menu.classList.remove('open');
      this.actions[b.dataset.act]?.();
    });

    // left tool cluster
    const cluster = $('#tool-cluster');
    for (const t of UTILITY_TOOLS) {
      const b = el('button', 'tool-btn', `${ICONS[t.icon]}<span>${t.name}</span>`);
      b.dataset.tool = t.id;
      b.title = t.hint;
      b.addEventListener('click', () => {
        this.sound.click();
        this.tools.select({ tool: t.id });
      });
      cluster.appendChild(b);
    }

    // tabs
    const tabs = $('#tabs');
    for (const t of TABS) {
      const b = el('button', 'tab', `<span class="tab-emoji">${t.emoji}</span><span>${t.name}</span>`);
      b.dataset.tab = t.id;
      b.addEventListener('click', () => {
        this.sound.click();
        this.setTab(t.id);
      });
      tabs.appendChild(b);
    }

    const brush = $('#brush');
    brush.addEventListener('input', () => this.tools.setBrush(+brush.value));

    $('#photo-exit').addEventListener('click', () => this.actions.photo(false));
    $('#photo-shot').addEventListener('click', () => this.actions.shot());
    $('#help-close').addEventListener('click', () => this.showHelp(false));
    this._syncTime();
  }

  setTab(id) {
    this.tab = id;
    for (const b of document.querySelectorAll('.tab')) b.classList.toggle('active', b.dataset.tab === id);
    const items = $('#items');
    items.innerHTML = '';
    if (id === 'land') {
      for (const t of LAND_TOOLS) {
        const visual = t.icon ? `<div class="thumb icon">${ICONS[t.icon]}</div>` : `<div class="thumb swatch sw-${t.swatch}"></div>`;
        const b = el('button', 'item', `${visual}<span>${t.name}</span>`);
        b.dataset.tool = t.id;
        b.title = t.hint;
        b.addEventListener('click', () => {
          this.sound.click();
          this.tools.select({ tool: t.id });
        });
        items.appendChild(b);
      }
    } else {
      for (const d of itemsInCategory(id)) {
        const src = this.thumbs.get(d.id);
        const b = el('button', 'item', `<div class="thumb">${src ? `<img src="${src}" alt="">` : '<div class="thumb-loading"></div>'}</div><span>${d.name}</span>`);
        b.dataset.place = d.id;
        b.title = d.name + (d.scatter ? ' — drag to scatter' : d.line ? ' — drag to draw a line' : '');
        b.addEventListener('click', () => {
          this.sound.click();
          this.tools.select({ place: d.id });
        });
        items.appendChild(b);
      }
    }
    items.scrollLeft = 0;
    this._syncSelection();
  }

  setThumb(id, url) {
    this.thumbs.set(id, url);
    const b = document.querySelector(`.item[data-place="${id}"] .thumb`);
    if (b) b.innerHTML = `<img src="${url}" alt="">`;
  }

  _syncSelection() {
    const t = this.tools;
    for (const b of document.querySelectorAll('[data-tool]')) b.classList.toggle('active', t.tool === b.dataset.tool);
    for (const b of document.querySelectorAll('[data-place]')) b.classList.toggle('active', t.tool === 'place' && t.placeType === b.dataset.place);
    const brushRow = $('#brush-row');
    const showBrush = t.isBrushTool() || t.tool === 'remove';
    brushRow.classList.toggle('hidden', !showBrush);
    $('#brush').value = t.brush;
    const info = t.toolInfo;
    let hint = info?.hint || '';
    if (t.tool === 'place') {
      const d = t.def;
      hint = t.carry
        ? `Moving ${d.name.toLowerCase()} — click to drop it, R to rotate, Esc to cancel.`
        : `Click to place ${d.name.toLowerCase()}${d.scatter ? ', or drag to scatter lots' : ''}${d.line ? ', or drag to draw a line' : ''}. R rotates.`;
    }
    this.hint(hint);
  }

  _syncHistory() {
    $('#undo').disabled = !this.history.undoStack.length;
    $('#redo').disabled = !this.history.redoStack.length;
  }

  _syncTime() {
    const t = this.env.time;
    $('#time').value = t;
    const night = t < 6 || t > 19.5;
    $('.time-icon').innerHTML = night ? ICONS.moon : ICONS.sun;
    $('#cycle').innerHTML = this.env.cycle ? ICONS.pause : ICONS.play;
    $('#cycle').classList.toggle('active', this.env.cycle);
  }

  tick() {
    if (this.env.cycle) this._syncTime();
  }

  syncQuality(q) {
    for (const b of document.querySelectorAll('#quality button')) b.classList.toggle('active', b.dataset.q === q);
  }

  hint(text) {
    const h = $('#hint');
    h.textContent = text;
    h.classList.toggle('hidden', !text);
  }

  toast(text) {
    const t = $('#toast');
    t.textContent = text;
    t.classList.add('show');
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => t.classList.remove('show'), 1800);
  }

  showHelp(on) {
    $('#help').classList.toggle('open', on);
  }
}
