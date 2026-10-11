// Small hand-drawn style SVG icons (stroke = currentColor).
const svg = (body) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const ICONS = {
  raise: svg('<path d="M3 19h18"/><path d="M5 19l5-7 3 4 2-2 4 5"/><path d="M15 9V3m-2.5 2.5L15 3l2.5 2.5"/>'),
  lower: svg('<path d="M3 9h5c1 0 1.5 1 2 3s1 3 2 3 1.5-1 2-3 1-3 2-3h5"/><path d="M12 3v6m-2.5-2.5L12 9l2.5-2.5"/><path d="M3 19h18"/>'),
  flatten: svg('<path d="M3 15h18"/><path d="M3 19h18" opacity=".45"/><path d="M7 10l-3-3 3-3M17 10l3-3-3-3M4 7h16"/>'),
  smooth: svg('<path d="M3 15c3-5 6-5 9 0s6 5 9 0"/><path d="M3 19h18" opacity=".45"/>'),
  water: svg('<path d="M12 3c3 4 5.5 7 5.5 10a5.5 5.5 0 0 1-11 0C6.5 10 9 7 12 3z"/><path d="M9.5 14a2.5 2.5 0 0 0 2.5 2.5"/>'),
  fill: svg('<path d="M3 17c2 0 2-1.5 4.5-1.5S10 17 12 17s2-1.5 4.5-1.5S19 17 21 17"/><path d="M6 13c1-4 4-6 6-6s5 2 6 6"/><path d="M12 7V3"/>'),
  look: svg('<path d="M20 12a8 8 0 1 1-2.3-5.6"/><path d="M20 4v4h-4"/><circle cx="12" cy="12" r="2"/>'),
  move: svg('<path d="M12 3v18M3 12h18"/><path d="M9 6l3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3"/>'),
  remove: svg('<path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7l1 13h10l1-13"/><path d="M10 11v5M14 11v5"/>'),
  undo: svg('<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>'),
  redo: svg('<path d="M15 14l5-5-5-5"/><path d="M20 9H10a6 6 0 0 0 0 12h3"/>'),
  sound: svg('<path d="M4 10v4h4l5 4V6L8 10H4z"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/>'),
  mute: svg('<path d="M4 10v4h4l5 4V6L8 10H4z"/><path d="M17 10l4 4M21 10l-4 4"/>'),
  camera: svg('<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>'),
  menu: svg('<path d="M4 7h16M4 12h16M4 17h16"/>'),
  play: svg('<path d="M8 5l11 7-11 7z"/>'),
  pause: svg('<path d="M8 5v14M16 5v14"/>'),
  sun: svg('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
  moon: svg('<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>'),
  close: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
  help: svg('<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5v.7"/><circle cx="12" cy="17" r=".6" fill="currentColor"/>'),
};
