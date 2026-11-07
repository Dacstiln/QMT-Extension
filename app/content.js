// app/content.js
console.log('[QMT] Content script cargado en Gmail');

// ─── Guard: si el contexto de la extensión fue invalidado, detener todo ────────
function isExtensionValid() {
    try {
        return !!chrome.runtime?.id;
    } catch {
        return false;
    }
}

function safeStorageGet(keys, callback) {
    if (!isExtensionValid()) return;
    try {
        chrome.storage.local.get(keys, callback);
    } catch (e) {
        console.warn('[QMT] chrome.storage no disponible:', e.message);
    }
}

// ─── Rastrear editables ya procesados ────────────────────────────────────────
const processedEditables = new WeakSet();

// ─── Observer ────────────────────────────────────────────────────────────────
const observer = new MutationObserver((mutations) => {
    if (!isExtensionValid()) {
        observer.disconnect();
        return;
    }

    for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
            if (node.nodeType !== Node.ELEMENT_NODE) continue;

            const editables = node.querySelectorAll('div[contenteditable="true"]');
            editables.forEach((editable) => {
                if (processedEditables.has(editable)) return;

                const rect = editable.getBoundingClientRect();
                if (rect.height > 50 && rect.width > 200) {
                    processedEditables.add(editable);
                    injectQMTButton(editable);
                }
            });
        }
    }
});

observer.observe(document.body, { childList: true, subtree: true });
console.log('[QMT] Observer configurado');

// ─── Inyección del botón como HERMANO del contenteditable ────────────────────
function injectQMTButton(editable) {
    if (!isExtensionValid()) return;

    let iconUrl;
    try {
        iconUrl = chrome.runtime.getURL('assets/icons/Icon-QMT.png');
    } catch (e) {
        console.warn('[QMT] No se pudo obtener URL del icono');
        return;
    }

    const btnContainer = document.createElement('div');
    btnContainer.className = 'qmt-inject-button-container';
    btnContainer.innerHTML = `
        <button class="qmt-inject-button" title="Insertar Plantilla QMT" type="button" aria-label="Plantillas QMT">
            <img src="${iconUrl}" alt="QMT" class="qmt-button-icon">
        </button>
        <div class="qmt-template-menu hidden">
            <div class="qmt-menu-header">&#128203; Tus Plantillas</div>
            <div class="qmt-list-container">Cargando...</div>
        </div>
    `;

    // Insertar DESPUÉS del contenteditable como elemento hermano
    editable.insertAdjacentElement('afterend', btnContainer);
    console.log('[QMT] Botón inyectado junto al área editable');

    const btn  = btnContainer.querySelector('.qmt-inject-button');
    const menu = btnContainer.querySelector('.qmt-template-menu');

    btn.addEventListener('mousedown', (e) => {
        // Prevenir pérdida de foco/selección al hacer clic en el botón
        e.preventDefault();
        e.stopPropagation();
    });

    btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        menu.classList.toggle('hidden');
        if (!menu.classList.contains('hidden')) {
            loadTemplatesToMenu(btnContainer, editable);
        }
    });

    document.addEventListener('click', (e) => {
        if (!btnContainer.contains(e.target) && !menu.classList.contains('hidden')) {
            menu.classList.add('hidden');
        }
    });
}

// ─── Cargar plantillas ────────────────────────────────────────────────────────
function loadTemplatesToMenu(container, editable) {
    const list = container.querySelector('.qmt-list-container');

    safeStorageGet(['qmt_templates'], (result) => {
        const templates = (result && result.qmt_templates) || [];

        if (templates.length === 0) {
            list.innerHTML = '<div class="qmt-item-empty">No hay plantillas guardadas.<br>Créalas desde la extensión.</div>';
            return;
        }

        list.innerHTML = templates.map(t => `
            <div class="qmt-template-item" data-id="${t.id}">
                <strong>${escHtml(t.name || t.title || 'Sin título')}</strong>
                ${t.shortcode ? `<small> · ${escHtml(t.shortcode)}</small>` : ''}
            </div>
        `).join('');

        list.querySelectorAll('.qmt-template-item').forEach(item => {
            item.addEventListener('mousedown', (e) => {
                e.preventDefault();
                e.stopPropagation();
            });

            item.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();

                const template = templates.find(t => String(t.id) === String(item.dataset.id));
                if (template) {
                    const htmlContent = template.content || template.preview || '';
                    console.log('[QMT] Insertando plantilla:', template.name || template.title);
                    insertHTMLIntoGmail(htmlContent, editable);
                    container.querySelector('.qmt-template-menu').classList.add('hidden');
                }
            });
        });
    });
}

// ─── Inserción HTML ───────────────────────────────────────────────────────────
function insertHTMLIntoGmail(htmlContent, editable) {
    if (!editable || !document.contains(editable)) {
        console.warn('[QMT] El editable ya no existe en el DOM');
        return;
    }

    editable.focus();

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || !editable.contains(selection.anchorNode)) {
        const range = document.createRange();
        range.selectNodeContents(editable);
        range.collapse(false);
        selection.removeAllRanges();
        selection.addRange(range);
    }

    const success = document.execCommand('insertHTML', false, htmlContent);

    if (!success) {
        console.warn('[QMT] execCommand falló, usando fallback');
        insertHTMLFallback(editable, htmlContent);
    }

    editable.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true }));
}

// ─── Fallback ─────────────────────────────────────────────────────────────────
function insertHTMLFallback(editable, htmlContent) {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);
    range.deleteContents();

    const temp = document.createElement('div');
    temp.innerHTML = htmlContent;
    const frag = document.createDocumentFragment();
    let lastNode = null;
    while (temp.firstChild) {
        lastNode = frag.appendChild(temp.firstChild);
    }
    range.insertNode(frag);

    if (lastNode) {
        const newRange = document.createRange();
        newRange.setStartAfter(lastNode);
        newRange.collapse(true);
        selection.removeAllRanges();
        selection.addRange(newRange);
    }

    editable.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true }));
}

// ─── Utilidades ───────────────────────────────────────────────────────────────
function escHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}