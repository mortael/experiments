<?php
defined( 'ABSPATH' ) || exit;

/**
 * Frontend image-protection layer.
 * Loaded only when protection is enabled in settings.
 */
class WP_Watermark_Protection {

	private static ?self $instance = null;
	private array $cfg;

	public static function get_instance(): self {
		if ( null === self::$instance ) {
			self::$instance = new self();
		}
		return self::$instance;
	}

	private function __construct() {
		$s         = WP_Watermark_Pro::get_settings();
		$this->cfg = $s['protection'] ?? [];
	}

	/** Wire up frontend hooks (only called when protection is enabled). */
	public function init(): void {
		add_action( 'wp_enqueue_scripts', [ $this, 'enqueue_assets' ] );

		if ( ! empty( $this->cfg['wrap_images'] ) ) {
			add_filter( 'the_content',        [ $this, 'wrap_content_images' ] );
			add_filter( 'post_thumbnail_html', [ $this, 'wrap_content_images' ] );
		}

		if ( ! empty( $this->cfg['no_image_index'] ) ) {
			add_action( 'wp_head', [ $this, 'output_noimage_meta' ] );
		}
	}

	// ── Frontend assets ───────────────────────────────────────────────────────

	public function enqueue_assets(): void {
		wp_enqueue_style(
			'wpwm-protection',
			WPWM_PLUGIN_URL . 'assets/css/protection.css',
			[],
			WPWM_VERSION
		);
		wp_enqueue_script(
			'wpwm-protection',
			WPWM_PLUGIN_URL . 'assets/js/protection.js',
			[],
			WPWM_VERSION,
			true
		);
		wp_localize_script( 'wpwm-protection', 'wpwmProtect', [
			'rightclick'      => ! empty( $this->cfg['rightclick'] ),
			'drag'            => ! empty( $this->cfg['drag'] ),
			'keyboard'        => ! empty( $this->cfg['keyboard'] ),
			'devtools'        => ! empty( $this->cfg['devtools'] ),
			'devtools_action' => sanitize_key( $this->cfg['devtools_action'] ?? 'blur' ),
			'wrap_images'     => ! empty( $this->cfg['wrap_images'] ),
			'message'         => wp_strip_all_tags( $this->cfg['message'] ?? 'Images on this site are protected.' ),
		] );
	}

	// ── HTML filters ──────────────────────────────────────────────────────────

	public function wrap_content_images( string $html ): string {
		if ( empty( $html ) ) {
			return $html;
		}
		return preg_replace_callback(
			'/<img(\s[^>]*)>/i',
			static function ( array $m ): string {
				$attrs = $m[1];
				// Skip avatars, emojis, and already-wrapped images
				if ( preg_match( '/\b(avatar|emoji|wp-smiley|wpwm-protected)\b/i', $attrs ) ) {
					return $m[0];
				}
				return '<span class="wpwm-img-wrap">' . $m[0]
					 . '<span class="wpwm-img-shield" aria-hidden="true"></span></span>';
			},
			$html
		);
	}

	public function output_noimage_meta(): void {
		echo '<meta name="robots" content="noimageindex">' . "\n";
	}
}
