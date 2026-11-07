// Debug
const APP_START_TIME = Date.now();
function appNow() { return `+${((Date.now() - APP_START_TIME)/1000).toFixed(2)}s`; }
function appLog(fn, msg, data = {}) {
    const ts = new Date().toISOString();
    console.log(`[APP][${appNow()}][${ts}][${fn}] ${msg}`, data);
}
function appWarn(fn, msg, data = {}) {
    const ts = new Date().toISOString();
    console.warn(`[APP-WARN][${appNow()}][${ts}][${fn}] ${msg}`, data);
}
function appError(fn, msg, data = {}) {
    const ts = new Date().toISOString();
    console.error(`[APP-ERROR][${appNow()}][${ts}][${fn}] ${msg}`, data);
}

appLog('APP_INIT', 'app.js evaluado — documento cargando');

// Noficaciones Toast
window.showToast = function(message, type = 'success', duration = 3500) {
    let container = document.getElementById('qmt-toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'qmt-toast-container';
        container.style.cssText = `
            position:fixed;bottom:24px;right:24px;z-index:99999;
            display:flex;flex-direction:column;gap:8px;pointer-events:none;
        `;
        document.body.appendChild(container);
    }
    const colors = {
        success:{ bg:'#22c55e', icon:'✓' },
        error:  { bg:'#ef4444', icon:'✕' },
        info:   { bg:'#3b82f6', icon:'ℹ' },
        warning:{ bg:'#f59e0b', icon:'⚠' }
    };
    const c = colors[type] || colors.info;
    const toast = document.createElement('div');
    toast.style.cssText = `
        display:flex;align-items:center;gap:10px;
        background:var(--bg-primary,#fff);border:1px solid var(--border-color,#e5e7eb);
        border-left:4px solid ${c.bg};border-radius:10px;
        padding:12px 16px;min-width:260px;max-width:380px;
        box-shadow:0 4px 20px rgba(0,0,0,.12);pointer-events:all;
        animation:qmt-toast-in .25s ease;font-size:13px;color:var(--text-primary,#111);
    `;
    toast.innerHTML = `
        <span style="width:20px;height:20px;border-radius:50%;background:${c.bg};color:#fff;
            display:flex;align-items:center;justify-content:center;font-size:11px;
            font-weight:700;flex-shrink:0">${c.icon}</span>
        <span style="flex:1">${message}</span>
        <button style="background:none;border:none;cursor:pointer;color:var(--text-muted,#888);
            font-size:16px;padding:0;line-height:1;flex-shrink:0"
            onclick="this.closest('div').remove()">×</button>
    `;
    if (!document.getElementById('qmt-toast-style')) {
        const s = document.createElement('style');
        s.id = 'qmt-toast-style';
        s.textContent = `
            @keyframes qmt-toast-in{from{opacity:0;transform:translateX(30px)}to{opacity:1;transform:none}}
            @keyframes qmt-toast-out{from{opacity:1}to{opacity:0;transform:translateX(30px)}}
        `;
        document.head.appendChild(s);
    }
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.animation = 'qmt-toast-out .25s ease forwards';
        setTimeout(() => toast.remove(), 260);
    }, duration);
};

// Mensajes
let sendMessageCount = 0;
function sendMessage(type, data = {}) {
    sendMessageCount++;
    const msgNum = sendMessageCount;
    appLog('sendMessage', `MSG #${msgNum} tipo=${type}`, data);
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ type, ...data }, (response) => {
            if (chrome.runtime.lastError) {
                appError('sendMessage', `MSG #${msgNum} tipo=${type} → ERROR: ${chrome.runtime.lastError.message}`);
                reject(chrome.runtime.lastError);
            } else {
                appLog('sendMessage', `MSG #${msgNum} tipo=${type} → respuesta recibida`, response);
                resolve(response);
            }
        });
    });
}

// REAL-TIME USER UPDATE
function updateUserUIInRealTime(user, userData) {
    appLog('updateUserUIInRealTime', `Actualizando UI con user=${user?.uid} name=${userData?.name}`);
    document.querySelectorAll('.user-name').forEach(el => {
        el.textContent = userData.name || user.email || 'Usuario';
    });
    let avatarUrl = userData.avatarUrl ||
        `https://ui-avatars.com/api/?name=${encodeURIComponent(userData.name || 'U')}&background=000&color=fff`;
    if (!avatarUrl.startsWith('data:')) {
        avatarUrl += (avatarUrl.includes('?') ? '&' : '?') + 't=' + Date.now();
    }
    document.querySelectorAll('.user-avatar').forEach(el => { el.src = avatarUrl; });
    if (userData.email) {
        document.querySelectorAll('[data-user-email]').forEach(el => { el.textContent = userData.email; });
    }
}

chrome.runtime.onMessage.addListener((message) => {
    appLog('onMessage', `Mensaje recibido en app.js tipo=${message.type}`);
    if (message.type === 'USER_DATA_CHANGED') {
        appLog('onMessage:USER_DATA_CHANGED', `Actualizando UI en tiempo real uid=${message.user?.uid}`);
        updateUserUIInRealTime(message.user, message.userData);
    }
});

// ===== AUTH CHECK =====
document.documentElement.style.visibility = 'hidden';
window._authReady = false;

const _LAST_KNOWN_USER_KEY = 'qmt_last_known_user';

if (typeof window.applySettingsOnBoot === 'function') window.applySettingsOnBoot();

appLog('checkAuthOnLoad', `Documento oculto. Iniciando checkAuthOnLoad. _authReady=false`);

async function checkAuthOnLoad() {
    appLog('checkAuthOnLoad', 'FASE 1 (optimista): leyendo lastKnownUser de chrome.storage.local...');

    // Fase 1
    let optimisticUser = null;
    try {
        const stored = await chrome.storage.local.get(_LAST_KNOWN_USER_KEY);
        const entry = stored[_LAST_KNOWN_USER_KEY];
        if (entry && entry.uid) {
            const age = Date.now() - (entry.savedAt || 0);
            const MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 días
            if (age <= MAX_AGE) {
                optimisticUser = entry;
                appLog('checkAuthOnLoad', `FASE 1: lastKnownUser encontrado uid=${entry.uid} age=${Math.round(age/1000)}s — mostrando UI optimistamente`);
                // Mostrar la UI con datos optimistas: no redirigir, hacer visible
                document.documentElement.style.visibility = '';
                window._authReady = true;
                // Disparar evento para que el router arranque de inmediato
                window.dispatchEvent(new Event('qmt-auth-ready'));
            } else {
                appWarn('checkAuthOnLoad', `FASE 1: lastKnownUser expirado (${Math.round(age/3600000)}h) — ignorando`);
            }
        } else {
            appLog('checkAuthOnLoad', 'FASE 1: sin lastKnownUser — esperando confirmación del SW sin mostrar UI');
        }
    } catch (err) {
        appWarn('checkAuthOnLoad', `FASE 1: error leyendo storage (${err.message}) — continuando a fase 2`);
    }

    // ── FASE 2: Confirmación real ────────────────────────────────────────────
    appLog('checkAuthOnLoad', 'FASE 2: enviando GET_AUTH_STATE al SW...');
    try {
        const response = await sendMessage('GET_AUTH_STATE');
        appLog('checkAuthOnLoad', `FASE 2: respuesta de GET_AUTH_STATE: user=${response?.user?.uid || 'null'} stale=${response?.stale || false}`, response);

        if (response && response.user) {
            if (response.stale) {
                // SW respondió con lastKnownUser propio (Firebase aún no rehidrató)
                // No redirigir. Si ya mostramos UI en fase 1, no hacer nada más por ahora.
                // Si no la mostramos (el entry local no existía pero el SW sí lo tiene), mostrar ahora.
                appWarn('checkAuthOnLoad', `FASE 2: respuesta stale uid=${response.user.uid} — manteniendo UI, no redirigir`);
                if (!window._authReady) {
                    window._authReady = true;
                    document.documentElement.style.visibility = '';
                    window.dispatchEvent(new Event('qmt-auth-ready'));
                }
                // No cargar userData/role con datos stale para no contaminar la UI con
                // datos posiblemente obsoletos. El onSnapshot del SW los actualizará vía
                // USER_DATA_CHANGED cuando Firebase rehidrate.
                return;
            }

            // Confirmación real de usuario autenticado
            appLog('checkAuthOnLoad', `FASE 2: auth confirmada uid=${response.user.uid}`);
            if (!window._authReady) {
                window._authReady = true;
                document.documentElement.style.visibility = '';
                window.dispatchEvent(new Event('qmt-auth-ready'));
            }

            const userData = await sendMessage('GET_USER_DATA');
            appLog('checkAuthOnLoad', `GET_USER_DATA respuesta`, userData);
            if (userData.user && userData.userData) {
                updateUserUIInRealTime(userData.user, userData.userData);
            }

            const roleRes = await sendMessage('GET_USER_ROLE');
            appLog('checkAuthOnLoad', `GET_USER_ROLE respuesta: role=${roleRes?.role}`);
            window.currentUserRole = roleRes.role || 'user';
            if (window.currentUserRole === 'admin') {
                document.querySelectorAll('.admin-only').forEach(el => el.classList.add('visible'));
            }

        } else {
            // SW respondió con user:null sin stale
            
            if (optimisticUser) {
                appWarn('checkAuthOnLoad', `FASE 2: SW dice null pero había sesión local optimista — NO redirigiendo (podría ser error de red no detectado)`);
            } else {
                appWarn('checkAuthOnLoad', `FASE 2: sin usuario confirmado y sin sesión local — REDIRIGIENDO A LOGIN`);
                console.trace('[APP] checkAuthOnLoad → REDIRECT TO LOGIN STACK TRACE');
                window.location.href = '../auth/login.html';
            }
        }
    } catch (err) {
        if (optimisticUser) {
            // Tenemos sesión local: mantener UI, no redirigir
            appWarn('checkAuthOnLoad', `FASE 2: excepción comunicando con SW (${err.message}) pero hay sesión optimista — NO redirigiendo`);
        } else {
            // Sin sesión local ni SW → redirigir
            appError('checkAuthOnLoad', `FASE 2: excepción y sin sesión local — REDIRIGIENDO A LOGIN | error=${err.message}`);
            console.trace('[APP] checkAuthOnLoad EXCEPTION STACK TRACE');
            window.location.href = '../auth/login.html';
        }
    }
}

checkAuthOnLoad();

// Tags en SideBar
window.updateTagsSidebar = function() {
    const navContainer = document.querySelector('.sidebar-nav[data-tags-nav]');
    if (!navContainer) return;
    const templates = window.mockTemplates || [];
    appLog('updateTagsSidebar', `Actualizando sidebar con ${templates.length} templates`);
    const tagCounts = {};
    templates.forEach(t => {
        (t.tags || []).forEach(tag => {
            if (tag) tagCounts[tag] = (tagCounts[tag] || 0) + 1;
        });
    });
    const tags = Object.entries(tagCounts).sort((a, b) => a[0].localeCompare(b[0]));
    if (tags.length === 0) {
        navContainer.innerHTML = '<span style="font-size:11px;color:var(--text-muted);padding:4px 8px;display:block">Sin etiquetas</span>';
        return;
    }
    const COLORS = ['#3b82f6','#8b5cf6','#10b981','#f59e0b','#ef4444','#06b6d4','#ec4899','#14b8a6'];
    navContainer.innerHTML = tags.map(([tag, count], i) => {
        const color = COLORS[i % COLORS.length];
        return `<a href="#" class="nav-item tag-item" data-tag="${_escAttr(tag)}">
            <div class="tag-content">
                <span class="tag-color" style="background:${color}"></span>
                <span class="tag-name">${_esc(tag)}</span>
                <span class="tag-count">${count}</span>
            </div>
        </a>`;
    }).join('');
    navContainer.querySelectorAll('.tag-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const tag = item.dataset.tag;
            window.navigateTo('my-templates');
            setTimeout(() => {
                const inp = document.getElementById('filterSearch');
                if (inp) { inp.value = tag; inp.dispatchEvent(new Event('input')); }
            }, 120);
        });
    });
};

function _esc(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function _escAttr(s) {
    return String(s).replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

// ===== ROUTER =====
document.addEventListener('DOMContentLoaded', () => {
    appLog('DOMContentLoaded', `DOM listo | _authReady=${window._authReady}`);
    const viewContainer = document.getElementById('view-container');
    const navItems = document.querySelectorAll('.nav-item[data-view]');

    function parseViewFromHash() {
        const h = window.location.hash.replace('#','').split('?')[0];
        return h || null;
    }

    const initialView = parseViewFromHash() || 'my-templates';
    history.replaceState({ view: initialView, params: {} }, '', '#' + initialView);
    appLog('DOMContentLoaded', `Vista inicial: ${initialView} | hash=${window.location.hash}`);

    function startRouter() {
        appLog('startRouter', `Iniciando router | vista=${initialView} | _authReady=${window._authReady}`);
        loadView(initialView);
        setActiveNav(initialView);
    }

    if (window._authReady) {
        appLog('DOMContentLoaded', '_authReady ya era true al llegar DOMContentLoaded — startRouter inmediato');
        startRouter();
    } else {
        appLog('DOMContentLoaded', '_authReady=false — esperando evento qmt-auth-ready');
        window.addEventListener('qmt-auth-ready', () => {
            appLog('qmt-auth-ready', 'Evento recibido — llamando startRouter');
            startRouter();
        }, { once: true });
    }

    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const view = item.getAttribute('data-view');
            appLog('navItem:click', `Click en nav item: ${view} | _authReady=${window._authReady} | mockTemplates.length=${window.mockTemplates?.length ?? 'N/A'}`);
            navigateTo(view);
        });
    });

    document.querySelectorAll('.dropdown-item[data-view]').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const dd = document.getElementById('userDropdown');
            if (dd) dd.style.display = 'none';
            navigateTo(item.getAttribute('data-view'));
        });
    });

    window.addEventListener('popstate', (e) => {
        appLog('popstate', `popstate disparado | _authReady=${window._authReady} | state=${JSON.stringify(e.state)}`);
        if (!window._authReady) {
            appWarn('popstate', 'popstate ignorado porque _authReady=false');
            return;
        }
        const view = e.state?.view || parseViewFromHash() || 'my-templates';
        const params = e.state?.params || {};
        appLog('popstate', `Cargando vista: ${view} | mockTemplates.length=${window.mockTemplates?.length ?? 'N/A'}`);
        loadView(view, params);
        setActiveNav(view);
    });

    window.navigateTo = function(view, params = {}) {
        appLog('navigateTo', `navigateTo(${view}) | _authReady=${window._authReady} | mockTemplates.length=${window.mockTemplates?.length ?? 'N/A'}`, params);
        const paramStr = Object.keys(params).length ? '?' + new URLSearchParams(params).toString() : '';
        history.pushState({ view, params }, '', '#' + view + paramStr);
        loadView(view, params);
        setActiveNav(view);
    };

    function setActiveNav(view) {
        navItems.forEach(nav => nav.classList.remove('active'));
        const active = document.querySelector(`.nav-item[data-view="${view}"]`);
        if (active) active.classList.add('active');
    }

    function executeScripts(container) {
        container.querySelectorAll('script').forEach(script => {
            if (script.src) {
                const ns = document.createElement('script');
                ns.src = script.src;
                document.head.appendChild(ns);
            } else if (script.textContent && script.textContent.trim()) {
                if (/WebSocket|Live reload|refreshCSS/.test(script.textContent)) return;
                try {
                    // PROBLEMA 4 FIX: convertir let/const a var en el top-level del script
                    // inyectado para evitar TDZ en el scope del Blob URL.
                    // Específicamente resuelve "Cannot access '_loadingView' before initialization".
                    const patched = script.textContent.replace(
                        /^(\s*)(?:let|const)(\s+_loadingView\b)/m,
                        '$1var$2'
                    );
                    const blob = new Blob([patched], { type:'application/javascript' });
                    const url = URL.createObjectURL(blob);
                    const ns = document.createElement('script');
                    ns.src = url;
                    ns.onload = () => URL.revokeObjectURL(url);
                    document.head.appendChild(ns);
                } catch (_) {}
            }
        });
    }

    async function loadView(viewName, params = {}) {
        appLog('loadView', `Iniciando carga de vista: ${viewName} | _authReady=${window._authReady} | mockTemplates.length=${window.mockTemplates?.length ?? 'N/A'}`, params);
        try {
            if (window.ViewsLoader && window.ViewsLoader.get(viewName)) {
                appLog('loadView', `Vista ${viewName} cargada desde ViewsLoader`);
                viewContainer.innerHTML = window.ViewsLoader.get(viewName);
                executeScripts(viewContainer);
                initViewFunctionality(viewName, params);
                return;
            }
            appLog('loadView', `Fetching views/${viewName}.html`);
            const response = await fetch(`views/${viewName}.html`);
            if (!response.ok) throw new Error('Vista no encontrada');
            viewContainer.innerHTML = await response.text();
            executeScripts(viewContainer);
            appLog('loadView', `Vista ${viewName} cargada y renderizada | mockTemplates.length=${window.mockTemplates?.length ?? 'N/A'}`);
            initViewFunctionality(viewName, params);
        } catch (err) {
            appError('loadView', `Error cargando vista ${viewName}: ${err.message}`);
            if (viewName === 'my-templates') {
                viewContainer.innerHTML = `<div style="padding:40px;text-align:center;color:var(--text-muted)">Error cargando vista.</div>`;
            }
        }
    }

    window.loadView = loadView;

    function initViewFunctionality(viewName, params = {}) {
        appLog('initViewFunctionality', `Inicializando funcionalidad para vista: ${viewName} | mockTemplates.length=${window.mockTemplates?.length ?? 'N/A'}`, params);
        window._richEditorInitialized = false;
        document._editorToolbarBound = false;
        document._editorGlobalClickBound = false;

        switch (viewName) {
            case 'my-templates':
                appLog('initViewFunctionality', 'Llamando initMyTemplates()');
                if (typeof initMyTemplates === 'function') initMyTemplates();
                else appWarn('initViewFunctionality', 'initMyTemplates NO está definida en este momento');
                break;
            case 'create-template':
                if (typeof initCreateTemplate === 'function') initCreateTemplate();
                break;
            case 'admin-templates':
                if (typeof window.initAdminView === 'function') window.initAdminView();
                break;
            case 'profile':
                if (typeof initProfile === 'function') initProfile();
                break;
            case 'settings':
                if (typeof initSettings === 'function') initSettings();
                break;
            case 'import':
                if (typeof window.initImportView === 'function') window.initImportView();
                break;
            case 'export':
                if (typeof window.initExportView === 'function') window.initExportView();
                break;
        }

        const btnNew = document.getElementById('btnNewTemplate');
        if (btnNew && !btnNew._bound) {
            btnNew._bound = true;
            btnNew.onclick = () => window.navigateTo('create-template');
        }

        const headerSearch = document.getElementById('searchInput');
        if (headerSearch && !headerSearch._bound) {
            headerSearch._bound = true;
            headerSearch.addEventListener('input', () => {
                const fi = document.getElementById('filterSearch');
                if (fi) { fi.value = headerSearch.value; fi.dispatchEvent(new Event('input')); }
            });
        }

        const btnLogout = document.getElementById('btnLogout');
        if (btnLogout && !btnLogout._bound) {
            btnLogout._bound = true;
            btnLogout.addEventListener('click', async (e) => {
                e.preventDefault();
                appLog('btnLogout', 'Logout solicitado por el usuario desde UI');
                try {
                    const res = await sendMessage('LOGOUT');
                    if (res.success) {
                        appLog('btnLogout', 'Logout exitoso — redirigiendo a login');
                        window.location.href = '../auth/login.html';
                    } else {
                        appError('btnLogout', `Logout fallido: ${res.error}`);
                        window.showToast('Error al cerrar sesión', 'error');
                    }
                } catch (err) {
                    appError('btnLogout', `Excepción en logout: ${err.message}`);
                    window.showToast('Error al cerrar sesión', 'error');
                }
            });
        }

        const userProfile = document.getElementById('userProfile');
        const userDropdown = document.getElementById('userDropdown');
        if (userProfile && userDropdown && !userProfile._bound) {
            userProfile._bound = true;
            userProfile.addEventListener('click', (e) => {
                e.stopPropagation();
                userDropdown.style.display = userDropdown.style.display === 'none' ? 'block' : 'none';
            });
            document.addEventListener('click', () => { if (userDropdown) userDropdown.style.display = 'none'; });
        }
    }

    // Setup tags sidebar
    const tagsNavSection = document.querySelector('.sidebar-section:last-of-type .sidebar-nav');
    if (tagsNavSection) {
        tagsNavSection.setAttribute('data-tags-nav', '');
        tagsNavSection.innerHTML = '<span style="font-size:11px;color:var(--text-muted);padding:4px 8px;display:block">Sin etiquetas</span>';
    }
    const btnAddTag = document.getElementById('btnAddTag');
    if (btnAddTag) btnAddTag.style.display = 'none';
});


// Modales Confirm / Alert
function showConfirmModal(title, message, onConfirm, opts = {}) {
    const { confirmText = 'Confirmar', hideCancel = false, danger = true } = opts;
    const modal = document.createElement('div');
    modal.className = 'qmt-modal-overlay';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:99998;display:flex;align-items:center;justify-content:center';
    modal.innerHTML = `
        <div style="background:var(--bg-primary,#fff);border:1px solid var(--border-color,#e5e7eb);border-radius:14px;padding:24px;width:360px;max-width:90vw;box-shadow:0 8px 40px rgba(0,0,0,.18)">
            <h3 style="font-size:15px;font-weight:700;color:var(--text-primary,#111);margin:0 0 8px">${title}</h3>
            <p style="font-size:13px;color:var(--text-secondary,#555);margin:0 0 20px;line-height:1.5">${message}</p>
            <div style="display:flex;gap:8px;justify-content:flex-end">
                ${!hideCancel ? `<button id="_qmtCancel" style="padding:8px 16px;background:var(--bg-secondary,#f3f4f6);color:var(--text-secondary,#555);border:1px solid var(--border-color,#e5e7eb);border-radius:7px;font-size:13px;cursor:pointer">Cancelar</button>` : ''}
                <button id="_qmtConfirm" style="padding:8px 16px;background:${danger ? '#ef4444' : 'var(--accent,#6366f1)'};color:#fff;border:none;border-radius:7px;font-size:13px;font-weight:600;cursor:pointer">${confirmText}</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    const cleanup = () => modal.remove();
    modal.querySelector('#_qmtCancel')?.addEventListener('click', cleanup);
    modal.querySelector('#_qmtConfirm').addEventListener('click', () => {
        if (onConfirm) onConfirm();
        cleanup();
    });
    modal.addEventListener('click', (e) => { if (e.target === modal) cleanup(); });
}

function showAlertModal(title, message) {
    window.showToast(message, 'info');
}