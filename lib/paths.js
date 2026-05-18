// Filesystem path helpers. Only used by local-install tools (child theme, mu-plugin scaffold, theme file read/write).
// Refuses to operate when WP_ROOT is not set or doesn't look like a WordPress install.

import fs from 'node:fs';
import path from 'node:path';

export function wpRoot() {
  const root = process.env.WP_ROOT;
  if (!root) throw new Error('WP_ROOT not set in .env. Required for filesystem tools.');
  const cfg = path.join(root, 'wp-config.php');
  if (!fs.existsSync(cfg)) {
    throw new Error(`WP_ROOT=${root} does not contain wp-config.php. Refusing to write.`);
  }
  return root;
}

export function wpContent()       { return path.join(wpRoot(), 'wp-content'); }
export function themesDir()       { return path.join(wpContent(), 'themes'); }
export function muPluginsDir()    { return path.join(wpContent(), 'mu-plugins'); }
export function pluginsDir()      { return path.join(wpContent(), 'plugins'); }
export function uploadsDir()      { return path.join(wpContent(), 'uploads'); }

// Resolve `userPath` relative to `baseDir`. Throws if it would escape `baseDir` (path traversal).
export function safeJoin(baseDir, userPath) {
  if (!userPath || typeof userPath !== 'string') throw new Error('path required');
  if (path.isAbsolute(userPath)) throw new Error('path must be relative');
  const abs = path.resolve(baseDir, userPath);
  const rel = path.relative(baseDir, abs);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(`Path escapes base directory: ${userPath}`);
  }
  return abs;
}

export function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}
