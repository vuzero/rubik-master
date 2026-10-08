/*
 * Step-by-step playback of a solution.
 *
 * The cube shows the current step as it starts: From → To labels and arrows
 * mark which piece goes where, and the dock lists the moves to do. The
 * Before / After switch turns the cube through the step's moves (destinations
 * then marked "Done") and back; Next and Back do the same a whole step at a
 * time. The move being turned is highlighted in the dock. Pressing again while
 * the cube turns skips to the end. Step n (one past the last) is the solved cube.
 */
(function (root) {
  'use strict';
  const C = root.Cube4;
  const N = root.Notation;
  // One quarter turn takes MOVE_MS; long sequences speed up so none lasts much over MAX_SEQUENCE_MS.
  const MOVE_MS = 340;
  const MIN_MOVE_MS = 120;
  const MAX_SEQUENCE_MS = 6500;
  const STAGES = ['Centers', 'Edges', 'Layers 1–2', 'Yellow top', 'Last layer'];
  const STAGE_OF_PHASE = { Centers: 0, Edges: 1, 'Layer 1': 2, 'Layer 2': 2, 'Yellow top': 3, 'Last layer': 4 };
  const MAX_ROUTES = 2;
  const CHEVRON = {
    left: '<svg class="chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
    right: '<svg class="chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>',
  };

  const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

  class Player {
    constructor({ view, els }) {
      this.view = view;
      this.overlay = root.GoalOverlay ? new root.GoalOverlay(view) : null;
      this.els = els;
      this.chain = Promise.resolve();
      this.gen = 0; // bumped by every jump; stale transitions check it and give up
      this.busy = false;
      this.rush = false; // set when the viewer presses again mid-sequence: finish without animating
      this.step = 0;
      this.result = false;
      this.bindControls();
    }

    /**
     * @param {string[]} start 96-sticker colors (a 2x2 or 3x3 is stored as an equivalent 4x4)
     * @param {Object[]} steps solver steps
     * @param {number} size cube size to draw: 2, 3 or 4
     */
    load(start, steps, size = 4) {
      if (this.view.size !== size) {
        // Old labels point at stickers of the old size; drop them before the cube is rebuilt.
        this.overlay?.clear();
        this.view.setSize(size);
        this.overlay?.attachFrames();
      }
      // States and goals are 4x4 sticker indices; convert them for a smaller drawing.
      if (size === 4) {
        this.project = (letters) => letters;
        this.mapGroup = (g) => g;
      } else {
        const T = size === 3 ? root.Cube3 : root.Cube2;
        const toSmall = size === 3 ? T.index4to3 : T.index4to2;
        this.project = T.project;
        this.mapGroup = (g) => [...new Set(g.map(toSmall))].filter((i) => i >= 0);
      }
      this.steps = steps;
      this.states = [start];
      steps.forEach((s) => this.states.push(C.applyAlg(this.states[this.states.length - 1], s.moves)));
      this.totalMoves = steps.reduce((n, s) => n + s.moves.length, 0);
      this.stageOfStep = this.assignStages(steps);
      this.focusedStep = -1;
      this.renderList();
      this.renderStages();
      this.jumpTo(0);
    }

    // ---- positions ------------------------------------------------------
    get finished() { return this.step >= this.steps.length; }
    stateIndex(step, result) { return Math.min(this.steps.length, step + (result ? 1 : 0)); }
    cubeAt(step, result) { return this.states[this.stateIndex(step, result)]; }

    // The moves that take state i to state j (backwards: the inverse moves).
    movesBetween(i, j) {
      if (j >= i) return this.steps.slice(i, j).flatMap((s) => s.moves);
      return C.invertAlg(this.steps.slice(j, i).flatMap((s) => s.moves));
    }

    // Parity fixes belong to the stage of the step that follows them.
    assignStages(steps) {
      const out = new Array(steps.length);
      let next = STAGES.length - 1;
      for (let i = steps.length - 1; i >= 0; i--) {
        const stage = STAGE_OF_PHASE[steps[i].phase];
        if (stage !== undefined) next = stage;
        out[i] = next;
      }
      return out;
    }

    // ---- actions --------------------------------------------------------
    enqueue(action) {
      const gen = this.gen;
      if (this.busy) {
        this.rush = true;
        this.view.finishNow();
      }
      this.chain = this.chain.then(() => (gen === this.gen ? action() : null)).catch(() => {});
      return this.chain;
    }

    // Turn the cube to (step, result) move by move, then redraw the dock for it.
    async go(stepWanted, resultWanted) {
      const step = Math.max(0, Math.min(this.steps.length, stepWanted));
      const result = resultWanted && step < this.steps.length;
      if (step === this.step && result === this.result) return;
      const gen = this.gen;
      const from = this.stateIndex(this.step, this.result);
      const to = this.stateIndex(step, result);
      if (from !== to) {
        this.busy = true;
        this.rush = false;
        this.overlay?.clear();
        // Only the step shown in the dock gets its tokens lit up as they turn.
        const shown = this.step;
        const forward = from === shown && to === shown + 1;
        const backward = from === shown + 1 && to === shown;
        const moves = this.movesBetween(from, to);
        await this.playMoves(this.states[from], moves, (k) => {
          this.markToken(k < 0 ? -1 : forward ? k : backward ? moves.length - 1 - k : -1);
          this.els.viewNote.textContent = k < 0 ? '' : `Turning ${moves[k]}`;
        });
        this.busy = false;
        if (gen !== this.gen) return;
      }
      this.step = step;
      this.result = result;
      this.render();
    }

    async playMoves(start, moves, onMove) {
      const gen = this.gen;
      const perMove = Math.max(MIN_MOVE_MS, Math.min(MOVE_MS, MAX_SEQUENCE_MS / moves.length));
      let cur = start;
      for (let k = 0; k < moves.length; k++) {
        onMove(k);
        if (!this.rush) await this.view.animateMove(moves[k], perMove);
        if (gen !== this.gen) return;
        cur = C.applyMove(cur, moves[k]);
        this.view.setState(this.project(cur));
      }
      onMove(-1);
    }

    markToken(index) {
      this.els.stepBody.querySelectorAll('.token').forEach((t, i) => t.classList.toggle('is-now', i === index));
    }

    next() { return this.enqueue(() => this.go(this.step + 1, false)); }
    back() { return this.enqueue(() => this.go(this.step - 1, false)); }
    toggleResult() { return this.enqueue(() => this.go(this.step, !this.result)); }
    showResult(on) { return this.enqueue(() => this.go(this.step, on)); }

    jumpTo(step) {
      this.gen++;
      this.view.finishNow();
      this.busy = false;
      this.chain = Promise.resolve();
      this.step = Math.max(0, Math.min(this.steps.length, step));
      this.result = false;
      this.render();
    }

    bindControls() {
      const { els } = this;
      els.btnBack.addEventListener('click', () => this.back());
      els.btnFwd.addEventListener('click', () => (this.finished ? this.jumpTo(0) : this.next()));
      els.btnRestart.addEventListener('click', () => this.jumpTo(0));
      els.btnBack.innerHTML = `${CHEVRON.left}<span>Back</span>`;
      // The Before / After switch is redrawn after the fade, so keep focus on the pressed side.
      els.stepBody.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-result]');
        if (!btn) return;
        const on = btn.dataset.result === '1';
        this.showResult(on).then(() => els.stepBody.querySelector(`[data-result="${on ? 1 : 0}"]`)?.focus({ preventScroll: true }));
      });
      const stageJump = (e) => {
        const btn = e.target.closest('[data-stage]');
        if (!btn) return;
        const first = this.stageOfStep.indexOf(Number(btn.dataset.stage));
        if (first >= 0) this.jumpTo(first);
      };
      els.phaseBar.addEventListener('click', stageJump);
      els.stageList.addEventListener('click', stageJump);
      els.stepList.addEventListener('click', (e) => {
        const row = e.target.closest('[data-step]');
        if (row) this.jumpTo(Number(row.dataset.step));
      });
      window.addEventListener('keydown', (e) => {
        if (els.root.hidden || /input|textarea|select/i.test(e.target.tagName) || e.metaKey || e.ctrlKey || e.altKey) return;
        // Space on a focused control should press that control.
        if (e.key === ' ' && /button|summary|a/i.test(e.target.tagName)) return;
        const keys = {
          ArrowRight: () => (this.finished ? null : this.next()),
          ArrowLeft: () => this.back(),
          ' ': () => (this.finished ? null : this.toggleResult()),
        };
        if (keys[e.key]) { e.preventDefault(); keys[e.key](); }
      });
    }

    // ---- rendering ------------------------------------------------------
    render() {
      const { els } = this;
      const s = this.step;
      const n = this.steps.length;
      this.view.setState(this.project(this.cubeAt(s, this.result)));

      els.counterMoves.textContent = n ? `${n} steps · ${this.totalMoves} moves` : '';
      els.btnBack.disabled = s === 0;
      els.btnFwd.disabled = n === 0;
      els.btnFwd.innerHTML = this.finished ? '<span>Start over</span>'
        : `<span>${s === n - 1 ? 'Finish' : 'Next step'}</span>${CHEVRON.right}`;
      els.viewNote.textContent = this.finished ? 'Solved' : this.result ? 'After this step' : 'Before this step';
      els.viewNote.classList.toggle('is-result', this.result || this.finished);
      this.renderBody(s);
      this.renderWhy(s);
      this.renderListState(s);
      this.renderStageState(s);
      this.renderGoal(s);
      if (s !== this.focusedStep) {
        this.focusedStep = s;
        const groups = this.steps[s]?.goal.items.flatMap((it) => it.groups) || [];
        if (groups.length) {
          this.view.focusOnStickers(groups.flatMap((g) => this.mapGroup([...g.from, ...g.to])), this.steps[s].focus);
        } else {
          this.view.focus(null);
        }
      }
    }

    // Before: From → To on the starting cube. After: the destination slots, now filled.
    renderGoal(s) {
      if (!this.overlay) return;
      const step = this.steps[s];
      if (!step) { this.overlay.clear(); return; }
      const groups = step.goal.items.flatMap((it) => it.groups)
        .map((g) => ({ from: this.mapGroup(g.from), to: this.mapGroup(g.to) }));
      if (this.result) this.overlay.showResult(groups.map((g) => g.to));
      else this.overlay.show(groups);
    }

    // The dock: title, where each piece goes, the moves and the result toggle.
    renderBody(s) {
      const step = this.steps[s];
      this.els.why.hidden = !step;
      if (!step) {
        const n = this.steps.length;
        this.els.stepBody.innerHTML = n
          ? `<div class="dock-title"><h2>Solved ✓</h2><span>${n} steps · ${this.totalMoves} moves</span></div>`
            + '<p class="dock-note">Every face is one color. Press Start over to walk through it again, or Edit colors for another cube.</p>'
          : '<div class="dock-title"><h2>Nothing to do</h2></div><p class="dock-note">The colors you entered are already a solved cube.</p>';
        return;
      }
      const done = this.result;
      const swatches = (cols) => `<span class="swatches">${cols.map((c) => `<i class="sw sw-${c}"></i>`).join('')}</span>`;
      const items = step.goal.items;
      const shown = items.slice(0, MAX_ROUTES);
      const routes = shown.map((it) => `<li>${swatches(it.colors)}<b>${esc(it.name)}</b> <span class="route">${done
        ? `now in the ${esc(it.toName)}`
        : it.inPlace ? 'turns in place' : `${esc(it.fromName)} <span aria-hidden="true">→</span> ${esc(it.toName)}`}</span></li>`).join('')
        + (items.length > shown.length ? `<li class="more">+${items.length - shown.length} more pieces</li>` : '');
      const groups = step.parts.map((part) => `<span class="move-group" title="${esc(part.label)}">${part.moves
        .map((m) => `<span class="token" title="${esc(N.explain(m).title)}">${esc(m)}</span>`).join('')}</span>`).join('');
      const hint = s === 0 && !done
        ? '<p class="dock-note">Find the piece marked <b class="from-word">From</b> on your cube, do these moves, and it lands on <b class="to-word">To</b>.</p>'
        : '';
      this.els.stepBody.innerHTML = `<div class="dock-title"><h2>${esc(step.title)}</h2>`
        + `<span>Step ${s + 1} of ${this.steps.length} · ${esc(step.phase)}</span></div>`
        + `<ul class="routes ${done ? 'is-done' : ''}">${routes}</ul>`
        + `<div class="moves ${done ? 'is-done' : ''}" aria-label="Moves for this step">${groups}`
        + '<span class="view-switch" role="group" aria-label="Cube view">'
        + `<button type="button" data-result="0" aria-pressed="${!done}">Before</button>`
        + `<button type="button" data-result="1" aria-pressed="${done}">After</button></span></div>${hint}`;
    }

    // Detail on demand: what the step is for, what each part does, and how it works.
    renderWhy(s) {
      const step = this.steps[s];
      this.els.whyBody.innerHTML = step
        ? `<p>${esc(step.goal.summary)}</p><ul>${step.parts.filter((p) => p.why)
          .map((p) => `<li><b>${esc(p.label)}</b>: ${esc(p.why)}</li>`).join('')}</ul><p>${esc(step.text)}</p>`
        : '';
    }

    // Only stages this solution goes through (a 3x3 has no centers or edge pairing,
    // a 2x2 has no middle layer either). Shown twice: a thin bar on top and a checklist.
    renderStages() {
      const middle = this.steps.some((st) => st.phase === 'Layer 2');
      const used = STAGES.map((stage, i) => ({ i, name: i === STAGE_OF_PHASE['Layer 1'] && !middle ? 'Layer 1' : stage }))
        .filter(({ i }) => this.stageOfStep.includes(i));
      this.els.phaseBar.innerHTML = used.map(({ i, name }) => `<li><button type="button" class="phase" data-stage="${i}">`
        + '<span class="phase-track"><span class="phase-fill"></span></span>'
        + `<span class="phase-name">${esc(name)}</span></button></li>`).join('');
      this.els.stageList.innerHTML = used.map(({ i, name }) => `<li><button type="button" class="stage-row" data-stage="${i}">`
        + `<i aria-hidden="true"></i><span>${esc(name)}</span><em></em></button></li>`).join('');
    }

    renderStageState(s) {
      const finishedSteps = s + (this.result ? 1 : 0);
      const stats = (stage) => {
        const mine = this.stageOfStep.map((g, i) => (g === stage ? i : -1)).filter((i) => i >= 0);
        const finished = mine.filter((i) => i < finishedSteps).length;
        return { mine, finished, complete: finished === mine.length };
      };
      this.els.phaseBar.querySelectorAll('.phase').forEach((btn) => {
        const { mine, finished, complete } = stats(Number(btn.dataset.stage));
        btn.querySelector('.phase-fill').style.width = `${(finished / mine.length) * 100}%`;
        btn.classList.toggle('is-done', complete);
        btn.classList.toggle('is-current', !complete && mine.includes(s));
      });
      this.els.stageList.querySelectorAll('.stage-row').forEach((btn) => {
        const { mine, finished, complete } = stats(Number(btn.dataset.stage));
        btn.querySelector('em').textContent = `${finished}/${mine.length}`;
        btn.querySelector('i').textContent = complete ? '✓' : '';
        btn.classList.toggle('is-done', complete);
        btn.classList.toggle('is-current', !complete && mine.includes(s));
      });
    }

    renderList() {
      let html = '';
      let phase = null;
      this.steps.forEach((s, i) => {
        if (s.phase !== phase) {
          phase = s.phase;
          html += `<li class="phase-head">${esc(phase)}</li>`;
        }
        html += `<li><button type="button" class="step-row" data-step="${i}"><span class="num">${i + 1}</span>`
          + `<span class="title">${esc(s.title)}</span><span class="len">${s.moves.length}</span></button></li>`;
      });
      this.els.stepList.innerHTML = html;
    }

    renderListState(s) {
      const rows = this.els.stepList.querySelectorAll('.step-row');
      rows.forEach((row) => {
        const i = Number(row.dataset.step);
        row.classList.toggle('done', i < s || (i === s && this.result));
        row.classList.toggle('current', i === s);
      });
      const current = rows[s];
      const panel = this.els.stepList.closest('.steps-panel');
      if (current && panel && panel.scrollHeight > panel.clientHeight) {
        const top = current.offsetTop;
        if (top < panel.scrollTop || top > panel.scrollTop + panel.clientHeight - 40) {
          panel.scrollTop = top - panel.clientHeight / 3;
        }
      }
    }
  }

  root.Player = Player;
})(typeof window !== 'undefined' ? window : globalThis);
