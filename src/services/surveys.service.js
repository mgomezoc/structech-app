// src/services/surveys.service.js
// CORREGIDO: Agregar soporte para tipo 2 y validaciones mejoradas + submitAnswers()

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
  ANSWER: '/api/survey/Answer', // 👈 Nuevo
};

class SurveysService {
  constructor() {
    this.abortControllers = new Map();
  }

  /**
   * Enviar respuestas de la encuesta
   * @param {object} payload - { surveyId: number, answers: [...] }
   * @returns {Promise<{success: boolean, data?: any, error?: string}>}
   */
  async submitAnswers(payload) {
    try {
      console.log('📤 [SurveysService] Enviando respuestas:', payload);
      await hapticsService.medium();

      const body = { Data: JSON.stringify(payload) };
      const response = await apiService.post(ENDPOINTS.ANSWER, body);

      console.log('✅ [SurveysService] Respuestas enviadas OK');
      await hapticsService.success();

      return { success: true, data: response.data };
    } catch (error) {
      console.error('❌ [SurveysService] Error enviando respuestas:', error);
      await hapticsService.error();

      return {
        success: false,
        error: this._getErrorMessage(error),
      };
    }
  }

  /**
   * Obtener lista de encuestas (headers)
   */
  async getSurveyHeaders() {
    console.log('📋 [SurveysService] Obteniendo encuestas...');

    try {
      const cached = surveysCache.get('headers');
      if (cached && Date.now() - cached.timestamp < 5 * 60 * 1000) {
        console.log('⚡ [SurveysService] Usando cache para headers');
        return { success: true, data: cached.data };
      }

      await hapticsService.light();

      const response = await apiService.get(ENDPOINTS.HEADERS);
      const surveys = response.data || [];

      const processedSurveys = surveys.map(survey => ({
        ...survey,
        vcSurvey: survey.vcSurvey || 'Encuesta sin título',
        vcProgram: survey.vcProgram || 'Sin programa',
        vcNames: survey.vcNames || 'Sin autor',
        vcInstructions: survey.vcInstructions || '',
        expirationStatus: this._calculateExpirationStatus(survey.dtExpiration),
        createdDate: this._formatDate(survey.dtCreated),
        expirationDate: survey.dtExpiration ? this._formatDate(survey.dtExpiration) : null,
        isExpired: this._isExpired(survey.dtExpiration),
        questionsLabel: `${survey.iRandQuestions || 'Todas'} preguntas`,
        timeLabel: survey.iTimer > 0 ? `${survey.iTimer} min` : 'Sin límite',
      }));

      surveysCache.set('headers', { data: processedSurveys, timestamp: Date.now() });
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
   */
  async getSurveyQuestions(surveyId, randomize = false, maxQuestions = 0) {
    console.log(`📝 [SurveysService] Obteniendo preguntas para encuesta ${surveyId}`);

    try {
      const prevController = this.abortControllers.get(`questions-${surveyId}`);
      if (prevController) prevController.abort();

      const controller = new AbortController();
      this.abortControllers.set(`questions-${surveyId}`, controller);

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

      questionsCache.set(cacheKey, { data: questions, timestamp: Date.now() });

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
   */
  async getQuestionAnswers(questionId) {
    console.log(`🎯 [SurveysService] Obteniendo respuestas para pregunta ${questionId}`);

    try {
      const cacheKey = `answers-${questionId}`;
      const cached = answersCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < 15 * 60 * 1000) {
        console.log('⚡ [SurveysService] Usando cache para respuestas');
        return { success: true, data: cached.data };
      }

      const response = await apiService.get(`${ENDPOINTS.QUESTION_ANSWERS}/${questionId}`);
      const answers = response.data || [];

      const cleanAnswers = answers.map(answer => ({
        ...answer,
        vcAnswer: answer.vcAnswer || 'Opción sin texto',
        bText: Boolean(answer.bText),
      }));

      answersCache.set(cacheKey, { data: cleanAnswers, timestamp: Date.now() });

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

    if (randomize && maxQuestions > 0 && maxQuestions < questions.length) {
      processedQuestions = this._shuffleArray([...questions]).slice(0, maxQuestions);
      console.log(
        `🎲 [SurveysService] Aleatorizadas ${maxQuestions} de ${questions.length} preguntas`,
      );
    }

    processedQuestions = processedQuestions.map(q => {
      const clean = {
        ...q,
        vcQuestion: q.vcQuestion || 'Pregunta sin texto',
        vcType: q.vcType || this._getTypeLabel(q.iTypeId),
        iMin: q.iMin || 0,
        iMax: q.iMax || 0,
      };

      return {
        ...clean,
        isOption: clean.iTypeId === 1 || clean.iTypeId === 2,
        isText: clean.iTypeId === 3,
        isNumeric: clean.iTypeId === 4,
        hasRange: clean.iTypeId === 4 && clean.iMin !== undefined && clean.iMax !== undefined,
        needsAnswers: clean.iTypeId === 1 || clean.iTypeId === 2,
      };
    });

    return { success: true, data: processedQuestions };
  }

  _getTypeLabel(typeId) {
    const typeLabels = {
      1: 'Opción única',
      2: 'Opción múltiple',
      3: 'Texto libre',
      4: 'Numérico (rango)',
    };
    return typeLabels[typeId] || `Tipo ${typeId}`;
  }

  clearCache() {
    console.log('🧹 [SurveysService] Limpiando cache');
    surveysCache.clear();
    questionsCache.clear();
    answersCache.clear();
  }

  cancelAllRequests() {
    console.log('🚫 [SurveysService] Cancelando todas las peticiones');
    this.abortControllers.forEach(c => c.abort());
    this.abortControllers.clear();
  }

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

  _isExpired(expirationDate) {
    if (!expirationDate) return false;
    return new Date(expirationDate) < new Date();
  }

  _formatDate(isoString) {
    if (!isoString) return null;
    return new Date(isoString).toLocaleDateString('es-MX', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  }

  _shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i++) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }

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
    if (error.code === 'NETWORK_ERROR') return 'Sin conexión a internet. Verifica tu conectividad.';
    return 'Error inesperado. Intenta nuevamente.';
  }
}

// Exportar instancia única (singleton)
export const surveysService = new SurveysService();
