// src/services/api.service.js
// Cliente HTTP configurado con axios, maneja tokens automáticamente

import axios from 'axios';
import mitt from 'mitt';
import { API_CONFIG, ERROR_MESSAGES } from '../utils/constants.js';
import { storageService } from './storage.service.js';

// Event emitter para comunicación entre servicios
export const eventBus = mitt();

class ApiService {
  constructor() {
    this.client = null;
    this.initializeClient();
  }

  initializeClient() {
    // Crear instancia de axios con configuración base
    this.client = axios.create({
      baseURL: API_CONFIG.BASE_URL,
      timeout: API_CONFIG.TIMEOUT,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Interceptor de request - agregar token a cada petición
    this.client.interceptors.request.use(
      async config => {
        // Obtener token del storage
        const token = await storageService.getToken();

        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }

        // Log para debugging (quitar en producción)
        console.log(`🚀 API Request: ${config.method?.toUpperCase()} ${config.url}`);

        return config;
      },
      error => {
        console.error('❌ Request error:', error);
        return Promise.reject(error);
      },
    );

    // Interceptor de response - manejar errores globalmente
    this.client.interceptors.response.use(
      response => {
        // Log para debugging
        console.log(`✅ API Response: ${response.config.url}`, response.data);
        return response;
      },
      async error => {
        const originalRequest = error.config;

        // Si no hay respuesta, es un error de red
        if (!error.response) {
          this.handleNetworkError();
          return Promise.reject(error);
        }

        // Si es 401 y no es el endpoint de login, cerrar sesión
        if (error.response.status === 401 && !originalRequest.url.includes('/login')) {
          await this.handleSessionExpired();
          return Promise.reject(error);
        }

        // Para otros errores, simplemente rechazar
        console.error(`❌ API Error ${error.response.status}:`, error.response.data);
        return Promise.reject(error);
      },
    );
  }

  // Manejar error de red
  handleNetworkError() {
    console.error('❌ Error de red');
    eventBus.emit('network:error');

    if (window.mostrarMensajeEstado) {
      window.mostrarMensajeEstado(ERROR_MESSAGES.NETWORK_ERROR, 5000);
    }
  }

  // Manejar sesión expirada o token inválido
  async handleSessionExpired() {
    console.log('🔒 Token inválido o sesión expirada');

    // Limpiar datos de sesión
    await storageService.clear();

    // Emitir evento para que otros componentes reaccionen
    eventBus.emit('auth:logout');

    if (window.mostrarMensajeEstado) {
      window.mostrarMensajeEstado(ERROR_MESSAGES.SESSION_EXPIRED, 5000);
    }

    // Redirigir a login después de un breve delay
    setTimeout(() => {
      window.location.hash = '#/login';
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

  async patch(endpoint, data, config = {}) {
    return this.client.patch(endpoint, data, config);
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
      case 'get':
        return this.client.get(endpoint, requestConfig);
      case 'post':
        return this.client.post(endpoint, data, requestConfig);
      case 'put':
        return this.client.put(endpoint, data, requestConfig);
      case 'delete':
        return this.client.delete(endpoint, requestConfig);
      default:
        throw new Error(`Método ${method} no soportado`);
    }
  }

  // Helper para manejar respuestas de API de forma consistente
  handleApiResponse(response) {
    if (response.data && response.data.success !== undefined) {
      return response.data;
    }
    return { success: true, data: response.data };
  }

  // Helper para manejar errores de API de forma consistente
  handleApiError(error) {
    if (error.response && error.response.data) {
      const errorData = error.response.data;
      return {
        success: false,
        error: errorData.message || errorData.error || ERROR_MESSAGES.GENERIC_ERROR,
        status: error.response.status,
      };
    }

    return {
      success: false,
      error: error.message || ERROR_MESSAGES.GENERIC_ERROR,
      status: null,
    };
  }
}

// Exportar instancia única
export const apiService = new ApiService();
