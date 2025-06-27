// src/services/auth.service.js
// Maneja todo lo relacionado con autenticación: login, logout, verificación de sesión

import {
  API_CONFIG,
  ERROR_MESSAGES,
  STORAGE_KEYS,
} from "../utils/constants.js";
import { apiService, eventBus } from "./api.service.js";
import { storageService } from "./storage.service.js";

class AuthService {
  constructor() {
    this.currentUser = null;
    this.isAuthenticated = false;
  }

  // Inicializar servicio (verificar si hay sesión activa)
  async init() {
    try {
      const hasSession = await storageService.hasValidSession();

      if (hasSession) {
        const userData = await storageService.getUserData();
        if (userData) {
          this.currentUser = userData;
          this.isAuthenticated = true;
          return true;
        }
      }

      return false;
    } catch (error) {
      console.error("Error al inicializar auth:", error);
      return false;
    }
  }

  // Login
  async login(email, password, latitude = null, longitude = null) {
    try {
      console.log("🔐 Intentando login...");

      const payload = { email, password };

      // Si recibimos coords, las agregamos
      if (latitude != null && longitude != null) {
        payload.latitude = latitude.toString();
        payload.longitude = longitude.toString();
      }

      // Hacer petición de login (sin token)
      const response = await apiService.publicRequest(
        "post",
        API_CONFIG.ENDPOINTS.LOGIN,
        payload
      );

      const data = response.data;
      console.log("✅ Login exitoso:", data);

      // Guardar token y datos de usuario
      if (data.token || data.access_token) {
        const token = data.token || data.access_token;
        await storageService.setToken(token);

        // Si viene refresh token, guardarlo
        if (data.refresh_token) {
          await storageService.set(
            STORAGE_KEYS.REFRESH_TOKEN,
            data.refresh_token
          );
        }

        // Si viene tiempo de expiración, guardarlo
        if (data.expires_in) {
          const expiryTime = Date.now() + data.expires_in * 1000;
          await storageService.set(STORAGE_KEYS.TOKEN_EXPIRY, expiryTime);
        }
      }

      // Guardar datos del usuario
      const userData = {
        id: data.user?.id || data.id,
        email: data.user?.email || email,
        name: data.user?.name || data.name || email.split("@")[0],
        role: data.user?.role || data.role || "user",
        ...data.user, // Incluir cualquier dato adicional
      };

      await storageService.setUserData(userData);

      // Actualizar estado local
      this.currentUser = userData;
      this.isAuthenticated = true;

      // Emitir evento de login exitoso
      eventBus.emit("auth:login", userData);

      return {
        success: true,
        user: userData,
      };
    } catch (error) {
      console.error("❌ Error en login:", error);

      // Manejar diferentes tipos de error
      let errorMessage = ERROR_MESSAGES.GENERIC_ERROR;

      if (error.response) {
        switch (error.response.status) {
          case 401:
            errorMessage = ERROR_MESSAGES.INVALID_CREDENTIALS;
            break;
          case 404:
            errorMessage = "Usuario no encontrado";
            break;
          case 422:
            errorMessage = error.response.data?.message || "Datos inválidos";
            break;
          default:
            errorMessage =
              error.response.data?.message || ERROR_MESSAGES.GENERIC_ERROR;
        }
      } else if (error.request) {
        errorMessage = ERROR_MESSAGES.NETWORK_ERROR;
      }

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  // Logout
  async logout() {
    try {
      console.log("🚪 Cerrando sesión...");

      // Opcional: Notificar al servidor del logout
      try {
        await apiService.post(API_CONFIG.ENDPOINTS.LOGOUT);
      } catch (error) {
        // Si falla el logout en servidor, continuar con logout local
        console.warn("No se pudo notificar logout al servidor:", error);
      }

      // Limpiar storage local
      await storageService.clear();

      // Limpiar estado
      this.currentUser = null;
      this.isAuthenticated = false;

      // Emitir evento de logout
      eventBus.emit("auth:logout");

      return true;
    } catch (error) {
      console.error("Error en logout:", error);
      // Incluso si hay error, limpiar datos locales
      await storageService.clear();
      return false;
    }
  }

  // Verificar si el usuario está autenticado
  async checkAuth() {
    // Primero verificar estado local
    if (this.isAuthenticated && this.currentUser) {
      return true;
    }

    // Si no hay estado local, verificar storage
    const hasSession = await storageService.hasValidSession();

    if (hasSession) {
      const userData = await storageService.getUserData();
      if (userData) {
        this.currentUser = userData;
        this.isAuthenticated = true;
        return true;
      }
    }

    // No hay sesión válida
    this.isAuthenticated = false;
    this.currentUser = null;
    return false;
  }

  // Obtener usuario actual
  getCurrentUser() {
    return this.currentUser;
  }

  // Verificar si usuario tiene un rol específico
  hasRole(role) {
    return this.currentUser?.role === role;
  }

  // Verificar si usuario tiene alguno de los roles especificados
  hasAnyRole(roles) {
    return roles.includes(this.currentUser?.role);
  }

  // Actualizar datos del usuario en memoria y storage
  async updateUserData(updates) {
    if (!this.currentUser) return false;

    try {
      this.currentUser = {
        ...this.currentUser,
        ...updates,
      };

      await storageService.setUserData(this.currentUser);
      eventBus.emit("auth:user-updated", this.currentUser);

      return true;
    } catch (error) {
      console.error("Error al actualizar datos de usuario:", error);
      return false;
    }
  }
}

// Exportar instancia única
export const authService = new AuthService();
