// popup/popup.js

function sendMessage(type, data = {}) {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ type, ...data }, (response) => {
            if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
            else resolve(response);
        });
    });
}

// Escuchar cambios de usuario en tiempo real
chrome.runtime.onMessage.addListener((message) => {
    if (message.type !== 'USER_DATA_CHANGED') return;
    const userNameEl = document.getElementById('sessionUserName');
    const avatarEl   = document.getElementById('sessionAvatar');
    const emailEl    = document.getElementById('sessionUserEmail');
    if (userNameEl) userNameEl.textContent = message.userData.name || message.user.email || 'Usuario';
    if (emailEl)    emailEl.textContent    = message.user.email;
    if (avatarEl) {
        let url = message.userData.avatarUrl ||
            `https://ui-avatars.com/api/?name=${encodeURIComponent(message.userData.name || 'U')}&background=000&color=fff`;
        if (!url.startsWith('data:')) url += (url.includes('?') ? '&' : '?') + 't=' + Date.now();
        avatarEl.src = url;
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const initialScreen   = document.getElementById('initial-screen');
    const loginFormScreen = document.getElementById('login-form-screen');
    const sessionScreen   = document.getElementById('session-screen');
    const loginForm       = document.getElementById('loginForm');

    // ── Estado de auth (sin polling) ────────────────────────────────────────
    async function checkAuthState() {
        try {
            const response = await sendMessage('GET_USER_DATA');
            if (response.user) {
                mostrarPantallaSesion(response.user, response.userData || {});
            } else {
                mostrarPantallaInicial();
            }
        } catch (_) {
            mostrarPantallaInicial();
        }
    }

    // Verificar estado al abrir popup
    checkAuthState();

    function mostrarPantallaSesion(user, userData) {
        initialScreen?.classList.add('hidden');
        loginFormScreen?.classList.add('hidden');
        sessionScreen?.classList.remove('hidden');
        const nameEl   = document.getElementById('sessionUserName');
        const emailEl  = document.getElementById('sessionUserEmail');
        const avatarEl = document.getElementById('sessionAvatar');
        if (nameEl)   nameEl.textContent  = userData.name || user.email || 'Usuario';
        if (emailEl)  emailEl.textContent = user.email || '';
        if (avatarEl) avatarEl.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(userData.name || 'U')}&background=000&color=fff`;
    }

    function mostrarPantallaInicial() {
        sessionScreen?.classList.add('hidden');
        loginFormScreen?.classList.add('hidden');
        initialScreen?.classList.remove('hidden');
    }

    function mostrarPantallaLogin() {
        initialScreen?.classList.add('hidden');
        sessionScreen?.classList.add('hidden');
        loginFormScreen?.classList.remove('hidden');
    }

    // Navegación
    document.getElementById('btnSign-in')?.addEventListener('click', mostrarPantallaLogin);

    document.querySelector('.create-account-link')?.addEventListener('click', (e) => {
        e.preventDefault();
        mostrarPantallaInicial();
    });

    // Login
    loginForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email    = document.getElementById('emailInput')?.value.trim();
        const password = document.getElementById('passwordInput')?.value;
        const errEl    = document.getElementById('loginError');
        try {
            const response = await sendMessage('LOGIN', { email, password });
            if (response.success) {
                setTimeout(() => location.reload(), 400);
            } else {
                if (errEl) { errEl.textContent = 'Credenciales incorrectas'; errEl.style.display = 'block'; }
            }
        } catch (error) {
            if (errEl) { errEl.textContent = 'Error de conexión'; errEl.style.display = 'block'; }
        }
    });

    // Logout
    document.getElementById('btnPopupLogout')?.addEventListener('click', async () => {
        try {
            const response = await sendMessage('LOGOUT');
            if (response.success) location.reload();
        } catch (_) {}
    });

    // Links externos
    document.getElementById('btnGoToDashboard')?.addEventListener('click', () => {
        chrome.tabs.create({ url: chrome.runtime.getURL('app/index.html') });
    });

    document.getElementById('linkSign-up')?.addEventListener('click', () => {
        chrome.tabs.create({ url: chrome.runtime.getURL('auth/sign-up.html') });
    });
});
