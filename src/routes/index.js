// src/routes/index.js
import Navigo from "navigo";
import { eventBus } from "../services/api.service.js";
import { authService } from "../services/auth.service.js";
import { ROUTES } from "../utils/constants.js";

// Crear instancia del router con hash routing
export const router = new Navigo("/", { hash: true });

// Contenedor principal de la app
const appContainer = document.getElementById("app") || document.body;

// Helper para cargar vistas dinámicamente
async function loadView(viewName, context = {}) {
  try {
    console.log(`📄 Cargando vista: ${viewName}`);

    // Loader mientras carga la vista
    appContainer.innerHTML = `
      <div class="view-loader">
        <div class="spinner"></div>
        <p>Cargando...</p>
      </div>
    `;

    // Importar módulo de la vista
    const module = await import(`../views/${viewName}.js`);
    const View = module.default;
    const view = new View(context);

    // Renderizar HTML
    const content = await view.render();
    appContainer.innerHTML = content;

    // Ejecutar lógica post-render si existe
    if (view.afterRender) {
      await view.afterRender();
    }

    // Registrar hook de leave para cleanup de la vista
    router.hooks({
      leave: () => {
        if (view.cleanup) view.cleanup();
      },
    });
  } catch (error) {
    console.error(`Error al cargar vista ${viewName}:`, error);
    appContainer.innerHTML = `
      <div class="error-view">
        <h2>Error al cargar la página</h2>
        <p>${error.message}</p>
        <button onclick="window.location.reload()">Recargar</button>
      </div>
    `;
  }
}

// Configuración de rutas
export function setupRoutes() {
  // Ruta raíz: redirige al dashboard si ya hay sesión, o al login si no
  router.on(ROUTES.HOME, async () => {
    const isAuth = await authService.checkAuth();
    router.navigate(isAuth ? ROUTES.DASHBOARD : ROUTES.LOGIN);
  });

  // Login (pública) con guardia en before
  router.on(ROUTES.LOGIN, () => loadView("login"), {
    before(done /*, match*/) {
      authService.checkAuth().then((isAuth) => {
        if (isAuth) {
          // Si ya está logueado, lo mandamos al dashboard
          this.navigate(ROUTES.DASHBOARD);
          done(false); // cancelar la carga de /login
        } else {
          done(); // continuar a /login
        }
      });
    },
  });

  // Dashboard (privada)
  router.on(ROUTES.DASHBOARD, () => loadView("dashboard"), {
    before(done) {
      authService.checkAuth().then((isAuth) => {
        if (!isAuth) {
          this.navigate(ROUTES.LOGIN);
          done(false);
        } else {
          done();
        }
      });
    },
  });

  // Formulario (privado)
  router.on(ROUTES.FORM, () => loadView("form"), {
    before(done) {
      authService.checkAuth().then((isAuth) => {
        if (!isAuth) {
          this.navigate(ROUTES.LOGIN);
          done(false);
        } else {
          done();
        }
      });
    },
  });

  // Admin (requiere rol "admin")
  router.on("/admin", () => loadView("admin"), {
    before(done) {
      authService.checkAuth().then((isAuth) => {
        if (!isAuth) {
          this.navigate(ROUTES.LOGIN);
          done(false);
        } else if (!authService.hasRole("admin")) {
          window.mostrarMensajeEstado(
            "No tienes permisos para acceder a esta sección",
            3000
          );
          this.navigate(ROUTES.DASHBOARD);
          done(false);
        } else {
          done();
        }
      });
    },
  });

  // 404
  router.notFound(() => {
    appContainer.innerHTML = `
      <div class="not-found-view">
        <h1>404</h1>
        <p>Página no encontrada</p>
        <a href="${ROUTES.HOME}">Volver al inicio</a>
      </div>
    `;
  });

  // Escuchar eventos globales de Auth
  eventBus.on("auth:logout", () => {
    router.navigate(ROUTES.LOGIN);
  });
  eventBus.on("auth:login", () => {
    const redirectPath = sessionStorage.getItem("redirectAfterLogin");
    if (redirectPath) {
      sessionStorage.removeItem("redirectAfterLogin");
      router.navigate(redirectPath);
    } else {
      router.navigate(ROUTES.DASHBOARD);
    }
  });

  // Resolver ruta inicial
  router.resolve();
}

// Helpers para navegación y params
export function navigateTo(path, data = {}) {
  router.navigate(path, data);
}
export function getRouteParams() {
  return router.getCurrentLocation().params || {};
}
export function getQueryParams() {
  return router.getCurrentLocation().queryString || "";
}
