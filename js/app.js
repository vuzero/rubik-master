/*
 * Wires the two modes together: color entry -> validation -> solve -> playback.
 */
(function (root) {
  'use strict';
  const C = root.Cube4;
  const T = root.Cube3;
  const T2 = root.Cube2;
  const $ = (id) => document.getElementById(id);
  const SIZE_KEY = 'cube-coach-size';
  const VALIDATE_DELAY_MS = 120;

  // Everything that differs between the cube sizes. Every solver returns its
  // start state as 96 stickers (a 2x2 or 3x3 is stored as an equivalent 4x4).
  const SIZES = {
    4: {
      stickers: 96,
      storageKey: 'cube4-coach-colors',
      solved: () => C.solvedState(C.DEFAULT_SCHEME),
      scramble: () => C.applyAlg(C.solvedState(C.DEFAULT_SCHEME), C.randomScramble(40)),
      check: (c) => root.Validate.analyze(c),
      solve: (c) => root.Solver.solve(c),
    },
    3: {
      stickers: 54,
      storageKey: 'cube3-coach-colors',
      solved: () => T.solved(),
      scramble: () => T.project(C.applyAlg(T.expand(T.solved()), T.randomScramble(25))),
      // A full 3x3 solve takes a few milliseconds and also catches flipped or swapped pieces.
      check: (c) => root.Solver3.solve(c),
      solve: (c) => root.Solver3.solve(c),
    },
    2: {
      stickers: 24,
      storageKey: 'cube2-coach-colors',
      solved: () => T2.solved(),
      scramble: () => T2.project(C.applyAlg(T2.expand(T2.solved(), C.DEFAULT_SCHEME), T2.randomScramble(15))),
      check: (c) => root.Solver2.solve(c),
      solve: (c) => root.Solver2.solve(c),
    },
  };

  const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

  let size = loadSize();
  const preview = new root.CubeView($('preview3d'), size);
  let solveView = null;
  let player = null;
  let colors = [];
  let solution = null;
  let note = '';
  let validateTimer = null;

  const status = $('status');
  function setStatus(kind, html) {
    status.className = `status ${kind}`;
    status.innerHTML = html;
  }

  function loadSize() {
    try {
      const saved = Number(localStorage.getItem(SIZE_KEY));
      return SIZES[saved] ? saved : 4;
    } catch (e) { return 4; }
  }

  function saveDraft() {
    try {
      localStorage.setItem(SIZES[size].storageKey, JSON.stringify(colors));
      localStorage.setItem(SIZE_KEY, String(size));
    } catch (e) { /* storage unavailable: drafts just aren't kept */ }
  }

  function loadDraft() {
    try {
      const saved = JSON.parse(localStorage.getItem(SIZES[size].storageKey) || 'null');
      if (Array.isArray(saved) && saved.length === SIZES[size].stickers) return saved;
    } catch (e) { /* ignore unreadable drafts */ }
    return null;
  }

  function validateNow() {
    const result = SIZES[size].check(colors);
    if (result.ok) {
      setStatus('ok', `${note ? `${esc(note)}<br>` : ''}These colors make a real, solvable cube.`);
    } else {
      const items = result.errors.slice(0, 4).map((e) => `<li>${esc(e)}</li>`).join('');
      const more = result.errors.length > 4 ? `<li>…and ${result.errors.length - 4} more.</li>` : '';
      setStatus(colors.some((c) => !c) ? 'note' : 'err', `${note ? `${esc(note)}<br>` : ''}<ul>${items}${more}</ul>`);
    }
    return result;
  }

  const editor = new root.Editor({
    size,
    paletteEl: $('palette'),
    netEl: $('net'),
    onChange: (next, source) => {
      colors = next;
      if (source === 'paint') note = '';
      preview.setState(colors);
      saveDraft();
      if (solution) {
        solution = null;
        $('tab-solve').disabled = true;
      }
      clearTimeout(validateTimer);
      validateTimer = setTimeout(validateNow, VALIDATE_DELAY_MS);
    },
    onHover: (idx) => preview.highlight(idx),
  });

  function loadScramble() {
    note = 'Random scramble loaded as an example. Paint over it with your own cube.';
    editor.setColors(SIZES[size].scramble());
  }

  $('btn-sample').addEventListener('click', loadScramble);
  $('btn-solved').addEventListener('click', () => { note = ''; editor.setColors(SIZES[size].solved()); });
  $('btn-clear').addEventListener('click', () => { note = ''; editor.setColors(new Array(SIZES[size].stickers).fill(null)); });

  // ---- cube size ------------------------------------------------------------
  function renderSize() {
    document.querySelectorAll('.size-btn').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.size) === size)));
    const each = size * size;
    $('input-lede').textContent = `Pick a color, then click or drag across the stickers. Each face has ${each} stickers; each color appears ${each} times.`;
  }

  function setSize(next) {
    if (next === size) return;
    size = next;
    renderSize();
    editor.setSize(size);
    preview.setSize(size);
    const draft = loadDraft();
    if (draft) {
      note = '';
      editor.setColors(draft);
    } else {
      loadScramble();
    }
    saveDraft();
  }

  document.querySelectorAll('.size-btn').forEach((b) => b.addEventListener('click', () => setSize(Number(b.dataset.size))));
  renderSize();

  // ---- modes ----------------------------------------------------------------
  function showMode(mode) {
    const solving = mode === 'solve';
    $('input-view').hidden = solving;
    $('solve-view').hidden = !solving;
    $('tab-input').classList.toggle('is-active', !solving);
    $('tab-solve').classList.toggle('is-active', solving);
    $('tab-input').toggleAttribute('aria-current', !solving);
    $('tab-solve').toggleAttribute('aria-current', solving);
    if (!solving && player) player.pause();
    window.scrollTo({ top: 0 });
    // The button that was clicked may now be hidden; keep keyboard focus somewhere sensible.
    if (document.activeElement && document.activeElement.closest('[hidden]')) {
      (solving ? $('btn-play') : $('tab-input')).focus({ preventScroll: true });
    }
  }

  function ensurePlayer() {
    if (player) return player;
    solveView = new root.CubeView($('solve3d'));
    player = new root.Player({
      view: solveView,
      els: {
        root: $('solve-view'),
        counterMoves: $('counter-moves'),
        counterSteps: $('counter-steps'),
        btnBack: $('btn-back'),
        btnFwd: $('btn-fwd'),
        btnPlay: $('btn-play'),
        btnRestart: $('btn-restart'),
        speed: $('speed'),
        pauseAtStep: $('pause-at-step'),
        stepList: $('step-list'),
        stepBody: $('step-body'),
        whyBody: $('why-body'),
        phaseBar: $('phase-bar'),
      },
    });
    return player;
  }

  $('btn-solve').addEventListener('click', () => {
    clearTimeout(validateTimer);
    const check = validateNow();
    if (!check.ok) return;
    const btn = $('btn-solve');
    btn.disabled = true;
    btn.textContent = 'Solving…';
    // Let the button repaint before the (short) synchronous solve.
    setTimeout(() => {
      const result = SIZES[size].solve(colors);
      btn.disabled = false;
      btn.textContent = 'Solve this cube';
      if (!result.ok) {
        setStatus('err', `<ul>${result.errors.map((e) => `<li>${esc(e)}</li>`).join('')}</ul>`);
        return;
      }
      solution = result;
      $('tab-solve').disabled = false;
      showMode('solve');
      ensurePlayer().load(result.start, result.steps, size);
    }, 30);
  });

  $('tab-input').addEventListener('click', () => showMode('input'));
  $('tab-solve').addEventListener('click', () => { if (solution) showMode('solve'); });
  $('btn-edit').addEventListener('click', () => showMode('input'));

  $('legend').innerHTML = root.Notation.LEGEND
    .map(([t, d]) => `<dt>${esc(t)}</dt><dd>${esc(d)}</dd>`).join('');

  const draft = loadDraft();
  if (draft) {
    note = 'Restored the colors you entered last time.';
    editor.setColors(draft);
  } else {
    loadScramble();
  }
})(window);
