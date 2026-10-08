/* Run: node tests/solver2.test.js [count] */
const path = require('path');
['cube', 'cube3', 'cube2', 'pieces', 'validate', 'solver-centers', 'solver-edges', 'solver-3x3', 'goals', 'solver2']
  .forEach((f) => require(path.join(__dirname, '..', 'js', f + '.js')));
const C = globalThis.Cube4;
const T = globalThis.Cube2;
const S = globalThis.Solver2;
const assert = require('assert');

let seed = 2024;
const rng = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const solved = T.solved();
const scrambledFrom = (start) => T.project(C.applyAlg(T.expand(start, C.DEFAULT_SCHEME), T.randomScramble(25, rng)));
const at = (face, r, c) => C.FACES.indexOf(face) * 4 + r * 2 + c;
const swap = (s, a, b) => { const t = s.slice(); [t[a], t[b]] = [t[b], t[a]]; return t; };

// --- input checks ---
{ const r = S.solve(solved); assert.ok(r.ok && r.steps.length === 0, 'solved 2x2 needs no steps'); }
{ const t = solved.slice(); t[0] = null; assert.ok(/blank/.test(S.solve(t).errors[0]), 'blank sticker rejected'); }
{ const t = solved.slice(); t[0] = 'G'; assert.ok(/4 of each/.test(S.solve(t).errors.join(' ')), 'color counts rejected'); }
// Twist one corner (UFR) in place.
{
  const a = at('U', 1, 1); const b = at('F', 0, 1); const c = at('R', 0, 0);
  const t = solved.slice(); [t[a], t[b], t[c]] = [t[b], t[c], t[a]];
  const r = S.solve(t);
  assert.ok(!r.ok && /twisted/.test(r.errors.join(' ')), `twisted corner rejected: ${r.errors}`);
}
// Two stickers swapped between corners: some corner then has impossible colors.
{ const r = S.solve(swap(solved, at('U', 0, 0), at('F', 0, 0))); assert.ok(!r.ok, 'impossible corner rejected'); }

// --- swapping two corners is legal on a 2x2 (no edges to fix the parity) ---
{
  // Corner stickers in Pieces.CORNERS order keep each piece's handedness when swapped.
  const [a, b] = globalThis.Pieces.CORNERS.slice(0, 2).map((c) => c.idx.map(T.index4to2));
  const t = a.reduce((s, i, k) => swap(s, i, b[k]), solved);
  const r = S.solve(t);
  assert.ok(r.ok, `two swapped corners solve: ${r.errors}`);
  assert.ok(T.isSolved(T.project(C.applyAlg(r.start, r.steps.flatMap((s) => s.moves)))));
}

// --- random solves, held every possible way and in a non-standard color scheme ---
const count = Number(process.argv[2] || 100);
const holds = ['', 'y', 'x', "x'", 'x2', 'z', "z'", 'x y', 'z2 y'];
const japanese = { U: 'B', D: 'W', F: 'G', B: 'Y', R: 'O', L: 'R' };
let moves = 0;
let anchors = 0;
for (let i = 0; i < count; i++) {
  const base = i % 5 === 4 ? T.solved(japanese) : solved;
  const turned = T.project(C.applyAlg(T.expand(scrambledFrom(base), C.DEFAULT_SCHEME), C.splitAlg(holds[i % holds.length])));
  const r = S.solve(turned);
  if (!r.ok) { console.error('FAILED', r.errors, turned.join('')); process.exit(1); }
  assert.deepStrictEqual(T.project(r.start), turned, 'start state keeps the entered corners');
  assert.ok(T.isSolved(T.project(C.applyAlg(r.start, r.steps.flatMap((s) => s.moves)))));
  r.steps.forEach((st, k) => {
    assert.deepStrictEqual(st.parts.flatMap((p) => p.moves), st.moves);
    assert.ok(st.goal.summary, `step "${st.title}" has no goal text`);
    assert.ok(!/w|[udlrfb]/.test(st.moves.join(' ')), 'a 2x2 solution uses outer turns and cube turns only');
    assert.ok(!['Layer 2', 'Parity'].includes(st.phase), `a 2x2 has no ${st.phase} step`);
    if (st.goal.kind === 'anchor') {
      anchors++;
      assert.strictEqual(k, 0, 'the anchor step comes first');
      assert.ok(st.goal.items.length === 1 && !st.goal.items[0].inPlace, 'the anchor step shows the corner moving');
    }
  });
  moves += r.steps.reduce((n, s) => n + s.moves.length, 0);
}
console.log(`ok: ${count} 2x2 solves, avg ${(moves / count).toFixed(0)} moves, ${anchors} with an anchor turn`);
