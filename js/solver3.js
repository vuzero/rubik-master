/*
 * 3x3 solve: expand the 54 stickers to the equivalent reduced 4x4, turn the
 * whole cube so white is on the bottom, then run the layer-by-layer stage of
 * the 4x4 solver. A real 3x3 never needs the 4x4 parity fixes, so needing one
 * means the colors were entered wrong (a flipped edge or two swapped pieces).
 */
(function (root) {
  'use strict';
  const C = root.Cube4;
  const T = root.Cube3;
  const P = root.Pieces;
  const NAMES = root.Validate.COLOR_NAMES;

  // Whole-cube turn that brings the center on `face` down to the bottom.
  const WHITE_DOWN = { D: [], U: ['x2'], F: ["x'"], B: ['x'], L: ["z'"], R: ['z'] };

  function inputErrors(letters) {
    const blanks = letters.filter((c) => !C.COLORS.includes(c)).length;
    if (blanks) return [`${blanks} sticker${blanks > 1 ? 's are' : ' is'} still blank.`];
    const counts = C.COLORS.map((col) => [col, letters.filter((c) => c === col).length])
      .filter(([, n]) => n !== 9)
      .map(([col, n]) => `${NAMES[col]} has ${n} stickers; a 3x3 has exactly 9 of each color.`);
    if (counts.length) return counts;
    const centers = C.FACES.map((_, f) => letters[f * 9 + 4]);
    if (new Set(centers).size !== 6) return ['Two center stickers have the same color; each face has its own center color.'];
    return [];
  }

  function holdStep(turn) {
    return {
      phase: 'Get ready',
      title: 'White center down',
      text: 'A 3x3 never changes which center is where, so pick up the cube with the white center on the bottom and keep it that way for the rest of the solve.',
      parts: [{ label: 'Turn cube', moves: turn }],
      moves: turn,
      goal: { kind: 'hold' },
    };
  }

  /**
   * @param {string[]} letters 54 sticker colors
   * @returns {{ok: true, steps: Object[], start: string[]} | {ok: false, errors: string[]}}
   */
  function solve(letters) {
    const bad = inputErrors(letters);
    if (bad.length) return { ok: false, errors: bad };

    const start = T.expand(letters);
    const whiteFace = C.FACES[C.FACES.findIndex((_, f) => letters[f * 9 + 4] === 'W')];
    const turn = WHITE_DOWN[whiteFace];
    const held = C.applyAlg(start, turn);

    const analysis = root.Validate.analyze(held);
    if (!analysis.ok) return { ok: false, errors: analysis.errors };
    const centersMatch = C.FACES.every((f, i) => held[i * 16 + 5] === analysis.scheme[f]);
    if (!centersMatch) {
      return { ok: false, errors: ['The center colors do not fit the corners and edges. Check each center sticker (white sits opposite yellow, green opposite blue, red opposite orange).'] };
    }

    try {
      const rest = root.Solver3x3.solve3x3(P.encode(held));
      const kinds = new Set(rest.steps.map((s) => s.goal && s.goal.kind));
      const errors = [];
      if (kinds.has('flipEdge')) errors.push('One edge is flipped in place, which a real 3x3 cannot be. Check the two stickers of each edge.');
      if (kinds.has('swapEdges')) errors.push('Two pieces are swapped, which a real 3x3 cannot be. Check the edge and corner stickers.');
      if (errors.length) return { ok: false, errors };

      const raw = [...(turn.length ? [holdStep(turn)] : []), ...rest.steps]
        .map((s) => ({ ...s, moves: C.splitAlg(s.moves) }))
        .filter((s) => s.moves.length);
      const steps = root.Goals.annotate(start, raw);
      if (!C.isSolved(C.applyAlg(start, steps.flatMap((s) => s.moves)))) {
        throw new Error('Internal check failed: the found solution does not solve the cube.');
      }
      return { ok: true, steps, start };
    } catch (err) {
      return { ok: false, errors: [`The solver got stuck (${err.message}). Double-check the colors you entered.`] };
    }
  }

  root.Solver3 = { solve };
})(typeof window !== 'undefined' ? window : globalThis);
