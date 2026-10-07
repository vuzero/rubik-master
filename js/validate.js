/*
 * Checks that an entered coloring is a real, solvable 4x4 and works out the
 * color scheme (which color belongs on which face once solved).
 */
(function (root) {
  'use strict';
  const C = root.Cube4;
  const P = root.Pieces;

  const COLOR_NAMES = { W: 'White', Y: 'Yellow', G: 'Green', B: 'Blue', R: 'Red', O: 'Orange' };
  const STANDARD = C.DEFAULT_SCHEME;

  function permutations(arr) {
    if (arr.length <= 1) return [arr];
    return arr.flatMap((x, i) => permutations([...arr.slice(0, i), ...arr.slice(i + 1)]).map((p) => [x, ...p]));
  }

  const cyclicKey = (cols) => {
    const rots = cols.map((_, i) => cols.slice(i).concat(cols.slice(0, i)).join(''));
    return rots.sort()[0];
  };

  const cornerKeys = (s) => P.CORNERS.map((c) => cyclicKey(c.idx.map((i) => s[i])));
  const wingKeys = (s) => P.WINGS.map((w) => w.idx.map((i) => s[i]).join(''));
  const sortedJoin = (keys) => keys.slice().sort().join('|');

  function schemeSignature(scheme) {
    const solved = C.solvedState(scheme);
    return { corners: sortedJoin(cornerKeys(solved)), wings: sortedJoin(wingKeys(solved)) };
  }

  const ALL_SCHEMES = permutations(C.COLORS).map((perm) => Object.fromEntries(C.FACES.map((f, i) => [f, perm[i]])));

  const pieceName = (ids) => ids.map((i) => C.GEOM[i].face).join('');
  const colorList = (cols) => cols.map((c) => COLOR_NAMES[c]).join('-');

  function diagnosePieces(state) {
    const errors = [];
    const solved = C.solvedState(STANDARD);
    const validCorners = new Set(cornerKeys(solved));
    const validWings = new Set(wingKeys(solved));
    const seenCorners = new Map();
    P.CORNERS.forEach((c) => {
      const cols = c.idx.map((i) => state[i]);
      const key = cyclicKey(cols);
      if (!validCorners.has(key)) {
        errors.push(`Corner ${pieceName(c.idx)} shows ${colorList(cols)}, which no corner piece has.`);
      } else if (seenCorners.has(key)) {
        errors.push(`Corner ${colorList(cols)} appears twice (${seenCorners.get(key)} and ${pieceName(c.idx)}).`);
      } else {
        seenCorners.set(key, pieceName(c.idx));
      }
    });
    const seenWings = new Map();
    P.WINGS.forEach((w) => {
      const cols = w.idx.map((i) => state[i]);
      const key = cols.join('');
      const where = `${pieceName(w.idx)} edge`;
      if (!validWings.has(key)) {
        errors.push(`An edge piece on the ${where} shows ${colorList(cols)}, which no edge piece has.`);
      } else if (seenWings.has(key)) {
        errors.push(`Edge piece ${colorList(cols)} on the ${where} duplicates the one on the ${seenWings.get(key)}; one of them is probably flipped.`);
      } else {
        seenWings.set(key, where);
      }
    });
    return errors;
  }

  function cornerTwist(state, scheme) {
    const ud = [scheme.U, scheme.D];
    return P.CORNERS.reduce((sum, c) => sum + c.idx.findIndex((i) => ud.includes(state[i])), 0) % 3;
  }

  function centerMatches(state, scheme) {
    return P.CENTER_IDX.reduce((n, i) => n + (state[i] === scheme[C.GEOM[i].face] ? 1 : 0), 0);
  }

  /**
   * @param {string[]} state 96 color letters (or null for blank)
   * @returns {{ok: boolean, errors: string[], scheme?: Object}}
   */
  function analyze(state) {
    const blanks = state.filter((c) => !C.COLORS.includes(c)).length;
    if (blanks) return { ok: false, errors: [`${blanks} sticker${blanks > 1 ? 's are' : ' is'} still blank.`] };

    const countErrors = C.COLORS.map((col) => [col, state.filter((c) => c === col).length])
      .filter(([, n]) => n !== 16)
      .map(([col, n]) => `${COLOR_NAMES[col]} has ${n} stickers; a 4x4 has exactly 16 of each color.`);
    if (countErrors.length) return { ok: false, errors: countErrors };

    const inputCorners = sortedJoin(cornerKeys(state));
    const inputWings = sortedJoin(wingKeys(state));
    const valid = ALL_SCHEMES.filter((s) => {
      const sig = schemeSignature(s);
      return sig.corners === inputCorners && sig.wings === inputWings;
    });
    if (!valid.length) {
      const errors = diagnosePieces(state);
      return { ok: false, errors: errors.length ? errors : ['These colors do not match any real cube. Re-check each face.'] };
    }

    const whiteDown = valid.filter((s) => s.D === 'W');
    const candidates = whiteDown.length ? whiteDown : valid;
    const scheme = candidates.reduce((best, s) => (centerMatches(state, s) > centerMatches(state, best) ? s : best));

    if (cornerTwist(state, scheme) !== 0) {
      return { ok: false, errors: ['One corner is twisted in place, so this cube cannot be solved. Re-check the corner stickers.'] };
    }
    return { ok: true, errors: [], scheme };
  }

  root.Validate = { analyze, COLOR_NAMES };
})(typeof window !== 'undefined' ? window : globalThis);
