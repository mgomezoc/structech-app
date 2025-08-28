// src/views/surveys/index.js
// Vista principal de encuestas - Lista y navegación

import Handlebars from 'handlebars';
import { navigateTo } from '../../routes/index.js';
import { authService } from '../../services/auth.service.js';
import { hapticsService } from '../../services/haptics.service.js';
import { surveysService } from '../../services/surveys.service.js';
import { ROUTES } from '../../utils/constants.js';
import { $, dom } from '../../utils/dom.helper.js';
import './style.less';
import tplSource from './template.hbs?raw';

const template = Handlebars.compile(tplSource);

export default class SurveysView {
  constructor(context = {}) {
    this.context = context;
    this.user = authService.getCurrentUser();
    this.surveys = [];
    this.isLoading = true;
    this.error = null;
    this.abortController = new AbortController();
  }

  /**
   * Render inicial - Retorna HTML inmediatamente con skeleton
   */
  render() {
    return template({
      user: {
        name: this.user?.name || 'Usuario',
      },
      loading: this.isLoading,
      surveys: [], // Inicialmente vacío
      backIcon: this._getBackIcon(),
      refreshIcon: this._getRefreshIcon(),
      clockIcon: this._getClockIcon(),
      questionsIcon: this._getQuestionsIcon(),
      rightArrowIcon: this._getRightArrowIcon(),
    });
  }

  /**
   * After render - Configuración y carga de datos
   */
  async afterRender() {
    console.log('📋 [SurveysView] Inicializando vista de encuestas');

    try {
      // 1. Setup DOM y eventos básicos
      this._setupDOMReferences();
      this._attachEventListeners();

      // 2. Cargar encuestas con feedback inmediato
      await this._loadSurveys();
    } catch (error) {
      console.error('❌ [SurveysView] Error en afterRender:', error);
      this._showError('Error cargando la vista de encuestas');
    }
  }

  /**
   * Cleanup al salir de la vista
   */
  cleanup() {
    console.log('🧹 [SurveysView] Limpiando vista');

    // Cancelar peticiones pendientes
    if (this.abortController) {
      this.abortController.abort();
    }

    // Limpiar referencias DOM
    this._clearDOMReferences();
  }

  // =====================
  // MÉTODOS PRINCIPALES
  // =====================

  /**
   * Cargar encuestas del servidor
   * @private
   */
  async _loadSurveys() {
    console.log('📡 [SurveysView] Cargando encuestas...');

    try {
      this.isLoading = true;
      this._updateLoadingState(true);

      // Cargar encuestas
      const result = await surveysService.getSurveyHeaders();

      if (this.abortController.signal.aborted) return;

      if (result.success) {
        this.surveys = result.data || [];
        this.error = null;

        console.log('✅ [SurveysView] Encuestas cargadas:', this.surveys.length);
        await hapticsService.light();

        // Actualizar UI
        this._renderSurveysList();
      } else {
        throw new Error(result.error || 'Error desconocido');
      }
    } catch (error) {
      console.error('❌ [SurveysView] Error cargando encuestas:', error);

      this.error = error.message || 'Error cargando encuestas';
      this.surveys = [];

      await hapticsService.error();
      this._showError(this.error);
    } finally {
      this.isLoading = false;
      this._updateLoadingState(false);
    }
  }

  /**
   * Renderizar lista de encuestas
   * @private
   */
  _renderSurveysList() {
    const container = $('#surveysContainer');
    if (!container) return;

    if (this.surveys.length === 0) {
      // Estado vacío
      container.innerHTML = this._getEmptyStateHTML();
      return;
    }

    // Renderizar encuestas
    const surveysHTML = this.surveys.map(survey => this._getSurveyCardHTML(survey)).join('');

    container.innerHTML = `
      <div class="surveys-grid">
        ${surveysHTML}
      </div>
    `;

    // Adjuntar eventos a las tarjetas
    this._attachSurveyCardEvents();
  }

  /**
   * Adjuntar eventos a las tarjetas de encuestas
   * @private
   */
  _attachSurveyCardEvents() {
    const surveyCards = document.querySelectorAll('.survey-card[data-survey-id]');

    surveyCards.forEach(card => {
      card.addEventListener('click', async e => {
        e.preventDefault();

        const surveyId = parseInt(card.dataset.surveyId);
        const isExpired = card.classList.contains('expired');

        if (isExpired) {
          await hapticsService.warning();
          window.mostrarMensajeEstado?.('Esta encuesta ha expirado', 'warning', 3000);
          return;
        }

        await this._handleSurveyClick(surveyId);
      });
    });
  }

  /**
   * Manejar click en encuesta
   * @private
   */
  async _handleSurveyClick(surveyId) {
    console.log('🎯 [SurveysView] Iniciando encuesta:', surveyId);

    try {
      await hapticsService.medium();

      // Navegar a la vista de encuesta específica
      navigateTo(`/surveys/${surveyId}`);
    } catch (error) {
      console.error('❌ [SurveysView] Error al abrir encuesta:', error);
      await hapticsService.error();
    }
  }

  /**
   * Refrescar encuestas
   * @private
   */
  async _handleRefresh() {
    console.log('🔄 [SurveysView] Refrescando encuestas');

    await hapticsService.light();

    // Limpiar cache antes de recargar
    surveysService.clearCache();

    // Recargar
    await this._loadSurveys();
  }

  // ==================
  // MÉTODOS DE SETUP
  // ==================

  /**
   * Configurar referencias DOM
   * @private
   */
  _setupDOMReferences() {
    this.backBtn = $('#backBtn');
    this.refreshBtn = $('#refreshBtn');
    this.surveysContainer = $('#surveysContainer');
    this.loadingIndicator = $('#surveysLoading');
    this.errorContainer = $('#surveysError');
  }

  /**
   * Limpiar referencias DOM
   * @private
   */
  _clearDOMReferences() {
    this.backBtn = null;
    this.refreshBtn = null;
    this.surveysContainer = null;
    this.loadingIndicator = null;
    this.errorContainer = null;
  }

  /**
   * Adjuntar event listeners
   * @private
   */
  _attachEventListeners() {
    // Botón regresar
    if (this.backBtn) {
      this.backBtn.addEventListener('click', async e => {
        e.preventDefault();
        await hapticsService.light();
        navigateTo(ROUTES.DASHBOARD);
      });
    }

    // Botón refrescar
    if (this.refreshBtn) {
      this.refreshBtn.addEventListener('click', e => {
        e.preventDefault();
        this._handleRefresh();
      });
    }
  }

  // =================
  // MÉTODOS DE UI
  // =================

  /**
   * Actualizar estado de carga
   * @private
   */
  _updateLoadingState(isLoading) {
    if (this.loadingIndicator) {
      this.loadingIndicator.style.display = isLoading ? 'block' : 'none';
    }

    if (this.refreshBtn) {
      this.refreshBtn.disabled = isLoading;
      dom(this.refreshBtn)[isLoading ? 'addClass' : 'removeClass']('loading');
    }
  }

  /**
   * Mostrar error
   * @private
   */
  _showError(message) {
    if (this.errorContainer) {
      this.errorContainer.innerHTML = `
        <div class="error-message">
          <div class="error-icon">⚠️</div>
          <div class="error-content">
            <h3>Error</h3>
            <p>${message}</p>
            <button class="retry-btn" onclick="location.reload()">
              Reintentar
            </button>
          </div>
        </div>
      `;
      this.errorContainer.style.display = 'block';
    } else {
      window.mostrarMensajeEstado?.(message, 'error');
    }
  }

  // =================
  // PLANTILLAS HTML
  // =================

  /**
   * HTML para tarjeta de encuesta
   * @private
   */
  _getSurveyCardHTML(survey) {
    const statusClass = survey.isExpired ? 'expired' : 'active';
    const statusIcon = survey.isExpired ? '⏰' : '📋';

    return `
      <div class="survey-card ${statusClass}" data-survey-id="${survey.iSurveyId}">
        <div class="survey-header">
          <div class="survey-status">
            <span class="status-icon">${statusIcon}</span>
            <span class="status-text">${survey.expirationStatus}</span>
          </div>
          ${this._getRightArrowIcon()}
        </div>
        
        <div class="survey-content">
          <h3 class="survey-title">${survey.vcSurvey}</h3>
          <p class="survey-program">${survey.vcProgram}</p>
          <p class="survey-creator">Por ${survey.vcNames}</p>
        </div>
        
        <div class="survey-meta">
          <div class="meta-item">
            ${this._getQuestionsIcon()}
            <span>${survey.questionsLabel}</span>
          </div>
          <div class="meta-item">
            ${this._getClockIcon()}
            <span>${survey.timeLabel}</span>
          </div>
        </div>
        
        <div class="survey-dates">
          <small>Creada: ${survey.createdDate}</small>
          ${survey.expirationDate ? `<small>Expira: ${survey.expirationDate}</small>` : ''}
        </div>
      </div>
    `;
  }

  /**
   * HTML para estado vacío
   * @private
   */
  _getEmptyStateHTML() {
    return `
      <div class="empty-state">
        <div class="empty-icon">📋</div>
        <h3>No hay encuestas disponibles</h3>
        <p>No se encontraron encuestas activas en este momento.</p>
        <button class="retry-btn" onclick="location.reload()">
          Refrescar
        </button>
      </div>
    `;
  }

  // ===============
  // ICONOS SVG
  // ===============

  _getBackIcon() {
    return `
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <path d="M19 12H5M12 19L5 12L12 5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    `;
  }

  _getRefreshIcon() {
    return `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M21 3v5h-5M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M8 16H3v5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    `;
  }

  _getClockIcon() {
    return `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/>
        <path d="M12 6V12L16 14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
      </svg>
    `;
  }

  _getQuestionsIcon() {
    return `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
        <path d="M9 11H15M9 15H15M17 21L12 16L7 21V5C7 3.89543 7.89543 3 9 3H15C16.1046 3 17 3.89543 17 5V21Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    `;
  }

  _getRightArrowIcon() {
    return `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <path d="M9 18L15 12L9 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    `;
  }
}
