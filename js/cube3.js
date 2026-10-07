/*
 * 3x3 support. A 3x3 behaves exactly like a 4x4 whose centers are built and
 * whose edges are paired, so the app stores and solves every cube as a 4x4
 * and only converts at the edges: entering colors and drawing the cube.
 *
 * 4x4 rows/cols 0 | 1 2 | 3 map to 3x3 rows/cols 0 | 1 | 2.
 */
(function (root) {
  'use strict';
  const C = root.Cube4;

  const N3 = 3;
  const STICKERS3 = 54;
  const TO3 = [0, 1, 1, 2]; // 4x4 row/col -> 3x3 row/col
  const TO4 = [0, 1, 3]; // 3x3 row/col -> a representative 4x4 row/col

  const index4to3 = (i) => {
    const g = C.GEOM[i];
    return g.f * 9 + TO3[g.r] * 3 + TO3[g.c];
  };

  /** 54 colors -> 96 colors (each 3x3 sticker fills the matching 4x4 stickers). */
  function expand(letters54) {
    return C.GEOM.map((g) => letters54[g.f * 9 + TO3[g.r] * 3 + TO3[g.c]]);
  }

  /** 96 colors -> 54 colors, reading one representative 4x4 sticker per 3x3 sticker. */
  function project(letters96) {
    const out = new Array(STICKERS3);
    for (let f = 0; f < 6; f++) {
      for (let r = 0; r < N3; r++) {
        for (let c = 0; c < N3; c++) out[f * 9 + r * 3 + c] = letters96[f * 16 + TO4[r] * 4 + TO4[c]];
      }
    }
    return out;
  }

  const solved = (scheme = C.DEFAULT_SCHEME) => project(C.solvedState(scheme));

  /** A random 3x3 scramble: outer face turns only. */
  function randomScramble(length, rng) {
    const rand = rng || Math.random;
    const faces = ['U', 'D', 'L', 'R', 'F', 'B'];
    const sufs = ['', "'", '2'];
    const moves = [];
    let lastAxis = -1;
    while (moves.length < length) {
      const face = faces[Math.floor(rand() * 6)];
      const axis = C.FACE_AXIS[face][0];
      if (axis === lastAxis) continue;
      lastAxis = axis;
      moves.push(face + sufs[Math.floor(rand() * 3)]);
    }
    return moves;
  }

  root.Cube3 = { N3, STICKERS3, index4to3, expand, project, solved, randomScramble };
})(typeof window !== 'undefined' ? window : globalThis);
