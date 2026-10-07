/*
 * Stage 2: pair the 24 edge wings into 12 "dedges".
 *
 * Every step = a few outer-layer setup turns (which never break centers or
 * finished pairs) + one known algorithm. The search tries setups of growing
 * length and keeps the shortest that pairs at least one more edge.
 */
(function (root) {
  'use strict';
  const C = root.Cube4;
  const P = root.Pieces;
  const { FACE_MOVES } = root.SolverCenters;

  const FLIP = "R U R' F R' F' R";
  const FLIP_L = "L' U' L F' L F L'";
  const wrap = (slice, inner) => `${slice} ${inner} ${C.invertToken(slice)}`;

  const ALGS = [
    ...["Uw'", 'Uw', 'Dw', "Dw'"].flatMap((s) => [
      { name: 'Edge pairing (flip)', alg: wrap(s, FLIP), kind: 'pair' },
      { name: 'Edge pairing (flip)', alg: wrap(s, FLIP_L), kind: 'pair' },
    ]),
    { name: 'Edge pairing (Dw)', alg: "Dw R F' U R' F Dw'", kind: 'pair' },
    { name: 'Edge pairing (Dw)', alg: "Dw' L' F U' L F' Dw", kind: 'pair' },
    { name: 'Edge flip parity', alg: "Rw2 B2 U2 Lw U2 Rw' U2 Rw U2 F2 Rw F2 Lw' B2 Rw2", kind: 'parity' },
  ].map((a) => ({ ...a, moves: C.splitAlg(a.alg) }));

  function pairedCount(s) {
    let n = 0;
    for (const d of P.DEDGES) {
      const [a, b] = d.pairs;
      if (s[a[0]] === s[a[1]] && s[b[0]] === s[b[1]]) n++;
    }
    return n;
  }

  function centersSolved(s) {
    for (let f = 0; f < 6; f++) {
      const c = s[f * 16 + 5];
      if (s[f * 16 + 6] !== c || s[f * 16 + 9] !== c || s[f * 16 + 10] !== c) return false;
    }
    return true;
  }

  const faceOf = (t) => t[0];
  const OPP = { U: 'D', D: 'U', L: 'R', R: 'L', F: 'B', B: 'F' };
  const ORDER = 'UDLRFB';

  function findStep(state, base, maxSetup) {
    let best = null;
    const path = [];
    function tryAlgs(s) {
      for (const a of ALGS) {
        const total = path.length + a.moves.length;
        if (best && total >= best.moves.length) continue;
        const r = P.applyTokens(s, a.moves);
        if (pairedCount(r) > base && centersSolved(r)) {
          best = { setup: path.slice(), alg: a, moves: [...path, ...a.moves], state: r };
        }
      }
    }
    function dfs(s, depth) {
      if (depth === 0) { tryAlgs(s); return; }
      for (const t of FACE_MOVES) {
        const prev = path[path.length - 1];
        if (prev && (faceOf(prev) === faceOf(t)
          || (OPP[faceOf(prev)] === faceOf(t) && ORDER.indexOf(faceOf(prev)) > ORDER.indexOf(faceOf(t))))) continue;
        path.push(t);
        dfs(P.applyTokens(s, [t]), depth - 1);
        path.pop();
      }
    }
    for (let d = 0; d <= maxSetup && !best; d++) dfs(state, d);
    return best;
  }

  function describe(found, paired) {
    const { kind } = found.alg;
    const setup = found.setup.length ? 'Use the setup turns to bring two matching edge pieces into place, then ' : '';
    if (kind === 'parity') {
      return 'One edge has its two halves swapped (edge parity, which only happens on even cubes). '
        + `${setup ? 'Turn that edge to the front-top (UF) position and ' : 'With that edge at front-top (UF), '}run the parity algorithm. It is long; go slowly.`;
    }
    const [first] = found.alg.moves;
    const last = found.alg.moves[found.alg.moves.length - 1];
    return `${setup || ''}${setup ? 'run' : 'Run'} the pairing algorithm. The first wide turn (${first}) joins two matching edge halves, `
      + `the middle moves swap the new pair out of the middle layers, and ${last} puts the centers back. ${paired}/12 edges paired.`;
  }

  function solveEdges(state) {
    let cur = state;
    const steps = [];
    let paired = pairedCount(cur);
    while (paired < 12) {
      const found = findStep(cur, paired, 3) || findStep(cur, paired, 4);
      if (!found) throw new Error('Could not pair the remaining edges.');
      cur = found.state;
      paired = pairedCount(cur);
      steps.push({
        phase: 'Edges',
        title: found.alg.kind === 'parity' ? 'Fix edge parity' : `Pair edges · ${paired}/12`,
        text: describe(found, paired),
        parts: [
          ...(found.setup.length ? [{ label: 'Setup', moves: found.setup }] : []),
          { label: found.alg.name, moves: found.alg.moves },
        ],
        moves: found.moves,
        goal: { kind: 'pair' },
      });
    }
    return { state: cur, steps };
  }

  root.SolverEdges = { solveEdges, pairedCount, centersSolved };
})(typeof window !== 'undefined' ? window : globalThis);
