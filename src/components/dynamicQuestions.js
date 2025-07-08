// src/components/dynamicQuestions.js

import { hapticsService } from '../services/haptics.service.js';
import './dynamicQuestions.less';

export class DynamicQuestions {
  constructor(containerId, questions = []) {
    this.container = document.getElementById(containerId);
    this.questions = questions;
    this.answers = new Map();
    this.currentStep = 0;
    this.onChangeCallback = null;
  }

  // Inicializar el componente
  init() {
    if (!this.container || !this.questions.length) return;

    this.render();
    this.attachEventListeners();
  }

  // Renderizar las preguntas en formato acordeón/stepper
  render() {
    const html = `
      <div class="questions-container">
        <div class="questions-header">
          <h3>Preguntas adicionales</h3>
          <span class="questions-progress">${this.getAnsweredCount()} de ${
      this.questions.length
    }</span>
        </div>
        
        <div class="questions-stepper">
          ${this.questions.map((q, index) => this.renderQuestion(q, index)).join('')}
        </div>
        
        <div class="questions-summary" id="questionsSummary" style="display: none;">
          <h4>Resumen de respuestas</h4>
          <div class="summary-content" id="summaryContent"></div>
        </div>
      </div>
    `;

    this.container.innerHTML = html;
    this.updateProgress();
  }

  // Renderizar una pregunta individual
  renderQuestion(questionData, index) {
    const question = questionData.Questions[0];
    const answers = questionData.Answers;
    const isAnswered = this.answers.has(question.iQuestionId);
    const isActive = index === this.currentStep;

    return `
      <div class="question-item ${isActive ? 'active' : ''} ${isAnswered ? 'answered' : ''}" 
           data-question-id="${question.iQuestionId}" 
           data-index="${index}">
        
        <div class="question-header" data-index="${index}">
          <div class="question-indicator">
            ${
              isAnswered
                ? '<span class="check-icon">✓</span>'
                : `<span class="question-number">${index + 1}</span>`
            }
          </div>
          <div class="question-text">
            <p>${question.vcQuestion}</p>
            ${
              isAnswered
                ? `<small class="answer-preview">${this.getAnswerPreview(
                    question.iQuestionId,
                  )}</small>`
                : ''
            }
          </div>
          <div class="question-toggle">
            <svg class="chevron-icon" width="24" height="24" viewBox="0 0 24 24">
              <path d="M7 10l5 5 5-5z" fill="currentColor"/>
            </svg>
          </div>
        </div>
        
        <div class="question-content" ${!isActive ? 'style="display: none;"' : ''}>
          <div class="answers-grid">
            ${answers.map(answer => this.renderAnswer(question.iQuestionId, answer)).join('')}
          </div>
        </div>
      </div>
    `;
  }

  // Renderizar una respuesta
  renderAnswer(questionId, answer) {
    const needsText = answer.bText;
    const answerId = answer.iAnswerId;
    const currentAnswer = this.answers.get(questionId);
    const isSelected = currentAnswer?.iAnswerId === answerId;

    return `
      <div class="answer-option ${isSelected ? 'selected' : ''} ${needsText ? 'with-text' : ''}" 
           data-question-id="${questionId}" 
           data-answer-id="${answerId}"
           data-needs-text="${needsText}">
        
        <label class="answer-label">
          <input type="radio" 
                 name="question_${questionId}" 
                 value="${answerId}"
                 ${isSelected ? 'checked' : ''}
                 class="answer-radio">
          
          <div class="answer-content">
            <span class="answer-text">${answer.vcAnswer}</span>
            ${
              needsText
                ? `
              <input type="text" 
                     class="answer-input" 
                     placeholder="Especifique..."
                     value="${
                       isSelected && currentAnswer.vcAnswerText ? currentAnswer.vcAnswerText : ''
                     }"
                     ${!isSelected ? 'disabled' : ''}>
            `
                : ''
            }
          </div>
        </label>
      </div>
    `;
  }

  // Adjuntar event listeners
  attachEventListeners() {
    // Click en headers de preguntas
    this.container.querySelectorAll('.question-header').forEach(header => {
      header.addEventListener('click', async e => {
        const index = parseInt(header.dataset.index);
        await this.goToQuestion(index);
      });
    });

    // Cambio en respuestas
    this.container.querySelectorAll('.answer-option').forEach(option => {
      option.addEventListener('click', async e => {
        if (e.target.matches('input[type="text"]')) return; // No hacer nada si es el input de texto

        const radio = option.querySelector('.answer-radio');
        if (radio && !radio.checked) {
          radio.checked = true;
          await this.handleAnswerSelection(option);
        }
      });
    });

    // Input de texto en respuestas
    this.container.querySelectorAll('.answer-input').forEach(input => {
      input.addEventListener('input', e => {
        this.updateTextAnswer(e.target);
      });

      // Prevenir propagación del click
      input.addEventListener('click', e => {
        e.stopPropagation();
      });
    });
  }

  // Manejar selección de respuesta
  async handleAnswerSelection(option) {
    await hapticsService.light();

    const questionId = parseInt(option.dataset.questionId);
    const answerId = parseInt(option.dataset.answerId);
    const needsText = option.dataset.needsText === 'true';

    // Actualizar UI
    option.parentElement.querySelectorAll('.answer-option').forEach(opt => {
      opt.classList.remove('selected');
      const input = opt.querySelector('.answer-input');
      if (input) input.disabled = true;
    });

    option.classList.add('selected');

    // Habilitar input de texto si es necesario
    if (needsText) {
      const textInput = option.querySelector('.answer-input');
      if (textInput) {
        textInput.disabled = false;
        textInput.focus();
      }
    }

    // Guardar respuesta
    this.answers.set(questionId, {
      iAnswerId: answerId,
      vcAnswerText: needsText ? '' : null,
    });

    // Actualizar progreso
    this.updateProgress();

    // Si no necesita texto, avanzar a la siguiente pregunta
    if (!needsText) {
      setTimeout(() => this.goToNextQuestion(), 300);
    }

    // Callback
    if (this.onChangeCallback) {
      this.onChangeCallback(this.getFormattedAnswers());
    }
  }

  // Actualizar respuesta de texto
  updateTextAnswer(input) {
    const option = input.closest('.answer-option');
    const questionId = parseInt(option.dataset.questionId);
    const answer = this.answers.get(questionId);

    if (answer) {
      answer.vcAnswerText = input.value;

      // Actualizar preview
      this.updateAnswerPreview(questionId);

      // Callback
      if (this.onChangeCallback) {
        this.onChangeCallback(this.getFormattedAnswers());
      }
    }
  }

  // Ir a una pregunta específica
  async goToQuestion(index) {
    if (index < 0 || index >= this.questions.length) return;

    await hapticsService.light();

    // Cerrar pregunta actual
    const currentItem = this.container.querySelector('.question-item.active');
    if (currentItem) {
      currentItem.classList.remove('active');
      const content = currentItem.querySelector('.question-content');
      if (content) content.style.display = 'none';
    }

    // Abrir nueva pregunta
    const newItem = this.container.querySelector(`.question-item[data-index="${index}"]`);
    if (newItem) {
      newItem.classList.add('active');
      const content = newItem.querySelector('.question-content');
      if (content) {
        content.style.display = 'block';
        // Smooth scroll
        newItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }

    this.currentStep = index;
  }

  // Ir a la siguiente pregunta
  async goToNextQuestion() {
    if (this.currentStep < this.questions.length - 1) {
      await this.goToQuestion(this.currentStep + 1);
    } else {
      // Si es la última pregunta, mostrar resumen
      this.showSummary();
    }
  }

  // Mostrar resumen
  showSummary() {
    const summaryEl = document.getElementById('questionsSummary');
    const contentEl = document.getElementById('summaryContent');

    if (!summaryEl || !contentEl) return;

    const summaryHtml = this.questions
      .map((q, index) => {
        const question = q.Questions[0];
        const answer = this.answers.get(question.iQuestionId);

        if (!answer) return '';

        const selectedAnswer = q.Answers.find(a => a.iAnswerId === answer.iAnswerId);

        return `
        <div class="summary-item">
          <p class="summary-question">${index + 1}. ${question.vcQuestion}</p>
          <p class="summary-answer">
            ${selectedAnswer?.vcAnswer || ''}
            ${answer.vcAnswerText ? `: ${answer.vcAnswerText}` : ''}
          </p>
        </div>
      `;
      })
      .filter(html => html)
      .join('');

    contentEl.innerHTML = summaryHtml;
    summaryEl.style.display = 'block';
    summaryEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  // Actualizar progreso
  updateProgress() {
    const progressEl = this.container.querySelector('.questions-progress');
    if (progressEl) {
      progressEl.textContent = `${this.getAnsweredCount()} de ${this.questions.length}`;
    }

    // Actualizar estado de las preguntas
    this.questions.forEach((q, index) => {
      const question = q.Questions[0];
      const item = this.container.querySelector(`.question-item[data-index="${index}"]`);

      if (item) {
        if (this.answers.has(question.iQuestionId)) {
          item.classList.add('answered');
          // Actualizar preview
          this.updateAnswerPreview(question.iQuestionId);
        } else {
          item.classList.remove('answered');
        }
      }
    });
  }

  // Actualizar preview de respuesta
  updateAnswerPreview(questionId) {
    const item = this.container.querySelector(`.question-item[data-question-id="${questionId}"]`);
    if (!item) return;

    const previewEl = item.querySelector('.answer-preview');
    if (previewEl) {
      previewEl.textContent = this.getAnswerPreview(questionId);
    }
  }

  // Obtener preview de respuesta
  getAnswerPreview(questionId) {
    const answer = this.answers.get(questionId);
    if (!answer) return '';

    const questionData = this.questions.find(q => q.Questions[0].iQuestionId === questionId);
    if (!questionData) return '';

    const selectedAnswer = questionData.Answers.find(a => a.iAnswerId === answer.iAnswerId);
    let preview = selectedAnswer?.vcAnswer || '';

    if (answer.vcAnswerText) {
      preview += `: ${answer.vcAnswerText}`;
    }

    return preview.length > 50 ? preview.substring(0, 47) + '...' : preview;
  }

  // Obtener cantidad de respuestas
  getAnsweredCount() {
    return this.answers.size;
  }

  // Verificar si todas las preguntas están respondidas
  isComplete() {
    return this.getAnsweredCount() === this.questions.length;
  }

  // Obtener respuestas formateadas
  getFormattedAnswers() {
    return Array.from(this.answers.entries()).map(([questionId, answer]) => ({
      Question: {
        iQuestionId: questionId,
        SelectedAnswer: answer,
      },
    }));
  }

  // Establecer callback para cambios
  onChange(callback) {
    this.onChangeCallback = callback;
  }

  // Validar respuestas
  validate() {
    const unanswered = [];

    this.questions.forEach((q, index) => {
      const question = q.Questions[0];
      const answer = this.answers.get(question.iQuestionId);

      if (!answer) {
        unanswered.push({ index, question: question.vcQuestion });
      } else if (answer.vcAnswerText !== null && !answer.vcAnswerText.trim()) {
        // Si requiere texto y está vacío
        unanswered.push({ index, question: question.vcQuestion, needsText: true });
      }
    });

    return {
      isValid: unanswered.length === 0,
      unanswered,
    };
  }

  // Limpiar respuestas
  clear() {
    this.answers.clear();
    this.currentStep = 0;
    this.render();
    this.attachEventListeners();
  }
}
