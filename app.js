'use strict';

/*
  CrowniX - International Draughts (HTML + CSS + vanilla JavaScript only).

  Modules (classic scripts, loaded in this order by index.html):
    engine.js   rules + computer opponent (also runs in a Web Worker)
    core.js     settings, safe storage, shared state
    audio.js    Web Audio sound effects, vibration
    profile.js  local profile, rating, achievements, Daily Crown, replays
    fx.js       move animation and fire splash
    board.js    board drawing
    game.js     game flow, undo/redo, save/resume, hints
    screens.js  screens, profile views, replay mode, sharing
    app.js      actions, keyboard, install/offline, start-up
*/

/* =========================================================
   STARTING GAMES
   ========================================================= */

function startGame(game) {

  fxToken++;

  clearHint();

  if (RP.active) {
    stopReplayTimer();
    RP.active = false;
    RP.stash = null;
    $('replayBar').hidden = true;
    document.body.classList.remove('replaying');
  }

  if (G && G !== game) {
    G.aiTok++;                                 // cancel any computer move still being calculated
  }

  G = game;

  sel = null;

  closeModal('over');

  $('pause').hidden = true;

  setPauseBtn(false);

  hideInsight();

  show('game');

  render(true);

  renderTime();

  save();

  refreshControls();

  maybeAI();

  autoSelect();

  if (!store.get('rd.tip1')) {

    store.put('rd.tip1', 1);

    toast('Tap a piece, then a gold square');
  }
}


function newGameLike() {

  if (G && G.daily) {
    startDaily();
  } else {
    startGame(freshGame(G && G.mode ? G.mode : 'cpu'));
  }
}


function confirmRestart() {

  return (
    !set.confirm || !G || G.over || !G.log.length ||
    confirm('Start a new game? Current progress will be lost.')
  );
}


function confirmReplaceSave() {

  return !set.confirm || !loadSave() || confirm('Starting a new game replaces your saved game. Continue?');
}


/* =========================================================
   ACTIONS (every button uses data-act="name")
   ========================================================= */

const ACTIONS = {

  playnow() {
    if (confirmReplaceSave()) startGame(freshGame('cpu'));
  },

  resume() {
    const game = loadSave();
    if (game) startGame(game);
  },

  local() {
    if (confirmReplaceSave()) startGame(freshGame('local'));
  },

  cpu() {
    startGame(freshGame('cpu'));
  },

  daily() { openDoc('daily'); },
  dailyPlay() { if (confirmReplaceSave()) startDaily(); },
  dailyShare: shareDaily,

  replays() { openDoc('replays'); },
  profile() { openDoc('profile'); },
  how() { openDoc('how'); },
  settings() { openDoc('settings'); },
  back: goBack,

  new() { if (confirmRestart()) newGameLike(); },
  again() { newGameLike(); },

  undo,
  redo,
  hint: showHint,
  pause: togglePause,
  theme: toggleTheme,

  snd() {
    set.sound = !set.sound;
    store.put(KEY_SET, set);
    applySettings();
    unlockAudio();
    if (set.sound) SFX.select();
  },

  vibe() {
    set.vib = !set.vib;
    store.put(KEY_SET, set);
    applySettings();
    if (set.vib) vib(30);
  },

  history() {
    if (G && G.log.length) openReplay(entryFor(G, { title: 'Current game' }), 'game');
  },

  share: shareCurrent,

  exit() {
    closeModal('over');
    if (G && G.mode !== 'replay') save();
    show('menu');
  },

  why: explainLastAI,

  insightClose: hideInsight,

  replayFirst() { replayStep(-RP.index); },
  replayPrev() { replayStep(-1); },
  replayPlay: replayToggle,
  replayNext() { replayStep(1); },
  replayLast() { replayStep(RP.moves.length - RP.index); },

  replaySpeed() {
    RP.speed = RP.speed === 1 ? 2 : RP.speed === 2 ? .5 : 1;
    $('replaySpeedLabel').textContent = `${RP.speed}x`;
  },

  replayExit: exitReplay,

  replayEnded() {
    closeModal('over');
    openReplay(entryFor(G, { title: 'Finished game' }), 'game');
  },

  shareEnded() {
    if (G) shareText('CrowniX game', Share.gameText(entryFor(G, { summary: `${G.log.length} moves. ${(G.endInfo && G.endInfo.text) || ''}`.trim() }), gameUrl()));
  },

  welcomePlay() {
    finishWelcome();
    startGame(freshGame('cpu'));
  },

  welcomeSkip: finishWelcome,

  keys() { openModal('keys'); },
  closeKeys() { closeModal('keys'); },

  resetProfile() {
    if (confirm('Erase your rating, records, statistics, achievements, streaks and saved replays on this device?')) {
      Profile.reset();
      renderProfile();
      toast('Reset');
    }
  },

  async install() {

    if (!installPrompt) {
      return;
    }

    const promptEvent = installPrompt;

    installPrompt = null;

    $('install').hidden = true;

    try {
      promptEvent.prompt();
      await promptEvent.userChoice;
    } catch (e) {
      /* dismissed */
    }
  }
};


/* =========================================================
   INSTALL PROMPT, OFFLINE NOTICES, SHORTCUT LAUNCH
   ========================================================= */

let installPrompt = null;


window.addEventListener('beforeinstallprompt', event => {

  event.preventDefault();

  installPrompt = event;

  const button = $('install');

  if (button) {
    button.hidden = false;
  }
});


window.addEventListener('appinstalled', () => {

  installPrompt = null;

  const button = $('install');

  if (button) {
    button.hidden = true;
  }

  toast('Installed');
});


function registerServiceWorker() {

  if (!('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol)) {
    return;
  }

  navigator.serviceWorker
    .register('service-worker.js')
    .then(registration => {

      registration.addEventListener('updatefound', () => {

        const worker = registration.installing;

        if (!worker) {
          return;
        }

        worker.addEventListener('statechange', () => {

          if (worker.state === 'installed') {

            toast(
              navigator.serviceWorker.controller
                ? 'Update ready: reload'
                : 'Offline ready'
            );
          }
        });
      });
    })
    .catch(() => {});
}


/* App shortcuts from the home-screen icon: ?mode=cpu | local | daily */
function launchFromShortcut() {

  let mode = null;

  try {
    mode = new URLSearchParams(location.search).get('mode');
  } catch (e) {
    return false;
  }

  if (mode === 'cpu') ACTIONS.cpu();
  else if (mode === 'local') ACTIONS.local();
  else if (mode === 'daily') show('daily');
  else return false;

  return true;
}


/* =========================================================
   KEYBOARD
   ========================================================= */

function onGlobalKey(event) {

  if (event.ctrlKey || event.metaKey || event.altKey) {
    return;
  }

  trapFocus(event);

  const tag = (event.target.tagName || '').toLowerCase();

  if (tag === 'input' || tag === 'select' || tag === 'textarea') {
    return;
  }

  const key = event.key;

  if (key === 'Escape') {

    if (!$('keys').hidden) { closeModal('keys'); return; }
    if (!$('welcome').hidden) { finishWelcome(); return; }
    if (!$('over').hidden) { ACTIONS.exit(); return; }
    if (RP.active) { exitReplay(); return; }
    if (sel) { sel = null; render(); return; }
    if (DOC_SCREENS.includes(document.body.dataset.screen)) { goBack(); return; }
  }

  if (anyModalOpen()) {
    return;
  }

  if (key === '?' || (key === '/' && event.shiftKey)) {
    openModal('keys');
    return;
  }

  const onButton = tag === 'button' || tag === 'a';

  if (document.body.dataset.screen !== 'game') {
    return;
  }

  /* Replay: arrows, Home/End and Space. */
  if (RP.active) {

    if (key === 'ArrowLeft') { event.preventDefault(); replayStep(-1); }
    else if (key === 'ArrowRight') { event.preventDefault(); replayStep(1); }
    else if (key === 'Home') { event.preventDefault(); replayStep(-RP.index); }
    else if (key === 'End') { event.preventDefault(); replayStep(RP.moves.length - RP.index); }
    else if (key === ' ' && !onButton) { event.preventDefault(); replayToggle(); }

    return;
  }

  const k = key.toLowerCase();

  if (k === 'u') undo();
  else if (k === 'r') redo();
  else if (k === 'h') showHint();
  else if (k === 'p') togglePause();
  else if (k === 'm') ACTIONS.snd();
  else if (k === 't') toggleTheme();
  else if (k === 'b') $('board').focus();
}


/* =========================================================
   INITIALIZATION
   ========================================================= */

function init() {

  set = migrateSettings(store.get(KEY_SET));

  Profile.load();

  buildBoard();

  $('board').addEventListener('dragstart', event => event.preventDefault());

  /* A temporary game lets the board render before a game starts. */
  G = freshGame('local');

  applySettings();

  render();

  G = null;

  refreshMenu();


  /* One delegated click handler for every button. */
  document.addEventListener('click', event => {

    const replayOpen = event.target.closest('[data-replay]');

    if (replayOpen) {
      const entry = Replays.list().find(e => e.id === replayOpen.dataset.replay);
      if (entry) openReplay(entry, 'replays');
      return;
    }

    const replayDelete = event.target.closest('[data-delete-replay]');

    if (replayDelete) {
      Replays.remove(replayDelete.dataset.deleteReplay);
      renderReplays();
      return;
    }

    const ply = event.target.closest('[data-ply]');

    if (ply && RP.active) {
      stopReplayTimer();
      replayGo(Number(ply.dataset.ply), false);
      return;
    }

    const level = event.target.closest('[data-level]');

    if (level) {
      set.diff = normLevel(level.dataset.level);
      store.put(KEY_SET, set);
      applySettings();
      SFX.click();
      return;
    }

    const button = event.target.closest('[data-act]');

    if (!button || button.disabled) {
      return;
    }

    const action = button.dataset.act;

    if (ACTIONS[action]) {

      if (action !== 'theme' && action !== 'snd') {
        SFX.click();
      }

      ACTIONS[action]();
    }
  });


  /* Board: mouse / touch. */
  $('board').addEventListener('click', event => {

    const cell = event.target.closest('[data-s]');

    if (!cell) {
      return;
    }

    cur = +cell.dataset.s;

    onSquare(cur);
  });


  /* Board: keyboard. */
  $('board').addEventListener('keydown', event => {

    const step = { ArrowUp: -8, ArrowDown: 8, ArrowLeft: -1, ArrowRight: 1 }[event.key];

    if (step) {

      event.preventDefault();

      const next = cur + step;

      if (
        next >= 0 && next < 64 &&
        !(step === 1 && col(cur) === 7) &&
        !(step === -1 && col(cur) === 0)
      ) {
        cur = next;
      }

      if (G) {
        render();
        announce(`${nm(cur)}${G.board[cur] ? (G.board[cur] > 0 ? ' white' : ' black') + (Math.abs(G.board[cur]) === KING ? ' king' : ' man') : ' empty'}`);
      }

      return;
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onSquare(cur);
    }
  });

  document.addEventListener('keydown', onGlobalKey);


  /* Settings. */
  $('setlist').addEventListener('change', event => {

    const key = event.target.dataset.set;

    if (!key) {
      return;
    }

    set[key] = event.target.type === 'checkbox' ? event.target.checked : event.target.value;

    set = migrateSettings(set);

    store.put(KEY_SET, set);

    applySettings();
  });


  /* Level selector: arrow keys move between options. */
  $('levelSeg').addEventListener('keydown', event => {

    const i = LEVEL_ORDER.indexOf(set.diff);

    const next = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? i + 1
      : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? i - 1 : null;

    if (next === null) {
      return;
    }

    event.preventDefault();

    set.diff = LEVEL_ORDER[Math.max(0, Math.min(LEVEL_ORDER.length - 1, next))];

    store.put(KEY_SET, set);

    applySettings();

    $('levelSeg').querySelector(`[data-level="${set.diff}"]`).focus();
  });


  /* Game timer. */
  setInterval(() => {

    if (G && !G.paused && !G.over && $('game').classList.contains('active')) {

      G.time++;

      renderTime();

      if (G.time % 5 === 0) {
        save();
      }
    }
  }, 1000);


  registerServiceWorker();

  if (!launchFromShortcut()) {
    maybeWelcome();
  }
}


init();
