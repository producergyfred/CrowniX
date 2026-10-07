'use strict';

/* =========================================================
   KING ICON
   ========================================================= */

function kingIcon() {

  /*
    Raised royal crown (inline SVG, local).
    Gradients come from the shared <defs> in index.html.
  */
  return `
    <svg class="king-icon" viewBox="0 -3 64 56" aria-hidden="true" focusable="false">
      <ellipse cx="32" cy="47.5" rx="27" ry="3.4" fill="rgba(0,0,0,.3)"/>
      <path d="M5 43L4 14L11 29L18 9L25 27L32 3L39 27L46 9L53 29L60 14L59 43Z"
            fill="url(#gCrown)" stroke="#5e4413" stroke-width="1.3" stroke-linejoin="round"/>
      <path d="M8 38L7.4 19L11.5 28.5" fill="none" stroke="#fff3b8" stroke-width="1.4"
            stroke-linecap="round" opacity=".85"/>
      <circle cx="4" cy="12" r="2.7" fill="url(#gBall)" stroke="#5e4413" stroke-width=".8"/>
      <circle cx="18" cy="7" r="2.7" fill="url(#gBall)" stroke="#5e4413" stroke-width=".8"/>
      <circle cx="32" cy="1.2" r="2.9" fill="url(#gBall)" stroke="#5e4413" stroke-width=".8"/>
      <circle cx="46" cy="7" r="2.7" fill="url(#gBall)" stroke="#5e4413" stroke-width=".8"/>
      <circle cx="60" cy="12" r="2.7" fill="url(#gBall)" stroke="#5e4413" stroke-width=".8"/>
      <rect x="3.5" y="38" width="57" height="9.5" rx="2.2"
            fill="url(#gCrown)" stroke="#5e4413" stroke-width="1.2"/>
      <circle cx="16" cy="42.8" r="2.5" fill="url(#gGem)" stroke="#4a0912" stroke-width=".7"/>
      <circle cx="32" cy="42.8" r="2.5" fill="url(#gGem)" stroke="#4a0912" stroke-width=".7"/>
      <circle cx="48" cy="42.8" r="2.5" fill="url(#gGem)" stroke="#4a0912" stroke-width=".7"/>
    </svg>
  `;
}


/* =========================================================
   BOARD CREATION
   ========================================================= */

function buildBoard() {

  const board =
    $('board');


  const frag =
    document.createDocumentFragment();


  for (
    let s = 0;
    s < 64;
    s++
  ) {

    const cell =
      document.createElement(
        'div'
      );


    cell.dataset.s =
      s;


    cell.setAttribute(
      'role',
      'gridcell'
    );


    cell.className =
      'sq ' +
      (
        (
          row(s) +
          col(s)
        ) % 2
          ? 'd'
          : 'l'
      );


    if (
      row(s) === 7
    ) {

      cell.dataset.f =
        'abcdefgh'[col(s)];
    }


    if (
      col(s) === 0
    ) {

      cell.dataset.r =
        N - row(s);
    }


    cells.push(
      cell
    );


    frag.appendChild(
      cell
    );
  }


  board.appendChild(
    frag
  );
}


/* =========================================================
   BOARD RENDERING
   ========================================================= */

function render(
  moved = false
) {

  if (!G) {
    return;
  }


  const dests =
    new Set(
      sel
        ? sel.cands.map(
            m =>
              m.path[sel.k]
          )
        : []
    );


  const trail =
    new Set(
      sel
        ? sel.trail
        : []
    );


  const must =
    Engine.isCaptureAvailable(
      G.moves
    );


  const movers =
    new Set(
      G.moves.map(
        m =>
          m.from
      )
    );


  const last =
    G.last
      ? new Set([
          G.last.from,
          ...G.last.path
        ])
      : new Set();


  const landed =
    G.last
      ? G.last.path[
          G.last.path.length - 1
        ]
      : -1;


  let whiteCount = 0;

  let blackCount = 0;


  for (
    let s = 0;
    s < 64;
    s++
  ) {

    const p =
      G.board[s];


    if (p > 0) {
      whiteCount++;
    } else if (p < 0) {
      blackCount++;
    }


    const el =
      cells[s];


    if (
      !el.classList.contains('d')
    ) {

      /* The keyboard cursor must also be visible on light squares. */
      el.classList.toggle(
        'cur',
        s === cur
      );

      continue;
    }


    el.className =
      'sq d' +

      (
        dests.has(s)
          ? ' dest'
          : ''
      ) +

      (
        trail.has(s)
          ? ' trail'
          : ''
      ) +

      (
        last.has(s)
          ? ' last'
          : ''
      ) +

      (
        s === cur
          ? ' cur'
          : ''
      ) +

      hintClass(s);


    let signature =
      '' + p;


    if (p) {

      const king =
        Math.abs(p) === KING;


      const isSelected =
        sel &&
        sel.from === s;


      const isMust =
        must &&
        movers.has(s) &&
        !sel;


      const isLanded =
        s === landed;


      /* A freshly played move that should glide. */
      const fresh =
        isLanded &&
        moved &&
        doAnim;


      /* A promoted disk slides as a man; the crown appears on arrival. */
      const showKing =
        king &&
        !(
          fresh &&
          G.last.promo
        );


      signature +=
        `|${isSelected}` +
        `|${isMust}` +
        `|${isLanded}`;


      if (
        el._sig !== signature
      ) {

        el.innerHTML = `<i class="pc ${p > 0 ? 'w' : 'b'}${showKing ? ' k' : ''}${isSelected ? ' sel' : ''}${isMust ? ' must' : ''}">${showKing ? kingIcon() : ''}</i>`;


        if (fresh) {

          glide(
            el.firstChild,
            G.last
          );
        }
      }

    } else if (
      el._sig !== signature
    ) {

      /* A captured disk stays briefly so it can fade out on impact. */
      const old =
        el.firstChild;

      const index =
        G.last
          ? G.last.caps.indexOf(s)
          : -1;


      if (
        old &&
        moved &&
        doAnim &&
        index >= 0
      ) {

        fadeOut(
          old,
          G.last,
          index
        );

      } else {

        el.innerHTML =
          '';
      }
    }


    el._sig =
      signature;


    el.setAttribute(
      'aria-label',

      nm(s) +

      (
        p
          ? (
              p > 0
                ? ' white '
                : ' black '
            ) +

            (
              Math.abs(p) === KING
                ? 'king'
                : 'man'
            )

          : ' empty'
      )
    );
  }


  $('wc').textContent =
    whiteCount;

  $('bc').textContent =
    blackCount;


  setStatus(must);

  refreshControls();
}


/* =========================================================
   STATUS
   ========================================================= */

function setStatus() {

  if (!G) {
    return;
  }

  if (G.mode === 'replay') {

    $('turn').textContent = 'REPLAY';

    $('sub').textContent = RP.index === 0 ? 'START' : `MOVE ${RP.index} OF ${RP.moves.length}`;

    return;
  }

  $('turn').textContent =
    G.over
      ? 'GAME OVER'
      : G.turn === W
        ? "WHITE'S TURN"
        : "BLACK'S TURN";

  $('sub').textContent =
    G.over
      ? ''
      : G.busy
        ? 'THINKING...'
        : G.daily && G.mode === 'cpu' && G.turn === HUMAN && !Engine.isCaptureAvailable(G.moves)
          ? 'DAILY CROWN'
          : Engine.isCaptureAvailable(G.moves)
            ? 'CAPTURE REQUIRED'
            : '';
}


/* =========================================================
   TIMER
   ========================================================= */

function renderTime() {

  const time =
    G
      ? G.time
      : 0;


  $('tm').textContent =
    set.timer

      ? String(
          Math.floor(
            time / 60
          )
        ).padStart(
          2,
          '0'
        ) +

        ':' +

        String(
          time % 60
        ).padStart(
          2,
          '0'
        )

      : '--:--';
}
