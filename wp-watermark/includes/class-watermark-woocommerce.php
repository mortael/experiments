<?php
defined( 'ABSPATH' ) || exit;

/**
 * WooCommerce integration: auto-watermark product images when assigned.
 * Only wires hooks when WooCommerce is active and the feature is enabled.
 */
class WP_Watermark_Woocommerce {

	private static ?self $instance = null;

	public static function get_instance(): self {
		if ( null === self::$instance ) {
			self::$instance = new self();
		}
		return self::$instance;
	}

	public static function is_active(): bool {
		return class_exists( 'WooCommerce' );
	}

	private function __construct() {
		// Hook fires on both new and updated product meta
		add_action( 'updated_post_meta', [ $this, 'on_product_meta' ], 20, 4 );
		add_action( 'added_post_meta',   [ $this, 'on_product_meta' ], 20, 4 );
	}

	/**
	 * Called whenever any post meta changes. Ignores non-product, non-image keys.
	 */
	public function on_product_meta( $meta_id, $post_id, string $meta_key, $meta_value ): void {
		$watched = [ '_thumbnail_id', '_product_image_gallery' ];
		if ( ! in_array( $meta_key, $watched, true ) ) {
			return;
		}
		if ( get_post_type( $post_id ) !== 'product' ) {
			return;
		}

		$settings  = WP_Watermark_Pro::get_settings();
		$wc        = $settings['woocommerce'] ?? [];
		if ( empty( $wc['enabled'] ) ) {
			return;
		}

		$preset_id = ! empty( $wc['preset_id'] ) ? $wc['preset_id'] : ( $settings['default_preset'] ?? '' );
		if ( ! $preset_id ) {
			return;
		}

		$processor = new WP_Watermark_Processor();

		if ( $meta_key === '_thumbnail_id' ) {
			$this->maybe_watermark( (int) $meta_value, $preset_id, $processor );
		} elseif ( $meta_key === '_product_image_gallery' && ! empty( $wc['apply_to_gallery'] ) ) {
			foreach ( array_filter( array_map( 'intval', explode( ',', (string) $meta_value ) ) ) as $id ) {
				$this->maybe_watermark( $id, $preset_id, $processor );
			}
		}
	}

	private function maybe_watermark( int $id, string $preset_id, WP_Watermark_Processor $processor ): void {
		if ( ! $id || ! wp_attachment_is_image( $id ) ) {
			return;
		}
		$settings = WP_Watermark_Pro::get_settings();
		$rules    = $settings['conditional_rules'] ?? [];
		// Respect global skip_watermarked rule
		if ( ! empty( $rules['skip_watermarked'] ) && get_post_meta( $id, '_wpwm_watermarked', true ) ) {
			return;
		}
		$processor->apply_watermark( $id, $preset_id );
	}
}
