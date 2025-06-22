// src/services/api.service.js
// Cliente HTTP configurado con axios, maneja tokens automáticamente

import axios from "axios";
import mitt from "mitt";
import { API_CONFIG, ERROR_MESSAGES } from "../utils/constants.js";
import { storageService } from "./storage.service.js";

// Event emitter para comunicación entre servicios
export const eventBus = mitt();

class ApiService {
  constructor() {
    this.client = null;
    this.isRefreshing = false;
    this.failedQueue = [];
    this.initializeClient();
  }

  initializeClient() {
    // Crear instancia de axios con configuración base
    this.client = axios.create({
      baseURL: API_CONFIG.BASE_URL,
      timeout: API_CONFIG.TIMEOUT,
      headers: {
        "Content-Type": "application/json",
      },
    });

    // Interceptor de request - agregar token a cada petición
    this.client.interceptors.request.use(
      async (config) => {
        // Obtener token del storage
        const token = await storageService.getToken();

        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }

        // Log para debugging (quitar en producción)
        console.log(
          `🚀 API Request: ${config.method?.toUpperCase()} ${config.url}`
        );

        return config;
      },
      (error) => {
        console.error("❌ Request error:", error);
        return Promise.reject(error);
      }
    );

    // Interceptor de response - manejar errores globalmente
    this.client.interceptors.response.use(
      (response) => {
        // Log para debugging
        console.log(`✅ API Response: ${response.config.url}`, response.data);
        return response;
      },
      async (error) => {
        const originalRequest = error.config;

        // Si no hay respuesta, es un error de red
        if (!error.response) {
          this.handleNetworkError();
          return Promise.reject(error);
        }

        // Si es 401 y no es el endpoint de login
        if (
          error.response.status === 401 &&
          !originalRequest.url.includes("/login")
        ) {
          return this.handle401Error(originalRequest);
        }

        // Para otros errores, simplemente rechazar
        console.error(
          `❌ API Error ${error.response.status}:`,
          error.response.data
        );
        return Promise.reject(error);
      }
    );
  }

  // Manejar error 401 (token expirado)
  async handle401Error(originalRequest) {
    // Si ya estamos refrescando el token, agregar a la cola
    if (this.isRefreshing) {
      return new Promise((resolve, reject) => {
        this.failedQueue.push({ resolve, reject });
      }).then(() => {
        return this.client(originalRequest);
      });
    }

    originalRequest._retry = true;
    this.isRefreshing = true;

    try {
      // Intentar refrescar el token
      const refreshToken = await storageService.get("refresh_token");

      if (!refreshToken) {
        throw new Error("No refresh token available");
      }

      const response = await this.client.post(
        API_CONFIG.ENDPOINTS.REFRESH_TOKEN,
        {
          refresh_token: refreshToken,
        }
      );

      const { access_token } = response.data;
      await storageService.setToken(access_token);

      // Procesar cola de peticiones fallidas
      this.processQueue(null);

      // Reintentar petición original
      return this.client(originalRequest);
    } catch (error) {
      // Si falla el refresh, cerrar sesión
      this.processQueue(error);
      await this.handleSessionExpired();
      return Promise.reject(error);
    } finally {
      this.isRefreshing = false;
    }
  }

  // Procesar cola de peticiones que esperaban el refresh
  processQueue(error) {
    this.failedQueue.forEach((promise) => {
      if (error) {
        promise.reject(error);
      } else {
        promise.resolve();
      }
    });
    this.failedQueue = [];
  }

  // Manejar error de red
  handleNetworkError() {
    console.error("❌ Error de red");
    eventBus.emit("network:error");

    if (window.mostrarMensajeEstado) {
      window.mostrarMensajeEstado(ERROR_MESSAGES.NETWORK_ERROR, 5000);
    }
  }

  // Manejar sesión expirada
  async handleSessionExpired() {
    console.log("🔒 Sesión expirada");

    // Limpiar datos de sesión
    await storageService.clear();

    // Emitir evento para que otros componentes reaccionen
    eventBus.emit("auth:logout");

    if (window.mostrarMensajeEstado) {
      window.mostrarMensajeEstado(ERROR_MESSAGES.SESSION_EXPIRED, 5000);
    }

    // Redirigir a login
    setTimeout(() => {
      window.location.hash = "#/login";
    }, 1000);
  }

  // Métodos públicos para hacer peticiones
  async get(endpoint, config = {}) {
    return this.client.get(endpoint, config);
  }

  async post(endpoint, data, config = {}) {
    return this.client.post(endpoint, data, config);
  }

  async put(endpoint, data, config = {}) {
    return this.client.put(endpoint, data, config);
  }

  async delete(endpoint, config = {}) {
    return this.client.delete(endpoint, config);
  }

  // Método para peticiones sin autenticación
  async publicRequest(method, endpoint, data = null, config = {}) {
    const requestConfig = {
      ...config,
      headers: {
        ...config.headers,
        Authorization: undefined, // Remover header de autorización
      },
    };

    switch (method.toLowerCase()) {
      case "get":
        return this.client.get(endpoint, requestConfig);
      case "post":
        return this.client.post(endpoint, data, requestConfig);
      default:
        throw new Error(`Método ${method} no soportado`);
    }
  }
}

// Exportar instancia única
export const apiService = new ApiService();
