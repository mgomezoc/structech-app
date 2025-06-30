// src/routes/index.js
import Navigo from 'navigo';
import { eventBus } from '../services/api.service.js';
import { authService } from '../services/auth.service.js';
import { ROUTES } from '../utils/constants.js';
import { authGuard, combineGuards, guestGuard, roleGuard } from './guards.js';

// Creamos el router en modo hash
export const router = new Navigo('/', { hash: true });

// Contenedor principal
const appContainer = document.getElementById('app') || document.body;

// Variable para manejar cleanup de vista actual
let currentViewCleanup = null;

/**
 * Helper para cargar vistas dinámicamente desde src/views/{viewName}/index.js
 * @param {string} viewName - Nombre de la vista a cargar
 * @param {object} context - Contexto con params, query, etc.
 */
async function loadView(viewName, context = {}) {
  try {
    console.log(`📄 Cargando vista: ${viewName}`);

    // Ejecutar cleanup de vista anterior
    if (currentViewCleanup) {
      try {
        await currentViewCleanup();
      } catch (error) {
        console.error('Error en cleanup anterior:', error);
      }
      currentViewCleanup = null;
    }

    // Aplicar clase de ruta para transiciones específicas
    appContainer.classList.forEach(cls => {
      if (cls.startsWith('route-')) {
        appContainer.classList.remove(cls);
      }
    });
    appContainer.classList.add(`route-${viewName}`);

    // Mostrar loader
    appContainer.innerHTML = `
      <div class="view-loader">
        <div class="spinner"></div>
        <p>Cargando...</p>
      </div>
    `;

    // Importar dinámicamente y renderizar
    const module = await import(`../views/${viewName}/index.js`);
    const View = module.default;
    const view = new View(context);
    const content = await view.render();

    // Función para hacer commit de la transición
    const commit = async () => {
      appContainer.innerHTML = content;

      if (view.afterRender) {
        await view.afterRender();
      }

      // Guardar cleanup para la próxima navegación
      currentViewCleanup = view.cleanup ? () => view.cleanup() : null;
    };

    // Usar View Transition API si está disponible
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
        <button onclick="router.navigate('${ROUTES.DASHBOARD}')">Ir al Dashboard</button>
      </div>
    `;
  }
}

/**
 * Configuración de todas las rutas de la aplicación
 */
export function setupRoutes() {
  // Ruta raíz - redirección inteligente
  router.on(ROUTES.HOME, async () => {
    console.log('🏠 Accediendo a ruta raíz');
    const isAuth = await authService.checkAuth();
    router.navigate(isAuth ? ROUTES.DASHBOARD : ROUTES.LOGIN);
  });

  // Login (ruta pública con guard para usuarios autenticados)
  router.on(
    ROUTES.LOGIN,
    (params, query) => {
      console.log('🔑 Cargando login');
      loadView('login', { params, query });
    },
    {
      before: guestGuard,
    },
  );

  // Dashboard (ruta privada)
  router.on(
    ROUTES.DASHBOARD,
    (params, query) => {
      console.log('📊 Cargando dashboard');
      loadView('dashboard', { params, query });
    },
    {
      before: authGuard,
    },
  );

  // Formulario (ruta privada)
  router.on(
    ROUTES.FORM,
    (params, query) => {
      console.log('📝 Cargando formulario');
      loadView('form', { params, query });
    },
    {
      before: authGuard,
    },
  );

  // Formulario con parámetros opcionales
  router.on(
    ROUTES.FORM + '/:id',
    (params, query) => {
      console.log('📝 Cargando formulario con ID:', params.id);
      loadView('form', { params, query });
    },
    {
      before: authGuard,
    },
  );

  // Enrollment manual (ruta privada)
  router.on(
    ROUTES.ENROLLMENT_MANUAL,
    (params, query) => {
      console.log('📋 Cargando enrollment manual');
      loadView('enrollment-manual', { params, query });
    },
    {
      before: authGuard,
    },
  );

  // Admin (requiere rol admin)
  router.on(
    '/admin',
    (params, query) => {
      console.log('⚙️ Cargando panel admin');
      loadView('admin', { params, query });
    },
    {
      before: combineGuards(authGuard, roleGuard('admin')),
    },
  );

  // Ruta 404
  router.notFound(() => {
    console.log('❌ Ruta no encontrada');
    appContainer.innerHTML = `
      <div class="not-found-view">
        <h1>404</h1>
        <p>Página no encontrada</p>
        <a href="#${ROUTES.HOME}">Volver al inicio</a>
      </div>
    `;
  });

  // Eventos globales de autenticación
  eventBus.on('auth:logout', () => {
    console.log('🚪 Logout detectado, redirigiendo a login');
    // Ejecutar cleanup antes de logout
    if (currentViewCleanup) {
      currentViewCleanup();
      currentViewCleanup = null;
    }
    router.navigate(ROUTES.LOGIN);
  });

  eventBus.on('auth:login', () => {
    console.log('✅ Login exitoso, redirigiendo');
    const redirectPath = sessionStorage.getItem('redirectAfterLogin');

    if (redirectPath && redirectPath !== '#' + ROUTES.LOGIN) {
      sessionStorage.removeItem('redirectAfterLogin');
      // Limpiar el hash si es necesario
      const cleanPath = redirectPath.startsWith('#') ? redirectPath.substring(1) : redirectPath;
      router.navigate(cleanPath);
    } else {
      router.navigate(ROUTES.DASHBOARD);
    }
  });

  // Hook global para manejar errores de navegación
  router.hooks({
    before: (done, params, query) => {
      console.log('🧭 Navegación iniciada:', window.location.hash);
      done();
    },
    after: () => {
      console.log('✅ Navegación completada');
      // Scroll to top en cada navegación
      window.scrollTo(0, 0);
    },
  });

  // Resolución inicial
  router.resolve();
}

/**
 * Helpers de navegación para uso en toda la aplicación
 */
export function navigateTo(path, data = {}) {
  console.log('➡️ Navegando a:', path);
  router.navigate(path, data);
}

export function getRouteParams() {
  const location = router.getCurrentLocation();
  return location ? location.params || {} : {};
}

export function getQueryParams() {
  const location = router.getCurrentLocation();
  if (!location || !location.queryString) return {};

  // Parse query string manually
  const params = new URLSearchParams(location.queryString);
  const result = {};
  for (const [key, value] of params) {
    result[key] = value;
  }
  return result;
}

/**
 * Helper para obtener la ruta actual
 */
export function getCurrentRoute() {
  const location = router.getCurrentLocation();
  return location ? location.url : ROUTES.HOME;
}

/**
 * Helper para verificar si estamos en una ruta específica
 */
export function isCurrentRoute(route) {
  return getCurrentRoute() === route;
}

/**
 * Cleanup global al cerrar la aplicación
 */
window.addEventListener('beforeunload', () => {
  if (currentViewCleanup) {
    currentViewCleanup();
  }
});
