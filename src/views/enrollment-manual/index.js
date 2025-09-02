// src/views/enrollment-manual/index.js

import Handlebars from 'handlebars';
import '../form/style.less';
import './style.less';
import tplSource from './template.hbs?raw';

import { DynamicQuestions } from '../../components/dynamicQuestions.js';
import { navigateTo } from '../../routes/index.js';
import { datosService } from '../../services/datos.service.js';
import { dialogService } from '../../services/dialog.service.js';
import { enrollmentService } from '../../services/enrollment.service.js';
import { hapticsService } from '../../services/haptics.service.js';
import { ROUTES } from '../../utils/constants.js';

import { audioRecorder } from '../../js/audioRecorder.js';
import { signatureManager } from '../../js/signature.js';

import { generateCurp } from '../../utils/curp.helper.js';
import { createElement, debounce, dom } from '../../utils/dom.helper.js';
import { ESTADOS_MEXICO } from '../../utils/estados.js';

import { keyboardService } from '../../services/keyboard.service.js';

const template = Handlebars.compile(tplSource);

export default class EnrollmentManualView {
  constructor() {
    this.dynamicQuestions = null;
    this.questionsData = [];
  }

  render() {
    return template({
      estados: ESTADOS_MEXICO,
    });
  }

  async afterRender() {
    // 1) Referencias DOM
    this._initializeDOMReferences();

    // 2) Eventos
    this._setupEventListeners();

    // 3) Firma y audio
    signatureManager.init();
    await audioRecorder.init();

    // 4) Datos iniciales (estructuras, etc.)
    await this._loadInitialData();

    // 5) Progreso
    this._attachProgressListeners();
    this._updateProgress();

    // 6) CURP inicial
    this._actualizarCurp();

    // 7) Teclado (versión minimal)
    this._initKeyboardMinimal();

    // 8) Preguntas dinámicas
    await this._initializeDynamicQuestions();
  }

  async _initializeDynamicQuestions() {
    try {
      const resp = await datosService.obtenerPreguntas();
      if (resp.success && Array.isArray(resp.data) && resp.data.length) {
        this.questionsData = resp.data;
        dom('#questionsSection').get().style.display = 'block';

        this.dynamicQuestions = new DynamicQuestions(
          'dynamicQuestionsContainer',
          this.questionsData,
        );
        this.dynamicQuestions.init();
        this.dynamicQuestions.onChange(() => this._updateProgress());
      }
    } catch (err) {
      console.error('Error cargando preguntas dinámicas:', err);
    }
  }

  _initializeDOMReferences() {
    this.form = dom('#enrollForm');
    this.backBtn = dom('#backBtn');
    this.submitBtn = dom('#submitBtn');
    this.progressFill = dom('#progressFill');
    this.progressText = dom('#progressText');
    this.estrSelect = dom('#estructura');
    this.subSelect = dom('#subestructura');
    this.nameField = dom('#nombre');
    this.apField = dom('#apellidoPaterno');
    this.amField = dom('#apellidoMaterno');
    this.dateField = dom('#fechaNacimiento');
    this.estadoNacimiento = dom('#estadoNacimiento');
    this.genderM = dom('#hombre');
    this.genderF = dom('#mujer');
    this.curpField = dom('#curp');
    this.recalcCurpBtn = dom('#recalcularCurp');
    this.cpInput = dom('#codigoPostal');
    this.coloniaSelect = dom('#colonia');
    this.calleNumero = dom('#calleNumero');
    this.documentUploadArea = dom('#documentUploadArea');
    this.fileInput = dom('#otherFile');
    this.hiddenOtherData = dom('#otherData');
    this.uploadPlaceholder = dom('#uploadPlaceholder');
    this.documentPreview = dom('#documentPreview');
    this.selectFileBtn = dom('#selectFileBtn');
    this.removeFileBtn = dom('#removeFileBtn');
    this.fileName = dom('#fileName');
    this.fileSize = dom('#fileSize');
    this.previewContent = dom('#previewContent');
    this.clearSigBtn = dom('#clearSignature');
    this.undoSigBtn = dom('#undoSignature');
    this.cameraInput = dom('#cameraInput');
    this.takePhotoBtn = dom('#takePhotoBtn');
  }

  // --- Integración de teclado (minimal) ---
  _initKeyboardMinimal() {
    // Contenedor que scrollea tu formulario
    const scroller = document.querySelector('.form-container');
    // Si el servicio lo soporta, define el contenedor de scroll
    keyboardService.setScrollContainer?.(scroller);

    // Suscríbete a eventos básicos para auto-scroll en focus
    this.keyboardUnsubscribe = keyboardService.subscribe?.((event, data) => {
      if (event === 'focus') {
        keyboardService.scrollToInput?.(data);
      }
    });
  }
  // --- Fin teclado ---

  _setupEventListeners() {
    this.backBtn.on('click', async () => {
      const ok = await this._confirmBackWithData();
      if (ok) {
        await hapticsService.light();
        navigateTo(ROUTES.DASHBOARD);
      }
    });

    this.form.on('submit', e => this.handleSubmit(e));
    this.clearSigBtn.on('click', () => signatureManager.clear());
    this.undoSigBtn.on('click', () => signatureManager.undo());
    this.recalcCurpBtn.on('click', () => this._actualizarCurp());

    this.estrSelect.on('change', async e => {
      const id = e.target.value;
      this.subSelect.html(`<option value="">Sin selección</option>`);
      if (!id) {
        this._updateProgress();
        return;
      }
      const subRes = await datosService.obtenerSubestructuras(id);
      if (subRes.success) {
        subRes.data.forEach(s =>
          this.subSelect
            .get()
            .appendChild(createElement('option', { value: s.iSubCatalogId }, s.vcSubCatalog)),
        );
        this.subSelect.get().disabled = false;
      }
      this._updateProgress();
    });

    this.cpInput.on('blur', async e => {
      const cp = e.target.value.trim();
      if (!cp) {
        this._updateProgress();
        return;
      }
      const colRes = await datosService.obtenerColoniasPorCP(cp);
      if (colRes.success && Array.isArray(colRes.data)) {
        this.coloniaSelect.html(`<option value="">— Selecciona tu colonia —</option>`);
        colRes.data.forEach(c => {
          const opt = createElement(
            'option',
            {
              value: c.vcNeighborhood,
              'data-municipio': c.vcMunicipality,
              'data-estado': c.vcState,
              'data-cp': c.iZipCode,
            },
            c.vcNeighborhood,
          );
          this.coloniaSelect.get().appendChild(opt);
        });
        this.coloniaSelect.get().disabled = false;
      }
      this._updateProgress();
    });

    // auto-recalcular CURP
    const recalcFields = [
      this.nameField,
      this.apField,
      this.amField,
      this.dateField,
      this.estadoNacimiento,
      this.genderM,
      this.genderF,
    ];
    const debouncedRecalc = debounce(() => {
      this._actualizarCurp();
      this._updateProgress();
    }, 300);
    recalcFields.forEach(
      f => f.exists() && f.on('input', debouncedRecalc).on('change', debouncedRecalc),
    );

    // documentos
    this._setupDocumentHandlers();

    // navegación con Enter entre campos
    this.setupKeyboardNavigation();
  }

  setupKeyboardNavigation() {
    const formEl = this.form.get();
    if (!formEl) return;

    const inputs = formEl.querySelectorAll(
      'input:not([type="hidden"]):not([type="file"]), select, textarea',
    );

    inputs.forEach((input, index) => {
      this.optimizeKeyboardType(input);

      input.addEventListener('keydown', e => {
        if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') {
          e.preventDefault();

          let nextIndex = index + 1;
          let nextInput = inputs[nextIndex];
          while (nextInput && nextInput.disabled) {
            nextIndex++;
            nextInput = inputs[nextIndex];
          }

          if (nextInput) {
            nextInput.focus();
            if (nextInput.tagName === 'SELECT') {
              nextInput.click();
            }
          } else {
            keyboardService.hide?.();
            this.submitBtn.get().scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }
      });
    });
  }

  optimizeKeyboardType(input) {
    const fieldOptimizations = {
      nombre: {
        autocapitalize: 'words',
        autocorrect: 'off',
        spellcheck: 'false',
        enterkeyhint: 'next',
      },
      apellidoPaterno: {
        autocapitalize: 'words',
        autocorrect: 'off',
        spellcheck: 'false',
        enterkeyhint: 'next',
      },
      apellidoMaterno: {
        autocapitalize: 'words',
        autocorrect: 'off',
        spellcheck: 'false',
        enterkeyhint: 'next',
      },
      curp: {
        autocapitalize: 'characters',
        autocorrect: 'off',
        spellcheck: 'false',
        inputmode: 'text',
        enterkeyhint: 'next',
      },
      codigoPostal: { inputmode: 'numeric', pattern: '[0-9]*', enterkeyhint: 'next' },
      telefono: { inputmode: 'tel', pattern: '[0-9]*', enterkeyhint: 'next' },
      email: {
        inputmode: 'email',
        autocapitalize: 'off',
        autocorrect: 'off',
        enterkeyhint: 'next',
      },
      calleNumero: { autocapitalize: 'sentences', autocorrect: 'off', enterkeyhint: 'next' },
      observacion: {
        autocapitalize: 'sentences',
        autocorrect: 'on',
        spellcheck: 'true',
        enterkeyhint: 'done',
      },
    };
    const opts = fieldOptimizations[input.id] || { enterkeyhint: 'next' };
    Object.entries(opts).forEach(([k, v]) => input.setAttribute(k, v));
    if (input.tagName === 'INPUT' || input.tagName === 'SELECT') {
      input.style.fontSize = '16px';
    }
  }

  _setupDocumentHandlers() {
    // abrir selector de archivos
    if (this.selectFileBtn.exists())
      this.selectFileBtn.on('click', () => this.fileInput.get().click());

    // disparar cámara en móvil
    if (this.takePhotoBtn.exists())
      this.takePhotoBtn.on('click', () => this.cameraInput.get().click());

    // manejar selección de archivo
    if (this.fileInput.exists())
      this.fileInput.on('change', e => {
        const file = e.target.files[0];
        if (file) this._handleFile(file);
      });

    // manejar foto tomada
    if (this.cameraInput.exists())
      this.cameraInput.on('change', e => {
        const file = e.target.files[0];
        if (file) this._handleFile(file);
      });

    // botón quitar
    if (this.removeFileBtn.exists()) this.removeFileBtn.on('click', () => this._removeFile());

    // drag & drop opcional
    if (this.documentUploadArea.exists()) {
      this.documentUploadArea
        .on('dragover', e => {
          e.preventDefault();
          this.documentUploadArea.addClass('drag-over');
        })
        .on('dragleave', () => this.documentUploadArea.removeClass('drag-over'))
        .on('drop', e => {
          e.preventDefault();
          this.documentUploadArea.removeClass('drag-over');
          const files = e.dataTransfer.files;
          if (files.length) this._handleFile(files[0]);
        });
    }
  }

  async _loadInitialData() {
    const res = await datosService.obtenerEstructuras();
    const estructuraSection = document.getElementById('estructuraSection');
    // Elimina posibles campos ocultos previos
    document.getElementById('estructuraHidden')?.remove();
    document.getElementById('subestructuraHidden')?.remove();

    if (res.success && res.muestraEstructura) {
      estructuraSection.style.display = '';
      // Mostrar selects normales
      const sel = document.getElementById('estructura');
      sel.innerHTML = `<option value="">Sin selección</option>`;
      res.data.forEach(e => {
        sel.innerHTML += `<option value="${e.iCatalogId}">${e.vcCatalog}</option>`;
      });
      document.getElementById(
        'subestructura',
      ).innerHTML = `<option value="">Sin selección</option>`;

      estructuraSection.classList.remove('loading-hidden');
    } else if (res.success && !res.muestraEstructura) {
      // Eliminar la sección completa del DOM
      estructuraSection?.remove();

      // Agregar campos ocultos al formulario
      const form = document.getElementById('enrollForm');
      const hiddenEstructura = document.createElement('input');
      hiddenEstructura.type = 'hidden';
      hiddenEstructura.id = 'estructuraHidden';
      hiddenEstructura.name = 'estructura';
      hiddenEstructura.value = 1;
      form.appendChild(hiddenEstructura);

      const hiddenSubestructura = document.createElement('input');
      hiddenSubestructura.type = 'hidden';
      hiddenSubestructura.id = 'subestructuraHidden';
      hiddenSubestructura.name = 'subestructura';
      hiddenSubestructura.value = 1;
      form.appendChild(hiddenSubestructura);
    }
  }

  _attachProgressListeners() {
    if (!this.form) return;
    const ctrls = this.form.get().querySelectorAll('input, select, textarea');
    ctrls.forEach(el => {
      el.addEventListener('input', () => this._updateProgress());
      el.addEventListener('change', () => this._updateProgress());
    });
  }

  _updateProgress() {
    if (!this.form || !this.progressFill) return;
    const formEl = this.form.get();
    const required = formEl.querySelectorAll('[required]');
    let filled = 0;
    const groups = new Set();

    required.forEach(el => {
      if (el.type === 'radio') {
        const nm = el.name;
        if (!groups.has(nm) && formEl.querySelector(`input[name="${nm}"]:checked`)) {
          filled++;
          groups.add(nm);
        }
      } else if (el.value.trim() !== '') {
        filled++;
      }
    });

    const pct = required.length ? Math.round((filled / required.length) * 100) : 0;
    this.progressFill.get().style.width = pct + '%';
    this.progressText.get().textContent =
      pct === 100 ? '¡Listo para enviar!' : `${pct}% completado`;

    // Si alguna vez definimos updateProgressText en otra parte, respétalo
    if (this.updateProgressText) {
      this.updateProgressText(pct);
    }

    // habilitar botón sólo si todo OK
    if (pct === 100) {
      this.submitBtn.removeAttr('disabled');
    } else {
      this.submitBtn.attr('disabled', 'true');
    }
  }

  _actualizarCurp() {
    try {
      const nombre = this.nameField.val().trim();
      const ap = this.apField.val().trim();
      const am = this.amField.val().trim();
      const fecha = this.dateField.val();
      const genero = this.genderM.get().checked ? 'M' : 'F';
      const estado = this.estadoNacimiento.val();
      let curp = '';
      if (nombre && ap && am && fecha && estado) {
        curp = generateCurp({
          nombre,
          apellidoPaterno: ap,
          apellidoMaterno: am,
          fechaNacimiento: fecha,
          genero,
          estadoClave: estado,
        }).toUpperCase();
      }
      this.curpField.val(curp.length === 18 ? curp : '');
    } catch (err) {
      console.error('Error generando CURP:', err);
    }
  }

  async _handleFile(file) {
    try {
      const allowed = ['image/jpeg', 'image/png', 'application/pdf'];
      if (!allowed.includes(file.type)) {
        window.mostrarMensajeEstado('❌ Tipo no soportado', 3000);
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        window.mostrarMensajeEstado('❌ Máx. 5MB', 3000);
        return;
      }

      // nombre y tamaño
      this.fileName.text(file.name);
      this.fileSize.text(this._formatFileSize(file.size));

      // convertir a base64
      const base64 = await this._fileToBase64(file);
      this.hiddenOtherData.val(base64);

      // render preview
      if (file.type.startsWith('image/')) {
        const url = URL.createObjectURL(file);
        this.previewContent.html(
          `<img src="${url}" onload="URL.revokeObjectURL(this.src)" style="max-width:100%;"/>`,
        );
      } else {
        this.previewContent.html(`
          <div style="text-align:center;padding:40px;color:#666;">
            <div style="font-size:48px;">📄</div>
            <p>PDF cargado</p>
          </div>
        `);
      }

      // mostrar preview
      this.uploadPlaceholder.hide();
      this.documentPreview.show();
      this.documentUploadArea.addClass('has-success');
      this._updateProgress();
    } catch (err) {
      console.error(err);
      window.mostrarMensajeEstado('❌ Error procesando', 3000);
    }
  }

  _fileToBase64(file) {
    return new Promise((res, rej) => {
      const reader = new FileReader();
      reader.onload = () => {
        const b64 = reader.result.split(',')[1];
        res(b64);
      };
      reader.onerror = () => rej('Error leyendo archivo');
      reader.readAsDataURL(file);
    });
  }

  _removeFile() {
    this.fileInput.val('');
    this.cameraInput.val('');
    this.hiddenOtherData.val('');
    this.documentPreview.hide();
    this.uploadPlaceholder.show();
    this.documentUploadArea.removeClass('has-success has-error');
    this._updateProgress();
  }

  _formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  async _confirmBackWithData() {
    const form = this.form.get();
    const fd = new FormData(form);
    let hasData = false;

    for (const [, v] of fd.entries()) {
      if (v && v.toString().trim()) {
        hasData = true;
        break;
      }
    }

    if (hasData || signatureManager.hasSignature() || audioRecorder.hasRecording()) {
      return await dialogService.confirm(
        'Datos sin Guardar',
        'Tienes información sin guardar. ¿Estás seguro que deseas salir?',
        'Salir sin Guardar',
        'Quedarme',
      );
    }

    return true;
  }

  async handleSubmit(e) {
    e.preventDefault();

    const btn = this.submitBtn;
    btn.addClass('loading').attr('disabled', 'true');

    try {
      // Validar preguntas dinámicas
      if (this.dynamicQuestions) {
        const { isValid, unanswered } = this.dynamicQuestions.validate();
        if (!isValid) {
          await hapticsService.error();
          await dialogService.alert(
            'Preguntas Incompletas',
            `Por favor responde: ${unanswered.map(u => u.question).join(', ')}.`,
          );
          return;
        }
      }

      // Documento requerido
      if (!this.hiddenOtherData.exists() || !this.hiddenOtherData.val()) {
        await hapticsService.error();
        await dialogService.alert(
          'Documento de identificación',
          'Por favor proporcione el documento de identificación antes de continuar.',
        );
        return;
      }

      // Firma requerida
      if (!signatureManager.hasSignature()) {
        await hapticsService.error();
        await dialogService.alert(
          'Firma Requerida',
          'Por favor proporcione su firma antes de continuar.',
        );
        return;
      }

      // Audio requerido
      if (!audioRecorder.hasRecording()) {
        await hapticsService.error();
        await dialogService.alert(
          'Audio Requerido',
          'Por favor proporcione su audio antes de continuar.',
        );
        return;
      }

      // CURP de 18
      if (this.curpField.val().length !== 18) {
        await hapticsService.error();
        await dialogService.alert('CURP inválido', 'El CURP debe tener exactamente 18 caracteres.');
        return;
      }

      // Confirmación
      const shouldSubmit = await dialogService.confirm(
        'Confirmar Registro',
        '¿Estás seguro que deseas guardar este registro? Verifica que toda la información sea correcta.',
        'Guardar',
        'Revisar',
      );

      if (!shouldSubmit) {
        btn.removeClass('loading').removeAttr('disabled');
        return;
      }

      await hapticsService.medium();

      // Datos del formulario
      const formData = new FormData(this.form.get());
      const data = Object.fromEntries(formData.entries());

      data.Questions = this.dynamicQuestions.getFormattedAnswers();
      data.signatureData = signatureManager.getSignatureAsBase64();
      const audio = audioRecorder.getAudioData();
      data.audioData = audio.data;
      data.audioMimeType = audio.mimeType;

      // Construir domicilio
      const opt = this.coloniaSelect.get().selectedOptions[0];
      if (opt) {
        data.domicilio = [
          this.calleNumero.val().trim(),
          opt.value,
          opt.getAttribute('data-municipio'),
          opt.getAttribute('data-estado'),
          opt.getAttribute('data-cp'),
        ]
          .filter(Boolean)
          .join(', ');
      }

      // Enviar
      const result = await enrollmentService.enrollManual(data);
      if (!result.success) throw new Error(result.error || 'Error en enrolamiento');

      await hapticsService.success();

      // Éxito con opciones
      const cont = await dialogService.successWithContinue(
        '¡Registro Guardado!',
        'Los datos se han guardado correctamente en el sistema.',
        'Crear Otro',
        'Dar de Alta Gestión',
      );

      this._resetForm();
      signatureManager.clear();
      audioRecorder.deleteRecording();

      if (cont) {
        window.location.reload();
      } else {
        setTimeout(() => navigateTo(ROUTES.ALTA_GESTION), 1000);
      }
    } catch (err) {
      await hapticsService.error();
      await dialogService.alert('Error Inesperado', `Ha ocurrido un error: ${err.message}`);
      console.error(err);
    } finally {
      btn.removeClass('loading').removeAttr('disabled');
    }
  }

  _resetForm() {
    this.form.get().reset();
    this._removeFile();
    this.coloniaSelect.html(`<option value="">— Selecciona tu colonia —</option>`);
    this.coloniaSelect.get().disabled = true;
    this.subSelect.html(`<option value="">Sin selección</option>`);
    this.subSelect.get().disabled = true;
    signatureManager.clear();
    audioRecorder.deleteRecording();
    this._updateProgress();
  }

  cleanup() {
    // listeners DOM
    this.backBtn?.off('click');
    this.clearSigBtn?.off('click');
    this.undoSigBtn?.off('click');
    this.form?.off('submit');
    this.recalcCurpBtn?.off('click');
    this.selectFileBtn?.off('click');
    this.removeFileBtn?.off('click');
    this.fileInput?.off('change');
    this.documentUploadArea?.off('dragover').off('dragleave').off('drop');
    this.estrSelect?.off('change');
    this.cpInput?.off('blur');

    // teclado: desuscribir y limpiar
    this.keyboardUnsubscribe?.();
    keyboardService.setScrollContainer?.(null);
    keyboardService.cleanup?.();
  }
}
