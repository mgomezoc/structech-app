// src/routes/index.js
import Navigo from 'navigo';
import { eventBus } from '../services/api.service.js';
import { authService } from '../services/auth.service.js';
import { ROUTES } from '../utils/constants.js';
import { $, dom } from '../utils/dom.helper.js'; // 👈 Importar dom helper
import { authGuard, combineGuards, guestGuard, roleGuard } from './guards.js';

// Creamos el router en modo hash
export const router = new Navigo('/', { hash: true });

// Contenedor principal
const appContainer = $('#app') || document.body;

// Variable para manejar cleanup de vista actual
let currentViewCleanup = null;
let currentViewLoader = null; // 👈 Variable para manejar el loader de vista

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

    // ✅ Mostrar loader específico para la vista
    showViewLoader(viewName);

    await new Promise(requestAnimationFrame);

    // ✅ Aplicar clase de ruta usando dom helper
    dom(appContainer).removeClass(className => className.startsWith('route-'));
    dom(appContainer).addClass(`route-${viewName}`);

    // Importar dinámicamente y renderizar
    const module = await import(`../views/${viewName}/index.js`);
    const View = module.default;
    const view = new View(context);
    const content = await view.render();

    // Función para hacer commit de la transición
    const commit = async () => {
      // ✅ Ocultar loader antes de mostrar contenido
      hideViewLoader();

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

    // ✅ Ocultar loader en caso de error
    hideViewLoader();

    // ✅ Mostrar error usando dom helper
    const errorHtml = `
      <div class="error-view">
        <div class="error-content">
          <h2>Error al cargar la página</h2>
          <p>${error.message}</p>
          <div class="error-actions">
            <button id="reloadBtn" class="btn-primary">Recargar</button>
            <button id="dashboardBtn" class="btn-secondary">Ir al Dashboard</button>
          </div>
        </div>
      </div>
    `;

    dom(appContainer).html(errorHtml);

    // ✅ Agregar eventos a los botones de error
    dom('#reloadBtn').on('click', () => window.location.reload());
    dom('#dashboardBtn').on('click', () => router.navigate(ROUTES.DASHBOARD));
  }
}

/**
 * ✅ Mostrar loader específico para carga de vistas
 * @param {string} viewName - Nombre de la vista que se está cargando
 */
function showViewLoader(viewName = '') {
  // Remover loader anterior si existe
  hideViewLoader();

  const loaderHtml = `
    <div class="view-loader-container">
      <div class="view-loader-content">
        <div class="view-loader-spinner">
          <div class="spinner-ring primary"></div>
          <div class="spinner-ring secondary"></div>
        </div>
        <div class="view-loader-text">
          <p>Cargando ${getViewDisplayName(viewName)}...</p>
        </div>
      </div>
    </div>
  `;

  // ✅ Crear loader usando dom helper
  currentViewLoader = dom(document.createElement('div'))
    .attr('id', 'view-loader')
    .addClass('view-loader')
    .html(loaderHtml);

  // Agregar estilos si no existen
  addViewLoaderStyles();

  // ✅ Agregar al contenedor principal
  appContainer.appendChild(currentViewLoader.get());
}

/**
 * ✅ Ocultar loader de vista
 */
function hideViewLoader() {
  if (currentViewLoader) {
    const loader = currentViewLoader.get();
    if (loader && loader.parentNode) {
      // ✅ Animación de salida
      dom(loader).addClass('fade-out');
      setTimeout(() => {
        if (loader.parentNode) {
          loader.parentNode.removeChild(loader);
        }
      }, 300);
    }
    currentViewLoader = null;
  }
}

/**
 * ✅ Obtener nombre amigable de la vista para mostrar
 * @param {string} viewName
 * @returns {string}
 */
function getViewDisplayName(viewName) {
  const displayNames = {
    login: 'Inicio de Sesión',
    dashboard: 'Panel Principal',
    form: 'Formulario',
    'enrollment-manual': 'Registro Manual',
    admin: 'Panel de Administración',
  };

  return displayNames[viewName] || viewName;
}

/**
 * ✅ Agregar estilos del loader de vista
 */
function addViewLoaderStyles() {
  // Verificar si los estilos ya existen
  if ($('#view-loader-styles')) return;

  const styles = dom(document.createElement('style')).attr('id', 'view-loader-styles');

  styles.get().textContent = `
    .view-loader {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(240, 242, 242, 0.95);
      backdrop-filter: blur(4px);
      z-index: 1000;
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 1;
      transition: opacity 0.3s ease-out;
    }

    .view-loader.fade-out {
      opacity: 0;
    }

    .view-loader-container {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      height: 100%;
    }

    .view-loader-content {
      text-align: center;
      background: white;
      padding: 30px;
      border-radius: 16px;
      box-shadow: 0 8px 32px rgba(55, 166, 166, 0.15);
      border: 1px solid rgba(55, 166, 166, 0.1);
    }

    .view-loader-spinner {
      position: relative;
      width: 50px;
      height: 50px;
      margin: 0 auto 20px;
    }

    .view-loader-spinner .spinner-ring {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      border: 3px solid transparent;
      border-radius: 50%;
    }

    .view-loader-spinner .spinner-ring.primary {
      border-top-color: #37a6a6;
      animation: viewSpin 1.2s linear infinite;
    }

    .view-loader-spinner .spinner-ring.secondary {
      border-bottom-color: #d96b2b;
      animation: viewSpin 1.2s linear infinite reverse;
      animation-delay: -0.6s;
      width: 80%;
      height: 80%;
      top: 10%;
      left: 10%;
    }

    .view-loader-text p {
      margin: 0;
      color: #732C1C;
      font-size: 14px;
      font-weight: 500;
      opacity: 0.8;
    }

    @keyframes viewSpin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }

    /* Error view styles */
    .error-view {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 60vh;
      padding: 20px;
    }

    .error-content {
      text-align: center;
      background: white;
      padding: 40px;
      border-radius: 16px;
      box-shadow: 0 8px 32px rgba(239, 68, 68, 0.15);
      border: 1px solid rgba(239, 68, 68, 0.1);
      max-width: 400px;
    }

    .error-content h2 {
      color: #ef4444;
      margin-bottom: 16px;
      font-size: 20px;
    }

    .error-content p {
      color: #6b7280;
      margin-bottom: 24px;
      font-size: 14px;
    }

    .error-actions {
      display: flex;
      gap: 12px;
      justify-content: center;
      flex-wrap: wrap;
    }

    .error-actions .btn-primary,
    .error-actions .btn-secondary {
      padding: 10px 20px;
      border: none;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
    }

    .error-actions .btn-primary {
      background: #37a6a6;
      color: white;
    }

    .error-actions .btn-primary:hover {
      background: #2d8a8a;
    }

    .error-actions .btn-secondary {
      background: #f3f4f6;
      color: #374151;
      border: 1px solid #d1d5db;
    }

    .error-actions .btn-secondary:hover {
      background: #e5e7eb;
    }

    /* 404 styles */
    .not-found-view {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 60vh;
      text-align: center;
      padding: 20px;
    }

    .not-found-view h1 {
      font-size: 72px;
      color: #37a6a6;
      margin-bottom: 16px;
      font-weight: 700;
    }

    .not-found-view p {
      color: #6b7280;
      margin-bottom: 24px;
      font-size: 18px;
    }

    .not-found-view a {
      color: #37a6a6;
      text-decoration: none;
      font-weight: 500;
      padding: 12px 24px;
      border: 2px solid #37a6a6;
      border-radius: 8px;
      transition: all 0.2s;
    }

    .not-found-view a:hover {
      background: #37a6a6;
      color: white;
    }

    /* Responsive */
    @media (max-width: 480px) {
      .view-loader-content {
        padding: 20px;
        margin: 20px;
      }
      
      .error-content {
        padding: 30px 20px;
        margin: 20px;
      }
      
      .error-actions {
        flex-direction: column;
      }
      
      .not-found-view h1 {
        font-size: 48px;
      }
    }
  `;

  document.head.appendChild(styles.get());
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

  // Alta Gestión (ruta privada)
  router.on(
    ROUTES.ALTA_GESTION,
    (params, query) => {
      console.log('📝 Cargando alta gestión');
      loadView('alta-gestion', { params, query });
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

  // ✅ Ruta 404 mejorada
  router.notFound(() => {
    console.log('❌ Ruta no encontrada');

    const notFoundHtml = `
      <div class="not-found-view">
        <h1>404</h1>
        <p>Página no encontrada</p>
        <a href="#${ROUTES.HOME}" id="homeLink">Volver al inicio</a>
      </div>
    `;

    dom(appContainer).html(notFoundHtml);

    // ✅ Agregar evento al enlace
    dom('#homeLink').on('click', e => {
      e.preventDefault();
      router.navigate(ROUTES.HOME);
    });
  });

  // Eventos globales de autenticación
  eventBus.on('auth:logout', () => {
    console.log('🚪 Logout detectado, redirigiendo a login');
    // Ejecutar cleanup antes de logout
    if (currentViewCleanup) {
      currentViewCleanup();
      currentViewCleanup = null;
    }
    // ✅ Limpiar loader también
    hideViewLoader();
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
 * ✅ Cleanup global al cerrar la aplicación
 */
window.addEventListener('beforeunload', () => {
  if (currentViewCleanup) {
    currentViewCleanup();
  }
  hideViewLoader();
});
