/*
 * Draws a step's goal on the 3D cube:
 *   - a violet frame on the stickers of the piece being moved, a cyan frame
 *     around the slots it must reach (frames are children of the sticker
 *     meshes, so the violet one rides along while a layer turns);
 *   - a slim curved arrow from piece to destination (hidden during a turn);
 *   - "From" / "To" labels pinned to the cube in screen space, with a leader
 *     line to the exact stickers. Labels are re-placed after every frame, so
 *     they follow the piece while it turns and the cube while it is dragged.
 */
(function (root) {
  'use strict';

  const SRC_HEX = 0x8b5cf6;
  const DST_HEX = 0x19d3ff;
  const SRC_CSS = '#8b5cf6';
  const DST_CSS = '#19d3ff';
  const OUT = 0.12; // arrow ends float this far above the stickers
  const LABEL_GAP_PX = 40; // minimum distance from sticker to label
  const CLEAR_PX = 16; // labels sit at least this far outside the cube's outline
  const LABEL_H = 26;
  const cubeCorners = (h) => [-h, h].flatMap((x) => [-h, h].flatMap((y) => [-h, h].map((z) => [x, y, z])));
  const MERGE_UNITS = 1.2; // destinations closer than this share one "To" label
  const SVG_NS = 'http://www.w3.org/2000/svg';

  function roundedRing(outer, inner, radius) {
    const rect = (path, size, r) => {
      const s = size / 2;
      path.moveTo(-s + r, -s);
      path.lineTo(s - r, -s);
      path.quadraticCurveTo(s, -s, s, -s + r);
      path.lineTo(s, s - r);
      path.quadraticCurveTo(s, s, s - r, s);
      path.lineTo(-s + r, s);
      path.quadraticCurveTo(-s, s, -s, s - r);
      path.lineTo(-s, -s + r);
      path.quadraticCurveTo(-s, -s, -s + r, -s);
    };
    const shape = new THREE.Shape();
    rect(shape, outer, radius);
    const hole = new THREE.Path();
    rect(hole, inner, Math.max(0.01, radius - (outer - inner) / 2));
    shape.holes.push(hole);
    return new THREE.ShapeGeometry(shape);
  }

  // Point just above a group of stickers, in the cube's own (home) frame.
  function groupAnchor(group, geom) {
    const p = new THREE.Vector3();
    const n = new THREE.Vector3();
    group.forEach((i) => {
      const g = geom[i];
      const normal = new THREE.Vector3(...g.n);
      p.add(new THREE.Vector3(g.p[0] / 2, g.p[1] / 2, g.p[2] / 2).addScaledVector(normal, 0.5));
      n.add(normal);
    });
    p.divideScalar(group.length);
    return p.addScaledVector(n.normalize(), OUT);
  }

  const sameSlots = (a, b) => a.length === b.length && a.every((i) => b.includes(i));

  class GoalOverlay {
    constructor(view) {
      this.view = view;
      this.labels = [];
      if (!view.ok) return;
      this.srcGeo = roundedRing(0.9, 0.62, 0.14);
      this.dstGeo = roundedRing(1.06, 0.9, 0.2);
      this.srcMat = new THREE.MeshBasicMaterial({ color: SRC_HEX });
      this.dstMat = new THREE.MeshBasicMaterial({ color: DST_HEX });
      this.arrowMat = new THREE.MeshBasicMaterial({ color: SRC_HEX, transparent: true, opacity: 0.9 });
      this.attachFrames();
      this.arrows = new THREE.Group();
      view.root.add(this.arrows);

      this.svg = document.createElementNS(SVG_NS, 'svg');
      this.svg.setAttribute('class', 'goal-labels');
      this.svg.setAttribute('aria-hidden', 'true');
      view.container.appendChild(this.svg);
      view.onRender(() => this.placeLabels());
    }

    /** Give every sticker its (hidden) frames; call again after the view changes size. */
    attachFrames() {
      if (!this.view.ok) return;
      const frames = (geo, mat, z) => this.view.stickers.map((sticker) => {
        const m = new THREE.Mesh(geo, mat);
        m.position.z = z;
        m.visible = false;
        sticker.add(m);
        return m;
      });
      this.src = frames(this.srcGeo, this.srcMat, 0.008);
      this.dst = frames(this.dstGeo, this.dstMat, 0.004);
    }

    /** @param {{from: number[], to: number[]}[]} moves piece groups: where each is now, where it must go */
    show(moves) {
      if (!this.view.ok) return;
      const now = new Set(moves.flatMap((m) => m.from));
      const goal = new Set(moves.flatMap((m) => m.to));
      this.src.forEach((m, i) => { m.visible = now.has(i); });
      this.dst.forEach((m, i) => { m.visible = goal.has(i); });
      this.clearArrows();
      moves.forEach((m) => this.addArrow(m.from, m.to));
      this.arrows.visible = true;
      this.buildLabels(moves);
      this.view.render();
    }

    /** After a step: frame the destination slots (now holding their pieces) and label them "Done". */
    showResult(groups) {
      if (!this.view.ok) return;
      const slots = new Set(groups.flat());
      this.src.forEach((m) => { m.visible = false; });
      this.dst.forEach((m, i) => { m.visible = slots.has(i); });
      this.clearArrows();
      this.labels = this.mergeTargets(groups).map((t) => ({ kind: 'to', text: 'Done ✓', groups: t.groups, stickers: t.groups.flat() }));
      this.drawLabels();
      this.view.render();
    }

    hideArrows() {
      if (this.view.ok) this.arrows.visible = false;
    }

    clear() {
      if (!this.view.ok) return;
      this.src.forEach((m) => { m.visible = false; });
      this.dst.forEach((m) => { m.visible = false; });
      this.clearArrows();
      this.buildLabels([]);
      this.view.render();
    }

    clearArrows() {
      this.arrows.children.slice().forEach((child) => {
        child.geometry.dispose();
        this.arrows.remove(child);
      });
    }

    addArrow(fromGroup, toGroup) {
      if (sameSlots(fromGroup, toGroup)) return;
      const a = groupAnchor(fromGroup, this.view.geom);
      const b = groupAnchor(toGroup, this.view.geom);
      const dist = a.distanceTo(b);
      if (dist < 0.05) return;

      // Bow the arrow outward so it arcs over the cube instead of cutting through it.
      const mid = a.clone().add(b).multiplyScalar(0.5);
      let out = mid.clone();
      if (out.length() < 0.6) {
        out = new THREE.Vector3().crossVectors(a, new THREE.Vector3(0, 1, 0));
        if (out.length() < 0.1) out.crossVectors(a, new THREE.Vector3(1, 0, 0));
      }
      const radius = Math.max(a.length(), b.length());
      const ctrl = out.normalize().multiplyScalar(radius + 0.3 + dist * 0.25);
      const curve = new THREE.QuadraticBezierCurve3(a, ctrl, b);

      this.arrows.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 48, 0.026, 8, false), this.arrowMat));
      const headLen = 0.24;
      const headGeo = new THREE.ConeGeometry(0.085, headLen, 16);
      headGeo.translate(0, -headLen / 2, 0); // tip at the origin
      const head = new THREE.Mesh(headGeo, this.arrowMat);
      head.position.copy(b);
      head.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), curve.getTangent(1).normalize());
      this.arrows.add(head);
    }

    // ---- From / To labels ---------------------------------------------------
    buildLabels(moves) {
      const moving = moves.filter((m) => !sameSlots(m.from, m.to));
      const labels = [];
      if (!moving.length && moves.length) {
        labels.push({ kind: 'to', text: 'Turn here', groups: moves.map((m) => m.to) });
      } else {
        moving.forEach((m, k) => {
          labels.push({ kind: 'from', text: moving.length > 1 ? `From ${k + 1}` : 'From', groups: [m.from] });
        });
        // One "To" per distinct destination; halves of one edge share a label.
        const targets = this.mergeTargets(moving.map((m) => m.to));
        targets.forEach((t) => labels.push({
          kind: 'to',
          text: moving.length > 1 && targets.length > 1 ? `To ${t.nums.join('+')}` : 'To',
          groups: t.groups,
        }));
      }
      this.labels = labels.map((l) => ({ ...l, stickers: l.groups.flat() }));
      this.drawLabels();
    }

    // Destinations closer than MERGE_UNITS share one label; nums are 1-based group numbers.
    mergeTargets(groups) {
      const targets = [];
      groups.forEach((g, k) => {
        const anchor = groupAnchor(g, this.view.geom);
        const near = targets.find((t) => t.anchor.distanceTo(anchor) < MERGE_UNITS);
        if (near) { near.groups.push(g); near.nums.push(k + 1); } else targets.push({ anchor, groups: [g], nums: [k + 1] });
      });
      return targets;
    }

    drawLabels() {
      this.svg.innerHTML = this.labels.map((l) => {
        const fill = l.kind === 'from' ? SRC_CSS : DST_CSS;
        const ink = l.kind === 'from' ? '#ffffff' : '#04263a';
        const w = Math.round(l.text.length * 8.4 + 26);
        return `<g class="goal-label" data-w="${w}"><line stroke="${fill}" stroke-width="2"/>`
          + `<circle r="3.5" fill="${fill}"/><rect width="${w}" height="${LABEL_H}" rx="${LABEL_H / 2}" fill="${fill}"/>`
          + `<text fill="${ink}" text-anchor="middle" dominant-baseline="central">${l.text}</text></g>`;
      }).join('');
      this.placeLabels();
    }

    // Screen position of a set of stickers (following their live meshes), and whether they face the camera.
    screenAnchor(stickers, w, h) {
      const p = new THREE.Vector3();
      const n = new THREE.Vector3();
      const tmp = new THREE.Vector3();
      stickers.forEach((i) => {
        const mesh = this.view.stickers[i];
        p.add(mesh.getWorldPosition(tmp));
        n.add(mesh.getWorldDirection(tmp));
      });
      p.divideScalar(stickers.length);
      n.normalize();
      const facing = n.dot(this.view.camera.position.clone().sub(p).normalize());
      const s = p.addScaledVector(n, 0.06).project(this.view.camera);
      return { x: (s.x + 1) / 2 * w, y: (1 - s.y) / 2 * h, facing };
    }

    placeLabels() {
      if (!this.svg || !this.labels.length) return;
      const w = this.view.container.clientWidth;
      const h = this.view.container.clientHeight;
      if (!w || !h) return;
      this.svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
      const toScreen = (v) => {
        const s = v.project(this.view.camera);
        return { x: (s.x + 1) / 2 * w, y: (1 - s.y) / 2 * h };
      };
      this.view.root.updateMatrixWorld();
      const center = toScreen(new THREE.Vector3().applyMatrix4(this.view.root.matrixWorld));
      // Radius of the cube's outline on screen, so labels can be kept outside it.
      const outline = Math.max(...cubeCorners(this.view.size / 2).map((c) => {
        const p = toScreen(new THREE.Vector3(...c).applyMatrix4(this.view.root.matrixWorld));
        return Math.hypot(p.x - center.x, p.y - center.y);
      }));
      const placed = [];
      [...this.svg.querySelectorAll('.goal-label')].forEach((g, k) => {
        const a = this.screenAnchor(this.labels[k].stickers, w, h);
        let dx = a.x - center.x;
        let dy = a.y - center.y;
        const len = Math.hypot(dx, dy) || 1;
        dx /= len; dy /= len;
        const lw = Number(g.dataset.w);
        // Distance from the cube's center: outside the outline, and never closer than the gap to the sticker.
        const halfExtent = Math.abs(dx) * lw / 2 + Math.abs(dy) * LABEL_H / 2;
        let r = Math.max(len + LABEL_GAP_PX, outline * 0.92 + CLEAR_PX + halfExtent);
        let lx = center.x + dx * r;
        let ly = center.y + dy * r;
        // Push apart labels that would overlap an earlier one.
        while (placed.some((q) => Math.abs(q.x - lx) < (q.w + lw) / 2 + 6 && Math.abs(q.y - ly) < LABEL_H + 6) && r < len + 260) {
          r += 16;
          lx = center.x + dx * r;
          ly = center.y + dy * r;
        }
        lx = Math.min(w - lw / 2 - 4, Math.max(lw / 2 + 4, lx));
        ly = Math.min(h - LABEL_H / 2 - 4, Math.max(LABEL_H / 2 + 4, ly));
        placed.push({ x: lx, y: ly, w: lw });
        const [line, dot, rect, text] = g.children;
        line.setAttribute('x1', a.x); line.setAttribute('y1', a.y);
        line.setAttribute('x2', lx); line.setAttribute('y2', ly);
        dot.setAttribute('cx', a.x); dot.setAttribute('cy', a.y);
        rect.setAttribute('x', lx - lw / 2); rect.setAttribute('y', ly - LABEL_H / 2);
        text.setAttribute('x', lx); text.setAttribute('y', ly);
        // A label whose stickers face away from the camera is dimmed: it is behind the cube.
        g.setAttribute('opacity', a.facing > -0.2 ? '1' : '0.5');
      });
    }
  }

  root.GoalOverlay = GoalOverlay;
})(typeof window !== 'undefined' ? window : globalThis);
