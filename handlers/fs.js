// Filesystem handlers — only run for local installs.
// Reads/writes inside wp-content; refuses path traversal; refuses to overwrite unless asked.

import fs from 'node:fs';
import path from 'node:path';
import { themesDir, muPluginsDir, safeJoin, ensureDir } from '../lib/paths.js';
import { get_active_theme_info } from './rest.js';

async function resolveStylesheet(stylesheet) {
  if (stylesheet) return stylesheet;
  const info = await get_active_theme_info();
  if (!info.ok) throw new Error(`Could not determine active theme: ${JSON.stringify(info.error)}`);
  return info.data.stylesheet;
}

export async function create_child_theme({ parent_stylesheet, slug, theme_name }) {
  const parent = parent_stylesheet || (await resolveStylesheet());
  const childSlug = slug || `${parent}-child`;
  const themesRoot = themesDir();
  const childDir = path.join(themesRoot, childSlug);

  if (fs.existsSync(childDir)) {
    return { ok: false, status: 0, error: { message: `Child theme already exists at ${childDir}` } };
  }
  ensureDir(childDir);

  const name = theme_name || `${parent} Child`;
  const styleCss =
`/*
 Theme Name:   ${name}
 Template:     ${parent}
 Version:      1.0.0
 Text Domain:  ${childSlug}
*/
`;
  const functionsPhp =
`<?php
/** Enqueue parent + child stylesheets. */
add_action( 'wp_enqueue_scripts', function() {
    $parent = wp_get_theme()->parent();
    $parent_handle = $parent ? $parent->get_stylesheet() : 'parent-theme';
    wp_enqueue_style( $parent_handle, get_template_directory_uri() . '/style.css' );
    wp_enqueue_style(
        '${childSlug}',
        get_stylesheet_directory_uri() . '/style.css',
        [ $parent_handle ],
        wp_get_theme()->get( 'Version' )
    );
} );
`;
  fs.writeFileSync(path.join(childDir, 'style.css'), styleCss);
  fs.writeFileSync(path.join(childDir, 'functions.php'), functionsPhp);

  return {
    ok: true,
    status: 200,
    data: {
      created: true,
      path: childDir,
      stylesheet: childSlug,
      parent,
      next_step: `Activate it: call activate_theme with stylesheet="${childSlug}"`,
    },
  };
}

export async function create_mu_plugin({ filename, contents, overwrite = false }) {
  if (!filename.endsWith('.php')) {
    return { ok: false, status: 0, error: { message: 'filename must end in .php' } };
  }
  if (!contents.trimStart().startsWith('<?php')) {
    return { ok: false, status: 0, error: { message: 'contents must start with <?php' } };
  }
  const dir = muPluginsDir();
  ensureDir(dir);
  const target = safeJoin(dir, filename);
  if (fs.existsSync(target) && !overwrite) {
    return { ok: false, status: 0, error: { message: `Refusing to overwrite ${target}. Pass overwrite=true.` } };
  }
  fs.writeFileSync(target, contents);
  return { ok: true, status: 200, data: { path: target, bytes: Buffer.byteLength(contents) } };
}

export async function read_theme_file({ stylesheet, path: rel }) {
  const ss = await resolveStylesheet(stylesheet);
  const themeRoot = path.join(themesDir(), ss);
  const abs = safeJoin(themeRoot, rel);
  if (!fs.existsSync(abs)) {
    return { ok: false, status: 0, error: { message: `Not found: ${abs}` } };
  }
  const contents = fs.readFileSync(abs, 'utf8');
  return { ok: true, status: 200, data: { stylesheet: ss, path: abs, contents } };
}

export async function write_theme_file({ stylesheet, path: rel, contents, overwrite = true }) {
  const ss = await resolveStylesheet(stylesheet);
  const themeRoot = path.join(themesDir(), ss);
  if (!fs.existsSync(themeRoot)) {
    return { ok: false, status: 0, error: { message: `Theme folder not found: ${themeRoot}` } };
  }
  const abs = safeJoin(themeRoot, rel);
  if (fs.existsSync(abs) && !overwrite) {
    return { ok: false, status: 0, error: { message: `Exists; pass overwrite=true: ${abs}` } };
  }
  ensureDir(path.dirname(abs));
  fs.writeFileSync(abs, contents);
  return { ok: true, status: 200, data: { stylesheet: ss, path: abs, bytes: Buffer.byteLength(contents) } };
}

export async function list_theme_files({ stylesheet, subpath = '' }) {
  const ss = await resolveStylesheet(stylesheet);
  const themeRoot = path.join(themesDir(), ss);
  const base = subpath ? safeJoin(themeRoot, subpath) : themeRoot;
  if (!fs.existsSync(base)) {
    return { ok: false, status: 0, error: { message: `Not found: ${base}` } };
  }
  const out = [];
  for (const entry of fs.readdirSync(base, { withFileTypes: true })) {
    out.push({
      name: entry.name,
      type: entry.isDirectory() ? 'dir' : 'file',
      path: path.relative(themeRoot, path.join(base, entry.name)),
    });
  }
  return { ok: true, status: 200, data: { stylesheet: ss, base, entries: out } };
}
