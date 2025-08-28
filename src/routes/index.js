// src/routes/index.js
import Navigo from 'navigo';
import { eventBus } from '../services/api.service.js';
import { authService } from '../services/auth.service.js';
import { ROUTES } from '../utils/constants.js';
import { $, dom } from '../utils/dom.helper.js';
import { authGuard, combineGuards, guestGuard, roleGuard } from './guards.js';

// Creamos el router en modo hash
export const router = new Navigo('/', { hash: true });

// Contenedor principal
const appContainer = $('#app') || document.body;

// Variables para manejar estado actual
let currentViewCleanup = null;
let currentView = null;
let isTransitioning = false;

// Cache de vistas precargadas
const viewCache = new Map();

/**
 * Precargar vistas comunes para mejorar performance
 */
async function preloadCommonViews() {
  const commonViews = ['dashboard', 'form', 'enrollment-manual'];

  commonViews.forEach(viewName => {
    // Precarga diferida para no bloquear el inicio
    setTimeout(() => {
      import(`../views/${viewName}/index.js`)
        .then(module => viewCache.set(viewName, module))
        .catch(() => {}); // Silenciar errores de precarga
    }, 2000);
  });
}

/**
 * Helper mejorado para cargar vistas con renderizado progresivo
 * @param {string} viewName - Nombre de la vista a cargar
 * @param {object} context - Contexto con params, query, etc.
 */
async function loadView(viewName, context = {}) {
  // Evitar transiciones múltiples simultáneas
  if (isTransitioning) {
    console.warn('⚠️ Transición en progreso, cancelando nueva navegación');
    return;
  }

  isTransitioning = true;

  try {
    console.log(`📄 Cargando vista: ${viewName}`);

    // 1. Cleanup inmediato de vista anterior (no bloqueante)
    if (currentViewCleanup) {
      Promise.resolve(currentViewCleanup()).catch(console.error);
      currentViewCleanup = null;
    }

    // 2. Aplicar clase de ruta inmediatamente
    dom(appContainer)
      .removeClass(className => className.startsWith('route-'))
      .addClass(`route-${viewName}`);

    // 3. Mostrar skeleton loader inmediato (más ligero)
    showSkeletonLoader(viewName);

    // 4. Importar la vista (desde cache si existe)
    let module;
    if (viewCache.has(viewName)) {
      module = viewCache.get(viewName);
    } else {
      module = await import(`../views/${viewName}/index.js`);
      viewCache.set(viewName, module);
    }

    const View = module.default;
    currentView = new View(context);

    // 5. Renderizar contenido base (HTML estático)
    const content = await currentView.render();

    // 6. Commit rápido del contenido principal
    const fastCommit = () => {
      // Ocultar cualquier toast previo
      const toast = document.querySelector('.toast-message');
      if (toast && toast.parentElement) toast.parentElement.removeChild(toast);

      appContainer.innerHTML = content;
      hideSkeletonLoader();

      // 7. Ejecutar afterRender de forma NO bloqueante
      if (currentView.afterRender) {
        // Usar requestIdleCallback si está disponible
        const runAfterRender = () => {
          currentView.afterRender().catch(error => {
            console.error('Error en afterRender:', error);
          });
        };

        if ('requestIdleCallback' in window) {
          requestIdleCallback(runAfterRender, { timeout: 50 });
        } else {
          setTimeout(runAfterRender, 0);
        }
      }

      // Guardar cleanup para la próxima navegación
      currentViewCleanup = currentView.cleanup ? () => currentView.cleanup() : null;
    };

    // 8. Usar transición suave si está disponible
    if (document.startViewTransition && !isMobileDevice()) {
      await document.startViewTransition(fastCommit).finished;
    } else {
      fastCommit();
    }
  } catch (error) {
    console.error(`Error al cargar vista ${viewName}:`, error);
    showErrorView(error);
  } finally {
    isTransitioning = false;
  }
}

/**
 * Skeleton loader ligero para transiciones más fluidas
 */
function showSkeletonLoader(viewName) {
  const skeletons = {
    dashboard: `
      <div class="skeleton-container">
        <div class="skeleton-header"></div>
        <div class="skeleton-grid">
          <div class="skeleton-card"></div>
          <div class="skeleton-card"></div>
          <div class="skeleton-card"></div>
        </div>
      </div>
    `,
    form: `
      <div class="skeleton-container">
        <div class="skeleton-header"></div>
        <div class="skeleton-form">
          <div class="skeleton-input"></div>
          <div class="skeleton-input"></div>
          <div class="skeleton-input"></div>
        </div>
      </div>
    `,
    default: `
      <div class="skeleton-container">
        <div class="skeleton-header"></div>
        <div class="skeleton-content">
          <div class="skeleton-line"></div>
          <div class="skeleton-line"></div>
          <div class="skeleton-line short"></div>
        </div>
      </div>
    `,
  };

  const skeleton = skeletons[viewName] || skeletons.default;

  // Aplicar skeleton con fade-in rápido
  dom(appContainer).addClass('skeleton-loading').html(skeleton);

  // Agregar estilos si no existen
  addSkeletonStyles();
}

/**
 * Ocultar skeleton loader
 */
function hideSkeletonLoader() {
  dom(appContainer).removeClass('skeleton-loading');
}

/**
 * Detectar si es dispositivo móvil (para deshabilitar transiciones pesadas)
 */
function isMobileDevice() {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

/**
 * Mostrar vista de error mejorada
 */
function showErrorView(error) {
  const errorHtml = `
    <div class="error-view fade-in">
      <div class="error-content">
        <div class="error-icon">⚠️</div>
        <h2>Error al cargar la página</h2>
        <p>${error.message || 'Error desconocido'}</p>
        <div class="error-actions">
          <button id="reloadBtn" class="btn-primary">
            <span>🔄</span> Reintentar
          </button>
          <button id="dashboardBtn" class="btn-secondary">
            <span>🏠</span> Ir al inicio
          </button>
        </div>
      </div>
    </div>
  `;

  dom(appContainer).html(errorHtml);

  // Eventos con delegation para mejor performance
  dom('#reloadBtn').on('click', () => window.location.reload());
  dom('#dashboardBtn').on('click', () => router.navigate(ROUTES.DASHBOARD));
}

/**
 * Agregar estilos optimizados para skeleton loader
 */
function addSkeletonStyles() {
  if ($('#skeleton-styles')) return;

  const styles = dom(document.createElement('style')).attr('id', 'skeleton-styles');

  styles.get().textContent = `
    /* Skeleton loader styles */
    .skeleton-loading {
      animation: fadeIn 0.2s ease-out;
    }

    .skeleton-container {
      padding: 20px;
      max-width: 1200px;
      margin: 0 auto;
    }

    .skeleton-header {
      height: 60px;
      background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
      background-size: 200% 100%;
      animation: loading 1.5s infinite;
      border-radius: 8px;
      margin-bottom: 24px;
    }

    .skeleton-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 20px;
    }

    .skeleton-card {
      height: 200px;
      background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
      background-size: 200% 100%;
      animation: loading 1.5s infinite;
      border-radius: 12px;
    }

    .skeleton-form {
      max-width: 600px;
    }

    .skeleton-input {
      height: 48px;
      background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
      background-size: 200% 100%;
      animation: loading 1.5s infinite;
      border-radius: 6px;
      margin-bottom: 16px;
    }

    .skeleton-line {
      height: 16px;
      background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
      background-size: 200% 100%;
      animation: loading 1.5s infinite;
      border-radius: 4px;
      margin-bottom: 12px;
    }

    .skeleton-line.short {
      width: 60%;
    }

    @keyframes loading {
      0% { background-position: 200% 0; }
      100% { background-position: -200% 0; }
    }

    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    /* Error view optimizada */
    .error-view {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 60vh;
      padding: 20px;
    }

    .error-view.fade-in {
      animation: fadeIn 0.3s ease-out;
    }

    .error-content {
      text-align: center;
      background: white;
      padding: 40px;
      border-radius: 16px;
      box-shadow: 0 4px 24px rgba(0, 0, 0, 0.1);
      max-width: 400px;
    }

    .error-icon {
      font-size: 48px;
      margin-bottom: 16px;
    }

    .error-content h2 {
      color: #374151;
      margin-bottom: 12px;
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
    }

    .error-actions button {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 10px 20px;
      border: none;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: transform 0.2s, box-shadow 0.2s;
    }

    .error-actions button:active {
      transform: scale(0.95);
    }

    .btn-primary {
      background: #37a6a6;
      color: white;
    }

    .btn-primary:hover {
      box-shadow: 0 4px 12px rgba(55, 166, 166, 0.3);
    }

    .btn-secondary {
      background: #f3f4f6;
      color: #374151;
    }

    .btn-secondary:hover {
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
    }

    /* Optimizaciones para móvil */
    @media (max-width: 480px) {
      .skeleton-container {
        padding: 16px;
      }
      
      .error-content {
        padding: 24px;
      }
      
      .error-actions {
        flex-direction: column;
        width: 100%;
      }
      
      .error-actions button {
        width: 100%;
      }
    }

    /* Deshabilitar transiciones en preferencias de usuario */
    @media (prefers-reduced-motion: reduce) {
      * {
        animation-duration: 0.01ms !important;
        transition-duration: 0.01ms !important;
      }
    }
  `;

  document.head.appendChild(styles.get());
}

/**
 * Configuración de todas las rutas
 */
export function setupRoutes() {
  // Precargar vistas comunes después del inicio
  setTimeout(preloadCommonViews, 1000);

  // Ruta raíz - redirección inteligente
  router.on(ROUTES.HOME, async () => {
    console.log('🏠 Accediendo a ruta raíz');
    const isAuth = await authService.checkAuth();
    router.navigate(isAuth ? ROUTES.DASHBOARD : ROUTES.LOGIN);
  });

  // Login (ruta pública)
  router.on(ROUTES.LOGIN, (params, query) => loadView('login', { params, query }), {
    before: guestGuard,
  });

  // Dashboard (ruta privada)
  router.on(ROUTES.DASHBOARD, (params, query) => loadView('dashboard', { params, query }), {
    before: authGuard,
  });

  // Formulario (ruta privada)
  router.on(ROUTES.FORM, (params, query) => loadView('form', { params, query }), {
    before: authGuard,
  });

  // Formulario con ID
  router.on(ROUTES.FORM + '/:id', (params, query) => loadView('form', { params, query }), {
    before: authGuard,
  });

  // Enrollment manual
  router.on(
    ROUTES.ENROLLMENT_MANUAL,
    (params, query) => loadView('enrollment-manual', { params, query }),
    { before: authGuard },
  );

  // Alta Gestión
  router.on(ROUTES.ALTA_GESTION, (params, query) => loadView('alta-gestion', { params, query }), {
    before: authGuard,
  });

  // Admin
  router.on('/admin', (params, query) => loadView('admin', { params, query }), {
    before: combineGuards(authGuard, roleGuard('admin')),
  });

  // Rutas de Encuestas
  router.on(
    ROUTES.SURVEYS,
    (params, query) => {
      console.log('📋 Navegando a lista de encuestas');
      loadView('surveys', { params, query });
    },
    {
      before: authGuard,
    },
  );

  router.on(
    ROUTES.SURVEYS + '/:id',
    (params, query) => {
      console.log(`📝 Navegando a encuesta ${params.id}`);
      loadView('survey-detail', { params, query });
    },
    {
      before: authGuard,
    },
  );

  // 404 mejorado
  router.notFound(() => {
    console.log('❌ Ruta no encontrada');
    const notFoundHtml = `
      <div class="error-view fade-in">
        <div class="error-content">
          <div class="error-icon">🔍</div>
          <h2>404 - Página no encontrada</h2>
          <p>La página que buscas no existe</p>
          <button id="homeBtn" class="btn-primary">
            <span>🏠</span> Volver al inicio
          </button>
        </div>
      </div>
    `;

    dom(appContainer).html(notFoundHtml);
    dom('#homeBtn').on('click', () => router.navigate(ROUTES.HOME));
  });

  // Eventos globales optimizados
  eventBus.on('auth:logout', () => {
    if (currentViewCleanup) {
      Promise.resolve(currentViewCleanup()).catch(console.error);
      currentViewCleanup = null;
    }
    router.navigate(ROUTES.LOGIN);
  });

  eventBus.on('auth:login', () => {
    const redirectPath = sessionStorage.getItem('redirectAfterLogin');
    if (redirectPath && redirectPath !== '#' + ROUTES.LOGIN) {
      sessionStorage.removeItem('redirectAfterLogin');
      const cleanPath = redirectPath.startsWith('#') ? redirectPath.substring(1) : redirectPath;
      router.navigate(cleanPath);
    } else {
      router.navigate(ROUTES.DASHBOARD);
    }
  });

  // Hooks optimizados
  router.hooks({
    before: done => {
      // Scroll suave al top
      window.scrollTo({ top: 0, behavior: 'instant' });
      done();
    },
    after: () => {
      console.log('✅ Navegación completada');
    },
  });

  // Resolución inicial
  router.resolve();
}

// Helpers públicos
export function navigateTo(path, data = {}) {
  if (!isTransitioning) {
    router.navigate(path, data);
  }
}

export function getRouteParams() {
  const location = router.getCurrentLocation();
  return location?.params || {};
}

export function getQueryParams() {
  const location = router.getCurrentLocation();
  if (!location?.queryString) return {};

  const params = new URLSearchParams(location.queryString);
  return Object.fromEntries(params);
}

export function getCurrentRoute() {
  const location = router.getCurrentLocation();
  return location?.url || ROUTES.HOME;
}

export function isCurrentRoute(route) {
  return getCurrentRoute() === route;
}

// Cleanup optimizado al cerrar
window.addEventListener('beforeunload', () => {
  if (currentViewCleanup) {
    currentViewCleanup();
  }
});
