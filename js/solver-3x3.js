/*
 * Stage 3: solve the reduced cube like a 3x3 with the beginner
 * layer-by-layer method (white cross on the bottom, white corners,
 * middle edges, yellow cross, yellow face, corner and edge permutation),
 * plus the two 4x4-only parity fixes.
 */
(function (root) {
  'use strict';
  const C = root.Cube4;
  const P = root.Pieces;
  const { GEOM } = C;
  const NAMES = root.Validate.COLOR_NAMES;
  const { FACE_MOVES } = root.SolverCenters;

  const ALG = {
    cornerTrigger: "R U R' U'",
    rightEdge: "U R U' R' U' F' U F",
    leftEdge: "U' L' U L U F U' F'",
    crossLine: "F R U R' U' F'",
    crossL: "F U R U' R' F'",
    sune: "R U R' U R U2 R'",
    aPerm: "R' F R' B2 R F' R' B2 R2",
    uPermA: "R U' R U R U R U' R' U' R2",
    uPermB: "R2 U R U R' U' R' U' R' U R'",
    ollParity: "Rw2 B2 U2 Lw U2 Rw' U2 Rw U2 F2 Rw F2 Lw' B2 Rw2",
    pllParity: "Rw2 R2 U2 Rw2 R2 Uw2 Rw2 R2 Uw2 U2",
  };
  const split = C.splitAlg;
  const ROT = [[], ['y'], ['y2'], ["y'"]];
  const AUF = [[], ['U'], ['U2'], ["U'"]];

  // ---- piece helpers ------------------------------------------------------
  const center = (s, f) => s[f * 16 + 5];
  const pieceSolved = (s, idx) => idx.every((i) => s[i] === center(s, GEOM[i].f));
  const sameSet = (a, b) => a.length === b.length && a.every((x) => b.includes(x));
  const PIECES = [...P.CORNERS.map((c) => c.idx), ...P.DEDGES.map((d) => d.rep)];
  const findPiece = (s, cols) => PIECES.find((idx) => sameSet(idx.map((i) => s[i]), cols));
  const solvedByColors = (s, cols) => pieceSolved(s, findPiece(s, cols));
  const inTopLayer = (s, cols) => findPiece(s, cols).some((i) => GEOM[i].face === 'U');
  const allSolved = (s, list) => list.every((cols) => solvedByColors(s, cols));

  const topColor = (s) => center(s, 0);
  const sideColors = (s) => [1, 2, 4, 5].map((f) => center(s, f));
  const topDedges = P.DEDGES.filter((d) => d.faces.includes('U'));
  const topCorners = P.CORNERS.filter((c) => GEOM[c.idx[0]].face === 'U');
  const orientedEdges = (s) => topDedges.filter((d) => s[d.rep[d.faces.indexOf('U')]] === topColor(s)).length;
  const orientedCorners = (s) => topCorners.filter((c) => s[c.idx[0]] === topColor(s)).length;

  function reduced(s) {
    return root.SolverEdges.centersSolved(s) && root.SolverEdges.pairedCount(s) === 12;
  }

  // ---- generic "setup + algorithm" search ---------------------------------
  // Each candidate is a list of labelled parts; returns the shortest that meets goal.
  function bestCandidate(state, candidates, goal) {
    let best = null;
    for (const parts of candidates) {
      const moves = parts.flatMap((p) => p.moves);
      if (best && moves.length >= best.moves.length) continue;
      const s = P.applyTokens(state, moves);
      if (goal(s)) best = { parts: parts.filter((p) => p.moves.length), moves, state: s };
    }
    return best;
  }

  const product = (...lists) => lists.reduce((acc, l) => acc.flatMap((a) => l.map((b) => [...a, b])), [[]]);

  // ---- cross: IDA* on the tracked stickers of the cross edges ---------------
  function crossEdge(state, done, target) {
    const colorFace = {};
    for (let f = 0; f < 6; f++) colorFace[center(state, f)] = f;
    const tracked = [...done, target].map((cols) => findPiece(state, cols));
    const colors = tracked.map((idx) => idx.map((i) => state[i]));
    const isGoal = (locs, k) => locs.every((loc, j) => GEOM[loc].f === colorFace[colors[k][j]]);
    const pushes = FACE_MOVES.map((t) => C.getMove(t).push);

    // Distance-to-goal table for each tracked piece on its own.
    const dist = tracked.map((start, k) => {
      const key = (l) => l.join(',');
      const seen = new Map([[key(start), start]]);
      const queue = [start];
      while (queue.length) {
        const cur = queue.shift();
        for (const push of pushes) {
          const nxt = cur.map((l) => push[l]);
          if (!seen.has(key(nxt))) { seen.set(key(nxt), nxt); queue.push(nxt); }
        }
      }
      const d = new Map();
      const q2 = [...seen.values()].filter((l) => isGoal(l, k));
      q2.forEach((l) => d.set(key(l), 0));
      while (q2.length) {
        const cur = q2.shift();
        for (const push of pushes) {
          const nxt = cur.map((l) => push[l]);
          if (!d.has(key(nxt))) { d.set(key(nxt), d.get(key(cur)) + 1); q2.push(nxt); }
        }
      }
      return (locs) => d.get(key(locs));
    });

    const path = [];
    function dfs(locs, g, bound) {
      const h = Math.max(...locs.map((l, k) => dist[k](l)));
      if (h === 0) return true;
      if (g + h > bound) return false;
      for (let m = 0; m < FACE_MOVES.length; m++) {
        const t = FACE_MOVES[m];
        const prev = path[path.length - 1];
        if (prev && prev[0] === t[0]) continue;
        path.push(t);
        if (dfs(locs.map((l) => l.map((x) => pushes[m][x])), g + 1, bound)) return true;
        path.pop();
      }
      return false;
    }
    for (let bound = 0; bound <= 10; bound++) {
      if (dfs(tracked, 0, bound)) return path.slice();
    }
    throw new Error('Cross search failed.');
  }

  function solveCross(state, steps) {
    const white = center(state, 3);
    const targets = sideColors(state).map((c) => [white, c]);
    let cur = state;
    const done = targets.filter((t) => solvedByColors(cur, t));
    while (done.length < 4) {
      const options = targets.filter((t) => !done.includes(t)).map((t) => ({ t, moves: crossEdge(cur, done, t) }));
      const pick = options.reduce((a, b) => (b.moves.length < a.moves.length ? b : a));
      cur = P.applyTokens(cur, pick.moves);
      done.push(pick.t);
      const name = `${NAMES[C.COLORS[pick.t[0]]]}-${NAMES[C.COLORS[pick.t[1]]]}`;
      steps.push({
        phase: 'Layer 1',
        title: `White cross · ${done.length}/4`,
        text: `Bring the ${name} edge down next to the white center so its side color matches the ${NAMES[C.COLORS[pick.t[1]]].toLowerCase()} center. Edges already in the cross stay put.`,
        parts: [{ label: 'Moves', moves: pick.moves }],
        moves: pick.moves,
        focus: 'D',
        goal: { kind: 'piece', colors: letters(pick.t) },
      });
    }
    return { state: cur, done: targets };
  }

  // ---- steps built from setups + algorithms -------------------------------
  const letters = (cols) => cols.map((c) => C.COLORS[c]);

  // `goal` tells the UI what the step is for (see goals.js): which piece goes where.
  function pushStep(steps, phase, title, text, found, goal) {
    steps.push({ phase, title, text, parts: found.parts, moves: found.moves, goal });
    return found.state;
  }

  const setupParts = (rot, auf) => [{ label: 'Turn cube', moves: rot }, { label: 'Align', moves: auf }];

  function solveFirstCorners(state, cross, steps) {
    const white = center(state, 3);
    const corners = P.CORNERS.map((c) => c.idx.map((i) => state[i])).filter((cols) => cols.includes(white));
    let cur = state;
    const done = [];
    const keep = (s) => reduced(s) && allSolved(s, cross) && allSolved(s, done);
    const trigger = split(ALG.cornerTrigger);
    const insertCands = product(ROT, AUF, [1, 2, 3, 4, 5]).map(([r, a, n]) => [
      ...setupParts(r, a), { label: `R U R' U' ×${n}`, moves: Array(n).fill(trigger).flat() }]);
    const extractCands = ROT.map((r) => [{ label: 'Turn cube', moves: r }, { label: "R U R' U'", moves: trigger }]);

    while (done.length < 4) {
      const todo = corners.filter((c) => !done.includes(c) && !solvedByColors(cur, c));
      if (!todo.length) { done.push(...corners.filter((c) => !done.includes(c))); break; }
      let best = null;
      for (const cols of todo) {
        const f = bestCandidate(cur, insertCands, (s) => keep(s) && solvedByColors(s, cols));
        if (f && (!best || f.moves.length < best.f.moves.length)) best = { f, cols };
      }
      const label = (cols) => cols.map((c) => NAMES[C.COLORS[c]]).join('-');
      if (best) {
        cur = pushStep(steps, 'Layer 1', `White corners · ${done.length + 1}/4`,
          `Turn the cube so the ${label(best.cols)} corner's home is at front-right-bottom, line the corner up above it, then repeat R U R' U' until the corner drops in with white facing down.`,
          best.f, { kind: 'piece', colors: letters(best.cols) });
        done.push(best.cols);
        corners.filter((c) => !done.includes(c) && solvedByColors(cur, c)).forEach((c) => done.push(c));
        continue;
      }
      const cols = todo[0];
      const f = bestCandidate(cur, extractCands, (s) => keep(s) && inTopLayer(s, cols));
      if (!f) throw new Error('Corner extraction failed.');
      cur = pushStep(steps, 'Layer 1', 'Free a stuck corner',
        `The ${label(cols)} corner is stuck in the wrong bottom slot. Hold it at front-right and do R U R' U' once to lift it into the top layer.`, f, { kind: 'extract', colors: letters(cols) });
    }
    return { state: cur, done: corners };
  }

  function solveMiddleEdges(state, firstLayer, steps) {
    const top = topColor(state);
    const white = center(state, 3);
    const edges = P.DEDGES.map((d) => d.rep.map((i) => state[i])).filter((cols) => !cols.includes(top) && !cols.includes(white));
    let cur = state;
    const done = [];
    const keep = (s) => reduced(s) && allSolved(s, firstLayer) && allSolved(s, done);
    const insertCands = product(ROT, AUF, ['right', 'left']).map(([r, a, side]) => [
      ...setupParts(r, a),
      { label: side === 'right' ? 'Insert right' : 'Insert left', moves: split(side === 'right' ? ALG.rightEdge : ALG.leftEdge) }]);
    const extractCands = ROT.map((r) => [{ label: 'Turn cube', moves: r }, { label: 'Insert right', moves: split(ALG.rightEdge) }]);
    const label = (cols) => cols.map((c) => NAMES[C.COLORS[c]]).join('-');

    while (done.length < 4) {
      const todo = edges.filter((e) => !done.includes(e) && !solvedByColors(cur, e));
      if (!todo.length) { done.push(...edges.filter((e) => !done.includes(e))); break; }
      let best = null;
      for (const cols of todo) {
        const f = bestCandidate(cur, insertCands, (s) => keep(s) && solvedByColors(s, cols));
        if (f && (!best || f.moves.length < best.f.moves.length)) best = { f, cols };
      }
      if (best) {
        const right = best.f.parts.some((p) => p.label === 'Insert right');
        cur = pushStep(steps, 'Layer 2', `Middle edges · ${done.length + 1}/4`,
          `Turn the cube and the top so the ${label(best.cols)} edge sits above its matching center, then insert it to the ${right ? 'right' : 'left'}.`, best.f, { kind: 'piece', colors: letters(best.cols) });
        done.push(best.cols);
        edges.filter((e) => !done.includes(e) && solvedByColors(cur, e)).forEach((e) => done.push(e));
        continue;
      }
      const cols = todo[0];
      const f = bestCandidate(cur, extractCands, (s) => keep(s) && inTopLayer(s, cols));
      if (!f) throw new Error('Edge extraction failed.');
      cur = pushStep(steps, 'Layer 2', 'Free a stuck edge',
        `The ${label(cols)} edge is in the middle layer but in the wrong spot or flipped. Hold it at front-right and run the right-insert algorithm to pop it into the top layer.`, f, { kind: 'extract', colors: letters(cols) });
    }
    return { state: cur, done: [...firstLayer, ...edges] };
  }

  function solveLastLayer(state, f2l, steps) {
    let cur = state;
    const keepF2L = (s) => reduced(s) && allSolved(s, f2l);

    if (orientedEdges(cur) % 2 === 1) {
      const cands = AUF.map((a) => [{ label: 'Align', moves: a }, { label: 'OLL parity', moves: split(ALG.ollParity) }]);
      const f = bestCandidate(cur, cands, (s) => keepF2L(s) && orientedEdges(s) === orientedEdges(cur) + 1);
      cur = pushStep(steps, 'Parity', 'Fix OLL parity',
        'An odd number of yellow edges point up, which a 3x3 can never have. Put a flipped edge (yellow not on top) at the front and run the OLL parity algorithm to flip just that edge.', f, { kind: 'flipEdge' });
    }

    while (orientedEdges(cur) < 4) {
      const before = orientedEdges(cur);
      const cands = product(AUF, ['line', 'L']).map(([a, k]) => [
        { label: 'Align', moves: a }, { label: k === 'line' ? "F R U R' U' F'" : "F U R U' R' F'", moves: split(k === 'line' ? ALG.crossLine : ALG.crossL) }]);
      const f = bestCandidate(cur, cands, (s) => keepF2L(s) && orientedEdges(s) > before);
      const shape = before === 0 ? 'Only the center is yellow (a dot)' : 'Two yellow edges point up (a line or an L)';
      cur = pushStep(steps, 'Yellow top', 'Yellow cross',
        `${shape}. Turn the top so the shape sits as shown (line left-right, or L at the back-left), then run the algorithm.`, f, { kind: 'orientEdges' });
    }

    if (orientedCorners(cur) < 4) {
      const oneSune = AUF.map((a) => [{ label: 'Align', moves: a }, { label: 'Sune', moves: split(ALG.sune) }]);
      const goalAll = (s) => keepF2L(s) && orientedEdges(s) === 4 && orientedCorners(s) === 4;
      const plans = [1, 2, 3].map((n) => product(...Array(n).fill(oneSune)).map((p) => p.flat()));
      const plan = plans.map((cands) => bestCandidate(cur, cands, goalAll)).find(Boolean);
      if (!plan) throw new Error('Yellow corners failed.');
      const pairs = [];
      for (let i = 0; i < plan.parts.length; i++) {
        if (plan.parts[i].label === 'Align') { pairs.push([plan.parts[i], plan.parts[i + 1]]); i++; } else pairs.push([plan.parts[i]]);
      }
      pairs.forEach((parts, i) => {
        const moves = parts.flatMap((p) => p.moves);
        cur = pushStep(steps, 'Yellow top', `Yellow corners · Sune ${i + 1}/${pairs.length}`,
          i === pairs.length - 1
            ? 'Turn the top as shown, then do the Sune. This one finishes the yellow face.'
            : 'Turn the top as shown, then do the Sune. The yellow corners are not done yet; another Sune follows.',
          { parts, moves, state: P.applyTokens(cur, moves) }, { kind: 'orientCorners' });
      });
    }

    const cornersDone = (s) => topCorners.every((c) => pieceSolved(s, c.idx));
    if (!cornersDone(cur)) {
      const aPart = (a) => [{ label: 'Align', moves: a }, { label: 'A-perm', moves: split(ALG.aPerm) }];
      const cands = [
        ...AUF.map((d) => [{ label: 'Align', moves: d }]),
        ...product(AUF, AUF).map(([a, d]) => [...aPart(a), { label: 'Finish', moves: d }]),
        ...product(AUF, AUF, AUF).map(([a, b, d]) => [...aPart(a), ...aPart(b), { label: 'Finish', moves: d }]),
      ];
      const f = bestCandidate(cur, cands, (s) => keepF2L(s) && orientedCorners(s) === 4 && cornersDone(s));
      if (!f) throw new Error('Corner permutation failed.');
      cur = pushStep(steps, 'Last layer', 'Place yellow corners',
        'Look for two top corners with the same color on one side ("headlights"). Turn the top so they are at the back, then do the A-perm. With no headlights, do it once from anywhere and look again.', f, { kind: 'permCorners' });
    }

    const finish = (s) => C.isSolved(P.decode(s));
    if (!finish(cur)) {
      const uPerm = (a, which) => [{ label: 'Align', moves: a }, { label: which === 'A' ? 'U-perm (a)' : 'U-perm (b)', moves: split(which === 'A' ? ALG.uPermA : ALG.uPermB) }];
      const finishCands = [
        ...AUF.map((d) => [{ label: 'Align', moves: d }]),
        ...product(AUF, ['A', 'B'], AUF).map(([a, w, d]) => [...uPerm(a, w), { label: 'Finish', moves: d }]),
        ...product(AUF, ['A', 'B'], AUF, ['A', 'B'], AUF).map(([a, w, b, v, d]) => [...uPerm(a, w), ...uPerm(b, v), { label: 'Finish', moves: d }]),
      ];
      let f = bestCandidate(cur, finishCands, finish);
      if (!f) {
        const parityCands = product(AUF, AUF).map(([a, d]) => [{ label: 'Align', moves: a }, { label: 'PLL parity', moves: split(ALG.pllParity) }, { label: 'Restore', moves: d }]);
        const p = bestCandidate(cur, parityCands, (s) => cornersDone(s) && keepF2L(s) && !!bestCandidate(s, finishCands, finish));
        if (!p) throw new Error('PLL parity failed.');
        cur = pushStep(steps, 'Parity', 'Fix PLL parity',
          'Two top edges need to swap places, which is impossible on a 3x3. Put the two edges at front and back and run the PLL parity algorithm.', p, { kind: 'swapEdges' });
        f = bestCandidate(cur, finishCands, finish);
      }
      cur = pushStep(steps, 'Last layer', 'Place yellow edges',
        'Find the side that is already complete and hold it at the back, then do the U-perm (once or twice) until every edge matches its side.', f, { kind: 'permEdges' });
    }
    return cur;
  }

  function solve3x3(state) {
    const steps = [];
    const cross = solveCross(state, steps);
    const layer1 = solveFirstCorners(cross.state, cross.done, steps);
    const layer2 = solveMiddleEdges(layer1.state, [...cross.done, ...layer1.done], steps);
    const final = solveLastLayer(layer2.state, layer2.done, steps);
    return { state: final, steps };
  }

  root.Solver3x3 = { solve3x3, ALG };
})(typeof window !== 'undefined' ? window : globalThis);
