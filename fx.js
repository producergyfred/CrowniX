'use strict';

/* =========================================================
   MOVE ANIMATION AND CAPTURE EFFECTS
   ========================================================= */

/*
  The game state is always updated first and is authoritative.
  Everything below is purely visual/audio and is scheduled
  with timers that are cancelled (fxToken) on undo / new game.
*/

const PIECE_SCALE = 100 / 84;          // cell size / piece size (piece = 84% of a cell)
const EASE = [.4, .05, .2, 1];         // glide easing (cubic-bezier)

let doAnim = false;                    // true only while rendering a freshly played move
let animUntil = 0;                     // time when the current glide ends
let fxToken = 0;                       // invalidates pending effects


/* Animation speed: 'cinematic' (default), 'fast' or 'off'. Reduced-motion always wins. */
const ANIM_SPEED = { cinematic: 1, fast: .5 };

const canAnimate = () =>
  set.animMode !== 'off' &&
  !(
    window.matchMedia &&
    window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    ).matches
  );


const dist = (a, b) =>
  Math.max(
    Math.abs(row(a) - row(b)),
    Math.abs(col(a) - col(b))
  );


/* Length (in squares) of every leg of a move. */
function legLens(m) {

  const pts = [m.from, ...m.path];

  return m.path.map(
    (s, i) => dist(pts[i], s)
  );
}


/*
  Cinematic: normal move about 0.85 - 1.0 s, capture about 0.95 - 1.1 s per jump.
  Fast: half of that.
*/
function glideMs(m) {

  if (!canAnimate()) {
    return 0;
  }

  const lens = legLens(m);

  const extra =
    lens.reduce((x, y) => x + y, 0) -
    lens.length;

  const speed = ANIM_SPEED[set.animMode] || 1;

  const base =
    m.caps.length
      ? Math.min(2800, 950 + 520 * (lens.length - 1) + 30 * extra)
      : Math.min(1000, 850 + 30 * extra);

  return Math.round(base * speed);
}


const bez = (t, p1, p2) =>
  3 * (1 - t) * (1 - t) * t * p1 +
  3 * (1 - t) * t * t * p2 +
  t * t * t;


/* Fraction of the glide duration at which a given path progress is reached. */
function timeAtProgress(p) {

  let lo = 0;
  let hi = 1;

  for (let i = 0; i < 24; i++) {

    const t = (lo + hi) / 2;

    if (bez(t, EASE[1], EASE[3]) < p) {
      lo = t;
    } else {
      hi = t;
    }
  }

  return bez((lo + hi) / 2, EASE[0], EASE[2]);
}


/* Milliseconds after the move starts when the sliding disk touches captured piece i. */
function impactMs(m, i) {

  const lens = legLens(m);

  const total = lens.reduce((x, y) => x + y, 0);

  const pts = [m.from, ...m.path];

  let before = 0;

  for (let j = 0; j < i; j++) {
    before += lens[j];
  }

  const reach = Math.max(
    .05,
    dist(pts[i], m.caps[i]) - .8
  );

  return glideMs(m) *
    timeAtProgress(Math.min(1, (before + reach) / total));
}


/* Slide the disk from its origin through every landing square. */
function glide(el, m) {

  if (!el || !el.animate) {
    return;
  }

  const pts = [m.from, ...m.path];

  const end = pts[pts.length - 1];

  const lens = legLens(m);

  const total = lens.reduce((x, y) => x + y, 0);

  const k = PIECE_SCALE * 100;

  const at = s =>
    `translate(${(col(s) - col(end)) * k}%,${(row(s) - row(end)) * k}%)`;

  let cum = 0;

  const frames = [{ transform: at(pts[0]), offset: 0 }];

  lens.forEach(
    (len, i) => {

      cum += len;

      frames.push({
        transform: at(pts[i + 1]),
        offset: cum / total
      });
    }
  );

  el.style.zIndex = 6;

  const animation = el.animate(
    frames,
    {
      duration: glideMs(m),
      easing: `cubic-bezier(${EASE.join(',')})`
    }
  );

  animation.oncancel = () => {
    el.style.zIndex = '';
  };

  animation.onfinish = () => {

    el.style.zIndex = '';

    /* Promotion: the crown appears when the disk settles. */
    if (
      m.promo &&
      el.isConnected &&
      !el.classList.contains('k')
    ) {

      el.classList.add('k', 'crown');

      el.insertAdjacentHTML(
        'beforeend',
        kingIcon()
      );
    }
  };
}


/* The captured disk fades away at the moment of impact. */
function fadeOut(old, m, index) {

  old.className = old.className.replace(/ (sel|must)/g, '');

  old.style.zIndex = 3;

  const animation = old.animate(
    [
      { opacity: 1, transform: 'scale(1)' },
      { opacity: 0, transform: 'scale(.6)' }
    ],
    {
      duration: 360,
      delay: impactMs(m, index) + 40,
      easing: 'ease-in',
      fill: 'forwards'
    }
  );

  animation.onfinish = () => old.remove();
}


/*
  Fire splash. Built from a few CSS-only elements,
  removed automatically, never receives pointer events.
*/
function createCaptureEffect(square) {

  const cell = cells[square];

  if (!cell || !canAnimate()) {
    return;
  }

  const burst = document.createElement('div');

  burst.className = 'fx-burst';

  burst.setAttribute('aria-hidden', 'true');

  let html = '<i class="fx-flash"></i><i class="fx-ring"></i>';

  [-1, 0, 1].forEach(
    (x, i) => {

      html +=
        `<i class="fx-flame" style="--x:${x};animation-delay:${i * .05}s"></i>`;
    }
  );

  for (let i = 0; i < 8; i++) {

    html +=
      `<i class="fx-spark" style="--a:${i * 45 + (i % 2 ? 12 : -6)}deg;` +
      `--r:${5.5 + (i % 3) * 1.6}em;animation-delay:${(i % 3) * .03}s"></i>`;
  }

  burst.innerHTML = html;

  cell.appendChild(burst);

  window.setTimeout(
    () => burst.remove(),
    900
  );
}


/* Animations off: everything lands at once, still one sound per event. */
function playSounds(m, king) {

  const token = fxToken;

  if (m.caps.length) {

    (king ? SFX.kingCap : SFX.cap)();

    vib(40);

  } else if (!m.promo) {

    (king ? SFX.kingMove : SFX.move)();
  }

  if (m.promo) {

    window.setTimeout(
      () => {

        if (token === fxToken) {
          SFX.promote();
        }
      },
      m.caps.length ? 260 : 0
    );

    vib([30, 40, 30]);
  }
}


/* Sounds, fire and vibration synchronised with the glide. */
function scheduleFx(m, king) {

  const token = fxToken;

  const later = (ms, fn) =>
    window.setTimeout(
      () => {

        if (token === fxToken) {
          fn();
        }
      },
      ms
    );


  /* Impact: sound + fire splash + captured piece fading, all at the same moment. */
  m.caps.forEach(
    (square, i) => {

      later(
        impactMs(m, i),
        () => {

          createCaptureEffect(square);

          (king ? SFX.kingCap : SFX.cap)();

          vib(40);
        }
      );
    }
  );


  /* Landing: normal / king move sound, or the promotion sound. */
  later(
    glideMs(m),
    () => {

      if (m.promo) {

        SFX.promote();

        vib([30, 40, 30]);

      } else if (!m.caps.length) {

        (king ? SFX.kingMove : SFX.move)();
      }
    }
  );
}
