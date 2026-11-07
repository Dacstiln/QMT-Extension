// app/js/templates.js

// DEBUG HELPERS
const TMPL_START_TIME = Date.now();
function tmplNow() { return `+${((Date.now() - TMPL_START_TIME)/1000).toFixed(2)}s`; }
function tmplLog(fn, msg, data = {}) {
    const ts = new Date().toISOString();
    console.log(`[TMPL][${tmplNow()}][${ts}][${fn}] ${msg}`, data);
}
function tmplWarn(fn, msg, data = {}) {
    const ts = new Date().toISOString();
    console.warn(`[TMPL-WARN][${tmplNow()}][${ts}][${fn}] ${msg}`, data);
}
function tmplError(fn, msg, data = {}) {
    const ts = new Date().toISOString();
    console.error(`[TMPL-ERROR][${tmplNow()}][${ts}][${fn}] ${msg}`, data);
}

// PROXY PARA DETECTAR QUIÉN MODIFICA window.mockTemplates
(function setupMockTemplatesProxy() {
    let _realTemplates = [];
    Object.defineProperty(window, 'mockTemplates', {
        get() { return _realTemplates; },
        set(newVal) {
            const ts = new Date().toISOString();
            const prev = _realTemplates.length;
            const next = Array.isArray(newVal) ? newVal.length : '¡NO ES ARRAY!';
            if (Array.isArray(newVal) && newVal.length === 0 && prev > 0) {
                console.warn(`[TMPL-PROXY][${ts}] mockTemplates VACIADO: ${prev} → 0 items`);
                console.trace('[TMPL-PROXY] mockTemplates = [] STACK TRACE');
            } else {
                console.log(`[TMPL-PROXY][${ts}] mockTemplates SET: ${prev} → ${next} items`);
                if (prev === 0 && Array.isArray(newVal) && newVal.length > 0) {
                    console.log(`[TMPL-PROXY][${ts}] mockTemplates CARGADO con ${next} items`);
                }
            }
            _realTemplates = newVal;
        },
        configurable: true
    });
    tmplLog('setupMockTemplatesProxy', 'Proxy de window.mockTemplates instalado');
})();

window.mockTemplates = [];

// Estado de ordenamiento persistente entre navegaciones
window._qmtSortState = window._qmtSortState || { sortBy: 'date', sortOrder: 'desc' };

window._qmtViewState = window._qmtViewState || { search: '', scrollTop: 0, activeTag: null };

function sendMessage(type, data = {}) {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ type, ...data }, (response) => {
            if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
            else resolve(response);
        });
    });
}

function parseDateValue(value) {
    if (!value) return new Date();
    if (typeof value === 'string' || typeof value === 'number') return new Date(value);
    if (typeof value.toDate === 'function') return value.toDate();
    if (typeof value.seconds === 'number') return new Date(value.seconds * 1000 + (value.nanoseconds || 0) / 1e6);
    return new Date();
}

function normalizeTemplate(template = {}) {
    return {
        id: template.id ?? template.shortcode ?? Date.now(),
        name: template.name || template.title || 'Plantilla sin título',
        content: template.content || template.preview || '',
        shortcode: template.shortcode || '',
        tags: Array.isArray(template.tags) ? template.tags.map(tag => String(tag)) : [],
        ownerId: typeof template.ownerId === 'string' ? template.ownerId : template.owner || '',
        ownerName: template.ownerName || template.creatorName || '',
        assignedByAdmin: !!template.assignedByAdmin,
        isGlobal: typeof template.isGlobal === 'boolean' ? template.isGlobal : !template.private,
        createdDate: parseDateValue(template.createdAt || template.createdDate).toISOString(),
        modifiedDate: template.updatedAt || template.modifiedDate
            ? parseDateValue(template.updatedAt || template.modifiedDate).toISOString()
            : null,
    };
}

function normalizeTemplateForSave(template) {
    return {
        id: template.id,
        name: template.name || 'Plantilla sin título',
        content: template.content,
        shortcode: template.shortcode,
        tags: Array.isArray(template.tags) ? template.tags.map(tag => String(tag)) : [],
        ownerId: typeof template.ownerId === 'string' ? template.ownerId : '',
        ownerName: template.ownerName || '',
        assignedByAdmin: !!template.assignedByAdmin,
        isGlobal: !!template.isGlobal,
        createdDate: parseDateValue(template.createdDate).toISOString(),
        modifiedDate: template.modifiedDate || new Date().toISOString(),
    };
}

function getTemplatePreview(template) {
    const text = (template.content || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    return text.length > 120 ? text.slice(0, 120) + '...' : text;
}

function persistTemplates() {
    const normalized = window.mockTemplates.map(normalizeTemplateForSave);
    tmplLog('persistTemplates', `Guardando ${normalized.length} templates en chrome.storage.local`);
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({ qmt_templates: normalized }, () => {
            tmplLog('persistTemplates', `${normalized.length} templates guardados en storage`);
        });
    }
}

function getAllExistingTags() {
    const tagsSet = new Set();
    window.mockTemplates.forEach(t => {
        if (Array.isArray(t.tags)) t.tags.forEach(tag => tagsSet.add(tag));
    });
    return Array.from(tagsSet).sort();
}

// SIDEBAR DE ETIQUETAS
window.updateTagsSidebar = function () {
    const nav = document.querySelector('[data-tags-nav]');
    if (!nav) {
        tmplWarn('updateTagsSidebar', 'No se encontró [data-tags-nav] en el DOM');
        return;
    }

    const tagMap = {};
    window.mockTemplates.forEach(t => {
        if (!Array.isArray(t.tags)) return;
        t.tags.forEach(tag => {
            if (!tag) return;
            if (!tagMap[tag]) tagMap[tag] = [];
            tagMap[tag].push(t);
        });
    });

    const tags = Object.keys(tagMap).sort();
    tmplLog('updateTagsSidebar', `Sidebar actualizado: ${tags.length} etiquetas | mockTemplates.length=${window.mockTemplates.length}`);

    if (!tags.length) {
        nav.innerHTML = '<span style="font-size:11px;color:var(--text-muted);padding:4px 8px;display:block">Sin etiquetas</span>';
        return;
    }

    const activeTag = window._qmtViewState.activeTag || null;

    nav.innerHTML = tags.map(tag => {
        const count = tagMap[tag].length;
        const isActive = activeTag && activeTag.toLowerCase() === tag.toLowerCase();
        return `
            <a href="#" class="nav-item tag-filter-item${isActive ? ' active' : ''}" data-tag="${escHtml(tag)}" title="${escHtml(tag)} (${count})">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                    <path d="M2 2h5.5l6.5 6.5-5.5 5.5L2 7.5V2z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
                    <circle cx="5" cy="5" r="1" fill="currentColor"/>
                </svg>
                <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(tag)}</span>
                <span style="font-size:10px;color:var(--text-muted);margin-left:4px">${count}</span>
            </a>
        `;
    }).join('');

    nav.querySelectorAll('.tag-filter-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const tag = item.dataset.tag;
            const isCurrentlyActive = window._qmtViewState.activeTag &&
                window._qmtViewState.activeTag.toLowerCase() === tag.toLowerCase();

            if (document.getElementById('filterSearch')) {
                const searchInput = document.getElementById('filterSearch');
                if (isCurrentlyActive) {
                    window._qmtViewState.activeTag = null;
                    window._qmtViewState.search = '';
                    searchInput.value = '';
                    searchInput.dispatchEvent(new Event('input'));
                } else {
                    window._qmtViewState.activeTag = tag;
                    window._qmtViewState.search = tag;
                    searchInput.value = tag;
                    searchInput.dispatchEvent(new Event('input'));
                }

                window.updateTagsSidebar();
            } else {
                if (isCurrentlyActive) {
                    window._qmtViewState.activeTag = null;
                    window._qmtViewState.search = '';
                } else {
                    window._qmtViewState.activeTag = tag;
                    window._qmtViewState.search = tag;
                }
                window.navigateTo('my-templates');
            }
        });
    });
};

window.loadTemplatesFromStorage = async function () {
    tmplLog('loadTemplatesFromStorage', `Iniciando | mockTemplates.length ANTES=${window.mockTemplates.length} | _authReady=${window._authReady}`);
    try {
        const response = await sendMessage('GET_TEMPLATES');
        tmplLog('loadTemplatesFromStorage', `Respuesta de GET_TEMPLATES: success=${response?.success} | templates=${response?.templates?.length ?? 'N/A'} | error=${response?.error ?? 'ninguno'}`, response);

        if (response.success && Array.isArray(response.templates)) {
            const prevCount = window.mockTemplates.length;
            const incoming = response.templates.map(normalizeTemplate);

            const prevIds = window.mockTemplates.map(t => String(t.id)).join(',');
            const nextIds = incoming.map(t => String(t.id)).join(',');
            const dataSame = prevIds === nextIds && prevCount === incoming.length;

            window.mockTemplates = incoming;
            tmplLog('loadTemplatesFromStorage', `mockTemplates actualizado: ${prevCount} → ${window.mockTemplates.length} items | dataSame=${dataSame}`);
            persistTemplates();

            if (!dataSame || document.getElementById('templatesContainer')?.children.length === 0) {
                if (document.getElementById('templatesContainer')) {
                    tmplLog('loadTemplatesFromStorage', `Renderizando ${window.mockTemplates.length} templates (datos cambiaron o contenedor vacío)`);
                    applyFiltersAndSort();
                }
            } else {
                tmplLog('loadTemplatesFromStorage', `Datos idénticos — saltando rerender`);
            }
        } else if (response.error === 'No autenticado') {
            tmplWarn('loadTemplatesFromStorage', `GET_TEMPLATES respondió "No autenticado" — puede ser estado transitorio (stale auth) | mockTemplates preservados: ${window.mockTemplates.length} items | _authReady=${window._authReady}`);
            if (document.getElementById('templatesContainer') && window.mockTemplates.length > 0) {
                applyFiltersAndSort();
            }
            return;
        } else {
            tmplWarn('loadTemplatesFromStorage', `GET_TEMPLATES error real: ${response?.error} — NO vaciando mockTemplates (${window.mockTemplates.length} items preservados)`);
            if (document.getElementById('templatesContainer') && window.mockTemplates.length > 0) {
                applyFiltersAndSort();
            }
            return;
        }
    } catch (err) {
        tmplError('loadTemplatesFromStorage', `EXCEPCIÓN comunicando con SW: ${err.message} — NO vaciando mockTemplates`);
        if (document.getElementById('templatesContainer') && window.mockTemplates.length > 0) {
            applyFiltersAndSort();
        }
        return;
    }

    window.updateTagsSidebar();
};

function initMyTemplates() {
    tmplLog('initMyTemplates', `Iniciando vista my-templates | mockTemplates.length=${window.mockTemplates.length}`);

    setupFilters();
    setupSorting();
    setupTemplateActions();
    setupBulkActions();

    // Restaurar búsqueda guardada antes de renderizar
    const savedSearch = window._qmtViewState.search || '';
    const searchInput = document.getElementById('filterSearch');
    if (searchInput && savedSearch) {
        searchInput.value = savedSearch;
        tmplLog('initMyTemplates', `Búsqueda restaurada: "${savedSearch}"`);
    }

    // Si ya hay templates en memoria, renderizar inmediatamente para evitar flash vacío
    if (window.mockTemplates.length > 0) {
        tmplLog('initMyTemplates', `Renderizando ${window.mockTemplates.length} templates desde memoria (sin esperar fetch)`);
        applyFiltersAndSort();
        window.updateTagsSidebar();
    }

    // Restaurar scroll después de renderizar
    const savedScroll = window._qmtViewState.scrollTop || 0;
    if (savedScroll > 0) {
        requestAnimationFrame(() => {
            const mainContent = document.querySelector('.main-content') || document.getElementById('view-container');
            if (mainContent) mainContent.scrollTop = savedScroll;
        });
    }

    window.loadTemplatesFromStorage();
}

// FILTROS Y BÚSQUEDA
function setupFilters() {
    const searchFilter = document.getElementById('filterSearch');
    if (!searchFilter) return;

    searchFilter.addEventListener('input', () => {
        window._qmtViewState.search = searchFilter.value;
        const activeTag = window._qmtViewState.activeTag;
        if (activeTag && searchFilter.value.toLowerCase().trim() !== activeTag.toLowerCase()) {
            window._qmtViewState.activeTag = null;
            window.updateTagsSidebar();
        }
        applyFiltersAndSort();
    });
}

function setupSorting() {
    const sortByEl    = document.getElementById('sortBy');
    const sortOrderEl = document.getElementById('sortOrder');

    // Restaurar sorting guardado (ya funcionaba — no se toca la lógica)
    if (sortByEl && window._qmtSortState.sortBy) {
        sortByEl.value = window._qmtSortState.sortBy;
    }
    if (sortOrderEl && window._qmtSortState.sortOrder) {
        sortOrderEl.value = window._qmtSortState.sortOrder;
    }

    sortByEl?.addEventListener('change', () => {
        window._qmtSortState.sortBy = sortByEl.value;
        applyFiltersAndSort();
    });
    sortOrderEl?.addEventListener('change', () => {
        window._qmtSortState.sortOrder = sortOrderEl.value;
        applyFiltersAndSort();
    });
}

function applyFiltersAndSort() {
    const searchInput = document.getElementById('filterSearch');
    const searchVal = (searchInput ? searchInput.value : window._qmtViewState.search || '').toLowerCase().trim();
    const sortBy    = window._qmtSortState.sortBy || 'date';
    const sortOrder = window._qmtSortState.sortOrder || 'desc';

    let filtered = [...window.mockTemplates];

    if (searchVal) {
        filtered = filtered.filter(t =>
            (t.name || '').toLowerCase().includes(searchVal) ||
            (t.content || '').replace(/<[^>]+>/g, ' ').toLowerCase().includes(searchVal) ||
            (t.shortcode || '').toLowerCase().includes(searchVal) ||
            (t.tags || []).some(tag => tag.toLowerCase().includes(searchVal))
        );
    }

    filtered.sort((a, b) => {
        let cmp = 0;
        if (sortBy === 'date') {
            cmp = new Date(a.createdDate) - new Date(b.createdDate);
        } else if (sortBy === 'title') {
            cmp = (a.name || '').localeCompare(b.name || '', 'es', { sensitivity: 'base' });
        } else if (sortBy === 'creator') {
            const na = (a.ownerName || a.ownerId || '').toLowerCase();
            const nb = (b.ownerName || b.ownerId || '').toLowerCase();
            cmp = na.localeCompare(nb, 'es', { sensitivity: 'base' });
        }
        return sortOrder === 'asc' ? cmp : -cmp;
    });

    renderTemplates(filtered);
}

// ===== ACCIONES DE TARJETAS =====
function setupTemplateActions() {
    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('template-select-check')) {
            e.stopPropagation();
            const card = e.target.closest('.template-card');
            if (card) { card.classList.toggle('selected', e.target.checked); updateSelectionUI(); }
            return;
        }
        const card = e.target.closest('.template-card');
        if (card && !e.target.closest('.template-select-check')) {
            // Guardar scroll antes de navegar a edición
            const mainContent = document.querySelector('.main-content') || document.getElementById('view-container');
            if (mainContent) window._qmtViewState.scrollTop = mainContent.scrollTop;
            editTemplate(card.dataset.templateId);
        }
    });
}

// ===== ACCIONES MASIVAS =====
function setupBulkActions() {
    const btnDelete = document.getElementById('btnDeleteSelected');
    const btnTags   = document.getElementById('btnManageTags');
    const tagsOverlay  = document.getElementById('tagsModalOverlay');
    const closeTagsBtn = document.getElementById('closeTagsModal');
    const cancelTagsBtn = document.getElementById('cancelTagsModal');
    const applyTagsBtn  = document.getElementById('applyTagsModal');
    const modalTagInput = document.getElementById('modalTagInput');

const btnImportTemplates = document.getElementById('btnImportTemplates');
if (btnImportTemplates && !btnImportTemplates._bound) {
    btnImportTemplates._bound = true;
    btnImportTemplates.addEventListener('click', () => {
        window.navigateTo('import');
    });
}

    btnDelete?.addEventListener('click', () => {
        const selected = getSelectedTemplateIds();
        if (!selected.length) return;
        showConfirmModal(
            'Eliminar plantillas',
            `¿Eliminar ${selected.length} plantilla${selected.length > 1 ? 's' : ''}? Esta acción no se puede deshacer.`,
            async () => {
                for (const id of selected) {
                    try { await sendMessage('DELETE_TEMPLATE', { templateId: id }); } catch (_) {}
                    const idx = window.mockTemplates.findIndex(t => String(t.id) === String(id));
                    if (idx !== -1) window.mockTemplates.splice(idx, 1);
                }
                persistTemplates();
                applyFiltersAndSort();
                updateSelectionUI();
                window.updateTagsSidebar();
                window.showToast('Plantillas eliminadas', 'success');
            }
        );
    });

    btnTags?.addEventListener('click', () => {
        const selected = getSelectedTemplateIds();
        if (!selected.length) return;
        openTagsModal(selected);
    });

    closeTagsBtn?.addEventListener('click', closeTagsModal);
    cancelTagsBtn?.addEventListener('click', closeTagsModal);
    tagsOverlay?.addEventListener('click', (e) => { if (e.target === tagsOverlay) closeTagsModal(); });

    modalTagInput?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const newTag = modalTagInput.value.trim().toLowerCase().replace(/\s+/g, '-');
            if (!newTag) return;
            addTagOptionToModal(newTag, true);
            modalTagInput.value = '';
        }
    });

    applyTagsBtn?.addEventListener('click', applyTagsToSelected);
}

let _modalSelectedIds = [];

function openTagsModal(templateIds) {
    _modalSelectedIds = templateIds;
    const overlay   = document.getElementById('tagsModalOverlay');
    const subtitle  = document.getElementById('tagsModalSubtitle');
    const list      = document.getElementById('modalTagsList');
    const input     = document.getElementById('modalTagInput');

    subtitle.textContent = `${templateIds.length} plantilla${templateIds.length > 1 ? 's' : ''} seleccionada${templateIds.length > 1 ? 's' : ''}`;

    const selectedTemplates = window.mockTemplates.filter(t => templateIds.includes(String(t.id)));
    const allTags = getAllExistingTags();

    list.innerHTML = '';
    if (!allTags.length) {
        list.innerHTML = '<span style="font-size:12px;color:var(--text-muted)">No hay etiquetas aún. Escribe una arriba.</span>';
    } else {
        allTags.forEach(tag => {
            addTagOptionToModal(tag, selectedTemplates.every(t => (t.tags || []).includes(tag)));
        });
    }

    input.value = '';
    overlay.classList.add('open');
}

function addTagOptionToModal(tag, active = false) {
    const list = document.getElementById('modalTagsList');
    if (list.querySelector(`[data-tag="${CSS.escape(tag)}"]`)) return;
    const btn = document.createElement('button');
    btn.className = 'mt-tag-option' + (active ? ' active' : '');
    btn.dataset.tag = tag;
    btn.textContent = tag;
    btn.addEventListener('click', () => btn.classList.toggle('active'));
    list.appendChild(btn);
}

function closeTagsModal() {
    document.getElementById('tagsModalOverlay')?.classList.remove('open');
    _modalSelectedIds = [];
}

async function applyTagsToSelected() {
    const list = document.getElementById('modalTagsList');
    const activeTags   = Array.from(list.querySelectorAll('.mt-tag-option.active')).map(b => b.dataset.tag);
    const inactiveTags = Array.from(list.querySelectorAll('.mt-tag-option:not(.active)')).map(b => b.dataset.tag);

    window.mockTemplates.forEach(t => {
        if (!_modalSelectedIds.includes(String(t.id))) return;
        activeTags.forEach(tag => { if (!t.tags.includes(tag)) t.tags.push(tag); });
        t.tags = t.tags.filter(tag => !inactiveTags.includes(tag));
    });

    persistTemplates();

    for (const id of _modalSelectedIds) {
        const t = window.mockTemplates.find(m => String(m.id) === String(id));
        if (t) {
            try { await sendMessage('SAVE_TEMPLATE', { template: normalizeTemplateForSave(t) }); } catch (_) {}
        }
    }

    applyFiltersAndSort();
    window.updateTagsSidebar();
    closeTagsModal();
    window.showToast('Etiquetas actualizadas', 'success');
}

// ===== RENDER =====
let _lastRenderKey = '';

function renderTemplates(templates) {
    const container = document.getElementById('templatesContainer');
    if (!container) {
        tmplWarn('renderTemplates', `templatesContainer NO encontrado en el DOM | templates.length=${templates.length}`);
        return;
    }

    const renderKey = templates.map(t => t.id).join(',') + '|' + window._qmtSortState.sortBy + '|' + window._qmtSortState.sortOrder + '|' + (window._qmtViewState.search || '');
    if (renderKey === _lastRenderKey && container.children.length > 0) {
        tmplLog('renderTemplates', `Render saltado — clave idéntica (${templates.length} items)`);
        return;
    }
    _lastRenderKey = renderKey;

    tmplLog('renderTemplates', `Renderizando ${templates.length} templates | mockTemplates.length=${window.mockTemplates.length}`);

    if (!templates.length) {
        if (window.mockTemplates.length > 0) {
            tmplWarn('renderTemplates', `Filtro activo — sin resultados (mockTemplates tiene ${window.mockTemplates.length} items)`);
            container.innerHTML = `
                <div class="empty-state">
                    <svg width="56" height="56" viewBox="0 0 64 64" fill="none">
                        <rect x="12" y="12" width="40" height="40" rx="4" stroke="currentColor" stroke-width="2"/>
                        <path d="M20 24h24M20 32h24M20 40h16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                    </svg>
                    <h3>Sin resultados</h3>
                    <p>Ninguna plantilla coincide con tu búsqueda</p>
                    <button class="btn-primary" id="btnClearSearch">Limpiar búsqueda</button>
                </div>
            `;
            document.getElementById('btnClearSearch')?.addEventListener('click', () => {
                window._qmtViewState.activeTag = null;
                window._qmtViewState.search = '';
                const inp = document.getElementById('filterSearch');
                if (inp) { inp.value = ''; inp.dispatchEvent(new Event('input')); }
                window.updateTagsSidebar();
            });
        } else {
            tmplLog('renderTemplates', 'Renderizando estado vacío (sin templates)');
            container.innerHTML = `
                <div class="empty-state">
                    <svg width="56" height="56" viewBox="0 0 64 64" fill="none">
                        <rect x="12" y="12" width="40" height="40" rx="4" stroke="currentColor" stroke-width="2"/>
                        <path d="M20 24h24M20 32h24M20 40h16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                    </svg>
                    <h3>No hay plantillas</h3>
                    <p>Crea tu primera plantilla para comenzar</p>
                    <button class="btn-primary" id="btnCreateFirstTemplate">Crear plantilla</button>
                </div>
            `;
            setTimeout(() => {
                document.getElementById('btnCreateFirstTemplate')?.addEventListener('click', () => {
                    window.navigateTo('create-template');
                });
            }, 0);
        }
        return;
    }

    container.innerHTML = templates.map(template => {
        const isGlobal      = !!template.isGlobal;
        const isUserAssigned = !!template.assignedByAdmin && !template.isGlobal;
        const badgeHtml = isGlobal
            ? '<span class="admin-badge admin-badge-global">ADMIN</span>'
            : isUserAssigned
                ? '<span class="admin-badge admin-badge-user">USUARIO</span>'
                : '';

        return `
        <div class="template-card" data-template-id="${template.id}">
            <div class="template-card-top">
                <input type="checkbox" class="template-select-check" data-template-id="${template.id}" title="Seleccionar">
                <div class="template-card-info">
                    <div class="template-title">
                        ${escHtml(template.name)}
                        ${badgeHtml}
                    </div>
                    ${template.shortcode ? `<span class="template-shortcode-pill">${escHtml(template.shortcode)}</span>` : ''}
                </div>
            </div>
            <p class="template-preview">${escHtml(getTemplatePreview(template))}</p>
            <div class="template-card-footer">
                <div class="template-tags">
                    ${(template.tags || []).map(tag => `<span class="tag">${escHtml(tag)}</span>`).join('')}
                </div>
                <span class="template-date">${formatDate(template.createdDate)}</span>
            </div>
        </div>
    `}).join('');
}

function escHtml(str) {
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ===== SELECCIÓN =====
function getSelectedTemplateIds() {
    return Array.from(document.querySelectorAll('.template-select-check:checked')).map(cb => cb.dataset.templateId);
}

function updateSelectionUI() {
    const count = getSelectedTemplateIds().length;
    const badge     = document.getElementById('selectedCountBadge');
    const btnDelete = document.getElementById('btnDeleteSelected');
    const btnTags   = document.getElementById('btnManageTags');
    if (badge)     { badge.textContent = count; badge.classList.toggle('visible', count > 0); }
    if (btnDelete) btnDelete.disabled = count === 0;
    if (btnTags)   btnTags.disabled   = count === 0;
}

document.addEventListener('change', (e) => {
    if (e.target.classList.contains('template-select-check')) {
        const card = e.target.closest('.template-card');
        if (card) card.classList.toggle('selected', e.target.checked);
        updateSelectionUI();
    }
});

// ===== ACCIONES DE PLANTILLA =====
function editTemplate(templateId) {
    const template = window.mockTemplates.find(t => String(t.id) === String(templateId));
    if (!template) {
        tmplWarn('editTemplate', `Template id=${templateId} NO encontrado en mockTemplates (${window.mockTemplates.length} items)`);
        window.showToast('Plantilla no encontrada', 'error');
        return;
    }
    window.navigateTo('create-template', { id: templateId });
}

function duplicateTemplate(templateId) {
    const template = window.mockTemplates.find(t => String(t.id) === String(templateId));
    if (!template) return;
    const newTemplate = normalizeTemplate({
        ...template,
        id: Date.now(),
        name: template.name + ' (copia)',
        shortcode: template.shortcode ? template.shortcode + '-copia' : '',
        assignedByAdmin: false,
        isGlobal: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    });
    window.mockTemplates.unshift(newTemplate);
    persistTemplates();
    _lastRenderKey = '';
    applyFiltersAndSort();
    window.updateTagsSidebar();
    window.showToast('Plantilla duplicada', 'success');
}

function deleteTemplate(templateId) {
    const template = window.mockTemplates.find(t => String(t.id) === String(templateId));
    if (!template) return;

    if (template.assignedByAdmin) {
        showConfirmModal(
            'No puedes eliminar esta plantilla',
            'Esta plantilla fue creada por un administrador y no puede ser eliminada por usuarios.',
            null,
            { confirmText: 'Entendido', hideCancel: true, danger: false }
        );
        return;
    }

    showConfirmModal('¿Eliminar plantilla?', 'Esta acción no se puede deshacer.', async () => {
        try { await sendMessage('DELETE_TEMPLATE', { templateId }); } catch (_) {}
        const idx = window.mockTemplates.findIndex(t => String(t.id) === String(templateId));
        if (idx !== -1) {
            window.mockTemplates.splice(idx, 1);
            persistTemplates();
            _lastRenderKey = '';
            applyFiltersAndSort();
            window.updateTagsSidebar();
            window.showToast('Plantilla eliminada', 'success');
        }
    });
}

function formatDate(dateString) {
    const date = new Date(dateString);
    if (isNaN(date)) return '-';
    const diffDays = Math.floor((new Date() - date) / 86400000);
    if (diffDays === 0) return 'Hoy';
    if (diffDays === 1) return 'Ayer';
    if (diffDays < 7)  return `Hace ${diffDays} días`;
    if (diffDays < 30) return `Hace ${Math.floor(diffDays/7)} sem.`;
    if (diffDays < 365) return `Hace ${Math.floor(diffDays/30)} mes${Math.floor(diffDays/30)>1?'es':''}`;
    return date.toLocaleDateString('es-MX', { day:'2-digit', month:'short', year:'numeric' });
}

// ===== EXPORT / IMPORT =====
async function exportUserTemplates() {
    try {
        const response = await sendMessage('GET_ALL_USER_TEMPLATES');
        if (!response.success) throw new Error(response.error);
        const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(response.templates, null, 2));
        const a = document.createElement('a');
        a.href = dataStr;
        a.download = `qmt_backup_${new Date().toISOString().slice(0,10)}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.showToast('Exportación exitosa', 'success');
    } catch (error) {
        window.showToast('Error al exportar: ' + error.message, 'error');
    }
}

async function handleImportFile(file) {
    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const templates = JSON.parse(e.target.result);
            if (!Array.isArray(templates)) throw new Error('Formato de archivo inválido');
            const response = await sendMessage('IMPORT_TEMPLATES_TO_FIREBASE', { templates });
            if (response.success) {
                window.showToast('Importación exitosa', 'success');
                _lastRenderKey = '';
                window.loadTemplatesFromStorage();
            } else throw new Error(response.error);
        } catch (error) {
            window.showToast('Error al importar: ' + error.message, 'error');
        }
    };
    reader.readAsText(file);
}

document.addEventListener('click', (e) => {
    if (e.target.id === 'btnTriggerImport') document.getElementById('importFileInput')?.click();
});
document.addEventListener('change', (e) => {
    if (e.target.id === 'importFileInput') handleImportFile(e.target.files[0]);
});