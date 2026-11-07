// ===== CARGADOR DE VISTAS =====
const ViewsLoader = {
    views: {},

    register(viewName, htmlContent) {
        this.views[viewName] = htmlContent;
    },

    get(viewName) {
        return this.views[viewName] || null;
    }
};

window.ViewsLoader = ViewsLoader;