// src/services/surveys.service.js
// CORREGIDO: Agregar soporte para tipo 2 y validaciones mejoradas

import { apiService } from './api.service.js';
import { hapticsService } from './haptics.service.js';

// Cache para mejorar performance
const surveysCache = new Map();
const questionsCache = new Map();
const answersCache = new Map();

// Configuración de endpoints
const ENDPOINTS = {
  HEADERS: '/api/survey/Headers',
  QUESTIONS: '/api/survey/Questions',
  QUESTION_ANSWERS: '/api/survey/QuestionAnswers',
  // SUBMIT: '/api/survey/Submit' // Para implementar después
};

class SurveysService {
  constructor() {
    this.abortControllers = new Map();
  }

  /**
   * Obtener lista de encuestas (headers)
   * @returns {Promise<{success: boolean, data: Array, error?: string}>}
   */
  async getSurveyHeaders() {
    console.log('📋 [SurveysService] Obteniendo encuestas...');

    try {
      // Verificar cache (válido por 5 minutos)
      const cached = surveysCache.get('headers');
      if (cached && Date.now() - cached.timestamp < 5 * 60 * 1000) {
        console.log('⚡ [SurveysService] Usando cache para headers');
        return { success: true, data: cached.data };
      }

      await hapticsService.light();

      const response = await apiService.get(ENDPOINTS.HEADERS);
      const surveys = response.data || [];

      // Procesar y enriquecer datos con validaciones mejoradas
      const processedSurveys = surveys.map(survey => ({
        ...survey,
        // CORREGIDO: Validaciones para evitar null/undefined
        vcSurvey: survey.vcSurvey || 'Encuesta sin título',
        vcProgram: survey.vcProgram || 'Sin programa',
        vcNames: survey.vcNames || 'Sin autor',
        vcInstructions: survey.vcInstructions || '',

        // Calcular estado de expiración
        expirationStatus: this._calculateExpirationStatus(survey.dtExpiration),
        // Formatear fechas
        createdDate: this._formatDate(survey.dtCreated),
        expirationDate: survey.dtExpiration ? this._formatDate(survey.dtExpiration) : null,
        // Metadatos útiles con validaciones
        isExpired: this._isExpired(survey.dtExpiration),
        questionsLabel: `${survey.iRandQuestions || 'Todas'} preguntas`,
        timeLabel: survey.iTimer > 0 ? `${survey.iTimer} min` : 'Sin límite',
      }));

      // Guardar en cache
      surveysCache.set('headers', {
        data: processedSurveys,
        timestamp: Date.now(),
      });

      console.log('✅ [SurveysService] Encuestas obtenidas:', processedSurveys.length);
      return { success: true, data: processedSurveys };
    } catch (error) {
      console.error('❌ [SurveysService] Error obteniendo encuestas:', error);
      await hapticsService.error();

      return {
        success: false,
        error: this._getErrorMessage(error),
        data: [],
      };
    }
  }

  /**
   * Obtener preguntas de una encuesta específica
   * @param {number} surveyId - ID de la encuesta
   * @param {boolean} randomize - Si aplicar iRandQuestions
   * @param {number} maxQuestions - Número máximo de preguntas (iRandQuestions)
   * @returns {Promise<{success: boolean, data: Array, error?: string}>}
   */
  async getSurveyQuestions(surveyId, randomize = false, maxQuestions = 0) {
    console.log(`📝 [SurveysService] Obteniendo preguntas para encuesta ${surveyId}`);

    try {
      // Cancelar request anterior si existe
      const prevController = this.abortControllers.get(`questions-${surveyId}`);
      if (prevController) {
        prevController.abort();
      }

      // Crear nuevo controller
      const controller = new AbortController();
      this.abortControllers.set(`questions-${surveyId}`, controller);

      // Verificar cache
      const cacheKey = `questions-${surveyId}`;
      const cached = questionsCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < 10 * 60 * 1000) {
        console.log('⚡ [SurveysService] Usando cache para preguntas');
        return this._processQuestions(cached.data, randomize, maxQuestions);
      }

      await hapticsService.light();

      const response = await apiService.get(`${ENDPOINTS.QUESTIONS}/${surveyId}`, {
        signal: controller.signal,
      });

      if (controller.signal.aborted) {
        console.log('🚫 [SurveysService] Request cancelado');
        return { success: false, error: 'Cancelado', data: [] };
      }

      const questions = response.data || [];

      // Guardar en cache
      questionsCache.set(cacheKey, {
        data: questions,
        timestamp: Date.now(),
      });

      console.log('✅ [SurveysService] Preguntas obtenidas:', questions.length);
      return this._processQuestions(questions, randomize, maxQuestions);
    } catch (error) {
      if (error.name === 'AbortError') {
        return { success: false, error: 'Cancelado', data: [] };
      }

      console.error('❌ [SurveysService] Error obteniendo preguntas:', error);
      await hapticsService.error();

      return {
        success: false,
        error: this._getErrorMessage(error),
        data: [],
      };
    } finally {
      this.abortControllers.delete(`questions-${surveyId}`);
    }
  }

  /**
   * Obtener respuestas predefinidas para una pregunta (tipos 1 y 2)
   * @param {number} questionId - ID de la pregunta
   * @returns {Promise<{success: boolean, data: Array, error?: string}>}
   */
  async getQuestionAnswers(questionId) {
    console.log(`🎯 [SurveysService] Obteniendo respuestas para pregunta ${questionId}`);

    try {
      // Verificar cache
      const cacheKey = `answers-${questionId}`;
      const cached = answersCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < 15 * 60 * 1000) {
        console.log('⚡ [SurveysService] Usando cache para respuestas');
        return { success: true, data: cached.data };
      }

      const response = await apiService.get(`${ENDPOINTS.QUESTION_ANSWERS}/${questionId}`);

      const answers = response.data || [];

      // CORREGIDO: Validar y limpiar respuestas
      const cleanAnswers = answers.map(answer => ({
        ...answer,
        vcAnswer: answer.vcAnswer || 'Opción sin texto',
        bText: Boolean(answer.bText), // Asegurar que sea boolean
      }));

      // Guardar en cache
      answersCache.set(cacheKey, {
        data: cleanAnswers,
        timestamp: Date.now(),
      });

      console.log('✅ [SurveysService] Respuestas obtenidas:', cleanAnswers.length);
      return { success: true, data: cleanAnswers };
    } catch (error) {
      console.error('❌ [SurveysService] Error obteniendo respuestas:', error);

      return {
        success: false,
        error: this._getErrorMessage(error),
        data: [],
      };
    }
  }

  /**
   * Procesar preguntas aplicando aleatorización si es necesaria
   * @private
   */
  _processQuestions(questions, randomize, maxQuestions) {
    let processedQuestions = [...questions];

    // Aplicar aleatorización si está configurada
    if (randomize && maxQuestions > 0 && maxQuestions < questions.length) {
      processedQuestions = this._shuffleArray([...questions]).slice(0, maxQuestions);
      console.log(
        `🎲 [SurveysService] Aleatorizadas ${maxQuestions} de ${questions.length} preguntas`,
      );
    }

    // CORREGIDO: Enriquecer preguntas con metadatos útiles y soporte para tipo 2
    processedQuestions = processedQuestions.map(question => {
      // Validaciones para evitar null/undefined
      const cleanQuestion = {
        ...question,
        vcQuestion: question.vcQuestion || 'Pregunta sin texto',
        vcType: question.vcType || this._getTypeLabel(question.iTypeId),
        iMin: question.iMin || 0,
        iMax: question.iMax || 0,
      };

      return {
        ...cleanQuestion,
        // CORREGIDO: Agregar tipo 2 como opción también
        isOption: cleanQuestion.iTypeId === 1 || cleanQuestion.iTypeId === 2,
        isText: cleanQuestion.iTypeId === 3,
        isNumeric: cleanQuestion.iTypeId === 4,
        hasRange:
          cleanQuestion.iTypeId === 4 &&
          cleanQuestion.iMin !== undefined &&
          cleanQuestion.iMax !== undefined,
        // CORREGIDO: Tipos 1 y 2 necesitan respuestas predefinidas
        needsAnswers: cleanQuestion.iTypeId === 1 || cleanQuestion.iTypeId === 2,
      };
    });

    return { success: true, data: processedQuestions };
  }

  /**
   * Obtener etiqueta del tipo de pregunta
   * @private
   */
  _getTypeLabel(typeId) {
    const typeLabels = {
      1: 'Opción única',
      2: 'Opción múltiple', // CORREGIDO: Agregar tipo 2
      3: 'Texto libre',
      4: 'Numérico (rango)',
    };
    return typeLabels[typeId] || `Tipo ${typeId}`;
  }

  /**
   * Limpiar caches (útil al cerrar sesión)
   */
  clearCache() {
    console.log('🧹 [SurveysService] Limpiando cache');
    surveysCache.clear();
    questionsCache.clear();
    answersCache.clear();
  }

  /**
   * Cancelar todas las peticiones pendientes
   */
  cancelAllRequests() {
    console.log('🚫 [SurveysService] Cancelando todas las peticiones');
    this.abortControllers.forEach(controller => controller.abort());
    this.abortControllers.clear();
  }

  // ===================
  // MÉTODOS UTILITARIOS (sin cambios)
  // ===================

  /**
   * Calcular estado de expiración
   * @private
   */
  _calculateExpirationStatus(expirationDate) {
    if (!expirationDate) return 'Sin límite';

    const now = new Date();
    const expiry = new Date(expirationDate);
    const diffTime = expiry - now;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffTime < 0) return 'Expirada';
    if (diffDays <= 1) return 'Expira hoy';
    if (diffDays <= 7) return `Expira en ${diffDays} días`;
    return 'Activa';
  }

  /**
   * Verificar si una encuesta está expirada
   * @private
   */
  _isExpired(expirationDate) {
    if (!expirationDate) return false;
    return new Date(expirationDate) < new Date();
  }

  /**
   * Formatear fecha para mostrar
   * @private
   */
  _formatDate(isoString) {
    if (!isoString) return null;

    return new Date(isoString).toLocaleDateString('es-MX', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  }

  /**
   * Barajar array (Fisher-Yates shuffle)
   * @private
   */
  _shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }

  /**
   * Obtener mensaje de error user-friendly
   * @private
   */
  _getErrorMessage(error) {
    if (error.response) {
      switch (error.response.status) {
        case 401:
          return 'Sesión expirada. Por favor, inicia sesión nuevamente.';
        case 403:
          return 'No tienes permisos para acceder a estas encuestas.';
        case 404:
          return 'Encuesta no encontrada.';
        case 500:
          return 'Error del servidor. Intenta nuevamente.';
        default:
          return error.response.data?.message || 'Error desconocido.';
      }
    }

    if (error.code === 'NETWORK_ERROR') {
      return 'Sin conexión a internet. Verifica tu conectividad.';
    }

    return 'Error inesperado. Intenta nuevamente.';
  }
}

// Exportar instancia única (singleton)
export const surveysService = new SurveysService();
