// src/views/survey-detail/index.js
// Vista detallada de encuesta individual - VERSIÓN COMPLETA (con soporte tipo 2 checkbox)

import Handlebars from 'handlebars';
import { navigateTo } from '../../routes/index.js';
import { authService } from '../../services/auth.service.js';
import { dialogService } from '../../services/dialog.service.js';
import { hapticsService } from '../../services/haptics.service.js';
import { surveysService } from '../../services/surveys.service.js';
import { $ } from '../../utils/dom.helper.js';
import './style.less';
import tplSource from './template.hbs?raw';

const template = Handlebars.compile(tplSource);

export default class SurveyDetailView {
  constructor(context = {}) {
    this.context = context;

    // Extraer Survey ID
    this.surveyId = this._extractSurveyId(context);
    console.log('🎯 [SurveyDetailView] Survey ID extraído:', this.surveyId);

    this.user = authService.getCurrentUser();

    // Estado de la encuesta
    this.survey = null;
    this.startedAt = null;
    this.questions = [];
    this.currentQuestionIndex = 0;
    this.responses = new Map(); // questionId -> response
    this.isLoading = true;
    this.error = null;
    this.isSubmitting = false;

    // Timer
    this.timer = null;
    this.timeRemaining = 0;
    this.isTimeUp = false;

    // Abort controller
    this.abortController = new AbortController();
  }

  /**
   * Extraer Survey ID de múltiples fuentes posibles
   * @private
   */
  _extractSurveyId(context) {
    // Método 1: Desde context.params
    if (context.params && context.params.id) {
      console.log('📍 ID desde context.params:', context.params.id);
      return parseInt(context.params.id);
    }

    // Método 2: Desde context directamente
    if (context.id) {
      console.log('📍 ID desde context:', context.id);
      return parseInt(context.id);
    }

    // Método 3: Desde la URL actual
    const currentHash = window.location.hash;
    const match = currentHash.match(/\/surveys\/(\d+)/);
    if (match) {
      console.log('📍 ID desde URL hash:', match[1]);
      return parseInt(match[1]);
    }

    console.error('❌ [SurveyDetailView] No se pudo extraer Survey ID');
    return null;
  }

  /**
   * Render inicial
   */
  render() {
    if (!this.surveyId || isNaN(this.surveyId)) {
      console.error('❌ [SurveyDetailView] Survey ID inválido:', this.surveyId);
      return `
        <div class="survey-detail-container">
          <div class="survey-error" style="display: flex;">
            <div class="error-content">
              <div class="error-icon">⚠️</div>
              <h3>ID de Encuesta Inválido</h3>
              <p>No se pudo identificar la encuesta solicitada.</p>
              <p><strong>Debug Info:</strong> Survey ID = ${this.surveyId}</p>
              <p><strong>URL:</strong> ${window.location.hash}</p>
              <button class="back-to-surveys-btn" onclick="window.location.hash='#/surveys'">
                Volver a Encuestas
              </button>
            </div>
          </div>
        </div>
      `;
    }

    return template({
      user: {
        name: this.user?.name || 'Usuario',
      },
      surveyId: this.surveyId,
      loading: this.isLoading,
      backIcon: this._getBackIcon(),
      prevIcon: this._getPrevIcon(),
      nextIcon: this._getNextIcon(),
      submitIcon: this._getSubmitIcon(),
    });
  }

  /**
   * After render - Carga y configuración
   */
  async afterRender() {
    console.log(`📝 [SurveyDetailView] Inicializando encuesta ${this.surveyId}`);

    if (!this.surveyId || isNaN(this.surveyId)) {
      console.error('❌ [SurveyDetailView] Survey ID inválido en afterRender:', this.surveyId);
      this._showError('ID de encuesta no válido');
      return;
    }

    try {
      // 1. Setup básico
      this._setupDOMReferences();
      this._attachEventListeners();

      // 2. Cargar datos de la encuesta
      await this._loadSurveyData();

      // 3. Si se cargó correctamente, inicializar la encuesta
      if (this.survey && this.questions.length > 0) {
        await this._initializeSurvey();
      }
    } catch (error) {
      console.error('❌ [SurveyDetailView] Error en afterRender:', error);
      this._showError('Error inicializando la encuesta');
    }
  }

  /**
   * Cleanup
   */
  cleanup() {
    console.log('🧹 [SurveyDetailView] Limpiando vista');

    // Limpiar timer
    this._clearTimer();

    // Cancelar peticiones
    if (this.abortController) {
      this.abortController.abort();
    }

    // Cancelar peticiones del servicio
    surveysService.cancelAllRequests();
  }

  // ========================
  // MÉTODOS PRINCIPALES
  // ========================

  /**
   * Cargar datos de la encuesta
   * @private
   */
  async _loadSurveyData() {
    console.log(`📡 [SurveyDetailView] Cargando datos de encuesta ${this.surveyId}`);

    try {
      // Mostrar loading
      this._updateLoadingState(true, 'Cargando encuesta...');

      // 1. Primero obtener headers para verificar que la encuesta existe
      const headersResult = await surveysService.getSurveyHeaders();
      if (!headersResult.success) {
        throw new Error(headersResult.error || 'Error cargando encuestas');
      }

      // Encontrar la encuesta específica
      this.survey = headersResult.data.find(s => s.iSurveyId === this.surveyId);
      if (!this.survey) {
        throw new Error(`Encuesta con ID ${this.surveyId} no encontrada`);
      }

      // Verificar si está expirada
      if (this.survey.isExpired) {
        throw new Error('Esta encuesta ha expirado');
      }

      console.log('✅ [SurveyDetailView] Encuesta encontrada:', this.survey.vcSurvey);

      // 2. Cargar preguntas
      this._updateLoadingState(true, 'Cargando preguntas...');

      const questionsResult = await surveysService.getSurveyQuestions(
        this.surveyId,
        this.survey.iRandQuestions > 0, // randomize si tiene valor
        this.survey.iRandQuestions || 0, // max questions
      );

      if (!questionsResult.success) {
        throw new Error(questionsResult.error || 'Error cargando preguntas');
      }

      this.questions = questionsResult.data || [];
      console.log('✅ [SurveyDetailView] Preguntas cargadas:', this.questions.length);

      if (this.questions.length === 0) {
        throw new Error('Esta encuesta no tiene preguntas disponibles');
      }

      // 3. Cargar respuestas para preguntas tipo opción
      await this._loadQuestionAnswers();
    } catch (error) {
      console.error('❌ [SurveyDetailView] Error cargando datos:', error);
      this.error = error.message || 'Error cargando encuesta';
      throw error;
    }
  }

  /**
   * Cargar respuestas predefinidas para preguntas tipo opción
   * @private
   */
  async _loadQuestionAnswers() {
    const optionQuestions = this.questions.filter(q => q.needsAnswers);

    if (optionQuestions.length === 0) {
      console.log('ℹ️ [SurveyDetailView] No hay preguntas que requieran respuestas predefinidas');
      return;
    }

    this._updateLoadingState(true, 'Cargando opciones...');

    // Cargar respuestas en paralelo
    const promises = optionQuestions.map(async question => {
      try {
        const result = await surveysService.getQuestionAnswers(question.iQuestionId);
        if (result.success) {
          question.answers = result.data;
          console.log(
            `✅ [SurveyDetailView] Respuestas cargadas para pregunta ${question.iQuestionId}:`,
            result.data.length,
          );
        } else {
          console.warn(
            `⚠️ [SurveyDetailView] Error cargando respuestas para pregunta ${question.iQuestionId}:`,
            result.error,
          );
          question.answers = [];
        }
      } catch (error) {
        console.error(
          `❌ [SurveyDetailView] Error cargando respuestas para pregunta ${question.iQuestionId}:`,
          error,
        );
        question.answers = [];
      }
    });

    await Promise.allSettled(promises);
    console.log('✅ [SurveyDetailView] Carga de respuestas completada');
  }

  /**
   * Inicializar la encuesta
   * @private
   */
  async _initializeSurvey() {
    console.log('🚀 [SurveyDetailView] Inicializando interfaz de encuesta');
    this.startedAt = new Date().toISOString();
    try {
      // Actualizar UI con datos de la encuesta
      this._renderSurveyHeader();

      // Inicializar timer si es necesario
      if (this.survey.iTimer > 0) {
        this._initializeTimer();
      }

      // Mostrar primera pregunta
      await this._renderCurrentQuestion();

      // Ocultar loading
      this._updateLoadingState(false);

      await hapticsService.light();
    } catch (error) {
      console.error('❌ [SurveyDetailView] Error inicializando encuesta:', error);
      throw error;
    }
  }

  /**
   * Renderizar header de la encuesta
   * @private
   */
  _renderSurveyHeader() {
    const headerContent = $('#surveyHeaderContent');
    if (!headerContent) return;

    headerContent.innerHTML = `
      <div class="survey-info">
        <h1 class="survey-title">${this.survey.vcSurvey}</h1>
        <p class="survey-program">${this.survey.vcProgram}</p>
        <div class="survey-meta">
          <span class="question-counter">
            Pregunta <span id="currentQuestionNum">1</span> de ${this.questions.length}
          </span>
          ${
            this.survey.iTimer > 0
              ? `
            <div class="timer-display" id="timerDisplay">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/>
                <path d="M12 6V12L16 14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
              </svg>
              <span id="timerText">${this._formatTime(this.survey.iTimer * 60)}</span>
            </div>
          `
              : ''
          }
        </div>
      </div>
      
      ${
        this.survey.vcInstructions
          ? `
        <div class="survey-instructions">
          <h3>Instrucciones</h3>
          <div class="instructions-content">${this.survey.vcInstructions}</div>
        </div>
      `
          : ''
      }
    `;
  }

  // =======================
  // CAMBIOS PRINCIPALES
  // =======================

  /**
   * Renderizar pregunta actual - CORREGIDO para tipo 2
   * @private
   */
  async _renderCurrentQuestion() {
    if (this.currentQuestionIndex >= this.questions.length) {
      console.log('✅ [SurveyDetailView] Todas las preguntas completadas');
      await this._showSummary();
      return;
    }

    const question = this.questions[this.currentQuestionIndex];
    const questionContainer = $('#questionContainer');

    if (!questionContainer) {
      console.error('❌ [SurveyDetailView] Contenedor de preguntas no encontrado');
      return;
    }

    console.log(
      `📝 [SurveyDetailView] Renderizando pregunta ${this.currentQuestionIndex + 1}:`,
      question.vcQuestion,
    );

    // Actualizar contador
    const questionNum = $('#currentQuestionNum');
    if (questionNum) {
      questionNum.textContent = this.currentQuestionIndex + 1;
    }

    // CORREGIDO: Renderizar según tipo incluyendo tipo 2
    let questionHTML = '';

    switch (question.iTypeId) {
      case 1: // Opción única (radio)
        questionHTML = this._renderRadioQuestion(question);
        break;
      case 2: // Opción múltiple (checkbox) - NUEVO
        questionHTML = this._renderCheckboxQuestion(question);
        break;
      case 3: // Texto abierto
        questionHTML = this._renderTextQuestion(question);
        break;
      case 4: // Numérico con rango
        questionHTML = this._renderNumericQuestion(question);
        break;
      default:
        questionHTML = `<div class="error">Tipo de pregunta no soportado: ${question.iTypeId}</div>`;
    }

    questionContainer.innerHTML = `
      <div class="question-wrapper" data-question-id="${question.iQuestionId}">
        <div class="question-header">
          <h2 class="question-title">${question.vcQuestion || 'Pregunta sin texto'}</h2>
          <span class="question-type-badge">${question.vcType || 'Sin tipo'}</span>
        </div>
        <div class="question-content">
          ${questionHTML}
        </div>
      </div>
    `;

    // Configurar eventos específicos del tipo de pregunta
    this._attachQuestionEvents(question);

    // Restaurar respuesta previa si existe
    this._restoreQuestionResponse(question);

    // Actualizar navegación
    this._updateNavigationButtons();

    // Scroll to top suavemente
    questionContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });

    await hapticsService.light();
  }

  /**
   * Renderizar pregunta tipo radio (opción única) - RENOMBRADO
   * @private
   */
  _renderRadioQuestion(question) {
    if (!question.answers || question.answers.length === 0) {
      return '<div class="error">No hay opciones disponibles para esta pregunta</div>';
    }

    const answersHTML = question.answers
      .map(
        answer => `
      <div class="option-item radio-option">
        <label class="option-label">
          <input 
            type="radio" 
            name="question_${question.iQuestionId}" 
            value="${answer.iAnswerId}"
            class="option-input radio-input"
            data-needs-text="${answer.bText}"
          >
          <div class="option-content">
            <div class="radio-indicator"></div>
            <span class="option-text">${answer.vcAnswer || 'Opción sin texto'}</span>
          </div>
        </label>
        ${
          answer.bText
            ? `
          <div class="option-text-input" style="display: none;">
            <textarea 
              placeholder="Proporciona detalles adicionales..."
              maxlength="500"
              class="additional-text"
              data-answer-id="${answer.iAnswerId}"
            ></textarea>
          </div>
        `
            : ''
        }
      </div>
    `,
      )
      .join('');

    return `<div class="options-container radio-container">${answersHTML}</div>`;
  }

  /**
   * Renderizar pregunta tipo checkbox (opción múltiple) - NUEVO
   * @private
   */
  _renderCheckboxQuestion(question) {
    if (!question.answers || question.answers.length === 0) {
      return '<div class="error">No hay opciones disponibles para esta pregunta</div>';
    }

    const answersHTML = question.answers
      .map(
        answer => `
      <div class="option-item checkbox-option">
        <label class="option-label">
          <input 
            type="checkbox" 
            name="question_${question.iQuestionId}" 
            value="${answer.iAnswerId}"
            class="option-input checkbox-input"
            data-needs-text="${answer.bText}"
          >
          <div class="option-content">
            <div class="checkbox-indicator">
              <svg class="check-icon" width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path d="M20 6L9 17L4 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </div>
            <span class="option-text">${answer.vcAnswer || 'Opción sin texto'}</span>
          </div>
        </label>
        ${
          answer.bText
            ? `
          <div class="option-text-input" style="display: none;">
            <textarea 
              placeholder="Proporciona detalles adicionales..."
              maxlength="500"
              class="additional-text"
              data-answer-id="${answer.iAnswerId}"
            ></textarea>
          </div>
        `
            : ''
        }
      </div>
    `,
      )
      .join('');

    return `
      <div class="options-container checkbox-container">
        <div class="checkbox-helper">
          <small>Puedes seleccionar múltiples opciones</small>
        </div>
        ${answersHTML}
      </div>
    `;
  }

  /**
   * Renderizar pregunta de texto abierto
   * @private
   */
  _renderTextQuestion(question) {
    return `
      <div class="text-input-container">
        <textarea 
          id="textAnswer_${question.iQuestionId}"
          placeholder="Escribe tu respuesta aquí..."
          maxlength="1024"
          class="text-answer-input"
          rows="4"
        ></textarea>
        <div class="text-counter">
          <span class="current">0</span>/<span class="max">1024</span> caracteres
        </div>
      </div>
    `;
  }

  /**
   * Renderizar pregunta numérica con slider
   * @private
   */
  _renderNumericQuestion(question) {
    const min = question.iMin || 0;
    const max = question.iMax || 10;
    const range = max - min;
    const initialValue = Math.round((min + max) / 2);

    // Generar marcas del slider
    let marks = [];
    if (range <= 10) {
      // Mostrar todas las marcas
      for (let i = min; i <= max; i++) {
        marks.push(i);
      }
    } else {
      // Mostrar solo min, medio y max
      marks = [min, Math.round((min + max) / 2), max];
    }

    const marksHTML = marks
      .map(
        mark => `
      <div class="slider-mark" style="left: ${((mark - min) / range) * 100}%;">
        <div class="mark-line"></div>
        <div class="mark-label">${mark}</div>
      </div>
    `,
      )
      .join('');

    return `
      <div class="numeric-input-container">
        <div class="slider-container">
          <div class="slider-track">
            <div class="slider-fill" id="sliderFill_${question.iQuestionId}"></div>
            <div class="slider-marks">${marksHTML}</div>
          </div>
          <input 
            type="range" 
            id="numericSlider_${question.iQuestionId}"
            min="${min}" 
            max="${max}" 
            value="${initialValue}"
            class="numeric-slider"
          >
        </div>
        <div class="slider-value">
          <span class="value-label">Valor seleccionado:</span>
          <span class="value-display" id="valueDisplay_${question.iQuestionId}">${initialValue}</span>
        </div>
      </div>
    `;
  }

  /**
   * Adjuntar eventos específicos de pregunta - CORREGIDO para tipo 2
   * @private
   */
  _attachQuestionEvents(question) {
    switch (question.iTypeId) {
      case 1: // Radio (opción única)
        this._attachRadioEvents(question);
        break;
      case 2: // Checkbox (opción múltiple) - NUEVO
        this._attachCheckboxEvents(question);
        break;
      case 3: // Texto
        this._attachTextEvents(question);
        break;
      case 4: // Numérico
        this._attachNumericEvents(question);
        break;
    }
  }

  /**
   * Eventos para preguntas tipo radio (opción única) - RENOMBRADO
   * @private
   */
  _attachRadioEvents(question) {
    const radioInputs = document.querySelectorAll(
      `input[name="question_${question.iQuestionId}"][type="radio"]`,
    );

    radioInputs.forEach(input => {
      input.addEventListener('change', async () => {
        await hapticsService.light();

        const needsText = input.dataset.needsText === 'true';
        const answerId = parseInt(input.value);

        // Ocultar todos los campos de texto adicionales para esta pregunta
        const allTextInputs = document.querySelectorAll('.option-text-input');
        allTextInputs.forEach(container => {
          container.style.display = 'none';
          const textarea = container.querySelector('textarea');
          if (textarea) textarea.value = '';
        });

        // Mostrar campo de texto si es necesario
        if (needsText) {
          const textContainer = document.querySelector(
            `.option-text-input textarea[data-answer-id="${answerId}"]`,
          )?.parentElement;
          if (textContainer) {
            textContainer.style.display = 'block';
            const textarea = textContainer.querySelector('textarea');
            if (textarea) {
              textarea.focus();
            }
          }
        }

        // Guardar respuesta
        this._saveResponse(question.iQuestionId, {
          typeId: 1,
          questionId: question.iQuestionId,
          answerId: answerId,
          extraText: needsText ? '' : undefined,
        });
      });
    });

    // Eventos para campos de texto adicionales (radio)
    const textareas = document.querySelectorAll('.radio-container .additional-text');
    textareas.forEach(textarea => {
      textarea.addEventListener('input', () => {
        const answerId = parseInt(textarea.dataset.answerId);
        const selectedRadio = document.querySelector(
          `input[name="question_${question.iQuestionId}"][type="radio"]:checked`,
        );

        if (selectedRadio && parseInt(selectedRadio.value) === answerId) {
          this._saveResponse(question.iQuestionId, {
            typeId: 1,
            questionId: question.iQuestionId,
            answerId: answerId,
            extraText: textarea.value,
          });
        }
      });
    });
  }

  /**
   * Eventos para preguntas tipo checkbox (opción múltiple) - NUEVO
   * @private
   */
  _attachCheckboxEvents(question) {
    const checkboxInputs = document.querySelectorAll(
      `input[name="question_${question.iQuestionId}"][type="checkbox"]`,
    );

    checkboxInputs.forEach(input => {
      input.addEventListener('change', async () => {
        await hapticsService.light();

        const answerId = parseInt(input.value);
        const needsText = input.dataset.needsText === 'true';

        // Manejar texto adicional
        const textContainer = document.querySelector(
          `.option-text-input textarea[data-answer-id="${answerId}"]`,
        )?.parentElement;

        if (input.checked && needsText && textContainer) {
          textContainer.style.display = 'block';
          const textarea = textContainer.querySelector('textarea');
          if (textarea) {
            textarea.focus();
          }
        } else if (!input.checked && textContainer) {
          textContainer.style.display = 'none';
          const textarea = textContainer.querySelector('textarea');
          if (textarea) textarea.value = '';
        }

        // Recolectar todas las respuestas seleccionadas
        this._updateCheckboxResponse(question);
      });
    });

    // Eventos para campos de texto adicionales (checkbox)
    const textareas = document.querySelectorAll('.checkbox-container .additional-text');
    textareas.forEach(textarea => {
      textarea.addEventListener('input', () => {
        this._updateCheckboxResponse(question);
      });
    });
  }

  /**
   * Actualizar respuesta de checkbox (múltiple selección) - NUEVO
   * @private
   */
  _updateCheckboxResponse(question) {
    const checkboxInputs = document.querySelectorAll(
      `input[name="question_${question.iQuestionId}"][type="checkbox"]`,
    );
    const selectedAnswers = [];

    checkboxInputs.forEach(input => {
      if (input.checked) {
        const answerId = parseInt(input.value);
        const needsText = input.dataset.needsText === 'true';
        let extraText = '';

        if (needsText) {
          const textarea = document.querySelector(`.additional-text[data-answer-id="${answerId}"]`);
          if (textarea) {
            extraText = textarea.value;
          }
        }

        selectedAnswers.push({
          answerId: answerId,
          extraText: needsText ? extraText : undefined,
        });
      }
    });

    // Guardar respuesta (array de respuestas para tipo 2)
    this._saveResponse(question.iQuestionId, {
      typeId: 2,
      questionId: question.iQuestionId,
      selectedAnswers: selectedAnswers,
    });
  }

  /**
   * Eventos para preguntas de texto
   * @private
   */
  _attachTextEvents(question) {
    const textarea = $(`#textAnswer_${question.iQuestionId}`);
    const counter = document.querySelector('.text-counter .current');

    if (textarea) {
      textarea.addEventListener('input', () => {
        const text = textarea.value;

        // Actualizar contador
        if (counter) {
          counter.textContent = text.length;
        }

        // Guardar respuesta
        this._saveResponse(question.iQuestionId, {
          typeId: 3,
          questionId: question.iQuestionId,
          text: text,
        });
      });
    }
  }

  /**
   * Eventos para preguntas numéricas
   * @private
   */
  _attachNumericEvents(question) {
    const slider = $(`#numericSlider_${question.iQuestionId}`);
    const valueDisplay = $(`#valueDisplay_${question.iQuestionId}`);
    const sliderFill = $(`#sliderFill_${question.iQuestionId}`);

    if (slider) {
      slider.addEventListener('input', async () => {
        await hapticsService.light();

        const value = parseInt(slider.value);
        const min = parseInt(slider.min);
        const max = parseInt(slider.max);
        const percentage = ((value - min) / (max - min)) * 100;

        // Actualizar visualización
        if (valueDisplay) {
          valueDisplay.textContent = value;
        }

        if (sliderFill) {
          sliderFill.style.width = `${percentage}%`;
        }

        // Guardar respuesta
        this._saveResponse(question.iQuestionId, {
          typeId: 4,
          questionId: question.iQuestionId,
          value: value,
        });
      });
    }
  }

  // ========================
  // NAVEGACIÓN
  // ========================

  /**
   * Ir a pregunta anterior
   * @private
   */
  async _previousQuestion() {
    if (this.currentQuestionIndex > 0) {
      await hapticsService.light();
      this.currentQuestionIndex--;
      await this._renderCurrentQuestion();
    }
  }

  /**
   * Ir a siguiente pregunta
   * @private
   */
  async _nextQuestion() {
    if (this.currentQuestionIndex < this.questions.length - 1) {
      await hapticsService.light();
      this.currentQuestionIndex++;
      await this._renderCurrentQuestion();
    } else {
      // Última pregunta - mostrar resumen
      await this._showSummary();
    }
  }

  /**
   * Actualizar botones de navegación
   * @private
   */
  _updateNavigationButtons() {
    const prevBtn = $('#prevBtn');
    const nextBtn = $('#nextBtn');
    const submitBtn = $('#submitBtn');

    if (prevBtn) {
      prevBtn.disabled = this.currentQuestionIndex === 0;
      prevBtn.style.display = this.currentQuestionIndex === 0 ? 'none' : 'flex';
    }

    const isLastQuestion = this.currentQuestionIndex === this.questions.length - 1;

    if (nextBtn) {
      nextBtn.style.display = isLastQuestion ? 'none' : 'flex';
    }

    if (submitBtn) {
      submitBtn.style.display = isLastQuestion ? 'flex' : 'none';
    }
  }

  // ========================
  // GESTIÓN DE RESPUESTAS
  // ========================

  /**
   * Guardar respuesta
   * @private
   */
  _saveResponse(questionId, response) {
    this.responses.set(questionId, response);
    console.log(`💾 [SurveyDetailView] Respuesta guardada para pregunta ${questionId}:`, response);
  }

  /**
   * Restaurar respuesta previa - CORREGIDO para tipo 2
   * @private
   */
  _restoreQuestionResponse(question) {
    const response = this.responses.get(question.iQuestionId);
    if (!response) return;

    switch (question.iTypeId) {
      case 1: // Radio (opción única)
        const radio = document.querySelector(
          `input[name="question_${question.iQuestionId}"][value="${response.answerId}"]`,
        );
        if (radio) {
          radio.checked = true;
          radio.dispatchEvent(new Event('change'));

          if (response.extraText) {
            setTimeout(() => {
              const textarea = document.querySelector(
                `.additional-text[data-answer-id="${response.answerId}"]`,
              );
              if (textarea) {
                textarea.value = response.extraText;
              }
            }, 100);
          }
        }
        break;

      case 2: // Checkbox (opción múltiple) - NUEVO
        if (response.selectedAnswers && Array.isArray(response.selectedAnswers)) {
          response.selectedAnswers.forEach(selectedAnswer => {
            const checkbox = document.querySelector(
              `input[name="question_${question.iQuestionId}"][value="${selectedAnswer.answerId}"]`,
            );
            if (checkbox) {
              checkbox.checked = true;
              checkbox.dispatchEvent(new Event('change'));

              if (selectedAnswer.extraText) {
                setTimeout(() => {
                  const textarea = document.querySelector(
                    `.additional-text[data-answer-id="${selectedAnswer.answerId}"]`,
                  );
                  if (textarea) {
                    textarea.value = selectedAnswer.extraText;
                  }
                }, 100);
              }
            }
          });
        }
        break;

      case 3: // Texto
        const textarea = $(`#textAnswer_${question.iQuestionId}`);
        if (textarea && response.text) {
          textarea.value = response.text;
          textarea.dispatchEvent(new Event('input'));
        }
        break;

      case 4: // Numérico
        const slider = $(`#numericSlider_${question.iQuestionId}`);
        if (slider && response.value !== undefined) {
          slider.value = response.value;
          slider.dispatchEvent(new Event('input'));
        }
        break;
    }
  }

  // ========================
  // TIMER
  // ========================

  /**
   * Inicializar timer
   * @private
   */
  _initializeTimer() {
    this.timeRemaining = this.survey.iTimer * 60; // Convertir a segundos
    console.log(`⏰ [SurveyDetailView] Iniciando timer: ${this.survey.iTimer} minutos`);

    this.timer = setInterval(() => {
      this.timeRemaining--;
      this._updateTimerDisplay();

      if (this.timeRemaining <= 0) {
        this._handleTimeUp();
      }
    }, 1000);
  }

  /**
   * Actualizar display del timer
   * @private
   */
  _updateTimerDisplay() {
    const timerText = $('#timerText');
    if (timerText) {
      timerText.textContent = this._formatTime(this.timeRemaining);

      // Cambiar color cuando quede poco tiempo
      const timerDisplay = $('#timerDisplay');
      if (timerDisplay) {
        if (this.timeRemaining <= 60) {
          timerDisplay.classList.add('warning');
        } else if (this.timeRemaining <= 300) {
          timerDisplay.classList.add('caution');
        }
      }
    }
  }

  /**
   * Manejar fin del tiempo
   * @private
   */
  async _handleTimeUp() {
    console.log('⏰ [SurveyDetailView] Tiempo agotado');

    this._clearTimer();
    this.isTimeUp = true;

    await hapticsService.error();

    // Deshabilitar todos los inputs
    const inputs = document.querySelectorAll('input, textarea, button:not(#backBtn)');
    inputs.forEach(input => {
      input.disabled = true;
    });

    // Mostrar mensaje
    const overlay = document.createElement('div');
    overlay.className = 'time-up-overlay';
    overlay.innerHTML = `
      <div class="time-up-content">
        <div class="time-up-icon">⏰</div>
        <h3>Tiempo Finalizado</h3>
        <p>El tiempo para completar esta encuesta ha terminado.</p>
        <button class="finish-btn" onclick="this.parentElement.parentElement.remove()">
          Entendido
        </button>
      </div>
    `;

    document.body.appendChild(overlay);
  }

  /**
   * Limpiar timer
   * @private
   */
  _clearTimer() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * Formatear tiempo
   * @private
   */
  _formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  /**
   * Construir el payload para envío/registro
   * Incluye encuesta, usuario, progreso, métricas y respuestas por tipo.
   * @private
   */
  _buildSubmissionPayload() {
    const totalQuestions = this.questions.length;
    const answeredQuestions = this.responses.size;
    const completionPercentage = Math.round((answeredQuestions / totalQuestions) * 100);

    const answers = this.questions.map((q, idx) => {
      const res = this.responses.get(q.iQuestionId);

      // Estructura por tipo
      let response = null;
      if (res) {
        switch (res.typeId) {
          case 1: {
            // Radio
            const ans = (q.answers || []).find(a => a.iAnswerId === res.answerId);
            response = {
              typeId: 1,
              answerId: res.answerId,
              answerText: ans?.vcAnswer ?? null,
              extraText: res.extraText ?? undefined,
            };
            break;
          }
          case 2: {
            // Checkbox múltiple
            const arr = (res.selectedAnswers || []).map(sa => {
              const ans = (q.answers || []).find(a => a.iAnswerId === sa.answerId);
              return {
                answerId: sa.answerId,
                answerText: ans?.vcAnswer ?? null,
                extraText: sa.extraText ?? undefined,
              };
            });
            response = { typeId: 2, answers: arr };
            break;
          }
          case 3: {
            // Texto
            response = { typeId: 3, text: res.text ?? '' };
            break;
          }
          case 4: {
            // Numérico
            response = { typeId: 4, value: res.value };
            break;
          }
        }
      }

      return {
        questionId: q.iQuestionId,
        index: idx + 1,
        typeId: q.iTypeId,
        type: q.vcType ?? null,
        questionText: q.vcQuestion ?? null,
        // Solo marca unanswered si no hay respuesta
        unanswered: !res,
        response,
      };
    });

    // Info de dispositivo simple (puedes enriquecerla si usas Capacitor Device)
    const device = {
      userAgent: navigator.userAgent,
      platform: navigator.platform,
    };

    // Métricas de tiempo
    const timeLimitSec = (this.survey?.iTimer || 0) * 60;
    const timeRemainingSec = this.timer ? this.timeRemaining : timeLimitSec;

    return {
      surveyId: this.surveyId,
      surveyTitle: this.survey?.vcSurvey ?? null,
      program: this.survey?.vcProgram ?? null,
      respondent: {
        id: this.user?.id ?? null,
        name: this.user?.name ?? null,
      },
      meta: {
        startedAt: this.startedAt,
        finishedAt: null, // se puede llenar en el envío final
        timeLimitSec,
        timeRemainingSec,
        device,
      },
      progress: {
        totalQuestions,
        answeredQuestions,
        completionPercentage,
      },
      answers,
    };
  }

  // ========================
  // RESUMEN Y ENVÍO (PLACEHOLDER)
  // ========================

  /**
   * Mostrar resumen de respuestas (placeholder)
   * @private
   */
  async _showSummary() {
    console.log('📊 [SurveyDetailView] Mostrando resumen');

    const questionContainer = $('#questionContainer');
    if (!questionContainer) return;

    // Contar respuestas completadas
    const totalQuestions = this.questions.length;
    const answeredQuestions = this.responses.size;
    const completionPercentage = Math.round((answeredQuestions / totalQuestions) * 100);

    const summaryHTML = `
      <div class="survey-summary">
        <div class="summary-header">
          <div class="summary-icon">📊</div>
          <h2>Resumen de Respuestas</h2>
          <p>Revisa tus respuestas antes de enviar</p>
        </div>
        
        <div class="completion-stats">
          <div class="completion-bar">
            <div class="completion-fill" style="width: ${completionPercentage}%"></div>
          </div>
          <div class="completion-text">
            ${answeredQuestions} de ${totalQuestions} preguntas respondidas (${completionPercentage}%)
          </div>
        </div>
        
        <div class="responses-list">
          ${this._generateResponsesSummary()}
        </div>
        
        <div class="summary-actions">
          <button class="review-btn" id="reviewBtn">
            📝 Revisar Respuestas
          </button>
          <button class="submit-btn" id="finalSubmitBtn" ${
            completionPercentage < 100 ? 'disabled' : ''
          }>
            ${this._getSubmitIcon()}
            <span>Enviar Encuesta</span>
          </button>
        </div>
      </div>
    `;

    questionContainer.innerHTML = summaryHTML;

    // Eventos
    const reviewBtn = $('#reviewBtn');
    const finalSubmitBtn = $('#finalSubmitBtn');

    if (reviewBtn) {
      reviewBtn.addEventListener('click', () => {
        this.currentQuestionIndex = 0;
        this._renderCurrentQuestion();
      });
    }

    if (finalSubmitBtn && !finalSubmitBtn.disabled) {
      finalSubmitBtn.addEventListener('click', () => this._submitSurvey());
    }

    // Ocultar botones de navegación
    const navButtons = document.querySelectorAll('#prevBtn, #nextBtn, #submitBtn');
    navButtons.forEach(btn => {
      if (btn) btn.style.display = 'none';
    });
  }

  /**
   * Generar HTML del resumen de respuestas - CORREGIDO para tipo 2
   * @private
   */
  _generateResponsesSummary() {
    return this.questions
      .map((question, index) => {
        const response = this.responses.get(question.iQuestionId);
        let responseText = '<span class="no-response">Sin respuesta</span>';

        if (response) {
          switch (response.typeId) {
            case 1: // Radio (opción única)
              {
                const answer = question.answers?.find(a => a.iAnswerId === response.answerId);
                responseText = answer ? answer.vcAnswer : 'Respuesta no válida';
                if (response.extraText) {
                  responseText += `<br><small class="extra-text">"${response.extraText}"</small>`;
                }
              }
              break;

            case 2: // Checkbox (opción múltiple) - NUEVO
              if (response.selectedAnswers && response.selectedAnswers.length > 0) {
                const selectedTexts = response.selectedAnswers.map(selectedAnswer => {
                  const answer = question.answers?.find(
                    a => a.iAnswerId === selectedAnswer.answerId,
                  );
                  let text = answer ? answer.vcAnswer : 'Opción no válida';
                  if (selectedAnswer.extraText) {
                    text += ` ("${selectedAnswer.extraText}")`;
                  }
                  return text;
                });
                responseText = selectedTexts.join('<br>• ');
                responseText = '• ' + responseText; // Agregar viñeta inicial
              }
              break;

            case 3: // Texto
              responseText = response.text || '<span class="no-response">Sin respuesta</span>';
              break;

            case 4: // Numérico
              responseText =
                response.value !== undefined
                  ? response.value.toString()
                  : '<span class="no-response">Sin respuesta</span>';
              break;
          }
        }

        return `
        <div class="response-item ${!response ? 'unanswered' : ''}">
          <div class="response-header">
            <span class="question-number">${index + 1}</span>
            <span class="question-type">${question.vcType || 'Sin tipo'}</span>
          </div>
          <div class="response-content">
            <h4 class="response-question">${question.vcQuestion || 'Pregunta sin texto'}</h4>
            <div class="response-answer">${responseText}</div>
          </div>
        </div>
      `;
      })
      .join('');
  }

  /**
   * Enviar encuesta (placeholder - implementar cuando esté el endpoint)
   * @private
   */
  async _submitSurvey() {
    if (this.isSubmitting) return;

    console.log('📤 [SurveyDetailView] Enviando encuesta');

    try {
      this.isSubmitting = true;
      const submitBtn = $('#finalSubmitBtn');

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = `
          <div class="loading-spinner"></div>
          <span>Enviando...</span>
        `;
      }

      await hapticsService.medium();

      // TODO: Implementar cuando esté disponible el endpoint de envío
      // const result = await surveysService.submitSurvey(this.surveyId, Array.from(this.responses.values()));

      // Por ahora, simular envío exitoso
      await new Promise(resolve => setTimeout(resolve, 2000));

      await hapticsService.success();

      // Mostrar confirmación
      await dialogService.alert(
        'Encuesta Enviada',
        '¡Gracias por tu participación! Tu encuesta ha sido enviada correctamente.',
      );

      // Navegar de regreso
      navigateTo('/surveys');
    } catch (error) {
      console.error('❌ [SurveyDetailView] Error enviando encuesta:', error);
      await hapticsService.error();

      this.isSubmitting = false;
      const submitBtn = $('#finalSubmitBtn');

      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = `
          ${this._getSubmitIcon()}
          <span>Enviar Encuesta</span>
        `;
      }

      window.mostrarMensajeEstado?.('Error enviando la encuesta. Intenta nuevamente.', 'error');
    }
  }

  // ========================
  // SETUP Y UTILIDADES
  // ========================

  /**
   * Configurar referencias DOM
   * @private
   */
  _setupDOMReferences() {
    this.backBtn = $('#backBtn');
    this.prevBtn = $('#prevBtn');
    this.nextBtn = $('#nextBtn');
    this.submitBtn = $('#submitBtn');
    this.loadingContainer = $('#surveyLoading');
    this.errorContainer = $('#surveyError');
    this.contentContainer = $('#surveyContent');
    this.questionContainer = $('#questionContainer');
    this.timerDisplay = $('#timerDisplay');
  }

  /**
   * Adjuntar event listeners principales
   * @private
   */
  _attachEventListeners() {
    // Botón regresar
    if (this.backBtn) {
      this.backBtn.addEventListener('click', async e => {
        e.preventDefault();

        if (this.responses.size > 0) {
          const confirmed = await dialogService.confirm(
            'Salir de la Encuesta',
            '¿Estás seguro de que deseas salir? Se perderán las respuestas no guardadas.',
          );

          if (!confirmed) return;
        }

        await hapticsService.light();
        navigateTo('/surveys');
      });
    }

    // Botones de navegación
    if (this.prevBtn) {
      this.prevBtn.addEventListener('click', e => {
        e.preventDefault();
        this._previousQuestion();
      });
    }

    if (this.nextBtn) {
      this.nextBtn.addEventListener('click', e => {
        e.preventDefault();
        this._nextQuestion();
      });
    }

    if (this.submitBtn) {
      this.submitBtn.addEventListener('click', e => {
        e.preventDefault();

        // 👉 Construir y loguear el payload
        const payload = this._buildSubmissionPayload();
        console.log('🧾 [SurveyDetailView] Payload de encuesta (submitBtn):', payload);
        console.log('🧾 [SurveyDetailView] Payload JSON:', JSON.stringify(payload, null, 2));

        // continuar con el flujo actual (mostrar resumen)
        this._showSummary();
      });
    }
  }

  /**
   * Actualizar estado de carga
   * @private
   */
  _updateLoadingState(isLoading, message = 'Cargando...') {
    if (this.loadingContainer) {
      this.loadingContainer.style.display = isLoading ? 'flex' : 'none';
      const loadingText = this.loadingContainer.querySelector('.loading-text');
      if (loadingText) {
        loadingText.textContent = message;
      }
    }

    if (this.contentContainer) {
      this.contentContainer.style.display = isLoading ? 'none' : 'block';
    }
  }

  /**
   * Mostrar error
   * @private
   */
  _showError(message) {
    console.error('🚨 [SurveyDetailView] Mostrando error:', message);

    if (this.errorContainer) {
      this.errorContainer.innerHTML = `
        <div class="error-content">
          <div class="error-icon">⚠️</div>
          <h3>Error</h3>
          <p>${message}</p>
          <p><strong>Survey ID:</strong> ${this.surveyId}</p>
          <p><strong>URL:</strong> ${window.location.hash}</p>
          <button class="back-to-surveys-btn" onclick="window.location.hash='#/surveys'">
            Volver a Encuestas
          </button>
        </div>
      `;
      this.errorContainer.style.display = 'flex';
    }

    this._updateLoadingState(false);

    if (this.contentContainer) {
      this.contentContainer.style.display = 'none';
    }
  }

  // ================
  // ICONOS SVG
  // ================

  _getBackIcon() {
    return `<svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <path d="M19 12H5M12 19L5 12L12 5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;
  }

  _getPrevIcon() {
    return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path d="M15 18L9 12L15 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;
  }

  _getNextIcon() {
    return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path d="M9 18L15 12L9 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;
  }

  _getSubmitIcon() {
    return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path d="M22 2L11 13M22 2L15 22L11 13M22 2L2 9L11 13" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;
  }
}
