'use strict';

/*
  Screens and interface: notices, modals, navigation, settings, profile,
  achievements, Daily Crown, saved replays, replay mode and sharing.
*/

/* =========================================================
   ANNOUNCEMENTS, TOASTS AND MODALS
   ========================================================= */

function announce(text) {

  const el = $('announce');

  if (!el) {
    return;
  }

  el.textContent = '';

  setTimeout(() => { el.textContent = text; }, 30);
}


const toastQueue = [];

let toastBusy = false;


function toast(message) {

  toastQueue.push(message);

  if (!toastBusy) {
    nextToast();
  }
}


function nextToast() {

  const el = $('toast');

  const message = toastQueue.shift();

  if (!message || !el) {
    toastBusy = false;
    return;
  }

  toastBusy = true;

  el.textContent = message;
  el.hidden = false;

  requestAnimationFrame(() => el.classList.add('show'));

  setTimeout(() => {

    el.classList.remove('show');

    setTimeout(() => {
      el.hidden = true;
      nextToast();
    }, 320);

  }, 3200);
}


const modalReturn = {};

const FOCUSABLE = 'button:not([disabled]), [href], input, select, [tabindex]:not([tabindex="-1"])';


function openModal(id) {

  const modal = $(id);

  modalReturn[id] = document.activeElement;

  modal.hidden = false;

  $('main').inert = true;

  const target = modal.querySelector('[data-first]') || modal.querySelector(FOCUSABLE);

  if (target) {
    target.focus();
  }
}


function closeModal(id) {

  const modal = $(id);

  if (modal.hidden) {
    return;
  }

  modal.hidden = true;

  if (![...document.querySelectorAll('.modal')].some(m => !m.hidden)) {
    $('main').inert = false;
  }

  const back = modalReturn[id];

  if (back && back.isConnected && back.focus) {
    back.focus();
  }
}


const anyModalOpen = () => [...document.querySelectorAll('.modal')].some(m => !m.hidden);


/* Keeps Tab inside the open dialog. */
function trapFocus(event) {

  const modal = [...document.querySelectorAll('.modal')].find(m => !m.hidden);

  if (!modal || event.key !== 'Tab') {
    return;
  }

  const items = [...modal.querySelectorAll(FOCUSABLE)].filter(el => !el.hidden && el.offsetParent !== null);

  if (!items.length) {
    return;
  }

  const first = items[0];
  const last = items[items.length - 1];

  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}


/* =========================================================
   NAVIGATION
   ========================================================= */

const DOC_SCREENS = ['how', 'settings', 'profile', 'daily', 'replays'];


function show(id) {

  const from = document.querySelector('.screen.active');

  if (from && from.id !== id) {
    prevScreen = from.id;
  }

  document.querySelectorAll('.screen').forEach(screen => {
    screen.classList.toggle('active', screen.id === id);
  });

  document.body.dataset.screen = id;

  if (id === 'menu') refreshMenu();
  if (id === 'profile') renderProfile();
  if (id === 'daily') renderDaily();
  if (id === 'replays') renderReplays();
  if (id === 'settings') applySettings();

  /* Move keyboard / screen-reader focus to the new screen. */
  const target = id === 'menu' ? $('playNow') : $(id).querySelector('h2');

  if (target && id !== 'game') {
    target.setAttribute('tabindex', target.tagName === 'BUTTON' ? '0' : '-1');
    target.focus({ preventScroll: true });
  }

  window.scrollTo(0, 0);
}


let backTo = 'menu';


/* Opens a document-style screen and remembers where "Back" should return. */
function openDoc(id) {

  const current = document.body.dataset.screen;

  if (!DOC_SCREENS.includes(current)) {
    backTo = current;
  }

  show(id);
}


function goBack() {

  show(backTo === 'game' && !G ? 'menu' : backTo || 'menu');
}


function refreshMenu() {

  $('resume').hidden = !loadSave();

  const streak = Profile.dailyStreak(Daily.key());

  const done = Profile.dailyDone(Daily.key());

  $('dailyBadge').textContent = done ? 'Done' : streak ? `${streak} day streak` : 'New';

  $('playNowSub').textContent = `vs ${LEVELS[set.diff].label}`;

  document.querySelectorAll('#levelSeg [data-level]').forEach(button => {

    const on = button.dataset.level === set.diff;

    button.setAttribute('aria-checked', String(on));
    button.tabIndex = on ? 0 : -1;
  });
}


/* =========================================================
   THEME AND SETTINGS
   ========================================================= */

function applyTheme() {

  const light = set.theme === 'light';

  document.body.dataset.theme = light ? 'light' : 'dark';

  const button = $('themeBtn');

  if (button) {

    const label = light ? 'Switch to dark mode' : 'Switch to light mode';

    button.setAttribute('aria-pressed', String(light));
    button.setAttribute('aria-label', label);
    button.title = label;
  }

  const meta = document.querySelector('meta[name="theme-color"]');

  if (meta) {
    meta.setAttribute('content', light ? '#eee9df' : '#090909');
  }
}


function toggleTheme() {

  set.theme = set.theme === 'light' ? 'dark' : 'light';

  store.put(KEY_SET, set);

  applyTheme();

  SFX.click();
}


function applySettings() {

  applySoundState();

  document.body.classList.toggle('noanim', set.animMode === 'off');

  $('board').classList.toggle('coords', set.coords);

  const soundButton = $('snd');

  soundButton.classList.toggle('off', !set.sound);
  soundButton.setAttribute('aria-pressed', String(set.sound));
  soundButton.setAttribute('aria-label', set.sound ? 'Sound on. Press to mute' : 'Sound muted. Press to turn on');
  soundButton.title = set.sound ? 'Sound on' : 'Sound muted';

  const vibration = $('vbtn');

  vibration.setAttribute('aria-pressed', String(set.vib));
  vibration.setAttribute('aria-label', set.vib ? 'Vibration on. Press to turn off' : 'Vibration off. Press to turn on');
  vibration.title = set.vib ? 'Vibration on' : 'Vibration off';

  document.querySelectorAll('[data-set]').forEach(el => {

    const value = set[el.dataset.set];

    if (el.type === 'checkbox') {
      el.checked = Boolean(value);
    } else {
      el.value = value;
    }
  });

  applyTheme();

  renderTime();

  if (document.body.dataset.screen === 'menu') {
    refreshMenu();
  }
}


/* =========================================================
   CONTROLS AND GAME OVER
   ========================================================= */

function setPauseBtn(paused) {

  const button = $('pbtn');

  const label = paused ? 'Resume game' : 'Pause game';

  button.setAttribute('aria-label', label);
  button.title = label;

  button.innerHTML = `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="${paused ? 'M8 5.5v13l10-6.5z' : 'M8 5v14M16 5v14'}"/>
    </svg>
    <span class="btn-label">${paused ? 'Resume' : 'Pause'}</span>
  `;
}


function togglePause() {

  if (!G || G.over || G.mode === 'replay') {
    return;
  }

  G.paused = !G.paused;

  $('pause').hidden = !G.paused;

  setPauseBtn(G.paused);

  refreshControls();

  announce(G.paused ? 'Game paused' : 'Game resumed');

  if (!G.paused) {
    maybeAI();
  }
}


/* Enables / disables the in-game buttons to match the game state. */
function refreshControls() {

  if (!G) {
    return;
  }

  const live = G.mode !== 'replay' && !G.over;

  const set1 = (act, disabled) => {

    const button = document.querySelector(`.ctl [data-act="${act}"]`);

    if (button) {
      button.disabled = disabled;
    }
  };

  set1('undo', !live || G.paused || !G.snaps.length);
  set1('redo', !live || G.paused || G.busy || !G.redo.length);
  set1('hint', !live || G.paused || G.busy || hintBusy || (G.mode === 'cpu' && G.turn !== HUMAN));
  set1('history', !G.log || !G.log.length);
  set1('share', !G.log || !G.log.length);
}


function showGameOver(title, text, ratingLine) {

  $('ot').textContent = title;
  $('od').textContent = text;
  $('od2').textContent = ratingLine || '';

  const again = document.querySelector('#over [data-act="again"]');

  const label = G.daily ? 'Try the Daily Crown again' : 'Play again';

  again.setAttribute('aria-label', label);
  again.title = label;

  openModal('over');

  again.focus();
}


function celebrate(ids) {

  if (!ids || !ids.length) {
    return;
  }

  const defs = Profile.achievementList();

  ids.forEach(id => {

    const a = defs.find(x => x.id === id);

    if (a) {
      toast(a.name);
    }
  });

  SFX.achieve();

  vib([30, 30, 60]);
}


/* =========================================================
   SMALL DOM HELPER (text is always set with textContent)
   ========================================================= */

function el(tag, className, text) {

  const node = document.createElement(tag);

  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;

  return node;
}


function table(headers, rows) {

  const t = el('table', 'data-table');

  const head = el('tr');

  headers.forEach(h => { const th = el('th', '', h); th.scope = 'col'; head.appendChild(th); });

  if (headers.some(Boolean)) {
    t.appendChild(head);
  }

  rows.forEach(r => {

    const tr = el('tr');

    r.forEach((cell, i) => {
      const c = el(i === 0 ? 'th' : 'td', '', String(cell));
      if (i === 0) c.scope = 'row';
      tr.appendChild(c);
    });

    t.appendChild(tr);
  });

  return t;
}


const fmtTime = s => {

  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);

  return h ? `${h} h ${m} min` : `${m} min`;
};


/* =========================================================
   PROFILE, RECORDS, STATISTICS, ACHIEVEMENTS
   ========================================================= */

function renderProfile() {

  const d = Profile.data;

  const body = $('profileBody');

  const nodes = [];

  /* Rating */
  const rating = el('div', 'card profile-head');

  const nameLabel = el('label', 'name-field', 'Name');

  const name = document.createElement('input');

  name.id = 'playerName';
  name.type = 'text';
  name.maxLength = 16;
  name.value = d.name;
  name.autocomplete = 'off';
  name.setAttribute('aria-label', 'Player name');

  name.addEventListener('change', () => { name.value = Profile.setName(name.value); });

  nameLabel.appendChild(name);

  const big = el('div', 'rating-big');

  big.appendChild(el('b', '', String(d.rating)));
  big.appendChild(el('span', '', 'Rating'));

  const sub = el('p', 'muted', `Peak ${d.peak} · ${d.rated} rated`);

  rating.append(nameLabel, big, sub);

  nodes.push(rating);

  /* Records */
  const r = d.records;

  const fastest = LEVEL_ORDER.filter(l => r.fastest[l]).map(l => `${LEVELS[l].label}: ${r.fastest[l]}`).join(', ') || 'None yet';

  const records = el('div', 'card');

  records.appendChild(el('h3', '', 'Records'));

  records.appendChild(table(['', ''], [
    ['Games', r.games],
    ['Wins', r.wins],
    ['Best streak', r.bestWinStreak],
    ['Biggest capture', r.bestChain],
    ['Most kings', r.mostKings],
    ['Longest game', r.longest],
    ['Fastest win', fastest],
    ['Peak rating', d.peak],
    ['Daily best', d.daily.best],
    ['Time', fmtTime(r.playSec)]
  ]));

  nodes.push(records);

  /* Statistics */
  const stats = el('div', 'card');

  stats.appendChild(el('h3', '', 'Stats'));

  stats.appendChild(table(['vs CPU', 'W', 'L', 'D'],
    LEVEL_ORDER.map(l => [LEVELS[l].label, d.stats.cpu[l].w, d.stats.cpu[l].l, d.stats.cpu[l].d])));

  stats.appendChild(table(['Duo', 'White', 'Black', 'D'],
    [['Wins', d.stats.local.white, d.stats.local.black, d.stats.local.draw]]));

  nodes.push(stats);

  /* Achievements */
  const list = Profile.achievementList();

  const unlocked = list.filter(a => a.unlocked).length;

  const ach = el('div', 'card');

  ach.appendChild(el('h3', '', `Achievements ${unlocked}/${list.length}`));

  const grid = el('ul', 'ach-grid');

  list.forEach(a => {

    const li = el('li', 'ach' + (a.unlocked ? ' on' : ''));

    li.appendChild(el('strong', '', a.name));
    li.appendChild(el('span', '', a.desc));

    if (!a.unlocked && a.progress) {
      li.appendChild(el('em', '', `${a.progress[0]} / ${a.progress[1]}`));
    }

    li.setAttribute('aria-label', `${a.name}: ${a.desc} ${a.unlocked ? 'Unlocked.' : 'Locked.'}`);

    grid.appendChild(li);
  });

  ach.appendChild(grid);

  nodes.push(ach);

  body.replaceChildren(...nodes);
}


/* =========================================================
   DAILY CROWN
   ========================================================= */

function renderDaily() {

  const key = Daily.key();

  const d = Daily.generate(key);

  const done = Profile.dailyDone(key);

  const streak = Profile.dailyStreak(key);

  $('dailyDate').textContent = key;
  $('dailyTitle').textContent = d.title;
  $('dailyDesc').textContent = d.type === 'win' ? `vs ${LEVELS[d.level].label}` : 'Promote a man';

  $('dailyStatus').textContent = done
    ? `Done in ${Profile.data.daily.done[key].moves} moves`
    : streak
      ? 'Keep your streak alive'
      : 'Start a streak';

  $('dailyStreak').textContent = `${streak} · best ${Profile.data.daily.best}`;

  const week = $('dailyWeek');

  const dots = [];

  for (let i = -6; i <= 0; i++) {

    const k = Daily.shift(key, i);

    const ok = Profile.dailyDone(k);

    const dot = el('li', 'dot' + (ok ? ' on' : '') + (i === 0 ? ' today' : ''), k.slice(8));

    dot.setAttribute('aria-label', `${k}: ${ok ? 'completed' : i === 0 ? 'today, not completed' : 'not completed'}`);

    dots.push(dot);
  }

  week.replaceChildren(...dots);

  $('dailyShare').hidden = !done;

  $('dailyPlay').setAttribute('aria-label', done ? 'Play today\'s Daily Crown again' : 'Play today\'s Daily Crown');
}


function startDaily() {

  const d = Daily.generate(Daily.key());

  startGame(freshGame('cpu', { diff: d.level, board: d.board, daily: d }));

  toast(d.title);
}


function completeDaily(moves, quiet) {

  const d = G.daily;

  const r = Profile.completeDaily(d.key, { moves, level: d.level });

  if (r.already) {
    return [];
  }

  toast(`Daily done · streak ${r.streak}`);

  SFX.promote();

  if (quiet) {
    return r.unlocked;
  }

  celebrate(r.unlocked);

  return [];
}


async function shareDaily() {

  const key = Daily.key();

  const info = Profile.data.daily.done[key];

  if (!info) {
    return;
  }

  const d = Daily.generate(key);

  await shareText('CrowniX Daily Crown', Share.dailyText(key, { title: d.title, moves: info.moves }, Profile.dailyStreak(key), gameUrl()));
}


/* =========================================================
   SAVED REPLAYS
   ========================================================= */

function renderReplays() {

  const list = Replays.list();

  const box = $('replayList');

  $('replayEmpty').hidden = list.length > 0;

  box.replaceChildren(...list.map(entry => {

    const li = el('li', 'replay-item');

    const open = el('button', 'replay-open');

    open.type = 'button';
    open.dataset.replay = entry.id;
    open.appendChild(el('strong', '', entry.title));
    open.appendChild(el('span', '', `${new Date(entry.ts).toLocaleDateString()} · ${entry.summary}`));
    open.setAttribute('aria-label', `Replay: ${entry.title}. ${entry.summary}`);

    const del = el('button', 'replay-del');

    del.type = 'button';
    del.dataset.deleteReplay = entry.id;
    del.setAttribute('aria-label', `Delete replay: ${entry.title}`);
    del.title = 'Delete replay';
    del.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>';

    li.append(open, del);

    return li;
  }));
}


/* =========================================================
   REPLAY MODE
   (the game screen shows a finished or in-progress game move by move)
   ========================================================= */

const RP = { active: false, entry: null, boards: [], moves: [], index: 0, playing: false, timer: 0, speed: 1, stash: null, from: 'menu' };


function openReplay(entry, from) {

  const positions = Replays.positions(entry);

  if (!positions || !positions.moves.length) {
    toast('Nothing to replay');
    return;
  }

  if (RP.active) {
    stopReplayTimer();
  } else {
    RP.stash = G;
    RP.from = from || document.querySelector('.screen.active').id;
  }

  fxToken++;
  clearHint();
  sel = null;

  Object.assign(RP, { active: true, entry, boards: positions.boards, moves: positions.moves, index: 0, playing: false, speed: RP.speed || 1 });

  G = {
    mode: 'replay', board: positions.boards[0].slice(), turn: W, over: true, paused: false, busy: false,
    last: null, moves: [], snaps: [], redo: [], log: [], time: 0, diff: 'casual', daily: null
  };

  document.body.classList.add('replaying');

  $('replayBar').hidden = false;

  hideInsight();

  buildMoveList();

  show('game');

  replayGo(positions.moves.length, false);

  $('replayBar').querySelector('[data-act="replayPlay"]').focus();
}


function buildMoveList() {

  const list = $('moveList');

  const items = RP.moves.map((m, i) => {

    const li = el('li', '');

    const b = el('button', 'mv', `${i % 2 === 0 ? `${i / 2 + 1}. ` : ''}${Replays.notation(m)}`);

    b.type = 'button';
    b.dataset.ply = String(i + 1);
    b.setAttribute('aria-label', `Move ${i + 1}, ${i % 2 === 0 ? 'White' : 'Black'} ${Replays.notation(m)}`);

    li.appendChild(b);

    return li;
  });

  list.replaceChildren(...items);
}


function replayGo(index, animate) {

  const i = Math.max(0, Math.min(RP.moves.length, index));

  const forward = animate && i === RP.index + 1;

  RP.index = i;

  G.board = RP.boards[i].slice();
  G.last = i > 0 ? RP.moves[i - 1] : null;
  G.turn = i % 2 === 0 ? W : B;

  sel = null;

  fxToken++;

  const animated = forward && canAnimate();

  if (animated) {

    const m = RP.moves[i - 1];

    const wasKing = Math.abs(RP.boards[i - 1][m.from]) === KING;

    animUntil = performance.now() + glideMs(m);

    scheduleFx(m, wasKing);
  }

  doAnim = animated;

  render(true);

  doAnim = false;

  document.querySelectorAll('#moveList .mv').forEach(b => {
    b.classList.toggle('current', Number(b.dataset.ply) === i);
  });

  const current = document.querySelector('#moveList .mv.current');

  if (current) {
    current.scrollIntoView({ block: 'nearest' });
  }

  $('replayInfo').textContent = i === 0
    ? `0 / ${RP.moves.length}`
    : `${i} / ${RP.moves.length} · ${Replays.notation(RP.moves[i - 1])}`;

  setStatus();

  $('replayPlayIcon').setAttribute('d', RP.playing ? 'M8 5v14M16 5v14' : 'M8 5.5v13l10-6.5z');

  $('replayBar').querySelector('[data-act="replayPlay"]').setAttribute('aria-label', RP.playing ? 'Pause replay' : 'Play replay');

  announce($('replayInfo').textContent);
}


function stopReplayTimer() {

  clearTimeout(RP.timer);

  RP.playing = false;
}


function replayToggle() {

  if (RP.playing) {

    stopReplayTimer();

    replayGo(RP.index, false);

    return;
  }

  if (RP.index >= RP.moves.length) {
    replayGo(0, false);
  }

  RP.playing = true;

  const step = () => {

    if (!RP.active || !RP.playing) {
      return;
    }

    if (RP.index >= RP.moves.length) {
      stopReplayTimer();
      replayGo(RP.index, false);
      return;
    }

    replayGo(RP.index + 1, true);

    const m = RP.moves[RP.index - 1];

    RP.timer = setTimeout(step, ((canAnimate() ? glideMs(m) : 0) + 500) / RP.speed);
  };

  step();
}


function replayStep(delta) {

  stopReplayTimer();

  replayGo(RP.index + delta, delta === 1);
}


function exitReplay() {

  if (!RP.active) {
    return;
  }

  stopReplayTimer();

  RP.active = false;

  document.body.classList.remove('replaying');

  $('replayBar').hidden = true;

  fxToken++;

  G = RP.stash;

  RP.stash = null;

  sel = null;

  if (G && RP.from === 'game') {

    show('game');

    render(true);

    renderTime();

    refreshControls();

    showAIBar();

    if (G.over && G.endInfo) {
      showGameOver(G.endInfo.title, G.endInfo.text, G.endInfo.ratingLine);
    }

    maybeAI();

    autoSelect();

  } else {

    show(RP.from && RP.from !== 'game' ? RP.from : 'menu');
  }
}


/* =========================================================
   SHARING
   ========================================================= */

const gameUrl = () => (location.protocol === 'file:' ? '' : location.origin + location.pathname);


async function shareText(title, text) {

  try {

    if (navigator.share) {
      await navigator.share({ title, text });
      return true;
    }

  } catch (e) {

    if (e && e.name === 'AbortError') {
      return false;                              // the player closed the share sheet
    }
  }

  try {

    await navigator.clipboard.writeText(text);

    toast('Copied');

    return true;

  } catch (e) {
    /* fall through to the legacy copy */
  }

  const area = document.createElement('textarea');

  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.opacity = '0';

  document.body.appendChild(area);

  area.select();

  let ok = false;

  try {
    ok = document.execCommand('copy');
  } catch (e) {
    ok = false;
  }

  area.remove();

  toast(ok ? 'Copied' : 'Sharing unavailable');

  return ok;
}


function shareCurrent() {

  const entry = RP.active
    ? RP.entry
    : G && G.log.length
      ? entryFor(G, { summary: `${G.log.length} moves so far` })
      : null;

  if (!entry) {
    return;
  }

  shareText('CrowniX game', Share.gameText(entry, gameUrl()));
}


/* =========================================================
   ONBOARDING
   ========================================================= */

const KEY_ONBOARDED = 'rd.onboarded';


function maybeWelcome() {

  if (store.get(KEY_ONBOARDED)) {
    return false;
  }

  openModal('welcome');

  return true;
}


function finishWelcome() {

  store.put(KEY_ONBOARDED, 1);

  closeModal('welcome');
}
