/* Run: node tests/solver.test.js [count] */
const path = require('path');
['cube', 'pieces', 'validate', 'solver-centers', 'solver-edges', 'solver-3x3', 'goals', 'solver']
  .forEach((f) => require(path.join(__dirname, '..', 'js', f + '.js')));
const C = globalThis.Cube4;
const assert = require('assert');

let seed = 12345;
const rng = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const solved = C.solvedState(C.DEFAULT_SCHEME);

// --- validation cases ---
assert.ok(globalThis.Validate.analyze(solved).ok, 'solved cube is valid');
const blank = solved.slice(); blank[5] = null;
assert.ok(!globalThis.Validate.analyze(blank).ok, 'blank sticker rejected');
const swapped = solved.slice(); [swapped[0], swapped[16]] = [swapped[16], swapped[0]];
assert.ok(!globalThis.Validate.analyze(swapped).ok, 'corner sticker swap rejected');
const twisted = C.applyAlg(solved, "R U R' U R U2 R'");
{ const t = twisted.slice(); const c = globalThis.Pieces.CORNERS[0].idx; [t[c[0]], t[c[1]], t[c[2]]] = [t[c[1]], t[c[2]], t[c[0]]];
  const r = globalThis.Validate.analyze(t); assert.ok(!r.ok && /twisted/.test(r.errors[0]), 'twisted corner rejected'); }
{ const t = solved.slice(); const w = globalThis.Pieces.WINGS[0].idx; [t[w[0]], t[w[1]]] = [t[w[1]], t[w[0]]];
  assert.ok(!globalThis.Validate.analyze(t).ok, 'flipped wing rejected'); }
{ const r = globalThis.Solver.solve(solved); assert.ok(r.ok && r.steps.length === 0, 'solved cube needs no steps'); }

// --- random solves ---
const count = Number(process.argv[2] || 100);
let totalMoves = 0, maxMs = 0, totalMs = 0, parity = { oll: 0, pll: 0 };
for (let i = 0; i < count; i++) {
  // Random orientation too, so white is not always on the bottom.
  const scramble = [...C.randomScramble(60, rng), ...['', 'x', 'y', 'z', 'x2', "z'"].slice(0, 1 + Math.floor(rng() * 6)).slice(-1).filter(Boolean)];
  const state = C.applyAlg(solved, scramble);
  const t0 = Date.now();
  const r = globalThis.Solver.solve(state);
  const ms = Date.now() - t0;
  if (!r.ok) { console.error('FAILED', scramble.join(' '), r.errors); process.exit(1); }
  assert.ok(C.isSolved(C.applyAlg(state, r.steps.flatMap((s) => s.moves))));
  // Every step names its goal, and tracking each goal piece through the step's
  // moves lands it exactly on its announced destination.
  let at = state;
  r.steps.forEach((st) => {
    assert.deepStrictEqual(st.parts.flatMap((p) => p.moves), st.moves, `parts of "${st.title}" match its moves`);
    assert.ok(st.goal.summary, `step "${st.title}" has no goal text`);
    assert.ok(st.goal.items.length, `step "${st.title}" has no goal pieces`);
    st.goal.items.forEach((it) => it.groups.forEach((g) => {
      assert.deepStrictEqual(globalThis.Goals.track(g.from, st.moves), g.to, `goal tracking in "${st.title}"`);
      g.from.forEach((i, k) => assert.strictEqual(at[i], C.applyAlg(at, st.moves)[g.to[k]]));
    }));
    at = C.applyAlg(at, st.moves);
  });
  const WCA = /^([UDLRFB]w?|[xyz])(2|')?$/;
  r.steps.flatMap((s) => s.moves).forEach((m) => assert.ok(WCA.test(m), `non-WCA move ${m}`));
  totalMoves += r.steps.reduce((n, s) => n + s.moves.length, 0);
  totalMs += ms; maxMs = Math.max(maxMs, ms);
  if (r.steps.some((s) => s.title === 'Fix OLL parity')) parity.oll++;
  if (r.steps.some((s) => s.title === 'Fix PLL parity')) parity.pll++;
}
console.log(`ok: ${count} solves, avg ${(totalMoves / count).toFixed(0)} moves, avg ${(totalMs / count).toFixed(0)} ms, max ${maxMs} ms, parity`, parity);
