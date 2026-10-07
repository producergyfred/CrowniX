'use strict';

/*
  CrowniX local profile: everything lives on this device (localStorage).
  There is no account, no server and no online ranking. The rating is an
  Elo-style number measured only against the built-in computer levels.

  No DOM access here, so the logic can be unit-tested (tests/index.html).
*/

const KEY_PROFILE = 'rd.profile';
const KEY_REPLAYS = 'rd.replays';
const KEY_OLD_STATS = 'rd.stats';          // statistics from the previous version
const MAX_REPLAYS = 20;

const num = (v, min = 0) => Math.max(min, Math.floor(+v || 0));


/* =========================================================
   ACHIEVEMENTS
   ========================================================= */

/*
  ev: the event that can unlock it ('move' | 'game' | 'daily').
  ok(data, event): true when the condition is met.
  progress(data): [current, goal] for the locked list (optional).
*/
const ACHIEVEMENTS = [
  { id: 'first_win', name: 'First Crown', desc: 'Win a game.', ev: 'game',
    ok: (d, e) => e.result === 'win' },
  { id: 'coronation', name: 'Coronation', desc: 'Promote a man to a king.', ev: 'move',
    ok: (d, e) => e.promo },
  { id: 'triple', name: 'Triple Strike', desc: 'Capture 3 or more pieces in one move.', ev: 'move',
    ok: (d, e) => e.chain >= 3 },
  { id: 'sweep', name: 'Royal Sweep', desc: 'Capture 5 or more pieces in one move.', ev: 'move',
    ok: (d, e) => e.chain >= 5 },
  { id: 'three_kings', name: 'Three Kings', desc: 'Have three kings on the board at once.', ev: 'move',
    ok: (d, e) => e.kings >= 3 },
  { id: 'veteran', name: 'Veteran', desc: 'Win 10 games.', ev: 'game',
    ok: d => d.records.wins >= 10, progress: d => [d.records.wins, 10] },
  { id: 'slayer', name: 'Giant Slayer', desc: 'Beat the Master level.', ev: 'game',
    ok: (d, e) => e.mode === 'cpu' && e.result === 'win' && e.level === 'master' },
  { id: 'flawless', name: 'Flawless', desc: 'Beat the computer without losing a piece, undo or hint.', ev: 'game',
    ok: (d, e) => e.mode === 'cpu' && e.result === 'win' && e.lostPieces === 0 && !e.assisted },
  { id: 'blitz', name: 'Lightning Crown', desc: 'Win in 20 of your moves or fewer.', ev: 'game',
    ok: (d, e) => e.result === 'win' && e.yourMoves <= 20 },
  { id: 'comeback', name: 'Comeback', desc: 'Win after trailing by 3 or more pieces.', ev: 'game',
    ok: (d, e) => e.result === 'win' && e.minDiff <= -3 },
  { id: 'hat_trick', name: 'Hat Trick', desc: 'Win 3 games against the computer in a row.', ev: 'game',
    ok: d => d.records.winStreak >= 3, progress: d => [Math.min(3, d.records.winStreak), 3] },
  { id: 'endurance', name: 'Endurance', desc: 'Play a game of 80 moves or more.', ev: 'game',
    ok: (d, e) => e.plies >= 80 },
  { id: 'stalwart', name: 'Stalwart', desc: 'Draw against Competitive or Master.', ev: 'game',
    ok: (d, e) => e.mode === 'cpu' && e.result === 'draw' && (e.level === 'competitive' || e.level === 'master') },
  { id: 'rising', name: 'Rising Star', desc: 'Reach a rating of 1200.', ev: 'game',
    ok: d => d.rating >= 1200, progress: d => [Math.min(1200, d.rating), 1200] },
  { id: 'contender', name: 'Contender', desc: 'Reach a rating of 1500.', ev: 'game',
    ok: d => d.rating >= 1500, progress: d => [Math.min(1500, d.rating), 1500] },
  { id: 'daily1', name: 'Daily Devotion', desc: 'Complete a Daily Crown.', ev: 'daily',
    ok: () => true },
  { id: 'week', name: 'Week of Gold', desc: 'Reach a 7-day Daily Crown streak.', ev: 'daily',
    ok: d => d.daily.streak >= 7, progress: d => [Math.min(7, d.daily.streak), 7] }
];


/* =========================================================
   PROFILE DATA
   ========================================================= */

const blankProfile = () => ({
  v: 2,
  name: 'Player',
  created: Date.now(),
  rating: 1000,
  peak: 1000,
  rated: 0,                                    // number of rated games
  stats: {
    cpu: {
      beginner: { w: 0, l: 0, d: 0 },
      casual: { w: 0, l: 0, d: 0 },
      competitive: { w: 0, l: 0, d: 0 },
      master: { w: 0, l: 0, d: 0 }
    },
    local: { white: 0, black: 0, draw: 0 }
  },
  records: {
    games: 0,
    wins: 0,
    longest: 0,                                // longest game, in plies
    fastest: {},                               // level -> fewest of your moves in a win
    bestChain: 0,                              // most pieces captured in one move
    mostKings: 0,
    winStreak: 0,
    bestWinStreak: 0,
    playSec: 0
  },
  ach: {},                                     // id -> unlock time
  daily: { last: '', streak: 0, best: 0, done: {} }
});


const Profile = {

  data: blankProfile(),


  /* Loads and sanitises stored data; migrates the old statistics once. */
  load() {

    const base = blankProfile();

    const s = store.get(KEY_PROFILE);

    if (s && typeof s === 'object') {

      base.name = typeof s.name === 'string' ? s.name.slice(0, 16) || 'Player' : 'Player';
      base.created = num(s.created, 1) || base.created;
      const stored = Math.floor(+s.rating);

      base.rating = Number.isFinite(stored) ? Math.max(100, stored) : 1000;
      base.peak = Math.max(base.rating, num(s.peak));
      base.rated = num(s.rated);

      LEVEL_ORDER.forEach(l => {
        ['w', 'l', 'd'].forEach(k => {
          base.stats.cpu[l][k] = num(((s.stats || {}).cpu || {})[l] && s.stats.cpu[l][k]);
        });
      });

      ['white', 'black', 'draw'].forEach(k => {
        base.stats.local[k] = num(((s.stats || {}).local || {})[k]);
      });

      const r = s.records || {};

      ['games', 'wins', 'longest', 'bestChain', 'mostKings', 'winStreak', 'bestWinStreak', 'playSec']
        .forEach(k => { base.records[k] = num(r[k]); });

      LEVEL_ORDER.forEach(l => {
        const v = num((r.fastest || {})[l]);
        if (v) base.records.fastest[l] = v;
      });

      Object.keys(s.ach || {}).forEach(id => {
        if (ACHIEVEMENTS.some(a => a.id === id)) base.ach[id] = num(s.ach[id], 1);
      });

      const d = s.daily || {};

      base.daily.last = /^\d{4}-\d{2}-\d{2}$/.test(d.last) ? d.last : '';
      base.daily.streak = num(d.streak);
      base.daily.best = Math.max(base.daily.streak, num(d.best));

      Object.keys(d.done || {}).slice(-60).forEach(k => {
        if (/^\d{4}-\d{2}-\d{2}$/.test(k)) base.daily.done[k] = { moves: num(d.done[k].moves), level: normLevel(d.done[k].level) };
      });

    } else {

      /* First run of this version: carry over the old per-level statistics. */
      const old = store.get(KEY_OLD_STATS);

      if (old && old.cpu) {

        const map = { easy: 'beginner', medium: 'casual', hard: 'competitive' };

        Object.keys(map).forEach(o => {
          ['w', 'l', 'd'].forEach(k => { base.stats.cpu[map[o]][k] = num((old.cpu[o] || {})[k]); });
        });

        base.records.games = Object.keys(map).reduce((n, o) => n + num((old.cpu[o] || {}).w) + num((old.cpu[o] || {}).l) + num((old.cpu[o] || {}).d), 0);
        base.records.wins = Object.keys(map).reduce((n, o) => n + num((old.cpu[o] || {}).w), 0);
      }

      if (old && old.local) {
        ['white', 'black', 'draw'].forEach(k => { base.stats.local[k] = num(old.local[k]); });
      }
    }

    this.data = base;

    return base;
  },


  save() {
    store.put(KEY_PROFILE, this.data);
  },


  reset() {
    this.data = blankProfile();
    this.save();
    store.del(KEY_REPLAYS);
  },


  setName(name) {

    const clean = String(name || '').replace(/[^\p{L}\p{N} _.-]/gu, '').trim().slice(0, 16);

    this.data.name = clean || 'Player';

    this.save();

    return this.data.name;
  },


  /* ---------- Elo-style rating ---------- */

  expected(rating, opponent) {
    return 1 / (1 + Math.pow(10, (opponent - rating) / 400));
  },


  /* score: 1 win, .5 draw, 0 loss. Returns the rating change. */
  applyRating(score, opponent) {

    const d = this.data;

    const k = d.rated < 20 ? 40 : 24;                 // faster while the rating is provisional

    const delta = Math.round(k * (score - this.expected(d.rating, opponent)));

    d.rating = Math.max(100, d.rating + delta);

    d.peak = Math.max(d.peak, d.rating);

    d.rated++;

    return delta;
  },


  /* ---------- Achievements ---------- */

  check(ev, info) {

    const unlocked = [];

    ACHIEVEMENTS.forEach(a => {

      if (a.ev !== ev || this.data.ach[a.id]) {
        return;
      }

      if (a.ok(this.data, info || {})) {
        this.data.ach[a.id] = Date.now();
        unlocked.push(a.id);
      }
    });

    return unlocked;
  },


  achievementList() {

    return ACHIEVEMENTS.map(a => ({
      id: a.id,
      name: a.name,
      desc: a.desc,
      unlocked: !!this.data.ach[a.id],
      at: this.data.ach[a.id] || 0,
      progress: a.progress ? a.progress(this.data) : null
    }));
  },


  /* ---------- Events from the game ---------- */

  /* info: { chain, promo, kings } for one move of the human player. */
  recordMove(info) {

    const r = this.data.records;

    r.bestChain = Math.max(r.bestChain, info.chain || 0);
    r.mostKings = Math.max(r.mostKings, info.kings || 0);

    const unlocked = this.check('move', info);

    this.save();

    return unlocked;
  },


  /*
    sum: { mode: 'cpu'|'local', level, result: 'win'|'loss'|'draw' (cpu) or 'white'|'black'|'draw' (local),
           plies, yourMoves, lostPieces, minDiff, assisted, seconds, daily }
    Returns { delta, rating, rated, unlocked }.
  */
  recordGame(sum) {

    const d = this.data;

    const r = d.records;

    let delta = 0;
    let rated = false;

    r.games++;
    r.playSec += num(sum.seconds);
    r.longest = Math.max(r.longest, num(sum.plies));

    if (sum.mode === 'cpu') {

      const level = normLevel(sum.level);

      const row = d.stats.cpu[level];

      if (sum.result === 'win') {

        row.w++;
        r.wins++;
        r.winStreak++;
        r.bestWinStreak = Math.max(r.bestWinStreak, r.winStreak);

        if (!r.fastest[level] || sum.yourMoves < r.fastest[level]) {
          r.fastest[level] = sum.yourMoves;
        }

      } else if (sum.result === 'loss') {

        row.l++;
        r.winStreak = 0;

      } else {

        row.d++;
        r.winStreak = 0;
      }

      /* Only unassisted games from the standard start are rated. */
      if (!sum.assisted && !sum.daily) {

        const score = sum.result === 'win' ? 1 : sum.result === 'draw' ? .5 : 0;

        delta = this.applyRating(score, LEVELS[level].rating);

        rated = true;
      }

    } else {

      if (sum.result === 'white') d.stats.local.white++;
      else if (sum.result === 'black') d.stats.local.black++;
      else d.stats.local.draw++;
    }

    const unlocked = this.check('game', {
      ...sum,
      result: sum.mode === 'cpu' ? sum.result : 'local'
    });

    this.save();

    return { delta, rating: d.rating, rated, unlocked };
  },


  /* ---------- Daily Crown ---------- */

  /* Current streak: still alive if the last completion was today or yesterday. */
  dailyStreak(todayKey) {

    const d = this.data.daily;

    if (d.last === todayKey || d.last === Daily.shift(todayKey, -1)) {
      return d.streak;
    }

    return 0;
  },


  dailyDone(key) {
    return !!this.data.daily.done[key];
  },


  completeDaily(key, info) {

    const d = this.data.daily;

    if (d.done[key]) {
      return { streak: this.dailyStreak(key), unlocked: [], already: true };
    }

    d.streak = d.last === Daily.shift(key, -1) ? d.streak + 1 : 1;
    d.best = Math.max(d.best, d.streak);
    d.last = key;
    d.done[key] = { moves: num(info.moves), level: normLevel(info.level) };

    const keys = Object.keys(d.done).sort();

    keys.slice(0, Math.max(0, keys.length - 60)).forEach(k => { delete d.done[k]; });

    const unlocked = this.check('daily', {});

    this.save();

    return { streak: d.streak, unlocked, already: false };
  }
};


/* =========================================================
   DAILY CROWN (deterministic from the date, no network)
   ========================================================= */

const Daily = {

  /* Local calendar date as YYYY-MM-DD. */
  key(date = new Date()) {

    const p = n => String(n).padStart(2, '0');

    return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
  },


  shift(key, days) {

    const [y, m, d] = key.split('-').map(Number);

    return this.key(new Date(y, m - 1, d + days));
  },


  hashStr(s) {

    let h = 2166136261;

    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }

    return h >>> 0;
  },


  rng(seed) {

    let a = seed >>> 0;

    return () => {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  },


  /*
    The same date always gives the same challenge on every device:
    a balanced middlegame position with White to move and one of two goals.
  */
  generate(key) {

    const rnd = this.rng(this.hashStr('crownix-daily-' + key));

    let board = Engine.newBoard();

    for (let attempt = 0; attempt < 80; attempt++) {

      const b = Engine.newBoard();

      let color = W;

      const plies = 8 + 2 * Math.floor(rnd() * 6);

      for (let i = 0; i < plies; i++) {

        const ms = Engine.generateLegalMoves(b, color);

        if (!ms.length) break;

        Engine.applyMove(b, ms[Math.floor(rnd() * ms.length)]);

        color = -color;
      }

      const wc = b.filter(p => p > 0).length;
      const bc = b.filter(p => p < 0).length;

      if (
        color === W &&
        wc >= 8 && bc >= 8 &&
        Math.abs(wc - bc) <= 1 &&
        Engine.generateLegalMoves(b, W).length >= 3 &&
        Math.abs(Engine.evaluate(b)) <= 150
      ) {
        board = b;
        break;
      }
    }

    const type = ['win', 'crown', 'win'][Math.floor(rnd() * 3)];

    const level = type === 'win' && rnd() < .35 ? 'competitive' : 'casual';

    const limit = type === 'win' ? 30 + Math.floor(rnd() * 16) : 10 + Math.floor(rnd() * 6);

    return {
      key,
      type,
      level,
      limit,
      board,
      title: type === 'win' ? `Win in ${limit} moves` : `Crown a king in ${limit} moves`,
      desc: type === 'win'
        ? `Beat the ${LEVELS[level].label} computer from this position within ${limit} of your moves.`
        : `Promote one of your men to a king within ${limit} of your moves.`
    };
  }
};


/* =========================================================
   REPLAYS AND SHARING
   ========================================================= */

const Replays = {

  /* A move is stored as "from:p1.p2:c1.c2:k". */
  encodeMove(m) {
    return `${m.from}:${m.path.join('.')}:${m.caps.join('.')}:${m.promo ? 1 : 0}`;
  },


  decodeMove(str) {

    const [from, path, caps, k] = String(str).split(':');

    const list = s => (s ? s.split('.').map(Number) : []);

    const m = { from: +from, path: list(path), caps: list(caps), promo: k === '1' };

    const ok = n => Number.isInteger(n) && n >= 0 && n < 64;

    if (!ok(m.from) || !m.path.length || !m.path.every(ok) || !m.caps.every(ok)) {
      return null;
    }

    return m;
  },


  encodeBoard(b) {
    return b.map(p => ({ '0': '.', '1': 'w', '2': 'W', '-1': 'b', '-2': 'B' })[p]).join('');
  },


  decodeBoard(s) {

    if (typeof s !== 'string' || s.length !== 64) {
      return null;
    }

    const out = [...s].map(c => ({ '.': 0, w: 1, W: 2, b: -1, B: -2 })[c]);

    return out.every(v => v !== undefined) ? out : null;
  },


  list() {

    const l = store.get(KEY_REPLAYS);

    return Array.isArray(l) ? l.filter(e => e && Array.isArray(e.log)) : [];
  },


  add(entry) {

    const l = this.list();

    l.unshift(entry);

    store.put(KEY_REPLAYS, l.slice(0, MAX_REPLAYS));
  },


  remove(id) {
    store.put(KEY_REPLAYS, this.list().filter(e => e.id !== id));
  },


  /* Rebuilds every position of a game: boards[0] is the start, boards[i] is after move i. */
  positions(entry) {

    const start = entry.start ? this.decodeBoard(entry.start) : Engine.newBoard();

    if (!start) {
      return null;
    }

    const b = start.slice();

    const boards = [start.slice()];
    const moves = [];

    for (const s of entry.log) {

      const m = this.decodeMove(s);

      if (!m) {
        return null;
      }

      Engine.applyMove(b, m);

      boards.push(b.slice());
      moves.push(m);
    }

    return { boards, moves };
  },


  /* Readable move text: c3-d4 or c3xe5xg7. */
  notation(m) {
    return nm(m.from) + (m.caps.length ? 'x' : '-') + m.path.map(nm).join('x');
  }
};


const Share = {

  gameText(entry, url) {

    const moves = entry.log.map(s => Replays.decodeMove(s)).filter(Boolean);

    const pairs = [];

    for (let i = 0; i < moves.length; i += 2) {
      pairs.push(`${i / 2 + 1}. ${Replays.notation(moves[i])}${moves[i + 1] ? ' ' + Replays.notation(moves[i + 1]) : ''}`);
    }

    let movesText = pairs.join(' ');

    if (movesText.length > 700) {
      movesText = movesText.slice(0, 700).replace(/\s\S*$/, '') + ' ...';
    }

    return [
      `CrowniX - ${entry.title}`,
      entry.summary,
      `Moves: ${movesText || '(none)'}`,
      url ? `Play: ${url}` : ''
    ].filter(Boolean).join('\n');
  },


  dailyText(key, info, streak, url) {

    return [
      `CrowniX Daily Crown ${key}`,
      `${info.title}: completed in ${info.moves} moves.`,
      `Streak: ${streak} day${streak === 1 ? '' : 's'}.`,
      url ? `Play: ${url}` : ''
    ].filter(Boolean).join('\n');
  }
};
