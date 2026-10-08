/*
 * 2x2 solve. A 2x2 has no centers, so one white corner is picked as the
 * anchor: the whole cube is turned so it sits on the bottom with white facing
 * down, and its colors decide which color belongs on each side. The cube is
 * then stored as a 4x4 with centers and edges filled in to match, and solved
 * with the corner steps of the layer-by-layer stage: white corners, Sunes for
 * the yellow face, A-perms for the last corners.
 */
(function (root) {
  'use strict';
  const C = root.Cube4;
  const T = root.Cube2;
  const P = root.Pieces;
  const S = root.Solver3x3;
  const { GEOM } = C;
  const NAMES = root.Validate.COLOR_NAMES;

  const OPPOSITE_FACE = { U: 'D', D: 'U', F: 'B', B: 'F', L: 'R', R: 'L' };
  const STANDARD_OPPOSITE = { W: 'Y', Y: 'W', G: 'B', B: 'G', R: 'O', O: 'R' };
  const COLOR_ORDER = ['W', 'Y', 'G', 'B', 'R', 'O'];

  // All 24 ways to hold the cube, shortest first: which face goes down, then a turn about the vertical.
  const DOWN_TURNS = [[], ['x2'], ["x'"], ['x'], ["z'"], ['z']];
  const Y_TURNS = [[], ['y'], ['y2'], ["y'"]];
  const HOLDS = DOWN_TURNS.flatMap((d) => Y_TURNS.map((y) => [...d, ...y])).sort((a, b) => a.length - b.length);

  const BOTTOM_CORNERS = P.CORNERS.filter((c) => GEOM[c.idx[0]].face === 'D');
  const corners2 = (letters) => P.CORNERS.map((c) => c.idx.map((i) => letters[T.index4to2(i)]));
  const colorList = (cols) => cols.slice().sort((a, b) => COLOR_ORDER.indexOf(a) - COLOR_ORDER.indexOf(b)).map((c) => NAMES[c]).join('–');

  function inputErrors(letters) {
    const blanks = letters.filter((c) => !C.COLORS.includes(c)).length;
    if (blanks) return [`${blanks} sticker${blanks > 1 ? 's are' : ' is'} still blank.`];
    const counts = C.COLORS.map((col) => [col, letters.filter((c) => c === col).length])
      .filter(([, n]) => n !== 4)
      .map(([col, n]) => `${NAMES[col]} has ${n} stickers; a 2x2 has exactly 4 of each color.`);
    if (counts.length) return counts;
    const repeats = corners2(letters).filter((cols) => new Set(cols).size < 3);
    return repeats.map((cols) => `A corner shows ${colorList(cols)}, but every corner has three different colors.`);
  }

  // Opposite colors never share a corner. Falls back to the standard scheme
  // when the corners disagree; the 4x4 check then names the bad corner.
  function opposites(letters) {
    const together = Object.fromEntries(C.COLORS.map((c) => [c, new Set()]));
    corners2(letters).forEach((cols) => cols.forEach((a) => cols.forEach((b) => { if (a !== b) together[a].add(b); })));
    const opp = {};
    for (const c of C.COLORS) {
      const apart = C.COLORS.filter((o) => o !== c && !together[c].has(o));
      if (apart.length !== 1) return STANDARD_OPPOSITE;
      [opp[c]] = apart;
    }
    return C.COLORS.every((c) => opp[opp[c]] === c) ? opp : STANDARD_OPPOSITE;
  }

  /** Scheme (face -> color) that makes the corner in `slot` solved, or null if its colors cannot. */
  function schemeFrom(held, slot, opp) {
    const scheme = {};
    slot.idx.forEach((i) => {
      const face = GEOM[i].face;
      scheme[face] = held[i];
      scheme[OPPOSITE_FACE[face]] = opp[held[i]];
    });
    return new Set(Object.values(scheme)).size === 6 ? scheme : null;
  }

  const fill = (held, scheme) => held.map((c, i) => (T.index4to2(i) < 0 ? scheme[GEOM[i].face] : c));
  const cornerSolved = (s, idx) => idx.every((i) => s[i] === s[GEOM[i].f * 16 + 5]);

  /** The hold and anchor corner that leave the most white corners already solved, shortest hold first. */
  function chooseAnchor(letters, opp) {
    const corners = T.expand(letters, null);
    let best = null;
    for (const hold of HOLDS) {
      const held = C.applyAlg(corners, hold);
      for (const slot of BOTTOM_CORNERS) {
        if (held[slot.idx[0]] !== 'W') continue;
        const scheme = schemeFrom(held, slot, opp);
        if (!scheme) continue;
        const full = fill(held, scheme);
        const solved = P.CORNERS.filter((c) => c.idx.some((i) => full[i] === 'W') && cornerSolved(full, c.idx)).length;
        if (!best || solved > best.solved) best = { hold, slot, full, solved };
      }
    }
    return best;
  }

  function anchorStep(hold, colors, place) {
    return {
      phase: 'Get ready',
      title: 'Pick an anchor corner',
      text: `A 2x2 has no centers, so one white corner is the reference: every other corner is placed around it. Turn the whole cube so the ${colorList(colors)} corner sits at the ${place}, white facing down, and keep holding it that way.`,
      parts: [{ label: 'Turn cube', moves: hold }],
      moves: hold,
      goal: { kind: 'anchor', colors },
    };
  }

  /**
   * @param {string[]} letters 24 sticker colors
   * @returns {{ok: true, steps: Object[], start: string[]} | {ok: false, errors: string[]}}
   */
  function solve(letters) {
    const bad = inputErrors(letters);
    if (bad.length) return { ok: false, errors: bad };

    const opp = opposites(letters);
    const pick = chooseAnchor(letters, opp);
    if (!pick) {
      const fallback = root.Validate.analyze(T.expand(letters, C.DEFAULT_SCHEME));
      return { ok: false, errors: fallback.ok ? ['These colors do not match any real 2x2. Re-check each face.'] : fallback.errors };
    }
    const analysis = root.Validate.analyze(pick.full);
    if (!analysis.ok) return { ok: false, errors: analysis.errors };

    try {
      const rest = [];
      const layer1 = S.solveFirstCorners(P.encode(pick.full), [], rest);
      const bottomDone = (s) => BOTTOM_CORNERS.every((c) => cornerSolved(s, c.idx));
      const oriented = S.orientTopCorners(layer1.state, bottomDone, rest);
      S.permuteTopCorners(oriented, bottomDone, rest);

      const colors = pick.slot.idx.map((i) => pick.full[i]);
      const place = root.Goals.placeName(pick.slot.idx);
      const steps = rest.slice();
      if (pick.hold.length) {
        steps.unshift(anchorStep(pick.hold, colors, place));
      } else if (steps[0] && steps[0].phase === 'Layer 1') {
        steps[0] = { ...steps[0], text: `Your anchor is the ${colorList(colors)} corner at the ${place}: a 2x2 has no centers, so the other corners are placed around it. ${steps[0].text}` };
      }

      const start = C.applyAlg(pick.full, C.invertAlg(pick.hold));
      const raw = steps.map((s) => ({ ...s, moves: C.splitAlg(s.moves) })).filter((s) => s.moves.length);
      const annotated = root.Goals.annotate(start, raw);
      if (!T.isSolved(T.project(C.applyAlg(start, annotated.flatMap((s) => s.moves))))) {
        throw new Error('Internal check failed: the found solution does not solve the cube.');
      }
      return { ok: true, steps: annotated, start };
    } catch (err) {
      return { ok: false, errors: [`The solver got stuck (${err.message}). Double-check the colors you entered.`] };
    }
  }

  root.Solver2 = { solve };
})(typeof window !== 'undefined' ? window : globalThis);
