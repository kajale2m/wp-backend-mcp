# Onboarding — wp-backend-mcp

This is the **team onboarding guide** for using the `wp-backend-mcp` server with [Claude Code](https://docs.claude.com/en/docs/claude-code) on any WordPress project.

If you're new: follow this end-to-end and you'll have Claude driving your WP site through MCP in ~15 minutes. The deeper technical reference lives in [README.md](README.md).

---

## What this is (1 paragraph)

`wp-backend-mcp` is a Model Context Protocol server that exposes 45+ WordPress backend operations (CPT/ACF, plugins, themes, content, media, users, options, search-replace, child-theme + mu-plugin scaffolding, theme file r/w) to Claude. Once it's wired up, Claude can install plugins, register CPTs, create ACF field groups, upload media, and edit theme files for you — and you can see every action as an `mcp__wp-backend__*` tool call in the conversation.

## What you need before starting

- **Node.js** 18 or newer (`node -v` to check)
- **Claude Code** installed (`claude --version`)
- A local WordPress site you can edit (`wp-config.php`, `wp-content/mu-plugins/`)
- A WordPress **admin** account on that site

---

## First-time setup (per developer, per WP project)

### Step 1 — Clone this repo

```bash
cd ~/dev   # or wherever you keep code
git clone <THIS_REPO_URL> wp-backend-mcp
cd wp-backend-mcp
npm install
```

> Tip: if your team has many WP projects, keep a *single* checkout of this repo and add it to the PATH of each project (Step 5). Per-project copies also work — pick whichever your team prefers.

### Step 2 — Drop the companion MU-plugin into the WP site

The Node MCP server can't do everything over WP core REST. A small companion mu-plugin (`mu-plugin/wp-backend-mcp.php`) adds the missing REST routes (plugin install, ACF post-type/field-group registration, options, search-replace, etc.).

Copy it into the WP site:

```bash
cp mu-plugin/wp-backend-mcp.php \
   /absolute/path/to/wp-project/app/public/wp-content/mu-plugins/
```

MU-plugins auto-load — no activation needed. **This file is safe (and recommended) to commit into your WP project's repo** so future devs don't need to repeat this step.

### Step 3 — Generate YOUR Application Password

Each developer gets their own — never share Application Passwords.

1. Open the WP site → **Users → Your Profile**
2. Scroll to **Application Passwords**
3. Name it `wp-backend-mcp` → **Add New**
4. Copy the 24-character password WP shows you (with spaces). Save it; you only see it once.

### Step 4 — Configure your `.env`

```bash
cp .env.example .env
```

Open `.env` and fill in:

```
WP_URL=http://yoursite.local
WP_USER=<your wp-admin username>
WP_APP_PASSWORD=<paste from step 3, keep the spaces>
WP_ROOT=/absolute/path/to/wp-project/app/public
WP_BACKEND_MCP_KEY=<see step 4b>
```

**4b. The MCP shared secret** — same value on all devs for a given WP site:

If your project doesn't have one yet, generate it once and share with the team via your password manager:

```bash
openssl rand -hex 24
```

Put it in `.env` AND in `wp-config.php` **above** the `/* That's all, stop editing! */` line:

```php
define( 'WP_BACKEND_MCP_KEY', 'paste-the-same-string-here' );
```

### Step 5 — Register the MCP server with Claude Code

From inside your WordPress project's root directory (so the MCP is scoped to that project):

```bash
cd /path/to/wp-project
claude mcp add wp-backend node "/path/to/wp-backend-mcp/server.js"
```

**Restart your Claude Code window** (close and reopen, or "Developer: Reload Window" in VSCode). The MCP server list is read at session start.

### Step 6 — Verify

```bash
claude mcp list
```

You should see:
```
wp-backend: node /path/to/wp-backend-mcp/server.js - ✓ Connected
```

Inside Claude Code, you can also type `/mcp` to see the server status and its tool list.

---

## Smoke tests (skip Claude, prove the plumbing works)

Run these from inside your `.env`-configured wp-backend-mcp folder:

```bash
# Load env vars into the shell
set -a; source .env; set +a

# 1. MU-plugin reachable + shared secret valid?
curl -s "$WP_URL/wp-json/wp-backend-mcp/v1/discover" \
     -H "X-WP-MCP-Key: $WP_BACKEND_MCP_KEY" | python3 -m json.tool | head -20

# 2. Core REST + Application Password OK?
curl -s "$WP_URL/wp-json/wp/v2/users/me" \
     -u "$WP_USER:$(echo $WP_APP_PASSWORD | tr -d ' ')" | python3 -m json.tool | head -10
```

If both return JSON without `"code":"rest_forbidden"` or 401/403, you're good.

---

## Using it day-to-day

Inside Claude Code, just describe what you want:

> *"Install ACF, create a `service` CPT with `icon` (image), `short_description` (textarea), and `cta_label` (text). Add 3 sample services."*

Claude will choose tools like `mcp__wp-backend__install_plugin`, `mcp__wp-backend__register_cpt`, `mcp__wp-backend__create_field_group`, `mcp__wp-backend__create_post`. You'll see each call rendered as a chip. **If you ever see only `Bash` / `curl` / `Edit` chips for a WP request, the MCP didn't get used** — common reasons: server not registered for that project, or Claude Code window not restarted after `claude mcp add`.

## Working as a team

- **`.env` is per-developer and per-project.** Never commit it. Each dev runs through Steps 3–4 themselves.
- **`WP_BACKEND_MCP_KEY` is per-project, shared by the team** (via password manager). The same value must be in `wp-config.php` and every dev's `.env`.
- **`mu-plugin/wp-backend-mcp.php` belongs in the WP project's repo** (under `app/public/wp-content/mu-plugins/`). New devs cloning the WP repo get it for free.
- **Don't share Application Passwords.** Each dev generates their own in their own wp-admin user profile.

## Safety opt-ins (off by default)

These are intentionally off so Claude can't do anything truly destructive without explicit consent:

- `define( 'WP_BACKEND_MCP_ALLOW_EVAL', true );` in `wp-config.php` enables the `run_php` tool (executes arbitrary PHP). Leave OFF unless you really need it for an emergency one-off.
- `search_replace` defaults to `dry_run: true` and refuses `wp_users` / `wp_usermeta` outright.
- Destructive deletes (`delete_plugin`, `delete_post`, `delete_user`, `delete_media`) are marked DESTRUCTIVE so Claude pauses for confirmation.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| `claude mcp list` shows `wp-backend: ✗ Failed to connect` | `node` not in PATH for the MCP shell, or the path to `server.js` is wrong. Test with `node /path/to/server.js` — it should print nothing and wait on stdin. Ctrl-C to exit. |
| Tools work but the window has no `mcp__wp-backend__*` chips | You added the MCP after this Claude Code window opened. **Restart the window.** |
| 403 on `/wp-json/wp-backend-mcp/v1/*` | `WP_BACKEND_MCP_KEY` mismatch between `.env` and `wp-config.php`. They must be byte-identical. |
| 401 on `/wp-json/wp/v2/users/me` | Wrong Application Password (regenerate at *Users → Your Profile*) or wrong `WP_USER`. |
| `Theme folder not found` from filesystem tools | `WP_ROOT` doesn't point at the folder containing `wp-config.php`. |
| ACF tools return `412 no_acf` | ACF plugin isn't active. Run `install_plugin {slug:"advanced-custom-fields", activate:true}` first. |
| Server doesn't load `.env` | `.env` must be in the same folder as `server.js` — the server always reads from its own dir, not the cwd. |

## Where to go next

- **Tool catalogue + architecture** → [README.md](README.md)
- **Found a bug / want a new tool?** → open an issue / PR
