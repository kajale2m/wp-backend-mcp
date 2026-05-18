// All MCP tool definitions (the surface Claude sees). Handlers live in ../handlers/*.js
// Keep descriptions short but actionable — Claude picks tools by reading these.

export const TOOLS = [
  // ─────────────── Discovery ───────────────
  {
    name: 'discover_env',
    description:
      'Discover the WP environment: site/home URLs, WP & PHP versions, active theme (+ block-theme flag, theme.json tokens, style.css), all plugins (active or not), ACF availability, registered post types & taxonomies. Call this first in any session.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },

  // ─────────────── Plugins ───────────────
  {
    name: 'list_plugins',
    description: 'List all installed plugins via core REST. Returns name, file, version, status.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'install_plugin',
    description:
      'Install a plugin from the wordpress.org repo by slug (uses Plugin_Upgrader). Optionally activates it immediately. DESTRUCTIVE on existing same-slug installs — confirm with user.',
    inputSchema: {
      type: 'object',
      properties: {
        slug:     { type: 'string', description: 'wordpress.org plugin slug (e.g. "advanced-custom-fields")' },
        activate: { type: 'boolean', description: 'Activate after install (default false)' },
      },
      required: ['slug'],
    },
  },
  {
    name: 'activate_plugin',
    description: 'Activate an already-installed plugin by its bootstrap file (e.g. "advanced-custom-fields/acf.php").',
    inputSchema: {
      type: 'object',
      properties: { plugin: { type: 'string' } },
      required: ['plugin'],
    },
  },
  {
    name: 'deactivate_plugin',
    description: 'Deactivate an active plugin by its bootstrap file.',
    inputSchema: {
      type: 'object',
      properties: { plugin: { type: 'string' } },
      required: ['plugin'],
    },
  },
  {
    name: 'delete_plugin',
    description: 'Delete a plugin from disk. Deactivates first if active. DESTRUCTIVE — confirm with user.',
    inputSchema: {
      type: 'object',
      properties: { plugin: { type: 'string', description: 'plugin bootstrap file' } },
      required: ['plugin'],
    },
  },

  // ─────────────── Themes ───────────────
  {
    name: 'list_themes',
    description: 'List all installed themes via core REST.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'activate_theme',
    description: 'Switch the active theme. DESTRUCTIVE on live sites — confirm with user before switching.',
    inputSchema: {
      type: 'object',
      properties: { stylesheet: { type: 'string', description: 'Theme stylesheet (folder name)' } },
      required: ['stylesheet'],
    },
  },
  {
    name: 'get_active_theme_info',
    description:
      'Return active theme tokens: full style.css text, parsed theme.json, paths, block-theme flag. Use this before any frontend code change so you can reuse existing CSS variables / patterns.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },

  // ─────────────── CPT / Taxonomies / ACF ───────────────
  {
    name: 'register_cpt',
    description:
      'Register a Custom Post Type via ACF (so it shows in ACF → Post Types and is user-editable). Requires ACF to be active. Flushes rewrites automatically.',
    inputSchema: {
      type: 'object',
      properties: {
        key:    { type: 'string', description: 'Post type slug (a-z, 0-9, _; ≤20 chars)' },
        labels: {
          type: 'object',
          description: 'Optional label overrides',
          properties: {
            singular: { type: 'string' },
            plural:   { type: 'string' },
          },
        },
        args: {
          type: 'object',
          description: 'Optional ACF post-type args to merge (supports, has_archive, menu_icon, rewrite, etc.)',
        },
      },
      required: ['key'],
    },
  },
  {
    name: 'register_taxonomy',
    description: 'Register a taxonomy via ACF, attached to one or more post types. Requires ACF.',
    inputSchema: {
      type: 'object',
      properties: {
        key:         { type: 'string', description: 'Taxonomy slug' },
        object_type: { type: 'array', items: { type: 'string' }, description: 'Post type slugs this taxonomy applies to' },
        labels:      { type: 'object', properties: { singular: { type: 'string' }, plural: { type: 'string' } } },
        args:        { type: 'object' },
      },
      required: ['key', 'object_type'],
    },
  },
  {
    name: 'create_field_group',
    description:
      'Create an ACF field group with one or more fields. `location` follows ACF format: an array of OR-groups, each an array of AND-rules. Example: [[{param:"post_type",operator:"==",value:"service"}]].',
    inputSchema: {
      type: 'object',
      properties: {
        title:    { type: 'string' },
        location: { type: 'array', description: 'ACF location rules' },
        fields: {
          type: 'array',
          description: 'Fields to attach. Each: {name, type, label?, ...acf_extras}. Common types: text, textarea, image, wysiwyg, number, true_false, select, relationship, repeater.',
          items: {
            type: 'object',
            properties: {
              name:  { type: 'string' },
              type:  { type: 'string' },
              label: { type: 'string' },
            },
            required: ['name'],
          },
        },
      },
      required: ['title', 'location'],
    },
  },
  {
    name: 'add_field',
    description: 'Add a single field to an existing ACF field group (by group_key).',
    inputSchema: {
      type: 'object',
      properties: {
        group_key: { type: 'string' },
        name:      { type: 'string' },
        type:      { type: 'string', description: 'ACF field type (default "text")' },
        extra:     { type: 'object', description: 'Extra ACF field props (label, required, default_value, choices, return_format, etc.)' },
      },
      required: ['group_key', 'name'],
    },
  },
  {
    name: 'list_acf',
    description: 'List ACF-registered post types, taxonomies, and field groups.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'update_acf_field_value',
    description: 'Update an ACF field value on a single post via update_field() (writes both value and _meta_key pointer row).',
    inputSchema: {
      type: 'object',
      properties: {
        post_id:  { type: 'number' },
        selector: { type: 'string', description: 'Field name (e.g. "icon") or field key (e.g. "field_abc123")' },
        value:    { description: 'Value to write (any JSON type matching the field)' },
      },
      required: ['post_id', 'selector', 'value'],
    },
  },

  // ─────────────── Content (posts/pages/CPT) ───────────────
  {
    name: 'list_posts',
    description:
      'List posts of any post type via core REST. `type` defaults to "posts". Supports per_page, page, status, search, orderby.',
    inputSchema: {
      type: 'object',
      properties: {
        type:     { type: 'string', description: 'Post type REST base (e.g. "posts", "pages", "service")', default: 'posts' },
        per_page: { type: 'number' },
        page:     { type: 'number' },
        status:   { type: 'string' },
        search:   { type: 'string' },
        orderby:  { type: 'string' },
      },
    },
  },
  {
    name: 'get_post',
    description: 'Get a single post (any type) by ID.',
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', default: 'posts' },
        id:   { type: 'number' },
      },
      required: ['id'],
    },
  },
  {
    name: 'create_post',
    description:
      'Create a post of any type. Accepts the full WP REST body — title, content, status, slug, excerpt, meta, featured_media, acf, etc.',
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', default: 'posts' },
        data: { type: 'object', description: 'WP REST post body' },
      },
      required: ['data'],
    },
  },
  {
    name: 'update_post',
    description: 'Update a post (any type) by ID. Sends partial body to core REST.',
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', default: 'posts' },
        id:   { type: 'number' },
        data: { type: 'object' },
      },
      required: ['id', 'data'],
    },
  },
  {
    name: 'delete_post',
    description: 'Trash (or force-delete) a post by ID. DESTRUCTIVE — confirm with user before force.',
    inputSchema: {
      type: 'object',
      properties: {
        type:  { type: 'string', default: 'posts' },
        id:    { type: 'number' },
        force: { type: 'boolean', description: 'true = permanent delete (bypass trash). Default false.' },
      },
      required: ['id'],
    },
  },
  {
    name: 'set_post_meta',
    description: 'Set arbitrary post meta (non-ACF key). Use update_acf_field_value for ACF fields.',
    inputSchema: {
      type: 'object',
      properties: {
        post_id: { type: 'number' },
        key:     { type: 'string' },
        value:   {},
      },
      required: ['post_id', 'key', 'value'],
    },
  },

  // ─────────────── Media ───────────────
  {
    name: 'list_media',
    description: 'List media items via core REST (filter by search/mime_type/per_page).',
    inputSchema: {
      type: 'object',
      properties: {
        per_page:  { type: 'number' },
        page:      { type: 'number' },
        search:    { type: 'string' },
        mime_type: { type: 'string' },
      },
    },
  },
  {
    name: 'upload_media',
    description:
      'Upload a local file as a WP attachment. Returns the attachment ID. Optionally sets alt_text / caption / title / description in the same call.',
    inputSchema: {
      type: 'object',
      properties: {
        file_path:   { type: 'string', description: 'Absolute path to local file' },
        filename:    { type: 'string', description: 'Override filename in WP (optional)' },
        alt_text:    { type: 'string' },
        caption:     { type: 'string' },
        title:       { type: 'string' },
        description: { type: 'string' },
      },
      required: ['file_path'],
    },
  },
  {
    name: 'update_media',
    description: 'Update an existing attachment\'s alt_text / caption / title / description / etc.',
    inputSchema: {
      type: 'object',
      properties: {
        id:          { type: 'number' },
        alt_text:    { type: 'string' },
        caption:     { type: 'string' },
        title:       { type: 'string' },
        description: { type: 'string' },
      },
      required: ['id'],
    },
  },
  {
    name: 'delete_media',
    description: 'Delete an attachment. DESTRUCTIVE — confirm with user.',
    inputSchema: {
      type: 'object',
      properties: {
        id:    { type: 'number' },
        force: { type: 'boolean', default: true },
      },
      required: ['id'],
    },
  },

  // ─────────────── Taxonomies (content side) ───────────────
  {
    name: 'list_terms',
    description: 'List terms in a taxonomy via core REST (taxonomy must have show_in_rest=true).',
    inputSchema: {
      type: 'object',
      properties: {
        taxonomy: { type: 'string', description: 'Taxonomy REST base (e.g. "categories", "tags")' },
        per_page: { type: 'number' },
        search:   { type: 'string' },
      },
      required: ['taxonomy'],
    },
  },
  {
    name: 'create_term',
    description: 'Create a term in a taxonomy.',
    inputSchema: {
      type: 'object',
      properties: {
        taxonomy:    { type: 'string' },
        name:        { type: 'string' },
        slug:        { type: 'string' },
        description: { type: 'string' },
        parent:      { type: 'number' },
      },
      required: ['taxonomy', 'name'],
    },
  },
  {
    name: 'assign_terms_to_post',
    description: 'Assign terms (by id or name) to a post for a given taxonomy. Writes through core REST.',
    inputSchema: {
      type: 'object',
      properties: {
        type:     { type: 'string', default: 'posts' },
        post_id:  { type: 'number' },
        taxonomy: { type: 'string', description: 'REST key on the post (e.g. "categories", "tags", or a custom one)' },
        term_ids: { type: 'array', items: { type: 'number' } },
      },
      required: ['post_id', 'taxonomy', 'term_ids'],
    },
  },

  // ─────────────── Options ───────────────
  {
    name: 'get_option',
    description: 'Read a WP option by name.',
    inputSchema: {
      type: 'object',
      properties: { name: { type: 'string' } },
      required: ['name'],
    },
  },
  {
    name: 'update_option',
    description:
      'Write a WP option. Refuses to touch protected options (siteurl/home/admin_email/...) unless `allow_protected=true`. Pass `autoload:false` for options not needed every request.',
    inputSchema: {
      type: 'object',
      properties: {
        name:             { type: 'string' },
        value:            {},
        autoload:         { type: 'boolean' },
        allow_protected:  { type: 'boolean' },
      },
      required: ['name', 'value'],
    },
  },

  // ─────────────── Menus ───────────────
  {
    name: 'list_menus',
    description: 'List nav menus, current location assignments, and theme-registered locations.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'create_menu',
    description:
      'Create (or reuse by name) a nav menu and add items to it. Each item: {title, url?, type? (custom|post_type|taxonomy), object?, object_id?}.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              title:     { type: 'string' },
              url:       { type: 'string' },
              type:      { type: 'string' },
              object:    { type: 'string' },
              object_id: { type: 'number' },
            },
            required: ['title'],
          },
        },
      },
      required: ['name'],
    },
  },
  {
    name: 'assign_menu_location',
    description: 'Assign a menu to a theme-registered location slug.',
    inputSchema: {
      type: 'object',
      properties: {
        menu_id:  { type: 'number' },
        location: { type: 'string' },
      },
      required: ['menu_id', 'location'],
    },
  },

  // ─────────────── Users ───────────────
  {
    name: 'list_users',
    description: 'List users via core REST.',
    inputSchema: {
      type: 'object',
      properties: {
        per_page: { type: 'number' },
        page:     { type: 'number' },
        search:   { type: 'string' },
        roles:    { type: 'array', items: { type: 'string' } },
      },
    },
  },
  {
    name: 'create_user',
    description: 'Create a user via core REST. Caller must include email + username + password.',
    inputSchema: {
      type: 'object',
      properties: { data: { type: 'object', description: 'WP REST user body' } },
      required: ['data'],
    },
  },
  {
    name: 'update_user',
    description: 'Update a user (incl. role change). Send partial body.',
    inputSchema: {
      type: 'object',
      properties: {
        id:   { type: 'number' },
        data: { type: 'object' },
      },
      required: ['id', 'data'],
    },
  },
  {
    name: 'delete_user',
    description: 'Delete a user via core REST. DESTRUCTIVE — confirm with user.',
    inputSchema: {
      type: 'object',
      properties: {
        id:        { type: 'number' },
        reassign:  { type: 'number', description: 'Reassign their posts to this user id' },
        force:     { type: 'boolean', default: true },
      },
      required: ['id'],
    },
  },

  // ─────────────── Maintenance ───────────────
  {
    name: 'search_replace',
    description:
      'Search-replace across configured WP tables (default: posts, postmeta, options). Defaults to dry_run=true so nothing is written until confirmed. Refuses to touch wp_users / wp_usermeta.',
    inputSchema: {
      type: 'object',
      properties: {
        from:    { type: 'string' },
        to:      { type: 'string' },
        tables:  { type: 'array', items: { type: 'string' } },
        dry_run: { type: 'boolean', default: true },
      },
      required: ['from', 'to'],
    },
  },
  {
    name: 'flush_rewrite_rules',
    description: 'Flush WP rewrite rules. Call after registering a new CPT/taxonomy or changing permalinks.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'clear_transients',
    description: 'Delete all transients (clears caches managed via wp_options).',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'run_php',
    description:
      'Execute arbitrary PHP inside the WP runtime (gated). Requires define(\'WP_BACKEND_MCP_ALLOW_EVAL\', true) in wp-config.php — off by default. Use only for emergency one-offs the other tools can\'t do. DESTRUCTIVE.',
    inputSchema: {
      type: 'object',
      properties: { code: { type: 'string', description: 'PHP code (no opening <?php tag).' } },
      required: ['code'],
    },
  },

  // ─────────────── Filesystem (local install only) ───────────────
  {
    name: 'create_child_theme',
    description:
      'Create a child theme of the active (or named) parent. Writes style.css and functions.css. Returns the new theme path and stylesheet slug. Will not overwrite if it already exists.',
    inputSchema: {
      type: 'object',
      properties: {
        parent_stylesheet: { type: 'string', description: 'Parent stylesheet folder name. Defaults to currently active theme.' },
        slug:              { type: 'string', description: 'Child theme folder name. Defaults to "<parent>-child".' },
        theme_name:        { type: 'string', description: 'Human-readable theme name.' },
      },
    },
  },
  {
    name: 'create_mu_plugin',
    description:
      'Drop a new MU-plugin file at wp-content/mu-plugins/<filename>. Use for always-on site-glue PHP. Won\'t overwrite existing files unless `overwrite=true`.',
    inputSchema: {
      type: 'object',
      properties: {
        filename:  { type: 'string', description: 'e.g. "site-glue.php"' },
        contents:  { type: 'string', description: 'Full PHP file contents (must start with <?php).' },
        overwrite: { type: 'boolean', default: false },
      },
      required: ['filename', 'contents'],
    },
  },
  {
    name: 'read_theme_file',
    description: 'Read a file from the active theme directory (path relative to the theme root).',
    inputSchema: {
      type: 'object',
      properties: {
        stylesheet: { type: 'string', description: 'Optional: target a different theme by stylesheet folder. Default: active theme.' },
        path:       { type: 'string', description: 'Path relative to the theme folder, e.g. "templates/single-service.html".' },
      },
      required: ['path'],
    },
  },
  {
    name: 'write_theme_file',
    description:
      'Write a file inside a theme folder. SAFETY: refuses paths that escape the theme dir. By default targets the active theme; pass `stylesheet` to target a specific theme (typically the child).',
    inputSchema: {
      type: 'object',
      properties: {
        stylesheet: { type: 'string' },
        path:       { type: 'string' },
        contents:   { type: 'string' },
        overwrite:  { type: 'boolean', default: true },
      },
      required: ['path', 'contents'],
    },
  },
  {
    name: 'list_theme_files',
    description: 'List files in the active (or named) theme folder, optionally under a subpath.',
    inputSchema: {
      type: 'object',
      properties: {
        stylesheet: { type: 'string' },
        subpath:    { type: 'string', description: 'Subdir under the theme root. Default: theme root.' },
      },
    },
  },
];
