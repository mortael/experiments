<?php
defined( 'ABSPATH' ) || exit;

/**
 * Writes/removes hotlink-protection rules in the uploads .htaccess.
 * Works on Apache only (mod_rewrite).
 */
class WP_Watermark_Hotlink {

	private const MARKER = 'WP Watermark Pro Hotlink';

	/**
	 * Write (or remove) rules based on settings.
	 * Returns true on success, WP_Error on failure.
	 *
	 * @return true|WP_Error
	 */
	public function update_htaccess( array $cfg ) {
		$path = $this->htaccess_path();
		if ( ! $path ) {
			return new WP_Error( 'no_uploads', 'Could not determine uploads directory.' );
		}

		$existing = file_exists( $path ) ? ( file_get_contents( $path ) ?: '' ) : '';
		$clean    = $this->strip_block( $existing );

		if ( ! empty( $cfg['enabled'] ) ) {
			$block = $this->build_block( $cfg );
			$clean = $block . ( $clean !== '' ? "\n" . $clean : '' );
		}

		if ( file_put_contents( $path, $clean ) === false ) {
			return new WP_Error( 'write_failed', 'Could not write to ' . $path . '. Check file permissions.' );
		}
		return true;
	}

	/** Remove our block without changing anything else. */
	public function remove_htaccess(): void {
		$path = $this->htaccess_path();
		if ( ! $path || ! file_exists( $path ) ) {
			return;
		}
		$content = file_get_contents( $path ) ?: '';
		file_put_contents( $path, $this->strip_block( $content ) );
	}

	public function htaccess_path(): ?string {
		$upload = wp_upload_dir();
		return ! empty( $upload['basedir'] ) ? trailingslashit( $upload['basedir'] ) . '.htaccess' : null;
	}

	// ── Private ───────────────────────────────────────────────────────────────

	private function strip_block( string $content ): string {
		$m = preg_quote( self::MARKER, '/' );
		return preg_replace( '/# BEGIN ' . $m . '.*?# END ' . $m . '\n?/s', '', $content );
	}

	private function build_block( array $cfg ): string {
		$host = (string) wp_parse_url( site_url(), PHP_URL_HOST );
		$ext  = 'jpg|jpeg|png|gif|webp|svg';

		$lines = [
			'# BEGIN ' . self::MARKER,
			'<IfModule mod_rewrite.c>',
			'RewriteEngine On',
			// Always allow empty Referer (direct links, curl, RSS readers, etc.)
			'RewriteCond %{HTTP_REFERER} !^$',
			// Allow this site (www and non-www)
			sprintf( 'RewriteCond %%{HTTP_REFERER} !^https?://(www\.)?%s/ [NC]', preg_quote( $host, '/' ) ),
		];

		// User-supplied extra allowed domains (one per line)
		foreach ( array_filter( array_map( 'trim', explode( "\n", $cfg['allowed_domains'] ?? '' ) ) ) as $domain ) {
			$domain  = trim( $domain, '/' );
			$lines[] = sprintf( 'RewriteCond %%{HTTP_REFERER} !^https?://(www\.)?%s/ [NC]', preg_quote( $domain, '/' ) );
		}

		$action = $cfg['action'] ?? 'deny';
		if ( $action === 'redirect' && ! empty( $cfg['redirect_image'] ) ) {
			$lines[] = sprintf( 'RewriteRule \.(%s)$ %s [R=302,L,NC]', $ext, esc_url_raw( $cfg['redirect_image'] ) );
		} else {
			$lines[] = sprintf( 'RewriteRule \.(%s)$ - [F,L,NC]', $ext );
		}

		$lines[] = '</IfModule>';
		$lines[] = '# END ' . self::MARKER;

		return implode( "\n", $lines );
	}
}
