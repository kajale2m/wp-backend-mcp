<?php
/**
 * Plugin Name: WP Backend MCP Bridge
 * Description: Exposes REST routes used by the wp-backend-mcp Node server for ops the core REST API can't do (plugin install, ACF-based CPT/taxonomy/field-group registration, options, menus, search-replace, flush, transients, raw PHP eval for emergencies).
 * Version: 1.0.0
 * Author: wp-backend-mcp
 *
 * Drop this file into wp-content/mu-plugins/ on the target site.
 * Requires WP_BACKEND_MCP_KEY to be defined in wp-config.php (matching the .env value).
 */

if ( ! defined( 'ABSPATH' ) ) { exit; }

class WP_Backend_MCP_Bridge {

	const NS = 'wp-backend-mcp/v1';

	public static function init() {
		add_action( 'rest_api_init', [ __CLASS__, 'register_routes' ] );
	}

	public static function permission( $request ) {
		$key = $request->get_header( 'x_wp_mcp_key' );
		if ( ! $key ) { $key = $request->get_header( 'X-WP-MCP-Key' ); }
		$expected = defined( 'WP_BACKEND_MCP_KEY' ) ? WP_BACKEND_MCP_KEY : '';
		if ( ! $expected || ! hash_equals( $expected, (string) $key ) ) {
			return new WP_Error( 'forbidden', 'Bad or missing X-WP-MCP-Key.', [ 'status' => 403 ] );
		}
		return true;
	}

	public static function register_routes() {

		$perm = [ __CLASS__, 'permission' ];

		// ----- Discovery -----
		register_rest_route( self::NS, '/discover', [
			'methods'  => 'GET',
			'permission_callback' => $perm,
			'callback' => [ __CLASS__, 'discover' ],
		] );

		// ----- Plugins -----
		register_rest_route( self::NS, '/plugins/install', [
			'methods'  => 'POST',
			'permission_callback' => $perm,
			'callback' => [ __CLASS__, 'plugin_install' ],
		] );
		register_rest_route( self::NS, '/plugins/delete', [
			'methods'  => 'POST',
			'permission_callback' => $perm,
			'callback' => [ __CLASS__, 'plugin_delete' ],
		] );

		// ----- Themes -----
		register_rest_route( self::NS, '/themes/activate', [
			'methods'  => 'POST',
			'permission_callback' => $perm,
			'callback' => [ __CLASS__, 'theme_activate' ],
		] );
		register_rest_route( self::NS, '/themes/active-info', [
			'methods'  => 'GET',
			'permission_callback' => $perm,
			'callback' => [ __CLASS__, 'theme_active_info' ],
		] );

		// ----- ACF: post types / taxonomies / field groups / fields -----
		register_rest_route( self::NS, '/acf/post-type', [
			'methods'  => 'POST',
			'permission_callback' => $perm,
			'callback' => [ __CLASS__, 'acf_register_cpt' ],
		] );
		register_rest_route( self::NS, '/acf/taxonomy', [
			'methods'  => 'POST',
			'permission_callback' => $perm,
			'callback' => [ __CLASS__, 'acf_register_taxonomy' ],
		] );
		register_rest_route( self::NS, '/acf/field-group', [
			'methods'  => 'POST',
			'permission_callback' => $perm,
			'callback' => [ __CLASS__, 'acf_create_field_group' ],
		] );
		register_rest_route( self::NS, '/acf/field', [
			'methods'  => 'POST',
			'permission_callback' => $perm,
			'callback' => [ __CLASS__, 'acf_add_field' ],
		] );
		register_rest_route( self::NS, '/acf/list', [
			'methods'  => 'GET',
			'permission_callback' => $perm,
			'callback' => [ __CLASS__, 'acf_list' ],
		] );
		register_rest_route( self::NS, '/acf/update-field', [
			'methods'  => 'POST',
			'permission_callback' => $perm,
			'callback' => [ __CLASS__, 'acf_update_value' ],
		] );

		// ----- Options -----
		register_rest_route( self::NS, '/options/get', [
			'methods'  => 'POST',
			'permission_callback' => $perm,
			'callback' => [ __CLASS__, 'opt_get' ],
		] );
		register_rest_route( self::NS, '/options/update', [
			'methods'  => 'POST',
			'permission_callback' => $perm,
			'callback' => [ __CLASS__, 'opt_update' ],
		] );

		// ----- Menus -----
		register_rest_route( self::NS, '/menus/list', [
			'methods'  => 'GET',
			'permission_callback' => $perm,
			'callback' => [ __CLASS__, 'menus_list' ],
		] );
		register_rest_route( self::NS, '/menus/create', [
			'methods'  => 'POST',
			'permission_callback' => $perm,
			'callback' => [ __CLASS__, 'menus_create' ],
		] );
		register_rest_route( self::NS, '/menus/assign-location', [
			'methods'  => 'POST',
			'permission_callback' => $perm,
			'callback' => [ __CLASS__, 'menus_assign' ],
		] );

		// ----- Maintenance -----
		register_rest_route( self::NS, '/maintenance/search-replace', [
			'methods'  => 'POST',
			'permission_callback' => $perm,
			'callback' => [ __CLASS__, 'sr' ],
		] );
		register_rest_route( self::NS, '/maintenance/flush-rewrites', [
			'methods'  => 'POST',
			'permission_callback' => $perm,
			'callback' => [ __CLASS__, 'flush' ],
		] );
		register_rest_route( self::NS, '/maintenance/clear-transients', [
			'methods'  => 'POST',
			'permission_callback' => $perm,
			'callback' => [ __CLASS__, 'clear_transients' ],
		] );

		// ----- Post meta (arbitrary keys) -----
		register_rest_route( self::NS, '/meta/set', [
			'methods'  => 'POST',
			'permission_callback' => $perm,
			'callback' => [ __CLASS__, 'meta_set' ],
		] );

		// ----- Raw PHP eval — DANGEROUS, off by default -----
		register_rest_route( self::NS, '/eval', [
			'methods'  => 'POST',
			'permission_callback' => $perm,
			'callback' => [ __CLASS__, 'php_eval' ],
		] );
	}

	// =========================================================================
	// Discovery
	// =========================================================================

	public static function discover() {
		global $wp_version;
		$active_theme = wp_get_theme();
		$plugins = get_plugins();
		$active_plugins = (array) get_option( 'active_plugins', [] );
		$acf_active = class_exists( 'ACF' ) || function_exists( 'acf_update_internal_post_type' );

		$post_types = [];
		foreach ( get_post_types( [], 'objects' ) as $slug => $obj ) {
			$post_types[] = [
				'slug'         => $slug,
				'label'        => $obj->label,
				'public'       => (bool) $obj->public,
				'show_in_rest' => (bool) $obj->show_in_rest,
				'rest_base'    => $obj->rest_base ?: $slug,
				'_builtin'     => (bool) $obj->_builtin,
			];
		}

		$taxonomies = [];
		foreach ( get_taxonomies( [], 'objects' ) as $slug => $obj ) {
			$taxonomies[] = [
				'slug'         => $slug,
				'label'        => $obj->label,
				'object_type'  => $obj->object_type,
				'show_in_rest' => (bool) $obj->show_in_rest,
				'_builtin'     => (bool) $obj->_builtin,
			];
		}

		return [
			'wp_version'     => $wp_version,
			'php_version'    => PHP_VERSION,
			'site_url'       => site_url(),
			'home_url'       => home_url(),
			'abspath'        => ABSPATH,
			'wp_content_dir' => WP_CONTENT_DIR,
			'active_theme'   => [
				'stylesheet' => get_stylesheet(),
				'template'   => get_template(),
				'name'       => $active_theme->get( 'Name' ),
				'version'    => $active_theme->get( 'Version' ),
				'path'       => get_stylesheet_directory(),
				'is_block_theme' => function_exists( 'wp_is_block_theme' ) ? wp_is_block_theme() : false,
			],
			'plugins'        => array_values( array_map( function( $file, $data ) use ( $active_plugins ) {
				return [
					'file'    => $file,
					'name'    => $data['Name'],
					'version' => $data['Version'],
					'active'  => in_array( $file, $active_plugins, true ),
				];
			}, array_keys( $plugins ), $plugins ) ),
			'acf_active'     => $acf_active,
			'post_types'     => $post_types,
			'taxonomies'     => $taxonomies,
		];
	}

	// =========================================================================
	// Plugins
	// =========================================================================

	public static function plugin_install( $req ) {
		$slug = sanitize_key( $req->get_param( 'slug' ) );
		$activate = (bool) $req->get_param( 'activate' );
		if ( ! $slug ) { return new WP_Error( 'bad_slug', 'slug is required', [ 'status' => 400 ] ); }

		require_once ABSPATH . 'wp-admin/includes/file.php';
		require_once ABSPATH . 'wp-admin/includes/misc.php';
		require_once ABSPATH . 'wp-admin/includes/plugin.php';
		require_once ABSPATH . 'wp-admin/includes/plugin-install.php';
		require_once ABSPATH . 'wp-admin/includes/class-wp-upgrader.php';

		$api = plugins_api( 'plugin_information', [
			'slug'   => $slug,
			'fields' => [ 'sections' => false ],
		] );
		if ( is_wp_error( $api ) ) { return $api; }

		$upgrader = new Plugin_Upgrader( new WP_Ajax_Upgrader_Skin() );
		$result = $upgrader->install( $api->download_link );
		if ( is_wp_error( $result ) ) { return $result; }
		if ( false === $result ) { return new WP_Error( 'install_failed', 'Install returned false', [ 'status' => 500 ] ); }

		// Find the bootstrap file (slug/slug.php is the common case; fall back to scan).
		$plugin_file = self::find_plugin_file( $slug );
		$activated = false;
		if ( $activate && $plugin_file ) {
			$err = activate_plugin( $plugin_file );
			if ( is_wp_error( $err ) ) { return $err; }
			$activated = true;
		}

		return [
			'installed'   => true,
			'plugin_file' => $plugin_file,
			'activated'   => $activated,
			'version'     => $api->version,
		];
	}

	public static function plugin_delete( $req ) {
		$plugin_file = sanitize_text_field( $req->get_param( 'plugin' ) );
		if ( ! $plugin_file ) { return new WP_Error( 'bad_plugin', 'plugin file required', [ 'status' => 400 ] ); }

		require_once ABSPATH . 'wp-admin/includes/plugin.php';
		require_once ABSPATH . 'wp-admin/includes/file.php';

		// Deactivate first if active.
		if ( is_plugin_active( $plugin_file ) ) {
			deactivate_plugins( $plugin_file );
		}
		$result = delete_plugins( [ $plugin_file ] );
		if ( is_wp_error( $result ) ) { return $result; }
		return [ 'deleted' => true, 'plugin' => $plugin_file ];
	}

	private static function find_plugin_file( $slug ) {
		require_once ABSPATH . 'wp-admin/includes/plugin.php';
		$candidates = [ "$slug/$slug.php" ];
		foreach ( get_plugins() as $file => $_ ) {
			if ( strpos( $file, "$slug/" ) === 0 ) { $candidates[] = $file; }
		}
		foreach ( $candidates as $c ) {
			if ( file_exists( WP_PLUGIN_DIR . '/' . $c ) ) { return $c; }
		}
		return null;
	}

	// =========================================================================
	// Themes
	// =========================================================================

	public static function theme_activate( $req ) {
		$stylesheet = sanitize_text_field( $req->get_param( 'stylesheet' ) );
		$theme = wp_get_theme( $stylesheet );
		if ( ! $theme->exists() ) { return new WP_Error( 'no_theme', 'Theme not found', [ 'status' => 404 ] ); }
		switch_theme( $stylesheet );
		return [ 'activated' => true, 'stylesheet' => $stylesheet ];
	}

	public static function theme_active_info() {
		$dir = get_stylesheet_directory();
		$style_css = '';
		$style_path = $dir . '/style.css';
		if ( file_exists( $style_path ) ) {
			$style_css = file_get_contents( $style_path );
		}
		$theme_json = null;
		$tj_path = $dir . '/theme.json';
		if ( file_exists( $tj_path ) ) {
			$theme_json = json_decode( file_get_contents( $tj_path ), true );
		}
		return [
			'stylesheet'   => get_stylesheet(),
			'template'     => get_template(),
			'path'         => $dir,
			'style_css'    => $style_css,
			'theme_json'   => $theme_json,
		];
	}

	// =========================================================================
	// ACF — CPT / taxonomy / field group / field
	// =========================================================================

	private static function require_acf() {
		if ( ! function_exists( 'acf_update_internal_post_type' ) && ! function_exists( 'acf_update_field_group' ) ) {
			return new WP_Error( 'no_acf', 'ACF (Advanced Custom Fields) is not active.', [ 'status' => 412 ] );
		}
		return true;
	}

	public static function acf_register_cpt( $req ) {
		$err = self::require_acf(); if ( is_wp_error( $err ) ) { return $err; }

		$key = sanitize_key( $req->get_param( 'key' ) );
		$labels = (array) $req->get_param( 'labels' );
		$args   = (array) $req->get_param( 'args' );
		if ( ! $key ) { return new WP_Error( 'bad_key', 'key (post type slug) required', [ 'status' => 400 ] ); }

		$singular = $labels['singular'] ?? ucfirst( str_replace( '_', ' ', $key ) );
		$plural   = $labels['plural']   ?? $singular . 's';

		$payload = array_merge( [
			'title'             => $plural, // ACF stores this as the post_title shown in the Post Types admin list.
			'post_type'         => $key,
			'advanced_configuration' => 1,
			'labels'            => [
				'name'          => $plural,
				'singular_name' => $singular,
				'menu_name'     => $plural,
			],
			'public'            => 1,
			'show_in_rest'      => 1,
			'has_archive'       => 1,
			'rewrite'           => [ 'permalink_rewrite' => 'post_type_key' ],
			'supports'          => [ 'title', 'editor', 'thumbnail', 'excerpt' ],
			'menu_icon'         => 'dashicons-admin-post',
			'active'            => 1,
		], $args );

		$result   = acf_update_internal_post_type( $payload, 'acf-post-type' );
		$acf_id   = is_array( $result ) ? ( $result['ID'] ?? null ) : null;

		// Belt-and-braces: if the underlying post still has an empty post_title
		// (older ACF versions ignore $payload['title']), write it explicitly.
		if ( $acf_id ) {
			$post = get_post( $acf_id );
			if ( $post && '' === trim( (string) $post->post_title ) ) {
				wp_update_post( [ 'ID' => $acf_id, 'post_title' => $payload['title'] ] );
			}
		}

		flush_rewrite_rules();
		return [ 'registered' => true, 'key' => $key, 'acf_id' => $acf_id ];
	}

	public static function acf_register_taxonomy( $req ) {
		$err = self::require_acf(); if ( is_wp_error( $err ) ) { return $err; }

		$key         = sanitize_key( $req->get_param( 'key' ) );
		$object_type = (array) $req->get_param( 'object_type' );
		$labels      = (array) $req->get_param( 'labels' );
		$args        = (array) $req->get_param( 'args' );
		if ( ! $key ) { return new WP_Error( 'bad_key', 'key (taxonomy slug) required', [ 'status' => 400 ] ); }
		if ( ! $object_type ) { return new WP_Error( 'bad_obj', 'object_type (array of post type slugs) required', [ 'status' => 400 ] ); }

		$singular = $labels['singular'] ?? ucfirst( str_replace( '_', ' ', $key ) );
		$plural   = $labels['plural']   ?? $singular . 's';

		$payload = array_merge( [
			'title'       => $plural, // post_title for the ACF Taxonomies admin list.
			'taxonomy'    => $key,
			'object_type' => array_values( array_map( 'sanitize_key', $object_type ) ),
			'advanced_configuration' => 1,
			'labels'      => [
				'name'          => $plural,
				'singular_name' => $singular,
			],
			'public'       => 1,
			'hierarchical' => 1,
			'show_in_rest' => 1,
			'active'       => 1,
		], $args );

		$result = acf_update_internal_post_type( $payload, 'acf-taxonomy' );
		$acf_id = is_array( $result ) ? ( $result['ID'] ?? null ) : null;

		if ( $acf_id ) {
			$post = get_post( $acf_id );
			if ( $post && '' === trim( (string) $post->post_title ) ) {
				wp_update_post( [ 'ID' => $acf_id, 'post_title' => $payload['title'] ] );
			}
		}

		flush_rewrite_rules();
		return [ 'registered' => true, 'key' => $key, 'acf_id' => $acf_id ];
	}

	public static function acf_create_field_group( $req ) {
		$err = self::require_acf(); if ( is_wp_error( $err ) ) { return $err; }

		$title    = sanitize_text_field( $req->get_param( 'title' ) );
		$location = $req->get_param( 'location' );
		$fields   = (array) $req->get_param( 'fields' );
		if ( ! $title || empty( $location ) ) {
			return new WP_Error( 'bad_input', 'title and location required', [ 'status' => 400 ] );
		}

		$key = 'group_' . substr( md5( $title . microtime( true ) ), 0, 12 );

		$group = [
			'key'      => $key,
			'title'    => $title,
			'fields'   => [],
			'location' => $location,
			'show_in_rest' => 1,
			'active'   => true,
		];

		$saved_group = acf_update_field_group( $group );

		// Resolve the group's numeric post ID — acf_update_field() requires `parent`
		// to be the parent field-group post ID (an integer); passing the string key
		// leaves the created acf-field rows orphaned (post_parent=0) and the group
		// will report zero fields on the edit screen.
		$group_post_id = is_array( $saved_group ) && ! empty( $saved_group['ID'] ) ? (int) $saved_group['ID'] : 0;
		if ( ! $group_post_id ) {
			$lookup = acf_get_field_group( $key );
			$group_post_id = is_array( $lookup ) && ! empty( $lookup['ID'] ) ? (int) $lookup['ID'] : 0;
		}

		// Add fields.
		$added = [];
		foreach ( $fields as $f ) {
			$f = (array) $f;
			$name = sanitize_key( $f['name'] ?? '' );
			if ( ! $name ) { continue; }
			$field_payload = array_merge( [
				'key'      => 'field_' . substr( md5( $key . $name ), 0, 12 ),
				'label'    => $f['label'] ?? ucwords( str_replace( '_', ' ', $name ) ),
				'name'     => $name,
				'type'     => $f['type'] ?? 'text',
				'parent'   => $group_post_id ?: $key,
			], array_diff_key( $f, array_flip( [ 'name', 'label', 'type' ] ) ) );
			acf_update_field( $field_payload );
			$added[] = $field_payload['key'];
		}

		// Bust ACF in-memory stores so the next read picks up the new fields.
		if ( function_exists( 'acf_get_store' ) ) {
			foreach ( [ 'fields', 'field-groups', 'local-fields', 'local-groups' ] as $s ) {
				$store = acf_get_store( $s );
				if ( $store ) { $store->reset(); }
			}
		}

		return [ 'created' => true, 'group_key' => $key, 'fields' => $added ];
	}

	public static function acf_add_field( $req ) {
		$err = self::require_acf(); if ( is_wp_error( $err ) ) { return $err; }
		$group_key = sanitize_text_field( $req->get_param( 'group_key' ) );
		$name      = sanitize_key( $req->get_param( 'name' ) );
		$type      = sanitize_key( $req->get_param( 'type' ) ?: 'text' );
		$extra     = (array) ( $req->get_param( 'extra' ) ?: [] );
		if ( ! $group_key || ! $name ) {
			return new WP_Error( 'bad_input', 'group_key and name required', [ 'status' => 400 ] );
		}
		// Resolve the group's numeric post ID — acf_update_field() requires `parent`
		// to be an integer post ID; the string key alone leaves the row orphaned.
		$group_lookup  = acf_get_field_group( $group_key );
		$group_post_id = is_array( $group_lookup ) && ! empty( $group_lookup['ID'] ) ? (int) $group_lookup['ID'] : 0;
		if ( ! $group_post_id ) {
			return new WP_Error( 'group_not_found', 'Field group not found for key: ' . $group_key, [ 'status' => 404 ] );
		}

		$payload = array_merge( [
			'key'    => 'field_' . substr( md5( $group_key . $name . microtime( true ) ), 0, 12 ),
			'label'  => $extra['label'] ?? ucwords( str_replace( '_', ' ', $name ) ),
			'name'   => $name,
			'type'   => $type,
			'parent' => $group_post_id,
		], $extra );
		acf_update_field( $payload );

		// Bust ACF in-memory stores.
		if ( function_exists( 'acf_get_store' ) ) {
			foreach ( [ 'fields', 'field-groups', 'local-fields', 'local-groups' ] as $s ) {
				$store = acf_get_store( $s );
				if ( $store ) { $store->reset(); }
			}
		}

		return [ 'added' => true, 'field_key' => $payload['key'] ];
	}

	public static function acf_list() {
		$err = self::require_acf(); if ( is_wp_error( $err ) ) { return $err; }
		$cpts = function_exists( 'acf_get_internal_post_type_posts' ) ? acf_get_internal_post_type_posts( 'acf-post-type' ) : [];
		$taxes = function_exists( 'acf_get_internal_post_type_posts' ) ? acf_get_internal_post_type_posts( 'acf-taxonomy' ) : [];
		$groups = function_exists( 'acf_get_field_groups' ) ? acf_get_field_groups() : [];
		return [
			'post_types'   => array_map( function( $p ) { return [ 'key' => $p['post_type'] ?? null, 'title' => $p['title'] ?? null ]; }, $cpts ),
			'taxonomies'   => array_map( function( $t ) { return [ 'key' => $t['taxonomy'] ?? null, 'title' => $t['title'] ?? null, 'object_type' => $t['object_type'] ?? [] ]; }, $taxes ),
			'field_groups' => array_map( function( $g ) { return [ 'key' => $g['key'], 'title' => $g['title'], 'location' => $g['location'] ?? [] ]; }, $groups ),
		];
	}

	public static function acf_update_value( $req ) {
		if ( ! function_exists( 'update_field' ) ) {
			return new WP_Error( 'no_acf', 'ACF not active', [ 'status' => 412 ] );
		}
		$post_id   = absint( $req->get_param( 'post_id' ) );
		$selector  = sanitize_text_field( $req->get_param( 'selector' ) ); // field name or field_xxx key
		$value     = $req->get_param( 'value' );
		if ( ! $post_id || ! $selector ) {
			return new WP_Error( 'bad_input', 'post_id and selector required', [ 'status' => 400 ] );
		}
		$ok = update_field( $selector, $value, $post_id );
		return [ 'updated' => (bool) $ok, 'post_id' => $post_id, 'selector' => $selector ];
	}

	// =========================================================================
	// Options
	// =========================================================================

	public static function opt_get( $req ) {
		$name = sanitize_text_field( $req->get_param( 'name' ) );
		if ( ! $name ) { return new WP_Error( 'bad_name', 'name required', [ 'status' => 400 ] ); }
		return [ 'name' => $name, 'value' => get_option( $name ) ];
	}

	public static function opt_update( $req ) {
		$name  = sanitize_text_field( $req->get_param( 'name' ) );
		$value = $req->get_param( 'value' );
		$autoload = $req->get_param( 'autoload' );
		if ( ! $name ) { return new WP_Error( 'bad_name', 'name required', [ 'status' => 400 ] ); }
		// Guard against touching critical options without an explicit flag.
		$protected = [ 'siteurl', 'home', 'admin_email', 'blog_charset', 'db_version' ];
		if ( in_array( $name, $protected, true ) && ! $req->get_param( 'allow_protected' ) ) {
			return new WP_Error( 'protected', "Refusing to update protected option '$name' without allow_protected=true.", [ 'status' => 403 ] );
		}
		$ok = update_option( $name, $value, $autoload === null ? null : (bool) $autoload );
		return [ 'updated' => (bool) $ok, 'name' => $name ];
	}

	// =========================================================================
	// Menus
	// =========================================================================

	public static function menus_list() {
		$menus = wp_get_nav_menus();
		$locations = get_nav_menu_locations();
		return [
			'menus'     => array_map( function( $m ) { return [ 'id' => $m->term_id, 'name' => $m->name, 'slug' => $m->slug, 'count' => $m->count ]; }, $menus ),
			'locations' => $locations,
			'registered_locations' => get_registered_nav_menus(),
		];
	}

	public static function menus_create( $req ) {
		$name  = sanitize_text_field( $req->get_param( 'name' ) );
		$items = (array) ( $req->get_param( 'items' ) ?: [] );
		if ( ! $name ) { return new WP_Error( 'bad_name', 'name required', [ 'status' => 400 ] ); }

		$existing = wp_get_nav_menu_object( $name );
		$menu_id = $existing ? $existing->term_id : wp_create_nav_menu( $name );
		if ( is_wp_error( $menu_id ) ) { return $menu_id; }

		$added = [];
		foreach ( $items as $i ) {
			$i = (array) $i;
			$data = [
				'menu-item-title'  => $i['title'] ?? '',
				'menu-item-url'    => $i['url']   ?? '',
				'menu-item-status' => 'publish',
				'menu-item-type'   => $i['type']  ?? 'custom',
				'menu-item-object' => $i['object'] ?? '',
				'menu-item-object-id' => isset( $i['object_id'] ) ? absint( $i['object_id'] ) : 0,
			];
			$item_id = wp_update_nav_menu_item( $menu_id, 0, $data );
			if ( ! is_wp_error( $item_id ) ) { $added[] = $item_id; }
		}
		return [ 'menu_id' => $menu_id, 'items' => $added ];
	}

	public static function menus_assign( $req ) {
		$menu_id  = absint( $req->get_param( 'menu_id' ) );
		$location = sanitize_key( $req->get_param( 'location' ) );
		if ( ! $menu_id || ! $location ) { return new WP_Error( 'bad', 'menu_id and location required', [ 'status' => 400 ] ); }
		$locations = get_theme_mod( 'nav_menu_locations', [] );
		$locations[ $location ] = $menu_id;
		set_theme_mod( 'nav_menu_locations', $locations );
		return [ 'assigned' => true, 'location' => $location, 'menu_id' => $menu_id ];
	}

	// =========================================================================
	// Maintenance
	// =========================================================================

	public static function sr( $req ) {
		global $wpdb;
		$from = (string) $req->get_param( 'from' );
		$to   = (string) $req->get_param( 'to' );
		$dry  = $req->get_param( 'dry_run' );
		$dry  = ( $dry === null ) ? true : (bool) $dry;
		$tables = (array) ( $req->get_param( 'tables' ) ?: [ 'posts', 'postmeta', 'options' ] );

		if ( $from === '' ) { return new WP_Error( 'bad', 'from required', [ 'status' => 400 ] ); }

		$forbidden = [ 'users', 'usermeta' ];
		foreach ( $tables as $t ) {
			if ( in_array( $t, $forbidden, true ) ) {
				return new WP_Error( 'forbidden_table', "Refusing to search-replace in $t for safety.", [ 'status' => 403 ] );
			}
		}

		$report = [];
		foreach ( $tables as $t ) {
			$table = $wpdb->prefix . $t;
			$cols  = $wpdb->get_results( "SHOW COLUMNS FROM $table", ARRAY_A );
			$text_cols = array_values( array_filter( array_map( function( $c ) {
				return preg_match( '/(char|text|longtext|mediumtext|tinytext)/i', $c['Type'] ) ? $c['Field'] : null;
			}, $cols ) ) );

			$count = 0;
			foreach ( $text_cols as $col ) {
				$found = (int) $wpdb->get_var( $wpdb->prepare(
					"SELECT COUNT(*) FROM $table WHERE $col LIKE %s",
					'%' . $wpdb->esc_like( $from ) . '%'
				) );
				if ( $found && ! $dry ) {
					$wpdb->query( $wpdb->prepare(
						"UPDATE $table SET $col = REPLACE($col, %s, %s) WHERE $col LIKE %s",
						$from, $to, '%' . $wpdb->esc_like( $from ) . '%'
					) );
				}
				if ( $found ) { $report[ "$t.$col" ] = $found; }
			}
		}
		return [ 'dry_run' => $dry, 'replacements_by_column' => $report ];
	}

	public static function flush() {
		flush_rewrite_rules();
		return [ 'flushed' => true ];
	}

	public static function clear_transients() {
		global $wpdb;
		$n = $wpdb->query( "DELETE FROM $wpdb->options WHERE option_name LIKE '\\_transient\\_%' OR option_name LIKE '\\_site\\_transient\\_%'" );
		return [ 'deleted_rows' => $n ];
	}

	// =========================================================================
	// Post meta
	// =========================================================================

	public static function meta_set( $req ) {
		$post_id = absint( $req->get_param( 'post_id' ) );
		$key     = sanitize_text_field( $req->get_param( 'key' ) );
		$value   = $req->get_param( 'value' );
		if ( ! $post_id || ! $key ) { return new WP_Error( 'bad', 'post_id and key required', [ 'status' => 400 ] ); }
		$ok = update_post_meta( $post_id, $key, $value );
		return [ 'updated' => (bool) $ok, 'post_id' => $post_id, 'key' => $key ];
	}

	// =========================================================================
	// PHP eval (off by default, gated)
	// =========================================================================

	public static function php_eval( $req ) {
		if ( ! defined( 'WP_BACKEND_MCP_ALLOW_EVAL' ) || ! WP_BACKEND_MCP_ALLOW_EVAL ) {
			return new WP_Error( 'eval_disabled', "Set define('WP_BACKEND_MCP_ALLOW_EVAL', true) in wp-config.php to enable. Use only for emergency one-off work.", [ 'status' => 403 ] );
		}
		$code = (string) $req->get_param( 'code' );
		if ( $code === '' ) { return new WP_Error( 'bad', 'code required', [ 'status' => 400 ] ); }
		ob_start();
		try {
			$ret = eval( $code ); // phpcs:ignore Squiz.PHP.Eval -- guarded by shared secret + opt-in constant.
			$out = ob_get_clean();
			return [ 'return' => $ret, 'echo' => $out ];
		} catch ( \Throwable $e ) {
			ob_end_clean();
			return new WP_Error( 'eval_error', $e->getMessage(), [ 'status' => 500 ] );
		}
	}
}

WP_Backend_MCP_Bridge::init();
