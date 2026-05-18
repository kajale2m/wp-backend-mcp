// wp-backend-mcp — full-surface WordPress backend MCP server.
// Mirrors what the wp-backend agent / skill can do, but as a programmatic tool surface for Claude.
//
// Architecture:
//   - Core REST (/wp/v2/*)              → Basic auth with Application Password (WP_USER + WP_APP_PASSWORD)
//   - Custom REST (/wp-backend-mcp/v1/*) → shared secret header X-WP-MCP-Key (companion MU-plugin)
//   - Filesystem (child theme, mu-plugin, theme files) → direct writes via WP_ROOT
//
// Wire-up: `claude mcp add wp-backend -- node "<abs-path>/server.js"`

import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { TOOLS } from './lib/tools.js';
import { asToolResult } from './lib/wp.js';
import * as rest from './handlers/rest.js';
import * as fsh  from './handlers/fs.js';

// Load .env from this file's folder regardless of CWD (claude mcp launches with arbitrary CWD).
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });

// Route table: tool name → handler.
const HANDLERS = {
  // discovery
  discover_env: rest.discover_env,

  // plugins
  list_plugins: rest.list_plugins,
  install_plugin: rest.install_plugin,
  activate_plugin: rest.activate_plugin,
  deactivate_plugin: rest.deactivate_plugin,
  delete_plugin: rest.delete_plugin,

  // themes
  list_themes: rest.list_themes,
  activate_theme: rest.activate_theme,
  get_active_theme_info: rest.get_active_theme_info,

  // ACF
  register_cpt: rest.register_cpt,
  register_taxonomy: rest.register_taxonomy,
  create_field_group: rest.create_field_group,
  add_field: rest.add_field,
  list_acf: rest.list_acf,
  update_acf_field_value: rest.update_acf_field_value,

  // content
  list_posts: rest.list_posts,
  get_post: rest.get_post,
  create_post: rest.create_post,
  update_post: rest.update_post,
  delete_post: rest.delete_post,
  set_post_meta: rest.set_post_meta,

  // media
  list_media: rest.list_media,
  upload_media: rest.upload_media,
  update_media: rest.update_media,
  delete_media: rest.delete_media,

  // taxonomies (content side)
  list_terms: rest.list_terms,
  create_term: rest.create_term,
  assign_terms_to_post: rest.assign_terms_to_post,

  // options
  get_option: rest.get_option,
  update_option: rest.update_option,

  // menus
  list_menus: rest.list_menus,
  create_menu: rest.create_menu,
  assign_menu_location: rest.assign_menu_location,

  // users
  list_users: rest.list_users,
  create_user: rest.create_user,
  update_user: rest.update_user,
  delete_user: rest.delete_user,

  // maintenance
  search_replace: rest.search_replace,
  flush_rewrite_rules: rest.flush_rewrite_rules,
  clear_transients: rest.clear_transients,
  run_php: rest.run_php,

  // filesystem
  create_child_theme: fsh.create_child_theme,
  create_mu_plugin: fsh.create_mu_plugin,
  read_theme_file: fsh.read_theme_file,
  write_theme_file: fsh.write_theme_file,
  list_theme_files: fsh.list_theme_files,
};

const server = new Server(
  { name: 'wp-backend-mcp', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;
  console.error(`[wp-backend-mcp] call: ${name} ${JSON.stringify(args).slice(0,200)}`);
  const fn = HANDLERS[name];
  if (!fn) {
    return asToolResult({ ok: false, error: `Unknown tool: ${name}` });
  }
  try {
    const result = await fn(args || {});
    return asToolResult(result);
  } catch (err) {
    return asToolResult({
      ok: false,
      error: err && err.message ? err.message : String(err),
      stack: process.env.WP_BACKEND_MCP_DEBUG ? err && err.stack : undefined,
    });
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('wp-backend-mcp server running on stdio.');
}

main().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});
