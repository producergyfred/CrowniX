'use strict';

/*
  Game flow: computer opponent client, playing moves, move log, results,
  undo / redo, save / resume, hints and "Why this move?".
  Rules and search live in engine.js; the profile in profile.js.
*/

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));


/* =========================================================
   COMPUTER OPPONENT CLIENT
   Runs the search in a Web Worker when the browser allows it
   (http / https / installed app) and on the main thread otherwise
   (for example when index.html is opened straight from disk).
   ========================================================= */

const AI = {

  worker: null,
  failed: false,
  seq: 0,
  pending: new Map(),


  start() {

    if (this.worker || this.failed) {
      return;
    }

    try {

      if (typeof Worker === 'undefined' || !/^https?:$/.test(location.protocol)) {
        this.failed = true;
        return;
      }

      this.worker = new Worker('engine.js');

      this.worker.onmessage = event => {

        const waiting = this.pending.get(event.data.id);

        if (waiting) {
          this.pending.delete(event.data.id);
          waiting(event.data);
        }
      };

      this.worker.onerror = () => {

        this.failed = true;
        this.worker = null;

        this.pending.forEach(resolve => resolve(null));
        this.pending.clear();
      };

    } catch (e) {

      this.failed = true;
      this.worker = null;
    }
  },


  request(message) {

    this.start();

    return new Promise(resolve => {

      if (!this.worker) {
        resolve(null);
        return;
      }

      const id = ++this.seq;

      this.pending.set(id, resolve);

      this.worker.postMessage({ ...message, id });

      setTimeout(() => {

        if (this.pending.has(id)) {
          this.pending.delete(id);
          resolve(null);
        }
      }, 20000);
    });
  },


  /* Always resolves with one of the supplied legal moves. */
  async pick(board, color, moves, level) {

    const r = await this.request({ cmd: 'pick', board, color, level });

    if (r && !r.error && moves[r.index]) {
      return { move: moves[r.index], score: r.score, depth: r.depth };
    }

    await sleep(30);                                 // let the "thinking" status paint

    const f = Engine.findBest(board, color, moves, level);

    return { move: f.move, score: f.score, depth: f.depth };
  },


  async analyze(board, color, moves, depth, time) {

    const r = await this.request({ cmd: 'analyze', board, color, depth, time });

    if (r && !r.error && r.list && r.list.every(x => moves[x.index])) {
      return { depth: r.depth, list: r.list.map(x => ({ move: moves[x.index], score: x.score })) };
    }

    await sleep(30);

    return Engine.analyze(board, color, moves, depth, time);
  }
};


/* =========================================================
   GAME CREATION, MOVE LOG AND UNDO SNAPSHOTS
   ========================================================= */

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);


function freshGame(mode, options = {}) {

  const board = options.board ? options.board.slice() : Engine.newBoard();

  const game = {
    id: uid(),
    board,
    turn: W,
    mode,                                       // 'local' | 'cpu'
    diff: normLevel(options.diff || set.diff),
    start: options.board ? Replays.encodeBoard(board) : null,   // non-standard start (Daily Crown)
    h0: Engine.hash(board, W),
    log: [],                                    // [{ c: colour, m: move, h: position key after the move }]
    snaps: [],                                  // undo points
    redo: [],
    noProg: 0,
    time: 0,
    over: false,
    paused: false,
    busy: false,
    aiTok: 0,
    last: null,
    undos: 0,
    hints: 0,
    recorded: false,
    daily: options.daily || null,
    lastAI: null,
    moves: []
  };

  game.moves = Engine.generateLegalMoves(board, W);

  return game;
}


function snapshot() {

  return {
    board: G.board.slice(),
    turn: G.turn,
    noProg: G.noProg,
    last: G.last,
    logLen: G.log.length
  };
}


function repetitions(g) {

  const key = Engine.hash(g.board, g.turn);

  return (g.h0 === key ? 1 : 0) + g.log.filter(e => e.h === key).length;
}


/* Facts about the finished (or current) game, rebuilt from the move log. */
function gameFacts(g) {

  const b = g.start ? Replays.decodeBoard(g.start) : Engine.newBoard();

  const diff0 = b.filter(p => p * HUMAN > 0).length - b.filter(p => p * HUMAN < 0).length;

  let yourMoves = 0;
  let lost = 0;
  let captured = 0;
  let minDiff = 0;

  for (const e of g.log) {

    if (e.c === HUMAN) {
      yourMoves++;
      captured += e.m.caps.length;
    } else {
      lost += e.m.caps.length;
    }

    Engine.applyMove(b, e.m);

    const d = b.filter(p => p * HUMAN > 0).length - b.filter(p => p * HUMAN < 0).length - diff0;

    minDiff = Math.min(minDiff, d);
  }

  return { plies: g.log.length, yourMoves, lost, captured, minDiff };
}


/* =========================================================
   PLAYING A MOVE
   ========================================================= */

const sideName = c => (c === W ? 'White' : 'Black');

function playMove(m, meta = {}) {

  if (!G || G.mode === 'replay' || G.over || !G.moves.includes(m)) {
    return;                                    // the engine is the only authority on legality
  }

  G.snaps.push(snapshot());

  if (G.snaps.length > 300) {
    G.snaps.shift();
  }

  const mover = G.turn;

  const piece = G.board[m.from];

  const wasKing = Math.abs(piece) === KING;

  const before = { board: G.board.slice(), moves: G.moves };

  Engine.applyMove(G.board, m);

  G.noProg = wasKing && !m.caps.length ? G.noProg + 1 : 0;

  G.last = m;
  G.turn = -G.turn;
  sel = null;

  G.log.push({ c: mover, m, h: Engine.hash(G.board, G.turn) });

  G.redo = [];

  G.moves = Engine.generateLegalMoves(G.board, G.turn);

  clearHint();

  G.lastAI = meta.ai ? { board: before.board, color: mover, moves: before.moves, move: m, depth: meta.ai.depth, level: G.diff } : null;

  announce(
    `${sideName(mover)} moved ${nm(m.from)} to ${nm(m.path[m.path.length - 1])}` +
    (m.caps.length ? `, capturing ${m.caps.length}` : '') +
    (m.promo ? ', promoted to king' : '')
  );

  const animated = canAnimate();

  fxToken++;

  if (animated) {

    animUntil = performance.now() + glideMs(m);

    scheduleFx(m, wasKing);

  } else {

    animUntil = 0;

    playSounds(m, wasKing);
  }

  doAnim = animated;

  render(true);

  doAnim = false;

  onHumanMove(m, mover);

  save();


  /* Show the result only after the glide has finished. */
  const game = G;
  const token = fxToken;

  const wait = animated ? Math.max(0, animUntil - performance.now()) + 350 : 0;

  const finish = () => {

    if (game === G && token === fxToken) {
      checkGameOver();
    }
  };

  if (wait) {
    setTimeout(finish, wait);
  } else {
    finish();
  }

  showAIBar();

  maybeAI();

  autoSelect();
}


/* Profile events for the human player's moves against the computer. */
function onHumanMove(m, mover) {

  if (G.mode !== 'cpu' || mover !== HUMAN) {
    return;
  }

  const kings = G.board.filter(p => p === KING * HUMAN).length;

  celebrate(Profile.recordMove({ chain: m.caps.length, promo: m.promo, kings }));

  if (G.daily && G.daily.type === 'crown' && m.promo && !Profile.dailyDone(G.daily.key)) {

    const yours = G.log.filter(e => e.c === HUMAN).length;

    if (yours <= G.daily.limit) {
      completeDaily(yours);
    }
  }
}


/* When only one piece can move (a forced capture, for example) select it for the player. */
function autoSelect() {

  if (
    !set.autoSelect || !G || G.over || G.paused || G.busy || sel ||
    (G.mode === 'cpu' && G.turn !== HUMAN) || !G.moves.length
  ) {
    return;
  }

  const movers = new Set(G.moves.map(m => m.from));

  if (movers.size === 1) {

    const from = [...movers][0];

    sel = { from, k: 0, cands: G.moves.filter(m => m.from === from), trail: [], auto: true };

    cur = from;

    render();
  }
}


/* =========================================================
   COMPUTER TURN
   ========================================================= */

async function maybeAI() {

  if (
    !G || G.mode !== 'cpu' || G.turn === HUMAN || G.over || G.paused || G.busy || !G.moves.length
  ) {
    return;
  }

  const game = G;

  const token = ++game.aiTok;

  game.busy = true;

  setStatus();

  refreshControls();

  const board = game.board.slice();

  const moves = game.moves;

  const wait = Math.max(500, animUntil - performance.now() + 300);

  const [result] = await Promise.all([
    AI.pick(board, game.turn, moves, game.diff),
    sleep(wait)
  ]);

  if (game.aiTok !== token) {
    return;                                    // undone or restarted while thinking
  }

  game.busy = false;

  if (game !== G || game.over || game.paused) {

    if (game === G) {
      setStatus();
      refreshControls();
    }

    return;
  }

  playMove(result.move, { ai: { depth: result.depth } });
}


/* =========================================================
   GAME OVER, RESULTS AND PROFILE
   ========================================================= */

function checkGameOver() {

  if (!G || G.over) {
    return;
  }

  if (!G.moves.length) {

    const none = G.board.every(p => p * G.turn <= 0);

    endGame(-G.turn, none ? 'All captured' : 'No moves left');

  } else if (G.noProg >= KING_ONLY_LIMIT) {

    endGame(0, `${KING_ONLY_LIMIT} king moves, no capture`);

  } else if (repetitions(G) >= REPETITION_LIMIT) {

    endGame(0, 'Position repeated 3 times');
  }
}


function entryFor(g, extra = {}) {

  const facts = gameFacts(g);

  return {
    id: g.id,
    ts: Date.now(),
    mode: g.mode,
    level: g.diff,
    title: extra.title || (g.mode === 'cpu' ? `Game vs ${LEVELS[g.diff].label}` : 'Local game'),
    summary: extra.summary || `${facts.plies} moves`,
    log: g.log.map(e => Replays.encodeMove(e.m)),
    start: g.start,
    plies: facts.plies,
    result: extra.result || '',
    daily: g.daily ? g.daily.key : ''
  };
}


function endGame(winner, why) {

  G.over = true;

  store.del(KEY_SAVE);

  clearHint();

  const local = G.mode === 'local';

  let title;
  let text;
  let result;

  if (winner === 0) {

    title = 'DRAW';
    text = `Draw: ${why}`;
    result = local ? 'draw' : 'draw';

  } else if (local) {

    title = 'VICTORY';
    text = `${sideName(winner)} wins: ${why}`;
    result = winner === W ? 'white' : 'black';

  } else if (winner === HUMAN) {

    title = 'VICTORY';
    text = `You win: ${why}`;
    result = 'win';

  } else {

    title = 'DEFEAT';
    text = `Computer wins: ${why}`;
    result = 'loss';
  }

  const facts = gameFacts(G);

  let ratingLine = '';

  let achieved = [];

  if (!G.recorded) {

    G.recorded = true;

    const assisted = G.undos > 0 || G.hints > 0;

    const outcome = Profile.recordGame({
      mode: G.mode,
      level: G.diff,
      result,
      plies: facts.plies,
      yourMoves: facts.yourMoves,
      lostPieces: facts.lost,
      minDiff: facts.minDiff,
      assisted,
      seconds: G.time,
      daily: !!G.daily
    });

    achieved = outcome.unlocked;

    if (G.mode === 'cpu') {

      ratingLine = outcome.rated
        ? `Rating ${outcome.rating} (${outcome.delta >= 0 ? '+' : ''}${outcome.delta})`
        : G.daily
          ? 'Daily: unrated'
          : 'Unrated (hint or undo used)';
    }

    if (G.daily && G.daily.type === 'win' && result === 'win' && !Profile.dailyDone(G.daily.key)) {

      if (facts.yourMoves <= G.daily.limit) {

        achieved = achieved.concat(completeDaily(facts.yourMoves, true));

      } else {

        ratingLine = `Not completed: ${facts.yourMoves} moves, limit ${G.daily.limit}`;
      }
    }

    Replays.add(entryFor(G, { title: titleCase(text.split('.')[0]) + ' - ' + (G.mode === 'cpu' ? LEVELS[G.diff].label : 'Local'), summary: `${facts.plies} moves. ${ratingLine}`.trim(), result }));
  }

  G.endInfo = { title, text, ratingLine };

  showGameOver(title, text, ratingLine);

  celebrate(achieved);

  if (winner === 0 || (!local && winner !== HUMAN)) {
    SFX.draw();
  } else {
    SFX.win();
  }

  vib([60, 40, 60, 40, 120]);

  setStatus();

  refreshControls();

  announce(`${title}. ${text}`);
}


const titleCase = s => s.replace(/\b\w/g, c => c.toUpperCase());


/* =========================================================
   BOARD INPUT
   ========================================================= */

function onSquare(s) {

  if (
    !G || G.mode === 'replay' || G.over || G.paused || G.busy ||
    (G.mode === 'cpu' && G.turn !== HUMAN)
  ) {
    return;
  }

  if (hint) {
    hint = null;
  }

  if (sel) {

    const next = sel.cands.filter(m => m.path[sel.k] === s);

    if (next.length) {

      vib(10);

      const done = next.find(m => m.path.length === sel.k + 1);

      if (done) {
        playMove(done);
        return;
      }

      sel.k++;
      sel.cands = next;
      sel.trail.push(s);

      SFX.select();
      render();

      return;
    }

    if (sel.k > 0) {                           // a started capture sequence must be completed
      SFX.invalid();
      return;
    }

    if (sel.from === s) {

      if (sel.auto) {                         // tapping an auto-selected piece keeps it selected
        sel.auto = false;
        return;
      }

      sel = null;
      render();
      return;
    }
  }

  const cands = G.moves.filter(m => m.from === s);

  sel = cands.length ? { from: s, k: 0, cands, trail: [] } : null;

  if (sel) {
    SFX.select();
    vib(15);
  } else if (G.board[s] * G.turn > 0) {
    SFX.invalid();
    vib(25);
  }

  render();
}


/* =========================================================
   UNDO / REDO
   ========================================================= */

function undo() {

  if (!G || G.mode === 'replay' || G.over || G.paused || !G.snaps.length) {
    return;
  }

  const popped = [];

  let snap;

  do {

    snap = G.snaps.pop();

    popped.push(snap);

  } while (G.mode === 'cpu' && snap.turn !== HUMAN && G.snaps.length);

  if (G.mode === 'cpu' && snap.turn !== HUMAN) {
    G.snaps.push(...popped.reverse());         // nothing sensible to return to
    return;
  }

  const removed = G.log.splice(typeof snap.logLen === 'number' ? snap.logLen : G.log.length);

  G.redo.push({ snaps: popped, state: snapshot(), removed });

  G.aiTok++;                                   // cancel a computer move that is still being calculated
  G.busy = false;

  fxToken++;
  clearHint();

  G.board = snap.board;
  G.turn = snap.turn;
  G.noProg = snap.noProg;
  G.last = snap.last;
  G.undos++;

  sel = null;

  G.moves = Engine.generateLegalMoves(G.board, G.turn);

  render(true);

  save();

  showAIBar();

  announce('Move undone');

  autoSelect();
}


function redo() {

  if (!G || G.mode === 'replay' || G.over || G.paused || G.busy || !G.redo.length) {
    return;
  }

  const entry = G.redo.pop();

  for (let i = entry.snaps.length - 1; i >= 0; i--) {
    G.snaps.push(entry.snaps[i]);
  }

  G.log.push(...entry.removed);

  fxToken++;
  clearHint();

  G.board = entry.state.board;
  G.turn = entry.state.turn;
  G.noProg = entry.state.noProg;
  G.last = entry.state.last;

  sel = null;

  G.moves = Engine.generateLegalMoves(G.board, G.turn);

  render(true);

  save();

  announce('Move restored');

  checkGameOver();

  maybeAI();

  autoSelect();
}


/* =========================================================
   HINT AND "WHY THIS MOVE?"
   ========================================================= */

let hint = null;

let hintTimer = 0;

let hintBusy = false;


function hintClass(s) {

  if (!hint) {
    return '';
  }

  return (s === hint.from ? ' hint-from' : '') + (hint.path.includes(s) ? ' hint-to' : '');
}


function clearHint() {

  hint = null;

  clearTimeout(hintTimer);
}


/* Shows the analysis panel: title, optional lines, and a button that reveals them. */
function showInsight(title, lines, open) {

  const panel = $('insight');

  $('insightTitle').textContent = title;

  const body = $('insightBody');

  body.replaceChildren(...(lines || []).map(t => {
    const li = document.createElement('li');
    li.textContent = t;
    return li;
  }));

  body.hidden = !open || !lines || !lines.length;

  $('whyBtn').hidden = !lines || !lines.length ? true : open;

  $('whyBtn').dataset.pending = lines ? '' : '1';

  panel.hidden = false;
}


function hideInsight() {
  $('insight').hidden = true;
}


/* After the computer moves: one line, with a button to reveal the reasoning. */
function showAIBar() {

  if (!G || G.mode !== 'cpu' || !G.lastAI || !set.reasoning) {

    if (G && (!G.lastAI || G.mode !== 'cpu')) {
      hideInsight();
    }

    return;
  }

  const m = G.lastAI.move;

  showInsight(`Computer: ${Replays.notation(m)}`, null, false);

  $('whyBtn').hidden = false;
}


async function explainLastAI() {

  const info = G && G.lastAI;

  if (!info) {
    return;
  }

  $('whyBtn').disabled = true;

  const analysis = await AI.analyze(info.board, info.color, info.moves, 6, 900);

  const text = Engine.explain(info.board, info.color, info.moves, info.move, analysis, info.level);

  $('whyBtn').disabled = false;

  if (G && G.lastAI === info) {
    showInsight(`Computer: ${Replays.notation(info.move)}`, text.lines, true);
  }
}


async function showHint() {

  if (
    !G || G.mode === 'replay' || G.over || G.paused || G.busy || hintBusy || !G.moves.length ||
    (G.mode === 'cpu' && G.turn !== HUMAN)
  ) {

    SFX.invalid();

    return;
  }

  const game = G;

  hintBusy = true;

  refreshControls();

  const analysis = await AI.analyze(game.board.slice(), game.turn, game.moves, 7, 900);

  hintBusy = false;

  if (game !== G || game.over || !analysis.list.length) {
    refreshControls();
    return;
  }

  const move = analysis.list[0].move;

  if (!G.moves.includes(move)) {
    refreshControls();
    return;
  }

  G.hints++;

  hint = move;

  sel = null;

  render();

  SFX.select();

  const text = Engine.explain(game.board, game.turn, game.moves, move, analysis, 'master');

  showInsight(`Hint: ${text.title}`, text.lines, true);

  announce(`Hint: move ${text.title}`);

  clearTimeout(hintTimer);

  hintTimer = setTimeout(() => {

    if (hint === move) {

      hint = null;

      if (G) {
        render();
      }
    }
  }, 5000);
}


/* =========================================================
   SAVE / RESUME
   ========================================================= */

function save() {

  if (!G || G.over || G.mode === 'replay') {
    return;
  }

  store.put(KEY_SAVE, {
    v: 2,
    board: G.board,
    turn: G.turn,
    mode: G.mode,
    diff: G.diff,
    start: G.start,
    log: G.log.map(e => Replays.encodeMove(e.m)),
    snaps: G.snaps.slice(-200),
    noProg: G.noProg,
    time: G.time,
    undos: G.undos,
    hints: G.hints,
    daily: G.daily ? { key: G.daily.key, type: G.daily.type, level: G.daily.level, limit: G.daily.limit } : null,
    last: G.last ? { from: G.last.from, path: G.last.path, caps: G.last.caps, promo: G.last.promo } : null
  });
}


const validBoard = board =>
  Array.isArray(board) && board.length === 64 && board.every(v => [-2, -1, 0, 1, 2].includes(v));


function loadSave() {

  const data = store.get(KEY_SAVE);

  if (
    !data || !validBoard(data.board) || (data.turn !== W && data.turn !== B) ||
    (data.mode !== 'cpu' && data.mode !== 'local')
  ) {
    return null;
  }

  const startBoard = data.start ? Replays.decodeBoard(data.start) : null;

  const daily = data.daily && /^\d{4}-\d{2}-\d{2}$/.test(data.daily.key) ? Daily.generate(data.daily.key) : null;

  const game = freshGame(data.mode, { diff: data.diff, board: startBoard || undefined, daily });

  game.board = data.board.slice();
  game.turn = data.turn;
  game.noProg = num(data.noProg);
  game.time = num(data.time);
  game.undos = num(data.undos);
  game.hints = num(data.hints);

  /* Rebuild the move log by replaying it; keep it only if it reproduces the saved position. */
  if (Array.isArray(data.log)) {

    const b = startBoard ? startBoard.slice() : Engine.newBoard();

    const log = [];

    let ok = true;

    data.log.forEach((s, i) => {

      const m = ok && Replays.decodeMove(s);

      if (!m) {
        ok = false;
        return;
      }

      const color = i % 2 === 0 ? W : B;

      Engine.applyMove(b, m);

      log.push({ c: color, m, h: Engine.hash(b, -color) });
    });

    if (ok && b.every((v, i) => v === game.board[i])) {
      game.log = log;
    }
  }

  game.snaps = (Array.isArray(data.snaps) ? data.snaps : [])
    .filter(s => s && validBoard(s.board) && (s.turn === W || s.turn === B))
    .map(s => ({ ...s, logLen: game.log.length ? s.logLen : undefined }));

  game.last = data.last && Array.isArray(data.last.path)
    ? { from: data.last.from, path: data.last.path, caps: Array.isArray(data.last.caps) ? data.last.caps : [], promo: !!data.last.promo }
    : null;

  game.moves = Engine.generateLegalMoves(game.board, game.turn);

  return game.moves.length ? game : null;
}
