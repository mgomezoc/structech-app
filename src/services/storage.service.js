// src/services/storage.service.js
// Maneja el almacenamiento seguro usando Capacitor Preferences
// En web usa localStorage como fallback, en móvil usa almacenamiento nativo seguro

import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { STORAGE_KEYS } from '../utils/constants.js';

class StorageService {
  constructor() {
    this.isNative = Capacitor.isNativePlatform();
    console.log(`💾 StorageService iniciado - Plataforma: ${this.isNative ? 'Nativa' : 'Web'}`);
  }

  // Método genérico para guardar datos
  async set(key, value) {
    try {
      console.log(`💾 Guardando: ${key}`);
      // Si el valor es un objeto, lo convertimos a string
      const stringValue = typeof value === 'object' ? JSON.stringify(value) : String(value);

      if (this.isNative) {
        await Preferences.set({ key, value: stringValue });
      } else {
        // Fallback para desarrollo web
        localStorage.setItem(key, stringValue);
      }
      return true;
    } catch (error) {
      console.error(`❌ Error al guardar ${key} en storage:`, error);
      return false;
    }
  }

  // Método genérico para obtener datos
  async get(key) {
    try {
      let value;

      if (this.isNative) {
        const result = await Preferences.get({ key });
        value = result.value;
      } else {
        value = localStorage.getItem(key);
      }

      // Intentar parsear como JSON si es posible
      if (value) {
        try {
          return JSON.parse(value);
        } catch {
          // Si no es JSON, devolver como string
          return value;
        }
      }
      return null;
    } catch (error) {
      console.error(`❌ Error al leer ${key} del storage:`, error);
      return null;
    }
  }

  // Método para eliminar datos
  async remove(key) {
    try {
      console.log(`🗑️ Eliminando: ${key}`);

      if (this.isNative) {
        await Preferences.remove({ key });
      } else {
        localStorage.removeItem(key);
      }
      return true;
    } catch (error) {
      console.error(`❌ Error al eliminar ${key} del storage:`, error);
      return false;
    }
  }

  // Método para limpiar todo el storage
  async clear() {
    try {
      console.log('🧹 Limpiando todo el storage');

      if (this.isNative) {
        await Preferences.clear();
      } else {
        localStorage.clear();
      }
      return true;
    } catch (error) {
      console.error('❌ Error al limpiar storage:', error);
      return false;
    }
  }

  // Obtener todas las claves (útil para debugging)
  async keys() {
    try {
      if (this.isNative) {
        const result = await Preferences.keys();
        return result.keys;
      } else {
        return Object.keys(localStorage);
      }
    } catch (error) {
      console.error('❌ Error al obtener claves del storage:', error);
      return [];
    }
  }

  // Métodos específicos para tokens
  async setToken(token) {
    return await this.set(STORAGE_KEYS.ACCESS_TOKEN, token);
  }

  async getToken() {
    return await this.get(STORAGE_KEYS.ACCESS_TOKEN);
  }

  async removeToken() {
    return await this.remove(STORAGE_KEYS.ACCESS_TOKEN);
  }

  // Métodos para datos de usuario
  async setUserData(userData) {
    return await this.set(STORAGE_KEYS.USER_DATA, userData);
  }

  async getUserData() {
    return await this.get(STORAGE_KEYS.USER_DATA);
  }

  async removeUserData() {
    return await this.remove(STORAGE_KEYS.USER_DATA);
  }

  // Métodos para expiración de token
  async setTokenExpiry(expiry) {
    return await this.set(STORAGE_KEYS.TOKEN_EXPIRY, expiry);
  }

  async getTokenExpiry() {
    return await this.get(STORAGE_KEYS.TOKEN_EXPIRY);
  }

  async removeTokenExpiry() {
    return await this.remove(STORAGE_KEYS.TOKEN_EXPIRY);
  }

  // Método para verificar si hay sesión activa
  async hasValidSession() {
    const token = await this.getToken();
    const userData = await this.getUserData();

    if (!token || !userData) {
      console.log('❌ No hay token o userData');
      return false;
    }

    // Verificar expiración si existe
    const expiry = await this.getTokenExpiry();
    if (expiry) {
      const now = Date.now();
      const expiryTime = parseInt(expiry);

      if (now >= expiryTime) {
        console.log('❌ Token expirado');
        // Limpiar token expirado automáticamente
        await this.removeToken();
        await this.removeTokenExpiry();
        return false;
      }
    }

    console.log('✅ Sesión válida');
    return true;
  }

  // Método para limpiar solo datos de sesión (preservar configuraciones)
  async clearSession() {
    console.log('🔐 Limpiando datos de sesión');
    await this.removeToken();
    await this.removeUserData();
    await this.removeTokenExpiry();
    return true;
  }

  // Método para verificar si hay configuración biométrica
  async hasBiometricConfig() {
    try {
      // Este método verifica si hay datos en SecureStorage sin acceder a ellos
      // Lo usamos para saber si mostrar el botón biométrico
      const enabled = await this.get(STORAGE_KEYS.BIOMETRIC_ENABLED);
      return enabled === true || enabled === 'true';
    } catch (error) {
      console.error('❌ Error verificando configuración biométrica:', error);
      return false;
    }
  }

  // Método para debugging - mostrar contenido del storage
  async debugStorage() {
    const keys = await this.keys();
    console.log('🔍 Contenido del storage:');

    for (const key of keys) {
      const value = await this.get(key);
      // No mostrar tokens completos por seguridad
      if (key.includes('token')) {
        console.log(`  ${key}: ${value ? '[TOKEN_PRESENTE]' : 'null'}`);
      } else {
        console.log(`  ${key}:`, value);
      }
    }
  }
}

// Exportar una instancia única (Singleton)
export const storageService = new StorageService();
