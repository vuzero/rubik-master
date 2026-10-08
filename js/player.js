/*
 * Plan / result playback of a solution.
 *
 * Each step has two views:
 *   plan — the cube as the step starts, with From → To labels and arrows showing
 *          which piece goes where; the step's moves are listed as text to follow;
 *   done — the cube after the step (reached with a smooth color fade, not by
 *          animating every move), the destination slots marked "Done".
 * Position p walks plan(0), done(0), plan(1), done(1), ... : step = floor(p / 2).
 */
(function (root) {
  'use strict';
  const C = root.Cube4;
  const N = root.Notation;
  // Speed slider 1..5: how long the fade takes and how long play mode lingers on each view.
  const FADE_MS = [900, 700, 520, 380, 240];
  const PLAN_HOLD_MS = [4200, 3200, 2400, 1700, 1100];
  const DONE_HOLD_MS = [2000, 1600, 1200, 900, 600];
  const STAGES = ['Centers', 'Edges', 'Layers 1–2', 'Yellow top', 'Last layer'];
  const STAGE_OF_PHASE = { Centers: 0, Edges: 1, 'Layer 1': 2, 'Layer 2': 2, 'Yellow top': 3, 'Last layer': 4 };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

  class Player {
    constructor({ view, els }) {
      this.view = view;
      this.overlay = root.GoalOverlay ? new root.GoalOverlay(view) : null;
      this.els = els;
      this.chain = Promise.resolve();
      this.gen = 0; // bumped by every jump; stale transitions check it and give up
      this.runId = 0; // each play() run owns an id; pause() retires the current one
      this.playing = false;
      this.busy = false;
      this.bindControls();
    }

    /**
     * @param {string[]} start 96-sticker colors (a 2x2 or 3x3 is stored as an equivalent 4x4)
     * @param {Object[]} steps solver steps
     * @param {number} size cube size to draw: 2, 3 or 4
     */
    load(start, steps, size = 4) {
      if (this.view.size !== size) {
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
      this.pause();
      this.renderList();
      this.renderStages();
      this.jumpTo(0);
    }

    // ---- positions ------------------------------------------------------
    get last() { return Math.max(0, this.steps.length * 2 - 1); }
    stepOf(p) { return Math.floor(p / 2); }
    isDone(p) { return this.steps.length === 0 || p % 2 === 1; }
    cubeAt(p) { return this.states[this.steps.length ? this.stepOf(p) + (this.isDone(p) ? 1 : 0) : 0]; }
    speedIndex() { return Math.min(4, Math.max(0, Number(this.els.speed.value) - 1)); }

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
      if (this.busy) this.view.finishNow();
      this.chain = this.chain.then(() => (gen === this.gen ? action() : null)).catch(() => {});
      return this.chain;
    }

    async moveTo(next) {
      if (next < 0 || next > this.last || next === this.pos) return false;
      const gen = this.gen;
      const from = this.cubeAt(this.pos);
      const to = this.cubeAt(next);
      if (from !== to) {
        this.busy = true;
        this.overlay?.clear();
        await this.view.tweenColors(this.project(from), this.project(to), FADE_MS[this.speedIndex()]);
        this.busy = false;
        if (gen !== this.gen) return false;
      }
      this.pos = next;
      this.render();
      return true;
    }

    forward() { return this.enqueue(() => this.moveTo(this.pos + 1)); }
    back() { return this.enqueue(() => this.moveTo(this.pos - 1)); }

    jumpTo(p) {
      this.gen++;
      this.view.finishNow();
      this.busy = false;
      this.chain = Promise.resolve();
      this.pos = Math.max(0, Math.min(this.last, p));
      this.render();
    }

    nextStep() {
      this.pause();
      const s = this.stepOf(this.pos);
      this.jumpTo(s + 1 < this.steps.length ? (s + 1) * 2 : this.last);
    }

    prevStep() {
      this.pause();
      const s = this.stepOf(this.pos);
      this.jumpTo(this.isDone(this.pos) ? s * 2 : Math.max(0, s - 1) * 2);
    }

    async play() {
      if (this.playing || !this.steps.length) return;
      if (this.pos >= this.last) this.jumpTo(0);
      const run = ++this.runId;
      this.playing = true;
      this.renderPlayButton();
      const live = () => run === this.runId;
      while (live() && this.pos < this.last) {
        const holds = this.isDone(this.pos) ? DONE_HOLD_MS : PLAN_HOLD_MS;
        await wait(holds[this.speedIndex()]);
        if (!live()) return;
        await this.forward();
        if (!live()) return;
        if (this.els.pauseAtStep.checked && !this.isDone(this.pos)) break;
      }
      if (live()) this.pause();
    }

    pause() {
      this.runId++;
      this.playing = false;
      this.renderPlayButton();
    }

    toggle() { return this.playing ? this.pause() : this.play(); }

    bindControls() {
      const { els } = this;
      const stop = (fn) => () => { this.pause(); fn(); };
      els.btnBack.addEventListener('click', stop(() => this.back()));
      els.btnFwd.addEventListener('click', stop(() => this.forward()));
      els.btnPlay.addEventListener('click', () => this.toggle());
      els.btnRestart.addEventListener('click', () => { this.pause(); this.jumpTo(0); });
      els.phaseBar.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-stage]');
        if (!btn) return;
        const first = this.stageOfStep.indexOf(Number(btn.dataset.stage));
        if (first >= 0) { this.pause(); this.jumpTo(first * 2); }
      });
      els.stepList.addEventListener('click', (e) => {
        const row = e.target.closest('[data-step]');
        if (row) { this.pause(); this.jumpTo(Number(row.dataset.step) * 2); }
      });
      window.addEventListener('keydown', (e) => {
        if (els.root.hidden || /input|textarea|select/i.test(e.target.tagName) || e.metaKey || e.ctrlKey || e.altKey) return;
        // Space on a focused control should press that control, not toggle playback.
        if (e.key === ' ' && /button|summary|a/i.test(e.target.tagName)) return;
        const keys = {
          ArrowRight: () => (e.shiftKey ? this.nextStep() : stop(() => this.forward())()),
          ArrowLeft: () => (e.shiftKey ? this.prevStep() : stop(() => this.back())()),
          ' ': () => this.toggle(),
        };
        if (keys[e.key]) { e.preventDefault(); keys[e.key](); }
      });
    }

    // ---- rendering ------------------------------------------------------
    render() {
      const { els, pos } = this;
      const s = this.stepOf(pos);
      const done = this.isDone(pos);
      const n = this.steps.length;
      this.view.setState(this.project(this.cubeAt(pos)));

      els.counterSteps.textContent = n ? `Step ${s + 1} of ${n}` : 'Already solved';
      els.counterMoves.textContent = `${this.totalMoves} moves in total`;
      els.btnBack.disabled = pos === 0;
      els.btnFwd.disabled = pos >= this.last;
      els.btnFwd.textContent = !n || pos >= this.last ? 'Solved ✓' : done ? 'Next step ›' : 'See result ›';
      this.renderBody(s, done);
      this.renderWhy(s);
      this.renderListState(s, done);
      this.renderStageState(s, done);
      this.renderGoal(s, done);
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

    renderPlayButton() {
      this.els.btnPlay.textContent = this.playing ? 'Pause' : 'Play';
    }

    // Plan: From → To on the starting cube. Done: the destination slots, now filled.
    renderGoal(s, done) {
      if (!this.overlay) return;
      const step = this.steps[s];
      if (!step) { this.overlay.clear(); return; }
      const groups = step.goal.items.flatMap((it) => it.groups)
        .map((g) => ({ from: this.mapGroup(g.from), to: this.mapGroup(g.to) }));
      if (done) this.overlay.showResult(groups.map((g) => g.to));
      else this.overlay.show(groups);
    }

    // The card: status, one line per piece (where from, where to) and the moves to do.
    renderBody(s, done) {
      const step = this.steps[s];
      if (!step) {
        this.els.stepBody.innerHTML = '<div class="finished"><h2>Nothing to do</h2><p>The colors you entered are already a solved cube.</p></div>';
        return;
      }
      const finished = done && s === this.steps.length - 1;
      const badge = `<span class="state-badge ${done ? 'is-done' : 'is-plan'}">${finished ? 'Solved ✓' : done ? 'Done ✓' : 'Plan'}</span>`;
      const swatches = (cols) => `<span class="swatches">${cols.map((c) => `<i class="sw sw-${c}"></i>`).join('')}</span>`;
      const items = step.goal.items;
      const shown = items.slice(0, 3);
      const routes = shown.map((it) => `<li>${swatches(it.colors)}<b>${esc(it.name)}</b> <span class="route">${done
        ? `now in the ${esc(it.toName)}`
        : it.inPlace ? 'turns in place' : `${esc(it.fromName)} <span aria-hidden="true">→</span> ${esc(it.toName)}`}</span></li>`).join('')
        + (items.length > shown.length ? `<li class="more">+${items.length - shown.length} more pieces</li>` : '');
      const groups = step.parts.map((part) => `<div class="move-group" title="${esc(part.label)}">${part.moves
        .map((m) => `<span class="token" title="${esc(N.explain(m).title)}">${esc(m)}</span>`).join('')}</div>`).join('');
      const hint = s === 0 && !done
        ? '<p class="hint">Find the piece marked <b class="from-word">From</b> on your cube, do these moves, and it lands on <b class="to-word">To</b>.</p>'
        : '';
      this.els.stepBody.innerHTML = `<div class="step-head">${badge}<div class="step-title"><span class="eyebrow">${esc(step.phase)}</span>`
        + `<h2>${esc(step.title)}</h2></div></div>`
        + `<ul class="routes ${done ? 'is-done' : ''}">${routes}</ul>`
        + `<div class="moves ${done ? 'is-done' : ''}" aria-label="Moves for this step">${groups}</div>${hint}`;
    }

    // Detail on demand: what the step is for, what each part does, and how it works.
    renderWhy(s) {
      const step = this.steps[s];
      this.els.whyBody.innerHTML = step
        ? `<p>${esc(step.goal.summary)}</p><ul>${step.parts.filter((p) => p.why)
          .map((p) => `<li><b>${esc(p.label)}</b>: ${esc(p.why)}</li>`).join('')}</ul><p>${esc(step.text)}</p>`
        : '';
    }

    renderStages() {
      // Only stages this solution goes through (a 3x3 has no centers or edge pairing,
      // a 2x2 has no middle layer either).
      const middle = this.steps.some((st) => st.phase === 'Layer 2');
      this.els.phaseBar.innerHTML = STAGES.map((stage, i) => {
        if (!this.stageOfStep.includes(i)) return '';
        const name = i === STAGE_OF_PHASE['Layer 1'] && !middle ? 'Layer 1' : stage;
        return `<li><button type="button" class="phase" data-stage="${i}">`
          + '<span class="phase-track"><span class="phase-fill"></span></span>'
          + `<span class="phase-name">${esc(name)}</span></button></li>`;
      }).join('');
    }

    renderStageState(s, done) {
      const finishedSteps = s + (done ? 1 : 0);
      this.els.phaseBar.querySelectorAll('.phase').forEach((btn) => {
        const stage = Number(btn.dataset.stage);
        const mine = this.stageOfStep.map((g, i) => (g === stage ? i : -1)).filter((i) => i >= 0);
        const finished = mine.filter((i) => i < finishedSteps).length;
        const complete = !mine.length || finished === mine.length;
        btn.querySelector('.phase-fill').style.width = `${complete ? 100 : (finished / mine.length) * 100}%`;
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

    renderListState(s, done) {
      const rows = this.els.stepList.querySelectorAll('.step-row');
      rows.forEach((row) => {
        const i = Number(row.dataset.step);
        row.classList.toggle('done', i < s || (i === s && done));
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
