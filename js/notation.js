/*
 * Plain-English explanations for WCA move notation.
 */
(function (root) {
  'use strict';

  const FACE_WORD = { U: 'top', D: 'bottom', R: 'right', L: 'left', F: 'front', B: 'back' };
  const ROTATION_LIKE = { x: 'R', y: 'U', z: 'F' };
  const ROTATION_HINT = {
    x: 'the front face rolls up to the top', "x'": 'the front face rolls down to the bottom', x2: 'the cube turns upside down, front to back',
    y: 'the front face swings to the left', "y'": 'the front face swings to the right', y2: 'the back face comes to the front',
    z: 'the top face tips over to the right', "z'": 'the top face tips over to the left', z2: 'the cube turns upside down, left to right',
  };

  function amountWords(suffix) {
    if (suffix === '2') return { short: 'half turn', long: 'Half turn (180°). Direction does not matter.' };
    if (suffix === "'") return { short: 'counter-clockwise', long: 'Quarter turn counter-clockwise, as seen looking straight at that side.' };
    return { short: 'clockwise', long: 'Quarter turn clockwise, as seen looking straight at that side.' };
  }

  /**
   * @param {string} token e.g. "R", "Uw2", "y'"
   * @returns {{title: string, detail: string}}
   */
  function explain(token) {
    const m = /^([UDLRFB])(w?)(2|')?$/.exec(token);
    if (m) {
      const [, face, wide, suffix = ''] = m;
      const amount = amountWords(suffix);
      const what = wide ? `${FACE_WORD[face]} two layers` : `${FACE_WORD[face]} face`;
      return {
        title: `${what[0].toUpperCase()}${what.slice(1)}, ${amount.short}`,
        detail: wide
          ? `Grip the ${FACE_WORD[face]} two layers together and turn them. ${amount.long}`
          : `Turn only the outer ${FACE_WORD[face]} layer. ${amount.long}`,
      };
    }
    const r = /^([xyz])(2|')?$/.exec(token);
    if (r) {
      const [, axis, suffix = ''] = r;
      return {
        title: `Rotate the whole cube (${token})`,
        detail: `Turn the entire cube in your hands like ${ROTATION_LIKE[axis]}${suffix}: ${ROTATION_HINT[token]}. No layer turns on its own.`,
      };
    }
    return { title: token, detail: '' };
  }

  const LEGEND = [
    ['R', 'Right face a quarter turn clockwise (looking at that face).'],
    ["R'", 'The same face counter-clockwise. The apostrophe is read "prime".'],
    ['R2', 'Half turn (180°).'],
    ['U D L F B', 'Top, bottom, left, front and back faces, same rules.'],
    ['Rw', 'Wide turn: the right face plus the layer next to it, turned together. Uw, Lw, Fw, Dw, Bw likewise.'],
    ['Rw2 R2', 'Back to back, these turn only the inner slice: the outer R2 undoes the outer half of Rw2.'],
    ['x y z', 'Rotate the whole cube in your hands: x like R, y like U, z like F.'],
  ];

  root.Notation = { explain, LEGEND, FACE_WORD };
})(typeof window !== 'undefined' ? window : globalThis);
