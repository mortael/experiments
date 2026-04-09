<?php
defined( 'ABSPATH' ) || exit;

/**
 * Admin UI, settings, AJAX handlers, and media-library integration.
 */
class WP_Watermark_Admin {

	private static ?WP_Watermark_Admin $instance = null;

	public static function get_instance(): self {
		if ( null === self::$instance ) {
			self::$instance = new self();
		}
		return self::$instance;
	}

	private function __construct() {
		add_action( 'admin_menu',                [ $this, 'register_menu' ] );
		add_action( 'admin_enqueue_scripts',     [ $this, 'enqueue_assets' ] );
		add_action( 'admin_post_wpwm_settings',  [ $this, 'save_general_settings' ] );

		// AJAX
		add_action( 'wp_ajax_wpwm_save_preset',       [ $this, 'ajax_save_preset' ] );
		add_action( 'wp_ajax_wpwm_delete_preset',     [ $this, 'ajax_delete_preset' ] );
		add_action( 'wp_ajax_wpwm_apply_single',      [ $this, 'ajax_apply_single' ] );
		add_action( 'wp_ajax_wpwm_apply_batch',       [ $this, 'ajax_apply_batch' ] );
		add_action( 'wp_ajax_wpwm_restore_original',  [ $this, 'ajax_restore_original' ] );
		add_action( 'wp_ajax_wpwm_get_image_ids',     [ $this, 'ajax_get_image_ids' ] );

		// Media library
		add_filter( 'bulk_actions-upload',             [ $this, 'add_media_bulk_action' ] );
		add_filter( 'handle_bulk_actions-upload',      [ $this, 'handle_media_bulk_action' ], 10, 3 );
		add_filter( 'media_row_actions',               [ $this, 'add_media_row_actions' ], 10, 2 );
		add_action( 'admin_notices',                   [ $this, 'bulk_action_notice' ] );
		add_action( 'admin_init',                      [ $this, 'maybe_handle_row_action' ] );
	}

	// ── Menu ─────────────────────────────────────────────────────────────────

	public function register_menu(): void {
		add_media_page(
			'WP Watermark Pro',
			'Watermark',
			'manage_options',
			'wp-watermark-pro',
			[ $this, 'render_page' ]
		);
	}

	// ── Assets ────────────────────────────────────────────────────────────────

	public function enqueue_assets( string $hook ): void {
		if ( 'media_page_wp-watermark-pro' !== $hook ) {
			return;
		}

		wp_enqueue_media();
		wp_enqueue_style( 'wp-color-picker' );
		wp_enqueue_script( 'wp-color-picker' );

		wp_enqueue_style(
			'wpwm-admin',
			WPWM_PLUGIN_URL . 'assets/css/admin.css',
			[],
			WPWM_VERSION
		);
		wp_enqueue_script(
			'wpwm-admin',
			WPWM_PLUGIN_URL . 'assets/js/admin.js',
			[ 'jquery', 'wp-color-picker' ],
			WPWM_VERSION,
			true
		);
		wp_localize_script( 'wpwm-admin', 'wpwm', [
			'ajax_url'   => admin_url( 'admin-ajax.php' ),
			'nonce'      => wp_create_nonce( 'wpwm_nonce' ),
			'preset_ids' => array_keys( WP_Watermark_Pro::get_presets() ),
			'strings'    => [
				'confirm_delete'  => __( 'Delete this preset?', 'wp-watermark-pro' ),
				'confirm_restore' => __( 'Restore original? This will remove the watermark.', 'wp-watermark-pro' ),
				'processing'      => __( 'Processing…', 'wp-watermark-pro' ),
				'done'            => __( 'Done!', 'wp-watermark-pro' ),
				'select_logo'     => __( 'Select Logo', 'wp-watermark-pro' ),
			],
		] );

		// Pass full preset data for the JS editor
		$presets_for_js = [];
		foreach ( WP_Watermark_Pro::get_presets() as $id => $p ) {
			$presets_for_js[ $id ] = $p;
			if ( ! empty( $p['logo_id'] ) ) {
				$presets_for_js[ $id ]['logo_preview_url'] = wp_get_attachment_thumb_url( $p['logo_id'] );
			}
		}
		wp_add_inline_script(
			'wpwm-admin',
			'window.wpwmPresets = ' . wp_json_encode( $presets_for_js ) . ';',
			'before'
		);
	}

	// ── Main page ─────────────────────────────────────────────────────────────

	public function render_page(): void {
		if ( ! current_user_can( 'manage_options' ) ) {
			return;
		}
		$active_tab = sanitize_key( $_GET['tab'] ?? 'general' );
		?>
		<div class="wrap wpwm-wrap">
			<h1><?php esc_html_e( 'WP Watermark Pro', 'wp-watermark-pro' ); ?></h1>

			<nav class="nav-tab-wrapper">
				<?php
				$tabs = [
					'general' => __( 'General Settings', 'wp-watermark-pro' ),
					'presets' => __( 'Manage Presets', 'wp-watermark-pro' ),
					'apply'   => __( 'Batch Apply', 'wp-watermark-pro' ),
				];
				foreach ( $tabs as $slug => $label ) {
					$url   = add_query_arg( [ 'page' => 'wp-watermark-pro', 'tab' => $slug ], admin_url( 'upload.php' ) );
					$class = $active_tab === $slug ? 'nav-tab nav-tab-active' : 'nav-tab';
					printf( '<a href="%s" class="%s">%s</a>', esc_url( $url ), esc_attr( $class ), esc_html( $label ) );
				}
				?>
			</nav>

			<div class="wpwm-tab-content">
				<?php
				if ( $active_tab === 'general' ) {
					$this->render_general_tab();
				} elseif ( $active_tab === 'presets' ) {
					$this->render_presets_tab();
				} elseif ( $active_tab === 'apply' ) {
					$this->render_apply_tab();
				}
				?>
			</div>
		</div>
		<?php
	}

	// ── General settings tab ──────────────────────────────────────────────────

	private function render_general_tab(): void {
		$s       = WP_Watermark_Pro::get_settings();
		$presets = WP_Watermark_Pro::get_presets();
		?>
		<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>">
			<?php wp_nonce_field( 'wpwm_save_settings', 'wpwm_settings_nonce' ); ?>
			<input type="hidden" name="action" value="wpwm_settings">

			<table class="form-table" role="presentation">
				<tr>
					<th><?php esc_html_e( 'Auto-watermark on upload', 'wp-watermark-pro' ); ?></th>
					<td>
						<label>
							<input type="checkbox" name="auto_watermark" value="1" <?php checked( ! empty( $s['auto_watermark'] ) ); ?>>
							<?php esc_html_e( 'Automatically apply watermark to every newly uploaded image', 'wp-watermark-pro' ); ?>
						</label>
					</td>
				</tr>
				<tr>
					<th><?php esc_html_e( 'Default preset', 'wp-watermark-pro' ); ?></th>
					<td>
						<select name="default_preset">
							<option value=""><?php esc_html_e( '— None —', 'wp-watermark-pro' ); ?></option>
							<?php foreach ( $presets as $id => $preset ) : ?>
								<option value="<?php echo esc_attr( $id ); ?>" <?php selected( ( $s['default_preset'] ?? '' ), $id ); ?>>
									<?php echo esc_html( $preset['name'] ); ?>
								</option>
							<?php endforeach; ?>
						</select>
						<p class="description"><?php esc_html_e( 'Used for auto-watermark and as the pre-selected option in Batch Apply.', 'wp-watermark-pro' ); ?></p>
					</td>
				</tr>
				<tr>
					<th><?php esc_html_e( 'Backup originals', 'wp-watermark-pro' ); ?></th>
					<td>
						<label>
							<input type="checkbox" name="backup_originals" value="1" <?php checked( ! empty( $s['backup_originals'] ) ); ?>>
							<?php esc_html_e( 'Save a copy of the original image before watermarking (e.g. photo-original.jpg)', 'wp-watermark-pro' ); ?>
						</label>
					</td>
				</tr>
				<tr>
					<th><?php esc_html_e( 'Custom TTF font path', 'wp-watermark-pro' ); ?></th>
					<td>
						<input type="text" name="custom_font_path" class="regular-text"
							value="<?php echo esc_attr( $s['custom_font_path'] ?? '' ); ?>"
							placeholder="/path/to/font.ttf">
						<p class="description"><?php esc_html_e( 'Leave blank to use an auto-detected system font. Required for text watermarks with size/rotation control.', 'wp-watermark-pro' ); ?></p>
					</td>
				</tr>
			</table>

			<?php submit_button( __( 'Save Settings', 'wp-watermark-pro' ) ); ?>
		</form>
		<?php
	}

	public function save_general_settings(): void {
		check_admin_referer( 'wpwm_save_settings', 'wpwm_settings_nonce' );
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( -1 );
		}

		$s = WP_Watermark_Pro::get_settings();

		$s['auto_watermark']   = ! empty( $_POST['auto_watermark'] );
		$s['backup_originals'] = ! empty( $_POST['backup_originals'] );
		$s['default_preset']   = sanitize_key( $_POST['default_preset'] ?? '' );
		$s['custom_font_path'] = sanitize_text_field( $_POST['custom_font_path'] ?? '' );

		WP_Watermark_Pro::save_settings( $s );
		wp_redirect( add_query_arg( [ 'page' => 'wp-watermark-pro', 'tab' => 'general', 'updated' => '1' ], admin_url( 'upload.php' ) ) );
		exit;
	}

	// ── Presets tab ───────────────────────────────────────────────────────────

	private function render_presets_tab(): void {
		$presets = WP_Watermark_Pro::get_presets();
		?>
		<div class="wpwm-presets-header">
			<button type="button" class="button button-primary" id="wpwm-add-preset">
				+ <?php esc_html_e( 'New Preset', 'wp-watermark-pro' ); ?>
			</button>
		</div>

		<div id="wpwm-preset-editor" class="wpwm-card" style="display:none;">
			<?php $this->render_preset_form(); ?>
		</div>

		<div id="wpwm-presets-list">
			<?php if ( empty( $presets ) ) : ?>
				<p><?php esc_html_e( 'No presets yet. Click "New Preset" to create one.', 'wp-watermark-pro' ); ?></p>
			<?php else : ?>
				<?php foreach ( $presets as $preset ) : ?>
					<?php $this->render_preset_card( $preset ); ?>
				<?php endforeach; ?>
			<?php endif; ?>
		</div>
		<?php
	}

	private function render_preset_card( array $p ): void {
		$type_label = $p['type'] === 'text' ? __( 'Text', 'wp-watermark-pro' ) : __( 'Logo', 'wp-watermark-pro' );
		?>
		<div class="wpwm-card wpwm-preset-card" data-id="<?php echo esc_attr( $p['id'] ); ?>">
			<div class="wpwm-preset-card-header">
				<strong><?php echo esc_html( $p['name'] ); ?></strong>
				<span class="wpwm-badge wpwm-badge-<?php echo esc_attr( $p['type'] ); ?>"><?php echo esc_html( $type_label ); ?></span>
				<span class="wpwm-badge"><?php echo esc_html( ucwords( str_replace( '-', ' ', $p['position'] ?? 'bottom-right' ) ) ); ?></span>
				<span class="wpwm-badge"><?php echo esc_html( ( $p['opacity'] ?? 70 ) . '% opacity' ); ?></span>
			</div>
			<div class="wpwm-preset-card-actions">
				<button type="button" class="button wpwm-edit-preset"><?php esc_html_e( 'Edit', 'wp-watermark-pro' ); ?></button>
				<button type="button" class="button button-link-delete wpwm-delete-preset"><?php esc_html_e( 'Delete', 'wp-watermark-pro' ); ?></button>
			</div>
		</div>
		<?php
	}

	private function render_preset_form( array $p = [] ): void {
		$positions = [
			'top-left'      => __( 'Top Left', 'wp-watermark-pro' ),
			'top-center'    => __( 'Top Center', 'wp-watermark-pro' ),
			'top-right'     => __( 'Top Right', 'wp-watermark-pro' ),
			'middle-left'   => __( 'Mid Left', 'wp-watermark-pro' ),
			'center'        => __( 'Center', 'wp-watermark-pro' ),
			'middle-right'  => __( 'Mid Right', 'wp-watermark-pro' ),
			'bottom-left'   => __( 'Bottom Left', 'wp-watermark-pro' ),
			'bottom-center' => __( 'Bottom Center', 'wp-watermark-pro' ),
			'bottom-right'  => __( 'Bottom Right', 'wp-watermark-pro' ),
		];
		$current_pos = $p['position'] ?? 'bottom-right';
		$is_text     = empty( $p['type'] ) || $p['type'] === 'text';
		?>
		<h3 id="wpwm-editor-title"><?php esc_html_e( 'New Preset', 'wp-watermark-pro' ); ?></h3>
		<input type="hidden" id="wpwm-preset-id" value="<?php echo esc_attr( $p['id'] ?? '' ); ?>">

		<table class="form-table" role="presentation">
			<tr>
				<th><?php esc_html_e( 'Preset name', 'wp-watermark-pro' ); ?></th>
				<td><input type="text" id="wpwm-f-name" class="regular-text" value="<?php echo esc_attr( $p['name'] ?? '' ); ?>"></td>
			</tr>
			<tr>
				<th><?php esc_html_e( 'Watermark type', 'wp-watermark-pro' ); ?></th>
				<td>
					<label><input type="radio" name="wpwm_type" value="text" <?php checked( $is_text ); ?>> <?php esc_html_e( 'Text', 'wp-watermark-pro' ); ?></label>
					&nbsp;&nbsp;
					<label><input type="radio" name="wpwm_type" value="image" <?php checked( ! $is_text ); ?>> <?php esc_html_e( 'Logo / Image', 'wp-watermark-pro' ); ?></label>
				</td>
			</tr>
		</table>

		<!-- Text fields -->
		<div id="wpwm-text-fields" <?php echo $is_text ? '' : 'style="display:none"'; ?>>
			<table class="form-table" role="presentation">
				<tr>
					<th><?php esc_html_e( 'Text', 'wp-watermark-pro' ); ?></th>
					<td>
						<input type="text" id="wpwm-f-text" class="regular-text" value="<?php echo esc_attr( $p['text'] ?? '© {year} {site_name}' ); ?>">
						<p class="description"><?php esc_html_e( 'Supports: {year}, {site_name}, {site_url}', 'wp-watermark-pro' ); ?></p>
					</td>
				</tr>
				<tr>
					<th><?php esc_html_e( 'Font size (px)', 'wp-watermark-pro' ); ?></th>
					<td>
						<input type="number" id="wpwm-f-font-size" class="small-text" value="<?php echo esc_attr( $p['font_size'] ?? 24 ); ?>" min="6" max="300">
					</td>
				</tr>
				<tr>
					<th><?php esc_html_e( 'Font color', 'wp-watermark-pro' ); ?></th>
					<td><input type="text" id="wpwm-f-font-color" class="wpwm-color" value="<?php echo esc_attr( $p['font_color'] ?? '#ffffff' ); ?>"></td>
				</tr>
				<tr>
					<th><?php esc_html_e( 'Text shadow', 'wp-watermark-pro' ); ?></th>
					<td>
						<label><input type="checkbox" id="wpwm-f-shadow" <?php checked( ! empty( $p['shadow'] ) ); ?>> <?php esc_html_e( 'Enable shadow', 'wp-watermark-pro' ); ?></label>
						<span id="wpwm-shadow-opts" <?php echo empty( $p['shadow'] ) ? 'style="display:none"' : ''; ?>>
							&nbsp;
							<input type="text" id="wpwm-f-shadow-color" class="wpwm-color wpwm-color-small" value="<?php echo esc_attr( $p['shadow_color'] ?? '#000000' ); ?>">
							&nbsp;<?php esc_html_e( 'Offset', 'wp-watermark-pro' ); ?>:
							<input type="number" id="wpwm-f-shadow-offset" class="small-text" value="<?php echo esc_attr( $p['shadow_offset'] ?? 2 ); ?>" min="1" max="20">px
						</span>
					</td>
				</tr>
				<tr>
					<th><?php esc_html_e( 'Rotation (°)', 'wp-watermark-pro' ); ?></th>
					<td>
						<input type="number" id="wpwm-f-rotation" class="small-text" value="<?php echo esc_attr( $p['rotation'] ?? 0 ); ?>" min="-360" max="360">
						<p class="description"><?php esc_html_e( 'e.g. -30 for diagonal stamp look.', 'wp-watermark-pro' ); ?></p>
					</td>
				</tr>
			</table>
		</div>

		<!-- Image / logo fields -->
		<div id="wpwm-image-fields" <?php echo $is_text ? 'style="display:none"' : ''; ?>>
			<table class="form-table" role="presentation">
				<tr>
					<th><?php esc_html_e( 'Logo image', 'wp-watermark-pro' ); ?></th>
					<td>
						<div id="wpwm-logo-preview">
							<?php if ( ! empty( $p['logo_id'] ) ) : ?>
								<?php echo wp_get_attachment_image( $p['logo_id'], [ 80, 80 ] ); ?>
							<?php endif; ?>
						</div>
						<input type="hidden" id="wpwm-f-logo-id" value="<?php echo esc_attr( $p['logo_id'] ?? 0 ); ?>">
						<button type="button" class="button" id="wpwm-upload-logo"><?php esc_html_e( 'Select Logo', 'wp-watermark-pro' ); ?></button>
						<button type="button" class="button button-link wpwm-remove-logo" <?php echo empty( $p['logo_id'] ) ? 'style="display:none"' : ''; ?>>
							<?php esc_html_e( 'Remove', 'wp-watermark-pro' ); ?>
						</button>
						<p class="description"><?php esc_html_e( 'PNG with transparency recommended.', 'wp-watermark-pro' ); ?></p>
					</td>
				</tr>
				<tr>
					<th><?php esc_html_e( 'Logo width (% of image)', 'wp-watermark-pro' ); ?></th>
					<td>
						<input type="range" id="wpwm-f-logo-width" min="1" max="80" value="<?php echo esc_attr( $p['logo_width'] ?? 20 ); ?>">
						<span id="wpwm-logo-width-val"><?php echo esc_html( $p['logo_width'] ?? 20 ); ?></span>%
					</td>
				</tr>
			</table>
		</div>

		<!-- Shared fields -->
		<table class="form-table" role="presentation">
			<tr>
				<th><?php esc_html_e( 'Position', 'wp-watermark-pro' ); ?></th>
				<td>
					<div class="wpwm-position-grid">
						<?php foreach ( $positions as $pos_key => $pos_label ) : ?>
							<button type="button"
								class="wpwm-pos-btn <?php echo $pos_key === $current_pos ? 'active' : ''; ?>"
								data-pos="<?php echo esc_attr( $pos_key ); ?>"
								title="<?php echo esc_attr( $pos_label ); ?>">
							</button>
						<?php endforeach; ?>
					</div>
					<input type="hidden" id="wpwm-f-position" value="<?php echo esc_attr( $current_pos ); ?>">
					<p class="description wpwm-pos-label"><?php echo esc_html( $positions[ $current_pos ] ); ?></p>
				</td>
			</tr>
			<tr>
				<th><?php esc_html_e( 'Edge padding (px)', 'wp-watermark-pro' ); ?></th>
				<td><input type="number" id="wpwm-f-padding" class="small-text" value="<?php echo esc_attr( $p['padding'] ?? 20 ); ?>" min="0" max="500"></td>
			</tr>
			<tr>
				<th><?php esc_html_e( 'Opacity (%)', 'wp-watermark-pro' ); ?></th>
				<td>
					<input type="range" id="wpwm-f-opacity" min="0" max="100" value="<?php echo esc_attr( $p['opacity'] ?? 70 ); ?>">
					<span id="wpwm-opacity-val"><?php echo esc_html( $p['opacity'] ?? 70 ); ?></span>%
				</td>
			</tr>
		</table>

		<p class="wpwm-editor-actions">
			<button type="button" class="button button-primary" id="wpwm-save-preset"><?php esc_html_e( 'Save Preset', 'wp-watermark-pro' ); ?></button>
			<button type="button" class="button" id="wpwm-cancel-preset"><?php esc_html_e( 'Cancel', 'wp-watermark-pro' ); ?></button>
			<span class="wpwm-spinner spinner"></span>
			<span class="wpwm-status"></span>
		</p>
		<?php
	}

	// ── Batch apply tab ───────────────────────────────────────────────────────

	private function render_apply_tab(): void {
		$presets  = WP_Watermark_Pro::get_presets();
		$settings = WP_Watermark_Pro::get_settings();
		?>
		<div class="wpwm-card">
			<h3><?php esc_html_e( 'Apply Watermark to Existing Images', 'wp-watermark-pro' ); ?></h3>

			<table class="form-table" role="presentation">
				<tr>
					<th><?php esc_html_e( 'Preset', 'wp-watermark-pro' ); ?></th>
					<td>
						<select id="wpwm-batch-preset">
							<?php foreach ( $presets as $id => $preset ) : ?>
								<option value="<?php echo esc_attr( $id ); ?>" <?php selected( ( $settings['default_preset'] ?? '' ), $id ); ?>>
									<?php echo esc_html( $preset['name'] ); ?>
								</option>
							<?php endforeach; ?>
						</select>
					</td>
				</tr>
				<tr>
					<th><?php esc_html_e( 'Apply to', 'wp-watermark-pro' ); ?></th>
					<td>
						<label><input type="radio" name="wpwm_scope" value="all" checked> <?php esc_html_e( 'All images in media library', 'wp-watermark-pro' ); ?></label><br>
						<label><input type="radio" name="wpwm_scope" value="range"> <?php esc_html_e( 'Images uploaded between:', 'wp-watermark-pro' ); ?></label>
						<span id="wpwm-date-range" style="display:none;">
							<input type="date" id="wpwm-date-from"> &ndash; <input type="date" id="wpwm-date-to">
						</span>
					</td>
				</tr>
				<tr>
					<th></th>
					<td>
						<label>
							<input type="checkbox" id="wpwm-skip-watermarked" checked>
							<?php esc_html_e( 'Skip already-watermarked images', 'wp-watermark-pro' ); ?>
						</label>
					</td>
				</tr>
			</table>

			<p>
				<button type="button" class="button button-primary button-hero" id="wpwm-start-batch">
					<?php esc_html_e( 'Apply Watermarks', 'wp-watermark-pro' ); ?>
				</button>
				<button type="button" class="button button-hero" id="wpwm-cancel-batch" style="display:none;">
					<?php esc_html_e( 'Cancel', 'wp-watermark-pro' ); ?>
				</button>
			</p>

			<div id="wpwm-batch-progress" style="display:none;">
				<div class="wpwm-progress-bar">
					<div class="wpwm-progress-fill" style="width:0%"></div>
				</div>
				<p class="wpwm-progress-text">0 / 0</p>
			</div>

			<div id="wpwm-batch-results" style="display:none;">
				<h4><?php esc_html_e( 'Results', 'wp-watermark-pro' ); ?></h4>
				<ul id="wpwm-batch-result-list"></ul>
			</div>
		</div>
		<?php
	}

	// ── AJAX handlers ─────────────────────────────────────────────────────────

	public function ajax_save_preset(): void {
		check_ajax_referer( 'wpwm_nonce', 'nonce' );
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_send_json_error( 'Permission denied.' );
		}

		$id   = sanitize_key( $_POST['preset_id'] ?? '' );
		$type = sanitize_key( $_POST['type'] ?? 'text' );

		if ( ! $id ) {
			$id = 'preset_' . uniqid();
		}

		$preset = [
			'id'       => $id,
			'name'     => sanitize_text_field( $_POST['name']     ?? '' ),
			'type'     => in_array( $type, [ 'text', 'image' ], true ) ? $type : 'text',
			'position' => sanitize_key( $_POST['position'] ?? 'bottom-right' ),
			'padding'  => (int) ( $_POST['padding']  ?? 20 ),
			'opacity'  => max( 0, min( 100, (int) ( $_POST['opacity'] ?? 70 ) ) ),
		];

		if ( $preset['name'] === '' ) {
			wp_send_json_error( 'Preset name is required.' );
		}

		if ( $type === 'text' ) {
			$preset['text']          = sanitize_text_field( $_POST['text']          ?? '© {year}' );
			$preset['font_size']     = max( 6, (int) ( $_POST['font_size']     ?? 24 ) );
			$preset['font_color']    = sanitize_hex_color( $_POST['font_color']    ?? '#ffffff' ) ?: '#ffffff';
			$preset['shadow']        = ! empty( $_POST['shadow'] );
			$preset['shadow_color']  = sanitize_hex_color( $_POST['shadow_color']  ?? '#000000' ) ?: '#000000';
			$preset['shadow_offset'] = max( 1, (int) ( $_POST['shadow_offset'] ?? 2 ) );
			$preset['rotation']      = (float) ( $_POST['rotation'] ?? 0 );
		} else {
			$preset['logo_id']    = (int) ( $_POST['logo_id']   ?? 0 );
			$preset['logo_width'] = max( 1, min( 80, (int) ( $_POST['logo_width'] ?? 20 ) ) );
		}

		WP_Watermark_Pro::save_preset( $preset );

		ob_start();
		$this->render_preset_card( $preset );
		$card_html = ob_get_clean();

		wp_send_json_success( [ 'preset' => $preset, 'card_html' => $card_html ] );
	}

	public function ajax_delete_preset(): void {
		check_ajax_referer( 'wpwm_nonce', 'nonce' );
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_send_json_error( 'Permission denied.' );
		}
		$id = sanitize_key( $_POST['preset_id'] ?? '' );
		if ( ! $id ) {
			wp_send_json_error( 'No preset ID.' );
		}
		WP_Watermark_Pro::delete_preset( $id );
		wp_send_json_success();
	}

	public function ajax_apply_single(): void {
		check_ajax_referer( 'wpwm_nonce', 'nonce' );
		if ( ! current_user_can( 'upload_files' ) ) {
			wp_send_json_error( 'Permission denied.' );
		}
		$attachment_id = (int) ( $_POST['attachment_id'] ?? 0 );
		$preset_id     = sanitize_key( $_POST['preset_id'] ?? '' );

		$result = ( new WP_Watermark_Processor() )->apply_watermark( $attachment_id, $preset_id );
		if ( is_wp_error( $result ) ) {
			wp_send_json_error( $result->get_error_message() );
		}
		wp_send_json_success( [ 'message' => 'Watermark applied.' ] );
	}

	public function ajax_apply_batch(): void {
		check_ajax_referer( 'wpwm_nonce', 'nonce' );
		if ( ! current_user_can( 'upload_files' ) ) {
			wp_send_json_error( 'Permission denied.' );
		}

		$ids       = array_map( 'intval', (array) ( $_POST['attachment_ids'] ?? [] ) );
		$preset_id = sanitize_key( $_POST['preset_id'] ?? '' );
		$processor = new WP_Watermark_Processor();
		$results   = [ 'success' => [], 'failed' => [] ];

		foreach ( $ids as $id ) {
			$r = $processor->apply_watermark( $id, $preset_id );
			if ( is_wp_error( $r ) ) {
				$results['failed'][] = [
					'id'      => $id,
					'message' => $r->get_error_message(),
					'title'   => get_the_title( $id ),
				];
			} else {
				$results['success'][] = [ 'id' => $id, 'title' => get_the_title( $id ) ];
			}
		}

		wp_send_json_success( $results );
	}

	public function ajax_restore_original(): void {
		check_ajax_referer( 'wpwm_nonce', 'nonce' );
		if ( ! current_user_can( 'upload_files' ) ) {
			wp_send_json_error( 'Permission denied.' );
		}
		$attachment_id = (int) ( $_POST['attachment_id'] ?? 0 );
		$result = ( new WP_Watermark_Processor() )->restore_original( $attachment_id );
		if ( is_wp_error( $result ) ) {
			wp_send_json_error( $result->get_error_message() );
		}
		wp_send_json_success( [ 'message' => 'Original restored.' ] );
	}

	public function ajax_get_image_ids(): void {
		check_ajax_referer( 'wpwm_nonce', 'nonce' );
		if ( ! current_user_can( 'upload_files' ) ) {
			wp_send_json_error( 'Permission denied.' );
		}

		$args = [
			'post_type'      => 'attachment',
			'post_mime_type' => 'image',
			'post_status'    => 'inherit',
			'posts_per_page' => -1,
			'fields'         => 'ids',
		];

		$from = sanitize_text_field( $_POST['date_from'] ?? '' );
		$to   = sanitize_text_field( $_POST['date_to']   ?? '' );
		if ( $from && $to ) {
			$args['date_query'] = [ [ 'after' => $from, 'before' => $to, 'inclusive' => true ] ];
		}

		if ( ! empty( $_POST['skip_watermarked'] ) ) {
			$args['meta_query'] = [ [ 'key' => '_wpwm_watermarked', 'compare' => 'NOT EXISTS' ] ];
		}

		$query = new WP_Query( $args );
		wp_send_json_success( [ 'ids' => $query->posts, 'total' => count( $query->posts ) ] );
	}

	// ── Media library integration ─────────────────────────────────────────────

	public function add_media_bulk_action( array $actions ): array {
		$actions['wpwm_apply'] = __( 'Apply Watermark', 'wp-watermark-pro' );
		return $actions;
	}

	public function handle_media_bulk_action( string $location, string $action, array $ids ): string {
		if ( 'wpwm_apply' !== $action ) {
			return $location;
		}
		$settings  = WP_Watermark_Pro::get_settings();
		$preset_id = $settings['default_preset'] ?? '';
		$processor = new WP_Watermark_Processor();
		$count     = 0;
		foreach ( $ids as $id ) {
			$r = $processor->apply_watermark( (int) $id, $preset_id );
			if ( ! is_wp_error( $r ) ) {
				$count++;
			}
		}
		return add_query_arg( 'wpwm_watermarked', $count, $location );
	}

	public function bulk_action_notice(): void {
		if ( ! empty( $_GET['wpwm_watermarked'] ) ) {
			$count = (int) $_GET['wpwm_watermarked'];
			printf(
				'<div class="notice notice-success is-dismissible"><p>%s</p></div>',
				/* translators: %d: number of images watermarked */
				esc_html( sprintf( _n( 'Watermark applied to %d image.', 'Watermark applied to %d images.', $count, 'wp-watermark-pro' ), $count ) )
			);
		}
	}

	public function add_media_row_actions( array $actions, \WP_Post $post ): array {
		if ( strpos( $post->post_mime_type, 'image/' ) !== 0 ) {
			return $actions;
		}

		$apply_url = wp_nonce_url(
			add_query_arg( [ 'action' => 'wpwm_row_apply', 'attachment_id' => $post->ID ], admin_url( 'upload.php' ) ),
			'wpwm_row_apply_' . $post->ID
		);
		$actions['wpwm_apply'] = '<a href="' . esc_url( $apply_url ) . '">' . __( 'Apply Watermark', 'wp-watermark-pro' ) . '</a>';

		if ( get_post_meta( $post->ID, '_wpwm_watermarked', true ) ) {
			$restore_url = wp_nonce_url(
				add_query_arg( [ 'action' => 'wpwm_row_restore', 'attachment_id' => $post->ID ], admin_url( 'upload.php' ) ),
				'wpwm_row_restore_' . $post->ID
			);
			$actions['wpwm_restore'] = '<a href="' . esc_url( $restore_url ) . '">' . __( 'Restore Original', 'wp-watermark-pro' ) . '</a>';
		}

		return $actions;
	}

	public function maybe_handle_row_action(): void {
		$this->handle_row_actions();
	}

	// Called via GET request from row action links (handled in admin_init)
	private function handle_row_actions(): void {
		$action = sanitize_key( $_GET['action'] ?? '' );
		if ( ! in_array( $action, [ 'wpwm_row_apply', 'wpwm_row_restore' ], true ) ) {
			return;
		}
		$id = (int) ( $_GET['attachment_id'] ?? 0 );
		if ( ! $id || ! current_user_can( 'upload_files' ) ) {
			return;
		}

		check_admin_referer( $action . '_' . $id );
		$processor = new WP_Watermark_Processor();

		if ( $action === 'wpwm_row_apply' ) {
			$settings  = WP_Watermark_Pro::get_settings();
			$preset_id = $settings['default_preset'] ?? '';
			$processor->apply_watermark( $id, $preset_id );
			$notice = 'wpwm_applied';
		} else {
			$processor->restore_original( $id );
			$notice = 'wpwm_restored';
		}

		wp_redirect( add_query_arg( $notice, 1, wp_get_referer() ?: admin_url( 'upload.php' ) ) );
		exit;
	}
}
