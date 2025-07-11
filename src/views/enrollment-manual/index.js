// src/views/enrollment-manual/index.js

import Handlebars from 'handlebars';
import '../form/style.less';
import './style.less';
import tplSource from './template.hbs?raw';

import { navigateTo } from '../../routes/index.js';
import { datosService } from '../../services/datos.service.js';
import { enrollmentService } from '../../services/enrollment.service.js';
import { ROUTES } from '../../utils/constants.js';

import { audioRecorder } from '../../js/audioRecorder.js';
import { signatureManager } from '../../js/signature.js';

import { generateCurp } from '../../utils/curp.helper.js';
import { createElement, debounce, dom } from '../../utils/dom.helper.js';
import { ESTADOS_MEXICO } from '../../utils/estados.js';

import { keyboardService } from '../../services/keyboard.service.js';

const template = Handlebars.compile(tplSource);

export default class EnrollmentManualView {
  constructor() {}

  render() {
    return template({
      estados: ESTADOS_MEXICO,
    });
  }

  async afterRender() {
    // 1. Inicializar referencias DOM (necesarias antes de usarlas)
    this._initializeDOMReferences();

    // 2. Mejorar comportamiento del header (usa elementos DOM ya referenciados)
    this.enhanceHeader();

    // 3. Configurar eventos (formulario, inputs, botones, etc.)
    this._setupEventListeners();

    // 4. Inicializar firma y grabadora
    signatureManager.init();
    await audioRecorder.init();

    // 5. Cargar opciones iniciales del formulario (estructuras, colonias, etc.)
    await this._loadInitialData();

    // 6. Configurar progreso visual y mensaje
    this._attachProgressListeners();
    this._updateProgress();

    // 7. Calcular CURP inicial (con campos si ya hay valores precargados)
    this._actualizarCurp();

    // 8. Activar soporte para teclado móvil
    await this.initKeyboard();
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
  }

  enhanceHeader() {
    const header = document.getElementById('altaHeader');
    const formContainer = document.querySelector('.form-container');
    const progressText = document.getElementById('progressText');

    if (!header || !formContainer) return;

    let lastScrollTop = 0;
    let ticking = false;

    // Detectar scroll para agregar sombra
    const handleScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          const scrollTop = formContainer.scrollTop;

          // Agregar clase cuando hay scroll
          if (scrollTop > 10) {
            header.classList.remove('scrolled-top');
          } else {
            header.classList.add('scrolled-top');
          }

          // Ocultar header al hacer scroll down en móvil (opcional)
          if (window.innerWidth < 768) {
            if (scrollTop > lastScrollTop && scrollTop > 100) {
              header.classList.add('scrolled');
            } else {
              header.classList.remove('scrolled');
            }
          }

          lastScrollTop = scrollTop;
          ticking = false;
        });
        ticking = true;
      }
    };

    // Throttled scroll listener
    formContainer.addEventListener('scroll', handleScroll, { passive: true });

    // Actualizar texto de progreso con animación
    this.updateProgressText = percentage => {
      if (!progressText) return;

      const isComplete = percentage === 100;

      // Cambiar texto con fade
      progressText.style.opacity = '0';

      setTimeout(() => {
        if (isComplete) {
          progressText.textContent = '¡Formulario completo!';
          progressText.classList.add('complete');
        } else {
          progressText.textContent = `${percentage}% completado`;
          progressText.classList.remove('complete');
        }
        progressText.style.opacity = '1';
      }, 150);
    };
  }

  // --- Métodos para keyboardService ---
  async initKeyboard() {
    // Inicializar el servicio
    await keyboardService.init();

    // Añadir clases para estilos reactivos al teclado
    const container = document.querySelector('.form-view-container');
    container?.classList.add('keyboard-aware-container');

    const formContainer = document.querySelector('.form-container');
    formContainer?.classList.add('keyboard-scrollable');

    // Suscribirse a eventos del teclado
    this.keyboardUnsubscribe = keyboardService.subscribe((event, data) => {
      this.handleKeyboardEvent(event, data);
    });

    // Configurar navegación entre campos
    this.setupKeyboardNavigation();
  }

  handleKeyboardEvent(event, data) {
    const formContainer = document.querySelector('.form-container');

    if (event === 'focus') {
      formContainer?.classList.add('keyboard-active');

      // Para selects, dar más tiempo
      if (data.id === 'estadoNacimiento' || data.id === 'colonia') {
        setTimeout(() => {
          keyboardService.scrollToInput(data);
        }, 400);
      }
    } else if (event === 'blur') {
      formContainer?.classList.remove('keyboard-active');
    }
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
            keyboardService.hide();
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
  // --- Fin keyboardService ---
  _setupEventListeners() {
    this.backBtn.on('click', () => navigateTo(ROUTES.DASHBOARD));
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
  }

  _setupDocumentHandlers() {
    if (this.selectFileBtn.exists())
      this.selectFileBtn.on('click', () => this.fileInput.get().click());
    if (this.removeFileBtn.exists()) this.removeFileBtn.on('click', () => this._removeFile());

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

    if (this.fileInput.exists()) {
      this.fileInput.on('change', e => {
        const file = e.target.files[0];
        if (file) this._handleFile(file);
      });
    }
  }

  async _loadInitialData() {
    const estrRes = await datosService.obtenerEstructuras();
    if (estrRes.success) {
      estrRes.data.forEach(e =>
        this.estrSelect
          .get()
          .appendChild(createElement('option', { value: e.iCatalogId }, e.vcCatalog)),
      );
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

    if (this.updateProgressText) {
      this.updateProgressText(pct);
    }

    // habilitar botón solo si todo OK
    const hasSig = signatureManager.hasSignature();
    const curp18 = this.curpField.val().length === 18;
    if (pct === 100 && hasSig && curp18) {
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
      // Validar tipo de archivo
      const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'];
      if (!allowedTypes.includes(file.type)) {
        window.mostrarMensajeEstado('❌ Tipo de archivo no soportado', 3000);
        return;
      }

      // Validar tamaño (5MB máximo)
      if (file.size > 5 * 1024 * 1024) {
        window.mostrarMensajeEstado('❌ El archivo es demasiado grande (máximo 5MB)', 3000);
        return;
      }

      // Mostrar información del archivo solo si los elementos existen
      if (this.fileName.exists()) {
        this.fileName.text(file.name);
      }
      if (this.fileSize.exists()) {
        this.fileSize.text(this._formatFileSize(file.size));
      }

      // Convertir a base64 de forma más robusta
      const base64 = await this._fileToBase64(file);

      // Guardar en campo oculto
      if (this.hiddenOtherData.exists()) {
        this.hiddenOtherData.val(base64);
      }

      // Mostrar preview según el tipo de archivo
      if (this.previewContent.exists()) {
        if (file.type.startsWith('image/')) {
          // Para imágenes, usar URL temporal que es más eficiente
          const imageUrl = URL.createObjectURL(file);
          this.previewContent.html(
            `<img src="${imageUrl}" alt="Preview del documento" style="max-width: 100%; height: auto;" onload="URL.revokeObjectURL(this.src)" />`,
          );
        } else {
          // Para PDFs
          this.previewContent.html(`
            <div style="padding: 40px; text-align: center; color: #6b7280;">
              <div style="font-size: 48px; margin-bottom: 12px;">📄</div>
              <p>Archivo PDF subido correctamente</p>
            </div>
          `);
        }
      }

      // Cambiar estado visual solo si los elementos existen
      if (this.uploadPlaceholder.exists()) {
        this.uploadPlaceholder.hide();
      }
      if (this.documentPreview.exists()) {
        this.documentPreview.show();
      }
      if (this.documentUploadArea.exists()) {
        this.documentUploadArea.addClass('has-success');
      }

      // Actualizar progreso
      this._updateProgress();
    } catch (error) {
      console.error('Error procesando archivo:', error);
      window.mostrarMensajeEstado('❌ Error al procesar el archivo', 3000);
    }
  }

  // Método helper para convertir archivo a base64
  _fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = () => {
        try {
          const result = reader.result;
          const base64 = result.split(',')[1]; // Extraer solo la parte base64
          resolve(base64);
        } catch (error) {
          reject(error);
        }
      };

      reader.onerror = () => {
        reject(new Error('Error al leer el archivo'));
      };

      reader.readAsDataURL(file);
    });
  }

  _removeFile() {
    // Limpiar datos
    if (this.fileInput.exists()) {
      this.fileInput.val('');
    }
    if (this.hiddenOtherData.exists()) {
      this.hiddenOtherData.val('');
    }

    // Restaurar estado visual solo si los elementos existen
    if (this.documentPreview && this.documentPreview.exists()) {
      this.documentPreview.hide();
    }

    if (this.uploadPlaceholder && this.uploadPlaceholder.exists()) {
      this.uploadPlaceholder.show();
    }

    // Remover clases de estado solo si el elemento existe
    if (this.documentUploadArea && this.documentUploadArea.exists()) {
      this.documentUploadArea.removeClass('has-success');
      this.documentUploadArea.removeClass('has-error');
    }

    // Actualizar progreso
    this._updateProgress();
  }

  _formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  async handleSubmit(e) {
    e.preventDefault();
    const btn = this.submitBtn;
    btn.addClass('loading').attr('disabled', 'true');
    try {
      if (!signatureManager.hasSignature()) throw new Error('Por favor, proporciona tu firma');
      if (this.curpField.val().length !== 18) throw new Error('El CURP debe tener 18 caracteres');

      const formData = new FormData(this.form.get());
      const data = Object.fromEntries(formData.entries());
      data.signatureData = signatureManager.getSignatureAsBase64();

      if (audioRecorder.hasRecording()) {
        const { data: ad, mimeType } = audioRecorder.getAudioData();
        data.audioData = ad;
        data.audioMimeType = mimeType;
      }

      // domicilio completo
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

      const result = await enrollmentService.enrollManual(data);
      if (!result.success) throw new Error(result.error || 'Error en enrolamiento');

      window.mostrarMensajeEstado('✅ Enrolamiento exitoso', 3000);
      this._resetForm();
    } catch (err) {
      console.error(err);
      window.mostrarMensajeEstado(`❌ ${err.message}`, 5000);
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

    // limpiar keyboardService
    if (this.keyboardUnsubscribe) {
      this.keyboardUnsubscribe();
    }
    keyboardService.cleanup();
  }
}
