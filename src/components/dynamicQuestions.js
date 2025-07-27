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

  init() {
    if (!this.container || !this.questions.length) return;
    this.render();
    this.attachEventListeners();
  }

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
          ${this.questions.map((q, idx) => this.renderQuestion(q, idx)).join('')}
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
            ${answers.map(a => this.renderAnswer(question.iQuestionId, a)).join('')}
          </div>
        </div>
      </div>
    `;
  }

  renderAnswer(questionId, answer) {
    const needsText = answer.bText;
    const answerId = answer.iAnswerId;
    const current = this.answers.get(questionId);
    const isSelected = current?.iAnswerId === answerId;

    return `
      <div class="answer-option ${isSelected ? 'selected' : ''} ${needsText ? 'with-text' : ''}"
           data-question-id="${questionId}"
           data-answer-id="${answerId}"
           data-needs-text="${needsText}">
        <label class="answer-label">
          <input
            type="radio"
            name="question_${questionId}"
            value="${answerId}"
            ${isSelected ? 'checked' : ''}
            class="answer-radio"
          />
          <div class="answer-content">
            <span class="answer-text">${answer.vcAnswer}</span>
            ${
              needsText
                ? `<input
                   type="text"
                   class="answer-input"
                   placeholder="Especifique..."
                   value="${isSelected && current.vcAnswerText ? current.vcAnswerText : ''}"
                   ${!isSelected ? 'disabled' : ''}
                 />`
                : ''
            }
          </div>
        </label>
      </div>
    `;
  }

  attachEventListeners() {
    // Abrir/cerrar cada pregunta
    this.container.querySelectorAll('.question-header').forEach(header => {
      header.addEventListener('click', async () => {
        await this.goToQuestion(+header.dataset.index);
      });
    });

    // Selección de respuesta
    this.container.querySelectorAll('.answer-option').forEach(option => {
      option.addEventListener('click', async e => {
        if (e.target.matches('input[type="text"]')) return;
        const radio = option.querySelector('.answer-radio');
        if (radio && !radio.checked) {
          radio.checked = true;
          await this.handleAnswerSelection(option);
        }
      });
    });

    // Input de texto para respuestas “Otro”
    this.container.querySelectorAll('.answer-input').forEach(input => {
      // Mientras escribe
      input.addEventListener('input', () => this.updateTextAnswer(input));
      // Al perder foco, también refrescamos resumen si está visible
      input.addEventListener('blur', () => this.refreshSummaryIfVisible());
      // No cerrar el acordeón
      input.addEventListener('click', e => e.stopPropagation());
    });
  }

  async handleAnswerSelection(option) {
    await hapticsService.light();
    const qId = +option.dataset.questionId;
    const aId = +option.dataset.answerId;
    const needsText = option.dataset.needsText === 'true';

    // Limpiar selección previa
    option.parentElement.querySelectorAll('.answer-option').forEach(opt => {
      opt.classList.remove('selected');
      const inp = opt.querySelector('.answer-input');
      if (inp) inp.disabled = true;
    });

    // Marcar nueva
    option.classList.add('selected');
    if (needsText) {
      const textInput = option.querySelector('.answer-input');
      textInput.disabled = false;
      textInput.focus();
    }

    // Guardar en mapa
    this.answers.set(qId, {
      iAnswerId: aId,
      vcAnswerText: needsText ? '' : null,
    });

    this.updateProgress();
    if (!needsText) setTimeout(() => this.goToNextQuestion(), 300);

    if (this.onChangeCallback) {
      this.onChangeCallback(this.getFormattedAnswers());
    }
  }

  updateTextAnswer(input) {
    const opt = input.closest('.answer-option');
    const qId = +opt.dataset.questionId;
    const ans = this.answers.get(qId);
    if (ans) {
      ans.vcAnswerText = input.value;
      this.updateAnswerPreview(qId);
      if (this.onChangeCallback) {
        this.onChangeCallback(this.getFormattedAnswers());
      }
    }
  }

  refreshSummaryIfVisible() {
    const sumEl = this.container.querySelector('#questionsSummary');
    if (sumEl && sumEl.style.display !== 'none') {
      this.showSummary();
    }
  }

  async goToQuestion(idx) {
    if (idx < 0 || idx >= this.questions.length) return;
    await hapticsService.light();
    const current = this.container.querySelector('.question-item.active');
    if (current) {
      current.classList.remove('active');
      current.querySelector('.question-content').style.display = 'none';
    }
    const next = this.container.querySelector(`.question-item[data-index="${idx}"]`);
    next.classList.add('active');
    next.querySelector('.question-content').style.display = 'block';
    next.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    this.currentStep = idx;
  }

  async goToNextQuestion() {
    if (this.currentStep < this.questions.length - 1) {
      await this.goToQuestion(this.currentStep + 1);
    } else {
      this.showSummary();
    }
  }

  showSummary() {
    const summaryEl = this.container.querySelector('#questionsSummary');
    const contentEl = this.container.querySelector('#summaryContent');
    if (!summaryEl || !contentEl) return;

    const html = this.questions
      .map((q, i) => {
        const question = q.Questions[0];
        const ans = this.answers.get(question.iQuestionId);
        if (!ans) return '';
        const sel = q.Answers.find(a => a.iAnswerId === ans.iAnswerId);
        return `
          <div class="summary-item">
            <p class="summary-question">${i + 1}. ${question.vcQuestion}</p>
            <p class="summary-answer">
              ${sel?.vcAnswer || ''}${ans.vcAnswerText ? `: ${ans.vcAnswerText}` : ''}
            </p>
          </div>
        `;
      })
      .filter(Boolean)
      .join('');

    contentEl.innerHTML = html;
    summaryEl.style.display = 'block';
    summaryEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  updateProgress() {
    const prog = this.container.querySelector('.questions-progress');
    if (prog) prog.textContent = `${this.getAnsweredCount()} de ${this.questions.length}`;
    this.questions.forEach((q, i) => {
      const qId = q.Questions[0].iQuestionId;
      const item = this.container.querySelector(`[data-question-id="${qId}"]`);
      if (item) {
        const done = this.answers.has(qId);
        item.classList.toggle('answered', done);
        if (done) this.updateAnswerPreview(qId);
      }
    });
  }

  updateAnswerPreview(questionId) {
    const item = this.container.querySelector(`[data-question-id="${questionId}"]`);
    const preview = item?.querySelector('.answer-preview');
    if (preview) preview.textContent = this.getAnswerPreview(questionId);
  }

  getAnswerPreview(questionId) {
    const ans = this.answers.get(questionId);
    if (!ans) return '';
    const qd = this.questions.find(q => q.Questions[0].iQuestionId === questionId);
    const sel = qd?.Answers.find(a => a.iAnswerId === ans.iAnswerId);
    let text = sel?.vcAnswer || '';
    if (ans.vcAnswerText) text += `: ${ans.vcAnswerText}`;
    return text.length > 50 ? text.slice(0, 47) + '...' : text;
  }

  getAnsweredCount() {
    return this.answers.size;
  }

  getFormattedAnswers() {
    return Array.from(this.answers.entries()).map(([qid, ans]) => ({
      Question: { iQuestionId: qid, SelectedAnswer: ans },
    }));
  }

  validate() {
    const unanswered = [];
    this.questions.forEach((q, idx) => {
      const question = q.Questions[0];
      const ans = this.answers.get(question.iQuestionId);
      if (!ans) {
        unanswered.push({ index: idx, question: question.vcQuestion });
      } else if (ans.vcAnswerText !== null && !ans.vcAnswerText.trim()) {
        unanswered.push({ index: idx, question: question.vcQuestion, needsText: true });
      }
    });
    return { isValid: unanswered.length === 0, unanswered };
  }

  onChange(cb) {
    this.onChangeCallback = cb;
  }

  clear() {
    this.answers.clear();
    this.currentStep = 0;
    this.render();
    this.attachEventListeners();
  }
}
