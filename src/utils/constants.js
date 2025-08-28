// src/utils/constants.js
// Centraliza todas las constantes de la aplicación para fácil mantenimiento

export const API_CONFIG = {
  // ⚠️ Si vas a probar en local, cambia esta BASE_URL por: 'http://localhost:7221'
  BASE_URL: 'https://apiusuario-dxa0bxftewgxc8a7.mexicocentral-01.azurewebsites.net',
  ENDPOINTS: {
    LOGIN: '/api/auth/login',
    CONSULTA: '/api/datos/consulta',
    LOGOUT: '/api/auth/logout',
    ENROLLMENT: '/api/enrollment/ine',
    ENROLLMENT_MANUAL: '/api/enrollment/manual',
    NEIGHBORHOODS: '/api/combos/Neighborhoods', // + /{postalCode}
    CATALOGS: '/api/combos/Catalogs',
    SUBCATALOGS: '/api/combos/SubCatalogs', // + /{catalogId}
    CITIZENS: '/api/combos/Citizens',
    TICKET_TYPES: '/api/combos/Ticket_Types',
    CLASSIFICATIONS: '/api/combos/Classifications', // + /{typeId}
    QUESTIONS: '/api/combos/Questions',
    CREATE_TICKET: '/api/ticket/ticket',
    SURVEY_HEADERS: '/api/survey/Headers',
    SURVEY_QUESTIONS: '/api/survey/Questions',
    SURVEY_QUESTION_ANSWERS: '/api/survey/QuestionAnswers',

    // 👇 Nuevo endpoint real para guardar respuestas
    SURVEY_ANSWER: '/api/survey/Answer',

    // (Dejamos el antiguo por compatibilidad si en algún lado se usa)
    SURVEY_SUBMIT: '/api/survey/Submit',
  },
  TIMEOUT: 30000, // 30 segundos
};

export const STORAGE_KEYS = {
  ACCESS_TOKEN: 'access_token',
  USER_DATA: 'user_data',
  TOKEN_EXPIRY: 'token_expiry',
  BIOMETRIC_ENABLED: 'biometric_enabled',
  FORM_DATA: 'form_data', // Para datos temporales de formularios
};

export const ROUTES = {
  LOGIN: '/login',
  DASHBOARD: '/dashboard',
  HOME: '/',
  FORM: '/form',
  ENROLLMENT_MANUAL: '/enrollment-manual',
  ADMIN: '/admin',
  ALTA_GESTION: '/alta-gestion',
  SURVEYS: '/surveys',
  SURVEY_DETAIL: '/surveys/:id',
};

export const ERROR_MESSAGES = {
  NETWORK_ERROR: 'Error de conexión. Por favor verifica tu internet.',
  INVALID_CREDENTIALS: 'Credenciales inválidas',
  SESSION_EXPIRED: 'Tu sesión ha expirado. Por favor inicia sesión nuevamente.',
  GENERIC_ERROR: 'Ha ocurrido un error. Por favor intenta de nuevo.',
  UNAUTHORIZED: 'No tienes permisos para realizar esta acción.',
  LOCATION_REQUIRED: 'Se requiere acceso a la ubicación para continuar.',
};

export const APP_CONFIG = {
  NAME: 'StructechApp',
  VERSION: '1.0.0',
  DEFAULT_TIMEOUT: 10000,
  MAX_RETRY_ATTEMPTS: 3,
};
