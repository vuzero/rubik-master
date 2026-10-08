/*
 * Three.js view of a 2x2, 3x3 or 4x4 cube. Cubies never move: the view only
 * recolors stickers (setState) or fades them from one state to another
 * (tweenColors), so the picture always matches the logical state exactly.
 */
(function (root) {
  'use strict';
  const C = root.Cube4;

  const STICKER_HEX = { W: 0xf4f5f0, Y: 0xffd200, G: 0x00a651, B: 0x0b55c4, R: 0xc8102e, O: 0xff6a13 };
  const BLANK_HEX = 0x6f7885;
  const PLASTIC_HEX = 0x14171c;
  // Model rotations [x, y] that bring a face into the camera's view.
  const FOCUS = {
    default: [0.05, -0.12], U: [0.35, -0.12], F: [0.05, -0.12], R: [0.05, -0.55],
    D: [-1.0, -0.12], L: [0.05, 1.3], B: [0.05, Math.PI - 0.5],
  };
  const FOCUS_CANDIDATES = [
    ...Object.values(FOCUS),
    ...[0.05, 0.5, -0.95].flatMap((x) => Array.from({ length: 8 }, (_, k) => [x, -0.12 + (k * Math.PI) / 4])),
  ];
  const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const DOUBLE_TAP_MS = 320;
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  function roundedSquare(size, radius) {
    const s = size / 2;
    const shape = new THREE.Shape();
    shape.moveTo(-s + radius, -s);
    shape.lineTo(s - radius, -s);
    shape.quadraticCurveTo(s, -s, s, -s + radius);
    shape.lineTo(s, s - radius);
    shape.quadraticCurveTo(s, s, s - radius, s);
    shape.lineTo(-s + radius, s);
    shape.quadraticCurveTo(-s, s, -s, s - radius);
    shape.lineTo(-s, -s + radius);
    shape.quadraticCurveTo(-s, -s, -s + radius, -s);
    return new THREE.ShapeGeometry(shape);
  }

  class CubeView {
    constructor(container, size = 4) {
      this.container = container;
      this.size = size;
      this.renderListeners = [];
      this.ok = typeof THREE !== 'undefined' && this.initRenderer();
      if (!this.ok) {
        container.innerHTML = '<div class="fallback">This browser cannot show the 3D cube (WebGL is off or unsupported). The move list and goals still work.</div>';
        return;
      }
      this.buildCube();
      this.bindDrag();
      this.observeSize();
      this.render();
    }

    initRenderer() {
      try {
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      } catch (e) {
        return false;
      }
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      const canvas = this.renderer.domElement;
      canvas.setAttribute('role', 'img');
      canvas.setAttribute('aria-label', '3D view of the cube. Drag to look around; double-click or double-tap to reset the view.');
      // Mobile browsers may drop the GPU context; redraw once it comes back.
      canvas.addEventListener('webglcontextlost', (e) => e.preventDefault());
      canvas.addEventListener('webglcontextrestored', () => this.render());
      this.container.appendChild(canvas);
      this.scene = new THREE.Scene();
      this.camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
      this.camera.position.set(6.4, 5.4, 8.6);
      this.camera.lookAt(0, 0, 0);
      this.scene.add(new THREE.HemisphereLight(0xffffff, 0x8890a0, 0.95));
      const key = new THREE.DirectionalLight(0xffffff, 0.55);
      key.position.set(4, 8, 6);
      this.scene.add(key);
      this.root = new THREE.Group();
      this.root.rotation.set(0.05, -0.12, 0);
      this.scene.add(this.root);
      return true;
    }

    /** Switch to a 2x2, 3x3 or 4x4 model; existing sticker colors are reset. */
    setSize(size) {
      if (!this.ok || size === this.size) return;
      this.finishNow();
      // Sticker materials are per sticker; plastic and goal-frame materials are shared and kept.
      this.stickers.forEach((m) => m.material.dispose());
      this.cubies.forEach((cubie) => this.root.remove(cubie));
      this.size = size;
      this.buildCube();
      this.render();
    }

    buildCube() {
      this.geom = C.geometry(this.size);
      // Draw every size at the same on-screen size: the 4x4 spans 4 units.
      this.root.scale.setScalar(4 / this.size);
      const cubieGeo = new THREE.BoxGeometry(0.98, 0.98, 0.98);
      this.plastic = this.plastic || new THREE.MeshStandardMaterial({ color: PLASTIC_HEX, roughness: 0.55 });
      const plastic = this.plastic;
      const stickerGeo = roundedSquare(0.84, 0.12);
      const zAxis = new THREE.Vector3(0, 0, 1);
      const cubies = new Map();
      this.stickers = [];

      this.geom.forEach((g, i) => {
        const key = g.p.join(',');
        let cubie = cubies.get(key);
        if (!cubie) {
          cubie = new THREE.Group();
          cubie.add(new THREE.Mesh(cubieGeo, plastic));
          cubie.position.set(g.p[0] / 2, g.p[1] / 2, g.p[2] / 2);
          cubie.userData.p = g.p;
          cubies.set(key, cubie);
          this.root.add(cubie);
        }
        const mat = new THREE.MeshStandardMaterial({ color: BLANK_HEX, roughness: 0.35, emissive: 0x000000 });
        const mesh = new THREE.Mesh(stickerGeo, mat);
        const n = new THREE.Vector3(...g.n);
        mesh.quaternion.setFromUnitVectors(zAxis, n);
        mesh.position.copy(n.multiplyScalar(0.493));
        cubie.add(mesh);
        this.stickers[i] = mesh;
      });
      this.cubies = [...cubies.values()];
    }

    setState(letters) {
      if (!this.ok) return;
      this.finishNow();
      letters.forEach((c, i) => {
        this.stickers[i].material.color.setHex(STICKER_HEX[c] ?? BLANK_HEX);
      });
      this.render();
    }

    highlight(index) {
      if (!this.ok) return;
      this.stickers.forEach((m, i) => m.material.emissive.setHex(i === index ? 0x3a3f4a : 0x000000));
      this.render();
    }

    finishNow() {
      if (this.active) this.active.done();
    }

    /**
     * Fade every sticker from one state's colors to another's. Used to go from a
     * step's plan straight to its result without showing the moves in between.
     */
    tweenColors(fromLetters, toLetters, durationMs) {
      if (!this.ok || reducedMotion() || durationMs <= 0) return this.hold(0);
      this.finishNow();
      const changed = [];
      fromLetters.forEach((c, i) => {
        if (c !== toLetters[i]) {
          changed.push({
            mat: this.stickers[i].material,
            from: new THREE.Color(STICKER_HEX[c] ?? BLANK_HEX),
            to: new THREE.Color(STICKER_HEX[toLetters[i]] ?? BLANK_HEX),
          });
        }
      });
      return new Promise((resolve) => {
        const start = performance.now();
        const done = () => {
          changed.forEach((c) => c.mat.color.copy(c.to));
          this.active = null;
          this.render();
          resolve();
        };
        this.active = { done };
        const tick = (now) => {
          if (this.active?.done !== done) return;
          const t = Math.min(1, (now - start) / durationMs);
          const e = ease(t);
          changed.forEach((c) => c.mat.color.copy(c.from).lerp(c.to, e));
          this.render();
          if (t < 1) requestAnimationFrame(tick);
          else done();
        };
        requestAnimationFrame(tick);
      });
    }

    /** Wait like a move would, without animating; finishNow() ends it early. */
    hold(durationMs) {
      this.finishNow();
      return new Promise((resolve) => {
        const done = () => {
          clearTimeout(timer);
          if (this.active?.done === done) this.active = null;
          resolve();
        };
        const timer = setTimeout(done, Math.max(0, durationMs));
        this.active = { done };
      });
    }

    bindDrag() {
      const el = this.renderer.domElement;
      let last = null;
      el.addEventListener('pointerdown', (e) => {
        last = { x: e.clientX, y: e.clientY };
        this.focusToken = null;
        el.setPointerCapture(e.pointerId);
      });
      el.addEventListener('pointermove', (e) => {
        if (!last) return;
        const dx = e.clientX - last.x;
        const dy = e.clientY - last.y;
        last = { x: e.clientX, y: e.clientY };
        this.root.rotation.y += dx * 0.01;
        this.root.rotation.x = Math.max(-1.2, Math.min(1.2, this.root.rotation.x + dy * 0.01));
        this.render();
      });
      const end = () => { last = null; };
      el.addEventListener('pointerup', end);
      el.addEventListener('pointercancel', end);
      el.addEventListener('dblclick', () => this.resetView());
      let lastTap = 0;
      el.addEventListener('pointerup', (e) => {
        if (e.pointerType !== 'touch') return;
        const now = performance.now();
        if (now - lastTap < DOUBLE_TAP_MS) this.resetView();
        lastTap = now;
      });
    }

    resetView() {
      this.focus(null, 0);
    }

    /** Smoothly turn the model so `face` (U/D/F/B/L/R or null = default) is in view. */
    focus(face, durationMs = 600) {
      if (!this.ok) return;
      this.focusAngles(FOCUS[face] || FOCUS.default, durationMs);
    }

    /**
     * Turn the model so as many of the given stickers as possible face the camera,
     * preferring `face`'s view and small turns when several views work equally well.
     */
    focusOnStickers(indices, face, durationMs = 600) {
      if (!this.ok) return;
      const camDir = this.camera.position.clone().normalize();
      const normals = indices.map((i) => new THREE.Vector3(...this.geom[i].n));
      const preferred = FOCUS[face] || FOCUS.default;
      const cur = this.root.rotation;
      let best = null;
      FOCUS_CANDIDATES.forEach(([x, y]) => {
        const euler = new THREE.Euler(x, y, 0, 'XYZ');
        const facing = normals.map((n) => n.clone().applyEuler(euler).dot(camDir));
        const seen = facing.filter((d) => d > 0.2).length;
        const angle = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
        const score = seen * 10 + facing.reduce((sum, d) => sum + Math.max(0, d), 0)
          - (x === preferred[0] && Math.abs(angle(y, preferred[1])) < 0.01 ? 0 : 1.5)
          - (angle(x, cur.x) + angle(y, cur.y)) * 0.6;
        if (!best || score > best.score) best = { score, x, y };
      });
      this.focusAngles([best.x, best.y], durationMs);
    }

    focusAngles([tx, ty], requestedMs = 600) {
      const durationMs = reducedMotion() ? 0 : requestedMs;
      const from = { x: this.root.rotation.x, y: this.root.rotation.y };
      // Take the short way round on y.
      const TAU = Math.PI * 2;
      const dy = ((((ty - from.y + Math.PI) % TAU) + TAU) % TAU) - Math.PI;
      const start = performance.now();
      const token = {};
      this.focusToken = token;
      const tick = (now) => {
        if (this.focusToken !== token) return;
        const t = durationMs > 0 ? Math.min(1, (now - start) / durationMs) : 1;
        const e = ease(t);
        this.root.rotation.x = from.x + (tx - from.x) * e;
        this.root.rotation.y = from.y + dy * e;
        this.render();
        if (t < 1) requestAnimationFrame(tick);
      };
      if (durationMs > 0) requestAnimationFrame(tick); else tick(start);
    }

    observeSize() {
      const resize = () => {
        const { clientWidth: w, clientHeight: h } = this.container;
        if (!w || !h) return;
        this.renderer.setSize(w, h, false);
        this.camera.aspect = w / h;
        this.camera.fov = w < h ? 36 : 30;
        this.camera.updateProjectionMatrix();
        this.render();
      };
      new ResizeObserver(resize).observe(this.container);
      resize();
    }

    render() {
      if (!this.ok) return;
      this.renderer.render(this.scene, this.camera);
      this.renderListeners.forEach((fn) => fn());
    }

    /** Run `fn` after every frame (used to keep screen-space labels on their stickers). */
    onRender(fn) {
      this.renderListeners.push(fn);
    }
  }

  root.CubeView = CubeView;
})(typeof window !== 'undefined' ? window : globalThis);
