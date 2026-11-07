'use strict';

/*
  CrowniX test suite. Open tests/index.html in a browser.
  Covers the rules engine (checked against an independent reference
  generator), the computer opponent, the profile/rating/achievement logic,
  the Daily Crown generator and replay encoding.
*/

const out = document.getElementById('out');

let passed = 0;
let failed = 0;

function group(name) {
  const d = document.createElement('div');
  d.className = 'group';
  d.textContent = name;
  out.appendChild(d);
}

function test(name, condition, detail) {

  const d = document.createElement('div');

  if (condition) {
    passed++;
    d.className = 'pass';
    d.textContent = 'PASS  ' + name;
  } else {
    failed++;
    d.className = 'fail';
    d.textContent = 'FAIL  ' + name + (detail ? '  -> ' + detail : '');
  }

  out.appendChild(d);
}

const place = list => {
  const b = new Array(64).fill(0);
  list.forEach(([r, c, p]) => { b[sq(r, c)] = p; });
  return b;
};

const legal = (list, color) => Engine.generateLegalMoves(place(list), color);


/* Tests never touch the player's real data: storage is in memory. */
store.backend = () => null;
store.memory = {};


/* =========================================================
   RULES
   ========================================================= */

group('Opening position');

{
  const b = Engine.newBoard();

  test('12 pieces per side', b.filter(p => p > 0).length === 12 && b.filter(p => p < 0).length === 12);
  test('White has 7 opening moves', Engine.generateLegalMoves(b, W).length === 7);
  test('Black has 7 opening moves', Engine.generateLegalMoves(b, B).length === 7);
}

group('Men');

{
  let m = legal([[4, 3, W]], W);
  test('white man moves one square forward only', m.length === 2 && m.every(x => row(x.path[0]) === 3 && x.path.length === 1));

  m = legal([[3, 3, B]], B);
  test('black man moves one square forward only', m.length === 2 && m.every(x => row(x.path[0]) === 4));

  m = legal([[4, 3, W], [5, 4, B]], W);
  test('a man cannot capture backward', m.every(x => x.caps.length === 0));

  m = legal([[7, 0, W], [4, 3, B]], W);
  test('a man cannot fly-capture', m.every(x => x.caps.length === 0));

  m = legal([[4, 3, W], [4, 5, W]], W);
  test('a man cannot move sideways or backward', m.every(x => row(x.path[0]) < 4));
}

group('Captures');

{
  let m = legal([[4, 3, W], [3, 4, B], [0, 1, B]], W);
  test('capture is mandatory (only the capture is offered)', m.length === 1 && m[0].caps.length === 1);

  m = legal([[6, 1, W], [5, 2, B], [3, 2, B], [3, 4, B]], W);
  test('multi-capture continues and may change direction', Math.max(...m.map(x => x.caps.length)) >= 2);

  m = legal([[6, 1, W], [5, 2, B], [4, 5, W], [3, 4, B], [2, 3, B], [1, 2, B]], W);
  test('majority rule: only the longest sequences are legal', m.length > 0 && m.every(x => x.caps.length === m[0].caps.length));

  const b = place([[6, 1, W], [5, 2, B], [3, 2, B], [3, 4, B]]);
  const seq = Engine.generateLegalMoves(b, W).find(x => x.caps.length === 2);
  const before = b.filter(p => p < 0).length;
  Engine.applyMove(b, seq);
  test('captured pieces are removed once the sequence ends', b.filter(p => p < 0).length === before - 2);
}

group('Kings');

{
  let m = legal([[2, 3, KING], [0, 1, B]], W);
  test('king moves any distance in every direction', m.some(x => row(x.path[0]) > 2) && m.some(x => row(x.path[0]) < 2) && m.length > 8);

  m = legal([[7, 0, KING], [4, 3, B]], W);
  test('flying king may land on any empty square beyond the victim', m.length === 4 && m.every(x => x.caps.length === 1));

  m = legal([[4, 3, KING], [5, 4, B], [0, 7, B]], W);
  test('a king may capture backward', m.length > 0 && m[0].caps.length === 1);

  m = legal([[7, 0, KING], [5, 2, B], [3, 4, B], [1, 2, B]], W);
  test('multiple flying-king captures are generated', Math.max(...m.map(x => x.caps.length)) === 2);

  m = legal([[7, 0, KING], [6, 1, B], [5, 2, B]], W);
  test('a king cannot jump two adjacent pieces', m.every(x => x.caps.length === 0));
}

group('Promotion');

{
  let b = place([[1, 2, W], [0, 5, B]]);
  let promo = Engine.generateLegalMoves(b, W).find(x => x.promo);
  test('a man ending on the far row is flagged for promotion', !!promo);
  Engine.applyMove(b, promo);
  test('white promotion keeps the colour', b[promo.path[0]] === KING);

  b = place([[6, 1, B], [0, 5, W]]);
  promo = Engine.generateLegalMoves(b, B).find(x => x.promo);
  Engine.applyMove(b, promo);
  test('black promotion keeps the colour', b[promo.path[0]] === -KING);

  b = place([[2, 1, W], [1, 2, B], [0, 5, B]]);
  const cap = Engine.generateLegalMoves(b, W)[0];
  test('a capture that ends on the far row promotes', cap.caps.length === 1 && cap.promo === true);
}

group('Game end');

{
  test('no pieces = no legal moves', legal([[0, 1, W]], B).length === 0);
  test('blocked side has no legal moves', legal([[0, 1, W], [7, 0, B]], B).length === 0);
}

group('Apply / undo and position keys');

{
  const b = Engine.newBoard();

  let ok = true;
  let side = W;

  for (let i = 0; i < 40 && ok; i++) {

    const list = Engine.generateLegalMoves(b, side);

    if (!list.length) break;

    const snap = b.slice();
    const rec = Engine.applyMove(b, list[i % list.length]);

    Engine.undoMove(b, rec);

    ok = snap.every((v, j) => v === b[j]);

    Engine.applyMove(b, list[i % list.length]);
    side = -side;
  }

  test('undoMove restores the exact previous position', ok);

  const a = Engine.newBoard();
  test('same position + side gives the same key', Engine.hash(a, W) === Engine.hash(a.slice(), W));
  test('side to move changes the key', Engine.hash(a, W) !== Engine.hash(a, B));
  test('different positions give different keys', Engine.hash(a, W) !== Engine.hash(place([[4, 3, W]]), W));
}


/* =========================================================
   INDEPENDENT REFERENCE GENERATOR
   (captured pieces are marked on a copy instead of kept in a list)
   ========================================================= */

group('Move generation vs an independent reference');

function refMoves(board, color) {

  const caps = [];

  for (let s = 0; s < 64; s++) {

    const p = board[s];

    if (p * color <= 0) continue;

    const b = board.slice();
    b[s] = 0;

    const king = Math.abs(p) === KING;

    (function go(pos, path, taken) {

      let any = false;

      for (const [dr, dc] of DIRS) {

        if (!king && dr !== -color) continue;

        let r = row(pos) + dr;
        let c = col(pos) + dc;

        if (king) while (inb(r, c) && b[r * 8 + c] === 0) { r += dr; c += dc; }

        if (!inb(r, c)) continue;

        const v = b[r * 8 + c];

        if (v === 9 || v * color >= 0) continue;

        const land = [];

        let lr = r + dr;
        let lc = c + dc;

        while (inb(lr, lc) && b[lr * 8 + lc] === 0) {
          land.push(lr * 8 + lc);
          if (!king) break;
          lr += dr;
          lc += dc;
        }

        for (const L of land) {
          any = true;
          b[r * 8 + c] = 9;
          go(L, [...path, L], [...taken, r * 8 + c]);
          b[r * 8 + c] = v;
        }
      }

      if (!any && taken.length) {
        const end = path[path.length - 1];
        caps.push({ from: s, path, caps: taken, promo: !king && row(end) === promoRow(color) });
      }

    })(s, [], []);
  }

  if (caps.length) {
    const mx = Math.max(...caps.map(m => m.caps.length));
    return caps.filter(m => m.caps.length === mx);
  }

  const quiet = [];

  for (let s = 0; s < 64; s++) {

    const p = board[s];

    if (p * color <= 0) continue;

    const king = Math.abs(p) === KING;

    for (const [dr, dc] of DIRS) {

      if (!king && dr !== -color) continue;

      let r = row(s) + dr;
      let c = col(s) + dc;

      while (inb(r, c) && board[r * 8 + c] === 0) {
        quiet.push({ from: s, path: [r * 8 + c], caps: [], promo: !king && r === promoRow(color) });
        if (!king) break;
        r += dr;
        c += dc;
      }
    }
  }

  return quiet;
}

{
  const key = m => `${m.from}:${m.path.join(',')}:${[...m.caps].sort((x, y) => x - y).join(',')}:${m.promo ? 1 : 0}`;

  let seed = 12345;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;

  let positions = 0;
  let mismatches = 0;
  let multi = 0;
  let kings = 0;
  let countErrors = 0;

  for (let g = 0; g < 160; g++) {

    const b = Engine.newBoard();

    let color = W;

    for (let ply = 0; ply < 140; ply++) {

      const mine = Engine.generateLegalMoves(b, color);
      const ref = refMoves(b, color);

      positions++;

      const A = new Set(mine.map(key));
      const R = new Set(ref.map(key));

      if (A.size !== R.size || [...A].some(k => !R.has(k))) mismatches++;

      if (!mine.length) break;

      const m = mine[Math.floor(rnd() * mine.length)];

      if (m.caps.length > 1) multi++;

      const enemy = b.filter(v => v * color < 0).length;

      Engine.applyMove(b, m);

      if (b.filter(v => v * color < 0).length !== enemy - m.caps.length) countErrors++;

      if (b.some(v => Math.abs(v) === KING)) kings++;

      color = -color;
    }
  }

  test(`${positions} random positions: move lists identical to the reference`, mismatches === 0, mismatches + ' mismatches');
  test('capture removal is exact in every sampled move', countErrors === 0);
  test('the sample contained multi-captures and kings', multi > 50 && kings > 50, `multi ${multi}, kings ${kings}`);
}


/* =========================================================
   COMPUTER OPPONENT
   ========================================================= */

group('Computer opponent');

{
  LEVEL_ORDER.forEach(level => {

    const saved = { ...LEVELS[level] };

    /* Shorter budgets keep the page quick; legality does not depend on them. */
    LEVELS[level].time = Math.min(LEVELS[level].time, 60);
    LEVELS[level].depth = Math.min(LEVELS[level].depth, 6);

    const b = Engine.newBoard();

    let color = W;
    let plies = 0;
    let clean = true;

    while (plies < 100) {

      const list = Engine.generateLegalMoves(b, color);

      if (!list.length) break;

      const r = Engine.findBest(b, color, list, level);

      const piece = b[r.move.from];

      if (!list.includes(r.move)) clean = false;
      if (Math.abs(piece) === MAN && !r.move.caps.length && row(r.move.path[0]) - row(r.move.from) !== -color) clean = false;
      if (list[0].caps.length && !r.move.caps.length) clean = false;

      Engine.applyMove(b, r.move);

      color = -color;
      plies++;
    }

    Object.assign(LEVELS[level], saved);

    test(`${LEVELS[level].label}: ${plies} plies of self-play, every move legal and captures obeyed`, clean && plies > 8);
  });

  const b = place([[4, 3, W], [3, 4, B], [0, 1, B]]);
  const only = Engine.generateLegalMoves(b, W);
  const r = Engine.findBest(b, W, only, 'master');
  test('a forced capture is played at every level', r.move.caps.length === 1 && only.length === 1);

  const win = place([[2, 1, W], [1, 2, B], [0, 5, B], [5, 4, B]]);
  const wm = Engine.generateLegalMoves(win, W);
  const wr = Engine.findBest(win, W, wm, 'competitive');
  test('the search takes a free capture that also promotes', wr.move.promo && wr.move.caps.length === 1);

  test('old level names are migrated', normLevel('easy') === 'beginner' && normLevel('medium') === 'casual' && normLevel('hard') === 'competitive' && normLevel('zzz') === 'casual');

  const start = Engine.newBoard();
  const list = Engine.generateLegalMoves(start, W);
  const an = Engine.analyze(start, W, list, 3, 0);
  const ex = Engine.explain(start, W, list, an.list[0].move, an);
  test('"Why this move?" produces text from the position', ex.lines.length >= 1 && ex.lines.every(l => typeof l === 'string' && l.length > 10));
}


/* =========================================================
   SETTINGS MIGRATION
   ========================================================= */

group('Settings');

{
  test('old boolean anim=false becomes animation Off', migrateSettings({ anim: false }).animMode === 'off');
  test('old difficulty names are migrated', migrateSettings({ diff: 'hard' }).diff === 'competitive');
  test('invalid values fall back to defaults', migrateSettings({ animMode: 'x', theme: 'neon' }).animMode === 'cinematic' && migrateSettings({ theme: 'neon' }).theme === 'dark');
  test('missing settings object gives defaults', migrateSettings(null).sound === true);
}


/* =========================================================
   PROFILE: RATING, RECORDS, ACHIEVEMENTS
   ========================================================= */

group('Rating and records');

const freshProfile = () => { store.memory = {}; Profile.load(); return Profile; };

{
  let p = freshProfile();

  test('new profile starts at 1000', p.data.rating === 1000);

  let r = p.recordGame({ mode: 'cpu', level: 'casual', result: 'win', plies: 40, yourMoves: 20, lostPieces: 2, minDiff: -1, assisted: false, seconds: 100 });
  test('beating an equal-rated level gains rating (+20 while provisional)', r.delta === 20 && r.rating === 1020 && r.rated);

  p = freshProfile();
  r = p.recordGame({ mode: 'cpu', level: 'casual', result: 'loss', plies: 40, yourMoves: 20, lostPieces: 12, minDiff: -12, assisted: false, seconds: 50 });
  test('losing to an equal-rated level loses rating', r.delta === -20 && r.rating === 980);

  p = freshProfile();
  r = p.recordGame({ mode: 'cpu', level: 'master', result: 'win', plies: 60, yourMoves: 30, lostPieces: 4, minDiff: -2, assisted: false, seconds: 200 });
  test('beating a much stronger level gains more', r.delta > 30);

  p = freshProfile();
  r = p.recordGame({ mode: 'cpu', level: 'beginner', result: 'win', plies: 30, yourMoves: 15, lostPieces: 0, minDiff: 0, assisted: false, seconds: 60 });
  test('beating a much weaker level gains little', r.delta < 10);

  p = freshProfile();
  r = p.recordGame({ mode: 'cpu', level: 'casual', result: 'win', plies: 30, yourMoves: 15, lostPieces: 0, minDiff: 0, assisted: true, seconds: 60 });
  test('games with undo or hints are unrated', !r.rated && r.delta === 0 && p.data.rating === 1000);

  p = freshProfile();
  r = p.recordGame({ mode: 'cpu', level: 'casual', result: 'win', plies: 30, yourMoves: 15, lostPieces: 0, minDiff: 0, assisted: false, seconds: 60, daily: true });
  test('Daily Crown games are unrated', !r.rated && p.data.rating === 1000);

  p = freshProfile();
  p.data.rating = 100;
  p.recordGame({ mode: 'cpu', level: 'master', result: 'loss', plies: 30, yourMoves: 15, lostPieces: 12, minDiff: -12, assisted: false, seconds: 60 });
  test('rating never drops below 100', p.data.rating >= 100);

  p = freshProfile();
  p.recordGame({ mode: 'local', result: 'white', plies: 30, yourMoves: 15, lostPieces: 0, minDiff: 0, assisted: false, seconds: 60 });
  test('local games are counted but never rated', p.data.rating === 1000 && p.data.stats.local.white === 1);

  p = freshProfile();
  p.recordGame({ mode: 'cpu', level: 'casual', result: 'win', plies: 30, yourMoves: 18, lostPieces: 0, minDiff: 0, assisted: false, seconds: 60 });
  p.recordGame({ mode: 'cpu', level: 'casual', result: 'win', plies: 30, yourMoves: 12, lostPieces: 0, minDiff: 0, assisted: false, seconds: 60 });
  p.recordMove({ chain: 4, promo: false, kings: 1 });
  test('records: fastest win, win streak, biggest chain', p.data.records.fastest.casual === 12 && p.data.records.winStreak === 2 && p.data.records.bestChain === 4);
  p.recordGame({ mode: 'cpu', level: 'casual', result: 'loss', plies: 30, yourMoves: 15, lostPieces: 12, minDiff: -12, assisted: false, seconds: 60 });
  test('a loss resets the current win streak but keeps the best', p.data.records.winStreak === 0 && p.data.records.bestWinStreak === 2);
}

group('Achievements');

{
  let p = freshProfile();

  let u = p.recordMove({ chain: 1, promo: true, kings: 1 });
  test('Coronation on first promotion', u.includes('coronation'));

  u = p.recordMove({ chain: 3, promo: false, kings: 1 });
  test('Triple Strike on a 3-piece capture', u.includes('triple'));

  u = p.recordMove({ chain: 3, promo: false, kings: 1 });
  test('an achievement unlocks only once', u.length === 0);

  p = freshProfile();
  let r = p.recordGame({ mode: 'cpu', level: 'master', result: 'win', plies: 36, yourMoves: 18, lostPieces: 0, minDiff: 0, assisted: false, seconds: 60 });
  test('First Crown, Giant Slayer, Flawless and Lightning Crown unlock together',
    ['first_win', 'slayer', 'flawless', 'blitz'].every(id => r.unlocked.includes(id)), r.unlocked.join());

  p = freshProfile();
  r = p.recordGame({ mode: 'cpu', level: 'casual', result: 'win', plies: 90, yourMoves: 45, lostPieces: 4, minDiff: -3, assisted: true, seconds: 60 });
  test('Comeback and Endurance unlock; Flawless needs an unassisted game',
    r.unlocked.includes('comeback') && r.unlocked.includes('endurance') && !r.unlocked.includes('flawless'));

  p = freshProfile();
  for (let i = 0; i < 3; i++) r = p.recordGame({ mode: 'cpu', level: 'casual', result: 'win', plies: 40, yourMoves: 22, lostPieces: 3, minDiff: -1, assisted: false, seconds: 60 });
  test('Hat Trick after three wins in a row', p.data.ach.hat_trick > 0);

  p = freshProfile();
  r = p.recordGame({ mode: 'local', result: 'white', plies: 40, yourMoves: 20, lostPieces: 0, minDiff: 0, assisted: false, seconds: 60 });
  test('local games cannot unlock win achievements', !r.unlocked.includes('first_win'));

  const list = p.achievementList();
  test('every achievement has a name, description and state', list.length >= 15 && list.every(a => a.name && a.desc && typeof a.unlocked === 'boolean'));
}

group('Profile storage');

{
  let p = freshProfile();
  p.setName('  <b>Ana</b> ');
  p.recordGame({ mode: 'cpu', level: 'casual', result: 'win', plies: 30, yourMoves: 15, lostPieces: 0, minDiff: 0, assisted: false, seconds: 60 });
  const saved = JSON.stringify(Profile.data);
  Profile.load();
  test('profile survives a reload', JSON.stringify(Profile.data) === saved);
  test('player name is sanitised', Profile.data.name === 'bAnab' || /^[\p{L}\p{N} _.-]*$/u.test(Profile.data.name), Profile.data.name);

  store.memory = { 'rd.profile': JSON.stringify({ rating: 'abc', records: { wins: -5 }, ach: { fake: 1 }, daily: { last: 'not-a-date', streak: 99 } }) };
  Profile.load();
  test('corrupt stored data is sanitised', Profile.data.rating === 1000 && Profile.data.records.wins === 0 && !Profile.data.ach.fake && Profile.data.daily.last === '');

  store.memory = { 'rd.stats': JSON.stringify({ cpu: { easy: { w: 2, l: 1, d: 0 }, hard: { w: 1, l: 0, d: 0 } }, local: { white: 3, black: 1, draw: 0 } }) };
  Profile.load();
  test('statistics from the previous version are carried over', Profile.data.stats.cpu.beginner.w === 2 && Profile.data.stats.cpu.competitive.w === 1 && Profile.data.stats.local.white === 3);
}


/* =========================================================
   DAILY CROWN
   ========================================================= */

group('Daily Crown');

{
  const a = Daily.generate('2026-10-07');
  const b = Daily.generate('2026-10-07');

  test('the same date gives the identical challenge', JSON.stringify(a) === JSON.stringify(b));

  const days = ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06'].map(k => Daily.generate(k));

  test('different dates give different positions', new Set(days.map(d => d.board.join())).size > 3);

  test('every challenge is a balanced, legal middlegame with White to move',
    days.every(d => {
      const w = d.board.filter(p => p > 0).length;
      const k = d.board.filter(p => p < 0).length;
      return w >= 8 && k >= 8 && Math.abs(w - k) <= 1 && Engine.generateLegalMoves(d.board, W).length >= 3;
    }));

  test('goals and levels are valid', days.every(d => ['win', 'crown'].includes(d.type) && LEVELS[d.level] && d.limit >= 10));

  test('date arithmetic works across month and year ends',
    Daily.shift('2026-03-01', -1) === '2026-02-28' && Daily.shift('2026-12-31', 1) === '2027-01-01' && Daily.shift('2028-03-01', -1) === '2028-02-29');

  let p = freshProfile();

  let r = p.completeDaily('2026-10-05', { moves: 20, level: 'casual' });
  test('first completion starts a streak of 1', r.streak === 1 && r.unlocked.includes('daily1'));

  r = p.completeDaily('2026-10-06', { moves: 22, level: 'casual' });
  test('the next day extends the streak', r.streak === 2);

  r = p.completeDaily('2026-10-06', { moves: 20, level: 'casual' });
  test('completing the same day twice does not count twice', r.already && p.data.daily.streak === 2);

  test('the streak is still alive the next day, gone after a missed day', p.dailyStreak('2026-10-07') === 2 && p.dailyStreak('2026-10-08') === 0);

  test('a missed day ends the streak', p.dailyStreak('2026-10-09') === 0);

  r = p.completeDaily('2026-10-09', { moves: 20, level: 'casual' });
  test('after a gap the streak restarts at 1 and the best is kept', r.streak === 1 && p.data.daily.best === 2);

  p = freshProfile();
  for (let i = 0; i < 7; i++) p.completeDaily(Daily.shift('2026-10-01', i), { moves: 20, level: 'casual' });
  test('Week of Gold after seven days', p.data.ach.week > 0);
}


/* =========================================================
   REPLAYS AND SHARING
   ========================================================= */

group('Replays and sharing');

{
  const b = Engine.newBoard();

  let color = W;

  const log = [];

  for (let i = 0; i < 60; i++) {

    const list = Engine.generateLegalMoves(b, color);

    if (!list.length) break;

    const m = list[(i * 7) % list.length];

    log.push(Replays.encodeMove(m));

    Engine.applyMove(b, m);

    color = -color;
  }

  const entry = { id: 't', log, start: null, title: 'Test game', summary: `${log.length} moves` };

  const pos = Replays.positions(entry);

  test('a stored game replays to exactly the final position', pos && pos.boards[pos.boards.length - 1].every((v, i) => v === b[i]));
  test('every position is rebuilt', pos && pos.boards.length === log.length + 1 && pos.moves.length === log.length);

  const m0 = Engine.generateLegalMoves(Engine.newBoard(), W)[0];
  const back = Replays.decodeMove(Replays.encodeMove(m0));
  test('move encoding round-trips', back.from === m0.from && back.path.join() === m0.path.join() && back.promo === m0.promo);

  test('corrupt move data is rejected', Replays.decodeMove('nonsense') === null && Replays.decodeMove('99:1:2:0') === null);
  test('corrupt replays are rejected', Replays.positions({ log: ['bad'], start: null }) === null);

  const start = place([[5, 2, W], [2, 3, B]]);
  test('a custom start position round-trips', Replays.decodeBoard(Replays.encodeBoard(start)).every((v, i) => v === start[i]));
  test('invalid board text is rejected', Replays.decodeBoard('xyz') === null);

  const text = Share.gameText(entry, 'https://example.com/crownix/');

  test('shared text names the game, the moves and the link', text.includes('Test game') && text.includes('1. ') && text.includes('https://example.com/crownix/'));

  test('shared Daily Crown text has the streak', Share.dailyText('2026-10-07', { title: 'Win in 30 moves', moves: 25 }, 3, '').includes('Streak: 3 days'));

  store.memory = {};

  for (let i = 0; i < 25; i++) Replays.add({ id: 'g' + i, log: [], title: 'x' });

  test('only the latest 20 replays are kept', Replays.list().length === 20 && Replays.list()[0].id === 'g24');

  Replays.remove('g24');

  test('a replay can be deleted', Replays.list().length === 19);
}


/* =========================================================
   SUMMARY
   ========================================================= */

{
  const summary = document.getElementById('summary');

  summary.textContent = failed ? `${failed} FAILED, ${passed} passed` : `All ${passed} tests passed`;

  summary.className = failed ? 'fail' : 'pass';

  document.title = failed ? `FAIL ${failed}` : `PASS ${passed}`;

  window.__results = { passed, failed };
}
