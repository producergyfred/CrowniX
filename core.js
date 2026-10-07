'use strict';

/*
  Shared state, settings and safe storage.
  Loaded after engine.js and before every other module.
*/

/* =========================================================
   SETTINGS AND STORAGE
   ========================================================= */

const KEY_SAVE = 'rd.save';
const KEY_SET = 'rd.settings';
const HUMAN = W;

const DEFAULTS = {
  sound: true,
  vib: true,
  animMode: 'cinematic',        // 'cinematic' | 'fast' | 'off'
  timer: true,
  coords: true,
  confirm: true,
  diff: 'casual',               // beginner | casual | competitive | master
  theme: 'dark',
  autoSelect: true,             // auto-select the only movable piece (e.g. a forced capture)
  reasoning: true               // show "Why this move?" after the computer plays
};

let set = { ...DEFAULTS };

/* Settings from older versions: boolean anim, easy/medium/hard. */
function migrateSettings(saved) {

  const s = { ...DEFAULTS, ...(saved && typeof saved === 'object' ? saved : {}) };

  if (saved && saved.anim === false && !saved.animMode) {
    s.animMode = 'off';
  }

  delete s.anim;

  if (!['cinematic', 'fast', 'off'].includes(s.animMode)) {
    s.animMode = 'cinematic';
  }

  s.diff = normLevel(s.diff);

  s.theme = s.theme === 'light' ? 'light' : 'dark';

  return s;
}

/* localStorage with an in-memory fallback, so the game works when storage is blocked. */
const store = {

  memory: {},

  backend() {
    try {
      return window.localStorage;
    } catch (e) {
      return null;
    }
  },

  get(key) {
    try {
      const b = this.backend();
      const raw = b ? b.getItem(key) : this.memory[key];
      return raw == null ? null : JSON.parse(raw);
    } catch (e) {
      return null;
    }
  },

  put(key, value) {
    try {
      const raw = JSON.stringify(value);
      const b = this.backend();
      if (b) b.setItem(key, raw); else this.memory[key] = raw;
    } catch (e) {
      /* quota or private mode: keep playing */
    }
  },

  del(key) {
    try {
      const b = this.backend();
      if (b) b.removeItem(key); else delete this.memory[key];
    } catch (e) {
      /* ignore */
    }
  }
};


/* =========================================================
   SHARED GAME / UI STATE
   ========================================================= */

let G = null;                 // current game (or the replay view)
let sel = null;               // selected piece + capture progress
let cur = 40;                 // keyboard cursor square
let prevScreen = 'menu';

const $ = id => document.getElementById(id);

const cells = [];
