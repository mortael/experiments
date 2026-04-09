# WP Watermark Pro

A WordPress plugin that adds text or logo watermarks to images, with batch processing, backup/restore, and image-protection features.

## Features

- **Text watermarks** – configurable font size, colour, opacity, rotation, shadow, and position
- **Logo/image watermarks** – PNG with transparency recommended; scales proportionally
- **Presets** – save multiple named watermark configurations and switch between them
- **Live preview** – see how the watermark will look before saving a preset
- **Auto-watermark on upload** – automatically apply the default preset to every new image
- **Batch apply** – apply or re-apply a preset to all existing media-library images at once
- **Backup & restore** – keeps an original copy so you can revert at any time
- **Conditional rules** – skip already-watermarked images, enforce minimum dimensions, exclude file types
- **EXIF stripping** – re-encodes JPEGs via GD to remove GPS location and device metadata
- **Hotlink protection** – writes Apache `mod_rewrite` rules to block external image embedding
- **Frontend image protection** – blocks right-click, drag, keyboard shortcuts, and DevTools access
- **WooCommerce integration** – auto-watermark product featured images and gallery images

## Requirements

- WordPress 5.8+
- PHP 7.4+
- PHP `gd` extension

## Installation

1. Copy the `wp-watermark` folder to `wp-content/plugins/`.
2. Activate the plugin in **Plugins → Installed Plugins**.
3. Navigate to **Media → Watermark** to configure presets and settings.

## Directory structure

```
wp-watermark/
├── wp-watermark.php                       # Plugin bootstrap
├── assets/
│   ├── css/
│   │   ├── admin.css                      # Admin UI styles
│   │   └── protection.css                 # Frontend protection styles
│   └── js/
│       ├── admin.js                       # Admin UI scripts
│       └── protection.js                  # Frontend protection scripts
└── includes/
    ├── class-watermark-admin.php          # Admin menu, settings pages, AJAX handlers
    ├── class-watermark-processor.php      # GD-based image watermarking engine
    ├── class-watermark-protection.php     # Frontend protection layer
    ├── class-watermark-hotlink.php        # Apache .htaccess hotlink rules
    └── class-watermark-woocommerce.php    # WooCommerce product-image integration
```
