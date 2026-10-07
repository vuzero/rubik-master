/* Run: node tests/solver3.test.js [count] */
const path = require('path');
['cube', 'cube3', 'pieces', 'validate', 'solver-centers', 'solver-edges', 'solver-3x3', 'goals', 'solver3']
  .forEach((f) => require(path.join(__dirname, '..', 'js', f + '.js')));
const C = globalThis.Cube4;
const T = globalThis.Cube3;
const S = globalThis.Solver3;
const assert = require('assert');

let seed = 4242;
const rng = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const solved = T.solved();
const scrambled = () => T.project(C.applyAlg(T.expand(solved), T.randomScramble(30, rng)));
const at = (face, r, c) => C.FACES.indexOf(face) * 9 + r * 3 + c;
const swap = (s, a, b) => { const t = s.slice(); [t[a], t[b]] = [t[b], t[a]]; return t; };

// --- input checks ---
{ const r = S.solve(solved); assert.ok(r.ok && r.steps.length === 0, 'solved 3x3 needs no steps'); }
{ const t = solved.slice(); t[0] = null; assert.ok(/blank/.test(S.solve(t).errors[0]), 'blank sticker rejected'); }
{ const t = swap(solved, at('U', 0, 0), at('F', 1, 1)); assert.ok(!S.solve(t).ok, 'color counts / centers rejected'); }
// Flip one edge (UF): swap its two stickers.
{ const r = S.solve(swap(solved, at('U', 2, 1), at('F', 0, 1))); assert.ok(!r.ok && /flipped/.test(r.errors.join(' ')), `flipped edge rejected: ${r.errors}`); }
// Swap two edges (UF and UB) as whole pieces.
{
  let t = swap(solved, at('U', 2, 1), at('U', 0, 1));
  t = swap(t, at('F', 0, 1), at('B', 0, 1));
  const r = S.solve(t);
  assert.ok(!r.ok && /swapped/.test(r.errors.join(' ')), `swapped edges rejected: ${r.errors}`);
}
// Twist one corner (UFR) in place.
{
  const a = at('U', 2, 2); const b = at('F', 0, 2); const c = at('R', 0, 0);
  const t = solved.slice(); [t[a], t[b], t[c]] = [t[b], t[c], t[a]];
  assert.ok(!S.solve(t).ok, 'twisted corner rejected');
}

// --- random solves, white center starting on every face ---
const count = Number(process.argv[2] || 100);
const turns = ['', 'x', "x'", 'x2', 'z', "z'"];
let moves = 0;
for (let i = 0; i < count; i++) {
  const turned = T.project(C.applyAlg(T.expand(scrambled()), C.splitAlg(turns[i % turns.length])));
  const r = S.solve(turned);
  if (!r.ok) { console.error('FAILED', r.errors); process.exit(1); }
  assert.ok(C.isSolved(C.applyAlg(T.expand(turned), r.steps.flatMap((s) => s.moves))));
  r.steps.forEach((st) => {
    assert.deepStrictEqual(st.parts.flatMap((p) => p.moves), st.moves);
    assert.ok(st.goal.summary, `step "${st.title}" has no goal text`);
    assert.ok(!/Rw|Uw|Lw|Dw|Fw|Bw/.test(st.moves.join(' ')), 'a 3x3 solution uses no wide turns');
  });
  moves += r.steps.reduce((n, s) => n + s.moves.length, 0);
}
console.log(`ok: ${count} 3x3 solves, avg ${(moves / count).toFixed(0)} moves`);
