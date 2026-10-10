CROWNIX - Luxury International Checkers
HTML + CSS + vanilla JavaScript only. No backend, no account, no database, no network needed after the first load.

RUN IT
  Desktop: double-click index.html (everything works; the computer thinks on the main thread).
  Best experience (installable, offline, background AI worker): serve the folder over http://localhost or HTTPS.
    Example:  python3 -m http.server 8080   then open http://localhost:8080
  GitHub Pages: push the folder as is; every path is relative, so it also works under /repository-name/.
  Install: browser menu > Install app / Add to Home Screen (Android, desktop Chrome/Edge). iPhone: Share > Add to Home Screen.
  After the first load the game works with no internet. The Install App button appears on the menu when the browser offers it.

FILES
  index.html            markup for every screen
  style.css             luxury dark / light theme and layout
  engine.js             rules engine + computer opponent + "why this move" (also runs as the AI Web Worker)
  core.js               settings, safe storage, shared state
  audio.js              Web Audio sound effects, vibration
  profile.js            local profile, rating, records, achievements, Daily Crown, replays, share text
  fx.js                 piece glide animation and fire splash
  board.js              board drawing
  game.js               game flow, undo / redo, save / resume, hints
  screens.js            screens, profile views, replay mode, sharing
  app.js                actions, keyboard, install / offline, start-up
  emblem.webp / emblem.png   the crown emblem shown on the home page
  manifest.json, service-worker.js, icon-*.png, favicon.*, apple-touch-icon.png   PWA
  tests/index.html      browser test page (open it - see below)
  _headers              optional security / caching headers for Netlify or Cloudflare Pages (GitHub Pages ignores it)
  screenshots/          images for the install dialog

RULES
  8x8, 12 men each, White first. Men move AND capture forward only. Capture is mandatory and the longest sequence must be taken.
  Captured pieces are removed when the whole sequence ends and cannot be jumped twice. A man promotes only if its move ends on the far row.
  Kings fly in every direction and may land on any empty square beyond a captured piece.
  Draws: 40 king-only plies without a capture or man move, or the same position three times. A side with no pieces or no legal move loses.

COMPUTER LEVELS
  Beginner (shallow, makes slips) - Casual (depth 3) - Competitive (up to depth 10, 0.6 s) - Master (up to depth 18, 1.8 s).
  Iterative deepening, alpha-beta, transposition table, move ordering. Levels differ only in search strength; the rules are identical.

LOCAL FEATURES (all stored on this device only)
  Rating (Elo-style, against the computer levels; games with Undo or Hint, and Daily Crown games, are unrated), personal records,
  statistics, 17 achievements, Daily Crown challenge with streak (same challenge for everyone on the same date, no server),
  saved replays (latest 20), share via the Web Share API with a clipboard fallback.

CONTROLS
  Tap a piece, then a gold-marked square. Keyboard: arrows move, Enter/Space selects, Esc deselects/closes, U undo, R redo,
  H hint, P pause, M mute, T theme, B focus the board, ? lists every shortcut. In replays: arrows, Home, End, Space.
  Settings: sound, vibration, animations (Cinematic / Faster / Off), timer, coordinates, confirm restart, auto-select a forced piece,
  show computer reasoning, theme, computer level. Reduced-motion system settings always turn animations off.

TESTS
  Open tests/index.html in a browser (served or from disk). It runs 88 checks: the move generator against an independent reference
  on thousands of random positions, captures, kings, promotion, draws, all four computer levels, rating, achievements,
  Daily Crown determinism and streaks, replay encoding and sharing. Tests use in-memory storage, never your real data.

LOOK
  Pieces are drawn in CSS (no images) after the product photos: bevelled rim, stepped rings, a glossy dome with the centre dot
  (black dot on white, white dot on black) and a thick side wall. A king carries the crown emblem from the game icon, white on a
  white disc and black on a black disc. The interface is icon-first: control names are in tooltips and screen-reader labels.

UPDATING
  Bump VERSION in service-worker.js whenever any file changes so installed copies refresh.
