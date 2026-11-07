(function () {
    'use strict';

    function sendMessage(type, data = {}) {
        return new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({ type, ...data }, (response) => {
                if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
                else resolve(response);
            });
        });
    }

    // ─── Estado ──────────────────────────────────────────────────────────────
    const state = {
        grouped: [],
        allUsers: [],
        editingTemplate: null
    };

    // ─── Helpers modal ───────────────────────────────────────────────────────
    function openModal(id)  { document.getElementById(id)?.classList.add('open'); }
    function closeModal(id) { document.getElementById(id)?.classList.remove('open'); }

    // ─── Init ─────────────────────────────────────────────────────────────────
    window.initAdminView = async function () {
        bindModalEvents();
        renderSkeleton();
        bindViewEvents();
        await Promise.all([loadGroupedTemplates(), loadAllUsers()]);
    };

    // ─── Bind listeners en modales del HTML ──────────────────────────────────
    function bindModalEvents() {
        // ── Modal Editar ──
        const editModal = document.getElementById('adminEditModal');
        if (editModal && !editModal._adminBound) {
            editModal._adminBound = true;

            // X y Cancelar
            document.getElementById('btnAdminEditCancel')?.addEventListener('click', () => {
                closeModal('adminEditModal');
                state.editingTemplate = null;
            });
            document.getElementById('btnAdminEditCancel2')?.addEventListener('click', () => {
                closeModal('adminEditModal');
                state.editingTemplate = null;
            });

            // Guardar
            document.getElementById('btnAdminEditSave')?.addEventListener('click', saveAdminEdit);

            // Cerrar con click en overlay
            editModal.addEventListener('click', (e) => {
                if (e.target === editModal) {
                    closeModal('adminEditModal');
                    state.editingTemplate = null;
                }
            });
        }

        // ── Modal Asignar ──
        const assignModal = document.getElementById('adminAssignModal');
        if (assignModal && !assignModal._adminBound) {
            assignModal._adminBound = true;

            document.getElementById('btnAssignCancel')?.addEventListener('click', () => {
                closeModal('adminAssignModal');
            });
            document.getElementById('btnAssignCancel2')?.addEventListener('click', () => {
                closeModal('adminAssignModal');
            });

            document.getElementById('btnAssignSave')?.addEventListener('click', doAssignTemplate);

            assignModal.addEventListener('click', (e) => {
                if (e.target === assignModal) closeModal('adminAssignModal');
            });
        }
    }

    // ─── Loaders ──────────────────────────────────────────────────────────────
    async function loadGroupedTemplates() {
        try {
            const res = await sendMessage('ADMIN_GET_ALL_TEMPLATES');
            if (!res.success) throw new Error(res.error);
            state.grouped = res.grouped;
            renderStats();
            renderUsersGrid();
        } catch (e) {
            const grid = document.getElementById('adminUsersGrid');
            if (grid) grid.innerHTML = `<div class="admin-error">Error cargando datos: ${e.message}</div>`;
        }
    }

    async function loadAllUsers() {
        try {
            const res = await sendMessage('ADMIN_GET_ALL_USERS');
            if (!res.success) throw new Error(res.error);
            state.allUsers = res.users;
        } catch (e) { console.error('loadAllUsers:', e.message); }
    }

    // ─── Stats ────────────────────────────────────────────────────────────────
    function renderStats() {
        const stats = document.getElementById('adminStats');
        if (!stats) return;
        const totalUsers     = state.grouped.length;
        const totalTemplates = state.grouped.reduce((s, u) => s + u.templates.length, 0);
        const admins         = state.allUsers.filter(u => u.role === 'admin').length;
        stats.innerHTML = `
            <div class="admin-stat-card">
                <span class="admin-stat-num">${totalUsers}</span>
                <span class="admin-stat-label">Usuarios con plantillas</span>
            </div>
            <div class="admin-stat-card">
                <span class="admin-stat-num">${totalTemplates}</span>
                <span class="admin-stat-label">Plantillas totales</span>
            </div>
            <div class="admin-stat-card">
                <span class="admin-stat-num">${admins}</span>
                <span class="admin-stat-label">Administradores</span>
            </div>
        `;
    }

    // ─── Grid ─────────────────────────────────────────────────────────────────
    function renderUsersGrid(filter = '') {
        const grid = document.getElementById('adminUsersGrid');
        if (!grid) return;

        let data = state.grouped;
        if (filter) {
            const f = filter.toLowerCase();
            data = data.map(u => ({
                ...u,
                templates: u.templates.filter(t =>
                    (t.name || '').toLowerCase().includes(f) ||
                    (t.shortcode || '').toLowerCase().includes(f)
                )
            })).filter(u =>
                u.name.toLowerCase().includes(f) ||
                u.email.toLowerCase().includes(f) ||
                u.templates.length > 0
            );
        }

        if (data.length === 0) {
            grid.innerHTML = `<div class="admin-empty">No se encontraron resultados.</div>`;
            return;
        }

        grid.innerHTML = data.map(user => `
            <div class="admin-user-block" data-uid="${esc(user.uid)}">
                <div class="admin-user-header">
                    <div class="admin-user-avatar">${user.name ? user.name.charAt(0).toUpperCase() : '?'}</div>
                    <div class="admin-user-info">
                        <strong class="admin-user-name">${esc(user.name)}</strong>
                        <span class="admin-user-email">${esc(user.email)}</span>
                    </div>
                    <div class="admin-user-actions">
                        <span class="admin-role-badge ${user.role === 'admin' ? 'admin' : 'user'}">
                            ${user.role === 'admin' ? '⚡ Admin' : '👤 User'}
                        </span>
                        <button class="admin-btn-icon"
                            title="${user.role === 'admin' ? 'Quitar admin' : 'Hacer admin'}"
                            data-action="toggle-role"
                            data-uid="${esc(user.uid)}"
                            data-role="${esc(user.role)}">
                            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                                <path d="M2 8h12M10 4l4 4-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                            </svg>
                        </button>
                    </div>
                </div>
                <div class="admin-templates-list">
                    ${user.templates.length === 0
                        ? `<div class="admin-no-templates">Sin plantillas</div>`
                        : user.templates.map(t => {
                            // Determinar tipo de asignación real
                            const isForAll      = !!t.isGlobal;
                            const isForUser     = !!t.assignedByAdmin && !t.isGlobal;
                            const assignBadge   = isForAll
                                ? `<span class="admin-assigned-badge admin-badge-global">🌐 admin</span>`
                                : isForUser
                                    ? `<span class="admin-assigned-badge admin-badge-user">👤 usuario</span>`
                                    : '';
                            return `
                            <div class="admin-template-row">
                                <div class="admin-template-info">
                                    <span class="admin-template-name">${esc(t.name || t.title || 'Sin título')}</span>
                                    ${t.shortcode ? `<span class="admin-template-shortcode">${esc(t.shortcode)}</span>` : ''}
                                    ${assignBadge}
                                </div>
                                <div class="admin-template-actions">
                                    <button class="admin-btn-icon" title="Editar"
                                        data-action="edit-template"
                                        data-template-id="${esc(String(t.id))}"
                                        data-owner-uid="${esc(user.uid)}">
                                        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                                            <path d="M11 2l3 3-9 9H2v-3L11 2z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                                        </svg>
                                    </button>
                                    <button class="admin-btn-icon danger" title="Eliminar"
                                        data-action="delete-template"
                                        data-template-id="${esc(String(t.id))}"
                                        data-template-name="${esc(t.name || 'esta plantilla')}"
                                        data-is-global="${isForAll ? '1' : '0'}"
                                        data-assigned-by-admin="${t.assignedByAdmin ? '1' : '0'}">
                                        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                                            <path d="M3 4h10M5 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1M6 7v5M10 7v5M4 4v9a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                                        </svg>
                                    </button>
                                </div>
                            </div>
                        `}).join('')
                    }
                </div>
                <div class="admin-user-footer">
                    <button class="admin-btn-assign"
                        data-action="assign-to-user"
                        data-uid="${esc(user.uid)}">
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                            <path d="M8 3v10M3 8h10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                        </svg>
                        Asignar plantilla
                    </button>
                </div>
            </div>
        `).join('');
    }

    // ─── Event delegation (un solo listener en el grid) ───────────────────────
    function bindViewEvents() {
        document.getElementById('adminSearch')?.addEventListener('input', (e) => {
            renderUsersGrid(e.target.value);
        });

        document.getElementById('btnAdminAssignAll')?.addEventListener('click', () => {
            openAssignModal('');
        });

        // Delegation en el grid: captura editar, eliminar, toggle-role, asignar
        const grid = document.getElementById('adminUsersGrid');
        if (!grid) return;

        grid.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-action]');
            if (!btn) return;
            const action = btn.dataset.action;
            if      (action === 'toggle-role')     handleToggleRole(btn.dataset.uid, btn.dataset.role);
            else if (action === 'edit-template')   handleEditTemplate(btn.dataset.templateId, btn.dataset.ownerUid);
            else if (action === 'delete-template') handleDeleteTemplate(btn.dataset.templateId, btn.dataset.templateName, btn.dataset.isGlobal === '1', btn.dataset.assignedByAdmin === '1');
            else if (action === 'assign-to-user')  openAssignModal(btn.dataset.uid);
        });
    }

    // ─── Handlers ─────────────────────────────────────────────────────────────
    async function handleToggleRole(uid, currentRole) {
        const newRole = currentRole === 'admin' ? 'user' : 'admin';
        if (!confirm(`¿Cambiar el rol de este usuario a "${newRole}"?`)) return;
        try {
            const res = await sendMessage('ADMIN_SET_USER_ROLE', { uid, role: newRole });
            if (!res.success) throw new Error(res.error);
            await Promise.all([loadGroupedTemplates(), loadAllUsers()]);
        } catch (e) { alert('Error cambiando rol: ' + e.message); }
    }

    function handleEditTemplate(templateId, ownerUid) {
        const user     = state.grouped.find(u => u.uid === ownerUid);
        const template = user?.templates.find(t => String(t.id) === String(templateId));
        if (!template) { alert('Plantilla no encontrada'); return; }

        // Guardar copia completa preservando assignment original
        state.editingTemplate = { ...template, _ownerUid: ownerUid };

        document.getElementById('adminEditName').value      = template.name || template.title || '';
        document.getElementById('adminEditShortcode').value = template.shortcode || '';
        document.getElementById('adminEditContent').value   = template.content || template.preview || '';
        openModal('adminEditModal');
    }

    async function saveAdminEdit() {
        const t = state.editingTemplate;
        if (!t) return;

        const name      = document.getElementById('adminEditName').value.trim();
        const shortcode = document.getElementById('adminEditShortcode').value.trim();
        const content   = document.getElementById('adminEditContent').value;
        if (!name) { alert('El nombre es obligatorio'); return; }

        const btn = document.getElementById('btnAdminEditSave');
        btn.disabled = true; btn.textContent = 'Guardando...';

        try {
            // Preservar campos de asignación originales — NO sobrescribir con defaults
            const updatedData = {
                ...t,
                name,
                shortcode,
                content,
                preview: content.replace(/<[^>]+>/g, '').trim().slice(0, 150),
                // Preservar explícitamente la asignación original
                assignedByAdmin: t.assignedByAdmin,
                isGlobal: t.isGlobal,
                ownerId: t.ownerId,
                ownerName: t.ownerName,
            };
            // Quitar campo interno antes de enviar
            delete updatedData._ownerUid;

            const res = await sendMessage('ADMIN_UPDATE_TEMPLATE', {
                templateId: String(t.id),
                ownerUid: t._ownerUid,
                templateData: updatedData
            });
            if (!res.success) throw new Error(res.error);
            closeModal('adminEditModal');
            state.editingTemplate = null;
            await loadGroupedTemplates();
        } catch (e) {
            alert('Error guardando: ' + e.message);
        } finally {
            btn.disabled = false; btn.textContent = 'Guardar cambios';
        }
    }

    function handleDeleteTemplate(templateId, name, isGlobal, assignedByAdmin) {
        const msg = isGlobal
            ? `¿Eliminar la plantilla "${name}"?\nEra una plantilla para TODOS los usuarios — se eliminará para todos.`
            : assignedByAdmin
                ? `¿Eliminar la plantilla "${name}"?\nFue asignada a un usuario específico — se eliminará de su lista.`
                : `¿Eliminar la plantilla "${name}"?\nEsta acción no se puede deshacer.`;

        if (!confirm(msg)) return;
        doDelete(templateId, isGlobal);
    }

    async function doDelete(templateId, isGlobal) {
        try {
            const res = await sendMessage('ADMIN_DELETE_TEMPLATE', { templateId, propagate: isGlobal });
            if (!res.success) throw new Error(res.error);
            await loadGroupedTemplates();
        } catch (e) { alert('Error eliminando: ' + e.message); }
    }

    // ─── Modal asignar ────────────────────────────────────────────────────────
    function openAssignModal(preselectedUid = '') {
        const userSelect = document.getElementById('assignUserSelect');
        if (!userSelect) return;

        userSelect.innerHTML =
            `<option value="">── Todos los usuarios ──</option>` +
            state.allUsers.map(u =>
                `<option value="${esc(u.uid)}" ${u.uid === preselectedUid ? 'selected' : ''}>
                    ${esc(u.name || u.email)}
                </option>`
            ).join('');

        // Limpiar campos
        const assignName      = document.getElementById('assignName');
        const assignShortcode = document.getElementById('assignShortcode');
        const assignContent   = document.getElementById('assignContent');
        if (assignName)      assignName.value      = '';
        if (assignShortcode) assignShortcode.value = '';
        if (assignContent)   assignContent.value   = '';

        openModal('adminAssignModal');
    }

    async function doAssignTemplate() {
        const uid      = document.getElementById('assignUserSelect').value;
        const name     = (document.getElementById('assignName')?.value || '').trim();
        const shortcode= (document.getElementById('assignShortcode')?.value || '').trim();
        const content  = document.getElementById('assignContent')?.value || '';

        if (!name) { alert('El nombre de la plantilla es obligatorio'); return; }
        if (!content.trim()) { alert('El contenido no puede estar vacío'); return; }

        const isGlobal = !uid; // Si no hay usuario específico → para todos

        const templateData = {
            name,
            shortcode,
            content,
            preview: content.replace(/<[^>]+>/g, '').trim().slice(0, 150),
            tags: [],
            assignedByAdmin: true,
            isGlobal,
        };

        const dest = uid
            ? `al usuario seleccionado`
            : `a TODOS los usuarios (${state.allUsers.length})`;

        if (!confirm(`¿Asignar "${name}" ${dest}?`)) return;

        const btn = document.getElementById('btnAssignSave');
        btn.disabled = true; btn.textContent = 'Asignando...';

        try {
            const res = await sendMessage('ADMIN_ASSIGN_TEMPLATE', {
                templateData,
                targetUserIds: uid ? [uid] : []
            });
            if (!res.success) throw new Error(res.error);
            closeModal('adminAssignModal');
            await loadGroupedTemplates();
            alert('✅ Plantilla asignada correctamente');
        } catch (e) {
            alert('Error asignando: ' + e.message);
        } finally {
            btn.disabled = false; btn.textContent = 'Asignar plantilla';
        }
    }

    // ─── Skeleton ─────────────────────────────────────────────────────────────
    function renderSkeleton() {
        const stats = document.getElementById('adminStats');
        const grid  = document.getElementById('adminUsersGrid');
        if (stats) stats.innerHTML = '<span class="admin-loading">Cargando estadísticas...</span>';
        if (grid)  grid.innerHTML  = '<span class="admin-loading">Cargando usuarios y plantillas...</span>';
    }

    function esc(str) {
        return String(str ?? '')
            .replace(/&/g,'&amp;').replace(/</g,'&lt;')
            .replace(/>/g,'&gt;').replace(/"/g,'&quot;')
            .replace(/'/g,'&#39;');
    }

})();