// REST handlers — call WP over HTTP using lib/wp.js.
// Routes split into: core REST (/wp/v2/*) and MU-plugin (/wp-backend-mcp/v1/*).

import fs from 'node:fs';
import path from 'node:path';
import FormData from 'form-data';
import { core, coreRequest, mcpRequest } from '../lib/wp.js';

// ─────────────── Discovery ───────────────
export async function discover_env() {
  return await mcpRequest('GET', '/wp-backend-mcp/v1/discover');
}

// ─────────────── Plugins ───────────────
export async function list_plugins() {
  return await coreRequest('GET', '/wp/v2/plugins');
}
export async function install_plugin({ slug, activate = false }) {
  return await mcpRequest('POST', '/wp-backend-mcp/v1/plugins/install', { data: { slug, activate } });
}
export async function activate_plugin({ plugin }) {
  return await coreRequest('POST', `/wp/v2/plugins/${encodeURIComponent(plugin)}`, { data: { status: 'active' } });
}
export async function deactivate_plugin({ plugin }) {
  return await coreRequest('POST', `/wp/v2/plugins/${encodeURIComponent(plugin)}`, { data: { status: 'inactive' } });
}
export async function delete_plugin({ plugin }) {
  return await mcpRequest('POST', '/wp-backend-mcp/v1/plugins/delete', { data: { plugin } });
}

// ─────────────── Themes ───────────────
export async function list_themes() {
  return await coreRequest('GET', '/wp/v2/themes');
}
export async function activate_theme({ stylesheet }) {
  return await mcpRequest('POST', '/wp-backend-mcp/v1/themes/activate', { data: { stylesheet } });
}
export async function get_active_theme_info() {
  return await mcpRequest('GET', '/wp-backend-mcp/v1/themes/active-info');
}

// ─────────────── ACF (CPT/taxonomy/field groups/values) ───────────────
export async function register_cpt({ key, labels, args }) {
  return await mcpRequest('POST', '/wp-backend-mcp/v1/acf/post-type', { data: { key, labels, args } });
}
export async function register_taxonomy({ key, object_type, labels, args }) {
  return await mcpRequest('POST', '/wp-backend-mcp/v1/acf/taxonomy', { data: { key, object_type, labels, args } });
}
export async function create_field_group({ title, location, fields }) {
  return await mcpRequest('POST', '/wp-backend-mcp/v1/acf/field-group', { data: { title, location, fields } });
}
export async function add_field({ group_key, name, type, extra }) {
  return await mcpRequest('POST', '/wp-backend-mcp/v1/acf/field', { data: { group_key, name, type, extra } });
}
export async function list_acf() {
  return await mcpRequest('GET', '/wp-backend-mcp/v1/acf/list');
}
export async function update_acf_field_value({ post_id, selector, value }) {
  return await mcpRequest('POST', '/wp-backend-mcp/v1/acf/update-field', { data: { post_id, selector, value } });
}

// ─────────────── Content ───────────────
function restBase(type) {
  // Allow caller to pass either a post-type slug ("service") or a rest base ("services").
  // Core REST accepts the rest base — but most CPTs default rest_base = slug.
  return type || 'posts';
}
export async function list_posts({ type, ...params } = {}) {
  return await coreRequest('GET', `/wp/v2/${restBase(type)}`, { params });
}
export async function get_post({ type, id }) {
  return await coreRequest('GET', `/wp/v2/${restBase(type)}/${id}`);
}
export async function create_post({ type, data }) {
  return await coreRequest('POST', `/wp/v2/${restBase(type)}`, { data });
}
export async function update_post({ type, id, data }) {
  return await coreRequest('POST', `/wp/v2/${restBase(type)}/${id}`, { data });
}
export async function delete_post({ type, id, force = false }) {
  return await coreRequest('DELETE', `/wp/v2/${restBase(type)}/${id}`, { params: { force } });
}
export async function set_post_meta({ post_id, key, value }) {
  return await mcpRequest('POST', '/wp-backend-mcp/v1/meta/set', { data: { post_id, key, value } });
}

// ─────────────── Media ───────────────
export async function list_media(params = {}) {
  return await coreRequest('GET', '/wp/v2/media', { params });
}
export async function upload_media({ file_path, filename, alt_text, caption, title, description }) {
  if (!fs.existsSync(file_path)) {
    return { ok: false, status: 0, error: { message: `File not found: ${file_path}` } };
  }
  const fname = filename || path.basename(file_path);
  const stream = fs.createReadStream(file_path);

  const baseURL = (process.env.WP_URL || '').replace(/\/$/, '');
  const url = `${baseURL}/wp-json/wp/v2/media`;

  // Multipart for the binary upload (core REST accepts this).
  const form = new FormData();
  form.append('file', stream, { filename: fname });
  if (title)       form.append('title', title);
  if (caption)     form.append('caption', caption);
  if (description) form.append('description', description);
  if (alt_text)    form.append('alt_text', alt_text);

  const user = process.env.WP_USER || '';
  const pass = (process.env.WP_APP_PASSWORD || '').replace(/\s+/g, '');
  const auth = 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64');

  const res = await core.post(url, form, {
    headers: { ...form.getHeaders(), Authorization: auth },
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
  });
  if (res.status >= 200 && res.status < 300) return { ok: true, status: res.status, data: res.data };
  return { ok: false, status: res.status, error: res.data };
}
export async function update_media({ id, ...fields }) {
  return await coreRequest('POST', `/wp/v2/media/${id}`, { data: fields });
}
export async function delete_media({ id, force = true }) {
  return await coreRequest('DELETE', `/wp/v2/media/${id}`, { params: { force } });
}

// ─────────────── Taxonomies (content) ───────────────
export async function list_terms({ taxonomy, ...params }) {
  return await coreRequest('GET', `/wp/v2/${taxonomy}`, { params });
}
export async function create_term({ taxonomy, ...data }) {
  return await coreRequest('POST', `/wp/v2/${taxonomy}`, { data });
}
export async function assign_terms_to_post({ type, post_id, taxonomy, term_ids }) {
  return await coreRequest('POST', `/wp/v2/${restBase(type)}/${post_id}`, { data: { [taxonomy]: term_ids } });
}

// ─────────────── Options ───────────────
export async function get_option({ name }) {
  return await mcpRequest('POST', '/wp-backend-mcp/v1/options/get', { data: { name } });
}
export async function update_option({ name, value, autoload, allow_protected }) {
  return await mcpRequest('POST', '/wp-backend-mcp/v1/options/update', { data: { name, value, autoload, allow_protected } });
}

// ─────────────── Menus ───────────────
export async function list_menus() {
  return await mcpRequest('GET', '/wp-backend-mcp/v1/menus/list');
}
export async function create_menu({ name, items }) {
  return await mcpRequest('POST', '/wp-backend-mcp/v1/menus/create', { data: { name, items } });
}
export async function assign_menu_location({ menu_id, location }) {
  return await mcpRequest('POST', '/wp-backend-mcp/v1/menus/assign-location', { data: { menu_id, location } });
}

// ─────────────── Users ───────────────
export async function list_users(params = {}) {
  return await coreRequest('GET', '/wp/v2/users', { params });
}
export async function create_user({ data }) {
  return await coreRequest('POST', '/wp/v2/users', { data });
}
export async function update_user({ id, data }) {
  return await coreRequest('POST', `/wp/v2/users/${id}`, { data });
}
export async function delete_user({ id, reassign, force = true }) {
  return await coreRequest('DELETE', `/wp/v2/users/${id}`, { params: { force, reassign } });
}

// ─────────────── Maintenance ───────────────
export async function search_replace({ from, to, tables, dry_run = true }) {
  return await mcpRequest('POST', '/wp-backend-mcp/v1/maintenance/search-replace', { data: { from, to, tables, dry_run } });
}
export async function flush_rewrite_rules() {
  return await mcpRequest('POST', '/wp-backend-mcp/v1/maintenance/flush-rewrites');
}
export async function clear_transients() {
  return await mcpRequest('POST', '/wp-backend-mcp/v1/maintenance/clear-transients');
}
export async function run_php({ code }) {
  return await mcpRequest('POST', '/wp-backend-mcp/v1/eval', { data: { code } });
}
