/*
 * Color input: a palette plus an unfolded net of 6 faces of n x n stickers (n = 2, 3 or 4).
 * Click or drag across stickers to paint them with the selected color.
 */
(function (root) {
  'use strict';
  const C = root.Cube4;
  const NAMES = root.Validate.COLOR_NAMES;
  const CSS_COLOR = { W: '#f4f5f0', Y: '#ffd200', G: '#00a651', B: '#0b55c4', R: '#c8102e', O: '#ff6a13' };
  const KEYS = { W: '1', Y: '2', G: '3', B: '4', R: '5', O: '6' };
  const FACE_TITLE = { U: 'Top', L: 'Left', F: 'Front', R: 'Right', B: 'Back', D: 'Bottom' };

  class Editor {
    constructor({ paletteEl, netEl, onChange, onHover, size = 4 }) {
      this.paletteEl = paletteEl;
      this.netEl = netEl;
      this.onChange = onChange;
      this.onHover = onHover;
      this.size = size;
      this.colors = new Array(6 * size * size).fill(null);
      this.current = 'W';
      this.buildPalette();
      this.buildNet();
      this.bindPainting();
      this.bindKeys();
    }

    /** Switch to a 2x2, 3x3 or 4x4 net. The caller then sets the colors. */
    setSize(size) {
      if (size === this.size) return;
      this.size = size;
      this.netEl.innerHTML = '';
      this.buildNet();
    }

    buildPalette() {
      this.swatches = {};
      C.COLORS.forEach((col) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'swatch';
        b.id = `swatch-${col}`;
        b.setAttribute('aria-pressed', String(col === this.current));
        b.innerHTML = `<span class="chip sw-${col}"></span>`
          + `<span>${NAMES[col]}</span><span class="count"></span><kbd>${KEYS[col]}</kbd>`;
        b.addEventListener('click', () => this.select(col));
        this.paletteEl.appendChild(b);
        this.swatches[col] = b;
      });
    }

    buildNet() {
      const n = this.size;
      this.cells = [];
      ['U', 'L', 'F', 'R', 'B', 'D'].forEach((face) => {
        const f = C.FACES.indexOf(face);
        const wrap = document.createElement('div');
        wrap.className = 'face';
        wrap.dataset.face = face;
        wrap.innerHTML = `<div class="face-label">${FACE_TITLE[face]} <b>${face}</b></div>`;
        const grid = document.createElement('div');
        grid.className = `face-grid n${n}`;
        for (let k = 0; k < n * n; k++) {
          const idx = f * n * n + k;
          const cell = document.createElement('button');
          cell.type = 'button';
          cell.className = 'sticker';
          cell.dataset.index = String(idx);
          cell.dataset.where = `${FACE_TITLE[face]} face, row ${Math.floor(k / n) + 1}, column ${(k % n) + 1}`;
          grid.appendChild(cell);
          this.cells[idx] = cell;
        }
        wrap.appendChild(grid);
        this.netEl.appendChild(wrap);
      });
    }

    // Listeners live on the net container, so they survive rebuilding the net.
    bindPainting() {
      let painting = false;
      const cellAt = (e) => {
        const el = document.elementFromPoint(e.clientX, e.clientY);
        return el && el.classList.contains('sticker') ? el : null;
      };
      this.netEl.addEventListener('pointerdown', (e) => {
        const cell = cellAt(e);
        if (!cell) return;
        e.preventDefault();
        painting = true;
        this.paint(Number(cell.dataset.index));
      });
      this.netEl.addEventListener('pointermove', (e) => {
        const cell = cellAt(e);
        this.onHover?.(cell ? Number(cell.dataset.index) : null);
        if (painting && cell) this.paint(Number(cell.dataset.index));
      });
      this.netEl.addEventListener('pointerleave', () => this.onHover?.(null));
      const stop = () => { painting = false; };
      window.addEventListener('pointerup', stop);
      window.addEventListener('pointercancel', stop);
      // Keyboard users: Enter/Space on a focused sticker paints it.
      this.netEl.addEventListener('click', (e) => {
        if (e.detail !== 0) return;
        const cell = e.target.closest('.sticker');
        if (cell) this.paint(Number(cell.dataset.index));
      });
    }

    bindKeys() {
      window.addEventListener('keydown', (e) => {
        if (e.metaKey || e.ctrlKey || e.altKey || this.netEl.closest('[hidden]')) return;
        const col = Object.keys(KEYS).find((c) => KEYS[c] === e.key || c === e.key.toUpperCase());
        if (col && !/input|textarea|select/i.test(e.target.tagName)) this.select(col);
      });
    }

    select(col) {
      this.current = col;
      Object.entries(this.swatches).forEach(([c, b]) => b.setAttribute('aria-pressed', String(c === col)));
    }

    paint(idx) {
      if (this.colors[idx] === this.current) return;
      this.colors = this.colors.map((c, i) => (i === idx ? this.current : c));
      this.refresh();
      this.onChange(this.colors, 'paint');
    }

    setColors(colors) {
      this.colors = colors.slice();
      this.refresh();
      this.onChange(this.colors);
    }

    refresh() {
      this.colors.forEach((c, i) => {
        const cell = this.cells[i];
        cell.style.background = c ? CSS_COLOR[c] : '';
        cell.classList.toggle('blank', !c);
        cell.setAttribute('aria-label', `${cell.dataset.where}: ${c ? NAMES[c] : 'blank'}`);
      });
      const each = this.size * this.size;
      C.COLORS.forEach((col) => {
        const n = this.colors.filter((c) => c === col).length;
        const el = this.swatches[col].querySelector('.count');
        el.textContent = `${n}/${each}`;
        el.className = `count${n > each ? ' over' : n === each ? ' full' : ''}`;
      });
    }
  }

  root.Editor = Editor;
})(typeof window !== 'undefined' ? window : globalThis);
