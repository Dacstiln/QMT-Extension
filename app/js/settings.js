// Configuracion
const SETTINGS_KEY = 'qmt_settings';

const DEFAULT_SETTINGS = {
    theme: 'light',
    accentColor: '#000000',
    density: 'default'
};

function loadSettings() {
    try {
        const stored = localStorage.getItem(SETTINGS_KEY);
        return stored ? { ...DEFAULT_SETTINGS, ...JSON.parse(stored) } : { ...DEFAULT_SETTINGS };
    } catch {
        return { ...DEFAULT_SETTINGS };
    }
}

function applyTheme(theme) {
    document.body.classList.remove('theme-light', 'theme-dark', 'theme-system');
    document.body.classList.add(`theme-${theme}`);
}

function applyAccentColor(color) {
    const currentTheme = document.body.className.match(/theme-(\w+)/)?.[1] || 'light';
    const finalColor = (currentTheme === 'dark' && color === '#000000') ? '#ffffff' : color;
    document.documentElement.style.setProperty('--accent-primary', finalColor);
}

function applyDensity(density) {
    document.body.classList.remove('density-compact', 'density-default', 'density-comfortable');
    document.body.classList.add(`density-${density}`);
}

function applySettings(settings) {
    applyTheme(settings.theme);
    applyAccentColor(settings.accentColor);
    applyDensity(settings.density);
}

// Aplicar configuracion
window.applySettingsOnBoot = function () {
    applySettings(loadSettings());
};

window.initSettings = function () {
    const settings = loadSettings();

    // Tema
    const themeButtons = document.querySelectorAll('.theme-btn');
    themeButtons.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.theme === settings.theme);
        btn.addEventListener('click', () => {
            themeButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // Determinar color lógico antes del cambio de tema
            const activeDot = document.querySelector('.accent-dot.active');
            let logicalAccent = settings.accentColor;
            if (activeDot) {
                const prevTheme = document.body.className.match(/theme-(\w+)/)?.[1] || 'light';
                logicalAccent = (prevTheme === 'dark' && activeDot.dataset.color === '#ffffff')
                    ? '#000000'
                    : activeDot.dataset.color;
            }

            applyTheme(btn.dataset.theme);
            applyAccentColor(logicalAccent);

            const effectiveColor = (btn.dataset.theme === 'dark' && logicalAccent === '#000000') ? '#ffffff' : logicalAccent;
            accentDots.forEach(d => d.classList.toggle('active', d.dataset.color === effectiveColor));
        });
    });

    // Color de acento
    const accentDots = document.querySelectorAll('.accent-dot');
    const effectiveAccentColor = (settings.theme === 'dark' && settings.accentColor === '#000000') ? '#ffffff' : settings.accentColor;
    accentDots.forEach(dot => {
        dot.classList.toggle('active', dot.dataset.color === effectiveAccentColor);
        dot.addEventListener('click', () => {
            accentDots.forEach(d => d.classList.remove('active'));
            dot.classList.add('active');
            applyAccentColor(dot.dataset.color);
        });
    });

    // Densidad
    const densityButtons = document.querySelectorAll('.segment-btn');
    densityButtons.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.density === settings.density);
        btn.addEventListener('click', () => {
            densityButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            applyDensity(btn.dataset.density);
        });
    });

    applySettings(settings);

    // Guardar
    document.getElementById('btnSaveSettings')?.addEventListener('click', () => {
        const activeDot = document.querySelector('.accent-dot.active');
        let logicalAccentColor = activeDot?.dataset.color || '#000000';
        const currentTheme = document.body.className.match(/theme-(\w+)/)?.[1] || 'light';
        if (currentTheme === 'dark' && logicalAccentColor === '#ffffff') logicalAccentColor = '#000000';

        const updatedSettings = {
            theme: document.querySelector('.theme-btn.active')?.dataset.theme || 'light',
            accentColor: logicalAccentColor,
            density: document.querySelector('.segment-btn.active')?.dataset.density || 'default'
        };

        localStorage.setItem(SETTINGS_KEY, JSON.stringify(updatedSettings));
        applySettings(updatedSettings);
        window.showToast('Configuración guardada', 'success');
    });

    // Restablecer
    document.getElementById('btnResetSettings')?.addEventListener('click', () => {
        showConfirmModal(
            'Restablecer configuración',
            '¿Estás seguro? Se volverán a los valores por defecto.',
            () => {
                localStorage.removeItem(SETTINGS_KEY);
                const d = { ...DEFAULT_SETTINGS };
                applySettings(d);
                themeButtons.forEach(b => b.classList.toggle('active', b.dataset.theme === d.theme));
                const effColor = (d.theme === 'dark' && d.accentColor === '#000000') ? '#ffffff' : d.accentColor;
                accentDots.forEach(dot => dot.classList.toggle('active', dot.dataset.color === effColor));
                densityButtons.forEach(b => b.classList.toggle('active', b.dataset.density === d.density));
                window.showToast('Configuración restablecida', 'info');
            },
            { confirmText: 'Restablecer', danger: false }
        );
    });
};

if (document.getElementById('themeSelector')) {
    window.initSettings();
}