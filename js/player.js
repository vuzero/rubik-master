/*
 * Step-by-step playback of a solution: forward / back one move with
 * animation, jump between steps, autoplay with optional pause after each step.
 */
(function (root) {
  'use strict';
  const C = root.Cube4;
  const N = root.Notation;
  const SPEED_MS = [950, 650, 420, 260, 140];
  const GOAL_HOLD_MS = 1500; // pause on each new step's goal while playing
  const STAGES = ['Centers', 'Edges', 'Layers 1–2', 'Yellow top', 'Last layer'];
  const STAGE_OF_PHASE = { Centers: 0, Edges: 1, 'Layer 1': 2, 'Layer 2': 2, 'Yellow top': 3, 'Last layer': 4 };
  const UPCOMING = 2; // how many next moves to preview
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

  class Player {
    constructor({ view, els }) {
      this.view = view;
      this.overlay = root.GoalOverlay ? new root.GoalOverlay(view) : null;
      this.els = els;
      this.chain = Promise.resolve();
      this.gen = 0;
      this.playing = false;
      this.busy = false;
      this.runId = 0; // each play() run owns an id; pause() retires the current one
      this.bindControls();
    }

    load(start, steps) {
      this.steps = steps;
      this.moves = steps.flatMap((s, i) => s.parts.flatMap((part) => part.moves.map((token) => ({ token, step: i, part }))));
      this.stepStart = [];
      let k = 0;
      steps.forEach((s) => { this.stepStart.push(k); k += s.moves.length; });
      this.states = [start];
      this.moves.forEach((m) => this.states.push(C.applyMove(this.states[this.states.length - 1], m.token)));
      this.cursor = 0;
      this.focusedStep = -1;
      this.stageOfStep = this.assignStages(steps);
      this.pause();
      this.renderList();
      this.renderStages();
      this.jumpTo(0);
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

    stageRange(stage) {
      const steps = this.stageOfStep.map((g, i) => (g === stage ? i : -1)).filter((i) => i >= 0);
      if (!steps.length) return null;
      const last = steps[steps.length - 1];
      return { start: this.stepStart[steps[0]], end: this.stepStart[last] + this.steps[last].moves.length };
    }

    get total() { return this.moves.length; }
    get speed() { return SPEED_MS[Number(this.els.speed.value) - 1] ?? 420; }
    stepOf(k) { return k >= this.total ? this.steps.length : this.moves[k].step; }

    // ---- actions --------------------------------------------------------
    enqueue(action) {
      const gen = this.gen;
      if (this.busy) this.view.finishNow();
      this.chain = this.chain.then(() => (gen === this.gen ? action() : null)).catch(() => {});
      return this.chain;
    }

    async animateTo(next, token) {
      this.busy = true;
      const gen = this.gen;
      this.renderNow(token, Math.min(this.cursor, next));
      this.overlay?.hideArrows();
      await this.view.animateMove(token, this.speed);
      this.busy = false;
      if (gen !== this.gen) return false;
      this.cursor = next;
      this.view.setState(this.states[this.cursor]);
      this.renderPosition();
      return true;
    }

    forward() {
      return this.enqueue(() => (this.cursor < this.total ? this.animateTo(this.cursor + 1, this.moves[this.cursor].token) : false));
    }

    back() {
      return this.enqueue(() => (this.cursor > 0 ? this.animateTo(this.cursor - 1, C.invertToken(this.moves[this.cursor - 1].token)) : false));
    }

    jumpTo(k) {
      this.gen++;
      this.view.finishNow();
      this.busy = false;
      this.chain = Promise.resolve();
      this.cursor = Math.max(0, Math.min(this.total, k));
      this.view.setState(this.states[this.cursor]);
      this.renderPosition();
    }

    nextStep() {
      this.pause();
      const s = this.stepOf(this.cursor);
      this.jumpTo(s + 1 < this.steps.length ? this.stepStart[s + 1] : this.total);
    }

    prevStep() {
      this.pause();
      const s = this.stepOf(this.cursor);
      const start = this.stepStart[s] ?? this.total;
      this.jumpTo(this.cursor > start ? start : this.stepStart[Math.max(0, s - 1)] ?? 0);
    }

    async play() {
      if (this.playing) return;
      if (this.cursor >= this.total) this.jumpTo(0);
      const run = ++this.runId;
      this.playing = true;
      this.renderPlayButton();
      const gen = this.gen;
      const live = () => run === this.runId && gen === this.gen;
      while (live() && this.cursor < this.total) {
        const before = this.stepOf(this.cursor);
        await this.forward();
        if (!live()) return;
        if (this.stepOf(this.cursor) === before || this.cursor >= this.total) continue;
        if (this.els.pauseAtStep.checked) break;
        // New step: show its goal for a moment before turning anything.
        this.setIntro(true);
        await wait(GOAL_HOLD_MS);
        this.setIntro(false);
      }
      if (live()) this.pause();
    }

    setIntro(on) {
      this.els.stepCard.querySelector('.goal')?.classList.toggle('is-intro', on);
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
      els.btnPrevStep.addEventListener('click', () => this.prevStep());
      els.btnNextStep.addEventListener('click', () => this.nextStep());
      els.btnPlay.addEventListener('click', () => this.toggle());
      els.btnRestart.addEventListener('click', () => { this.pause(); this.jumpTo(0); });
      els.stepCard.addEventListener('click', (e) => {
        const chip = e.target.closest('[data-move]');
        if (chip) { this.pause(); this.jumpTo(Number(chip.dataset.move)); }
      });
      els.phaseBar.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-stage]');
        const range = btn && this.stageRange(Number(btn.dataset.stage));
        if (range) { this.pause(); this.jumpTo(range.start); }
      });
      els.moveNext.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-move]');
        if (btn) { this.pause(); this.jumpTo(Number(btn.dataset.move)); }
      });
      els.stepList.addEventListener('click', (e) => {
        const row = e.target.closest('[data-step]');
        if (row) { this.pause(); this.jumpTo(this.stepStart[Number(row.dataset.step)]); }
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
    renderPlayButton() {
      this.els.btnPlay.textContent = this.playing ? 'Pause' : 'Play';
    }

    // `at` = index of the move being shown (the undone move while going back).
    renderNow(token, at = this.cursor) {
      const { els } = this;
      if (!token) {
        els.nowToken.textContent = '✓';
        els.nowTitle.textContent = 'Solved';
        els.nowDetail.textContent = 'Every face is one color. Use Back or the step list to review any part.';
        els.nowPart.textContent = '';
        return;
      }
      const ex = N.explain(token);
      els.nowToken.textContent = token;
      els.nowTitle.textContent = ex.title;
      els.nowDetail.textContent = ex.detail;
      const part = at < this.total ? this.moves[at].part : null;
      els.nowPart.textContent = part ? `${part.label}${part.why ? ` · ${part.why}` : ''}` : '';
    }

    renderPosition() {
      const { els, cursor, total } = this;
      // Re-rendering replaces the move chips; remember whether one had keyboard focus.
      const focused = document.activeElement;
      const hadChipFocus = focused?.dataset?.move !== undefined && (els.stepCard.contains(focused) || els.moveNext.contains(focused));
      const s = this.stepOf(cursor);
      this.renderNow(cursor < total ? this.moves[cursor].token : null);
      els.progress.style.width = `${total ? (cursor / total) * 100 : 100}%`;
      els.counterMoves.textContent = cursor < total ? `Next move ${cursor + 1} of ${total}` : `All ${total} moves done`;
      els.counterSteps.textContent = s < this.steps.length ? `Step ${s + 1} of ${this.steps.length}` : 'Finished';
      els.btnBack.disabled = cursor === 0;
      els.btnFwd.disabled = cursor >= total;
      this.renderCard(s);
      this.renderListState(s);
      this.renderGoal(s);
      this.renderStageState();
      this.renderUpcoming();
      if (hadChipFocus) {
        const target = els.stepCard.querySelector(`[data-move="${cursor}"]`) || els.btnFwd;
        target.focus({ preventScroll: true });
      }
      if (s !== this.focusedStep) {
        this.focusedStep = s;
        const step = this.steps[s];
        const groups = step ? step.goal.items.flatMap((it) => it.groups) : [];
        if (groups.length) this.view.focusOnStickers(groups.flatMap((g) => [...g.from, ...g.to]), step.focus);
        else this.view.focus(step?.focus ?? null);
      }
    }

    // Violet = where the goal pieces are right now, cyan = where they must end up.
    renderGoal(s) {
      if (!this.overlay) return;
      const step = this.steps[s];
      if (!step) { this.overlay.clear(); return; }
      const done = this.moves.slice(this.stepStart[s], this.cursor).map((m) => m.token);
      this.overlay.show(step.goal.items.flatMap((it) => it.groups)
        .map((g) => ({ from: root.Goals.track(g.from, done), to: g.to })));
    }

    renderGoalBox(goal) {
      if (!goal?.summary) return '';
      const swatches = (cols) => `<span class="swatches">${cols.map((c) => `<i class="sw sw-${c}"></i>`).join('')}</span>`;
      const routes = goal.items.map((it) => `<li>${swatches(it.colors)}<b>${esc(it.name)}</b><span>${it.inPlace
        ? 'stays in its slot'
        : `${esc(it.fromName)} <span class="route-arrow" aria-hidden="true">→</span> ${esc(it.toName)}`}</span></li>`).join('');
      return `<div class="goal"><p class="goal-text">${esc(goal.summary)}</p><ul class="goal-routes">${routes}</ul></div>`;
    }

    renderCard(s) {
      const card = this.els.stepCard;
      if (s >= this.steps.length) {
        card.innerHTML = '<div class="finished"><div class="eyebrow">Done</div><h2>Your cube is solved</h2>'
          + `<p>${this.steps.length} steps, ${this.total} moves. Press Restart to watch the whole solve again.</p></div>`;
        return;
      }
      const step = this.steps[s];
      let k = this.stepStart[s];
      const parts = step.parts.map((part) => {
        const first = k;
        const chips = part.moves.map((m) => {
          const idx = k++;
          const cls = idx < this.cursor ? 'done' : idx === this.cursor ? 'current' : '';
          return `<button type="button" class="token ${cls}" data-move="${idx}" title="${esc(N.explain(m).title)}">${esc(m)}</button>`;
        }).join('');
        const state = this.cursor >= k ? 'is-done' : this.cursor >= first ? 'is-current' : '';
        const why = part.why ? `<span class="part-why">${esc(part.why)}</span>` : '';
        return `<li class="part ${state}"><div class="part-head"><span class="part-label">${esc(part.label)}</span>${why}</div>`
          + `<div class="chips">${chips}</div></li>`;
      }).join('');
      card.innerHTML = `<div class="meta"><span class="eyebrow">${esc(step.phase)}</span>`
        + `<span class="eyebrow">${step.moves.length} moves</span></div>`
        + `<h2>${esc(step.title)}</h2>${this.renderGoalBox(step.goal)}`
        + `<ol class="parts">${parts}</ol>`
        + `<details class="how-to"><summary>How it works</summary><p>${esc(step.text)}</p></details>`;
    }

    renderStages() {
      this.els.phaseBar.innerHTML = STAGES.map((name, i) => {
        const range = this.stageRange(i);
        return `<li><button type="button" class="phase" data-stage="${i}" ${range ? '' : 'disabled'}>`
          + `<span class="phase-track"><span class="phase-fill"></span></span>`
          + `<span class="phase-name">${esc(name)}</span></button></li>`;
      }).join('');
    }

    renderStageState() {
      this.els.phaseBar.querySelectorAll('.phase').forEach((btn) => {
        const range = this.stageRange(Number(btn.dataset.stage));
        const len = range ? range.end - range.start : 0;
        const done = range ? Math.max(0, Math.min(len, this.cursor - range.start)) : 0;
        const finished = !range || this.cursor >= range.end;
        btn.querySelector('.phase-fill').style.width = `${finished ? 100 : (done / len) * 100}%`;
        btn.classList.toggle('is-done', finished);
        btn.classList.toggle('is-current', !!range && !finished && this.cursor >= range.start);
      });
    }

    renderUpcoming() {
      const next = this.moves.slice(this.cursor + 1, this.cursor + 1 + UPCOMING);
      this.els.moveNext.innerHTML = next.length
        ? '<span class="then">Then</span>' + next.map((m, k) => {
          const idx = this.cursor + 1 + k;
          return `<button type="button" data-move="${idx}" title="${esc(N.explain(m.token).title)}">${esc(m.token)}</button>`;
        }).join('')
        : '';
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
        row.classList.toggle('done', i < s);
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
