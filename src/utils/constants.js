// src/utils/constants.js
// Centraliza todas las constantes de la aplicación para fácil mantenimiento

export const API_CONFIG = {
  BASE_URL:
    "https://apiusuario-dxa0bxftewgxc8a7.mexicocentral-01.azurewebsites.net",
  ENDPOINTS: {
    LOGIN: "/api/auth/login",
    CONSULTA: "/api/datos/consulta",
    REFRESH_TOKEN: "/api/auth/refresh",
    LOGOUT: "/api/auth/logout",
    ENROLLMENT: "/api/enrollment/ine",
    ENROLLMENT_MANUAL: "/api/enrollment/manual",
    NEIGHBORHOODS: "/api/combos/Neighborhoods", // + /{postalCode}
    CATALOGS: "/api/combos/Catalogs",
    SUBCATALOGS: "/api/combos/SubCatalogs", // + /{catalogId}
  },
  TIMEOUT: 30000, // 30 segundos
};

export const STORAGE_KEYS = {
  ACCESS_TOKEN: "access_token",
  REFRESH_TOKEN: "refresh_token",
  USER_DATA: "user_data",
  TOKEN_EXPIRY: "token_expiry",
};

export const ROUTES = {
  LOGIN: "/login",
  DASHBOARD: "/dashboard",
  HOME: "/",
  FORM: "/form",
  ENROLLMENT_MANUAL: "/enrollment-manual",
};

export const ERROR_MESSAGES = {
  NETWORK_ERROR: "Error de conexión. Por favor verifica tu internet.",
  INVALID_CREDENTIALS: "Credenciales inválidas",
  SESSION_EXPIRED: "Tu sesión ha expirado. Por favor inicia sesión nuevamente.",
  GENERIC_ERROR: "Ha ocurrido un error. Por favor intenta de nuevo.",
};
