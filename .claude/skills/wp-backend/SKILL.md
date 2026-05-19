---
name: wp-backend
description: Use for any WordPress backend automation, on any WP project — local installs, live sites via Git, live sites via FTP/SFTP, theme-folder-only access, or REST-API only. Handles creating/updating pages, posts, custom post types, taxonomies, ACF field groups, media uploads, plugin install/activate/configure, settings changes, search-replace, user management, and rendering custom content via child themes / mu-plugins / templates. Code follows WP coding standards, security (escape/sanitize/nonces/caps), scalability, and performance best practices. Frontend additions reuse the active theme's design tokens. The skill first discovers the project's environment and access scenario, then picks the right execution channel for each sub-task.
---

# WordPress Backend Automation

This skill is plugin-agnostic and project-agnostic. The same workflow works for WooCommerce, Yoast, ACF, Wordfence, Redirection, caching plugins, and anything else — across local dev, staging, and production WP sites.

## Step 0 — Discover the project environment

Before doing anything, learn **what kind of WP project you're dealing with** and **what kind of access you have**. Do not guess; if a fact is unclear, ask the user with `AskUserQuestion`.

### What to find

1. **Site URL** (`WP_URL`) — e.g. `http://acme.local`, `https://staging.acme.com`, `https://acme.com`.
2. **Install path on disk** — only relevant if you have file access. Locate `wp-config.php` (often at `app/public/wp-config.php` on Local by Flywheel).
3. **Active theme** — read from `wp-content/themes/` or `GET /wp-json/wp/v2/themes?status=active`.
4. **Admin credentials** — Application Password (REST Basic Auth). Look in:
   - `.env` / `.env.local` at the project root or WP root
   - Project memory: `~/.claude/projects/<key>/memory/reference_wp_env.md`
   - User-provided notes
5. **Whether REST is reachable** from your shell: `curl -sf "$WP_URL/wp-json/" -o /dev/null -w "%{http_code}\n"`. A `200` means yes.
6. **Whether WP-CLI is available** to you: `which wp`. (On Local by Flywheel, WP-CLI lives inside the bundled site shell, NOT on the Mac PATH.)
7. **Whether the project is under Git** — `.git` at the WP root or above.

### Classify the access scenario

| Scenario | Indicator | File channel | REST channel | One-off PHP scripts | Notes |
|---|---|---|---|---|---|
| **A. Local install** | Path looks like Local by Flywheel / MAMP / DDEV / Docker volume mounted on the user's machine | Full | Yes (if `*.local` resolves) | Yes — write file, curl, delete | Easiest; everything works |
| **B. Git-deployed live site** | `.git` present + remote points to GitHub/GitLab/Bitbucket | Edits land in clone; **deploy via commit + push + CI/CD** | Yes (against live URL) | **Avoid** — would commit throwaways; use WP-CLI (if SSH) or REST instead | Be explicit about what the user must commit/deploy |
| **C. FTP/SFTP access to live** | User says "I'll FTP the files up" or filesystem isn't directly mounted | Edits land in local scratch dir; user uploads via FTP — or files are mounted via SFTP client | Yes | Yes — upload, curl, delete | State exactly which file goes where |
| **D. Theme-folder access only** | Same as C but limited to `wp-content/themes/<active>` | Only theme files (child theme strongly recommended) | Yes | Only if user can upload outside theme; otherwise no | All custom code must go in the theme. Plugin install via admin/REST only |
| **E. REST API only** | No filesystem access at all | None | Yes | No | Limited to content CRUD + existing plugin capabilities. Tell the user what's not possible (no custom code) |
| **F. SSH access to live** | User has shell access to the server, WP-CLI installed | Edits via SSH/SFTP | Yes | Yes (on the server) | Capability matches A; iteration is slower |

When the scenario is unclear, ask the user **once** with `AskUserQuestion`:
- Is this site **local or live**?
- If live: do you access it via **Git clone, FTP/SFTP, theme folder only, or REST only**?
- Do you have **SSH or WP-CLI** on the server?

Save the answer immediately as a `reference_wp_env.md` memory in this project's memory dir so you don't have to ask again.

### Common access-scenario gotchas

- **Local `*.local` domains** usually only resolve from the user's Mac, not from a sandboxed shell on another machine. Test REST reachability first.
- **Production sites** often have a **WAF or app firewall** that may block `?token=...` parameters or PHP files outside the recognized paths. If `wp-task-<x>.php` returns a 403 from CDN/Cloudflare even with the right token, ask the user to allow it via firewall or use WP-CLI.
- **Theme-only access** rules out scaffolding a plugin or mu-plugin. All hooks/filters/CPT registrations go into the child theme's `functions.php`. ACF JSON sync folder must live at `themes/<active>/acf-json/`.
- **Git-deployed sites**: never run one-off `wp-task-*.php` against the live URL — those files would need to be committed and deployed first. Use WP-CLI on the server (if available) or REST API instead.

## The three action channels

| Channel | Best for |
|---|---|
| **A. File edits** | Theme/mu-plugin/child-theme code, ACF Local JSON, scaffolding. |
| **B. REST API** | Content CRUD, media, plugin activation, settings. |
| **C. One-off PHP scripts** | Operations needing WP's PHP runtime when WP-CLI isn't on PATH (`acf_update_internal_post_type`, `flush_rewrite_rules`, internal APIs). |

Most tasks combine 2–3 channels. Plan per sub-task and label each with which channel + which scenario constraint applies.

## Standard workflow

1. **Discover** — site URL, install/clone path, app password, active theme, scenario, available tools.
2. **Decompose** — split the user's request into sub-tasks, label each with channel A/B/C and any deploy step required by the scenario.
3. **Plan and confirm** — for non-trivial tasks and **always for frontend changes**, present the plan (files, theme tokens to reuse, what's new) and wait for user OK.
4. **Execute** channel by channel.
5. **Verify** every change with a follow-up read (GET / `wp plugin list` / open the URL).
6. **Report** — what changed, files touched, manual steps remaining (commit/push, FTP upload, etc.), how to verify.

## Coding standards (apply to ALL generated code)

- **Escape on output**: `esc_html`, `esc_attr`, `esc_url`, `esc_textarea`, `wp_kses_post`. Never echo raw input.
- **Sanitize on input**: `sanitize_text_field`, `sanitize_email`, `absint`, `sanitize_key`, `wp_kses` with explicit allowed tags.
- **Nonces** on every form/AJAX action: `wp_nonce_field` + `check_admin_referer` / `wp_verify_nonce`.
- **Capability checks**: `current_user_can( 'edit_posts' )` etc. before privileged work.
- **Prepared statements** for `$wpdb` queries — `$wpdb->prepare( "...WHERE id = %d", $id )`.
- **i18n**: wrap strings with `__()` / `esc_html__()` and a stable text domain.
- **Hooks, not direct calls**: register CPTs on `init`, scripts on `wp_enqueue_scripts` / `admin_enqueue_scripts`, settings on `admin_init`.
- **Options autoload**: pass `'no'` for options not read on every request.
- **Cache**: transients (`set_transient`, expiry) or object cache (`wp_cache_*`) for anything computed > once.
- **Indexed queries**: avoid `meta_query` on unindexed keys at scale; consider custom table or indexed post_meta where appropriate.
- **Asset enqueue**: `wp_register_*` + `wp_enqueue_*`, pass `$ver` (from `filemtime` or const), `in_footer => true` where safe.
- **No direct DB writes when a core API exists** — `wp_insert_post` over `INSERT INTO wp_posts`, `update_option` over `UPDATE wp_options`.

## Where custom code goes (decision tree)

```
Need to add server-side WP code? ──┐
                                   │
       Plugins/ folder writable? ──┼── yes ──┬── Self-contained feature?     → wp-content/plugins/<slug>/<slug>.php
                                   │         └── Site-wide "always on" glue? → wp-content/mu-plugins/<name>.php
                                   │
       Plugins/ NOT writable ──────┴── Theme folder writable? ──┬── yes ──→ wp-content/themes/<child>/functions.php
                                                                └── no  ──→ Tell user filesystem access is required;
                                                                            offer REST-only alternatives
```

- **Custom plugin** for self-contained features (a CPT pack, a custom REST endpoint, a Gutenberg block). Has a Plugins-screen UI for activation; can be turned off.
- **mu-plugin** for site-glue that should always be active and never accidentally deactivated (filter on `the_content`, hardening tweak, custom REST permission callback).
- **Child theme** when filesystem access is limited to the theme folder, OR when the code is template/styling-related.

## CPT, taxonomy, and ACF fields

- **Slug rules**: lowercase, ≤ 20 chars, `a-z0-9_` only.
- **CPT flags**: `public`, `has_archive`, `show_in_rest => true`, `supports`, `menu_icon`, `rewrite => array('slug' => ...)`. For REST access at a custom plural, set `rest_base`.
- **If ACF is active → register through ACF** (not a scaffolded plugin) so the CPT appears in ACF → Post Types:
  - `acf_update_internal_post_type([... 'key' => 'post_type_<slug>', ...], 'acf-post-type')`
  - `acf_update_internal_post_type([... 'key' => 'taxonomy_<slug>', ...], 'acf-taxonomy')`
  - Field group: `acf_update_field_group([...])` then `acf_update_field([...])` per field.
  - Set field-group `show_in_rest => 1` so `acf.<field>` appears in REST.
- **Required ACF fields and REST**: when updating one ACF field via REST, fetch the post first, merge into the existing `acf` object, and PUT the full object back — otherwise REST returns 400 for missing required fields.
- After registering a CPT/taxonomy, **flush rewrite rules once** (one-off script calling `flush_rewrite_rules(true)`, or `wp rewrite flush` via WP-CLI).

## Pages, posts, content CRUD

- `POST /wp-json/wp/v2/{type}` with `{title, status, content, slug?, excerpt?, meta?, acf?, template?}`.
- `status`: `draft`, `pending`, `publish`, `private`, or `future` with a future date.
- **Meta title / description** — pick the plugin that's actually installed:
  - Yoast: meta keys `_yoast_wpseo_title`, `_yoast_wpseo_metadesc`. Set via `meta` in the REST payload.
  - Rank Math: `rank_math_title`, `rank_math_description`.
  - None installed: register custom meta with `register_post_meta(..., ['show_in_rest' => true, 'single' => true])` from your code, then write via `meta`.
- **Block content**: send Gutenberg HTML with `<!-- wp:... -->` block comments when the user must keep editing in blocks; plain HTML is fine for "just show this once" pages.

## Media uploads

- `POST /wp-json/wp/v2/media` with `Content-Disposition: attachment; filename="..."` + binary body. Returns attachment ID.
- After upload, `POST /wp-json/wp/v2/media/<id>` to set `title`, `alt_text`, `caption`, `description`.
- For ACF image fields (return_format `array`), store **just the attachment ID**. `get_field()` returns the array on the frontend.
- Avoid downloading or uploading photos of identifiable individuals. Use the user's supplied images, generated placeholders, or non-face stock.

## Plugin install / activate / configure

1. **Confirm slug and source** with the user before installing anything not from wordpress.org.
2. **Install path** depends on scenario:
   - **WP-CLI available**: `wp plugin install <slug> --activate`.
   - **Plugins/ writable, no WP-CLI**: `curl -sL -o /tmp/<slug>.zip https://downloads.wordpress.org/plugin/<slug>.latest-stable.zip` → unzip into `wp-content/plugins/` → activate via REST.
   - **Theme-only / REST-only**: user installs via admin → Plugins → Add New; you activate via REST.
3. **Apply defaults from the plugin's own docs** (verify current docs before applying):
   - **WooCommerce**: store address, currency, default product/cart/checkout/myaccount pages, permalinks, tax behavior, payment gateways.
   - **Yoast SEO**: separator, social profiles, indexing per public post type, breadcrumbs, sitemap, schema.
   - **ACF**: enable Local JSON in `wp-content/themes/<active>/acf-json/`.
   - **Wordfence / iThemes Security**: scan schedule, brute-force lockout, password rules; **never** auto-enable destructive features on local dev.
   - **Redirection**: don't bulk-import unless user supplies the list.
   - **Caching (W3TC, WP Rocket, LiteSpeed)**: off on local dev; on prod set lifetimes + exclusions (admin, REST, cart/checkout for Woo).
   - **WPForms / Contact Form 7**: register honeypot + reCAPTCHA only if user provides keys.
4. **Verify**: `GET /wp-json/wp/v2/plugins/<slug>/<bootstrap>` → `"status":"active"` + `"version"`.

For **unfamiliar plugins**: skim `readme.txt`, list REST routes the plugin registered (`GET /wp-json/`), search options (`wp option list --search='<slug>*'` or read `wp_options` rows with the plugin's prefix), inspect admin screens at `/wp-admin/admin.php?page=<slug>`.

## Settings / option updates

- Use `update_option( $key, $value, $autoload )` from a one-off PHP script (when allowed), or `wp option update` via WP-CLI, or the REST settings endpoint (`/wp-json/wp/v2/settings`) for whitelisted keys.
- Prefer `update_option` over direct `$wpdb` writes so caches invalidate.
- Document **why** an option changed.

## Frontend rendering — follow the active theme

Before adding any HTML/CSS/JS that's visible to site visitors:

1. **Read the active theme**:
   - `wp-content/themes/<active>/theme.json` — read `settings.color.palette`, `settings.typography.fontFamilies`, `settings.spacing`, `settings.layout`. These are the design tokens.
   - `style.css` and `styles/` folder — note existing classes, CSS custom properties (`--wp--preset--color--<slug>`, `--wp--preset--font-family--<slug>`).
   - `parts/` and `patterns/` — reusable block markup.
2. **Reuse, don't reinvent**: existing classes (`is-style-*`, `has-<token>-color`, `has-large-font-size`, `wp-block-*`), CSS variables, and patterns first. Only introduce new ones when nothing existing fits.
3. **Pick the right insertion point**:
   - **Block theme** (FSE): add a `templates/single-<cpt>.html` template, OR a child-theme classic PHP page template with `Template Name:`, OR (for lightweight injection) a mu-plugin filtering `the_content`.
   - **Classic theme**: child theme with `single-<cpt>.php` / `page-<slug>.php`, or a mu-plugin filtering `the_content`.
   - **Never edit the parent theme's files directly** — they'll be overwritten on update.
4. **Present a short plan to the user**: which file(s), which existing tokens/classes you'll reuse, what new ones (if any), and the approximate markup. Wait for confirmation before writing.
5. **Enqueue properly**: register custom CSS/JS with `wp_enqueue_scripts`, use a versioned handle, scope to the relevant template via `is_singular( '<cpt>' )` / `get_page_template_slug()` etc.

### Block theme + classic PHP page template — the timing gotcha

If you use a classic PHP page template inside a block theme, the header/footer can render with **missing styles** compared to other pages because the nav and other block CSS register too late. To avoid:

```php
// Pre-render parts BEFORE wp_head() so their inline CSS is enqueued in time.
$header_html = '';
$footer_html = '';
if ( function_exists( 'block_template_part' ) ) {
    ob_start(); block_template_part( 'header' ); $header_html = ob_get_clean();
    ob_start(); block_template_part( 'footer' ); $footer_html = ob_get_clean();
}
?><!DOCTYPE html>
<html <?php language_attributes(); ?>>
<head>
    <meta charset="<?php bloginfo( 'charset' ); ?>">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <?php wp_head(); ?>
</head>
<body <?php body_class(); ?>>
<?php wp_body_open(); ?>
<div class="wp-site-blocks">
    <header class="wp-block-template-part"><?php echo $header_html; ?></header>
    <main> <!-- content --> </main>
    <footer class="wp-block-template-part"><?php echo $footer_html; ?></footer>
</div>
<?php wp_footer(); ?>
</body>
</html>
```

The `wp-site-blocks` + `wp-block-template-part` wrappers match what block templates produce, so spacing/padding/typography are consistent with every other page.

### Theme token extraction snippet

```php
$tokens       = wp_get_global_settings();
$palette      = $tokens['color']['palette']['theme'] ?? array();
$fonts        = $tokens['typography']['fontFamilies']['theme'] ?? array();
$content_size = $tokens['layout']['contentSize'] ?? '';
$wide_size    = $tokens['layout']['wideSize'] ?? '';
```

## Child theme bootstrap (quick template)

When you need a child theme (especially in scenario D):

`wp-content/themes/<parent>-child/style.css`:
```css
/*
Theme Name:   <Parent> Child
Template:     <parent-slug>
Version:      1.0.0
Text Domain:  <parent-slug>-child
*/
```

`wp-content/themes/<parent>-child/functions.php`:
```php
<?php
defined( 'ABSPATH' ) || exit;
add_action( 'wp_enqueue_scripts', function () {
    // Enqueue scoped assets, e.g. only on a specific template:
    // if ( is_singular() && get_page_template_slug( get_queried_object_id() ) === '<template>.php' ) { ... }
} );
```

To activate without WP-CLI: `switch_theme( '<parent>-child' )` from a one-off PHP script (or admin → Appearance → Themes).

## One-off PHP script template

For anything needing WP's PHP runtime when WP-CLI isn't on PATH and the scenario permits dropping a file at the web root:

```php
<?php
$expected_token = '<unique-random-token>';
if ( ( $_GET['token'] ?? '' ) !== $expected_token ) {
    http_response_code( 403 ); echo 'Forbidden'; exit;
}
require __DIR__ . '/wp-load.php';
// ...work...
echo 'OK: <result>';
```

- Place at WP web root, e.g. `wp-task-<short-purpose>.php`.
- Trigger via `curl "$WP_URL/wp-task-<short-purpose>.php?token=<token>"`.
- **Delete the file immediately after running.** Leaving these around is a security risk.
- **Don't use on Git-deployed sites** — would commit a throwaway. Use WP-CLI on the server or REST instead.

## Things that need explicit user "yes" every time

- Installing a non-`wordpress.org` plugin/theme (state slug + source).
- Activating any plugin.
- Switching the active theme (especially on live).
- Bulk creating > 5 posts.
- Bulk-updating existing content.
- Deleting plugins, posts, users, media, options.
- Touching `wp-config.php` (other than well-known constants the user names).
- Changing `home`/`siteurl`.
- Direct DB writes or `wp db reset`.

## Verification checklist (after every task)

- Plugin installed? `GET /wp-json/wp/v2/plugins/<slug>/<bootstrap>` returns version + status.
- CPT registered? `GET /wp-json/wp/v2/<rest-base>` returns 200; visible under wp-admin sidebar; permalink resolves.
- ACF field group? Listed under wp-admin → ACF → Field Groups; values appear under post's `acf` key in REST.
- Content created? `GET` the new ID and check `title`, `status`, `acf`, `meta`.
- Media attached? ACF image field returns the array on frontend.
- Settings changed? Re-read the option (`/wp-json/wp/v2/settings` or `get_option` in a debug script).
- Frontend change? Open the affected page and inspect — for block-theme + PHP template combos, verify `wp-site-blocks` and `wp-block-template-part` wrappers are present and the same inline CSS ids appear in `<head>` as on other pages.

## Reporting format

```
What I did:
- <bullet 1>
- <bullet 2>

Files created or changed:
- <path> — <one-line purpose>

What you still need to do:
- <manual step, if any — commit/push, FTP upload, activate from wp-admin, flush a cache>

How to verify:
- <command or URL>
```

Keep it short. This is a status report, not a tutorial.
