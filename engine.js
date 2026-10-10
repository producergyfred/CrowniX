'use strict';

/*
  CrowniX rules engine and computer opponent.

  - No DOM access: the same file is loaded by the page, by the AI Web Worker
    (new Worker('engine.js')) and by the browser test runner (tests/index.html).
  - Rules: 8x8, 12 men each, White moves first, men move AND capture forward only,
    kings fly, capture is mandatory and the longest sequence must be taken,
    captured pieces are removed only when the whole sequence ends,
    a man promotes only if its move ends on the far row.
*/

/* =========================================================
   CONSTANTS AND HELPERS
   ========================================================= */

const N = 8;
const W = 1;
const B = -1;
const MAN = 1;
const KING = 2;

const DIRS = [[-1, -1], [-1, 1], [1, -1], [1, 1]];

const KING_ONLY_LIMIT = 40;          // plies of king-only quiet moves => draw
const REPETITION_LIMIT = 3;          // same position (same side to move) => draw

const inb = (r, c) => r >= 0 && r < N && c >= 0 && c < N;
const sq = (r, c) => r * N + c;
const row = s => s >> 3;
const col = s => s & 7;
const nm = s => 'abcdefgh'[col(s)] + (N - row(s));
const promoRow = color => (color === W ? 0 : N - 1);

/* Difficulty levels. depth/time bound the search; noise and blunder make weaker levels human. */
const LEVELS = {
  beginner:    { label: 'Beginner',    depth: 1,  time: 0,    noise: 160, blunder: .30, rating: 600 },
  casual:      { label: 'Casual',      depth: 3,  time: 0,    noise: 35,  blunder: .06, rating: 1000 },
  competitive: { label: 'Competitive', depth: 10, time: 600,  noise: 0,   blunder: 0,   rating: 1500 },
  master:      { label: 'Master',      depth: 18, time: 1800, noise: 0,   blunder: 0,   rating: 2000 }
};

const LEVEL_ORDER = ['beginner', 'casual', 'competitive', 'master'];

/* Old saves used easy / medium / hard. */
const normLevel = level =>
  LEVELS[level] ? level : ({ easy: 'beginner', medium: 'casual', hard: 'competitive' })[level] || 'casual';


/* =========================================================
   ZOBRIST HASHING (position keys for repetition + transposition table)
   ========================================================= */

const ZOB = (() => {

  let x = 0x2545F491;

  const next = () => {
    x ^= x << 13; x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5; x >>>= 0;
    return x >>> 0;
  };

  const a = [];
  const b = [];

  for (let i = 0; i < 64 * 4; i++) {
    a.push(next());
    b.push(next());
  }

  return { a, b, sideA: next(), sideB: next() };
})();

const pieceIndex = p => (p < 0 ? p + 2 : p + 1);   // -2,-1,1,2 -> 0,1,2,3


/* =========================================================
   ENGINE
   ========================================================= */

const Engine = {

  /* ---------- Rules ---------- */

  newBoard() {

    const b = new Array(64).fill(0);

    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {

        if ((r + c) % 2 !== 1) {
          continue;
        }

        if (r < 3) {
          b[sq(r, c)] = B;
        } else if (r > 4) {
          b[sq(r, c)] = W;
        }
      }
    }

    return b;
  },


  /*
    Recursive capture search. Captured pieces stay on the board (blocking
    further jumps over them) until the sequence ends, so no piece is taken
    twice. Men capture forward only; kings fly and may land on any empty
    square beyond the captured piece.
  */
  captureSeq(b, origin, p, color, cur, path, caps, out) {

    const king = Math.abs(p) === KING;

    let found = false;

    for (const [dr, dc] of DIRS) {

      if (!king && dr !== -color) {
        continue;
      }

      let r = row(cur) + dr;
      let c = col(cur) + dc;

      if (king) {
        while (inb(r, c) && b[sq(r, c)] === 0) {
          r += dr;
          c += dc;
        }
      }

      if (!inb(r, c)) {
        continue;
      }

      const target = sq(r, c);

      if (b[target] * color >= 0 || caps.includes(target)) {
        continue;
      }

      let lr = r + dr;
      let lc = c + dc;

      while (inb(lr, lc) && b[sq(lr, lc)] === 0) {

        found = true;

        this.captureSeq(b, origin, p, color, sq(lr, lc), [...path, sq(lr, lc)], [...caps, target], out);

        if (!king) {
          break;
        }

        lr += dr;
        lc += dc;
      }
    }

    if (!found && caps.length) {

      const end = path[path.length - 1];

      out.push({
        from: origin,
        path,
        caps,
        promo: Math.abs(p) === MAN && row(end) === promoRow(color)
      });
    }
  },


  generateCaptures(b, color) {

    const out = [];

    for (let s = 0; s < 64; s++) {

      const p = b[s];

      if (p * color <= 0) {
        continue;
      }

      b[s] = 0;                                    // lift the piece: its origin is empty

      this.captureSeq(b, s, p, color, s, [], [], out);

      b[s] = p;
    }

    const max = out.reduce((m, x) => Math.max(m, x.caps.length), 0);

    return out.filter(m => m.caps.length === max);  // majority rule
  },


  generateSimpleMoves(b, color) {

    const out = [];

    for (let s = 0; s < 64; s++) {

      const p = b[s];

      if (p * color <= 0) {
        continue;
      }

      const king = Math.abs(p) === KING;

      for (const [dr, dc] of DIRS) {

        if (!king && dr !== -color) {
          continue;                                // men move forward only
        }

        let r = row(s) + dr;
        let c = col(s) + dc;

        while (inb(r, c) && b[sq(r, c)] === 0) {

          out.push({ from: s, path: [sq(r, c)], caps: [], promo: !king && r === promoRow(color) });

          if (!king) {
            break;                                 // men move one square, kings fly
          }

          r += dr;
          c += dc;
        }
      }
    }

    return out;
  },


  generateLegalMoves(b, color) {

    const caps = this.generateCaptures(b, color);

    return caps.length ? caps : this.generateSimpleMoves(b, color);
  },


  isCaptureAvailable(moves) {
    return moves.length > 0 && moves[0].caps.length > 0;
  },


  applyMove(b, m) {

    const p = b[m.from];

    const rec = { m, p, cp: m.caps.map(s => b[s]) };

    b[m.from] = 0;

    m.caps.forEach(s => { b[s] = 0; });

    b[m.path[m.path.length - 1]] = m.promo ? p * KING : p;

    return rec;
  },


  undoMove(b, rec) {

    const m = rec.m;

    b[m.path[m.path.length - 1]] = 0;

    m.caps.forEach((s, i) => { b[s] = rec.cp[i]; });

    b[m.from] = rec.p;
  },


  /* 53-bit position key (board + side to move). */
  hash(b, color) {

    let h1 = color === W ? ZOB.sideA : 0;
    let h2 = color === W ? ZOB.sideB : 0;

    for (let i = 0; i < 64; i++) {

      const p = b[i];

      if (p) {
        const k = i * 4 + pieceIndex(p);
        h1 ^= ZOB.a[k];
        h2 ^= ZOB.b[k];
      }
    }

    return (h1 >>> 0) * 2097152 + ((h2 >>> 0) >>> 11);
  },


  /* ---------- Evaluation (positive = good for White) ---------- */

  /*
    Returns the total score, or the per-feature breakdown when `parts` is given.
    Features: material, advancement, centre control, back-rank guard,
    king placement on the long diagonal, and a small trade bonus for the side ahead.
  */
  evaluate(b, parts) {

    let pieces = 0;
    let matW = 0;
    let matB = 0;

    for (let i = 0; i < 64; i++) {

      const p = b[i];

      if (p) {
        pieces++;
        if (p > 0) matW += Math.abs(p); else matB += Math.abs(p);
      }
    }

    const endgame = pieces <= 10;

    let material = 0;
    let advance = 0;
    let centre = 0;
    let back = 0;
    let kingPos = 0;

    for (let i = 0; i < 64; i++) {

      const p = b[i];

      if (!p) {
        continue;
      }

      const c = p > 0 ? 1 : -1;
      const r = row(i);
      const cc = col(i);

      if (Math.abs(p) === KING) {

        material += c * (endgame ? 380 : 340);

        if (r + cc === 7) {
          kingPos += c * (endgame ? 24 : 14);          // long diagonal
        }

        kingPos -= c * (Math.abs(r - 3.5) + Math.abs(cc - 3.5)) * 2;   // centralise

      } else {

        const adv = c === W ? 7 - r : r;

        material += c * 100;

        advance += c * (adv * 6 + (adv >= 5 ? (adv - 4) * 10 : 0));

        if (cc >= 2 && cc <= 5 && r >= 2 && r <= 5) {
          centre += c * 4;
        }

        if (adv === 0 && !endgame) {
          back += c * 10;                               // guards the promotion row
        }
      }
    }

    const ahead = Math.sign(matW - matB);

    const trade = ahead * (24 - pieces) * 1.5;

    if (parts) {
      return { material, advance, centre, back, kingPos, trade, total: material + advance + centre + back + kingPos + trade };
    }

    return material + advance + centre + back + kingPos + trade;
  },


  /* ---------- Search ---------- */

  tt: new Map(),
  history: new Int32Array(64 * 64),

  newSearch() {

    if (this.tt.size > 250000) {
      this.tt.clear();
    }

    this.history.fill(0);
  },


  /*
    Negamax with alpha-beta, transposition table, killer + history ordering,
    and a forced-capture extension (captures are never left hanging at the horizon).
  */
  search(b, color, depth, alpha, beta, ply, ctx) {

    ctx.nodes++;

    if ((ctx.nodes & 511) === 0 && ctx.deadline && performance.now() > ctx.deadline) {
      ctx.stop = true;
    }

    if (ctx.stop) {
      return 0;
    }

    const moves = this.generateLegalMoves(b, color);

    if (!moves.length) {
      return -MATE + ply;
    }

    if (depth <= 0 && (!moves[0].caps.length || ply >= ctx.maxPly)) {
      return color * this.evaluate(b);
    }

    const key = this.hash(b, color);

    const entry = this.tt.get(key);

    let ttMove = -1;

    if (entry) {

      ttMove = entry.move;

      if (entry.depth >= depth && depth > 0) {

        if (entry.flag === 0) return entry.value;
        if (entry.flag === 1 && entry.value > alpha) alpha = entry.value;
        if (entry.flag === 2 && entry.value < beta) beta = entry.value;
        if (alpha >= beta) return entry.value;
      }
    }

    const killers = ctx.killers[ply] || (ctx.killers[ply] = [-1, -1]);

    const scored = moves.map(m => {

      const id = m.from * 64 + m.path[m.path.length - 1];

      let s = this.history[id];

      if (id === ttMove) s += 1e7;
      if (m.promo) s += 5000;
      if (id === killers[0]) s += 3000; else if (id === killers[1]) s += 2000;

      return { m, id, s };
    });

    scored.sort((x, y) => y.s - x.s);

    const alpha0 = alpha;

    let best = -Infinity;
    let bestId = -1;

    for (const { m, id } of scored) {

      const rec = this.applyMove(b, m);

      const value = -this.search(b, -color, depth - 1, -beta, -alpha, ply + 1, ctx);

      this.undoMove(b, rec);

      if (ctx.stop) {
        return 0;
      }

      if (value > best) {
        best = value;
        bestId = id;
      }

      if (best > alpha) {
        alpha = best;
      }

      if (alpha >= beta) {

        if (!m.caps.length) {

          this.history[id] += depth * depth;

          if (killers[0] !== id) {
            killers[1] = killers[0];
            killers[0] = id;
          }
        }

        break;
      }
    }

    this.tt.set(key, {
      depth,
      value: best,
      move: bestId,
      flag: best <= alpha0 ? 2 : best >= beta ? 1 : 0       // 0 exact, 1 lower bound, 2 upper bound
    });

    return best;
  },


  /* Scores every root move exactly (full window) - used for hints, explanations and weak levels. */
  scoreAll(b, color, moves, depth, timeMs) {

    const ctx = { nodes: 0, stop: false, killers: [], maxPly: depth + 8, deadline: timeMs ? performance.now() + timeMs : 0 };

    const list = [];

    for (const m of moves) {

      const rec = this.applyMove(b, m);

      const value = -this.search(b, -color, depth - 1, -MATE * 2, MATE * 2, 1, ctx);

      this.undoMove(b, rec);

      if (ctx.stop) {
        return null;
      }

      list.push({ move: m, score: value });
    }

    return { list, nodes: ctx.nodes };
  },


  /*
    Picks a move for the computer. Always returns one of the supplied legal moves.
    beginner/casual: shallow exact search plus noise (and occasional slips).
    competitive/master: iterative deepening with a time budget.
  */
  findBest(board, color, moves, levelName) {

    const level = LEVELS[normLevel(levelName)];

    if (!moves.length) {
      return null;
    }

    if (moves.length === 1) {
      return { move: moves[0], score: 0, depth: 0, nodes: 0, forced: true };
    }

    const b = board.slice();

    this.newSearch();

    if (level.blunder && Math.random() < level.blunder) {

      /* A human-like slip: still a legal move, picked at random. */
      return { move: moves[Math.floor(Math.random() * moves.length)], score: 0, depth: 0, nodes: 0, slip: true };
    }

    if (level.noise) {

      const all = this.scoreAll(b, color, moves, level.depth, 0);

      let best = all.list[0];
      let bestValue = -Infinity;

      all.list.forEach(entry => {

        const v = entry.score + Math.random() * level.noise;

        if (v > bestValue) {
          bestValue = v;
          best = entry;
        }
      });

      return { move: best.move, score: best.score, depth: level.depth, nodes: all.nodes };
    }

    const ctx = { nodes: 0, stop: false, killers: [], maxPly: 0, deadline: performance.now() + level.time };

    let ordered = moves.slice();
    let best = moves[0];
    let bestScore = 0;
    let doneDepth = 0;

    for (let depth = 1; depth <= level.depth; depth++) {

      ctx.maxPly = depth + 8;

      let alpha = -MATE * 2;
      let iterBest = null;

      for (const m of ordered) {

        const rec = this.applyMove(b, m);

        const value = -this.search(b, -color, depth - 1, -MATE * 2, -alpha, 1, ctx);

        this.undoMove(b, rec);

        if (ctx.stop) {
          break;
        }

        if (value > alpha) {
          alpha = value;
          iterBest = m;
        }
      }

      if (iterBest) {

        best = iterBest;
        bestScore = alpha;

        if (!ctx.stop) {
          doneDepth = depth;
        }

        ordered = [best, ...ordered.filter(m => m !== best)];
      }

      if (ctx.stop || Math.abs(alpha) > MATE - 200) {
        break;                                       // out of time, or a forced result was found
      }
    }

    return { move: best, score: bestScore, depth: doneDepth, nodes: ctx.nodes };
  },


  /* Exact scores for every legal move, best first. Used by Hint and "Why this move?". */
  analyze(board, color, moves, depth, timeMs) {

    const b = board.slice();

    this.newSearch();

    let result = null;
    let used = 0;

    for (let d = 2; d <= depth; d++) {

      const r = this.scoreAll(b, color, moves, d, timeMs);

      if (!r) {
        break;
      }

      result = r;
      used = d;
    }

    if (!result) {
      result = this.scoreAll(b, color, moves, 1, 0);
      used = 1;
    }

    result.list.sort((x, y) => y.score - x.score);

    return { list: result.list, depth: used };
  },


  /*
    "Why this move?" - every sentence is derived from the actual position:
    rules (forced / mandatory capture), tactical facts found by the move generator,
    the search scores and the evaluation features that really changed.
  */
  explain(board, color, moves, move, analysis) {

    const lines = [];

    const end = move.path[move.path.length - 1];

    const text = `${nm(move.from)} to ${move.path.map(nm).join(' then ')}`;

    if (moves.length === 1) {
      lines.push('The only legal move.');
    } else if (move.caps.length) {
      lines.push(`Forced: the longest capture (${move.caps.length}).`);
    }

    if (move.promo) {
      lines.push('Promotes to a flying king.');
    }

    /* Safety after the move, from the move generator. */
    const after = board.slice();

    this.applyMove(after, move);

    const replies = this.generateLegalMoves(after, -color);

    if (replies.length === 0) {
      lines.push('Leaves no legal reply.');
    } else if (this.isCaptureAvailable(replies)) {

      const n = replies[0].caps.length;

      lines.push(`Allows a recapture of ${n}, yet still scores best.`);

    } else if (!move.caps.length) {
      lines.push('Safe: nothing can be captured next.');
    }

    /* Evaluation features that improved for the mover. */
    if (moves.length > 1 && !move.caps.length) {

      const a = this.evaluate(board, true);
      const z = this.evaluate(after, true);

      const gains = [
        ['advance', 'Advances toward promotion.'],
        ['centre', 'Controls the centre.'],
        ['kingPos', 'Improves king placement.'],
        ['back', 'Guards the back row.']
      ].map(([k, label]) => ({ label, d: color * (z[k] - a[k]) }))
        .filter(x => x.d > 0)
        .sort((x, y) => y.d - x.d);

      if (gains.length) {
        lines.push(gains[0].label);
      }
    }

    /* Search margin. */
    if (analysis && analysis.list.length > 1) {

      const mine = analysis.list.find(x => x.move === move) || analysis.list[0];

      const others = analysis.list.filter(x => x !== mine);

      const top = others.reduce((m, x) => (x.score > m.score ? x : m), others[0]);

      const fmt = v => (v > 0 ? '+' : '') + (v / 100).toFixed(1);

      if (top.score > mine.score + 10) {

        lines.push(
          `Not the strongest: depth ${analysis.depth} scores it ${fmt(mine.score)}, ` +
          `${nm(top.move.from)} to ${top.move.path.map(nm).join(' then ')} scores ${fmt(top.score)}.`
        );

      } else if (mine.score > MATE - 200) {

        lines.push(`Forced win within ${MATE - mine.score} plies.`);

      } else if (mine.score < -MATE + 200) {

        lines.push('Every move loses; this resists longest.');

      } else {

        lines.push(`Depth ${analysis.depth}: ${fmt(mine.score)} vs ${fmt(top.score)} for the next best.`);
      }
    }

    return { title: text, lines };
  }
};

const MATE = 100000;


/* =========================================================
   WEB WORKER ENTRY
   (only active when this file is loaded with new Worker('engine.js'))
   ========================================================= */

if (
  typeof document === 'undefined' &&
  typeof importScripts === 'function' &&
  typeof self !== 'undefined'
) {

  self.onmessage = event => {

    const d = event.data;

    try {

      const moves = Engine.generateLegalMoves(d.board, d.color);

      if (d.cmd === 'pick') {

        const r = Engine.findBest(d.board, d.color, moves, d.level);

        self.postMessage({ id: d.id, index: moves.indexOf(r.move), score: r.score, depth: r.depth, nodes: r.nodes });

      } else if (d.cmd === 'analyze') {

        const r = Engine.analyze(d.board, d.color, moves, d.depth, d.time);

        self.postMessage({ id: d.id, depth: r.depth, list: r.list.map(x => ({ index: moves.indexOf(x.move), score: x.score })) });
      }

    } catch (error) {

      self.postMessage({ id: d.id, error: String(error) });
    }
  };
}
