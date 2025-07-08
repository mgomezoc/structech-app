// src/views/enrollment-manual/index.js

import Handlebars from 'handlebars';
import '../form/style.less'; // shared form styles
import './style.less';
import tplSource from './template.hbs?raw';

import logoUrl from '../../img/logo-icono-structech.png';
import { navigateTo } from '../../routes/index.js';
import { datosService } from '../../services/datos.service.js';
import { enrollmentService } from '../../services/enrollment.service.js';
import { ROUTES } from '../../utils/constants.js';

import { audioRecorder } from '../../js/audioRecorder.js';
import { signatureManager } from '../../js/signature.js';

import { generateCurp } from '../../utils/curp.helper.js';
import { createElement, debounce, dom } from '../../utils/dom.helper.js';
import { ESTADOS_MEXICO } from '../../utils/estados.js';

const template = Handlebars.compile(tplSource);

export default class EnrollmentManualView {
  constructor() {
    this.logoUrl = logoUrl;
  }

  render() {
    return template({
      logoUrl: this.logoUrl,
      estados: ESTADOS_MEXICO,
    });
  }

  async afterRender() {
    // Inicializar signature & audio
    signatureManager.init();
    await audioRecorder.init();

    // Inicializar referencias DOM
    this._initializeDOMReferences();

    // Configurar event listeners
    this._setupEventListeners();

    // Cargar datos iniciales
    await this._loadInitialData();

    // Configurar progreso
    this._attachProgressListeners();
    this._updateProgress();

    // Generar CURP inicial
    this._actualizarCurp();
  }

  _initializeDOMReferences() {
    // Elementos principales
    this.form = dom('#enrollForm');
    this.backBtn = dom('#backBtn');
    this.submitBtn = dom('#submitBtn');

    // Progress bar
    this.progressFill = dom('#progressFill');
    this.progressText = dom('#progressText');

    // Estructura
    this.estrSelect = dom('#estructura');
    this.subSelect = dom('#subestructura');

    // Datos personales
    this.nameField = dom('#nombre');
    this.apField = dom('#apellidoPaterno');
    this.amField = dom('#apellidoMaterno');
    this.dateField = dom('#fechaNacimiento');
    this.estadoNacimiento = dom('#estadoNacimiento');
    this.genderM = dom('#hombre');
    this.genderF = dom('#mujer');

    // CURP
    this.curpField = dom('#curp');
    this.recalcCurpBtn = dom('#recalcularCurp');

    // Localización
    this.cpInput = dom('#codigoPostal');
    this.coloniaSelect = dom('#colonia');
    this.calleNumero = dom('#calleNumero');

    // Documento - Sistema exacto del template
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

    // Firma
    this.clearSigBtn = dom('#clearSignature');
    this.undoSigBtn = dom('#undoSignature');
  }

  _setupEventListeners() {
    // Navegación
    this.backBtn.on('click', () => navigateTo(ROUTES.DASHBOARD));

    // Formulario
    this.form.on('submit', e => this.handleSubmit(e));

    // Firma
    this.clearSigBtn.on('click', () => signatureManager.clear());
    this.undoSigBtn.on('click', () => signatureManager.undo());

    // CURP
    this.recalcCurpBtn.on('click', () => this._actualizarCurp());

    // Estructura → subestructuras
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

    // Código postal → colonias
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

    // Auto-recalcular CURP en campos relevantes
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

    // Sistema de documentos mejorado
    this._setupDocumentHandlers();
  }

  _setupDocumentHandlers() {
    // Botón seleccionar archivo - verificar que existe
    if (this.selectFileBtn.exists()) {
      this.selectFileBtn.on('click', () => this.fileInput.get().click());
    }

    // Botón remover archivo - verificar que existe
    if (this.removeFileBtn.exists()) {
      this.removeFileBtn.on('click', () => this._removeFile());
    }

    // Drag and drop - verificar que existe
    if (this.documentUploadArea.exists()) {
      this.documentUploadArea.on('dragover', e => {
        e.preventDefault();
        this.documentUploadArea.addClass('drag-over');
      });

      this.documentUploadArea.on('dragleave', () => {
        this.documentUploadArea.removeClass('drag-over');
      });

      this.documentUploadArea.on('drop', e => {
        e.preventDefault();
        this.documentUploadArea.removeClass('drag-over');
        const files = e.dataTransfer.files;
        if (files.length > 0) {
          this._handleFile(files[0]);
        }
      });
    }

    // Cambio de archivo - verificar que existe
    if (this.fileInput.exists()) {
      this.fileInput.on('change', e => {
        const file = e.target.files[0];
        if (file) {
          this._handleFile(file);
        }
      });
    }
  }

  async _loadInitialData() {
    // Cargar estructuras
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

    // Rastrear todos los controles del formulario
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
        const name = el.name;
        if (groups.has(name)) return;
        if (formEl.querySelector(`input[name="${name}"]:checked`)) {
          filled++;
          groups.add(name);
        }
      } else if (el.value && el.value.toString().trim() !== '') {
        filled++;
      }
    });

    const pct = required.length ? Math.round((filled / required.length) * 100) : 0;
    this.progressFill.get().style.width = pct + '%';

    if (this.progressText) {
      this.progressText.get().textContent =
        pct === 100 ? '¡Listo para enviar!' : `${pct}% completado`;
    }

    // Habilitar/deshabilitar botón submit
    if (this.submitBtn) {
      const hasSignature = signatureManager.hasSignature();
      const hasValidCurp = this.curpField.val() && this.curpField.val().length === 18;

      if (pct === 100 && hasValidCurp && hasSignature) {
        this.submitBtn.removeAttr('disabled');
      } else {
        this.submitBtn.attr('disabled', 'true');
      }
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

      if (curp.length === 18) {
        this.curpField.val(curp);
      } else {
        this.curpField.val('');
      }
    } catch (err) {
      console.error('Error generando CURP:', err);
    }
  }

  // Método corregido para manejar archivos
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
      // Validaciones
      if (!signatureManager.hasSignature()) {
        throw new Error('Por favor, proporciona tu firma');
      }

      if (!this.curpField.val() || this.curpField.val().length !== 18) {
        throw new Error('El CURP debe tener 18 caracteres');
      }

      // Recopilar datos del formulario
      const formData = new FormData(this.form.get());
      const data = Object.fromEntries(formData.entries());

      // Agregar datos adicionales
      data.signatureData = signatureManager.getSignatureAsBase64();

      // Audio si existe
      if (audioRecorder.hasRecording()) {
        const { data: audioData, mimeType } = audioRecorder.getAudioData();
        data.audioData = audioData;
        data.audioMimeType = mimeType;
      }

      // Construir domicilio completo
      const coloniaElement = this.coloniaSelect.get();
      const selectedOption = coloniaElement.selectedOptions[0];

      if (selectedOption) {
        data.domicilio = [
          this.calleNumero.val().trim(),
          selectedOption.value,
          selectedOption.getAttribute('data-municipio'),
          selectedOption.getAttribute('data-estado'),
          selectedOption.getAttribute('data-cp'),
        ]
          .filter(Boolean)
          .join(', ');
      }

      // Enviar datos
      const result = await enrollmentService.enrollManual(data);
      if (!result.success) {
        throw new Error(result.error || 'Error al procesar el enrolamiento');
      }

      // Éxito
      window.mostrarMensajeEstado('✅ Enrolamiento exitoso', 3000);

      // Limpiar formulario
      this._resetForm();
    } catch (err) {
      console.error('Error en handleSubmit:', err);
      window.mostrarMensajeEstado(`❌ ${err.message}`, 5000);
    } finally {
      btn.removeClass('loading').removeAttr('disabled');
    }
  }

  _resetForm() {
    // Reset formulario
    this.form.get().reset();

    // Limpiar documentos
    this._removeFile();

    // Limpiar colonias
    this.coloniaSelect.html(`<option value="">— Selecciona tu colonia —</option>`);
    this.coloniaSelect.get().disabled = true;

    // Limpiar subestructuras
    this.subSelect.html(`<option value="">Sin selección</option>`);
    this.subSelect.get().disabled = true;

    // Limpiar firma y audio
    signatureManager.clear();
    audioRecorder.deleteRecording();

    // Actualizar progreso
    this._updateProgress();
  }

  cleanup() {
    // Limpiar event listeners
    this.backBtn?.off('click');
    this.clearSigBtn?.off('click');
    this.undoSigBtn?.off('click');
    this.form?.off('submit');
    this.recalcCurpBtn?.off('click');
    this.selectFileBtn?.off('click');
    this.removeFileBtn?.off('click');
    this.fileInput?.off('change');

    // Limpiar drag and drop
    this.documentUploadArea?.off('dragover');
    this.documentUploadArea?.off('dragleave');
    this.documentUploadArea?.off('drop');

    // Limpiar otros listeners
    this.estrSelect?.off('change');
    this.cpInput?.off('blur');
  }
}
