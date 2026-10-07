/*
 * Full solve: validate → centers → edge pairing → 3x3 stage.
 * Returns a flat list of human-sized steps, each with its own moves.
 */
(function (root) {
  'use strict';
  const C = root.Cube4;
  const P = root.Pieces;

  /**
   * @param {string[]} letters 96 sticker colors
   * @returns {{ok: true, steps: Object[], scheme: Object} | {ok: false, errors: string[]}}
   */
  function solve(letters) {
    const analysis = root.Validate.analyze(letters);
    if (!analysis.ok) return { ok: false, errors: analysis.errors };

    try {
      const start = P.encode(letters);
      const centers = root.SolverCenters.solveCenters(start, analysis.scheme, root.Validate.COLOR_NAMES);
      const edges = root.SolverEdges.solveEdges(centers.state);
      const rest = root.Solver3x3.solve3x3(edges.state);
      const steps = root.Goals.annotate(letters, [...centers.steps, ...edges.steps, ...rest.steps]
        .map((s) => ({ ...s, moves: C.splitAlg(s.moves) }))
        .filter((s) => s.moves.length));

      const end = C.applyAlg(letters, steps.flatMap((s) => s.moves));
      if (!C.isSolved(end)) throw new Error('Internal check failed: the found solution does not solve the cube.');
      return { ok: true, steps, scheme: analysis.scheme };
    } catch (err) {
      return { ok: false, errors: [`The solver got stuck (${err.message}). Double-check the colors you entered.`] };
    }
  }

  root.Solver = { solve };
})(typeof window !== 'undefined' ? window : globalThis);
