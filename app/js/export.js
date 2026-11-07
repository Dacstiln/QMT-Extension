// app/js/export.js

window.initExportView = function () {
    const container   = document.getElementById('templatesItems');
    const selectAllCb = document.getElementById('selectAll');
    const btnExport   = document.getElementById('btnStartExport');
    const btnCancel   = document.getElementById('btnCancelExport');

    if (!container || !btnExport) {
        console.error('[QMT] initExportView: elementos del DOM no encontrados');
        return;
    }

    btnCancel.addEventListener('click', () => {
        window.navigateTo('my-templates');
    });

    // Cargar plantillas
    async function loadTemplatesForExport() {
        container.innerHTML = '<p style="padding:20px; color:var(--text-muted);">Cargando plantillas…</p>';

        let templates = [];

        if (Array.isArray(window.mockTemplates) && window.mockTemplates.length > 0) {
            templates = window.mockTemplates;
        } else {
            try {
                const response = await sendMessage('GET_TEMPLATES');
                if (response && response.success && Array.isArray(response.templates)) {
                    templates = response.templates;
                    if (window.mockTemplates.length === 0) {
                        window.mockTemplates = templates;
                    }
                }
            } catch (err) {
                console.warn('[QMT] export: error obteniendo templates del SW', err);
            }
        }

        if (templates.length === 0) {
            container.innerHTML = '<p style="padding:20px; color:var(--text-muted);">No hay plantillas para exportar.</p>';
            btnExport.disabled = true;
            return;
        }

        renderExportList(templates);
    }

    function renderExportList(templates) {
        container.innerHTML = templates.map(t => `
            <div class="template-item">
                <input type="checkbox" class="export-check" data-id="${escHtml(String(t.id))}" checked>
                <div class="template-info">
                    <div class="template-title">${escHtml(t.name || t.title || 'Sin título')}</div>
                    ${t.shortcode ? `<div class="template-shortcode">${escHtml(t.shortcode)}</div>` : ''}
                </div>
            </div>
        `).join('');

        updateExportButton();
        syncSelectAll();

        container.addEventListener('change', (e) => {
            if (e.target.classList.contains('export-check')) {
                updateExportButton();
                syncSelectAll();
            }
        });
    }

    function updateExportButton() {
        const checked = container.querySelectorAll('.export-check:checked').length;
        btnExport.disabled = (checked === 0);
    }

    function syncSelectAll() {
        const all     = container.querySelectorAll('.export-check');
        const checked = container.querySelectorAll('.export-check:checked');
        if (all.length === 0) return;
        selectAllCb.checked       = all.length === checked.length;
        selectAllCb.indeterminate = checked.length > 0 && checked.length < all.length;
    }

    // Seleccionar todas
    selectAllCb.addEventListener('change', (e) => {
        container.querySelectorAll('.export-check').forEach(cb => {
            cb.checked = e.target.checked;
        });
        updateExportButton();
    });

    // Exportar
    btnExport.addEventListener('click', async () => {
        const format      = document.querySelector('input[name="exportFormat"]:checked')?.value || 'json';
        const selectedIds = Array.from(container.querySelectorAll('.export-check:checked'))
                                 .map(cb => cb.dataset.id);

        if (selectedIds.length === 0) {
            window.showToast ? window.showToast('Selecciona al menos una plantilla', 'warning') : alert('Selecciona al menos una plantilla');
            return;
        }

        let allTemplates = Array.isArray(window.mockTemplates) && window.mockTemplates.length > 0
            ? window.mockTemplates
            : [];

        if (allTemplates.length === 0) {
            try {
                const response = await sendMessage('GET_TEMPLATES');
                if (response && response.success && Array.isArray(response.templates)) {
                    allTemplates = response.templates;
                }
            } catch (_) {}
        }

        const toExport = allTemplates.filter(t => selectedIds.includes(String(t.id)));

        if (toExport.length === 0) {
            window.showToast ? window.showToast('No se encontraron las plantillas seleccionadas', 'error') : alert('No se encontraron las plantillas seleccionadas');
            return;
        }

        let content, mimeType, extension;

        if (format === 'json') {
            content   = JSON.stringify(toExport, null, 2);
            mimeType  = 'application/json';
            extension = 'json';
        } else {
            const headers = 'id,name,shortcode,content,tags\n';
            const rows    = toExport.map(t =>
                `"${escCSV(String(t.id))}","${escCSV(t.name || t.title || '')}","${escCSV(t.shortcode || '')}","${escCSV(t.content || '')}","${escCSV((t.tags || []).join('|'))}"`
            ).join('\n');
            content   = headers + rows;
            mimeType  = 'text/csv';
            extension = 'csv';
        }

        const blob = new Blob([content], { type: mimeType });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href     = url;
        a.download = `qmt_export_${new Date().toISOString().split('T')[0]}.${extension}`;
        a.click();
        URL.revokeObjectURL(url);

        window.showToast && window.showToast(`${toExport.length} plantilla${toExport.length !== 1 ? 's' : ''} exportada${toExport.length !== 1 ? 's' : ''} correctamente`, 'success');
    });

    // Helpers
    function escHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function escCSV(str) {
        return String(str).replace(/"/g, '""');
    }

    // Inicializar
    loadTemplatesForExport();
};