// app/js/editor.js

let currentTemplate = null;
let selectedTags = [];
let editorElement = null;
let savedSel = null;
let UNDO = [];
let REDO = [];
let lastSnap = '';
let snapTmr = null;
let _saveLock = false;

const FMAP = { 'arial':'Arial','times new roman':'Times New Roman','georgia':'Georgia','verdana':'Verdana','tahoma':'Tahoma','trebuchet ms':'Trebuchet MS','courier new':'Courier New' };
const SZSTEPS = [6,7,8,9,10,11,12,13,14,15,16,18,20,22,24,26,28,32,36,42,48,56,64,72,96];
const BMAP = { p:'Párrafo',h1:'Título 1',h2:'Título 2',h3:'Título 3',pre:'Código',blockquote:'Cita' };
const TC = ['#000000','#111827','#1f2937','#374151','#4b5563','#6b7280','#9ca3af','#d1d5db','#7f1d1d','#b91c1c','#dc2626','#ef4444','#f87171','#fca5a5','#fee2e2','#fff1f2','#78350f','#b45309','#d97706','#f59e0b','#fbbf24','#fcd34d','#fef3c7','#fffbeb','#14532d','#15803d','#22c55e','#4ade80','#86efac','#bbf7d0','#dcfce7','#f0fdf4','#1e3a5f','#1e40af','#2563eb','#3b82f6','#60a5fa','#93c5fd','#bfdbfe','#dbeafe','#4a1d96','#7c3aed','#8b5cf6','#a78bfa','#c4b5fd','#ddd6fe','#ede9fe','#ffffff'];
const HL = ['#fef9c3','#fef3c7','#fde68a','#fcd34d','#fbbf24','#f59e0b','#dc2626','#b91c1c','#dcfce7','#bbf7d0','#86efac','#4ade80','#22c55e','#15803d','#14532d','#052e16','#dbeafe','#bfdbfe','#93c5fd','#60a5fa','#3b82f6','#1e40af','#1e3a5f','#172554','#fce7f3','#fbcfe8','#f9a8d4','#f472b6','#ec4899','#db2777','#be185d','#9d174d','#ffe4e6','#fecaca','#fca5a5','#f87171','#ef4444','#b91c1c','#7f1d1d','#450a0a','#f0fdf4','#fffbeb','#eff6ff','#f5f3ff','#fff1f2','#f8fafc','#e0f2fe','#ffffff'];
let sF = '#000000';
let sH = '#fbbf24';

function sendMessage(type, data = {}) {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ type, ...data }, (response) => {
            if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
            else resolve(response);
        });
    });
}

async function sendMessageWithRetry(type, data = {}, retries = 2) {
    for (let i = 0; i <= retries; i++) {
        try {
            const res = await sendMessage(type, data);
            return res;
        } catch (err) {
            if (i === retries) throw err;
            await new Promise(r => setTimeout(r, 400));
        }
    }
}

function initCreateTemplate() {
    editorElement = document.getElementById('editor');
    UNDO = []; REDO = []; lastSnap = ''; snapTmr = null;
    _saveLock = false;
    currentTemplate = null;
    selectedTags = [];
    savedSel = null;

    window._richEditorInitialized = false;

    const urlParams = new URLSearchParams(window.location.hash.split('?')[1] || '');
    const templateId = urlParams.get('id');

    setupEditorEvents();

    if (templateId) {
        loadTemplateForEdit(templateId);
    } else {
        setupNewTemplate();
        initRichEditor();
    }
}

function setupNewTemplate() {
    document.getElementById('editorTitle').textContent = 'Crear plantilla';
    currentTemplate = null;
    selectedTags = [];
    document.getElementById('templateName').value = '';
    document.getElementById('templateShortcut').value = '';
    if (editorElement) editorElement.innerHTML = '';
    renderSelectedTags();
    updateWC();
    loadAssignmentUsers();

    const actionsCard = document.getElementById('sidebarActionsCard');
    if (actionsCard) actionsCard.style.display = 'none';

    const metaCard = document.getElementById('sidebarMetaCard');
    if (metaCard) metaCard.style.display = 'none';
}

function loadTemplateForEdit(templateId, attempt = 0) {
    const MAX_ATTEMPTS = 15;
    if (!window.mockTemplates || !window.mockTemplates.length) {
        if (attempt >= MAX_ATTEMPTS) {
            window.showToast('No se pudieron cargar las plantillas', 'error');
            setTimeout(() => window.navigateTo('my-templates'), 800);
            return;
        }
        setTimeout(() => loadTemplateForEdit(templateId, attempt + 1), 300);
        return;
    }
    const template = window.mockTemplates.find(t => String(t.id) === String(templateId));
    if (!template) {
        window.showToast('Plantilla no encontrada', 'error');
        setTimeout(() => window.navigateTo('my-templates'), 800);
        return;
    }
    currentTemplate = template;
    document.getElementById('editorTitle').textContent = 'Editar plantilla';
    document.getElementById('templateName').value = template.name || '';
    document.getElementById('templateShortcut').value = template.shortcode || '';
    if (editorElement) editorElement.innerHTML = template.content || '';

    selectedTags = Array.isArray(template.tags) ? [...template.tags] : [];
    renderSelectedTags();
    updateWC();
    loadAssignmentUsers();

    const actionsCard = document.getElementById('sidebarActionsCard');
    if (actionsCard) actionsCard.style.display = '';

    renderTemplateMetadata(template);

    const btnDup = document.getElementById('btnDuplicateTemplate');
    if (btnDup) btnDup.onclick = duplicateCurrentTemplate;
    const btnDel = document.getElementById('btnDeleteTemplate');
    if (btnDel) btnDel.onclick = deleteCurrentTemplate;

    initRichEditor();

    lastSnap = getSnap();
    UNDO = [lastSnap];
    REDO = [];
}

function renderTemplateMetadata(template) {
    const metaCard = document.getElementById('sidebarMetaCard');
    if (!metaCard) return;

    const creatorName = template.ownerName || template.ownerId || '—';
    const createdDate = formatDateFull(template.createdDate);
    const modifiedDate = template.modifiedDate ? formatDateFull(template.modifiedDate) : '—';

    metaCard.innerHTML = `
        <h3 class="sidebar-card-title">Información</h3>
        <div class="meta-row">
            <span class="meta-label">Creado por</span>
            <span class="meta-value">${escHtmlEditor(creatorName)}</span>
        </div>
        <div class="meta-row">
            <span class="meta-label">Fecha creación</span>
            <span class="meta-value">${createdDate}</span>
        </div>
        <div class="meta-row">
            <span class="meta-label">Última modificación</span>
            <span class="meta-value">${modifiedDate}</span>
        </div>
    `;
    metaCard.style.display = '';
}

function escHtmlEditor(str) {
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function setupEditorEvents() {
    // Usar onclick en lugar de addEventListener para garantizar handler único
    const btnBack = document.getElementById('btnBackToTemplates');
    if (btnBack) {
        btnBack.onclick = () => {
            if (checkForChanges()) {
                showConfirmModal('¿Salir sin guardar?', 'Los cambios no guardados se perderán.', () => {
                    window.navigateTo('my-templates');
                });
            } else {
                window.navigateTo('my-templates');
            }
        };
    }

    const btnCancel = document.getElementById('btnCancelEdit');
    if (btnCancel) btnCancel.onclick = () => window.navigateTo('my-templates');

    const btnSave = document.getElementById('btnSaveTemplate');
    if (btnSave) btnSave.onclick = saveTemplate;

    const tagsInput = document.getElementById('tagsInput');
    if (tagsInput) {
        // Limpiar listeners previos reemplazando el elemento (técnica segura para inputs)
        const newTagsInput = tagsInput.cloneNode(true);
        tagsInput.parentNode.replaceChild(newTagsInput, tagsInput);
        newTagsInput.addEventListener('keydown', handleTagInput);
        newTagsInput.addEventListener('input', showTagSuggestions);
        newTagsInput.addEventListener('blur', () => setTimeout(hideTagSuggestions, 150));
        newTagsInput.addEventListener('focus', showTagSuggestions);
    }
}

function handleTagInput(e) {
    if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        const tag = e.target.value.trim().toLowerCase().replace(/\s+/g, '-');
        if (tag && !selectedTags.includes(tag)) {
            selectedTags.push(tag);
            renderSelectedTags();
            e.target.value = '';
            hideTagSuggestions();
            if (typeof window.updateTagsSidebar === 'function') window.updateTagsSidebar();
        }
    } else if (e.key === 'Escape') {
        hideTagSuggestions();
    }
}

function showTagSuggestions() {
    const input = document.getElementById('tagsInput');
    if (!input) return;
    const val = input.value.toLowerCase();
    const existing = (typeof getAllExistingTags === 'function') ? getAllExistingTags() : [];
    const suggestions = existing.filter(t => !selectedTags.includes(t) && (!val || t.includes(val)));

    let dropdown = document.getElementById('tagSuggestionsDropdown');
    if (!dropdown) {
        dropdown = document.createElement('div');
        dropdown.id = 'tagSuggestionsDropdown';
        dropdown.className = 'tag-suggestions-dropdown';
        input.parentElement.style.position = 'relative';
        input.parentElement.appendChild(dropdown);
    }

    if (!suggestions.length) { dropdown.style.display = 'none'; return; }

    dropdown.innerHTML = suggestions.map(tag =>
        `<div class="tag-suggestion-item" data-tag="${tag}">${tag}</div>`
    ).join('');
    dropdown.style.display = 'block';

    dropdown.querySelectorAll('.tag-suggestion-item').forEach(item => {
        item.addEventListener('mousedown', (e) => {
            e.preventDefault();
            if (!selectedTags.includes(item.dataset.tag)) {
                selectedTags.push(item.dataset.tag);
                renderSelectedTags();
                input.value = '';
                hideTagSuggestions();
                if (typeof window.updateTagsSidebar === 'function') window.updateTagsSidebar();
            }
        });
    });
}

function hideTagSuggestions() {
    const dropdown = document.getElementById('tagSuggestionsDropdown');
    if (dropdown) dropdown.style.display = 'none';
}

function renderSelectedTags() {
    const container = document.getElementById('selectedTags');
    if (!container) return;
    container.innerHTML = selectedTags.map(tag => `
        <div class="tag-pill">
            <span>${tag}</span>
            <button class="tag-pill-remove" data-tag="${tag}">×</button>
        </div>
    `).join('');
    container.querySelectorAll('.tag-pill-remove').forEach(btn => {
        btn.onclick = () => {
            selectedTags = selectedTags.filter(t => t !== btn.dataset.tag);
            renderSelectedTags();
            if (typeof window.updateTagsSidebar === 'function') window.updateTagsSidebar();
        };
    });
}

async function saveTemplate() {
    if (_saveLock) return;
    _saveLock = true;

    const btnSave = document.getElementById('btnSaveTemplate');
    if (btnSave) { btnSave.disabled = true; btnSave.textContent = 'Guardando...'; }

    try {
        const nameInput = document.getElementById('templateName').value.trim();
        const shortcut  = document.getElementById('templateShortcut').value.trim();
        const content   = editorElement?.innerHTML.trim() || '';

        if (!nameInput || !content || content === '<br>') {
            window.showToast('Completa el nombre y el contenido', 'warning');
            return;
        }

        // Verificar auth con reintento (por si el SW estaba durmiendo)
        let authCheck;
        try {
            authCheck = await sendMessageWithRetry('GET_AUTH_STATE');
        } catch (e) {
            window.showToast('Error de conexión con la extensión', 'error');
            return;
        }
        if (!authCheck || !authCheck.user) {
            window.showToast('Sesión expirada. Por favor inicia sesión de nuevo.', 'error');
            return;
        }

        const isNew = !currentTemplate;
        const templateId = isNew ? Date.now().toString() : String(currentTemplate.id);

        const assignmentRadio = document.querySelector('input[name="assignmentType"]:checked');
        const assignmentType  = assignmentRadio ? assignmentRadio.value : 'self';
        const assignSpecificUid = document.getElementById('assignSpecificUser')?.value || '';

        const userData = await sendMessage('GET_USER_DATA').catch(() => ({}));
        const ownerName = userData?.userData?.name || userData?.user?.email || '';

        const templateData = {
            id: templateId,
            name: nameInput,
            shortcode: shortcut || nameInput.toLowerCase().replace(/\s+/g, '-'),
            content,
            preview: content.replace(/<[^>]+>/g, '').trim().substring(0, 150),
            tags: selectedTags,
            ownerName,
            isGlobal: currentTemplate ? currentTemplate.isGlobal : false,
            createdAt: isNew ? Date.now() : (currentTemplate.createdAt || Date.now()),
            updatedAt: Date.now()
        };

        const response = await sendMessage('SAVE_TEMPLATE', { template: templateData });
        if (!response || !response.success) {
            throw new Error(response?.error || 'Error al comunicarse con el Service Worker');
        }

        if (window.currentUserRole === 'admin' && assignmentType !== 'self') {
            const targetUserIds = (assignmentType === 'user' && assignSpecificUid) ? [assignSpecificUid] : [];
            const assignRes = await sendMessage('ADMIN_ASSIGN_TEMPLATE', {
                templateData: { ...templateData, assignedByAdmin: true },
                targetUserIds
            });
            if (!assignRes || !assignRes.success) {
                window.showToast('Guardado, pero falló la asignación: ' + (assignRes?.error || ''), 'warning');
            }
        }

        // Actualizar cache local
        await new Promise(resolve => {
            chrome.storage.local.get(['qmt_templates'], (result) => {
                let templates = result.qmt_templates || [];
                if (isNew) {
                    templates.unshift(templateData);
                } else {
                    const idx = templates.findIndex(t => String(t.id) === templateId);
                    if (idx !== -1) templates[idx] = templateData;
                    else templates.unshift(templateData);
                }
                chrome.storage.local.set({ qmt_templates: templates }, resolve);
            });
        });

        // Actualizar window.mockTemplates en memoria
        if (isNew) {
            window.mockTemplates.unshift(templateData);
        } else {
            const idx = window.mockTemplates.findIndex(t => String(t.id) === templateId);
            if (idx !== -1) window.mockTemplates[idx] = { ...window.mockTemplates[idx], ...templateData };
            else window.mockTemplates.unshift(templateData);
        }

        const assignMsg = (window.currentUserRole === 'admin' && assignmentType !== 'self')
            ? (assignmentType === 'all' ? ' y asignada a todos los usuarios' : ' y asignada al usuario seleccionado')
            : '';
        window.showToast('Plantilla guardada exitosamente' + assignMsg, 'success');

        setTimeout(() => window.navigateTo('my-templates'), 800);

    } catch (error) {
        window.showToast('Error al guardar: ' + error.message, 'error');
    } finally {
        _saveLock = false;
        if (btnSave) { btnSave.disabled = false; btnSave.textContent = 'Guardar plantilla'; }
    }
}

async function loadAssignmentUsers() {
    if (window.currentUserRole !== 'admin') return;
    try {
        const res = await sendMessage('ADMIN_GET_ALL_USERS');
        if (!res.success) return;
        const select = document.getElementById('assignSpecificUser');
        if (!select) return;
        select.innerHTML = '<option value="">Selecciona un usuario...</option>' +
            res.users.map(u => `<option value="${u.uid}">${u.name || u.email}</option>`).join('');

        document.querySelectorAll('.admin-only').forEach(el => {
            if (window.currentUserRole === 'admin') el.classList.add('visible');
        });

        document.querySelectorAll('input[name="assignmentType"]').forEach(radio => {
            radio.addEventListener('change', () => {
                if (select) select.style.display = radio.value === 'user' ? 'block' : 'none';
            });
        });
    } catch (_) {}
}

function duplicateCurrentTemplate() {
    if (!currentTemplate) return;
    const copy = {
        ...currentTemplate,
        id: Date.now(),
        name: (currentTemplate.name || 'Plantilla') + ' (copia)',
        shortcode: currentTemplate.shortcode ? currentTemplate.shortcode + '-copia' : '',
        createdAt: Date.now(),
        updatedAt: Date.now(),
    };
    window.mockTemplates.unshift(copy);
    if (typeof persistTemplates === 'function') persistTemplates();
    if (typeof window.updateTagsSidebar === 'function') window.updateTagsSidebar();
    window.showToast('Plantilla duplicada', 'success');
    window.navigateTo('my-templates');
}

function deleteCurrentTemplate() {
    if (!currentTemplate) return;
    showConfirmModal('¿Eliminar plantilla?', 'Esta acción no se puede deshacer.', async () => {
        try { await sendMessage('DELETE_TEMPLATE', { templateId: String(currentTemplate.id) }); } catch (_) {}
        const idx = window.mockTemplates.findIndex(t => String(t.id) === String(currentTemplate.id));
        if (idx !== -1) window.mockTemplates.splice(idx, 1);
        if (typeof persistTemplates === 'function') persistTemplates();
        if (typeof window.updateTagsSidebar === 'function') window.updateTagsSidebar();
        window.showToast('Plantilla eliminada', 'success');
        window.navigateTo('my-templates');
    });
}

function formatDateFull(dateString) {
    if (!dateString || dateString === '-') return '—';
    const date = new Date(dateString);
    if (isNaN(date)) return '—';
    return date.toLocaleDateString('es-MX', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });
}

function checkForChanges() {
    if (!currentTemplate) {
        return !!(document.getElementById('templateName')?.value || editorElement?.innerHTML.trim());
    }
    const nameChanged    = document.getElementById('templateName')?.value !== currentTemplate.name;
    const contentChanged = editorElement?.innerHTML !== currentTemplate.content;
    return nameChanged || contentChanged;
}

// ===== RICH EDITOR =====
function initRichEditor() {
    if (window._richEditorInitialized) return;
    window._richEditorInitialized = true;

    if (!editorElement) editorElement = document.getElementById('editor');
    if (!editorElement) return;

    // Handler de toolbar: usar variable nombrada para poder removerla si fuera necesario.
    // Se registra en document con un identificador para evitar duplicados.
    if (!document._editorToolbarBound) {
        document._editorToolbarBound = true;
        document.addEventListener('click', _toolbarClickHandler);
    }

    document.getElementById('img-inp')?.addEventListener('change', (e) => insertImg(e.target));

    editorElement.addEventListener('input', () => { schedSnap(); updateWC(); });
    editorElement.addEventListener('keydown', onEditorKey);
    editorElement.addEventListener('mouseup', updateToolbar);
    editorElement.addEventListener('keyup', updateToolbar);
    editorElement.addEventListener('paste', onPaste);
    editorElement.addEventListener('mousedown', (e) => { if (e.target.closest('.img-wrap') && !e.target.classList.contains('rh')) { setTimeout(updateToolbar, 0); } });
    editorElement.addEventListener('click', (e) => {
        const td = e.target.closest('td,th');
        if (!td) closeTctx();
        deselImg();
        updateToolbar();
    });
    editorElement.addEventListener('contextmenu', (e) => {
        const td = e.target.closest('td,th');
        if (!td) return;
        e.preventDefault();
        ctxTd = td;
        const ctx = document.getElementById('tctx');
        if (ctx) {
            ctx.style.left = e.clientX + 'px';
            ctx.style.top  = e.clientY + 'px';
            ctx.classList.add('open');
        }
    });

    if (!document._editorGlobalClickBound) {
        document._editorGlobalClickBound = true;
        document.addEventListener('click', (e) => {
            if (!e.target.closest('#tctx')) closeTctx();
            if (!e.target.closest('.dd')) closeAllDD();
            if (!e.target.closest('.pal-wrap')) closeAllPals();
        });
    }

    editorElement.querySelectorAll('table').forEach(addTblRz);
    editorElement.querySelectorAll('img').forEach(img => {
        if (!img.closest('.img-wrap')) makeResizable(img);
    });

    // Snapshot inicial
    lastSnap = getSnap();
    if (!UNDO.length) {
        UNDO = [lastSnap];
    }
}

// Handler nombrado para toolbar (evita duplicados en document)
function _toolbarClickHandler(e) {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    // Solo actuar si el editor está activo en el DOM
    if (!document.getElementById('editor')) return;
    e.preventDefault();
    const action = btn.dataset.action;
    switch (action) {
        case 'undo':             doUndo(); break;
        case 'redo':             doRedo(); break;
        case 'toggle-dd':        toggleDD(btn.dataset.target); break;
        case 'set-block':        setBlock(btn.dataset.tag, btn.dataset.label); break;
        case 'set-font':         setFont(btn.dataset.font, btn.dataset.label); break;
        case 'adj-sz':           adjSz(parseInt(btn.dataset.delta)); break;
        case 'cmd':              cmd(btn.dataset.cmd); break;
        case 'apply-col':        applyCol(btn.dataset.type); break;
        case 'toggle-pal':       togglePal(btn.dataset.target); break;
        case 'apply-col-direct': applyColDirect(btn.dataset.type, btn.dataset.color); break;
        case 'open-lnk':         openLnk(); break;
        case 'trigger-img':      document.getElementById('img-inp')?.click(); break;
        case 'open-ov':          openOv(btn.dataset.target); break;
        case 'close-ov':         closeOv(btn.dataset.target); break;
        case 'open-code':        openCode(); break;
        case 'save-code':        saveCode(); break;
        case 'do-table':         doTable(); break;
        case 'do-link':          doLink(); break;
        case 'tca':              tca(btn.dataset.tca); break;
    }
}

function getSnap() { return editorElement ? editorElement.innerHTML : ''; }

function schedSnap() {
    clearTimeout(snapTmr);
    snapTmr = setTimeout(() => {
        const snap = getSnap();
        if (snap !== lastSnap) { pushUndo(); lastSnap = snap; }
    }, 600);
}

function pushUndo() {
    const snap = getSnap();
    if (UNDO[UNDO.length - 1] === snap) return;
    UNDO.push(snap);
    if (UNDO.length > 100) UNDO.shift();
    REDO = [];
    lastSnap = snap;
}

function doUndo() {
    // Cancelar cualquier snap pendiente para no contaminar después del undo
    clearTimeout(snapTmr);
    if (UNDO.length <= 1) return;
    const current = getSnap();
    // Si el estado actual difiere del tope del stack, guardarlo antes de deshacer
    if (current !== UNDO[UNDO.length - 1]) {
        UNDO.push(current);
    }
    REDO.push(UNDO.pop());
    const snap = UNDO[UNDO.length - 1];
    editorElement.innerHTML = snap;
    lastSnap = snap;
    _reattachEditorContent();
    updateToolbar();
    updateWC();
}

function doRedo() {
    clearTimeout(snapTmr);
    if (!REDO.length) return;
    const snap = REDO.pop();
    UNDO.push(snap);
    editorElement.innerHTML = snap;
    lastSnap = snap;
    _reattachEditorContent();
    updateToolbar();
    updateWC();
}

// Re-adjuntar handlers de tablas e imágenes tras restaurar innerHTML
function _reattachEditorContent() {
    editorElement.querySelectorAll('table').forEach(tbl => {
        if (!tbl.querySelector('.col-rz')) addTblRz(tbl);
    });
    editorElement.querySelectorAll('img').forEach(img => {
        if (!img.closest('.img-wrap')) makeResizable(img);
    });
}

function onEditorKey(e) {
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'z') { e.preventDefault(); doUndo(); return; }
    if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) { e.preventDefault(); doRedo(); return; }
    if (e.key === 'Tab') { e.preventDefault(); document.execCommand('insertHTML', false, '&nbsp;&nbsp;&nbsp;&nbsp;'); return; }
    // Solo programar snap para teclas que modifican contenido (no flechas, shift, ctrl, etc.)
    if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key.length === 1 || ['Backspace','Delete','Enter'].includes(e.key)) {
        schedSnap();
    }
}

function updateWC() {
    const text = (editorElement?.textContent || '').trim();
    const words = text ? text.split(/\s+/).length : 0;
    const el = document.getElementById('word-count');
    if (el) el.textContent = words + ' palabra' + (words !== 1 ? 's' : '');
}

function onPaste(e) {
    e.preventDefault();
    // Guardar estado antes del paste
    pushUndo();
    const html = e.clipboardData.getData('text/html');
    const text = e.clipboardData.getData('text/plain');
    if (html) {
        const clean = cleanPastedHTML(html);
        document.execCommand('insertHTML', false, clean);
    } else {
        document.execCommand('insertText', false, text);
    }
    // Guardar estado después del paste en el siguiente tick (para que el DOM esté actualizado)
    setTimeout(() => {
        const snap = getSnap();
        if (snap !== lastSnap) {
            UNDO.push(snap);
            if (UNDO.length > 100) UNDO.shift();
            REDO = [];
            lastSnap = snap;
        }
    }, 0);
}

function cleanPastedHTML(html) {
    const div = document.createElement('div');
    div.innerHTML = html;
    div.querySelectorAll('script,style,meta,link,head').forEach(el => el.remove());
    div.querySelectorAll('*').forEach(el => {
        const allowed = ['B','STRONG','I','EM','U','S','STRIKE','A','BR','P','H1','H2','H3','H4','PRE','BLOCKQUOTE','UL','OL','LI','TABLE','THEAD','TBODY','TR','TH','TD','IMG','SPAN','DIV','FONT'];
        if (!allowed.includes(el.tagName)) { el.replaceWith(...el.childNodes); return; }
        const keepAttrs = ['href','src','alt','target','style','colspan','rowspan','width','height'];
        [...el.attributes].forEach(attr => { if (!keepAttrs.includes(attr.name)) el.removeAttribute(attr.name); });
    });
    return div.innerHTML;
}

function saveSel() { const sel = window.getSelection(); if (sel && sel.rangeCount) savedSel = sel.getRangeAt(0).cloneRange(); }
function restSel() { if (savedSel) { const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(savedSel); } }

function toggleDD(id) {
    const dd = document.getElementById(id);
    if (!dd) return;
    const isOpen = dd.classList.contains('open');
    closeAllDD();
    if (!isOpen) dd.classList.add('open');
}
function closeAllDD() { document.querySelectorAll('.dd.open').forEach(d => d.classList.remove('open')); }

function setBlock(tag, label) {
    editorElement?.focus();
    pushUndo();
    document.execCommand('formatBlock', false, '<' + tag + '>');
    const btn = document.getElementById('dd-blk-t');
    if (btn) btn.textContent = label || BMAP[tag] || tag;
    closeAllDD();
    pushUndo();
}

function setFont(font, label) {
    // Restaurar selección antes de aplicar fuente (el click en la toolbar la pierde)
    editorElement?.focus();
    restSel();
    const sel = window.getSelection();
    // Si no hay selección, seleccionar todo el contenido del editor
    if (!sel || !sel.rangeCount || sel.isCollapsed) {
        const range = document.createRange();
        range.selectNodeContents(editorElement);
        sel.removeAllRanges();
        sel.addRange(range);
    }
    pushUndo();
    document.execCommand('fontName', false, font);
    fixFontTags(font);
    const btn = document.getElementById('dd-fnt-t');
    if (btn) btn.textContent = label || font;
    closeAllDD();
    pushUndo();
}

function fixFontTags(font) {
    editorElement.querySelectorAll('font[face]').forEach(el => {
        el.style.fontFamily = el.getAttribute('face');
        el.removeAttribute('face');
    });
}

function adjSz(delta) {
    editorElement?.focus();
    restSel();
    const inp = document.getElementById('sz-inp');
    const cur = parseInt(inp?.value || '15');
    const idx = SZSTEPS.indexOf(cur);
    let nxt;
    if (idx === -1) nxt = delta > 0 ? SZSTEPS.find(s => s > cur) : [...SZSTEPS].reverse().find(s => s < cur);
    else nxt = SZSTEPS[idx + delta];
    if (!nxt) return;
    pushUndo();
    document.execCommand('fontSize', false, '7');
    editorElement.querySelectorAll('font[size="7"]').forEach(el => {
        el.removeAttribute('size');
        el.style.fontSize = nxt + 'px';
    });
    if (inp) inp.value = nxt;
    pushUndo();
}

function cmd(c) {
    editorElement?.focus();
    restSel();
    pushUndo();
    document.execCommand(c, false, null);
    updateToolbar();
    pushUndo();
}

function updateToolbar() {
    try {
        document.getElementById('bt-b')?.classList.toggle('active', document.queryCommandState('bold'));
        document.getElementById('bt-i')?.classList.toggle('active', document.queryCommandState('italic'));
        document.getElementById('bt-u')?.classList.toggle('active', document.queryCommandState('underline'));
        document.getElementById('bt-s')?.classList.toggle('active', document.queryCommandState('strikeThrough'));
        const sel = window.getSelection();
        if (sel && sel.rangeCount) {
            const node = sel.getRangeAt(0).startContainer;
            let el = node.nodeType === 3 ? node.parentElement : node;
            if (editorElement && !editorElement.contains(el)) return;
            const cs = window.getComputedStyle(el);
            const fs = parseFloat(cs.fontSize);
            if (!isNaN(fs)) {
                const inp = document.getElementById('sz-inp');
                const closest = SZSTEPS.reduce((a, b) => Math.abs(b - fs) < Math.abs(a - fs) ? b : a);
                if (inp) inp.value = closest;
            }
            const ff = cs.fontFamily.replace(/['"]/g, '').split(',')[0].trim().toLowerCase();
            const mapped = FMAP[ff] || '';
            const fntBtn = document.getElementById('dd-fnt-t');
            if (fntBtn) fntBtn.textContent = mapped || 'Sistema';
            let blkEl = el;
            while (blkEl && blkEl !== editorElement) {
                const tag = blkEl.tagName?.toLowerCase();
                if (BMAP[tag]) { const blkBtn = document.getElementById('dd-blk-t'); if (blkBtn) blkBtn.textContent = BMAP[tag]; break; }
                blkEl = blkEl.parentElement;
            }
        }
    } catch (_) {}
}

function applyCol(type) {
    const pal = document.getElementById(type === 'fore' ? 'pal-fore' : 'pal-back');
    const colorEl = pal?.querySelector('.pal-cur');
    const color = colorEl?.dataset.color || (type === 'fore' ? sF : sH);
    applyColDirect(type, color);
}

function togglePal(id) {
    const pal = document.getElementById(id);
    if (!pal) return;
    const isOpen = pal.classList.contains('open');
    closeAllPals();
    if (!isOpen) pal.classList.add('open');
}
function closeAllPals() { document.querySelectorAll('.pal-wrap.open').forEach(p => p.classList.remove('open')); }

function applyColDirect(type, color) {
    editorElement?.focus(); restSel();
    pushUndo();
    if (type === 'fore') { document.execCommand('foreColor', false, color); sF = color; }
    else { document.execCommand('hiliteColor', false, color); sH = color; }
    const pal = document.getElementById(type === 'fore' ? 'pal-fore' : 'pal-back');
    const cur = pal?.querySelector('.pal-cur');
    if (cur) { cur.style.background = color; cur.dataset.color = color; }
    closeAllPals(); pushUndo();
}

function openCode() {
    const ta = document.getElementById('html-ta');
    if (ta) ta.value = editorElement?.innerHTML || '';
    openOv('ov-code');
    setTimeout(() => document.getElementById('html-ta')?.focus(), 60);
}

function saveCode() {
    const ta = document.getElementById('html-ta');
    if (!ta || !editorElement) return;
    pushUndo();
    editorElement.innerHTML = ta.value;
    closeOv('ov-code');
    pushUndo();
    updateWC();
}

function openOv(id) { document.getElementById(id)?.classList.add('open'); }
function closeOv(id) { document.getElementById(id)?.classList.remove('open'); }

function doTable() {
    const r = parseInt(document.getElementById('tb-r')?.value) || 3;
    const c = parseInt(document.getElementById('tb-c')?.value) || 3;
    const w = parseInt(document.getElementById('tb-w')?.value) || 100;
    const b = parseInt(document.getElementById('tb-b')?.value) || 1;
    const bs = document.getElementById('tb-bs')?.value || 'solid';
    const bc = document.getElementById('tb-bc')?.value;
    const hd = document.getElementById('tb-hd')?.checked;
    const st = document.getElementById('tb-st')?.checked;
    const bdr = b > 0 ? `${b}px ${bs} ${bc}` : 'none';
    const cw = Math.round(100 / c);
    let html = `<table style="border-collapse:collapse;width:${w}%;margin:8px 0">`;
    for (let i = 0; i < r; i++) {
        const stripe = st && i > 0 && i % 2 === 0 ? 'background:#f8f9fa;' : '';
        html += '<tr>';
        for (let j = 0; j < c; j++) {
            const isH = hd && i === 0;
            const tag = isH ? 'th' : 'td';
            const sty = isH ? 'background:#f1f3f4;font-weight:600;' : stripe;
            html += `<${tag} style="border:${bdr};padding:8px 12px;min-width:30px;width:${cw}%;${sty}">${isH ? 'Columna '+(j+1) : '&nbsp;'}</${tag}>`;
        }
        html += '</tr>';
    }
    html += '</table><p><br></p>';
    pushUndo();
    editorElement.focus();
    document.execCommand('insertHTML', false, html);
    closeOv('ov-tbl');
    pushUndo();
}

function addTblRz(table) {
    table.querySelectorAll('td,th').forEach(cell => {
        if (!cell.querySelector('.col-rz')) { const rz = document.createElement('div'); rz.className = 'col-rz'; rz.addEventListener('mousedown', startColRz); cell.appendChild(rz); }
        if (!cell.querySelector('.row-rz')) { const rz = document.createElement('div'); rz.className = 'row-rz'; rz.addEventListener('mousedown', startRowRz); cell.appendChild(rz); }
    });
}

let crzOn=false,crzColIdx=-1,crzTable=null,crzX=0,crzStartW=0;
function startColRz(ev) {
    ev.preventDefault(); ev.stopPropagation();
    const cell = ev.target.closest('td,th');
    crzTable = cell.closest('table'); crzColIdx = [...cell.parentElement.cells].indexOf(cell);
    crzX = ev.clientX; crzStartW = cell.offsetWidth;
    [...crzTable.rows].forEach(row => { const c = row.cells[crzColIdx]; if (c) { c.style.minWidth = c.offsetWidth+'px'; c.style.width=''; } });
    crzTable.style.tableLayout = 'auto'; crzTable.style.width = 'auto';
    crzOn = true; ev.target.classList.add('on'); document.body.style.cursor = 'col-resize';
    document.addEventListener('mousemove', doColRz); document.addEventListener('mouseup', stopColRz);
}
function doColRz(ev) { if (!crzOn || crzColIdx < 0) return; const nw = Math.max(30, crzStartW + ev.clientX - crzX);[...crzTable.rows].forEach(row => { const c = row.cells[crzColIdx]; if (c) c.style.minWidth = nw+'px'; }); }
function stopColRz() { crzOn=false; document.body.style.cursor=''; document.querySelectorAll('.col-rz.on').forEach(r=>r.classList.remove('on')); document.removeEventListener('mousemove',doColRz); document.removeEventListener('mouseup',stopColRz); pushUndo(); }

let rrzOn=false,rrzRow=null,rrzY=0,rrzH=0;
function startRowRz(ev) { ev.preventDefault(); ev.stopPropagation(); rrzOn=true; rrzRow=ev.target.closest('tr'); rrzY=ev.clientY; rrzH=rrzRow.offsetHeight; ev.target.classList.add('on'); document.body.style.cursor='row-resize'; document.addEventListener('mousemove',doRowRz); document.addEventListener('mouseup',stopRowRz); }
function doRowRz(ev) { if (!rrzOn) return; const nh=Math.max(20,rrzH+ev.clientY-rrzY);[...rrzRow.querySelectorAll('td,th')].forEach(c=>{c.style.height=nh+'px';c.style.minHeight=nh+'px';}); }
function stopRowRz() { rrzOn=false; document.body.style.cursor=''; document.querySelectorAll('.row-rz.on').forEach(r=>r.classList.remove('on')); document.removeEventListener('mousemove',doRowRz); document.removeEventListener('mouseup',stopRowRz); pushUndo(); }

let ctxTd = null;
function closeTctx() { document.getElementById('tctx')?.classList.remove('open'); }

function tca(action) {
    if (!ctxTd) return; pushUndo();
    const tbl=ctxTd.closest('table'), row=ctxTd.closest('tr');
    const rows=[...tbl.querySelectorAll('tr')], cells=[...row.querySelectorAll('td,th')];
    const cIdx=cells.indexOf(ctxTd), cCount=rows[0].querySelectorAll('td,th').length, sty=ctxTd.style.cssText;
    if (action==='rowAbove'||action==='rowBelow') {
        const nr=document.createElement('tr');
        for (let i=0;i<cCount;i++){const td=document.createElement('td');td.style.cssText=sty;td.innerHTML='&nbsp;';nr.appendChild(td);}
        action==='rowAbove'?row.before(nr):row.after(nr); addTblRz(tbl);
    } else if (action==='colLeft'||action==='colRight') {
        rows.forEach((r,ri)=>{const rc=[...r.querySelectorAll('td,th')];const ref=rc[cIdx];const nc=document.createElement(ri===0&&tbl.querySelector('th')?'th':'td');nc.style.cssText=sty;nc.innerHTML='&nbsp;';action==='colLeft'?ref.before(nc):ref.after(nc);});
        addTblRz(tbl);
    } else if (action==='delRow'){if(rows.length>1)row.remove();}
    else if (action==='delCol'){if(cCount>1)rows.forEach(r=>{const c=r.querySelectorAll('td,th')[cIdx];if(c)c.remove();});}
    else if (action==='delTable') tbl.remove();
    closeTctx(); pushUndo(); updateWC();
}

function openLnk() {
    saveSel();
    const sel = window.getSelection();
    const lnkTxt = document.getElementById('lnk-txt');
    const lnkUrl = document.getElementById('lnk-url');
    if (lnkTxt) lnkTxt.value = sel ? sel.toString() : '';
    if (lnkUrl) lnkUrl.value = 'https://';
    openOv('ov-lnk');
    setTimeout(() => document.getElementById('lnk-url')?.focus(), 60);
}

function doLink() {
    const url = document.getElementById('lnk-url')?.value.trim();
    const txt = document.getElementById('lnk-txt')?.value.trim() || url;
    const tgt = document.getElementById('lnk-tgt')?.value;
    if (!url || url === 'https://') { closeOv('ov-lnk'); return; }
    pushUndo(); editorElement?.focus(); restSel();
    document.execCommand('insertHTML', false, `<a href="${url}" target="${tgt}" style="color:#1a56db">${txt}</a>`);
    closeOv('ov-lnk'); pushUndo(); savedSel = null;
}

function insertImg(input) {
    const file = input.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
        const tmp = new Image(); tmp.src = ev.target.result;
        tmp.onload = () => {
            const maxW = editorElement.clientWidth - 60, w = Math.min(tmp.naturalWidth, maxW);
            pushUndo(); editorElement.focus(); restSel();
            const img = document.createElement('img'); img.src = ev.target.result; img.alt = file.name.replace(/\.[^.]+$/, '');
            const sel = window.getSelection();
            if (sel && sel.rangeCount) { const range = sel.getRangeAt(0); range.collapse(false); range.insertNode(img); range.setStartAfter(img); range.collapse(true); sel.removeAllRanges(); sel.addRange(range); }
            else editorElement.appendChild(img);
            img.style.width = w + 'px';
            makeResizable(img);
            const p = document.createElement('p'); p.innerHTML = '<br>'; img.closest('.img-wrap')?.after(p);
            pushUndo();
        };
    };
    reader.readAsDataURL(file); input.value = '';
}

function makeResizable(img) {
    if (img.closest && img.closest('.img-wrap')) return;
    const oD=img.style.display||'', oM=img.style.margin||'', oF=img.style.float||'', oA=img.getAttribute('align')||'';
    const aW=img.getAttribute('width'), sW=img.style.width, nW=img.naturalWidth;
    const wrap=document.createElement('span'); wrap.className='img-wrap'; wrap.contentEditable='false';
    let wD='inline-block', wM='', wF='';
    if (oF==='left'){wF='left';wM='0 12px 8px 0';}
    else if(oF==='right'){wF='right';wM='0 0 8px 12px';}
    else if(oD==='block'||(oM&&oM.includes('auto'))||oA==='center'){wD='block';wM=oM||'0 auto';}
    let wW=sW||(aW?aW+'px':(nW?Math.min(nW,editorElement.clientWidth-60)+'px':'300px'));
    if(sW==='100%')wW='100%';
    wrap.style.cssText=`display:${wD};position:relative;line-height:0;vertical-align:bottom;width:${wW};max-width:100%;${wF?'float:'+wF+';':''}${wM?'margin:'+wM+';':''}`;
    img.style.width='100%'; img.style.height='auto'; img.style.display='block'; img.style.margin='0'; img.style.float=''; img.removeAttribute('align'); img.draggable=false; img.style.pointerEvents='none'; img.style.userSelect='none';
    if(img.parentNode) img.parentNode.insertBefore(wrap, img);
    wrap.appendChild(img);
    ['nw','n','ne','w','e','sw','s','se'].forEach(pos=>{ const h=document.createElement('span'); h.className=`rh rh-${pos}`; h.dataset.pos=pos; h.addEventListener('mousedown',startRz); wrap.appendChild(h); });
    wrap.addEventListener('mousedown', ev=>{ if(ev.target.classList.contains('rh')) return; ev.stopPropagation(); deselImg(); wrap.classList.add('sel'); });
}

function deselImg() { document.querySelectorAll('.img-wrap.sel').forEach(w=>w.classList.remove('sel')); }

let rsOn=false,rsWrap=null,rsX=0,rsY=0,rsW=0,rsH=0,rsPos='';
function startRz(ev) {
    ev.preventDefault(); ev.stopPropagation();
    rsOn=true; rsWrap=ev.target.closest('.img-wrap'); rsX=ev.clientX; rsY=ev.clientY; rsW=rsWrap.offsetWidth; rsH=rsWrap.offsetHeight; rsPos=ev.target.dataset.pos;
    deselImg(); rsWrap.classList.add('sel');
    document.addEventListener('mousemove',doRz); document.addEventListener('mouseup',stopRz);
}
function doRz(ev) {
    if(!rsOn)return;
    const dx=ev.clientX-rsX, dy=ev.clientY-rsY, maxW=editorElement.clientWidth-60;
    let nw=rsW;
    if(rsPos.includes('e'))nw=rsW+dx; else if(rsPos.includes('w'))nw=rsW-dx;
    if(rsPos==='n')nw=rsW-(dy*rsW/rsH); else if(rsPos==='s')nw=rsW+(dy*rsW/rsH);
    rsWrap.style.width=Math.round(Math.max(30,Math.min(maxW,nw)))+'px';
}
function stopRz() { rsOn=false; document.removeEventListener('mousemove',doRz); document.removeEventListener('mouseup',stopRz); pushUndo(); }