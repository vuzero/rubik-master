/*
 * Stage 1: build the six 2x2 centers, one piece (or more) at a time.
 *
 * Works on a 24-cell center-only state. Each step looks for the shortest
 * sequence that adds at least one piece to the center being built while
 * leaving finished centers intact: first plain short sequences, then
 * "setup + slice / face turn / slice back" insertions (e.g. Rw U Rw').
 */
(function (root) {
  'use strict';
  const C = root.Cube4;
  const P = root.Pieces;

  const FACE_LETTERS = ['U', 'D', 'L', 'R', 'F', 'B'];
  const SUFFIXES = ['', "'", '2'];
  const FACE_MOVES = FACE_LETTERS.flatMap((f) => SUFFIXES.map((s) => f + s));
  const WIDE_MOVES = FACE_LETTERS.flatMap((f) => SUFFIXES.map((s) => f + 'w' + s));
  // WCA notation only: outer faces and two-layer wide turns.
  const ALL_MOVES = [...FACE_MOVES, ...WIDE_MOVES];
  const LAYER_MOVES = WIDE_MOVES;

  const FACE_NAMES = { U: 'top', D: 'bottom', F: 'front', B: 'back', R: 'right', L: 'left' };
  const AXIS = { U: 1, D: 1, R: 0, L: 0, F: 2, B: 2 };
  const faceOf = (t) => t[0].toUpperCase();

  // Center slot k belongs to face Math.floor(k / 4) (U R F D L B order).
  const CPOS = new Int16Array(C.STICKERS).fill(-1);
  P.CENTER_IDX.forEach((idx, k) => { CPOS[idx] = k; });

  const PERM = new Map();
  function cperm(token) {
    let p = PERM.get(token);
    if (!p) {
      const pull = C.getMove(token).pull;
      p = Int8Array.from(P.CENTER_IDX, (idx) => CPOS[pull[idx]]);
      PERM.set(token, p);
    }
    return p;
  }

  function step(cs, token) {
    const p = cperm(token);
    const out = new Uint8Array(24);
    for (let k = 0; k < 24; k++) out[k] = cs[p[k]];
    return out;
  }

  const runAll = (cs, tokens) => tokens.reduce(step, cs);

  function makeGoal(target, done, face) {
    const count = (s, f) => {
      let n = 0;
      for (let k = f * 4; k < f * 4 + 4; k++) if (s[k] === target[f]) n++;
      return n;
    };
    return { count, ok: (s, base) => count(s, face) > base && done.every((f) => count(s, f) === 4) };
  }

  // Plain sequences of up to maxDepth single moves.
  function searchPlain(cs, goal, base, maxDepth) {
    const path = [];
    function dfs(s, depth) {
      if (depth === 0) return goal.ok(s, base);
      for (const t of ALL_MOVES) {
        const prev = path[path.length - 1];
        if (prev && faceOf(prev) === faceOf(t)) continue;
        path.push(t);
        if (dfs(step(s, t), depth - 1)) return true;
        path.pop();
      }
      return false;
    }
    for (let d = 1; d <= maxDepth; d++) if (dfs(cs, d)) return { moves: path.slice(), setup: [], alg: [] };
    return null;
  }

  function setupsUpTo(maxLen) {
    const out = [[]];
    let frontier = [[]];
    for (let len = 1; len <= maxLen; len++) {
      const next = [];
      for (const seq of frontier) {
        for (const t of FACE_MOVES) {
          const prev = seq[seq.length - 1];
          if (prev && faceOf(prev) === faceOf(t)) continue;
          next.push([...seq, t]);
        }
      }
      out.push(...next);
      frontier = next;
    }
    return out;
  }
  const SETUPS = setupsUpTo(2);

  // setup + A B A' (+ optional trailing face turn).
  function searchInsertion(cs, goal, base, withTrail) {
    for (const setup of SETUPS) {
      const s0 = runAll(cs, setup);
      for (const a of LAYER_MOVES) {
        const s1 = step(s0, a);
        const aInv = C.invertToken(a);
        for (const b of FACE_MOVES) {
          if (AXIS[faceOf(b)] === AXIS[faceOf(a)]) continue;
          const s3 = step(step(s1, b), aInv);
          if (!withTrail) {
            if (goal.ok(s3, base)) return { setup, alg: [a, b, aInv], moves: [...setup, a, b, aInv] };
            continue;
          }
          for (const t of FACE_MOVES) {
            if (goal.ok(step(s3, t), base)) return { setup, alg: [a, b, aInv, t], moves: [...setup, a, b, aInv, t] };
          }
        }
      }
    }
    return null;
  }

  function findStep(cs, goal, base) {
    return searchPlain(cs, goal, base, 3)
      || searchInsertion(cs, goal, base, false)
      || searchInsertion(cs, goal, base, true);
  }

  function describe(found, colorName, faceLetter, isFirst) {
    const where = `${FACE_NAMES[faceLetter]} (${faceLetter})`;
    if (!found.alg.length) {
      return isFirst
        ? `Gather ${colorName} center pieces on the ${where} face. Nothing is finished yet, so any turns are fine.`
        : `Turn layers to bring a ${colorName} piece into the ${where} center. Finished centers are not disturbed.`;
    }
    const [a, b, aInv] = found.alg;
    return `${found.setup.length ? 'Line up the piece and the empty spot, then use' : 'Use'} ${a} ${b} ${aInv}: `
      + `${a} carries a ${colorName} piece into the ${where} face, ${b} moves it out of the way, `
      + `and ${aInv} puts the finished centers back.`;
  }

  /**
   * @returns {{state: Uint8Array, steps: Object[]}}
   */
  function solveCenters(state, scheme, colorNames) {
    const target = Uint8Array.from(C.FACES, (f) => P.CODE[scheme[f]]);
    let cs = Uint8Array.from(P.CENTER_IDX, (i) => state[i]);
    let full = state;
    const steps = [];
    const done = [];
    const faceIndex = (letter) => C.FACES.indexOf(letter);
    const order = ['D', 'U'];

    while (done.length < 6) {
      const remaining = C.FACES.map((_, f) => f).filter((f) => !done.includes(f));
      const counter = makeGoal(target, done, 0).count;
      const face = done.length < order.length
        ? faceIndex(order[done.length])
        : remaining.reduce((best, f) => (counter(cs, f) > counter(cs, best) ? f : best));
      const letter = C.FACES[face];
      const colorName = colorNames[scheme[letter]];
      const goal = makeGoal(target, done, face);
      let isFirstMove = true;

      while (goal.count(cs, face) < 4) {
        const base = goal.count(cs, face);
        const found = findStep(cs, goal, base);
        if (!found) throw new Error(`Could not place a center piece on ${letter}.`);
        cs = runAll(cs, found.moves);
        full = P.applyTokens(full, found.moves);
        const now = goal.count(cs, face);
        steps.push({
          phase: 'Centers',
          title: `${colorName} center on ${FACE_NAMES[letter]} · ${now}/4`,
          text: describe(found, colorName, letter, done.length === 0 && isFirstMove),
          parts: found.alg.length && found.setup.length
            ? [{ label: 'Setup', moves: found.setup }, { label: 'Insert', moves: found.alg }]
            : [{ label: found.alg.length ? 'Insert' : 'Moves', moves: found.moves }],
          moves: found.moves,
          focus: letter,
          goal: { kind: 'center', face: letter, color: scheme[letter] },
        });
        isFirstMove = false;
      }
      done.push(face);
    }
    return { state: full, steps };
  }

  root.SolverCenters = { solveCenters, FACE_NAMES, FACE_MOVES };
})(typeof window !== 'undefined' ? window : globalThis);
