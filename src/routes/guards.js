// src/routes/guards.js
// Guards refactorizados para Navigo v8.11.1

import { authService } from '../services/auth.service.js';
import { ROUTES } from '../utils/constants.js';

/**
 * Guard básico de autenticación
 * Compatible con la API de Navigo v8
 */
export const authGuard = async (done, params, query) => {
  console.log('🛡️ Verificando autenticación para ruta');

  try {
    const isAuthenticated = await authService.checkAuth();

    if (!isAuthenticated) {
      console.log('❌ Usuario no autenticado, redirigiendo a login');

      // Guardar la ruta actual para redirect posterior
      const currentRoute = window.location.hash || window.location.pathname;
      sessionStorage.setItem('redirectAfterLogin', currentRoute);

      // Importar router para navegación
      const { router } = await import('./index.js');
      router.navigate(ROUTES.LOGIN);

      done(false);
      return;
    }

    console.log('✅ Usuario autenticado, permitiendo acceso');
    done();
  } catch (error) {
    console.error('Error en authGuard:', error);
    done(false);
  }
};

/**
 * Guard para rutas que requieren un rol específico
 */
export const roleGuard = requiredRole => {
  return async (done, params, query) => {
    console.log(`🔐 Verificando rol: ${requiredRole}`);

    try {
      const isAuthenticated = await authService.checkAuth();

      if (!isAuthenticated) {
        const { router } = await import('./index.js');
        router.navigate(ROUTES.LOGIN);
        done(false);
        return;
      }

      if (!authService.hasRole(requiredRole)) {
        console.log('❌ Usuario no tiene el rol requerido:', requiredRole);

        // Mostrar mensaje de error si existe la función global
        if (typeof window.mostrarMensajeEstado === 'function') {
          window.mostrarMensajeEstado('No tienes permisos para acceder a esta sección', 3000);
        }

        const { router } = await import('./index.js');
        router.navigate(ROUTES.DASHBOARD);
        done(false);
        return;
      }

      console.log('✅ Usuario tiene el rol requerido');
      done();
    } catch (error) {
      console.error('Error en roleGuard:', error);
      done(false);
    }
  };
};

/**
 * Guard para rutas públicas (redirige si ya está autenticado)
 */
export const guestGuard = async (done, params, query) => {
  console.log('👤 Verificando guest access');

  try {
    const isAuthenticated = await authService.checkAuth();

    if (isAuthenticated) {
      console.log('✅ Usuario ya autenticado, redirigiendo a dashboard');
      const { router } = await import('./index.js');
      router.navigate(ROUTES.DASHBOARD);
      done(false);
      return;
    }

    console.log('✅ Usuario no autenticado, permitiendo acceso a ruta pública');
    done();
  } catch (error) {
    console.error('Error en guestGuard:', error);
    // En caso de error, permitir acceso a ruta pública
    done();
  }
};

/**
 * Guard para verificar datos de formulario
 */
export const formDataGuard = (requiredFields = []) => {
  return async (done, params, query) => {
    console.log('📝 Verificando datos de formulario');

    try {
      // Primero verificar autenticación
      const isAuthenticated = await authService.checkAuth();

      if (!isAuthenticated) {
        const { router } = await import('./index.js');
        router.navigate(ROUTES.LOGIN);
        done(false);
        return;
      }

      // Verificar campos requeridos en sessionStorage o localStorage
      const formData = JSON.parse(sessionStorage.getItem('formData') || '{}');
      const missingFields = requiredFields.filter(field => !formData[field]);

      if (missingFields.length > 0) {
        console.log('❌ Faltan campos requeridos:', missingFields);

        if (typeof window.mostrarMensajeEstado === 'function') {
          window.mostrarMensajeEstado('Por favor completa todos los campos requeridos', 3000);
        }

        const { router } = await import('./index.js');
        router.navigate(ROUTES.FORM);
        done(false);
        return;
      }

      console.log('✅ Datos de formulario válidos');
      done();
    } catch (error) {
      console.error('Error en formDataGuard:', error);
      done(false);
    }
  };
};

/**
 * Combina múltiples guards para ejecutarlos secuencialmente
 * Compatible con Navigo v8
 */
export const combineGuards = (...guards) => {
  return async (done, params, query) => {
    console.log(`🔗 Ejecutando ${guards.length} guards combinados`);

    let currentIndex = 0;

    const executeNext = () => {
      if (currentIndex >= guards.length) {
        console.log('✅ Todos los guards pasaron');
        done();
        return;
      }

      const currentGuard = guards[currentIndex++];

      currentGuard(
        result => {
          if (result === false) {
            console.log('❌ Guard falló, deteniendo ejecución');
            done(false);
            return;
          }
          executeNext();
        },
        params,
        query,
      );
    };

    executeNext();
  };
};

/**
 * Helper para crear guards de autenticación personalizados
 */
export const createAuthGuard = (redirectRoute = ROUTES.LOGIN) => {
  return async (done, params, query) => {
    const isAuthenticated = await authService.checkAuth();

    if (!isAuthenticated) {
      sessionStorage.setItem('redirectAfterLogin', window.location.hash);
      const { router } = await import('./index.js');
      router.navigate(redirectRoute);
      done(false);
      return;
    }

    done();
  };
};
