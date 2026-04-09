/* global jQuery, wpwm, wp */
(function ($) {
    'use strict';

    // ── Helpers ───────────────────────────────────────────────────────────────

    function ajax(action, data, done, fail) {
        return $.post(wpwm.ajax_url, $.extend({ action: action, nonce: wpwm.nonce }, data))
            .done(function (res) {
                if (res.success) {
                    done && done(res.data);
                } else {
                    fail && fail(res.data || 'Unknown error');
                }
            })
            .fail(function () { fail && fail('AJAX request failed.'); });
    }

    // ── Color pickers ─────────────────────────────────────────────────────────

    function initColorPickers() {
        $('.wpwm-color').wpColorPicker();
    }

    // ── Preset type toggle ────────────────────────────────────────────────────

    function bindTypeToggle() {
        $(document).on('change', 'input[name="wpwm_type"]', function () {
            var val = $(this).val();
            $('#wpwm-text-fields').toggle(val === 'text');
            $('#wpwm-image-fields').toggle(val === 'image');
        });
    }

    // ── Position picker ───────────────────────────────────────────────────────

    var posLabels = {
        'top-left': 'Top Left', 'top-center': 'Top Center', 'top-right': 'Top Right',
        'middle-left': 'Mid Left', 'center': 'Center', 'middle-right': 'Mid Right',
        'bottom-left': 'Bottom Left', 'bottom-center': 'Bottom Center', 'bottom-right': 'Bottom Right'
    };

    function bindPositionPicker() {
        $(document).on('click', '.wpwm-pos-btn', function () {
            var pos = $(this).data('pos');
            $(this).closest('.wpwm-position-grid').find('.wpwm-pos-btn').removeClass('active');
            $(this).addClass('active');
            $('#wpwm-f-position').val(pos);
            $(this).closest('td').find('.wpwm-pos-label').text(posLabels[pos] || pos);
        });
    }

    // ── Range slider live values ──────────────────────────────────────────────

    function bindSliders() {
        $(document).on('input', '#wpwm-f-opacity',    function () { $('#wpwm-opacity-val').text(this.value); });
        $(document).on('input', '#wpwm-f-logo-width', function () { $('#wpwm-logo-width-val').text(this.value); });
    }

    // ── Shadow checkbox toggle ────────────────────────────────────────────────

    function bindShadowToggle() {
        $(document).on('change', '#wpwm-f-shadow', function () {
            $('#wpwm-shadow-opts').toggle(this.checked);
        });
    }

    // ── Date range toggle (batch apply tab) ──────────────────────────────────

    function bindDateRange() {
        $(document).on('change', 'input[name="wpwm_scope"]', function () {
            $('#wpwm-date-range').toggle($(this).val() === 'range');
        });
    }

    // ── Logo uploader ─────────────────────────────────────────────────────────

    var logoFrame;
    function bindLogoUploader() {
        $(document).on('click', '#wpwm-upload-logo', function (e) {
            e.preventDefault();
            if (logoFrame) { logoFrame.open(); return; }
            logoFrame = wp.media({
                title: wpwm.strings.select_logo,
                button: { text: wpwm.strings.select_logo },
                multiple: false,
                library: { type: 'image' }
            });
            logoFrame.on('select', function () {
                var att = logoFrame.state().get('selection').first().toJSON();
                $('#wpwm-f-logo-id').val(att.id);
                var src = (att.sizes && att.sizes.thumbnail) ? att.sizes.thumbnail.url : att.url;
                $('#wpwm-logo-preview').html('<img src="' + src + '" alt="">');
                $('.wpwm-remove-logo').show();
            });
            logoFrame.open();
        });

        $(document).on('click', '.wpwm-remove-logo', function (e) {
            e.preventDefault();
            $('#wpwm-f-logo-id').val('0');
            $('#wpwm-logo-preview').html('');
            $(this).hide();
        });
    }

    // ── Preset editor open/close ──────────────────────────────────────────────

    function buildPresetData() {
        var type = $('input[name="wpwm_type"]:checked').val();
        var data = {
            preset_id:    $('#wpwm-preset-id').val(),
            name:         $('#wpwm-f-name').val(),
            type:         type,
            position:     $('#wpwm-f-position').val(),
            padding:      $('#wpwm-f-padding').val(),
            opacity:      $('#wpwm-f-opacity').val(),
        };
        if (type === 'text') {
            data.text          = $('#wpwm-f-text').val();
            data.font_size     = $('#wpwm-f-font-size').val();
            data.font_color    = $('#wpwm-f-font-color').val();
            data.shadow        = $('#wpwm-f-shadow').is(':checked') ? '1' : '';
            data.shadow_color  = $('#wpwm-f-shadow-color').val();
            data.shadow_offset = $('#wpwm-f-shadow-offset').val();
            data.rotation      = $('#wpwm-f-rotation').val();
        } else {
            data.logo_id    = $('#wpwm-f-logo-id').val();
            data.logo_width = $('#wpwm-f-logo-width').val();
        }
        return data;
    }

    function resetEditor() {
        $('#wpwm-preset-id').val('');
        $('#wpwm-editor-title').text('New Preset');
        $('#wpwm-f-name').val('');
        $('input[name="wpwm_type"][value="text"]').prop('checked', true).trigger('change');
        $('#wpwm-f-text').val('© {year} {site_name}');
        $('#wpwm-f-font-size').val(24);
        $('#wpwm-f-font-color').val('#ffffff').trigger('change');
        $('#wpwm-f-shadow').prop('checked', true).trigger('change');
        $('#wpwm-f-shadow-color').val('#000000').trigger('change');
        $('#wpwm-f-shadow-offset').val(2);
        $('#wpwm-f-rotation').val(0);
        $('#wpwm-f-logo-id').val('0');
        $('#wpwm-logo-preview').html('');
        $('.wpwm-remove-logo').hide();
        $('#wpwm-f-logo-width').val(20); $('#wpwm-logo-width-val').text(20);
        $('#wpwm-f-position').val('bottom-right');
        $('.wpwm-pos-btn').removeClass('active');
        $('.wpwm-pos-btn[data-pos="bottom-right"]').addClass('active');
        $('.wpwm-pos-label').text('Bottom Right');
        $('#wpwm-f-padding').val(20);
        $('#wpwm-f-opacity').val(70); $('#wpwm-opacity-val').text(70);
        $('.wpwm-status').text('').removeClass('success error');
        _previewLogoImg = null;
        _previewLogoUrl = '';
        renderPreview();
    }

    function populateEditor(preset) {
        $('#wpwm-preset-id').val(preset.id);
        $('#wpwm-editor-title').text('Edit: ' + preset.name);
        $('#wpwm-f-name').val(preset.name);
        $('input[name="wpwm_type"][value="' + preset.type + '"]').prop('checked', true).trigger('change');

        if (preset.type === 'text') {
            $('#wpwm-f-text').val(preset.text || '');
            $('#wpwm-f-font-size').val(preset.font_size || 24);
            $('#wpwm-f-font-color').val(preset.font_color || '#ffffff').trigger('change');
            $('#wpwm-f-shadow').prop('checked', !!preset.shadow).trigger('change');
            $('#wpwm-f-shadow-color').val(preset.shadow_color || '#000000').trigger('change');
            $('#wpwm-f-shadow-offset').val(preset.shadow_offset || 2);
            $('#wpwm-f-rotation').val(preset.rotation || 0);
        } else {
            $('#wpwm-f-logo-id').val(preset.logo_id || 0);
            if (preset.logo_preview_url) {
                $('#wpwm-logo-preview').html('<img src="' + preset.logo_preview_url + '" alt="">');
                $('.wpwm-remove-logo').show();
            }
            $('#wpwm-f-logo-width').val(preset.logo_width || 20);
            $('#wpwm-logo-width-val').text(preset.logo_width || 20);
        }

        var pos = preset.position || 'bottom-right';
        $('#wpwm-f-position').val(pos);
        $('.wpwm-pos-btn').removeClass('active');
        $('.wpwm-pos-btn[data-pos="' + pos + '"]').addClass('active');
        $('.wpwm-pos-label').text(posLabels[pos] || pos);
        $('#wpwm-f-padding').val(preset.padding || 20);
        $('#wpwm-f-opacity').val(preset.opacity || 70);
        $('#wpwm-opacity-val').text(preset.opacity || 70);
        $('.wpwm-status').text('').removeClass('success error');
        updatePreviewLogo();
    }

    function bindPresetEditor() {
        // Open editor for new preset
        $(document).on('click', '#wpwm-add-preset', function () {
            resetEditor();
            var $editor = $('#wpwm-preset-editor');
            $editor.slideDown(200);
            $('html, body').animate({ scrollTop: $editor.offset().top - 80 }, 300);
        });

        // Open editor to edit existing preset
        $(document).on('click', '.wpwm-edit-preset', function () {
            var $card  = $(this).closest('.wpwm-preset-card');
            var id     = $card.data('id');
            // Read preset data embedded in the page via wpwm.preset_data (injected at the bottom)
            var preset = window.wpwmPresets && window.wpwmPresets[id];
            if (!preset) { alert('Preset data not found.'); return; }
            populateEditor(preset);
            var $editor = $('#wpwm-preset-editor');
            $editor.slideDown(200);
            $('html, body').animate({ scrollTop: $editor.offset().top - 80 }, 300);
        });

        // Cancel
        $(document).on('click', '#wpwm-cancel-preset', function () {
            $('#wpwm-preset-editor').slideUp(200);
        });

        // Save preset
        $(document).on('click', '#wpwm-save-preset', function () {
            var $btn    = $(this);
            var $spin   = $btn.siblings('.wpwm-spinner');
            var $status = $btn.siblings('.wpwm-status');

            var data = buildPresetData();
            if (!data.name) { $status.text('Preset name is required.').addClass('error').removeClass('success'); return; }

            $btn.prop('disabled', true);
            $spin.addClass('is-active');
            $status.text('').removeClass('success error');

            ajax('wpwm_save_preset', data, function (res) {
                $spin.removeClass('is-active');
                $btn.prop('disabled', false);
                $status.text('Saved!').addClass('success').removeClass('error');

                // Update or add card in list
                var $existing = $('.wpwm-preset-card[data-id="' + res.preset.id + '"]');
                if ($existing.length) {
                    $existing.replaceWith(res.card_html);
                } else {
                    $('#wpwm-presets-list').append(res.card_html);
                    // Remove "No presets yet" message if present
                    $('#wpwm-presets-list > p').remove();
                }
                // Update local preset cache
                window.wpwmPresets = window.wpwmPresets || {};
                window.wpwmPresets[res.preset.id] = res.preset;

                setTimeout(function () { $('#wpwm-preset-editor').slideUp(200); }, 800);
            }, function (err) {
                $spin.removeClass('is-active');
                $btn.prop('disabled', false);
                $status.text(err).addClass('error').removeClass('success');
            });
        });

        // Delete preset
        $(document).on('click', '.wpwm-delete-preset', function () {
            if (!confirm(wpwm.strings.confirm_delete)) return;
            var $card = $(this).closest('.wpwm-preset-card');
            var id    = $card.data('id');
            ajax('wpwm_delete_preset', { preset_id: id }, function () {
                $card.fadeOut(300, function () {
                    $card.remove();
                    if ($('#wpwm-presets-list .wpwm-preset-card').length === 0) {
                        $('#wpwm-presets-list').append('<p>No presets yet. Click "New Preset" to create one.</p>');
                    }
                });
                delete window.wpwmPresets[id];
            });
        });
    }

    // ── Batch apply ───────────────────────────────────────────────────────────

    var batchAborted = false;

    function runBatch(ids, presetId, offset) {
        if (batchAborted || offset >= ids.length) {
            finishBatch(ids.length);
            return;
        }

        var chunk = ids.slice(offset, offset + 10);
        ajax('wpwm_apply_batch', {
            attachment_ids: chunk,
            preset_id: presetId
        }, function (data) {
            updateBatchProgress(offset + chunk.length, ids.length);
            appendBatchResults(data.success, data.failed);
            runBatch(ids, presetId, offset + chunk.length);
        }, function (err) {
            $('#wpwm-batch-progress .wpwm-progress-text').text('Error: ' + err);
        });
    }

    function updateBatchProgress(done, total) {
        var pct = total > 0 ? Math.round(done / total * 100) : 0;
        $('#wpwm-batch-progress .wpwm-progress-fill').css('width', pct + '%');
        $('#wpwm-batch-progress .wpwm-progress-text').text(done + ' / ' + total);
    }

    function appendBatchResults(success, failed) {
        var $list = $('#wpwm-batch-result-list');
        success.forEach(function (item) {
            $list.append('<li><span class="ok">✔</span> ' + $('<span>').text(item.title || '#' + item.id).html() + '</li>');
        });
        failed.forEach(function (item) {
            $list.append('<li><span class="fail">✘</span> ' + $('<span>').text(item.title || '#' + item.id).html() + ' — ' + $('<span>').text(item.message).html() + '</li>');
        });
        var $wrap = $('#wpwm-batch-results');
        if (!$wrap.is(':visible')) $wrap.show();
    }

    function finishBatch(total) {
        $('#wpwm-batch-progress .wpwm-progress-text').text(wpwm.strings.done + ' (' + total + ' images processed)');
        $('#wpwm-start-batch').prop('disabled', false).text('Apply Watermarks');
        $('#wpwm-cancel-batch').hide();
    }

    function bindBatchApply() {
        $(document).on('click', '#wpwm-start-batch', function () {
            var presetId       = $('#wpwm-batch-preset').val();
            var scope          = $('input[name="wpwm_scope"]:checked').val();
            var skipWatermarked = $('#wpwm-skip-watermarked').is(':checked') ? '1' : '';
            var dateFrom       = $('#wpwm-date-from').val();
            var dateTo         = $('#wpwm-date-to').val();

            if (!presetId) { alert('Please select a preset.'); return; }
            if (scope === 'range' && (!dateFrom || !dateTo)) { alert('Please set a date range.'); return; }

            var $btn = $(this);
            $btn.prop('disabled', true).text(wpwm.strings.processing);
            batchAborted = false;
            $('#wpwm-cancel-batch').show();
            $('#wpwm-batch-progress').show();
            $('#wpwm-batch-results').hide();
            $('#wpwm-batch-result-list').empty();
            updateBatchProgress(0, 0);

            ajax('wpwm_get_image_ids', {
                skip_watermarked: skipWatermarked,
                date_from: scope === 'range' ? dateFrom : '',
                date_to:   scope === 'range' ? dateTo   : '',
            }, function (data) {
                var ids = data.ids;
                if (!ids || ids.length === 0) {
                    finishBatch(0);
                    $('#wpwm-batch-progress .wpwm-progress-text').text('No images to process.');
                    return;
                }
                updateBatchProgress(0, ids.length);
                runBatch(ids, presetId, 0);
            }, function (err) {
                $btn.prop('disabled', false).text('Apply Watermarks');
                alert('Error fetching images: ' + err);
            });
        });

        $(document).on('click', '#wpwm-cancel-batch', function () {
            batchAborted = true;
            $(this).hide();
            $('#wpwm-start-batch').prop('disabled', false).text('Apply Watermarks');
        });
    }

    // ── Preset regeneration ───────────────────────────────────────────────────

    function runRegenerateBatch(ids, presetId, offset, $panel) {
        if (offset >= ids.length) {
            $panel.find('.wpwm-progress-text').text(wpwm.strings.done + ' (' + ids.length + ' processed)');
            return;
        }
        var chunk = ids.slice(offset, offset + 10);
        ajax('wpwm_regenerate_batch', { attachment_ids: chunk, preset_id: presetId }, function (data) {
            var pct = Math.round((offset + chunk.length) / ids.length * 100);
            $panel.find('.wpwm-progress-fill').css('width', pct + '%');
            $panel.find('.wpwm-progress-text').text((offset + chunk.length) + ' / ' + ids.length);
            var $list = $panel.find('.wpwm-reapply-results');
            (data.success || []).forEach(function (i) {
                $list.append('<li><span class="ok">✔</span> ' + $('<span>').text(i.title || '#' + i.id).html() + '</li>');
            });
            (data.failed || []).forEach(function (i) {
                $list.append('<li><span class="fail">✘</span> ' + $('<span>').text(i.title || '#' + i.id).html() + ' — ' + $('<span>').text(i.message).html() + '</li>');
            });
            (data.skipped || []).forEach(function (i) {
                $list.append('<li><span class="skipped">⚠</span> ' + $('<span>').text(i.title || '#' + i.id).html() + ' (skipped — no backup)</li>');
            });
            runRegenerateBatch(ids, presetId, offset + chunk.length, $panel);
        }, function (err) {
            $panel.find('.wpwm-progress-text').text('Error: ' + err);
        });
    }

    function bindRegeneratePreset() {
        $(document).on('click', '.wpwm-reapply-preset', function () {
            var $card   = $(this).closest('.wpwm-preset-card');
            var id      = $card.data('id');
            var $panel  = $('#wpwm-reapply-' + id);

            if ($panel.is(':visible')) {
                $panel.slideUp(150);
                return;
            }

            // Reset panel
            $panel.find('.wpwm-reapply-info').text(wpwm.strings.processing);
            $panel.find('.wpwm-progress-bar').hide();
            $panel.find('.wpwm-progress-text').text('');
            $panel.find('.wpwm-reapply-results').empty();
            $panel.slideDown(200);

            // Fetch usage count first
            ajax('wpwm_get_preset_usage', { preset_id: id }, function (data) {
                var total  = data.total;
                var backed = data.with_backup;
                var ids    = data.ids;

                if (total === 0) {
                    $panel.find('.wpwm-reapply-info').text('No images have used this preset yet.');
                    return;
                }

                var msg = total + ' image(s) used this preset. ' + backed + ' have backups and can be regenerated.';
                if (backed === 0) {
                    msg += ' Nothing to do (backups required to avoid double-watermarking).';
                    $panel.find('.wpwm-reapply-info').text(msg);
                    return;
                }

                $panel.find('.wpwm-reapply-info').html(
                    msg + '<br><button type="button" class="button button-primary wpwm-confirm-regen" style="margin-top:8px">' +
                    'Re-apply to ' + backed + ' image(s)</button>'
                );

                $panel.on('click', '.wpwm-confirm-regen', function () {
                    $(this).remove();
                    $panel.find('.wpwm-reapply-info').text('Working…');
                    $panel.find('.wpwm-progress-bar').show();
                    runRegenerateBatch(ids, id, 0, $panel);
                });
            }, function (err) {
                $panel.find('.wpwm-reapply-info').text('Error: ' + err);
            });
        });
    }

    // ── Live preview ──────────────────────────────────────────────────────────

    var _previewLogoImg = null;
    var _previewLogoUrl = '';

    /** Draw a sample "landscape photo" background on the canvas. */
    function drawPreviewBackground(ctx, W, H) {
        // Sky gradient
        var sky = ctx.createLinearGradient(0, 0, 0, H * 0.55);
        sky.addColorStop(0, '#5ba3d9');
        sky.addColorStop(1, '#a8d4f5');
        ctx.fillStyle = sky;
        ctx.fillRect(0, 0, W, H * 0.55);

        // Ground gradient
        var ground = ctx.createLinearGradient(0, H * 0.55, 0, H);
        ground.addColorStop(0, '#6aaa5f');
        ground.addColorStop(1, '#3e7c35');
        ctx.fillStyle = ground;
        ctx.fillRect(0, H * 0.55, W, H * 0.45);

        // Sun
        ctx.fillStyle = 'rgba(255, 210, 60, 0.85)';
        ctx.beginPath();
        ctx.arc(W * 0.78, H * 0.2, 22, 0, Math.PI * 2);
        ctx.fill();

        // Horizon hill
        ctx.fillStyle = 'rgba(55, 100, 50, 0.45)';
        ctx.beginPath();
        ctx.moveTo(0, H * 0.62);
        ctx.bezierCurveTo(W * 0.15, H * 0.44, W * 0.38, H * 0.48, W * 0.55, H * 0.54);
        ctx.bezierCurveTo(W * 0.72, H * 0.59, W * 0.88, H * 0.5, W, H * 0.57);
        ctx.lineTo(W, H);
        ctx.lineTo(0, H);
        ctx.closePath();
        ctx.fill();

        // Simple cloud
        ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
        ctx.beginPath();
        ctx.arc(W * 0.25, H * 0.18, 14, 0, Math.PI * 2);
        ctx.arc(W * 0.33, H * 0.15, 18, 0, Math.PI * 2);
        ctx.arc(W * 0.42, H * 0.18, 13, 0, Math.PI * 2);
        ctx.fill();
    }

    /**
     * Compute the canvas centre point (cx, cy) for a watermark element
     * with known rendered dimensions (elW × elH) at a given position.
     */
    function calcPreviewPos(pos, W, H, padX, padY, elW, elH) {
        var x, y;
        if      (pos.indexOf('left')   !== -1) { x = padX + elW / 2; }
        else if (pos.indexOf('right')  !== -1) { x = W - padX - elW / 2; }
        else                                   { x = W / 2; }

        if      (pos.indexOf('top')    !== -1) { y = padY + elH / 2; }
        else if (pos.indexOf('bottom') !== -1) { y = H - padY - elH / 2; }
        else                                   { y = H / 2; }

        return { x: x, y: y };
    }

    function drawTextPreview(ctx, W, H, padX, padY, scaleX, pos) {
        var raw = $('#wpwm-f-text').val() || '© {year} {site_name}';
        var text = raw
            .replace(/\{year\}/g,      new Date().getFullYear())
            .replace(/\{site_name\}/g, 'My Site')
            .replace(/\{site_url\}/g,  'mysite.com');

        var fontSizePx  = Math.max(8, Math.round((parseInt($('#wpwm-f-font-size').val(), 10) || 24) * scaleX));
        var fontColor   = $('#wpwm-f-font-color').val()  || '#ffffff';
        var rotation    = (parseFloat($('#wpwm-f-rotation').val())        || 0) * Math.PI / 180;
        var hasShadow   = $('#wpwm-f-shadow').is(':checked');
        var shadowColor = $('#wpwm-f-shadow-color').val() || '#000000';
        var shadowOff   = Math.max(1, Math.round((parseInt($('#wpwm-f-shadow-offset').val(), 10) || 2) * scaleX));

        ctx.font         = 'bold ' + fontSizePx + 'px Arial, sans-serif';
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';

        var tw = ctx.measureText(text).width;
        var th = fontSizePx;
        var cp = calcPreviewPos(pos, W, H, padX, padY, tw, th);

        ctx.save();
        ctx.translate(cp.x, cp.y);
        ctx.rotate(rotation);

        if (hasShadow) {
            ctx.fillStyle = shadowColor;
            ctx.fillText(text, shadowOff, shadowOff);
        }
        ctx.fillStyle = fontColor;
        ctx.fillText(text, 0, 0);
        ctx.restore();
    }

    function drawLogoPreview(ctx, W, H, padX, padY, scaleX, pos) {
        var logoWidthPct = parseInt($('#wpwm-f-logo-width').val(), 10) || 20;
        var logoW        = Math.max(10, Math.round(logoWidthPct / 100 * W));

        if (_previewLogoImg) {
            var naturalW = _previewLogoImg.naturalWidth;
            var aspect   = naturalW > 0 ? (_previewLogoImg.naturalHeight / naturalW) : 1;
            var logoH    = Math.round(logoW * aspect);
            var cp     = calcPreviewPos(pos, W, H, padX, padY, logoW, logoH);
            ctx.drawImage(_previewLogoImg, cp.x - logoW / 2, cp.y - logoH / 2, logoW, logoH);
        } else {
            // Placeholder dashed rectangle
            var logoH2 = Math.round(logoW * 0.5);
            var cp2    = calcPreviewPos(pos, W, H, padX, padY, logoW, logoH2);
            var x0     = Math.round(cp2.x - logoW / 2);
            var y0     = Math.round(cp2.y - logoH2 / 2);

            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth   = 1.5;
            ctx.setLineDash([4, 3]);
            ctx.strokeRect(x0, y0, logoW, logoH2);
            ctx.setLineDash([]);

            ctx.fillStyle    = '#ffffff';
            ctx.font         = Math.max(9, Math.round(logoH2 * 0.4)) + 'px Arial, sans-serif';
            ctx.textAlign    = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('LOGO', cp2.x, cp2.y);
        }
    }

    function renderPreview() {
        var $canvas = $('#wpwm-preview-canvas');
        if (!$canvas.length) { return; }
        var canvas = $canvas[0];
        var ctx    = canvas.getContext('2d');
        var W      = canvas.width;   // 400
        var H      = canvas.height;  // 250

        ctx.clearRect(0, 0, W, H);
        drawPreviewBackground(ctx, W, H);

        var type    = $('input[name="wpwm_type"]:checked').val() || 'text';
        var pos     = $('#wpwm-f-position').val()              || 'bottom-right';
        var padding = parseInt($('#wpwm-f-padding').val(), 10) || 0;
        var opacity = (parseInt($('#wpwm-f-opacity').val(), 10) || 70) / 100;

        // Canvas represents a 1200 × 750 px image
        var scaleX = W / 1200;
        var scaleY = H / 750;
        var padX   = Math.round(padding * scaleX);
        var padY   = Math.round(padding * scaleY);

        ctx.globalAlpha = opacity;

        if (type === 'text') {
            drawTextPreview(ctx, W, H, padX, padY, scaleX, pos);
        } else {
            drawLogoPreview(ctx, W, H, padX, padY, scaleX, pos);
        }

        ctx.globalAlpha = 1.0;
    }

    /** Load (or re-use) the logo image then re-render the preview. */
    function updatePreviewLogo() {
        var $img = $('#wpwm-logo-preview img');
        var url  = $img.length ? $img.attr('src') : '';

        if (!url) {
            _previewLogoImg = null;
            _previewLogoUrl = '';
            renderPreview();
            return;
        }
        if (url === _previewLogoUrl && _previewLogoImg) {
            renderPreview();
            return;
        }
        var img    = new Image();

        // Only enable anonymous CORS for external images on a different host
        if (/^https?:\/\//i.test(url)) {
            var link = document.createElement('a');
            link.href = url;
            if (link.host && link.host !== window.location.host) {
                img.crossOrigin = 'anonymous';
            }
        }

        img.onload  = function () { _previewLogoImg = img; _previewLogoUrl = url; renderPreview(); };
        img.onerror = function () { _previewLogoImg = null; renderPreview(); };
        img.src = url;
    }

    function bindPreview() {
        // Re-render on any field change inside the editor
        $(document).on('input change', '#wpwm-preset-editor input, #wpwm-preset-editor select', renderPreview);

        // Re-render when the selected logo actually changes.
        $(document).on('change', '#wpwm-f-logo-id', updatePreviewLogo);

        // Re-render after logo removal once the DOM has been updated.
        $(document).on('click', '.wpwm-remove-logo', function () {
            setTimeout(updatePreviewLogo, 0);
        });

        // Observe preview DOM updates from the media uploader so the canvas refreshes
        // after the user selects a logo in the modal.
        var previewNode = document.getElementById('wpwm-logo-preview');
        if (previewNode && window.MutationObserver) {
            new MutationObserver(function () {
                updatePreviewLogo();
            }).observe(previewNode, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ['src']
            });
        }
    }

    // ── Backup management (Backups tab) ───────────────────────────────────────

    function bindBackupActions() {
        // Restore original
        $(document).on('click', '.wpwm-restore-btn', function () {
            if (!confirm(wpwm.strings.confirm_restore)) return;
            var $btn  = $(this);
            var id    = $btn.data('id');
            var $row  = $('#wpwm-backup-row-' + id);
            var $status = $row.find('.wpwm-row-status');

            $btn.prop('disabled', true).text('Restoring…');
            ajax('wpwm_restore_original', { attachment_id: id }, function () {
                $status.text('Restored!').addClass('ok');
                $row.find('.wpwm-restore-btn, .wpwm-delete-backup-btn').remove();
            }, function (err) {
                $status.text(err).addClass('fail');
                $btn.prop('disabled', false).text('Restore Original');
            });
        });

        // Delete backup file only
        $(document).on('click', '.wpwm-delete-backup-btn', function () {
            if (!confirm('Delete the backup file? The watermarked image will remain.')) return;
            var $btn  = $(this);
            var id    = $btn.data('id');
            var $row  = $('#wpwm-backup-row-' + id);
            var $status = $row.find('.wpwm-row-status');

            $btn.prop('disabled', true).text('Deleting…');
            ajax('wpwm_delete_backup', { attachment_id: id }, function () {
                $status.text('Backup deleted').addClass('ok');
                $row.find('.wpwm-restore-btn, .wpwm-delete-backup-btn').remove();
                $row.find('td:nth-child(4)').html('<span class="wpwm-badge">No backup</span>');
            }, function (err) {
                $status.text(err).addClass('fail');
                $btn.prop('disabled', false).text('Delete Backup');
            });
        });
    }

    // ── Init ──────────────────────────────────────────────────────────────────

    $(function () {
        initColorPickers();
        bindTypeToggle();
        bindPositionPicker();
        bindSliders();
        bindShadowToggle();
        bindDateRange();
        bindLogoUploader();
        bindPresetEditor();
        bindBatchApply();
        bindBackupActions();
        bindRegeneratePreset();
        bindPreview();

        // Show success notice after settings save
        if (window.location.search.indexOf('updated=1') !== -1) {
            $('<div class="notice notice-success is-dismissible"><p>Settings saved.</p></div>')
                .insertAfter('.wpwm-wrap h1');
        }
    });

})(jQuery);
