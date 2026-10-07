/*
 * Wires the two modes together: color entry -> validation -> solve -> playback.
 */
(function (root) {
  'use strict';
  const C = root.Cube4;
  const $ = (id) => document.getElementById(id);
  const STORAGE_KEY = 'cube4-coach-colors';
  const VALIDATE_DELAY_MS = 120;

  const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

  const preview = new root.CubeView($('preview3d'));
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

  function saveDraft() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(colors)); } catch (e) { /* storage unavailable: drafts just aren't kept */ }
  }

  function loadDraft() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (Array.isArray(saved) && saved.length === C.STICKERS) return saved;
    } catch (e) { /* ignore unreadable drafts */ }
    return null;
  }

  function validateNow() {
    const result = root.Validate.analyze(colors);
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
    const moves = C.randomScramble(40);
    note = 'Random scramble loaded as an example. Paint over it with your own cube.';
    editor.setColors(C.applyAlg(C.solvedState(C.DEFAULT_SCHEME), moves));
  }

  $('btn-sample').addEventListener('click', loadScramble);
  $('btn-solved').addEventListener('click', () => { note = ''; editor.setColors(C.solvedState(C.DEFAULT_SCHEME)); });
  $('btn-clear').addEventListener('click', () => { note = ''; editor.setColors(new Array(C.STICKERS).fill(null)); });

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
        nowToken: $('now-token'),
        nowTitle: $('now-title'),
        nowDetail: $('now-detail'),
        nowPart: $('now-part'),
        progress: $('progress-bar'),
        counterMoves: $('counter-moves'),
        counterSteps: $('counter-steps'),
        btnBack: $('btn-back'),
        btnFwd: $('btn-fwd'),
        btnPlay: $('btn-play'),
        btnPrevStep: $('btn-prev-step'),
        btnNextStep: $('btn-next-step'),
        btnRestart: $('btn-restart'),
        speed: $('speed'),
        pauseAtStep: $('pause-at-step'),
        stepCard: $('step-card'),
        stepList: $('step-list'),
        phaseBar: $('phase-bar'),
        moveNext: $('move-next'),
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
      const result = root.Solver.solve(colors);
      btn.disabled = false;
      btn.textContent = 'Solve this cube';
      if (!result.ok) {
        setStatus('err', `<ul>${result.errors.map((e) => `<li>${esc(e)}</li>`).join('')}</ul>`);
        return;
      }
      solution = result;
      $('tab-solve').disabled = false;
      showMode('solve');
      ensurePlayer().load(colors.slice(), result.steps);
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
