// src/services/auth.service.js
// Gestión de autenticación, sesiones y login biométrico

import {
  API_CONFIG,
  ERROR_MESSAGES,
  STORAGE_KEYS,
} from "../utils/constants.js";
import { apiService, eventBus } from "./api.service.js";
import { storageService } from "./storage.service.js";

import { BiometricAuth } from "@aparajita/capacitor-biometric-auth";
import { SecureStorage } from "@aparajita/capacitor-secure-storage";

// Claves dedicadas en SecureStorage
const BIOTOKEN_KEY = "biometric_auth_token";
const BIOUSER_KEY = "biometric_user_data";
const BIOENABLED_KEY = "biometric_enabled";

class AuthService {
  constructor() {
    this.currentUser = null;
    this.isAuthenticated = false;
  }

  /** Inicializa el servicio y restaura sesión si existe */
  async init() {
    console.log("[AuthService] init()");
    try {
      const hasSession = await storageService.hasValidSession();
      console.log("[Auth:init] hasValidSession:", hasSession);
      if (hasSession) {
        const userData = await storageService.getUserData();
        console.log("[Auth:init] userData:", userData);
        if (userData) {
          this.currentUser = userData;
          this.isAuthenticated = true;
          return true;
        }
      }
    } catch (e) {
      console.error("[Auth:init] Error:", e);
    }
    return false;
  }

  /**
   * Login con email/password (+ geoloc opcional)
   * @returns {{success:boolean, user?:object, error?:string}}
   */
  async login(email, password, latitude = null, longitude = null) {
    console.log("[AuthService] login()", { email, latitude, longitude });
    try {
      const payload = { email, password };
      if (latitude && longitude) {
        payload.latitude = latitude.toString();
        payload.longitude = longitude.toString();
      }

      const res = await apiService.publicRequest(
        "post",
        API_CONFIG.ENDPOINTS.LOGIN,
        payload
      );
      const data = res.data;
      console.log("[AuthService:login] response:", data);

      // 1) Guarda JWT en Preferences
      const token = data.token || data.access_token;
      console.log("[AuthService:login] token:", token);
      if (token) {
        await storageService.setToken(token);
      }

      // 2) Guarda expiración
      if (data.expires_in) {
        const expiry = Date.now() + data.expires_in * 1000;
        await storageService.set(STORAGE_KEYS.TOKEN_EXPIRY, expiry);
      }

      // 3) Construye y guarda userData
      const userData = {
        id: data.user?.id || data.id,
        email: data.user?.email || email,
        name: data.user?.name || data.name || email.split("@")[0],
        role: data.user?.role || data.role || "user",
        ...data.user,
      };
      console.log("[AuthService:login] userData:", userData);
      await storageService.setUserData(userData);

      // 4) Actualiza estado y emite evento
      this.currentUser = userData;
      this.isAuthenticated = true;
      eventBus.emit("auth:login", userData);

      return { success: true, user: userData };
    } catch (err) {
      console.error("[AuthService:login] Error:", err);
      let message = ERROR_MESSAGES.GENERIC_ERROR;
      if (err.response) {
        switch (err.response.status) {
          case 401:
            message = ERROR_MESSAGES.INVALID_CREDENTIALS;
            break;
          case 404:
            message = "Usuario no encontrado";
            break;
          case 422:
            message = err.response.data?.message || "Datos inválidos";
            break;
        }
      } else if (err.request) {
        message = ERROR_MESSAGES.NETWORK_ERROR;
      }
      return { success: false, error: message };
    }
  }

  /**
   * Logout: elimina sólo el JWT público (token + expiry),
   * preserva en Preferences el userData y en SecureStorage
   * las credenciales biométricas.
   */
  async logout() {
    console.log("[AuthService] logout()");
    // 1) Intentar notificar al servidor (no frena logout)
    await apiService
      .post(API_CONFIG.ENDPOINTS.LOGOUT)
      .catch((e) => console.warn("[AuthService:logout] servidor:", e));

    // 2) Elimina sólo el JWT público
    await storageService.remove(STORAGE_KEYS.ACCESS_TOKEN);
    await storageService.remove(STORAGE_KEYS.TOKEN_EXPIRY);
    console.log("[AuthService:logout] JWT público eliminado");

    // 3) Mantiene userData en Preferences para login biométrico
    this.currentUser = null;
    this.isAuthenticated = false;
    eventBus.emit("auth:logout");
    return true;
  }

  /** Verifica si la sesión pública sigue activa */
  async checkAuth() {
    console.log("[AuthService] checkAuth()");
    if (this.isAuthenticated && this.currentUser) return true;
    if (await storageService.hasValidSession()) {
      const userData = await storageService.getUserData();
      if (userData) {
        this.currentUser = userData;
        this.isAuthenticated = true;
        return true;
      }
    }
    this.currentUser = null;
    this.isAuthenticated = false;
    return false;
  }

  getCurrentUser() {
    return this.currentUser;
  }

  hasRole(role) {
    return this.currentUser?.role === role;
  }

  hasAnyRole(roles) {
    return roles.includes(this.currentUser?.role);
  }

  /** Actualiza datos del usuario en Preferences */
  async updateUserData(updates) {
    console.log("[AuthService] updateUserData()", updates);
    if (!this.currentUser) return false;
    try {
      this.currentUser = { ...this.currentUser, ...updates };
      await storageService.setUserData(this.currentUser);
      eventBus.emit("auth:user-updated", this.currentUser);
      return true;
    } catch (e) {
      console.error("[AuthService:updateUserData] Error:", e);
      return false;
    }
  }

  // —— MÉTODOS BIOMÉTRICOS —— //

  /** ¿Soporta el dispositivo biometría? */
  async isBiometricAvailable() {
    console.log("[AuthService] isBiometricAvailable()");
    try {
      const info = await BiometricAuth.checkBiometry();
      console.log("[AuthService] checkBiometry:", info);
      return info.isAvailable;
    } catch (e) {
      console.error("[AuthService] checkBiometry error:", e);
      return false;
    }
  }

  /** ¿Usuario habilitó login biométrico? */
  async isBiometricEnabled() {
    console.log("[AuthService] isBiometricEnabled()");
    try {
      const val = await SecureStorage.getItem(BIOENABLED_KEY);
      console.log("[AuthService] biometric_enabled:", val);
      return val === "true";
    } catch (e) {
      console.error("[AuthService] getItem(biometric_enabled):", e);
      return false;
    }
  }

  /**
   * Habilita login biométrico:
   * - Prompt del sistema
   * - Guarda el JWT y el userData en SecureStorage
   * - Marca la flag
   */
  async enableBiometric() {
    console.log("[AuthService] enableBiometric()");
    await BiometricAuth.authenticate({
      reason: "Autentícate para habilitar inicio con huella",
    });
    console.log("[AuthService] biometric prompt OK");

    const token = await storageService.getToken();
    const userData = this.currentUser;
    if (!token || !userData) {
      throw new Error("Sesión no válida para habilitar biometría");
    }

    // Guarda en SecureStorage
    await SecureStorage.setItem(BIOTOKEN_KEY, token);
    await SecureStorage.setItem(BIOUSER_KEY, JSON.stringify(userData));
    await SecureStorage.setItem(BIOENABLED_KEY, "true");
    console.log(
      "[AuthService] SecureStorage: token + userData + enabled flag guardados"
    );
  }

  /**
   * Login biométrico:
   * 1) Prompt del sistema
   * 2) Recupera JWT + userData de SecureStorage
   * 3) Restaura en Preferences (token + userData)
   */
  async loginWithBiometric() {
    console.log("[AuthService] loginWithBiometric()");
    // Disponibilidad
    const info = await BiometricAuth.checkBiometry();
    console.log("[AuthService] checkBiometry:", info);
    if (!info.isAvailable) {
      return { success: false, error: "Biometría no soportada" };
    }

    // Prompt
    await BiometricAuth.authenticate({
      reason: "Usa tu huella o rostro para iniciar sesión",
    });
    console.log("[AuthService] biometric prompt OK");

    // Recupera de SecureStorage
    const tok = await SecureStorage.getItem(BIOTOKEN_KEY);
    const ujstr = await SecureStorage.getItem(BIOUSER_KEY);
    if (!tok || !ujstr) {
      return { success: false, error: "No hay credenciales biométricas" };
    }

    // Restaura en Preferences
    await storageService.setToken(tok);
    const userData = JSON.parse(ujstr);
    await storageService.setUserData(userData);

    this.currentUser = userData;
    this.isAuthenticated = true;
    eventBus.emit("auth:login", userData);
    console.log("[AuthService] loginWithBiometric SUCCESS");

    return { success: true, user: userData };
  }

  /** Deshabilita login biométrico */
  async disableBiometric() {
    console.log("[AuthService] disableBiometric()");
    await SecureStorage.removeItem(BIOTOKEN_KEY);
    await SecureStorage.removeItem(BIOUSER_KEY);
    await SecureStorage.removeItem(BIOENABLED_KEY);
    console.log("[AuthService] Credenciales biométricas eliminadas");
  }
}

// Exporta la única instancia
export const authService = new AuthService();
