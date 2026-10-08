/*
 * 2x2 support. A 2x2 is the eight corners of a 4x4, so the app stores it as a
 * 4x4 whose centers and edges are filled in from a color scheme (they are
 * never drawn) and only converts at the edges: entering colors and drawing.
 *
 * 4x4 rows/cols 0 | 3 map to 2x2 rows/cols 0 | 1; rows/cols 1-2 have no 2x2 sticker.
 */
(function (root) {
  'use strict';
  const C = root.Cube4;

  const N2 = 2;
  const STICKERS2 = 24;
  const TO2 = [0, -1, -1, 1]; // 4x4 row/col -> 2x2 row/col (-1: not a corner sticker)
  const TO4 = [0, 3]; // 2x2 row/col -> 4x4 row/col

  /** 4x4 sticker index -> 2x2 sticker index, or -1 for a center or edge sticker. */
  const index4to2 = (i) => {
    const g = C.GEOM[i];
    return TO2[g.r] < 0 || TO2[g.c] < 0 ? -1 : g.f * 4 + TO2[g.r] * 2 + TO2[g.c];
  };

  /** 24 colors -> 96 colors: corners from the 2x2, everything else from `scheme` (face -> color). */
  function expand(letters24, scheme) {
    return C.GEOM.map((g, i) => {
      const j = index4to2(i);
      return j < 0 ? (scheme ? scheme[g.face] : null) : letters24[j];
    });
  }

  /** 96 colors -> 24 colors (the corner stickers). */
  function project(letters96) {
    const out = new Array(STICKERS2);
    for (let f = 0; f < 6; f++) {
      for (let r = 0; r < N2; r++) {
        for (let c = 0; c < N2; c++) out[f * 4 + r * 2 + c] = letters96[f * 16 + TO4[r] * 4 + TO4[c]];
      }
    }
    return out;
  }

  const solved = (scheme = C.DEFAULT_SCHEME) => project(C.solvedState(scheme));

  /** Every face one color (a 2x2 has no centers, so any orientation counts). */
  function isSolved(letters24) {
    for (let f = 0; f < 6; f++) {
      for (let k = 1; k < 4; k++) if (letters24[f * 4 + k] !== letters24[f * 4]) return false;
    }
    return true;
  }

  // Outer face turns are the only turns a 2x2 has, same as a 3x3 scramble.
  const randomScramble = (length, rng) => root.Cube3.randomScramble(length, rng);

  root.Cube2 = { N2, STICKERS2, index4to2, expand, project, solved, isSolved, randomScramble };
})(typeof window !== 'undefined' ? window : globalThis);
