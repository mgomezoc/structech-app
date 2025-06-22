// src/routes/guards.js
// Guards (guardias) para proteger rutas que requieren autenticación

import { authService } from "../services/auth.service.js";
import { ROUTES } from "../utils/constants.js";

// Guard básico de autenticación
export const authGuard = async (context, next) => {
  console.log("🛡️ Verificando autenticación para:", context.route.path);

  const isAuthenticated = await authService.checkAuth();

  if (!isAuthenticated) {
    console.log("❌ Usuario no autenticado, redirigiendo a login");

    // Guardar la ruta a la que intentaba acceder
    sessionStorage.setItem("redirectAfterLogin", context.route.path);

    // Redirigir a login
    context.redirect(ROUTES.LOGIN);
    return;
  }

  console.log("✅ Usuario autenticado, permitiendo acceso");
  next();
};

// Guard para rutas que requieren un rol específico
export const roleGuard = (requiredRole) => {
  return async (context, next) => {
    const isAuthenticated = await authService.checkAuth();

    if (!isAuthenticated) {
      context.redirect(ROUTES.LOGIN);
      return;
    }

    if (!authService.hasRole(requiredRole)) {
      console.log("❌ Usuario no tiene el rol requerido:", requiredRole);

      if (window.mostrarMensajeEstado) {
        window.mostrarMensajeEstado(
          "No tienes permisos para acceder a esta sección",
          3000
        );
      }

      context.redirect(ROUTES.DASHBOARD);
      return;
    }

    next();
  };
};

// Guard para rutas públicas (login, registro) - redirige si ya está autenticado
export const guestGuard = async (context, next) => {
  const isAuthenticated = await authService.checkAuth();

  if (isAuthenticated) {
    console.log("✅ Usuario ya autenticado, redirigiendo a dashboard");
    context.redirect(ROUTES.DASHBOARD);
    return;
  }

  next();
};

// Guard para verificar que el formulario tenga ciertos datos
export const formDataGuard = (requiredFields = []) => {
  return async (context, next) => {
    // Primero verificar autenticación
    const isAuthenticated = await authService.checkAuth();

    if (!isAuthenticated) {
      context.redirect(ROUTES.LOGIN);
      return;
    }

    // Verificar que existan los campos requeridos en el contexto o storage
    const formData = context.data || {};
    const missingFields = requiredFields.filter((field) => !formData[field]);

    if (missingFields.length > 0) {
      console.log("❌ Faltan campos requeridos:", missingFields);

      if (window.mostrarMensajeEstado) {
        window.mostrarMensajeEstado(
          "Por favor completa todos los campos requeridos",
          3000
        );
      }

      context.redirect(ROUTES.FORM);
      return;
    }

    next();
  };
};

// Guard combinado - permite múltiples guards en una ruta
export const combineGuards = (...guards) => {
  return async (context, next) => {
    for (const guard of guards) {
      let canProceed = false;

      await guard(context, () => {
        canProceed = true;
      });

      if (!canProceed) {
        return; // Si algún guard falla, detener
      }
    }

    next(); // Todos los guards pasaron
  };
};
