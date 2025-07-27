// src/services/auth.service.js
// Gestión de autenticación, sesiones y login biométrico

import { API_CONFIG, ERROR_MESSAGES } from '../utils/constants.js';
import { apiService, eventBus } from './api.service.js';
import { storageService } from './storage.service.js';

import { BiometricAuth } from '@aparajita/capacitor-biometric-auth';
import { SecureStorage } from '@aparajita/capacitor-secure-storage';

// Claves dedicadas en SecureStorage para biometría
const BIOTOKEN_KEY = 'biometric_auth_token';
const BIOUSER_KEY = 'biometric_user_data';
const BIOENABLED_KEY = 'biometric_enabled';

class AuthService {
  constructor() {
    this.currentUser = null;
    this.isAuthenticated = false;
  }

  /** Inicializa el servicio y restaura sesión si existe */
  async init() {
    console.log('🔐 [AuthService] Inicializando...');
    try {
      const hasSession = await storageService.hasValidSession();
      console.log(`🔍 [AuthService] Sesión válida encontrada: ${hasSession}`);

      if (hasSession) {
        const userData = await storageService.getUserData();
        console.log('👤 [AuthService] Datos de usuario:', userData);

        if (userData) {
          this.currentUser = userData;
          this.isAuthenticated = true;
          console.log('✅ [AuthService] Sesión restaurada exitosamente');
          return true;
        }
      }
    } catch (error) {
      console.error('❌ [AuthService] Error en init:', error);
    }

    console.log('❌ [AuthService] No se pudo restaurar la sesión');
    return false;
  }

  /**
   * Login con email/password + geolocalización opcional
   * @param {string} email
   * @param {string} password
   * @param {number|null} latitude
   * @param {number|null} longitude
   * @returns {Promise<{success: boolean, user?: object, error?: string}>}
   */
  async login(email, password, latitude = null, longitude = null) {
    console.log('🔑 [AuthService] Iniciando login para:', email);

    try {
      const payload = { email, password };

      // Agregar coordenadas si están disponibles
      if (latitude && longitude) {
        payload.latitude = latitude.toString();
        payload.longitude = longitude.toString();
        console.log('📍 [AuthService] Incluyendo geolocalización');
      }

      // Hacer petición de login
      const response = await apiService.publicRequest('post', API_CONFIG.ENDPOINTS.LOGIN, payload);

      const data = response.data;
      console.log('📥 [AuthService] Respuesta del servidor:', data);

      // Extraer token (puede venir como 'token' o 'access_token')
      const token = data.token || data.access_token;
      if (!token) {
        throw new Error('No se recibió token del servidor');
      }

      // Guardar token
      await storageService.setToken(token);
      console.log('💾 [AuthService] Token guardado');

      // Guardar expiración si está disponible
      if (data.expires_in) {
        const expiry = Date.now() + data.expires_in * 1000;
        await storageService.setTokenExpiry(expiry);
        console.log('⏰ [AuthService] Expiración del token guardada');
      }

      // Construir datos de usuario
      const userData = {
        id: data.user?.id || data.id,
        email: data.user?.email || email,
        name: data.user?.name || data.name || email.split('@')[0],
        role: data.user?.role || data.role || 'user',
        ...data.user, // Incluir cualquier dato adicional del usuario
      };

      // Guardar datos de usuario
      await storageService.setUserData(userData);
      console.log('👤 [AuthService] Datos de usuario guardados:', userData);

      // Actualizar estado interno
      this.currentUser = userData;
      this.isAuthenticated = true;

      // Emitir evento de login exitoso
      eventBus.emit('auth:login', userData);
      console.log('✅ [AuthService] Login exitoso');

      return { success: true, user: userData };
    } catch (error) {
      console.error('❌ [AuthService] Error en login:', error);

      let message = ERROR_MESSAGES.GENERIC_ERROR;

      if (error.response) {
        // Error de respuesta del servidor
        switch (error.response.status) {
          case 401:
            message = ERROR_MESSAGES.INVALID_CREDENTIALS;
            break;
          case 404:
            message = 'Usuario no encontrado';
            break;
          case 422:
            message = error.response.data?.message || 'Datos inválidos';
            break;
          case 429:
            message = 'Demasiados intentos. Intenta más tarde';
            break;
          default:
            message = error.response.data?.message || ERROR_MESSAGES.GENERIC_ERROR;
        }
      } else if (error.request) {
        // Error de red
        message = ERROR_MESSAGES.NETWORK_ERROR;
      }

      return { success: false, error: message };
    }
  }

  /**
   * Logout: elimina datos de sesión pero preserva configuración biométrica
   */
  async logout() {
    console.log('🚪 [AuthService] Cerrando sesión...');

    try {
      // Intentar notificar logout al servidor (no crítico si falla)
      try {
        await apiService.post(API_CONFIG.ENDPOINTS.LOGOUT);
        console.log('📤 [AuthService] Logout notificado al servidor');
      } catch (error) {
        console.warn('⚠️ [AuthService] Error notificando logout al servidor:', error);
      }

      // Limpiar datos de sesión local
      await storageService.clearSession();
      console.log('🧹 [AuthService] Datos de sesión limpiados');

      // Actualizar estado interno
      this.currentUser = null;
      this.isAuthenticated = false;

      // Emitir evento de logout
      eventBus.emit('auth:logout');
      console.log('✅ [AuthService] Logout completado');

      return { success: true };
    } catch (error) {
      console.error('❌ [AuthService] Error en logout:', error);

      // Asegurar limpieza local aunque falle el servidor
      await storageService.clearSession();
      this.currentUser = null;
      this.isAuthenticated = false;
      eventBus.emit('auth:logout');

      return { success: false, error: error.message };
    }
  }

  /** Verifica si hay una sesión activa válida */
  async checkAuth() {
    console.log('🔍 [AuthService] Verificando autenticación...');

    // Si ya tenemos estado en memoria, verificar que siga válido
    if (this.isAuthenticated && this.currentUser) {
      const hasValidSession = await storageService.hasValidSession();
      if (hasValidSession) {
        console.log('✅ [AuthService] Sesión en memoria válida');
        return true;
      } else {
        console.log('❌ [AuthService] Sesión en memoria expirada');
        this.currentUser = null;
        this.isAuthenticated = false;
      }
    }

    // Verificar storage
    if (await storageService.hasValidSession()) {
      const userData = await storageService.getUserData();
      if (userData) {
        this.currentUser = userData;
        this.isAuthenticated = true;
        console.log('✅ [AuthService] Sesión restaurada desde storage');
        return true;
      }
    }

    console.log('❌ [AuthService] No hay sesión válida');
    this.currentUser = null;
    this.isAuthenticated = false;
    return false;
  }

  // Getters para datos de usuario
  getCurrentUser() {
    return this.currentUser;
  }

  hasRole(role) {
    return this.currentUser?.role === role;
  }

  hasAnyRole(roles) {
    return roles.includes(this.currentUser?.role);
  }

  /** Actualiza datos del usuario actual */
  async updateUserData(updates) {
    console.log('📝 [AuthService] Actualizando datos de usuario:', updates);

    if (!this.currentUser) {
      console.error('❌ [AuthService] No hay usuario logueado para actualizar');
      return false;
    }

    try {
      this.currentUser = { ...this.currentUser, ...updates };
      await storageService.setUserData(this.currentUser);
      eventBus.emit('auth:user-updated', this.currentUser);
      console.log('✅ [AuthService] Datos de usuario actualizados');
      return true;
    } catch (error) {
      console.error('❌ [AuthService] Error actualizando datos de usuario:', error);
      return false;
    }
  }

  // ========== MÉTODOS BIOMÉTRICOS ========== //

  /** Verifica si el dispositivo soporta autenticación biométrica */
  async isBiometricAvailable() {
    console.log('🔍 [AuthService] Verificando disponibilidad biométrica...');

    try {
      const info = await BiometricAuth.checkBiometry();
      console.log('📱 [AuthService] Info biométrica:', info);
      return info.isAvailable;
    } catch (error) {
      console.error('❌ [AuthService] Error verificando biometría:', error);
      return false;
    }
  }

  /** Verifica si el usuario ha habilitado autenticación biométrica */
  async isBiometricEnabled() {
    console.log('🔍 [AuthService] Verificando si biometría está habilitada...');

    try {
      const enabled = await SecureStorage.getItem(BIOENABLED_KEY);
      const isEnabled = enabled === 'true';
      console.log(`🔐 [AuthService] Biometría habilitada: ${isEnabled}`);
      return isEnabled;
    } catch (error) {
      console.error('❌ [AuthService] Error verificando estado biométrico:', error);
      return false;
    }
  }

  /**
   * Habilita autenticación biométrica
   * Guarda credenciales en SecureStorage después de verificar biometría
   */
  async enableBiometric() {
    console.log('🔐 [AuthService] Habilitando autenticación biométrica...');

    try {
      // Verificar que hay sesión activa
      const token = await storageService.getToken();
      const userData = this.currentUser;

      if (!token || !userData) {
        throw new Error('Sesión no válida para habilitar biometría');
      }

      // Prompt biométrico para confirmar
      await BiometricAuth.authenticate({
        reason: 'Autentícate para habilitar inicio con huella',
        subtitle: 'Usa tu huella o rostro',
      });

      console.log('✅ [AuthService] Autenticación biométrica exitosa');

      // Guardar credenciales en SecureStorage
      await SecureStorage.setItem(BIOTOKEN_KEY, token);
      await SecureStorage.setItem(BIOUSER_KEY, JSON.stringify(userData));
      await SecureStorage.setItem(BIOENABLED_KEY, 'true');

      console.log('💾 [AuthService] Credenciales biométricas guardadas');
      return { success: true };
    } catch (error) {
      console.error('❌ [AuthService] Error habilitando biometría:', error);
      throw new Error(error.message || 'Error habilitando autenticación biométrica');
    }
  }

  /**
   * Login usando autenticación biométrica
   * Recupera credenciales de SecureStorage y restaura sesión
   */
  async loginWithBiometric() {
    console.log('👆 [AuthService] Iniciando login biométrico...');

    try {
      // Verificar disponibilidad
      const info = await BiometricAuth.checkBiometry();
      if (!info.isAvailable) {
        return { success: false, error: 'Biometría no disponible en este dispositivo' };
      }

      // Prompt biométrico
      await BiometricAuth.authenticate({
        reason: 'Usa tu huella o rostro para iniciar sesión',
        subtitle: 'Autenticación biométrica',
      });

      console.log('✅ [AuthService] Autenticación biométrica exitosa');

      // Recuperar credenciales de SecureStorage
      const token = await SecureStorage.getItem(BIOTOKEN_KEY);
      const userDataString = await SecureStorage.getItem(BIOUSER_KEY);

      if (!token || !userDataString) {
        return {
          success: false,
          error: 'No hay credenciales biométricas guardadas',
        };
      }

      const userData = JSON.parse(userDataString);

      // Restaurar sesión en Preferences
      await storageService.setToken(token);
      await storageService.setUserData(userData);

      // Actualizar estado interno
      this.currentUser = userData;
      this.isAuthenticated = true;

      // Emitir evento de login
      eventBus.emit('auth:login', userData);

      console.log('✅ [AuthService] Login biométrico exitoso');
      return { success: true, user: userData };
    } catch (error) {
      console.error('❌ [AuthService] Error en login biométrico:', error);
      return {
        success: false,
        error: error.message || 'Error en autenticación biométrica',
      };
    }
  }

  /** Deshabilita autenticación biométrica y elimina credenciales */
  async disableBiometric() {
    console.log('🚫 [AuthService] Deshabilitando autenticación biométrica...');

    try {
      await SecureStorage.removeItem(BIOTOKEN_KEY);
      await SecureStorage.removeItem(BIOUSER_KEY);
      await SecureStorage.removeItem(BIOENABLED_KEY);

      console.log('✅ [AuthService] Autenticación biométrica deshabilitada');
      return { success: true };
    } catch (error) {
      console.error('❌ [AuthService] Error deshabilitando biometría:', error);
      return { success: false, error: error.message };
    }
  }
}

// Exportar instancia única
export const authService = new AuthService();
