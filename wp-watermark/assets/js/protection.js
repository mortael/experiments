/**
 * WP Watermark Pro — Frontend Image Protection
 * Runs on the public site when protection is enabled.
 */
(function () {
	'use strict';

	var cfg = window.wpwmProtect || {};

	// ── Bootstrap ─────────────────────────────────────────────────────────────

	function init() {
		if (cfg.rightclick) enableRightClickBlock();
		if (cfg.drag)       enableDragBlock();
		if (cfg.keyboard)   enableKeyboardBlock();
		if (cfg.wrap_images) wrapAllImages();
		if (cfg.devtools)   startDevtoolsDetection();
	}

	// ── Right-click block ─────────────────────────────────────────────────────

	function enableRightClickBlock() {
		document.addEventListener('contextmenu', function (e) {
			var t = e.target;
			if (
				t.tagName === 'IMG' ||
				t.classList.contains('wpwm-img-shield') ||
				t.classList.contains('wpwm-img-wrap') ||
				closest(t, '.wpwm-img-wrap')
			) {
				e.preventDefault();
				showToast();
			}
		});
	}

	// ── Drag block ────────────────────────────────────────────────────────────

	function enableDragBlock() {
		document.addEventListener('dragstart', function (e) {
			if (e.target.tagName === 'IMG') {
				e.preventDefault();
			}
		});
		// Also block drag on shields
		document.addEventListener('mousedown', function (e) {
			if (e.target.classList.contains('wpwm-img-shield')) {
				e.preventDefault();
			}
		});
	}

	// ── Keyboard shortcuts block ──────────────────────────────────────────────

	function enableKeyboardBlock() {
		document.addEventListener('keydown', function (e) {
			var key = (e.key || '').toLowerCase();

			// F12 — DevTools
			if (e.key === 'F12') { e.preventDefault(); return; }

			// Ctrl / Cmd combos
			if (e.ctrlKey || e.metaKey) {
				// Ctrl+S — Save page
				if (key === 's') { e.preventDefault(); return; }
				// Ctrl+U — View source
				if (key === 'u') { e.preventDefault(); return; }

				if (e.shiftKey) {
					// Ctrl+Shift+I — Inspector
					// Ctrl+Shift+J — Console
					// Ctrl+Shift+C — Element picker
					if (key === 'i' || key === 'j' || key === 'c') {
						e.preventDefault();
					}
				}
			}
		});
	}

	// ── Image wrapping (JS-side, for dynamically-added images) ───────────────

	function wrapAllImages() {
		var imgs = document.querySelectorAll('img');
		imgs.forEach(function (img) {
			// Skip already-wrapped, avatars, emojis
			if (
				img.parentNode.classList.contains('wpwm-img-wrap') ||
				/(avatar|emoji|wp-smiley)/i.test(img.className + img.src)
			) return;

			var wrap = document.createElement('span');
			wrap.className = 'wpwm-img-wrap';

			img.parentNode.insertBefore(wrap, img);
			wrap.appendChild(img);

			var shield = document.createElement('span');
			shield.className = 'wpwm-img-shield';
			shield.setAttribute('aria-hidden', 'true');
			wrap.appendChild(shield);
		});
	}

	// ── DevTools detection ────────────────────────────────────────────────────
	// Uses window size heuristic: docked devtools shrinks the inner viewport.

	var devOpen = false;
	var THRESHOLD = 160;

	function checkDevtools() {
		var open =
			window.outerWidth  - window.innerWidth  > THRESHOLD ||
			window.outerHeight - window.innerHeight > THRESHOLD;

		if (open && !devOpen) {
			devOpen = true;
			onDevtoolsOpened();
		} else if (!open && devOpen) {
			devOpen = false;
			onDevtoolsClosed();
		}
	}

	function onDevtoolsOpened() {
		showToast();
		if (cfg.devtools_action === 'blur') {
			document.querySelectorAll('img').forEach(function (img) {
				img.classList.add('wpwm-devtools-blur');
			});
		}
		if (cfg.devtools_action === 'hide') {
			document.querySelectorAll('img').forEach(function (img) {
				img.classList.add('wpwm-devtools-hide');
			});
		}
	}

	function onDevtoolsClosed() {
		document.querySelectorAll('.wpwm-devtools-blur, .wpwm-devtools-hide').forEach(function (el) {
			el.classList.remove('wpwm-devtools-blur', 'wpwm-devtools-hide');
		});
	}

	function startDevtoolsDetection() {
		checkDevtools(); // run immediately
		setInterval(checkDevtools, 1000);
	}

	// ── Toast notification ────────────────────────────────────────────────────

	var toastTimer;

	function showToast() {
		var el = document.getElementById('wpwm-toast');
		if (!el) {
			el = document.createElement('div');
			el.id = 'wpwm-toast';
			el.setAttribute('role', 'status');
			el.setAttribute('aria-live', 'polite');
			document.body.appendChild(el);
		}
		el.textContent = cfg.message || 'Images on this site are protected.';
		el.classList.add('wpwm-toast-visible');

		clearTimeout(toastTimer);
		toastTimer = setTimeout(function () {
			el.classList.remove('wpwm-toast-visible');
		}, 2500);
	}

	// ── IE-safe closest polyfill ──────────────────────────────────────────────

	function closest(el, selector) {
		while (el && el !== document) {
			if (el.matches && el.matches(selector)) return el;
			el = el.parentNode;
		}
		return null;
	}

	// ── Run ───────────────────────────────────────────────────────────────────

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', init);
	} else {
		init();
	}
})();
