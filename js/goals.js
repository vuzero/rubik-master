/*
 * Step goals: for each solution step, work out which piece(s) the step is
 * about, where they start and where they end up (as sticker slots), plus a
 * short purpose line for every labelled part of the step.
 *
 * A "group" is a list of sticker slots that belong to one piece: a corner (3),
 * an edge half / wing (2), a whole edge (4) or one center cell (1).
 */
(function (root) {
  'use strict';
  const C = root.Cube4;
  const P = root.Pieces;
  const { GEOM } = C;
  const NAMES = root.Validate.COLOR_NAMES;

  const FACE_ORDER = ['U', 'D', 'F', 'B', 'L', 'R'];
  const FACE_WORD = { U: 'top', D: 'bottom', F: 'front', B: 'back', L: 'left', R: 'right' };
  const COLOR_ORDER = ['W', 'Y', 'G', 'B', 'R', 'O'];

  const CORNER_GROUPS = P.CORNERS.map((c) => c.idx);
  const EDGE_GROUPS = P.DEDGES.map((d) => [...d.pairs[0], ...d.pairs[1]]);
  const WING_GROUPS = P.WINGS.map((w) => w.idx);

  /** src[i] = slot (at the start) of the sticker that ends in slot i. */
  function sourceMap(moves) {
    let src = Int16Array.from({ length: C.STICKERS }, (_, i) => i);
    for (const t of moves) {
      const pull = C.getMove(t).pull;
      src = src.map((_, i) => src[pull[i]]);
    }
    return src;
  }

  /** Where the stickers in `group` end up after `moves`. */
  function track(group, moves) {
    return moves.reduce((g, t) => {
      const push = C.getMove(t).push;
      return g.map((i) => push[i]);
    }, group);
  }

  const facesOf = (group) => FACE_ORDER.filter((f) => group.some((i) => GEOM[i].face === f));

  function placeName(group) {
    const faces = facesOf(group);
    const words = faces.map((f) => FACE_WORD[f]).join('-');
    if (faces.length === 3) return `${words} corner`;
    if (faces.length === 2) return `${words} edge`;
    return `${words} center`;
  }

  function pieceName(state, group) {
    const cols = [...new Set(group.map((i) => state[i]))]
      .sort((a, b) => COLOR_ORDER.indexOf(a) - COLOR_ORDER.indexOf(b))
      .map((c) => NAMES[c]);
    if (group.length === 1) return `${cols[0]} center piece`;
    return `${cols.join('–')} ${group.length === 3 ? 'corner' : 'edge'}`;
  }

  const sameSet = (a, b) => a.length === b.length && a.every((x) => b.includes(x));
  const inTop = (group) => group.some((i) => GEOM[i].face === 'U');
  const topSticker = (group) => group.find((i) => GEOM[i].face === 'U');
  const center = (s, face) => s[C.FACES.indexOf(face) * 16 + 5];
  const findByColors = (s, groups, cols) => groups.find((g) => sameSet([...new Set(g.map((i) => s[i]))], cols));

  function item(start, end, src, toGroups, leadingTurns) {
    const groups = toGroups.map((to) => ({ to, from: to.map((i) => src[i]) }));
    const all = groups.flatMap((g) => g.to);
    // Name the start position as the solver sees it after any opening whole-cube turn.
    const seenFrom = (g) => track(g.from, leadingTurns);
    const fromNames = [...new Set(groups.map((g) => (g.from.length === 1
      ? `${FACE_WORD[GEOM[seenFrom(g)[0]].face]} face` : placeName(seenFrom(g)))))];
    return {
      name: pieceName(end, all),
      colors: [...new Set(all.map((i) => end[i]))].sort((a, b) => COLOR_ORDER.indexOf(a) - COLOR_ORDER.indexOf(b)),
      fromName: fromNames.join(' + '),
      toName: placeName(all),
      inPlace: groups.every((g) => sameSet(g.from, g.to)),
      groups,
    };
  }

  // ---- per-kind target selection (groups are end-of-step slots) ----------
  const TARGETS = {
    center(start, end, src, goal) {
      const f = C.FACES.indexOf(goal.face);
      const cells = P.CENTER_IDX.filter((i) => GEOM[i].f === f && end[i] === goal.color);
      const fresh = cells.filter((i) => GEOM[src[i]].f !== f);
      return (fresh.length ? fresh : cells.filter((i) => src[i] !== i)).map((i) => [[i]]);
    },
    pair(start, end, src) {
      return P.DEDGES.filter((d) => {
        const [a, b] = d.pairs;
        if (end[a[0]] !== end[a[1]] || end[b[0]] !== end[b[1]]) return false;
        const wasPaired = (dd) => start[dd.pairs[0][0]] === start[dd.pairs[0][1]] && start[dd.pairs[1][0]] === start[dd.pairs[1][1]];
        const before = P.DEDGES.find((dd) => [...dd.pairs[0], ...dd.pairs[1]].includes(src[a[0]]));
        const together = before && [...before.pairs[0], ...before.pairs[1]].includes(src[a[1]]);
        return !(together && wasPaired(before));
      }).map((d) => d.wings.map((w) => WING_GROUPS[w]));
    },
    piece(start, end, src, goal) {
      const groups = goal.colors.length === 3 ? CORNER_GROUPS : EDGE_GROUPS;
      return [[findByColors(end, groups, goal.colors)]];
    },
    extract(...args) { return TARGETS.piece(...args); },
    anchor(...args) { return TARGETS.piece(...args); },
    flipEdge: (...args) => TARGETS.orientEdges(...args),
    orientEdges(start, end, src) {
      const top = center(end, 'U');
      return EDGE_GROUPS.filter((g) => inTop(g) && end[topSticker(g)] === top && GEOM[src[topSticker(g)]].face !== 'U').map((g) => [g]);
    },
    orientCorners(start, end, src) {
      const top = center(end, 'U');
      const up = CORNER_GROUPS.filter((g) => inTop(g) && end[topSticker(g)] === top);
      const fresh = up.filter((g) => GEOM[src[topSticker(g)]].face !== 'U');
      if (fresh.length) return fresh.map((g) => [g]);
      const changed = CORNER_GROUPS.filter((g) => inTop(g) && g.some((i) => src[i] !== i));
      return (up.length ? up : changed).map((g) => [g]);
    },
    permCorners: (start, end, src) => movedTop(CORNER_GROUPS, src),
    permEdges: (start, end, src) => movedTop(EDGE_GROUPS, src),
    swapEdges: (start, end, src) => movedTop(EDGE_GROUPS, src),
  };

  // Top-layer pieces that end somewhere other than where they started.
  function movedTop(groups, src) {
    return groups.filter((g) => inTop(g) && !sameSet(g.map((i) => src[i]), g)).map((g) => [g]);
  }

  // ---- human text --------------------------------------------------------
  function summary(goal, items, end) {
    const n = items.length;
    switch (goal.kind) {
      case 'center': {
        const done = P.CENTER_IDX.filter((i) => GEOM[i].face === goal.face && end[i] === goal.color).length;
        return `Bring ${n === 1 ? 'one' : n} ${NAMES[goal.color]} piece${n === 1 ? '' : 's'} into the ${FACE_WORD[goal.face]} center (${done}/4 after this step).`;
      }
      case 'pair': return n > 1 ? `Join the halves of ${n} edges so each edge is one solid color pair.` : 'Join two matching edge halves into one solid edge.';
      case 'piece':
        if (items[0].name.endsWith('corner')) return `Put the ${items[0].name} into its home slot, white facing down.`;
        return items[0].name.startsWith('White')
          ? `Put the ${items[0].name} next to the white center, white facing down and the other color matching its side center.`
          : `Put the ${items[0].name} into its home slot, each color next to its matching center.`;
      case 'extract': return `Lift the ${items[0].name} out of its wrong slot into the top layer, so it can be inserted properly next.`;
      case 'flipEdge': return 'Flip one top edge in place so its yellow sticker faces up.';
      case 'orientEdges': return `Turn ${n === 1 ? 'one more top edge' : `${n} more top edges`} yellow side up to grow the yellow cross.`;
      case 'orientCorners': {
        const top = center(end, 'U');
        const allUp = CORNER_GROUPS.filter((g) => inTop(g)).every((g) => end[topSticker(g)] === top);
        return allUp ? 'Twist the top corners so yellow faces up and finish the yellow face.'
          : 'Twist the top corners into a pattern the next Sune can finish.';
      }
      case 'permCorners': return 'Move the top corners to their own spots (colors matching the sides).';
      case 'permEdges': return 'Move the top edges to their own spots to finish the cube.';
      case 'swapEdges': return 'Swap two top edges, a move only a 4x4 needs.';
      case 'hold': return 'Turn the whole cube so the white center is on the bottom, and keep holding it that way.';
      case 'anchor': return `Turn the whole cube so the ${items[0].name} is on the bottom, white facing down. The other corners line up with it.`;
      default: return '';
    }
  }

  const PART_WHY = {
    Setup: (g) => (g.kind === 'pair'
      ? 'Bring two matching edge halves into the positions the algorithm expects.'
      : 'Line up the piece and the empty spot.'),
    Insert: () => 'Carry the piece into the center, then put the finished centers back.',
    Moves: (g) => (g.kind === 'center' ? 'Bring the piece into the center.' : 'Bring the edge down next to the white center, side color matching.'),
    'Turn cube': (g) => (g.kind === 'hold' || g.kind === 'anchor'
      ? 'Turn the whole cube; no layer moves on its own.'
      : 'Turn the whole cube so the target slot is at the front-right.'),
    Align: () => 'Turn the top layer into the starting position for the next algorithm.',
    'Insert right': () => 'Insert the edge into the right-hand slot of the middle layer.',
    'Insert left': () => 'Insert the edge into the left-hand slot of the middle layer.',
    'Edge pairing (flip)': () => 'Join the two halves, swap the new pair out of the middle layers, restore the centers.',
    'Edge pairing (Dw)': () => 'Join the two halves, swap the new pair out of the middle layers, restore the centers.',
    'Edge flip parity': () => 'Flip the halves of the front-top edge (only even cubes need this).',
    'OLL parity': () => 'Flip the front-top edge in place (only even cubes need this).',
    'PLL parity': () => 'Swap the front and back top edges (only even cubes need this).',
    Sune: () => 'Twist three top corners.',
    'A-perm': () => 'Cycle three top corners.',
    'U-perm (a)': () => 'Cycle three top edges.',
    'U-perm (b)': () => 'Cycle three top edges.',
    "F R U R' U' F'": () => 'Flip top edges to grow the yellow cross.',
    "F U R U' R' F'": () => 'Flip top edges to grow the yellow cross.',
    Finish: () => 'Turn the top so it lines up with the rest of the cube.',
    Restore: () => 'Turn the top back so the corners line up again.',
  };

  function partWhy(label, goal) {
    if (/^R U R' U'/.test(label)) return 'Repeat this until the corner drops in with white facing down.';
    return PART_WHY[label] ? PART_WHY[label](goal || {}) : '';
  }

  /**
   * Adds `goal.items`, `goal.summary` and part `why` text to every step.
   * @param {string[]} startLetters
   * @param {Object[]} steps
   */
  function annotate(startLetters, steps) {
    let state = startLetters;
    return steps.map((step) => {
      const end = C.applyAlg(state, step.moves);
      const goal = step.goal || {};
      const src = sourceMap(step.moves);
      const targets = TARGETS[goal.kind] ? TARGETS[goal.kind](state, end, src, goal) : [];
      // An anchor step is only a whole-cube turn: name where the corner starts in the hand.
      const leadingTurns = [];
      for (const t of step.moves) { if (goal.kind !== 'anchor' && /^[xyz]/.test(t)) leadingTurns.push(t); else break; }
      const items = targets.filter((t) => t.every(Boolean)).map((t) => item(state, end, src, t, leadingTurns));
      const parts = step.parts.map((p) => ({ ...p, why: partWhy(p.label, goal) }));
      state = end;
      return { ...step, parts, goal: { ...goal, summary: summary(goal, items, end), items } };
    });
  }

  root.Goals = { annotate, track, sourceMap, placeName };
})(typeof window !== 'undefined' ? window : globalThis);
