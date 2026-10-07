/*
 * 4x4 cube model.
 *
 * The cube is 96 stickers. Each sticker has a 3D cubie position p (coords in
 * {-3,-1,1,3}) and an outward normal n. A move rotates every sticker whose
 * position lies in the turned layers, so every move becomes a permutation of
 * the 96 sticker slots. State = array of 96 color letters.
 *
 * Sticker index = face * 16 + row * 4 + col, faces ordered U R F D L B,
 * each face read as it appears in the unfolded net (see stickerGeom).
 */
(function (root) {
  'use strict';

  const FACES = ['U', 'R', 'F', 'D', 'L', 'B'];
  const COLORS = ['W', 'Y', 'G', 'B', 'R', 'O'];
  const N = 4;
  const STICKERS = 96;

  // Axis index and sign of each face's outward normal.
  const FACE_AXIS = { U: [1, 1], D: [1, -1], R: [0, 1], L: [0, -1], F: [2, 1], B: [2, -1] };

  function stickerGeom(face, r, c) {
    switch (face) {
      case 'U': return { p: [-3 + 2 * c, 3, -3 + 2 * r], n: [0, 1, 0] };
      case 'D': return { p: [-3 + 2 * c, -3, 3 - 2 * r], n: [0, -1, 0] };
      case 'F': return { p: [-3 + 2 * c, 3 - 2 * r, 3], n: [0, 0, 1] };
      case 'B': return { p: [3 - 2 * c, 3 - 2 * r, -3], n: [0, 0, -1] };
      case 'R': return { p: [3, 3 - 2 * r, 3 - 2 * c], n: [1, 0, 0] };
      case 'L': return { p: [-3, 3 - 2 * r, -3 + 2 * c], n: [-1, 0, 0] };
      default: throw new Error('Unknown face ' + face);
    }
  }

  const GEOM = [];
  const KEY_TO_INDEX = new Map();
  const geomKey = (p, n) => p.join(',') + '|' + n.join(',');

  FACES.forEach((face, f) => {
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        const g = stickerGeom(face, r, c);
        const idx = f * 16 + r * 4 + c;
        GEOM[idx] = { ...g, face, f, r, c };
        KEY_TO_INDEX.set(geomKey(g.p, g.n), idx);
      }
    }
  });

  // Rotate vector v by +90deg (right-hand rule) about axis, q times.
  function rot(v, axis, q) {
    let [x, y, z] = v;
    for (let i = 0; i < q; i++) {
      if (axis === 0) [x, y, z] = [x, -z, y];
      else if (axis === 1) [x, y, z] = [z, y, -x];
      else [x, y, z] = [-y, x, z];
    }
    return [x, y, z];
  }

  /*
   * Notation:
   *   R U F L D B      outer face, clockwise as seen looking at that face
   *   Rw Uw ...        wide: outer layer + the inner layer next to it
   *   r u f l d b      inner slice only (the layer next to the face)
   *   x y z            whole-cube rotations (x like R, y like U, z like F)
   * Suffix ' = counter-clockwise, 2 = half turn.
   */
  const TOKEN_RE = /^(?:([UDLRFB])(w?)|([udlrfb])|([xyz]))(2|'|2')?$/;

  function parseToken(token) {
    const m = TOKEN_RE.exec(token);
    if (!m) throw new Error('Bad move: ' + token);
    const suffix = m[5] || '';
    const amount = suffix === "'" ? -1 : suffix.startsWith('2') ? 2 : 1;
    let face, layers;
    if (m[1]) {
      face = m[1];
      const s = FACE_AXIS[face][1];
      layers = m[2] ? [3 * s, s] : [3 * s];
    } else if (m[3]) {
      face = m[3].toUpperCase();
      layers = [FACE_AXIS[face][1]];
    } else {
      face = { x: 'R', y: 'U', z: 'F' }[m[4]];
      layers = [-3, -1, 1, 3];
    }
    const [axis, sign] = FACE_AXIS[face];
    // Clockwise seen from the face = -90deg about its outward normal.
    const q = (((sign > 0 ? -1 : 1) * amount) % 4 + 4) % 4;
    return { token, face, axis, layers, q, amount, rotation: !!m[4] };
  }

  const MOVE_CACHE = new Map();

  function getMove(token) {
    let mv = MOVE_CACHE.get(token);
    if (mv) return mv;
    const spec = parseToken(token);
    const pull = new Int16Array(STICKERS);
    const push = new Int16Array(STICKERS);
    for (let i = 0; i < STICKERS; i++) {
      const g = GEOM[i];
      let dest = i;
      if (spec.layers.includes(g.p[spec.axis])) {
        dest = KEY_TO_INDEX.get(geomKey(rot(g.p, spec.axis, spec.q), rot(g.n, spec.axis, spec.q)));
      }
      push[i] = dest;
      pull[dest] = i;
    }
    mv = { ...spec, pull, push };
    MOVE_CACHE.set(token, mv);
    return mv;
  }

  function splitAlg(alg) {
    if (Array.isArray(alg)) return alg;
    return alg.trim().split(/\s+/).filter(Boolean);
  }

  function applyMove(state, token) {
    const { pull } = getMove(token);
    const out = new Array(STICKERS);
    for (let i = 0; i < STICKERS; i++) out[i] = state[pull[i]];
    return out;
  }

  function applyAlg(state, alg) {
    return splitAlg(alg).reduce(applyMove, state);
  }

  function invertToken(token) {
    if (token.endsWith("2'")) return token.slice(0, -1);
    if (token.endsWith('2')) return token;
    if (token.endsWith("'")) return token.slice(0, -1);
    return token + "'";
  }

  function invertAlg(alg) {
    return splitAlg(alg).slice().reverse().map(invertToken);
  }

  // Merge adjacent turns of the same layer(s): "U U" -> "U2", "U U'" -> "".
  function simplify(alg) {
    const out = [];
    for (const t of splitAlg(alg)) {
      const prev = out[out.length - 1];
      if (prev && baseOf(prev) === baseOf(t)) {
        const total = (((amountOf(prev) + amountOf(t)) % 4) + 4) % 4;
        out.pop();
        if (total !== 0) out.push(withAmount(baseOf(t), total));
      } else {
        out.push(t);
      }
    }
    return out;
  }

  const baseOf = (t) => t.replace(/2?'?$/, '');
  const amountOf = (t) => (t.endsWith("'") && !t.endsWith("2'") ? 3 : t.endsWith('2') || t.endsWith("2'") ? 2 : 1);
  const withAmount = (base, a) => base + (a === 1 ? '' : a === 2 ? '2' : "'");

  function solvedState(scheme) {
    const s = new Array(STICKERS);
    for (let i = 0; i < STICKERS; i++) s[i] = scheme[GEOM[i].face];
    return s;
  }

  // Standard Western scheme held yellow-up, green-front.
  const DEFAULT_SCHEME = { U: 'Y', D: 'W', F: 'G', B: 'B', R: 'O', L: 'R' };

  function isSolved(state) {
    for (let f = 0; f < 6; f++) {
      const c = state[f * 16];
      for (let i = 1; i < 16; i++) if (state[f * 16 + i] !== c) return false;
    }
    return true;
  }

  function randomScramble(length, rng) {
    const rand = rng || Math.random;
    const faces = ['U', 'D', 'L', 'R', 'F', 'B'];
    const kinds = ['', 'w'];
    const sufs = ['', "'", '2'];
    const moves = [];
    let lastAxis = -1;
    while (moves.length < length) {
      const face = faces[Math.floor(rand() * 6)];
      const axis = FACE_AXIS[face][0];
      if (axis === lastAxis) continue;
      lastAxis = axis;
      moves.push(face + kinds[Math.floor(rand() * 2)] + sufs[Math.floor(rand() * 3)]);
    }
    return moves;
  }

  root.Cube4 = {
    FACES, COLORS, N, STICKERS, FACE_AXIS, GEOM, KEY_TO_INDEX, DEFAULT_SCHEME,
    geomKey, rot, parseToken, getMove, splitAlg, applyMove, applyAlg,
    invertToken, invertAlg, simplify, solvedState, isSolved, randomScramble,
  };
})(typeof window !== 'undefined' ? window : globalThis);
