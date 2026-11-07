// app/js/import.js

window.initImportView = function () {
    const uploadArea     = document.getElementById('uploadArea');
    const fileInput      = document.getElementById('fileInput');
    const btnSelect      = document.getElementById('btnSelectFile');
    const fileInfoEl     = document.getElementById('fileInfo');
    const fileNameEl     = document.getElementById('fileName');
    const fileSizeEl     = document.getElementById('fileSize');
    const btnRemove      = document.getElementById('btnRemoveFile');
    const previewSection = document.getElementById('previewSection');
    const previewCount   = document.getElementById('previewCount');
    const previewList    = document.getElementById('previewList');
    const btnImport      = document.getElementById('btnTriggerImport');
    const btnCancel      = document.getElementById('btnCancelImport');
    const dlExample      = document.getElementById('downloadExample');

    if (!uploadArea || !fileInput || !btnImport) {
        console.error('[QMT] initImportView: elementos del DOM no encontrados');
        return;
    }

    let parsedTemplates = null;
    let currentFileName = '';

    function goToMyTemplates() {
        window.navigateTo('my-templates');
    }

    btnCancel.addEventListener('click', goToMyTemplates);

    btnSelect.addEventListener('click', (e) => {
        e.stopPropagation();
        fileInput.click();
    });

    uploadArea.addEventListener('click', (e) => {
        if (btnSelect.contains(e.target) || e.target === fileInput) return;
        fileInput.click();
    });

    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('dragging');
    });
    uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('dragging'));
    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('dragging');
        const file = e.dataTransfer.files[0];
        if (file) processFile(file);
    });

    fileInput.addEventListener('click', () => {
        fileInput.value = '';
    });

    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) processFile(file);
    });

    btnRemove.addEventListener('click', resetState);

    function resetState() {
        fileInput.value     = '';
        parsedTemplates     = null;
        currentFileName     = '';
        fileInfoEl.style.display    = 'none';
        uploadArea.style.display    = '';
        previewSection.style.display = 'none';
        btnImport.disabled  = true;
    }

    function processFile(file) {
        const ext = file.name.split('.').pop().toLowerCase();
        if (!['json', 'csv'].includes(ext)) {
            window.showToast ? window.showToast('Formato no válido. Usa un archivo .json o .csv', 'error') : alert('Formato no válido. Usa un archivo .json o .csv');
            return;
        }

        currentFileName = file.name.replace(/\.[^.]+$/, '');

        fileNameEl.textContent = file.name;
        fileSizeEl.textContent = formatFileSize(file.size);
        fileInfoEl.style.display = 'flex';
        uploadArea.style.display = 'none';

        const reader = new FileReader();
        reader.onload = (evt) => {
            try {
                if (ext === 'json') {
                    const parsed = JSON.parse(evt.target.result);
                    if (!Array.isArray(parsed)) throw new Error('El JSON debe ser un array de plantillas');
                    parsedTemplates = parsed;
                } else {
                    parsedTemplates = parseCSV(evt.target.result);
                }
                // Agregar automáticamente la etiqueta "importadas" a cada plantilla
                parsedTemplates = parsedTemplates.map((t, idx) => ({
                    ...t,
                    name: t.name || t.title || (parsedTemplates.length === 1 ? currentFileName : `Plantilla importada ${idx + 1}`),
                    title: t.name || t.title || (parsedTemplates.length === 1 ? currentFileName : `Plantilla importada ${idx + 1}`),
                    tags: Array.from(new Set([
                        ...((Array.isArray(t.tags) ? t.tags : (typeof t.tags === 'string' ? t.tags.split(';').map(s => s.trim()).filter(Boolean) : []))),
                        'importadas'
                    ]))
                }));
                showPreview(parsedTemplates);
                btnImport.disabled = false;
            } catch (err) {
                window.showToast ? window.showToast('Error al leer el archivo: ' + err.message, 'error') : alert('Error al leer el archivo: ' + err.message);
                resetState();
            }
        };
        reader.readAsText(file);
    }

    function showPreview(templates) {
        const n = templates.length;
        previewCount.textContent = `Se importarán ${n} plantilla${n !== 1 ? 's' : ''}`;
        previewList.innerHTML = templates.slice(0, 10).map(t => `
            <div class="preview-item">
                <div class="preview-item-title">${escHtml(t.name || t.title || 'Sin título')}</div>
                ${t.shortcode ? `<div class="preview-item-shortcode">${escHtml(t.shortcode)}</div>` : ''}
                <div style="margin-top:4px;display:flex;gap:4px;flex-wrap:wrap">
                    ${(t.tags || []).map(tag => `<span style="font-size:10px;background:var(--bg-secondary);border:1px solid var(--border-color);padding:1px 5px;border-radius:4px;color:var(--text-secondary)">${escHtml(tag)}</span>`).join('')}
                </div>
            </div>
        `).join('');
        if (n > 10) {
            previewList.innerHTML += `<div class="preview-item" style="color:var(--text-muted);text-align:center;">… y ${n - 10} más</div>`;
        }
        previewSection.style.display = '';
    }

    btnImport.addEventListener('click', async () => {
        if (!parsedTemplates || parsedTemplates.length === 0) return;

        btnImport.disabled   = true;
        btnImport.textContent = 'Importando…';

        try {
            const templatesToImport = parsedTemplates.map(t => ({
                ...t,
                id: t.id || Date.now().toString() + Math.random().toString(36).slice(2),
                name: t.name || t.title || currentFileName || 'Plantilla importada',
                tags: Array.isArray(t.tags) ? t.tags : [],
                createdAt: t.createdAt || Date.now(),
                updatedAt: Date.now(),
            }));

            const response = await sendMessage('IMPORT_TEMPLATES_TO_FIREBASE', { templates: templatesToImport });
            if (response && response.success) {
                const n = templatesToImport.length;

                templatesToImport.forEach(t => {
                    const exists = window.mockTemplates.findIndex(m => String(m.id) === String(t.id));
                    if (exists === -1) {
                        window.mockTemplates.unshift(t);
                    } else {
                        window.mockTemplates[exists] = { ...window.mockTemplates[exists], ...t };
                    }
                });

                if (typeof window.updateTagsSidebar === 'function') window.updateTagsSidebar();

                if (typeof window.loadTemplatesFromStorage === 'function') {
                    window.loadTemplatesFromStorage();
                }

                window.showToast
                    ? window.showToast(`${n} plantilla${n !== 1 ? 's' : ''} importada${n !== 1 ? 's' : ''} correctamente`, 'success')
                    : alert(`¡${n} plantilla${n !== 1 ? 's' : ''} importada${n !== 1 ? 's' : ''} correctamente!`);

                goToMyTemplates();
            } else {
                throw new Error(response?.error || 'Error desconocido');
            }
        } catch (err) {
            const msg = 'Error al importar: ' + err.message;
            window.showToast ? window.showToast(msg, 'error') : alert(msg);
            btnImport.disabled = false;
            btnImport.textContent = 'Importar plantillas';
        }
    });

    dlExample.addEventListener('click', (e) => {
        e.preventDefault();
        const csv = [
            'title,shortcode,content,tags',
            '"Saludo formal","saludo-formal","Estimado/a [Nombre],\n\nEspero que este mensaje le encuentre bien.","ventas;formal"',
            '"Seguimiento","seguimiento","Hola [Nombre],\n\nMe pongo en contacto para darle seguimiento.","seguimiento"'
        ].join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href     = url;
        a.download = 'qmt_ejemplo.csv';
        a.click();
        URL.revokeObjectURL(url);
    });

    function parseCSV(text) {
        const lines = text.trim().split('\n');
        if (lines.length < 2) throw new Error('El CSV está vacío o no tiene datos');
        const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
        return lines.slice(1).filter(l => l.trim()).map(line => {
            const values = splitCSVLine(line);
            const obj    = {};
            headers.forEach((h, i) => { obj[h] = (values[i] || '').replace(/^"|"$/g, ''); });
            return {
                name:      obj.title || obj.name || 'Sin título',
                title:     obj.title || obj.name || 'Sin título',
                shortcode: obj.shortcode || '',
                content:   obj.content  || obj.preview || '',
                tags:      (obj.tags || '').split(';').map(t => t.trim()).filter(Boolean),
            };
        });
    }

    function splitCSVLine(line) {
        const result = [];
        let current  = '';
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
            if (line[i] === '"') {
                inQuotes = !inQuotes;
            } else if (line[i] === ',' && !inQuotes) {
                result.push(current);
                current = '';
            } else {
                current += line[i];
            }
        }
        result.push(current);
        return result;
    }

    function formatFileSize(bytes) {
        if (bytes < 1024)    return bytes + ' B';
        if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / 1048576).toFixed(1) + ' MB';
    }

    function escHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }
};