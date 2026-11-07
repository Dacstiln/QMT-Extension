// ===== PERFIL - profile.js =====

window.initProfile = async function () {

    // Uso de SendMessage
    const response = await sendMessage('GET_USER_DATA');
    const user = response?.user;
    const userData = response?.userData || {};

    if (!user) {
        window.showToast('No se pudo cargar el perfil', 'error');
        return;
    }

    const profile = {
        name: userData.name || user.displayName || 'Usuario',
        email: user.email || '',
        avatarUrl: userData.avatarUrl || '',
        joinDate: userData.joinDate || user.metadata?.creationTime || null,
        passwordUpdatedAt: userData.passwordUpdatedAt || null,
        uid: user.uid,
        role: userData.role || window.currentUserRole || 'user'
    };

    populateProfileUI(profile);
    await loadProfileStats(profile);
    bindProfileHandlers(profile);
};

// UI
function populateProfileUI(profile) {
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };

    set('nameValue', profile.name);
    set('profileNameDisplay', profile.name);
    set('emailValue', profile.email);
    set('profileEmailDisplay', profile.email);

    if (profile.role && profile.role !== 'user') {
        const roleEl = document.getElementById('profileRoleBadge');
        if (roleEl) {
            roleEl.textContent = profile.role === 'admin' ? 'Admin' : profile.role;
            roleEl.style.display = 'inline-block';
        }
    }

    if (profile.passwordUpdatedAt) {
        const days = Math.floor((Date.now() - new Date(profile.passwordUpdatedAt).getTime()) / 86400000);
        set('passwordLastChange', days === 0 ? 'Actualizada hoy' : `Actualizada hace ${days} día${days !== 1 ? 's' : ''}`);
    } else {
        set('passwordLastChange', 'No disponible');
    }

    updateAvatarDisplay(profile);
}

function updateAvatarDisplay(profile) {
    const img = document.getElementById('profileAvatarImg');
    if (!img) return;
    if (profile.avatarUrl && profile.avatarUrl.startsWith('data:')) {
        img.src = profile.avatarUrl;
    } else if (profile.avatarUrl) {
        img.src = profile.avatarUrl + (profile.avatarUrl.includes('?') ? '&' : '?') + 't=' + Date.now();
    } else {
        img.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(profile.name || 'U')}&background=000&color=fff&size=128`;
    }
}

// Estadisticas del perfil
async function loadProfileStats(profile) {
    try {
        const templates = window.mockTemplates || [];

        const totalTemplates = templates.length;
        const uniqueTags = new Set(templates.flatMap(t => t.tags || []));
        const sharedTemplates = templates.filter(t => t.shared || t.isShared).length;

        const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };

        set('statTemplates', totalTemplates);
        set('statInsertions', sharedTemplates);
        set('statTags', uniqueTags.size);

        if (profile.joinDate) {
            const d = new Date(profile.joinDate);
            const months = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
            set('statJoinDate', `${months[d.getMonth()]} ${d.getFullYear()}`);
        } else {
            set('statJoinDate', '—');
        }
    } catch (e) {
    
    }
}

// Handlers
function bindProfileHandlers(profile) {

    // Nombre
    const nameForm = document.getElementById('nameForm');
    const nameInput = document.getElementById('nameInput');
    const nameValue = document.getElementById('nameValue');

    document.getElementById('btnEditName')?.addEventListener('click', () => {
        nameForm?.classList.remove('hidden');
        if (nameInput) { nameInput.value = profile.name; nameInput.focus(); }
    });
    document.getElementById('btnCancelName')?.addEventListener('click', () => nameForm?.classList.add('hidden'));
    document.getElementById('btnSaveName')?.addEventListener('click', async () => {
        const newName = nameInput?.value.trim();
        if (!newName) { window.showToast('El nombre no puede estar vacío', 'warning'); return; }
        try {
            const res = await sendMessage('UPDATE_USER_DATA', { uid: profile.uid, userData: { name: newName } });
            if (res?.success) {
                profile.name = newName;
                if (nameValue) nameValue.textContent = newName;
                nameForm?.classList.add('hidden');
                populateProfileUI(profile);
                window.showToast('Nombre actualizado', 'success');
            } else {
                window.showToast('Error al guardar: ' + (res?.error || 'desconocido'), 'error');
            }
        } catch (e) {
            window.showToast('Error al guardar el nombre', 'error');
        }
    });

    // Email
    const emailForm = document.getElementById('emailForm');
    document.getElementById('btnEditEmail')?.addEventListener('click', () => {
        window.showToast('El email se gestiona desde la configuración de cuenta de Firebase', 'info');
    });

    if (emailForm) emailForm.classList.add('hidden');

    // Contraseña
    const passwordForm = document.getElementById('passwordForm');
    const newPasswordInput = document.getElementById('newPasswordInput');

    document.getElementById('btnEditPassword')?.addEventListener('click', () => {
        passwordForm?.classList.remove('hidden');
        newPasswordInput?.focus();
    });
    document.getElementById('btnCancelPassword')?.addEventListener('click', () => {
        passwordForm?.classList.add('hidden');
        if (newPasswordInput) newPasswordInput.value = '';
    });

    // Toggle visibilidad contraseña
    document.querySelector('.btn-eye[data-target="newPasswordInput"]')?.addEventListener('click', (e) => {
        const target = document.getElementById('newPasswordInput');
        if (!target) return;
        target.type = target.type === 'password' ? 'text' : 'password';
        e.currentTarget.textContent = target.type === 'password' ? '👁️' : '🙈';
    });

    document.getElementById('btnSavePassword')?.addEventListener('click', async () => {
        const newPassword = newPasswordInput?.value.trim();
        if (!newPassword || newPassword.length < 8) {
            window.showToast('La contraseña debe tener al menos 8 caracteres', 'warning');
            return;
        }
        try {
            const res = await sendMessage('UPDATE_USER_DATA', {
                uid: profile.uid,
                userData: { passwordUpdatedAt: new Date().toISOString() }
            });
            if (res?.success) {
                profile.passwordUpdatedAt = new Date().toISOString();
                document.getElementById('passwordLastChange').textContent = 'Actualizada hoy';
                passwordForm?.classList.add('hidden');
                if (newPasswordInput) newPasswordInput.value = '';
                window.showToast('Nota: el timestamp de contraseña fue guardado. El cambio real requiere reautenticación en Firebase.', 'info', 5000);
            } else {
                window.showToast('Error: ' + (res?.error || 'desconocido'), 'error');
            }
        } catch (e) {
            window.showToast('Error al guardar', 'error');
        }
    });

    // Avatar
    const avatarFileInput = document.getElementById('avatarFileInput');

    const triggerAvatarPicker = () => avatarFileInput?.click();
    document.getElementById('btnEditAvatar')?.addEventListener('click', triggerAvatarPicker);
    document.getElementById('btnUploadAvatar')?.addEventListener('click', triggerAvatarPicker);

    avatarFileInput?.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (file.size > 2 * 1024 * 1024) {
            window.showToast('El archivo es muy grande (máximo 2 MB)', 'warning');
            return;
        }
        const reader = new FileReader();
        reader.onload = async (ev) => {
            const avatarDataUrl = ev.target.result;
            try {
                const res = await sendMessage('UPDATE_USER_DATA', { uid: profile.uid, userData: { avatarUrl: avatarDataUrl } });
                if (res?.success) {
                    profile.avatarUrl = avatarDataUrl;
                    updateAvatarDisplay(profile);
                    if (avatarFileInput) avatarFileInput.value = '';
                    window.showToast('Foto de perfil actualizada', 'success');
                } else {
                    window.showToast('Error al subir la imagen: ' + (res?.error || ''), 'error');
                }
            } catch (e) {
                window.showToast('Error al subir la imagen', 'error');
            }
        };
        reader.readAsDataURL(file);
    });

    document.getElementById('btnRemoveAvatar')?.addEventListener('click', async () => {
        try {
            const res = await sendMessage('UPDATE_USER_DATA', { uid: profile.uid, userData: { avatarUrl: '' } });
            if (res?.success) {
                profile.avatarUrl = '';
                updateAvatarDisplay(profile);
                window.showToast('Foto eliminada', 'success');
            } else {
                window.showToast('Error al eliminar la foto', 'error');
            }
        } catch (e) {
            window.showToast('Error al eliminar la foto', 'error');
        }
    });

    // Eliminar cuenta
    const deleteModal = document.getElementById('deleteAccountModal');
    const deleteConfirmInput = document.getElementById('deleteConfirmInput');
    const btnConfirmDelete = document.getElementById('btnConfirmDelete');

    document.getElementById('btnDeleteAccount')?.addEventListener('click', () => {
        if (deleteModal) { deleteModal.style.display = 'flex'; }
        if (deleteConfirmInput) deleteConfirmInput.value = '';
        if (btnConfirmDelete) btnConfirmDelete.disabled = true;
    });

    deleteConfirmInput?.addEventListener('input', () => {
        if (btnConfirmDelete) btnConfirmDelete.disabled = deleteConfirmInput.value !== 'ELIMINAR';
    });

    document.getElementById('btnModalClose')?.addEventListener('click', () => {
        if (deleteModal) deleteModal.style.display = 'none';
    });
    document.getElementById('btnCancelDelete')?.addEventListener('click', () => {
        if (deleteModal) deleteModal.style.display = 'none';
    });

    btnConfirmDelete?.addEventListener('click', async () => {
        try {
            const res = await sendMessage('DELETE_ACCOUNT', { uid: profile.uid });
            if (res?.success) {
                window.showToast('Cuenta eliminada', 'success');
                setTimeout(() => { window.location.href = '../auth/login.html'; }, 1500);
            } else {
                window.showToast('Error al eliminar la cuenta: ' + (res?.error || ''), 'error');
            }
        } catch (e) {
            window.showToast('Error al eliminar la cuenta', 'error');
        }
        if (deleteModal) deleteModal.style.display = 'none';
    });

    // Escuchar cambios en tiempo real
    chrome.runtime.onMessage.addListener((message) => {
        if (message.type === 'USER_DATA_CHANGED') {
            if (message.userData?.name) profile.name = message.userData.name;
            if (message.userData?.avatarUrl !== undefined) profile.avatarUrl = message.userData.avatarUrl;
            if (message.user?.email) profile.email = message.user.email;
            populateProfileUI(profile);
        }
    });
}