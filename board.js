'use strict';

/* =========================================================
   KING ICON
   ========================================================= */

function kingIcon() {

  /*
    The game icon (crown, two gems, three stars, band with three diamond
    cut-outs) as inline SVG. Colours come from CSS: white disc = white crown,
    black disc = black crown. Gradients are defined once in index.html.
  */
  return `
    <svg class="king-icon" viewBox="40 60 1170 1020" aria-hidden="true" focusable="false">
      <g class="kc">
        <path class="ks" d="M362 174L382 230L442 232L394 269L411 326L362 292L313 326L330 269L282 232L342 230Z M627 58L655 137L739 140L673 191L696 271L627 224L558 271L581 191L515 140L599 137Z M887 174L907 230L967 232L919 269L936 326L887 292L838 326L855 269L807 232L867 230Z"/>
        <path class="kb" d="M42 378L265 562L240 638L445 752L578 535L515 455L628 297L740 455L675 535L800 760L1010 640L985 565L1205 378L1018 830L232 830Z"/>
        <path class="kg" d="M360 448L472 575L415 682L307 595Z M893 448L778 578L835 682L940 592Z"/>
        <path class="kl" d="M236 834L1014 834L1008 856L242 856Z"/>
        <path class="kband" fill-rule="evenodd" d="M212 868L1030 868Q1032 960 1070 1042L175 1042Q212 960 212 868ZM472 896L526 950L472 1004L418 950ZM627 896L681 950L627 1004L573 950ZM775 896L829 950L775 1004L721 950Z"/>
        <path class="kshine" d="M628 297L628 830M42 378L232 830M1205 378L1018 830"/>
      </g>
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

        el.innerHTML = `<i class="pc ${p > 0 ? 'w' : 'b'}${showKing ? ' k' : ''}${isSelected ? ' sel' : ''}${isMust ? ' must' : ''}"><b class="wall"></b><u class="face"></u>${showKing ? kingIcon() : ''}</i>`;


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
        ? 'THINKING'
        : G.daily && G.mode === 'cpu' && G.turn === HUMAN && !Engine.isCaptureAvailable(G.moves)
          ? 'DAILY CROWN'
          : Engine.isCaptureAvailable(G.moves)
            ? 'MUST CAPTURE'
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
