# wp-backend-mcp

A Model Context Protocol (MCP) server that exposes **the full surface of the `wp-backend` agent** to Claude as callable tools.

Where the existing `wordpress-mcp-server` covers only alt-text, this server covers everything else: plugins, themes, CPT/taxonomy/ACF, content, media, users, menus, options, maintenance, and local-filesystem ops (child theme + mu-plugin scaffolding, theme file read/write).

## How it works (3 layers)

```
┌────────────────────────┐   stdio    ┌───────────────────────┐    HTTP    ┌──────────────────────────┐
│ Claude Code (host)     │ <───────>  │ Node MCP server       │ <───────>  │ WordPress (coreai.local) │
│ calls tools like       │            │ server.js + handlers/ │            │                          │
│ register_cpt(...)      │            │                       │            │  /wp-json/wp/v2/*        │
└────────────────────────┘            └───────────────────────┘            │  /wp-json/wp-backend-mcp │
                                                                           │   /v1/* (MU-plugin)      │
                                                                           └──────────────────────────┘
```

- **Core REST** (`/wp/v2/*`) is hit with the WordPress **Application Password** in `Authorization: Basic ...` for things WP already exposes natively (posts, pages, media, users, taxonomies, plugin activate/deactivate, themes list).
- **Custom REST** (`/wp-backend-mcp/v1/*`) — registered by the companion **MU-plugin** in `mu-plugin/wp-backend-mcp.php` — handles everything REST doesn't natively support: plugin install, ACF-based CPT/taxonomy/field-group registration, options, menus, search-replace, flush rewrites, transients, post meta, optional PHP eval.
- **Filesystem tools** (`create_child_theme`, `create_mu_plugin`, `read_theme_file`, `write_theme_file`, `list_theme_files`) write directly under `WP_ROOT/wp-content/` — local installs only.

## One-time setup

### 1. Install Node deps

```bash
cd "/Users/kajaldhameliya/Local Sites/coreai/app/wp-backend-mcp"
npm install
```

### 2. Configure `.env`

```bash
cp .env.example .env
# then edit .env — fill in WP_BACKEND_MCP_KEY with a random 32+ char string
```

For this project the values you already have are:
- `WP_URL=http://coreai.local`
- `WP_USER=admin`
- `WP_APP_PASSWORD=rjSn EUEN PIRj adRI dtJi uKjI`
- `WP_ROOT=/Users/kajaldhameliya/Local Sites/coreai/app/public`
- `WP_BACKEND_MCP_KEY=<generate one, e.g. `openssl rand -hex 24`>`

### 3. Drop the companion MU-plugin into WordPress

```bash
cp mu-plugin/wp-backend-mcp.php "/Users/kajaldhameliya/Local Sites/coreai/app/public/wp-content/mu-plugins/"
```

(MU-plugins auto-load, no activation step.)

### 4. Mirror the secret in `wp-config.php`

Add **above** the `/* That's all, stop editing! */` line in `app/public/wp-config.php`:

```php
define( 'WP_BACKEND_MCP_KEY', 'PASTE_THE_SAME_STRING_FROM_.env_HERE' );

// Optional — enables the run_php tool. Leave off unless you really want it.
// define( 'WP_BACKEND_MCP_ALLOW_EVAL', true );
```

### 5. Register the MCP with Claude Code

```bash
claude mcp add wp-backend -- node "/Users/kajaldhameliya/Local Sites/coreai/app/wp-backend-mcp/server.js"
```

Verify:
```bash
claude mcp list
```

Tools become available to Claude as `mcp__wp-backend__discover_env`, `mcp__wp-backend__install_plugin`, etc.

## Smoke tests (no Claude needed)

```bash
# 1. MU-plugin reachable + secret valid?
curl -s "$WP_URL/wp-json/wp-backend-mcp/v1/discover" \
     -H "X-WP-MCP-Key: $WP_BACKEND_MCP_KEY" | jq '.wp_version, .active_theme.stylesheet'

# 2. Core REST + app password OK?
curl -s "$WP_URL/wp-json/wp/v2/users/me" \
     -u "$WP_USER:$(echo $WP_APP_PASSWORD | tr -d ' ')" | jq .name

# 3. Install + activate ACF (uses Plugin_Upgrader)
curl -s -X POST "$WP_URL/wp-json/wp-backend-mcp/v1/plugins/install" \
     -H "X-WP-MCP-Key: $WP_BACKEND_MCP_KEY" \
     -H "Content-Type: application/json" \
     -d '{"slug":"advanced-custom-fields","activate":true}' | jq .
```

## Tool catalogue (45 tools)

| Group        | Tool names |
|--------------|-----------|
| Discovery    | `discover_env` |
| Plugins      | `list_plugins`, `install_plugin`, `activate_plugin`, `deactivate_plugin`, `delete_plugin` |
| Themes       | `list_themes`, `activate_theme`, `get_active_theme_info` |
| CPT/ACF      | `register_cpt`, `register_taxonomy`, `create_field_group`, `add_field`, `list_acf`, `update_acf_field_value` |
| Content      | `list_posts`, `get_post`, `create_post`, `update_post`, `delete_post`, `set_post_meta` |
| Media        | `list_media`, `upload_media`, `update_media`, `delete_media` |
| Taxonomies   | `list_terms`, `create_term`, `assign_terms_to_post` |
| Options      | `get_option`, `update_option` |
| Menus        | `list_menus`, `create_menu`, `assign_menu_location` |
| Users        | `list_users`, `create_user`, `update_user`, `delete_user` |
| Maintenance  | `search_replace`, `flush_rewrite_rules`, `clear_transients`, `run_php` |
| Filesystem   | `create_child_theme`, `create_mu_plugin`, `read_theme_file`, `write_theme_file`, `list_theme_files` |

## Example: end-to-end ("install ACF, make a `service` CPT with 3 fields, add a sample post")

What Claude would call:

1. `discover_env` — checks ACF status.
2. `install_plugin { slug: "advanced-custom-fields", activate: true }`
3. `register_cpt { key: "service", labels: { singular: "Service", plural: "Services" } }`
4. `create_field_group {
     title: "Service Fields",
     location: [[{ param: "post_type", operator: "==", value: "service" }]],
     fields: [
       { name: "icon",              type: "image",    return_format: "id" },
       { name: "short_description", type: "textarea" },
       { name: "cta_label",         type: "text",     default_value: "Learn more" }
     ]
   }`
5. `flush_rewrite_rules`
6. `create_post { type: "service", data: { title: "Web Design", status: "publish", acf: { short_description: "...", cta_label: "Get a quote" } } }`

## Safety choices baked in

- **Shared-secret auth on MU-plugin** (constant-time compare via `hash_equals`).
- **Protected options guarded**: `siteurl`, `home`, `admin_email`, `db_version`, `blog_charset` won't update without `allow_protected:true`.
- **search-replace**: defaults to `dry_run:true`; refuses `wp_users` / `wp_usermeta`.
- **Path-traversal**: filesystem tools refuse paths that escape the target theme/mu-plugins folder.
- **`run_php` is opt-in**: requires both the shared secret AND `define('WP_BACKEND_MCP_ALLOW_EVAL', true)` in `wp-config.php`. Off by default.
- **Delete tools** (plugins/posts/users/media) are described as destructive so Claude confirms before calling.

## Troubleshooting

- **403 forbidden** on `wp-backend-mcp/v1/*` → `WP_BACKEND_MCP_KEY` mismatch between `.env` and `wp-config.php`. Both must be the same string.
- **401 on `/wp/v2/users/me`** → Application Password wrong or `WP_USER` typo. Regenerate at wp-admin → Users → your profile → Application Passwords.
- **`Theme folder not found`** from filesystem tools → `WP_ROOT` doesn't point at the folder that contains `wp-config.php`.
- **ACF tools return `412 no_acf`** → ACF plugin not active. Call `install_plugin {slug:"advanced-custom-fields", activate:true}` first.
- **Server doesn't load env** → make sure `.env` is in the same folder as `server.js` (the script always reads from its own dir, not the CWD).

## File map

```
wp-backend-mcp/
├── package.json
├── .env.example
├── README.md
├── server.js                # MCP entrypoint + dispatcher
├── lib/
│   ├── tools.js             # Tool schemas (the surface Claude sees)
│   ├── wp.js                # axios clients (core REST + MU-plugin REST)
│   └── paths.js             # Filesystem path helpers (WP_ROOT validation, safeJoin)
├── handlers/
│   ├── rest.js              # All REST-backed tool handlers
│   └── fs.js                # All filesystem-backed tool handlers
└── mu-plugin/
    └── wp-backend-mcp.php   # Companion MU-plugin (drop into wp-content/mu-plugins/)
```
