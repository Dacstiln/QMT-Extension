// auth/sign-up.js
function sendMessage(type, data = {}) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type, ...data }, (response) => {
      if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
      else resolve(response);
    });
  });
}

function showSignupToast(message, type = 'error') {
  let container = document.getElementById('qmt-signup-toast');
  if (!container) {
    container = document.createElement('div');
    container.id = 'qmt-signup-toast';
    container.style.cssText = `
      position:fixed;top:20px;left:50%;transform:translateX(-50%);
      z-index:9999;display:flex;flex-direction:column;gap:8px;align-items:center;
    `;
    document.body.appendChild(container);
  }
  const colors = { error:'#ef4444', success:'#22c55e', info:'#3b82f6', warning:'#f59e0b' };
  const bg = colors[type] || colors.info;
  const toast = document.createElement('div');
  toast.style.cssText = `
    background:#fff;border:1px solid #e5e7eb;border-left:4px solid ${bg};
    border-radius:10px;padding:12px 20px;font-size:13px;color:#111;
    box-shadow:0 4px 20px rgba(0,0,0,.12);min-width:280px;text-align:center;
    font-family:'Inter',sans-serif;
  `;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

// Redireccion si
document.documentElement.style.visibility = 'hidden';

sendMessage('GET_AUTH_STATE').then(response => {
  if (response && response.user) {
    window.location.href = '../app/index.html';
  } else {
    document.documentElement.style.visibility = '';
  }
}).catch(() => {
  document.documentElement.style.visibility = '';
});

document.getElementById('signUpForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const name = document.getElementById('InputName').value.trim();
  const email = document.getElementById('InputEmail').value.trim();
  const password = document.getElementById('InputPassword').value;
  const btn = e.target.querySelector('button[type="submit"]');

  btn.disabled = true;
  btn.textContent = 'Creando cuenta...';

  try {
    const response = await sendMessage('SIGNUP', {
      email,
      password,
      userData: {
        name,
        email,
        role: 'user',
        createdAt: new Date().toISOString(),
        avatarUrl: `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=000&color=fff`
      }
    });

    if (response.success) {
      showSignupToast('¡Cuenta creada exitosamente! Redirigiendo...', 'success');
      setTimeout(() => { window.location.href = 'login.html'; }, 1500);
    } else {
      showSignupToast('Error al registrarse: ' + response.error, 'error');
      btn.disabled = false;
      btn.textContent = 'Registrarse';
    }
  } catch (error) {
    showSignupToast('Error de conexión. Intenta de nuevo.', 'error');
    btn.disabled = false;
    btn.textContent = 'Registrarse';
  }
});