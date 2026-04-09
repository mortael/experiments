<?php
defined( 'ABSPATH' ) || exit;

/**
 * Handles all GD-based image watermarking.
 */
class WP_Watermark_Processor {

	private ?string $font_path;

	public function __construct() {
		$this->font_path = $this->detect_font();
	}

	// ── Public API ────────────────────────────────────────────────────────────

	/**
	 * Apply a preset watermark to a media attachment.
	 *
	 * @return true|WP_Error
	 */
	public function apply_watermark( int $attachment_id, string $preset_id ) {
		$preset = WP_Watermark_Pro::get_preset( $preset_id );
		if ( ! $preset ) {
			return new WP_Error( 'no_preset', 'Preset not found.' );
		}

		if ( ! wp_attachment_is_image( $attachment_id ) ) {
			return new WP_Error( 'not_image', 'Attachment is not an image.' );
		}

		$file_path = get_attached_file( $attachment_id );
		if ( ! $file_path || ! file_exists( $file_path ) ) {
			return new WP_Error( 'no_file', 'File not found: ' . esc_html( $file_path ) );
		}

		$settings = WP_Watermark_Pro::get_settings();
		$mime     = get_post_mime_type( $attachment_id );
		$rules    = $settings['conditional_rules'] ?? [];

		// ── Conditional rules ─────────────────────────────────────────────────
		if ( ! empty( $rules['skip_watermarked'] ) && get_post_meta( $attachment_id, '_wpwm_watermarked', true ) ) {
			return new WP_Error( 'already_watermarked', 'Image already watermarked, skipped.' );
		}

		$min_w = (int) ( $rules['min_width']  ?? 0 );
		$min_h = (int) ( $rules['min_height'] ?? 0 );
		if ( $min_w > 0 || $min_h > 0 ) {
			$dims = @getimagesize( $file_path );
			if ( $dims && ( ( $min_w > 0 && $dims[0] < $min_w ) || ( $min_h > 0 && $dims[1] < $min_h ) ) ) {
				return new WP_Error( 'too_small', sprintf( 'Image is %d×%d px (minimum %d×%d), skipped.', $dims[0], $dims[1], $min_w, $min_h ) );
			}
		}

		$exclude_mime = (array) ( $rules['exclude_mime'] ?? [] );
		if ( $exclude_mime && in_array( $mime, $exclude_mime, true ) ) {
			return new WP_Error( 'excluded_mime', "MIME type {$mime} is excluded from watermarking." );
		}
		// ─────────────────────────────────────────────────────────────────────

		if ( ! empty( $settings['backup_originals'] ) ) {
			$backup = $this->create_backup( $file_path );
			if ( is_wp_error( $backup ) ) {
				return $backup;
			}
			// Store backup metadata only on the first watermark (don't overwrite original date).
			if ( ! get_post_meta( $attachment_id, '_wpwm_backup_date', true ) ) {
				update_post_meta( $attachment_id, '_wpwm_backup_date', time() );
				update_post_meta( $attachment_id, '_wpwm_backup_size', filesize( $backup ) );
			}
		}

		@ini_set( 'memory_limit', '256M' ); // large images need headroom

		$image_res = $this->load_image( $file_path, $mime ); // $mime set above
		if ( is_wp_error( $image_res ) ) {
			return $image_res;
		}
		[ $image, $type ] = $image_res;

		if ( $preset['type'] === 'text' ) {
			$result = ! empty( $preset['tile'] )
				? $this->apply_tiled_text_watermark( $image, $preset )
				: $this->apply_text_watermark( $image, $preset );
		} else {
			$result = ! empty( $preset['tile'] )
				? $this->apply_tiled_image_watermark( $image, $preset )
				: $this->apply_image_watermark( $image, $preset );
		}

		if ( is_wp_error( $result ) ) {
			imagedestroy( $image );
			return $result;
		}

		$saved = $this->save_image( $image, $file_path, $type );
		imagedestroy( $image );

		if ( ! $saved ) {
			return new WP_Error( 'save_failed', 'Could not save watermarked image.' );
		}

		update_post_meta( $attachment_id, '_wpwm_watermarked', '1' );
		update_post_meta( $attachment_id, '_wpwm_preset',     $preset_id );

		return true;
	}

	/**
	 * Restore a previously watermarked image from backup.
	 *
	 * @return true|WP_Error
	 */
	public function restore_original( int $attachment_id ) {
		$file_path   = get_attached_file( $attachment_id );
		$backup_path = $this->get_backup_path( $file_path );

		if ( ! file_exists( $backup_path ) ) {
			return new WP_Error( 'no_backup', 'No backup found for this image.' );
		}
		if ( ! copy( $backup_path, $file_path ) ) {
			return new WP_Error( 'restore_failed', 'Could not restore original.' );
		}

		delete_post_meta( $attachment_id, '_wpwm_watermarked' );
		delete_post_meta( $attachment_id, '_wpwm_preset' );

		return true;
	}

	public function has_ttf_support(): bool {
		return function_exists( 'imagettftext' ) && (bool) $this->font_path;
	}

	// ── Watermark rendering ───────────────────────────────────────────────────

	/** @return true|WP_Error */
	private function apply_text_watermark( $image, array $preset ) {
		$text          = $this->parse_placeholders( $preset['text'] ?? '© {year}' );
		$font_size     = max( 6, (int) ( $preset['font_size']    ?? 24 ) );
		$opacity       = $this->clamp( (int) ( $preset['opacity']      ?? 70 ), 0, 100 );
		$font_color    = $preset['font_color']   ?? '#ffffff';
		$shadow        = ! empty( $preset['shadow'] );
		$shadow_color  = $preset['shadow_color']  ?? '#000000';
		$shadow_offset = (int) ( $preset['shadow_offset'] ?? 2 );
		$rotation      = (float) ( $preset['rotation']    ?? 0 );
		$padding       = (int) ( $preset['padding']       ?? 20 );
		$position      = $preset['position']     ?? 'bottom-right';

		$img_w = imagesx( $image );
		$img_h = imagesy( $image );

		if ( $this->has_ttf_support() ) {
			$bbox = imagettfbbox( $font_size, $rotation, $this->font_path, $text );
			if ( ! $bbox ) {
				return $this->apply_text_watermark_builtin( $image, $preset );
			}
			$text_w = abs( $bbox[4] - $bbox[0] );
			$text_h = abs( $bbox[5] - $bbox[1] );
			$descender = abs( $bbox[1] ); // space below baseline

			[ $x, $y ] = $this->get_position_coords( $img_w, $img_h, $text_w, $text_h, $position, $padding );
			// imagettftext y = baseline; adjust so $y points to visual top
			$baseline_y = $y + $text_h - $descender;

			$overlay = $this->create_transparent_overlay( $img_w, $img_h );

			if ( $shadow ) {
				[ $sr, $sg, $sb ] = $this->hex2rgb( $shadow_color );
				$sc = imagecolorallocate( $overlay, $sr, $sg, $sb );
				imagettftext( $overlay, $font_size, $rotation, $x + $shadow_offset, $baseline_y + $shadow_offset, $sc, $this->font_path, $text );
			}
			[ $r, $g, $b ] = $this->hex2rgb( $font_color );
			$tc = imagecolorallocate( $overlay, $r, $g, $b );
			imagettftext( $overlay, $font_size, $rotation, $x, $baseline_y, $tc, $this->font_path, $text );
		} else {
			return $this->apply_text_watermark_builtin( $image, $preset );
		}

		$this->merge_overlay( $image, $overlay, $img_w, $img_h, $opacity );
		imagedestroy( $overlay );
		return true;
	}

	/** Fallback using GD's built-in raster fonts (always available). */
	private function apply_text_watermark_builtin( $image, array $preset ) {
		$text     = $this->parse_placeholders( $preset['text']    ?? '© {year}' );
		$opacity  = $this->clamp( (int) ( $preset['opacity']  ?? 70 ), 0, 100 );
		$color    = $preset['font_color'] ?? '#ffffff';
		$padding  = (int) ( $preset['padding']   ?? 20 );
		$position = $preset['position']   ?? 'bottom-right';
		$gd_font  = 5; // largest built-in font

		$img_w  = imagesx( $image );
		$img_h  = imagesy( $image );
		$text_w = strlen( $text ) * imagefontwidth( $gd_font );
		$text_h = imagefontheight( $gd_font );

		[ $x, $y ] = $this->get_position_coords( $img_w, $img_h, $text_w, $text_h, $position, $padding );

		$overlay = $this->create_transparent_overlay( $img_w, $img_h );
		[ $r, $g, $b ] = $this->hex2rgb( $color );
		$tc = imagecolorallocate( $overlay, $r, $g, $b );
		imagestring( $overlay, $gd_font, (int) $x, (int) $y, $text, $tc );

		$this->merge_overlay( $image, $overlay, $img_w, $img_h, $opacity );
		imagedestroy( $overlay );
		return true;
	}

	/** @return true|WP_Error */
	private function apply_image_watermark( $image, array $preset ) {
		$logo_id = (int) ( $preset['logo_id'] ?? 0 );
		if ( ! $logo_id ) {
			return new WP_Error( 'no_logo', 'No logo selected for this preset.' );
		}

		$logo_path = get_attached_file( $logo_id );
		if ( ! $logo_path || ! file_exists( $logo_path ) ) {
			return new WP_Error( 'logo_missing', 'Logo file not found.' );
		}

		$logo_mime = get_post_mime_type( $logo_id );
		$logo_res  = $this->load_image( $logo_path, $logo_mime );
		if ( is_wp_error( $logo_res ) ) {
			return $logo_res;
		}
		[ $logo, ] = $logo_res;

		$img_w       = imagesx( $image );
		$img_h       = imagesy( $image );
		$logo_orig_w = imagesx( $logo );
		$logo_orig_h = imagesy( $logo );

		$logo_pct   = $this->clamp( (int) ( $preset['logo_width'] ?? 20 ), 1, 100 );
		$new_logo_w = (int) round( $img_w * $logo_pct / 100 );
		$new_logo_h = (int) round( $logo_orig_h * $new_logo_w / $logo_orig_w );

		$resized = imagecreatetruecolor( $new_logo_w, $new_logo_h );
		imagealphablending( $resized, false );
		imagesavealpha( $resized, true );
		$trans = imagecolorallocatealpha( $resized, 0, 0, 0, 127 );
		imagefill( $resized, 0, 0, $trans );
		imagecopyresampled( $resized, $logo, 0, 0, 0, 0, $new_logo_w, $new_logo_h, $logo_orig_w, $logo_orig_h );
		imagedestroy( $logo );

		// Apply rotation if set
		$rotation = (float) ( $preset['rotation'] ?? 0 );
		if ( $rotation != 0.0 ) {
			$bg      = imagecolorallocatealpha( $resized, 0, 0, 0, 127 );
			$rotated = imagerotate( $resized, -$rotation, $bg );
			imagedestroy( $resized );
			imagealphablending( $rotated, false );
			imagesavealpha( $rotated, true );
			$resized    = $rotated;
			$new_logo_w = imagesx( $resized );
			$new_logo_h = imagesy( $resized );
		}

		$padding  = (int) ( $preset['padding']  ?? 15 );
		$position = $preset['position']  ?? 'bottom-right';
		$opacity  = $this->clamp( (int) ( $preset['opacity'] ?? 85 ), 0, 100 );

		[ $x, $y ] = $this->get_position_coords( $img_w, $img_h, $new_logo_w, $new_logo_h, $position, $padding );

		$this->merge_overlay( $image, $resized, $new_logo_w, $new_logo_h, $opacity, (int) $x, (int) $y );
		imagedestroy( $resized );

		return true;
	}

	/** Tile text watermark across the full image. */
	private function apply_tiled_text_watermark( $image, array $preset ) {
		$text          = $this->parse_placeholders( $preset['text'] ?? '© {year}' );
		$font_size     = max( 6, (int) ( $preset['font_size']    ?? 24 ) );
		$opacity       = $this->clamp( (int) ( $preset['opacity']      ?? 70 ), 0, 100 );
		$font_color    = $preset['font_color']   ?? '#ffffff';
		$shadow        = ! empty( $preset['shadow'] );
		$shadow_color  = $preset['shadow_color']  ?? '#000000';
		$shadow_offset = (int) ( $preset['shadow_offset'] ?? 2 );
		$rotation      = (float) ( $preset['rotation']    ?? 0 );
		$gap_x         = max( 0, (int) ( $preset['tile_gap_x'] ?? 40 ) );
		$gap_y         = max( 0, (int) ( $preset['tile_gap_y'] ?? 40 ) );

		$img_w   = imagesx( $image );
		$img_h   = imagesy( $image );
		$overlay = $this->create_transparent_overlay( $img_w, $img_h );

		if ( $this->has_ttf_support() ) {
			$bbox = imagettfbbox( $font_size, $rotation, $this->font_path, $text );
			if ( ! $bbox ) {
				return $this->apply_text_watermark_builtin( $image, $preset );
			}
			$text_w    = abs( $bbox[4] - $bbox[0] );
			$text_h    = abs( $bbox[5] - $bbox[1] );
			$descender = abs( $bbox[1] );
			$step_x    = max( 1, $text_w + $gap_x );
			$step_y    = max( 1, $text_h + $gap_y );

			[ $r, $g, $b ] = $this->hex2rgb( $font_color );
			$tc = imagecolorallocate( $overlay, $r, $g, $b );
			$sc = null;
			if ( $shadow ) {
				[ $sr, $sg, $sb ] = $this->hex2rgb( $shadow_color );
				$sc = imagecolorallocate( $overlay, $sr, $sg, $sb );
			}

			for ( $y = -$text_h; $y < $img_h + $text_h; $y += $step_y ) {
				$base_y = (int) $y + $text_h - $descender;
				for ( $x = -$text_w; $x < $img_w + $text_w; $x += $step_x ) {
					if ( $shadow && $sc !== null ) {
						imagettftext( $overlay, $font_size, $rotation, (int) $x + $shadow_offset, $base_y + $shadow_offset, $sc, $this->font_path, $text );
					}
					imagettftext( $overlay, $font_size, $rotation, (int) $x, $base_y, $tc, $this->font_path, $text );
				}
			}
		} else {
			$gd_font = 5;
			$text_w  = strlen( $text ) * imagefontwidth( $gd_font );
			$text_h  = imagefontheight( $gd_font );
			$step_x  = max( 1, $text_w + $gap_x );
			$step_y  = max( 1, $text_h + $gap_y );
			[ $r, $g, $b ] = $this->hex2rgb( $font_color );
			$tc = imagecolorallocate( $overlay, $r, $g, $b );
			for ( $y = 0; $y < $img_h; $y += $step_y ) {
				for ( $x = 0; $x < $img_w; $x += $step_x ) {
					imagestring( $overlay, $gd_font, $x, $y, $text, $tc );
				}
			}
		}

		$this->merge_overlay( $image, $overlay, $img_w, $img_h, $opacity );
		imagedestroy( $overlay );
		return true;
	}

	/** Tile logo watermark across the full image. */
	private function apply_tiled_image_watermark( $image, array $preset ) {
		$logo_id = (int) ( $preset['logo_id'] ?? 0 );
		if ( ! $logo_id ) {
			return new WP_Error( 'no_logo', 'No logo selected for this preset.' );
		}

		$logo_path = get_attached_file( $logo_id );
		if ( ! $logo_path || ! file_exists( $logo_path ) ) {
			return new WP_Error( 'logo_missing', 'Logo file not found.' );
		}

		$logo_mime = get_post_mime_type( $logo_id );
		$logo_res  = $this->load_image( $logo_path, $logo_mime );
		if ( is_wp_error( $logo_res ) ) {
			return $logo_res;
		}
		[ $logo, ] = $logo_res;

		$img_w       = imagesx( $image );
		$img_h       = imagesy( $image );
		$logo_orig_w = imagesx( $logo );
		$logo_orig_h = imagesy( $logo );

		$logo_pct   = $this->clamp( (int) ( $preset['logo_width'] ?? 20 ), 1, 100 );
		$new_logo_w = (int) round( $img_w * $logo_pct / 100 );
		$new_logo_h = (int) round( $logo_orig_h * $new_logo_w / $logo_orig_w );

		$resized = imagecreatetruecolor( $new_logo_w, $new_logo_h );
		imagealphablending( $resized, false );
		imagesavealpha( $resized, true );
		$trans = imagecolorallocatealpha( $resized, 0, 0, 0, 127 );
		imagefill( $resized, 0, 0, $trans );
		imagecopyresampled( $resized, $logo, 0, 0, 0, 0, $new_logo_w, $new_logo_h, $logo_orig_w, $logo_orig_h );
		imagedestroy( $logo );

		$rotation = (float) ( $preset['rotation'] ?? 0 );
		if ( $rotation != 0.0 ) {
			$bg      = imagecolorallocatealpha( $resized, 0, 0, 0, 127 );
			$rotated = imagerotate( $resized, -$rotation, $bg );
			imagedestroy( $resized );
			imagealphablending( $rotated, false );
			imagesavealpha( $rotated, true );
			$resized    = $rotated;
			$new_logo_w = imagesx( $resized );
			$new_logo_h = imagesy( $resized );
		}

		$opacity = $this->clamp( (int) ( $preset['opacity'] ?? 85 ), 0, 100 );
		$gap_x   = max( 0, (int) ( $preset['tile_gap_x'] ?? 40 ) );
		$gap_y   = max( 0, (int) ( $preset['tile_gap_y'] ?? 40 ) );
		$step_x  = max( 1, $new_logo_w + $gap_x );
		$step_y  = max( 1, $new_logo_h + $gap_y );

		$overlay = $this->create_transparent_overlay( $img_w, $img_h );
		for ( $y = 0; $y < $img_h; $y += $step_y ) {
			for ( $x = 0; $x < $img_w; $x += $step_x ) {
				imagecopy( $overlay, $resized, $x, $y, 0, 0, $new_logo_w, $new_logo_h );
			}
		}
		imagedestroy( $resized );

		$this->merge_overlay( $image, $overlay, $img_w, $img_h, $opacity );
		imagedestroy( $overlay );
		return true;
	}

	// ── GD helpers ────────────────────────────────────────────────────────────

	/** @return array{0: resource, 1: string}|WP_Error */
	private function load_image( string $path, string $mime ) {
		switch ( $mime ) {
			case 'image/jpeg':
			case 'image/jpg':
				$img  = @imagecreatefromjpeg( $path );
				$type = 'jpeg';
				break;
			case 'image/png':
				$img  = @imagecreatefrompng( $path );
				$type = 'png';
				if ( $img ) {
					imagealphablending( $img, true );
					imagesavealpha( $img, true );
				}
				break;
			case 'image/gif':
				$img  = @imagecreatefromgif( $path );
				$type = 'gif';
				break;
			case 'image/webp':
				if ( ! function_exists( 'imagecreatefromwebp' ) ) {
					return new WP_Error( 'unsupported', 'WebP not supported by this GD build.' );
				}
				$img  = @imagecreatefromwebp( $path );
				$type = 'webp';
				break;
			default:
				return new WP_Error( 'unsupported', 'Unsupported image type: ' . $mime );
		}

		if ( ! $img ) {
			return new WP_Error( 'load_failed', 'GD could not load the image.' );
		}
		return [ $img, $type ];
	}

	private function save_image( $image, string $path, string $type, int $quality = 90 ): bool {
		switch ( $type ) {
			case 'jpeg': return imagejpeg( $image, $path, $quality );
			case 'png':  return imagepng(  $image, $path );
			case 'gif':  return imagegif(  $image, $path );
			case 'webp': return imagewebp( $image, $path, $quality );
		}
		return false;
	}

	/** Create a fully transparent true-colour image of given dimensions. */
	private function create_transparent_overlay( int $w, int $h ) {
		$overlay = imagecreatetruecolor( $w, $h );
		imagealphablending( $overlay, false );
		imagesavealpha( $overlay, true );
		$trans = imagecolorallocatealpha( $overlay, 0, 0, 0, 127 );
		imagefill( $overlay, 0, 0, $trans );
		imagealphablending( $overlay, true );
		return $overlay;
	}

	/**
	 * Alpha-aware compositing with opacity control.
	 * $dst_x / $dst_y default to 0 (full-image overlay).
	 */
	private function merge_overlay( $dst, $src, int $src_w, int $src_h, int $pct, int $dst_x = 0, int $dst_y = 0 ): void {
		if ( $pct <= 0 ) {
			return;
		}

		$factor = $pct / 100.0;

		// Clone source and scale each pixel's alpha by the opacity factor
		$tmp = imagecreatetruecolor( $src_w, $src_h );
		imagealphablending( $tmp, false );
		imagesavealpha( $tmp, true );
		$trans = imagecolorallocatealpha( $tmp, 0, 0, 0, 127 );
		imagefill( $tmp, 0, 0, $trans );
		imagecopy( $tmp, $src, 0, 0, 0, 0, $src_w, $src_h );

		for ( $y = 0; $y < $src_h; $y++ ) {
			for ( $x = 0; $x < $src_w; $x++ ) {
				$c     = imagecolorat( $tmp, $x, $y );
				$alpha = ( $c >> 24 ) & 0x7F; // 0=opaque, 127=transparent
				$new_a = 127 - (int) round( ( 127 - $alpha ) * $factor );
				$r     = ( $c >> 16 ) & 0xFF;
				$g     = ( $c >> 8  ) & 0xFF;
				$b     = $c           & 0xFF;
				imagesetpixel( $tmp, $x, $y, imagecolorallocatealpha( $tmp, $r, $g, $b, $new_a ) );
			}
		}

		imagealphablending( $dst, true );
		imagecopy( $dst, $tmp, $dst_x, $dst_y, 0, 0, $src_w, $src_h );
		imagedestroy( $tmp );
	}

	// ── Position ──────────────────────────────────────────────────────────────

	/** Returns [x, y] top-left corner for placing the watermark element. */
	private function get_position_coords( int $img_w, int $img_h, int $elem_w, int $elem_h, string $position, int $padding ): array {
		switch ( $position ) {
			case 'top-left':      return [ $padding,                          $padding ];
			case 'top-center':    return [ ( $img_w - $elem_w ) / 2,          $padding ];
			case 'top-right':     return [ $img_w - $elem_w - $padding,       $padding ];
			case 'middle-left':   return [ $padding,                          ( $img_h - $elem_h ) / 2 ];
			case 'center':        return [ ( $img_w - $elem_w ) / 2,          ( $img_h - $elem_h ) / 2 ];
			case 'middle-right':  return [ $img_w - $elem_w - $padding,       ( $img_h - $elem_h ) / 2 ];
			case 'bottom-left':   return [ $padding,                          $img_h - $elem_h - $padding ];
			case 'bottom-center': return [ ( $img_w - $elem_w ) / 2,          $img_h - $elem_h - $padding ];
			default:              return [ $img_w - $elem_w - $padding,       $img_h - $elem_h - $padding ]; // bottom-right
		}
	}

	// ── Utilities ─────────────────────────────────────────────────────────────

	private function detect_font(): ?string {
		$settings = WP_Watermark_Pro::get_settings();
		if ( ! empty( $settings['custom_font_path'] ) && file_exists( $settings['custom_font_path'] ) ) {
			return $settings['custom_font_path'];
		}

		$candidates = [
			// Linux
			'/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
			'/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf',
			'/usr/share/fonts/truetype/freefont/FreeSans.ttf',
			'/usr/share/fonts/truetype/ubuntu/Ubuntu-R.ttf',
			'/usr/share/fonts/TTF/DejaVuSans.ttf',
			'/usr/share/fonts/dejavu/DejaVuSans.ttf',
			// macOS
			'/Library/Fonts/Arial.ttf',
			'/System/Library/Fonts/Supplemental/Arial.ttf',
			'/System/Library/Fonts/Helvetica.ttc',
			// Windows
			'C:/Windows/Fonts/arial.ttf',
			'C:/Windows/Fonts/calibri.ttf',
		];

		foreach ( $candidates as $path ) {
			if ( file_exists( $path ) ) {
				return $path;
			}
		}
		return null;
	}

	private function parse_placeholders( string $text ): string {
		return str_replace(
			[ '{year}', '{site_name}', '{site_url}' ],
			[ gmdate( 'Y' ), get_bloginfo( 'name' ), get_bloginfo( 'url' ) ],
			$text
		);
	}

	/** @return int[] [r, g, b] */
	private function hex2rgb( string $hex ): array {
		$hex = ltrim( $hex, '#' );
		if ( strlen( $hex ) === 3 ) {
			$hex = $hex[0] . $hex[0] . $hex[1] . $hex[1] . $hex[2] . $hex[2];
		}
		return [
			hexdec( substr( $hex, 0, 2 ) ),
			hexdec( substr( $hex, 2, 2 ) ),
			hexdec( substr( $hex, 4, 2 ) ),
		];
	}

	private function clamp( int $value, int $min, int $max ): int {
		return max( $min, min( $max, $value ) );
	}

	private function create_backup( string $file_path ) {
		$backup = $this->get_backup_path( $file_path );
		if ( file_exists( $backup ) ) {
			return $backup; // already backed up
		}
		if ( ! copy( $file_path, $backup ) ) {
			return new WP_Error( 'backup_failed', 'Could not create backup for ' . basename( $file_path ) );
		}
		return $backup;
	}

	public function get_backup_path( string $file_path ): string {
		$info = pathinfo( $file_path );
		return $info['dirname'] . '/' . $info['filename'] . '-original.' . $info['extension'];
	}
}
