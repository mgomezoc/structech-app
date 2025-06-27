// src/routes/index.js
import Navigo from "navigo";
import { eventBus } from "../services/api.service.js";
import { authService } from "../services/auth.service.js";
import { ROUTES } from "../utils/constants.js";

// Creamos el router en modo hash
export const router = new Navigo("/", { hash: true });

// Contenedor principal
const appContainer = document.getElementById("app") || document.body;

/**
 * Helper para cargar vistas dinámicamente desde
 * src/views/{viewName}/index.js
 */
async function loadView(viewName, context = {}) {
  try {
    console.log(`📄 Cargando vista: ${viewName}`);

    // 1) Muestra tu loader habitual
    appContainer.innerHTML = `
      <div class="view-loader">
        <div class="spinner"></div>
        <p>Cargando...</p>
      </div>
    `;

    // 2) Importa dinámicamente y renderiza
    const module = await import(`../views/${viewName}/index.js`);
    const View = module.default;
    const view = new View(context);
    const content = await view.render();

    // 3) Prepara el commit de la transición
    const commit = async () => {
      appContainer.innerHTML = content;
      if (view.afterRender) {
        await view.afterRender();
      }
      // registra cleanup para la próxima ruta
      router.hooks({
        leave: () => view.cleanup?.(),
      });
    };

    // 4) Si la API está disponible, úsala; si no, haz el commit a secas
    if (document.startViewTransition) {
      document.startViewTransition(commit);
    } else {
      await commit();
    }
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

export function setupRoutes() {
  // Ruta raíz
  router.on(ROUTES.HOME, async () => {
    const isAuth = await authService.checkAuth();
    router.navigate(isAuth ? ROUTES.DASHBOARD : ROUTES.LOGIN);
  });

  // Login (pública)
  router.on(ROUTES.LOGIN, async () => {
    const module = await import("../views/login/index.js");
    const View = module.default;
    const view = new View();
    appContainer.innerHTML = await view.render();
    if (view.afterRender) await view.afterRender();
  });

  // Dashboard (privada)
  router.on(
    ROUTES.DASHBOARD,
    // handler
    () => loadView("dashboard"),
    // guard (before hook)
    {
      before(done) {
        authService.checkAuth().then((isAuth) => {
          if (!isAuth) {
            // guardamos para redirigir después del login
            sessionStorage.setItem("redirectAfterLogin", ROUTES.DASHBOARD);
            this.navigate(ROUTES.LOGIN);
            done(false);
          } else {
            done();
          }
        });
      },
    }
  );

  // Formulario (privada)
  router.on(ROUTES.FORM, () => loadView("form"), {
    before(done) {
      authService.checkAuth().then((isAuth) => {
        if (!isAuth) {
          sessionStorage.setItem("redirectAfterLogin", ROUTES.FORM);
          this.navigate(ROUTES.LOGIN);
          done(false);
        } else {
          done();
        }
      });
    },
  });

  // Admin (requiere rol admin)
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

  // Eventos globales de autenticación
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

  // Resolución inicial
  router.resolve();
}

// Helpers
export function navigateTo(path, data = {}) {
  router.navigate(path, data);
}
export function getRouteParams() {
  return router.getCurrentLocation().params || {};
}
export function getQueryParams() {
  return router.getCurrentLocation().queryString || "";
}
