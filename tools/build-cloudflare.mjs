/*
 * Builds dist/ (a static site ready for Cloudflare Pages) and
 * rubik-solver-cloudflare.zip.
 *
 *   node tools/build-cloudflare.mjs
 *
 * Local CSS/JS references in index.html get a ?v=<content hash> suffix, so
 * browsers pick up new versions right away while _headers lets them cache
 * every asset for a year.
 */
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const zipPath = join(root, 'rubik-solver-cloudflare.zip');

const HEADERS = `/*
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()
  Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'none'; frame-ancestors 'none'

/
  Cache-Control: no-cache

/index.html
  Cache-Control: no-cache

/css/*
  Cache-Control: public, max-age=31536000, immutable

/js/*
  Cache-Control: public, max-age=31536000, immutable
`;

const hashOf = (file) => createHash('sha256').update(readFileSync(join(root, file))).digest('hex').slice(0, 10);

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist);
for (const item of ['css', 'js', 'favicon.svg']) cpSync(join(root, item), join(dist, item), { recursive: true });

const html = readFileSync(join(root, 'index.html'), 'utf8').replace(
  /(src|href)="((?:css|js)\/[^"?]+)"/g,
  (_, attr, file) => `${attr}="${file}?v=${hashOf(file)}"`,
);
writeFileSync(join(dist, 'index.html'), html);
writeFileSync(join(dist, '_headers'), HEADERS);

if (existsSync(zipPath)) rmSync(zipPath);
execFileSync('zip', ['-qr', zipPath, '.', '-x', '.DS_Store'], { cwd: dist });
console.log(`Built ${dist}\nZipped ${zipPath}`);
