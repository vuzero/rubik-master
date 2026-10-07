# 4×4 Solve Coach

A browser app that solves a 4×4 Rubik's cube from the colors you enter, then walks you through the solution with smooth 3D animation, forward and back.

## Run

Open `index.html` in a browser. No build step and no install. three.js is bundled in `js/vendor/`, so the app works offline (only the web fonts need a connection; there are fallbacks).

To serve it locally instead:

```bash
python3 -m http.server 8417
```

## How it solves

The method is the beginner **reduction** method with a layer-by-layer finish. It only uses short, well-known algorithms:

| Stage | What happens | Algorithms |
|---|---|---|
| Centers | Build the six 2×2 centers, white on the bottom | Short intuitive moves, `Rw U Rw'`-style inserts |
| Edges | Pair the 24 edge pieces into 12 edges | `Dw R F' U R' F Dw'`, `Uw R U R' F R' F' R Uw'` |
| Layer 1 | White cross, then white corners | `R U R' U'` (repeat) |
| Layer 2 | Middle edges | `U R U' R' U' F' U F` and its mirror |
| Yellow top | Yellow cross, yellow face | `F R U R' U' F'`, Sune `R U R' U R U2 R'` |
| Last layer | Corners, then edges | A-perm `R' F R' B2 R F' R' B2 R2`, U-perms |
| Parity (4×4 only) | OLL parity, PLL parity | `Rw2 B2 U2 Lw U2 Rw' U2 Rw U2 F2 Rw F2 Lw' B2 Rw2`, `Rw2 R2 U2 Rw2 R2 Uw2 Rw2 R2 Uw2 U2` |

All moves use standard WCA notation (`R`, `R'`, `R2`, `Rw`, `x y z`). Every move also gets a plain-English explanation on screen.

## Plan, then result

Each step has two views:

- **Plan:** the cube as the step starts. The piece to move has a violet **From** label and its destination a cyan **To** label, joined by an arrow. The card beside the cube shows one line per piece (for example "White–Green edge: top-back edge → bottom-front edge") and the step's moves in large type, to do on your own cube.
- **Done:** press **See result** and the cube fades to its state after the step; the destination is marked **Done ✓**. Press **Next step** for the next plan.

Intermediate positions are not animated: you see where each piece starts and where it must end up. **Why these moves** opens the explanation, **All steps** jumps anywhere, and Play walks through plan → result → next plan on its own.

## Deploy to Cloudflare Pages

Build the static package:

```bash
node tools/build-cloudflare.mjs
```

This creates `dist/` and `rubik-solver-cloudflare.zip`. `dist/` contains:

- the site files, with `?v=<hash>` added to every CSS/JS link so new versions show up immediately;
- `_headers`, which Cloudflare Pages applies automatically: a strict Content Security Policy (scripts only from the site itself), no framing, long-term caching for CSS/JS and `no-cache` for the page.

Upload it either way:

- **Dashboard:** Workers & Pages → Create → Pages → *Upload assets* → drag in `rubik-solver-cloudflare.zip` (or the `dist` folder) → Deploy.
- **CLI:** `npx wrangler pages deploy dist --project-name=rubik-solver` (log in once with `npx wrangler login`).
- **Workers (Git, auto-deploy on every push):** Workers & Pages → Create → Import a repository → `vuzero/rubik-solver`. Project name `rubik-master` (must match `name` in `wrangler.jsonc`), build command `node tools/build-cloudflare.mjs`, deploy command `npx wrangler deploy`.
- **Pages (Git, auto-deploy on every push):** Workers & Pages → Create → Pages → *Connect to Git* → `vuzero/rubik-solver`. Build command `node tools/build-cloudflare.mjs`, build output directory `dist`. No install step or framework preset is needed.

## Files

```
index.html          page markup
css/styles.css      styles (light and dark)
js/cube.js          96-sticker cube model and move notation
js/pieces.js        corners, edges, centers geometry
js/validate.js      checks the entered colors are a real, solvable cube
js/solver-*.js      the three solving stages; js/solver.js runs them in order
js/goals.js         works out each step's goal: which piece goes from where to where
js/goal-overlay.js  draws goal frames and arrows on the 3D cube
js/view3d.js        three.js view; animates one move at a time
js/editor.js        color palette and the unfolded net
js/player.js        step-by-step playback
js/app.js           wires everything together
js/vendor/          three.js r128 (MIT), bundled so the site needs no CDN
tools/              build-cloudflare.mjs: builds dist/ and the upload zip
tests/              node test: validation cases + random solves
```

## Test

```bash
node tests/solver.test.js 200
```

This checks the validator on broken cubes, then solves 200 random scrambles and confirms each solution actually solves the cube, uses WCA moves only, and that every step's goal piece really lands on the destination it announces.
