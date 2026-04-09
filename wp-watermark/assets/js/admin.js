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

        // Show success notice after settings save
        if (window.location.search.indexOf('updated=1') !== -1) {
            $('<div class="notice notice-success is-dismissible"><p>Settings saved.</p></div>')
                .insertAfter('.wpwm-wrap h1');
        }
    });

})(jQuery);
