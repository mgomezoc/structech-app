// src/views/survey-detail/index.js
// Vista detallada de encuesta - SIMPLIFICADA
// Ahora utiliza el keyboardService global para todo el manejo de teclado.

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
    this.surveyId = this._extractSurveyId(context);
    console.log('🎯 [SurveyDetailView] Survey ID extraído:', this.surveyId);

    this.user = authService.getCurrentUser();

    // Estado
    this.survey = null;
    this.questions = [];
    this.currentQuestionIndex = 0;
    this.responses = new Map();
    this.isLoading = true;
    this.error = null;
    this.isSubmitting = false;

    // Referencia opcional
    this.reference = '';

    // Timer
    this.timer = null;
    this.timeRemaining = 0;
    this.isTimeUp = false;
    this.startedAt = Date.now();

    // Abort controller
    this.abortController = new AbortController();
  }

  // ========================
  // RENDER + CICLO DE VIDA
  // ========================

  render() {
    if (!this.surveyId || isNaN(this.surveyId)) {
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
      user: { name: this.user?.name || 'Usuario' },
      surveyId: this.surveyId,
      loading: this.isLoading,
      backIcon: this._getBackIcon(),
      prevIcon: this._getPrevIcon(),
      nextIcon: this._getNextIcon(),
      submitIcon: this._getSubmitIcon(),
    });
  }

  async afterRender() {
    console.log(`📝 [SurveyDetailView] Inicializando encuesta ${this.surveyId}`);
    if (!this.surveyId || isNaN(this.surveyId)) {
      this._showError('ID de encuesta no válido');
      return;
    }

    try {
      this._setupDOMReferences();
      this._markScrollableContainer(); // Le decimos al servicio qué contenedor debe hacer scroll.
      this._attachEventListeners();

      await this._loadSurvey();
      await this._initializeSurvey();
    } catch (error) {
      console.error('❌ [SurveyDetailView] Error en afterRender:', error);
      this._updateLoadingState(false);
      this._showError('Error al cargar la encuesta. Intenta de nuevo.');
    }
  }

  _markScrollableContainer() {
    const content = $('.survey-content');
    if (content) {
      console.log(
        '✅ [SurveyDetailView] Contenedor de scroll marcado para el servicio de teclado.',
      );
    }
  }

  cleanup() {
    console.log('🧹 [SurveyDetailView] Limpiando vista');
    this._clearTimer();
    if (this.abortController) this.abortController.abort();
    surveysService.cancelAllRequests();

    // Limpieza DOM
    this.backBtn = null;
    this.prevBtn = null;
    this.nextBtn = null;
    this.submitBtn = null;
    this.loadingContainer = null;
    this.errorContainer = null;
    this.contentContainer = null;
    this.questionContainer = null;
    this.timerDisplay = null;
  }

  // ========================
  // CARGA DE DATOS
  // ========================

  async _loadSurvey() {
    return this._loadSurveyData();
  }

  async _loadSurveyData() {
    console.log(`📡 [SurveyDetailView] Cargando datos de encuesta ${this.surveyId}`);
    try {
      this._updateLoadingState(true, 'Cargando encuesta...');

      const headersResult = await surveysService.getSurveyHeaders();
      if (!headersResult.success)
        throw new Error(headersResult.error || 'Error cargando encuestas');

      this.survey = headersResult.data.find(s => s.iSurveyId === this.surveyId);
      if (!this.survey) throw new Error(`Encuesta con ID ${this.surveyId} no encontrada`);
      if (this.survey.isExpired) throw new Error('Esta encuesta ha expirado');

      console.log('✅ [SurveyDetailView] Encuesta:', this.survey.vcSurvey);

      this._updateLoadingState(true, 'Cargando preguntas...');
      const questionsResult = await surveysService.getSurveyQuestions(
        this.surveyId,
        this.survey.iRandQuestions > 0,
        this.survey.iRandQuestions || 0,
      );
      if (!questionsResult.success)
        throw new Error(questionsResult.error || 'Error cargando preguntas');

      this.questions = questionsResult.data || [];
      if (this.questions.length === 0)
        throw new Error('Esta encuesta no tiene preguntas disponibles');

      await this._loadQuestionAnswers();
    } catch (error) {
      console.error('❌ [SurveyDetailView] Error cargando datos:', error);
      this.error = error.message || 'Error cargando encuesta';
      throw error;
    }
  }

  async _loadQuestionAnswers() {
    const optionQuestions = this.questions.filter(q => q.needsAnswers);
    if (optionQuestions.length === 0) return;

    this._updateLoadingState(true, 'Cargando opciones...');

    const promises = optionQuestions.map(async question => {
      try {
        const result = await surveysService.getQuestionAnswers(question.iQuestionId);
        question.answers = result.success ? result.data : [];
      } catch {
        question.answers = [];
      }
    });

    await Promise.allSettled(promises);
  }

  // ========================
  // INICIALIZACIÓN DE UI
  // ========================

  async _initializeSurvey() {
    try {
      this._renderSurveyHeader();
      this._attachReferenceListeners();

      if (this.survey.iTimer > 0) this._initializeTimer();

      await this._renderCurrentQuestion();

      this._updateLoadingState(false);
      await hapticsService.light();
    } catch (error) {
      console.error('❌ [SurveyDetailView] Error inicializando encuesta:', error);
      throw error;
    }
  }

  _renderSurveyHeader() {
    const headerContent = $('#surveyHeaderContent');
    if (!headerContent) return;
    const refVal = this.reference || '';

    headerContent.innerHTML = `
      <div class="survey-info">
        <h1 class="survey-title">${this.survey.vcSurvey}</h1>
        <p class="survey-program">${this.survey.vcProgram || ''}</p>
        <div class="survey-meta">
          <span class="question-counter">
            Pregunta <span id="currentQuestionNum">1</span> de ${this.questions.length}
          </span>
          ${
            this.survey.iTimer > 0
              ? `
            <div class="timer-display" id="timerDisplay">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/><path d="M12 6V12L16 14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
              <span id="timerText">${this._formatTime(this.survey.iTimer * 60)}</span>
            </div>`
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
        </div>`
          : ''
      }
      <div class="reference-field" id="referenceField">
        <label for="referenceInput" class="reference-label">Referencia (opcional)</label>
        <input 
          id="referenceInput"
          class="reference-input"
          type="text"
          maxlength="80"
          enterkeyhint="done"
          aria-label="Referencia"
          placeholder="Ej. nombre, folio o nota breve"
          value="${refVal.replace(/"/g, '&quot;')}"
        />
        <div class="reference-hint"><small id="referenceCounter">${refVal.length}/80</small></div>
      </div>
    `;
  }

  _attachReferenceListeners() {
    const refInput = $('#referenceInput');
    if (!refInput) return;

    refInput.addEventListener('input', () => {
      this.reference = refInput.value;
      const cnt = $('#referenceCounter');
      if (cnt) cnt.textContent = `${this.reference.length}/80`;

      const sumInput = $('#referenceSummaryInput');
      if (sumInput && sumInput.value !== this.reference) {
        sumInput.value = this.reference;
        const sumCnt = $('#referenceSummaryCounter');
        if (sumCnt) sumCnt.textContent = `${this.reference.length}/80`;
      }
    });
  }

  // =======================
  // RENDER DE PREGUNTAS
  // =======================

  async _renderCurrentQuestion() {
    if (this.currentQuestionIndex >= this.questions.length) {
      await this._showSummary();
      return;
    }

    const question = this.questions[this.currentQuestionIndex];
    const questionContainer = $('#questionContainer');
    if (!questionContainer) return;

    console.log(
      `📝 [SurveyDetailView] Renderizando pregunta ${this.currentQuestionIndex + 1}:`,
      question.vcQuestion,
    );

    const questionNum = $('#currentQuestionNum');
    if (questionNum) questionNum.textContent = this.currentQuestionIndex + 1;

    let questionHTML = '';
    switch (question.iTypeId) {
      case 1:
        questionHTML = this._renderRadioQuestion(question);
        break;
      case 2:
        questionHTML = this._renderCheckboxQuestion(question);
        break;
      case 3:
        questionHTML = this._renderTextQuestion(question);
        break;
      case 4:
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
        <div class="question-content">${questionHTML}</div>
      </div>
    `;

    this._attachQuestionEvents(question);
    this._restoreQuestionResponse(question);
    this._updateNavigationButtons();
    questionContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
    await hapticsService.light();
  }

  _renderRadioQuestion(question) {
    if (!question.answers || question.answers.length === 0) {
      return '<div class="error">No hay opciones disponibles para esta pregunta</div>';
    }
    return `<div class="options-container radio-container">${question.answers
      .map(
        answer => `
      <div class="option-item radio-option">
        <label class="option-label">
          <input type="radio" name="question_${question.iQuestionId}" value="${
          answer.iAnswerId
        }" class="option-input radio-input" data-needs-text="${answer.bText}">
          <div class="option-content">
            <div class="radio-indicator"></div>
            <span class="option-text">${answer.vcAnswer || 'Opción sin texto'}</span>
          </div>
        </label>
        ${
          answer.bText
            ? `
          <div class="option-text-input" style="display: none;">
            <textarea placeholder="Proporciona detalles adicionales..." maxlength="500" class="additional-text" data-answer-id="${answer.iAnswerId}"></textarea>
          </div>`
            : ''
        }
      </div>`,
      )
      .join('')}
    </div>`;
  }

  _renderCheckboxQuestion(question) {
    if (!question.answers || question.answers.length === 0) {
      return '<div class="error">No hay opciones disponibles para esta pregunta</div>';
    }
    return `
      <div class="options-container checkbox-container">
        <div class="checkbox-helper"><small>Puedes seleccionar múltiples opciones</small></div>
        ${question.answers
          .map(
            answer => `
          <div class="option-item checkbox-option">
            <label class="option-label">
              <input type="checkbox" name="question_${question.iQuestionId}" value="${
              answer.iAnswerId
            }" class="option-input checkbox-input" data-needs-text="${answer.bText}">
              <div class="option-content">
                <div class="checkbox-indicator"><svg class="check-icon" width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M20 6L9 17L4 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
                <span class="option-text">${answer.vcAnswer || 'Opción sin texto'}</span>
              </div>
            </label>
            ${
              answer.bText
                ? `
              <div class="option-text-input" style="display: none;">
                <textarea placeholder="Proporciona detalles adicionales..." maxlength="500" class="additional-text" data-answer-id="${answer.iAnswerId}"></textarea>
              </div>`
                : ''
            }
          </div>`,
          )
          .join('')}
      </div>`;
  }

  _renderTextQuestion(question) {
    return `
      <div class="text-input-container">
        <textarea id="textAnswer_${question.iQuestionId}" placeholder="Escribe tu respuesta aquí..." maxlength="1024" class="text-answer-input" rows="4"></textarea>
        <div class="text-counter"><span class="current">0</span>/<span class="max">1024</span> caracteres</div>
      </div>`;
  }

  _renderNumericQuestion(question) {
    const min = question.iMin || 0;
    const max = question.iMax || 10;
    const range = max - min;
    const initialValue = Math.round((min + max) / 2);
    let marks = [];
    if (range <= 10) {
      for (let i = min; i <= max; i++) marks.push(i);
    } else {
      marks = [min, Math.round((min + max) / 2), max];
    }
    return `
      <div class="numeric-input-container">
        <div class="slider-container">
          <div class="slider-track">
            <div class="slider-fill" id="sliderFill_${question.iQuestionId}"></div>
            <div class="slider-marks">${marks
              .map(
                mark =>
                  `<div class="slider-mark" style="left: ${
                    ((mark - min) / range) * 100
                  }%;"><div class="mark-line"></div><div class="mark-label">${mark}</div></div>`,
              )
              .join('')}</div>
          </div>
          <input type="range" id="numericSlider_${
            question.iQuestionId
          }" min="${min}" max="${max}" value="${initialValue}" class="numeric-slider">
        </div>
        <div class="slider-value">
          <span class="value-label">Valor seleccionado:</span>
          <span class="value-display" id="valueDisplay_${
            question.iQuestionId
          }">${initialValue}</span>
        </div>
      </div>`;
  }

  // =======================
  // EVENTOS POR TIPO
  // =======================

  _attachQuestionEvents(question) {
    switch (question.iTypeId) {
      case 1:
        this._attachRadioEvents(question);
        break;
      case 2:
        this._attachCheckboxEvents(question);
        break;
      case 3:
        this._attachTextEvents(question);
        break;
      case 4:
        this._attachNumericEvents(question);
        break;
    }
  }

  _attachRadioEvents(question) {
    const radioInputs = document.querySelectorAll(
      `input[name="question_${question.iQuestionId}"][type="radio"]`,
    );
    radioInputs.forEach(input => {
      input.addEventListener('change', async () => {
        await hapticsService.light();
        const needsText = input.dataset.needsText === 'true';
        const answerId = parseInt(input.value);
        document
          .querySelectorAll(
            `.question-wrapper[data-question-id="${question.iQuestionId}"] .option-text-input`,
          )
          .forEach(container => {
            container.style.display = 'none';
            const textarea = container.querySelector('textarea');
            if (textarea) textarea.value = '';
          });
        if (needsText) {
          const textContainer = document.querySelector(
            `.option-text-input textarea[data-answer-id="${answerId}"]`,
          )?.parentElement;
          if (textContainer) {
            textContainer.style.display = 'block';
            textContainer.querySelector('textarea')?.focus();
          }
        }
        this._saveResponse(question.iQuestionId, {
          typeId: 1,
          questionId: question.iQuestionId,
          answerId,
          extraText: needsText ? '' : undefined,
        });
        this._updateNavigationButtons();
      });
    });
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
            answerId,
            extraText: textarea.value,
          });
          this._updateNavigationButtons();
        }
      });
    });
  }

  _attachCheckboxEvents(question) {
    const checkboxInputs = document.querySelectorAll(
      `input[name="question_${question.iQuestionId}"][type="checkbox"]`,
    );
    checkboxInputs.forEach(input => {
      input.addEventListener('change', async () => {
        await hapticsService.light();
        const answerId = parseInt(input.value);
        const needsText = input.dataset.needsText === 'true';
        const textContainer = document.querySelector(
          `.option-text-input textarea[data-answer-id="${answerId}"]`,
        )?.parentElement;
        if (input.checked && needsText && textContainer) {
          textContainer.style.display = 'block';
          textContainer.querySelector('textarea')?.focus();
        } else if (!input.checked && textContainer) {
          textContainer.style.display = 'none';
          const textarea = textContainer.querySelector('textarea');
          if (textarea) textarea.value = '';
        }
        this._updateCheckboxResponse(question);
        this._updateNavigationButtons();
      });
    });
    const textareas = document.querySelectorAll('.checkbox-container .additional-text');
    textareas.forEach(textarea => {
      textarea.addEventListener('input', () => {
        this._updateCheckboxResponse(question);
        this._updateNavigationButtons();
      });
    });
  }

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
          if (textarea) extraText = textarea.value;
        }
        selectedAnswers.push({
          answerId,
          extraText: needsText ? extraText : undefined,
        });
      }
    });
    this._saveResponse(question.iQuestionId, {
      typeId: 2,
      questionId: question.iQuestionId,
      selectedAnswers,
    });
  }

  _attachTextEvents(question) {
    const textarea = $(`#textAnswer_${question.iQuestionId}`);
    const counter = document.querySelector('.text-counter .current');
    if (textarea) {
      textarea.addEventListener('input', () => {
        const text = textarea.value;
        if (counter) counter.textContent = text.length;
        this._saveResponse(question.iQuestionId, {
          typeId: 3,
          questionId: question.iQuestionId,
          text,
        });
        this._updateNavigationButtons();
      });
    }
  }

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
        if (valueDisplay) valueDisplay.textContent = value;
        if (sliderFill) sliderFill.style.width = `${percentage}%`;
        this._saveResponse(question.iQuestionId, {
          typeId: 4,
          questionId: question.iQuestionId,
          value,
        });
        this._updateNavigationButtons();
      });
    }
  }

  // =======================
  // NAVEGACIÓN + VALIDACIÓN
  // =======================

  async _previousQuestion() {
    if (this.currentQuestionIndex > 0) {
      await hapticsService.light();
      this.currentQuestionIndex--;
      await this._renderCurrentQuestion();
    }
  }

  async _nextQuestion() {
    const current = this.questions[this.currentQuestionIndex];
    if (!this._isQuestionAnswered(current)) {
      await this._warnRequired(current);
      return;
    }
    if (this.currentQuestionIndex < this.questions.length - 1) {
      await hapticsService.light();
      this.currentQuestionIndex++;
      await this._renderCurrentQuestion();
    } else {
      await this._showSummary();
    }
  }

  _updateNavigationButtons() {
    const prevBtn = $('#prevBtn');
    const nextBtn = $('#nextBtn');
    const submitBtn = $('#submitBtn');
    if (prevBtn) {
      prevBtn.disabled = this.currentQuestionIndex === 0;
      prevBtn.style.display = this.currentQuestionIndex === 0 ? 'none' : 'flex';
    }
    const isLast = this.currentQuestionIndex === this.questions.length - 1;
    if (nextBtn) nextBtn.style.display = isLast ? 'none' : 'flex';
    if (submitBtn) submitBtn.style.display = isLast ? 'flex' : 'none';
    const current = this.questions[this.currentQuestionIndex];
    const answered = this._isQuestionAnswered(current);
    if (nextBtn && !isLast) nextBtn.disabled = !answered;
    if (submitBtn && isLast) submitBtn.disabled = !answered;
  }

  _isQuestionAnswered(question) {
    const resp = this.responses.get(question.iQuestionId);
    if (!resp) return false;
    switch (question.iTypeId) {
      case 1: {
        if (typeof resp.answerId !== 'number') return false;
        const ans = (question.answers || []).find(a => a.iAnswerId === resp.answerId);
        if (ans?.bText) return !!resp.extraText && resp.extraText.trim().length > 0;
        return true;
      }
      case 2: {
        if (!resp.selectedAnswers || resp.selectedAnswers.length === 0) return false;
        for (const sel of resp.selectedAnswers) {
          const ans = (question.answers || []).find(a => a.iAnswerId === sel.answerId);
          if (ans?.bText && (!sel.extraText || !sel.extraText.trim())) return false;
        }
        return true;
      }
      case 3:
        return !!resp.text && resp.text.trim().length > 0;
      case 4:
        return typeof resp.value === 'number' && !Number.isNaN(resp.value);
      default:
        return false;
    }
  }

  async _warnRequired(question) {
    await hapticsService.error();
    const msg =
      'Esta pregunta es obligatoria.' +
      (question.iTypeId === 2
        ? '\nSelecciona al menos una opción (y llena los campos de texto requeridos).'
        : question.iTypeId === 1
        ? '\nSelecciona una opción (y llena el texto si es requerido).'
        : '');
    await dialogService.alert('Pregunta obligatoria', msg);
  }

  // =======================
  // RESPUESTAS (restore/save)
  // =======================

  _saveResponse(questionId, response) {
    this.responses.set(questionId, response);
  }

  _restoreQuestionResponse(question) {
    const response = this.responses.get(question.iQuestionId);
    if (!response) return;
    switch (question.iTypeId) {
      case 1: {
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
              if (textarea) textarea.value = response.extraText;
            }, 100);
          }
        }
        break;
      }
      case 2: {
        if (response.selectedAnswers && Array.isArray(response.selectedAnswers)) {
          response.selectedAnswers.forEach(selected => {
            const checkbox = document.querySelector(
              `input[name="question_${question.iQuestionId}"][value="${selected.answerId}"]`,
            );
            if (checkbox) {
              checkbox.checked = true;
              checkbox.dispatchEvent(new Event('change'));
              if (selected.extraText) {
                setTimeout(() => {
                  const textarea = document.querySelector(
                    `.additional-text[data-answer-id="${selected.answerId}"]`,
                  );
                  if (textarea) textarea.value = selected.extraText;
                }, 100);
              }
            }
          });
        }
        break;
      }
      case 3: {
        const textarea = $(`#textAnswer_${question.iQuestionId}`);
        if (textarea && response.text) {
          textarea.value = response.text;
          textarea.dispatchEvent(new Event('input'));
        }
        break;
      }
      case 4: {
        const slider = $(`#numericSlider_${question.iQuestionId}`);
        if (slider && response.value !== undefined) {
          slider.value = response.value;
          slider.dispatchEvent(new Event('input'));
        }
        break;
      }
    }
  }

  // =======================
  // TIMER
  // =======================

  _initializeTimer() {
    this.timeRemaining = this.survey.iTimer * 60;
    this.timer = setInterval(() => {
      this.timeRemaining--;
      this._updateTimerDisplay();
      if (this.timeRemaining <= 0) this._handleTimeUp();
    }, 1000);
  }

  _updateTimerDisplay() {
    const timerText = $('#timerText');
    if (timerText) {
      timerText.textContent = this._formatTime(this.timeRemaining);
      const timerDisplay = $('#timerDisplay');
      if (timerDisplay) {
        if (this.timeRemaining <= 60) timerDisplay.classList.add('warning');
        else if (this.timeRemaining <= 300) timerDisplay.classList.add('caution');
      }
    }
  }

  async _handleTimeUp() {
    this._clearTimer();
    this.isTimeUp = true;
    await hapticsService.error();
    document
      .querySelectorAll('input, textarea, button:not(#backBtn)')
      .forEach(input => (input.disabled = true));
    const overlay = document.createElement('div');
    overlay.className = 'time-up-overlay';
    overlay.innerHTML = `
      <div class="time-up-content">
        <div class="time-up-icon">⏰</div>
        <h3>Tiempo Finalizado</h3>
        <p>El tiempo para completar esta encuesta ha terminado.</p>
        <button class="finish-btn" onclick="this.parentElement.parentElement.remove()">Entendido</button>
      </div>`;
    document.body.appendChild(overlay);
  }

  _clearTimer() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  _formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  // =======================
  // RESUMEN / ENVÍO
  // =======================

  async _showSummary() {
    if (this.responses.size < this.questions.length) {
      const firstMissingIdx = this.questions.findIndex(q => !this._isQuestionAnswered(q));
      if (firstMissingIdx !== -1) {
        this.currentQuestionIndex = firstMissingIdx;
        await this._renderCurrentQuestion();
        await this._warnRequired(this.questions[firstMissingIdx]);
        return;
      }
    }

    const questionContainer = $('#questionContainer');
    if (!questionContainer) return;

    const totalQuestions = this.questions.length;
    const answeredQuestions = this.responses.size;
    const completionPercentage = Math.round((answeredQuestions / totalQuestions) * 100);
    const refVal = this.reference || '';

    questionContainer.innerHTML = `
      <div class="survey-summary">
        <div class="summary-header">
          <div class="summary-icon">📊</div>
          <h2>Resumen de Respuestas</h2>
          <p>Revisa tus respuestas antes de enviar</p>
        </div>
        <div class="reference-summary">
          <label for="referenceSummaryInput" class="reference-label">Referencia (opcional)</label>
          <input id="referenceSummaryInput" class="reference-input" type="text" maxlength="80" aria-label="Referencia" placeholder="Ej. nombre, folio o nota breve" value="${refVal.replace(
            /"/g,
            '&quot;',
          )}"/>
          <div class="reference-hint"><small id="referenceSummaryCounter">${
            refVal.length
          }/80</small></div>
        </div>
        <div class="completion-stats">
          <div class="completion-bar"><div class="completion-fill" style="width: ${completionPercentage}%"></div></div>
          <div class="completion-text">${answeredQuestions} de ${totalQuestions} preguntas respondidas (${completionPercentage}%)</div>
        </div>
        <div class="responses-list">${this._generateResponsesSummary()}</div>
        <div class="summary-actions">
          <button class="review-btn" id="reviewBtn">📝 Revisar Respuestas</button>
          <button class="submit-btn" id="finalSubmitBtn">${this._getSubmitIcon()}<span>Enviar Encuesta</span></button>
        </div>
      </div>`;

    $('#reviewBtn')?.addEventListener('click', () => {
      this.currentQuestionIndex = 0;
      this._renderCurrentQuestion();
    });
    $('#finalSubmitBtn')?.addEventListener('click', () => this._submitSurvey());

    const refSum = $('#referenceSummaryInput');
    if (refSum) {
      refSum.addEventListener('input', () => {
        this.reference = refSum.value;
        const cnt = $('#referenceSummaryCounter');
        if (cnt) cnt.textContent = `${this.reference.length}/80`;
        const headerRef = $('#referenceInput');
        if (headerRef && headerRef.value !== this.reference) {
          headerRef.value = this.reference;
          const headerCnt = $('#referenceCounter');
          if (headerCnt) headerCnt.textContent = `${this.reference.length}/80`;
        }
      });
    }

    ['#prevBtn', '#nextBtn', '#submitBtn'].forEach(sel => {
      const btn = document.querySelector(sel);
      if (btn) btn.style.display = 'none';
    });
  }

  _generateResponsesSummary() {
    return this.questions
      .map((question, index) => {
        const response = this.responses.get(question.iQuestionId);
        let responseText = '<span class="no-response">Sin respuesta</span>';
        if (response) {
          switch (question.iTypeId) {
            case 1: {
              const ans = question.answers?.find(a => a.iAnswerId === response.answerId);
              responseText = ans ? ans.vcAnswer : 'Respuesta no válida';
              if (response.extraText)
                responseText += `<br><small class="extra-text">"${response.extraText}"</small>`;
              break;
            }
            case 2: {
              if (response.selectedAnswers?.length > 0) {
                const items = response.selectedAnswers.map(sel => {
                  const ans = question.answers?.find(a => a.iAnswerId === sel.answerId);
                  let txt = ans ? ans.vcAnswer : 'Opción no válida';
                  if (sel.extraText) txt += ` ("${sel.extraText}")`;
                  return txt;
                });
                responseText = '• ' + items.join('<br>• ');
              }
              break;
            }
            case 3:
              responseText = response.text || '<span class="no-response">Sin respuesta</span>';
              break;
            case 4:
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
        </div>`;
      })
      .join('');
  }

  _buildSubmissionPayload() {
    const answers = this.questions.map((q, idx) => {
      const resp = this.responses.get(q.iQuestionId) || null;
      return this._mapAnswerForSubmit(q, resp, idx);
    });
    return {
      surveyId: this.surveyId,
      reference: this.reference && this.reference.trim() ? this.reference.trim() : null,
      answers,
    };
  }

  _mapAnswerForSubmit(question, response, index) {
    const base = {
      questionId: question.iQuestionId,
      index: index + 1,
      typeId: question.iTypeId,
      type: question.vcType || '',
      questionText: question.vcQuestion || '',
    };
    if (!response) return { ...base, unanswered: true, response: null };
    switch (question.iTypeId) {
      case 1:
        return {
          ...base,
          unanswered: false,
          response: {
            typeId: 1,
            answers: [
              {
                answerId: response.answerId,
                ...(response.extraText ? { extraText: response.extraText } : {}),
              },
            ],
          },
        };
      case 2:
        return {
          ...base,
          unanswered: false,
          response: {
            typeId: 2,
            answers: (response.selectedAnswers || []).map(a => ({
              answerId: a.answerId,
              ...(a.extraText ? { extraText: a.extraText } : {}),
            })),
          },
        };
      case 3:
        return {
          ...base,
          unanswered: !response.text || response.text.trim() === '',
          response: { typeId: 3, text: response.text || '' },
        };
      case 4:
        return {
          ...base,
          unanswered: typeof response.value !== 'number',
          response: { typeId: 4, value: response.value },
        };
      default:
        return { ...base, unanswered: true, response: null };
    }
  }

  async _submitSurvey() {
    if (this.isSubmitting) return;
    try {
      if (this.questions.filter(q => !this.responses.has(q.iQuestionId)).length > 0) {
        await dialogService.alert(
          'Preguntas pendientes',
          'Debes responder todas las preguntas antes de enviar.',
        );
        return;
      }
      this.isSubmitting = true;
      const finalBtn = document.getElementById('finalSubmitBtn') || this.submitBtn;
      if (finalBtn) {
        finalBtn.disabled = true;
        finalBtn.innerHTML = `<div class="loading-spinner"></div><span>Enviando...</span>`;
      }
      const payload = this._buildSubmissionPayload();
      console.log('📦 [SurveyDetailView] Payload a enviar (Answer):', payload);
      const result = await surveysService.submitAnswers(payload);
      if (!result.success) throw new Error(result.error || 'Error enviando encuesta');
      await dialogService.alert(
        'Encuesta enviada',
        '¡Gracias por tu participación! Tu encuesta fue registrada correctamente.',
      );
      navigateTo('/surveys');
    } catch (error) {
      console.error('❌ [SurveyDetailView] Error enviando encuesta:', error);
      await hapticsService.error();
      const finalBtn = document.getElementById('finalSubmitBtn') || this.submitBtn;
      if (finalBtn) {
        finalBtn.disabled = false;
        finalBtn.innerHTML = `${this._getSubmitIcon()}<span>Enviar Encuesta</span>`;
      }
      window.mostrarMensajeEstado?.('Error enviando la encuesta. Intenta nuevamente.', 'error');
    } finally {
      this.isSubmitting = false;
    }
  }

  // =======================
  // SETUP DOM + LISTENERS
  // =======================

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

  _attachEventListeners() {
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
    if (this.prevBtn)
      this.prevBtn.addEventListener('click', e => {
        e.preventDefault();
        this._previousQuestion();
      });
    if (this.nextBtn)
      this.nextBtn.addEventListener('click', e => {
        e.preventDefault();
        this._nextQuestion();
      });
    if (this.submitBtn) {
      this.submitBtn.addEventListener('click', async e => {
        e.preventDefault();
        const current = this.questions[this.currentQuestionIndex];
        if (!this._isQuestionAnswered(current)) {
          await this._warnRequired(current);
          return;
        }
        await this._showSummary();
      });
    }
  }

  _updateLoadingState(isLoading, message = 'Cargando...') {
    if (this.loadingContainer) {
      this.loadingContainer.style.display = isLoading ? 'flex' : 'none';
      const loadingText = this.loadingContainer.querySelector('.loading-text');
      if (loadingText) loadingText.textContent = message;
    }
    if (this.contentContainer) this.contentContainer.style.display = isLoading ? 'none' : 'block';
  }

  _showError(message) {
    if (this.errorContainer) {
      this.errorContainer.innerHTML = `
        <div class="error-content">
          <div class="error-icon">⚠️</div>
          <h3>Error</h3>
          <p>${message}</p>
          <p><strong>Survey ID:</strong> ${this.surveyId}</p>
          <p><strong>URL:</strong> ${window.location.hash}</p>
          <button class="back-to-surveys-btn" onclick="window.location.hash='#/surveys'">Volver a Encuestas</button>
        </div>`;
      this.errorContainer.style.display = 'flex';
    }
    this._updateLoadingState(false);
    if (this.contentContainer) this.contentContainer.style.display = 'none';
  }

  // =======================
  // HELPERS
  // =======================

  _extractSurveyId(context) {
    const tryParse = val => {
      if (val === undefined || val === null) return null;
      const s = String(val);
      const m = s.match(/(?:^|\/)(\d+)(?:[\/\?]|$)/);
      if (!m) return null;
      const n = parseInt(m[1], 10);
      return Number.isFinite(n) ? n : null;
    };
    return (
      tryParse(context?.params?.data?.id) ||
      tryParse(context?.data?.id) ||
      tryParse(context?.id) ||
      tryParse(context?.params?.url) ||
      tryParse(context?.url) ||
      tryParse(window.location.hash) ||
      tryParse(history?.state?.surveyId) ||
      tryParse(sessionStorage.getItem('currentSurveyId')) ||
      tryParse(sessionStorage.getItem('lastSurveyId')) ||
      null
    );
  }

  // =======================
  // ICONOS
  // =======================

  _getBackIcon() {
    return `<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M19 12H5M12 19L5 12L12 5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  }
  _getPrevIcon() {
    return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M15 18L9 12L15 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  }
  _getNextIcon() {
    return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M9 18L15 12L9 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  }
  _getSubmitIcon() {
    return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M22 2L11 13M22 2L15 22L11 13M22 2L2 9L11 13" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  }
}
