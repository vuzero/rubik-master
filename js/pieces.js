/*
 * Piece geometry on the 4x4 (corners, edge wings, dedges, centers) plus a
 * fast integer-coded state used by the solver.
 */
(function (root) {
  'use strict';
  const C = root.Cube4;
  const { GEOM, STICKERS, COLORS } = C;

  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

  function groupByPosition(filter) {
    const groups = new Map();
    for (let i = 0; i < STICKERS; i++) {
      const p = GEOM[i].p;
      if (!filter(p)) continue;
      const key = p.join(',');
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(i);
    }
    return [...groups.values()];
  }

  const countOuter = (p) => p.filter((v) => Math.abs(v) === 3).length;

  // Corners: 3 stickers, first one on U/D, then counter-clockwise by the right-hand rule.
  const CORNERS = groupByPosition((p) => countOuter(p) === 3).map((ids) => {
    const first = ids.find((i) => GEOM[i].n[1] !== 0);
    const others = ids.filter((i) => i !== first);
    const [a, b] = others;
    const ordered = dot(cross(GEOM[first].n, GEOM[a].n), GEOM[b].n) > 0 ? [first, a, b] : [first, b, a];
    return { idx: ordered };
  });

  // Wings: 2 stickers, ordered so (n1 x n2) points along the wing's offset from the edge middle.
  const WINGS = groupByPosition((p) => countOuter(p) === 2).map((ids) => {
    const p = GEOM[ids[0]].p;
    const axis = p.findIndex((v) => Math.abs(v) === 1);
    const e = [0, 0, 0];
    e[axis] = Math.sign(p[axis]);
    const [a, b] = ids;
    const idx = dot(cross(GEOM[a].n, GEOM[b].n), e) > 0 ? [a, b] : [b, a];
    const dedgeKey = p.map((v, k) => (k === axis ? 0 : v)).join(',');
    return { idx, dedgeKey };
  });

  const DEDGES = [];
  WINGS.forEach((w, wi) => {
    let d = DEDGES.find((x) => x.key === w.dedgeKey);
    if (!d) {
      d = { key: w.dedgeKey, wings: [] };
      DEDGES.push(d);
    }
    d.wings.push(wi);
  });
  DEDGES.forEach((d) => {
    // Sticker slots of the dedge as [faceA stickers, faceB stickers] for pairing checks.
    const w0 = WINGS[d.wings[0]].idx;
    const w1 = WINGS[d.wings[1]].idx;
    const sameFace = (i, j) => GEOM[i].f === GEOM[j].f;
    d.pairs = sameFace(w0[0], w1[0]) ? [[w0[0], w1[0]], [w0[1], w1[1]]] : [[w0[0], w1[1]], [w0[1], w1[0]]];
    d.rep = [d.pairs[0][0], d.pairs[1][0]]; // one sticker per face, used like a 3x3 edge
    d.faces = [GEOM[d.pairs[0][0]].face, GEOM[d.pairs[1][0]].face];
  });

  const CENTER_IDX = [];
  for (let i = 0; i < STICKERS; i++) {
    const { r, c } = GEOM[i];
    if (r >= 1 && r <= 2 && c >= 1 && c <= 2) CENTER_IDX.push(i);
  }

  // ---- integer-coded fast state -------------------------------------------
  const CODE = Object.fromEntries(COLORS.map((c, i) => [c, i]));

  function encode(letters) {
    const s = new Uint8Array(STICKERS);
    for (let i = 0; i < STICKERS; i++) s[i] = CODE[letters[i]];
    return s;
  }

  function decode(codes) {
    return Array.from(codes, (v) => COLORS[v]);
  }

  function applyTokens(state, tokens) {
    let cur = state;
    for (const t of tokens) {
      const pull = C.getMove(t).pull;
      const next = new Uint8Array(STICKERS);
      for (let i = 0; i < STICKERS; i++) next[i] = cur[pull[i]];
      cur = next;
    }
    return cur;
  }

  const faceCenter = (state, f) => state[f * 16 + 5];

  root.Pieces = {
    CORNERS, WINGS, DEDGES, CENTER_IDX, CODE, encode, decode, applyTokens, faceCenter, cross, dot,
  };
})(typeof window !== 'undefined' ? window : globalThis);
