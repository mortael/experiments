<?php
/**
 * Plugin Name: WP Watermark Pro
 * Description: Add text or logo watermarks to images. Supports presets, batch processing, and auto-watermark on upload.
 * Version:     1.0.0
 * Requires at least: 5.8
 * Requires PHP: 7.4
 * License:     GPL-2.0+
 * Text Domain: wp-watermark-pro
 */

defined( 'ABSPATH' ) || exit;

define( 'WPWM_VERSION',    '1.0.0' );
define( 'WPWM_PLUGIN_FILE', __FILE__ );
define( 'WPWM_PLUGIN_DIR',  plugin_dir_path( __FILE__ ) );
define( 'WPWM_PLUGIN_URL',  plugin_dir_url( __FILE__ ) );

if ( ! extension_loaded( 'gd' ) ) {
	add_action( 'admin_notices', static function () {
		echo '<div class="notice notice-error"><p><strong>WP Watermark Pro</strong> requires the PHP GD extension. Please enable it.</p></div>';
	} );
	return;
}

require_once WPWM_PLUGIN_DIR . 'includes/class-watermark-processor.php';
require_once WPWM_PLUGIN_DIR . 'includes/class-watermark-admin.php';

final class WP_Watermark_Pro {

	private static ?WP_Watermark_Pro $instance = null;

	public static function get_instance(): self {
		if ( null === self::$instance ) {
			self::$instance = new self();
		}
		return self::$instance;
	}

	private function __construct() {
		register_activation_hook( WPWM_PLUGIN_FILE, [ $this, 'activate' ] );
		add_action( 'plugins_loaded', [ $this, 'init' ] );
	}

	public function activate(): void {
		if ( ! get_option( 'wpwm_settings' ) ) {
			update_option( 'wpwm_settings', self::default_settings() );
		}
	}

	public function init(): void {
		WP_Watermark_Admin::get_instance();

		$settings = self::get_settings();
		if ( ! empty( $settings['auto_watermark'] ) && ! empty( $settings['default_preset'] ) ) {
			add_filter( 'wp_generate_attachment_metadata', [ $this, 'auto_watermark_on_upload' ], 20, 2 );
		}
	}

	public function auto_watermark_on_upload( array $metadata, int $attachment_id ): array {
		if ( ! wp_attachment_is_image( $attachment_id ) ) {
			return $metadata;
		}
		$settings  = self::get_settings();
		$preset_id = $settings['default_preset'] ?? '';
		if ( $preset_id ) {
			( new WP_Watermark_Processor() )->apply_watermark( $attachment_id, $preset_id );
		}
		return $metadata;
	}

	// ── Static helpers ────────────────────────────────────────────────────────

	public static function get_settings(): array {
		return (array) get_option( 'wpwm_settings', [] );
	}

	public static function save_settings( array $settings ): void {
		update_option( 'wpwm_settings', $settings );
	}

	public static function get_presets(): array {
		return self::get_settings()['presets'] ?? [];
	}

	public static function get_preset( string $id ): ?array {
		return self::get_presets()[ $id ] ?? null;
	}

	public static function save_preset( array $preset ): void {
		$settings                         = self::get_settings();
		$settings['presets'][ $preset['id'] ] = $preset;
		self::save_settings( $settings );
	}

	public static function delete_preset( string $id ): void {
		$settings = self::get_settings();
		unset( $settings['presets'][ $id ] );
		if ( ( $settings['default_preset'] ?? '' ) === $id ) {
			$settings['default_preset'] = array_key_first( $settings['presets'] ?? [] ) ?? '';
		}
		self::save_settings( $settings );
	}

	// ── Default data ──────────────────────────────────────────────────────────

	private static function default_settings(): array {
		return [
			'auto_watermark'   => false,
			'default_preset'   => 'preset_1',
			'backup_originals' => true,
			'presets'          => [
				'preset_1' => [
					'id'            => 'preset_1',
					'name'          => 'Copyright Text',
					'type'          => 'text',
					'text'          => '© {year} {site_name}',
					'position'      => 'bottom-right',
					'padding'       => 20,
					'opacity'       => 70,
					'font_size'     => 24,
					'font_color'    => '#ffffff',
					'shadow'        => true,
					'shadow_color'  => '#000000',
					'shadow_offset' => 2,
					'rotation'      => 0,
				],
				'preset_2' => [
					'id'            => 'preset_2',
					'name'          => 'Draft Stamp',
					'type'          => 'text',
					'text'          => 'SAMPLE',
					'position'      => 'center',
					'padding'       => 0,
					'opacity'       => 25,
					'font_size'     => 80,
					'font_color'    => '#cccccc',
					'shadow'        => false,
					'shadow_color'  => '#000000',
					'shadow_offset' => 2,
					'rotation'      => -30,
				],
				'preset_3' => [
					'id'          => 'preset_3',
					'name'        => 'Corner Logo',
					'type'        => 'image',
					'logo_id'     => 0,
					'position'    => 'bottom-right',
					'padding'     => 15,
					'opacity'     => 85,
					'logo_width'  => 15,
				],
			],
		];
	}
}

WP_Watermark_Pro::get_instance();
