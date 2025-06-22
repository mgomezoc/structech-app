// src/services/storage.service.js
// Maneja el almacenamiento seguro usando Capacitor Preferences
// En web usa localStorage como fallback, en móvil usa almacenamiento nativo seguro

import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";
import { STORAGE_KEYS } from "../utils/constants.js";

class StorageService {
  constructor() {
    this.isNative = Capacitor.isNativePlatform();
  }

  // Método genérico para guardar datos
  async set(key, value) {
    try {
      // Si el valor es un objeto, lo convertimos a string
      const stringValue =
        typeof value === "object" ? JSON.stringify(value) : String(value);

      if (this.isNative) {
        await Preferences.set({ key, value: stringValue });
      } else {
        // Fallback para desarrollo web
        localStorage.setItem(key, stringValue);
      }
      return true;
    } catch (error) {
      console.error("Error al guardar en storage:", error);
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
      console.error("Error al leer del storage:", error);
      return null;
    }
  }

  // Método para eliminar datos
  async remove(key) {
    try {
      if (this.isNative) {
        await Preferences.remove({ key });
      } else {
        localStorage.removeItem(key);
      }
      return true;
    } catch (error) {
      console.error("Error al eliminar del storage:", error);
      return false;
    }
  }

  // Método para limpiar todo el storage
  async clear() {
    try {
      if (this.isNative) {
        await Preferences.clear();
      } else {
        localStorage.clear();
      }
      return true;
    } catch (error) {
      console.error("Error al limpiar storage:", error);
      return false;
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

  // Método para verificar si hay sesión activa
  async hasValidSession() {
    const token = await this.getToken();
    const expiry = await this.get(STORAGE_KEYS.TOKEN_EXPIRY);

    if (!token) return false;

    // Si hay fecha de expiración, verificar que no haya pasado
    if (expiry) {
      const now = Date.now();
      const expiryTime = parseInt(expiry);
      return now < expiryTime;
    }

    // Si no hay fecha de expiración, asumimos que el token es válido
    return true;
  }
}

// Exportar una instancia única (Singleton)
export const storageService = new StorageService();
