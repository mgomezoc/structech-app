// src/views/form/index.js

import Handlebars from 'handlebars';
import './style.less';
import tplSource from './template.hbs?raw';

import { navigateTo } from '../../routes/index.js';
import { authService } from '../../services/auth.service.js';
import { datosService } from '../../services/datos.service.js';
import { dialogService } from '../../services/dialog.service.js';
import { hapticsService } from '../../services/haptics.service.js';
import { ROUTES } from '../../utils/constants.js';
import { $, dom } from '../../utils/dom.helper.js';

const template = Handlebars.compile(tplSource);

export default class FormView {
  constructor() {
    this.user = authService.getCurrentUser();
    this.dynamicQuestions = null;
    this.questionsData = [];
    this.abortController = new AbortController();
    this.lottieAnimations = [];
  }

  /**
   * Render inicial - Solo estructura HTML
   * Retorna inmediatamente sin esperar datos
   */
  render() {
    return template({
      user: {
        name: this.user?.name || this.user?.email || 'Usuario',
      },
      loading: true, // Flag para mostrar skeletons
    });
  }

  /**
   * After render - Carga progresiva de módulos y datos
   */
  async afterRender() {
    console.log('📝 Form afterRender iniciado');

    // 1. Referencias DOM y setup básico (inmediato)
    this.setupDOMReferences();
    this.setupBasicEventListeners();

    // 2. Exposición global para escaneo
    window.poblarFormulario = this.poblarFormulario.bind(this);

    // 3. Cargar datos de estructuras (no bloqueante)
    this.loadEstructuras();

    // 4. Inicializar módulos pesados de forma diferida
    this.initializeHeavyModules();

    // 5. Cargar preguntas dinámicas (no bloqueante)
    this.loadDynamicQuestions();

    // 6. Configurar validación y progreso
    this.setupProgressTracking();

    // 7. Inicializar estado del formulario
    this.initializeFormState();
  }

  /**
   * Setup de referencias DOM básicas
   */
  setupDOMReferences() {
    this.form = $('#formPersona');
    this.progressFill = $('#progressFill');
    this.progressText = $('#progressText');
    this.saveButton = this.form?.querySelector('.save-button');
  }

  /**
   * Event listeners básicos (no requieren módulos pesados)
   */
  setupBasicEventListeners() {
    // Botón volver
    dom('#backBtn').on('click', async () => {
      const ok = await this.confirmBackWithData();
      if (ok) {
        await hapticsService.light();
        navigateTo(ROUTES.DASHBOARD);
      }
    });

    // Submit del formulario
    if (this.form) {
      dom(this.form).on('submit', e => this.handleSubmit(e));
    }

    // Validación CURP
    dom('#curp').on('blur', async () => {
      const curp = $('#curp').value.trim();
      if (curp && datosService.validarCurp(curp)) {
        await this.verificarCurpDuplicado(curp);
      }
    });

    // Botón de escaneo (no requiere que Lottie esté cargado)
    dom('#btnScan').on('click', async () => {
      await hapticsService.medium();
      if (window.scanINE) {
        window.scanINE();
      } else {
        window.mostrarMensajeEstado?.('⏳ Escáner cargando...', 2000);
      }
    });

    // Cambio de estructura
    dom('#estructura').on('change', e => this.handleEstructuraChange(e));
  }

  /**
   * Cargar estructuras de forma asíncrona
   */
  async loadEstructuras() {
    try {
      // Mostrar skeleton en el select
      const estructuraSelect = $('#estructura');
      if (estructuraSelect) {
        dom(estructuraSelect).addClass('loading');
      }

      const res = await datosService.obtenerEstructuras();

      if (this.abortController.signal.aborted) return;

      const estructuraSection = $('#estructuraSection');

      // Eliminar campos ocultos previos
      $('#estructuraHidden')?.remove();
      $('#subestructuraHidden')?.remove();

      if (res.success && res.muestraEstructura) {
        // Mostrar selects con datos
        this.renderEstructuras(res.data);
      } else if (res.success && !res.muestraEstructura) {
        // Ocultar sección y agregar campos ocultos
        this.handleHiddenEstructuras();
      }
      estructuraSection?.classList.remove('loading-hidden');
      // Actualizar progreso
      this._updateProgress();
    } catch (error) {
      if (error.name !== 'AbortError') {
        console.error('Error cargando estructuras:', error);
        this.showErrorInSelect('estructura', 'Error al cargar estructuras');
      }
    }
  }

  /**
   * Renderizar estructuras en el select
   */
  renderEstructuras(estructuras) {
    const select = $('#estructura');
    if (!select) return;

    let optionsHtml = '<option value="">Sin selección</option>';
    estructuras.forEach(e => {
      optionsHtml += `<option value="${e.iCatalogId}">${e.vcCatalog}</option>`;
    });

    dom(select).removeClass('loading').html(optionsHtml);

    // Habilitar subestructura select
    const subSelect = $('#subestructura');
    if (subSelect) {
      dom(subSelect).html('<option value="">Sin selección</option>');
    }
  }

  /**
   * Manejar estructuras ocultas
   */
  handleHiddenEstructuras() {
    const estructuraSection = $('#estructuraSection');
    estructuraSection?.remove();

    // Agregar campos ocultos
    const form = $('#formPersona');
    if (form) {
      const hiddenFields = `
        <input type="hidden" id="estructuraHidden" name="estructura" value="1">
        <input type="hidden" id="subestructuraHidden" name="subestructura" value="1">
      `;
      dom(form).append(hiddenFields);
    }
  }

  /**
   * Manejar cambio de estructura
   */
  async handleEstructuraChange(e) {
    await hapticsService.light();
    const estructuraId = e.target.value;
    const subSelect = document.querySelector('#subestructura');

    if (!subSelect) return;

    // Reset subestructura
    subSelect.innerHTML = '<option value="">Sin selección</option>';
    subSelect.disabled = !estructuraId;

    if (!estructuraId) {
      this._updateProgress();
      return;
    }

    // Cargar subestructuras
    try {
      subSelect.classList.add('loading');

      const res = await datosService.obtenerSubestructuras(estructuraId);

      if (this.abortController.signal.aborted) return;

      if (res.success) {
        await hapticsService.light();
        this.renderSubestructuras(res.data);
      } else {
        await hapticsService.error();
        window.mostrarMensajeEstado?.(`⚠️ ${res.error}`, 3000);
      }
    } catch (error) {
      console.error('Error cargando subestructuras:', error);
    } finally {
      subSelect.classList.remove('loading');
      this._updateProgress();
    }
  }

  /**
   * Renderizar subestructuras
   */
  renderSubestructuras(subestructuras) {
    const subSelect = $('#subestructura');
    if (!subSelect) return;

    let optionsHtml = '<option value="">Sin selección</option>';
    subestructuras.forEach(s => {
      optionsHtml += `<option value="${s.iSubCatalogId}">${s.vcSubCatalog}</option>`;
    });

    dom(subSelect).removeClass('loading').html(optionsHtml).prop('disabled', false);
  }

  /**
   * Inicializar módulos pesados de forma diferida
   */
  async initializeHeavyModules() {
    try {
      // Importar módulos pesados en paralelo
      const [
        { audioRecorder },
        { signatureManager },
        lottieModule,
        animCameraModule,
        animProfileModule,
      ] = await Promise.all([
        import('../../js/audioRecorder.js'),
        import('../../js/signature.js'),
        import('lottie-web'),
        import('../../lottie/camara.json'),
        import('../../lottie/user.json'),
      ]);

      if (this.abortController.signal.aborted) return;

      // Guardar referencias
      this.audioRecorder = audioRecorder;
      this.signatureManager = signatureManager;
      const lottie = lottieModule.default || lottieModule;

      // Inicializar módulos
      await Promise.all([signatureManager.init(), audioRecorder.init()]);

      // Cargar animaciones Lottie
      this.loadLottieAnimations(lottie, animCameraModule.default, animProfileModule.default);

      // Configurar event listeners que requieren estos módulos
      this.setupModuleEventListeners();
    } catch (error) {
      console.error('Error cargando módulos pesados:', error);
      // La app puede funcionar sin animaciones
    }
  }

  /**
   * Cargar animaciones Lottie
   */
  loadLottieAnimations(lottie, animCamera, animProfile) {
    // Animación de perfil
    const profileContainer = $('#profilePlaceholder');
    if (profileContainer) {
      const profileAnim = lottie.loadAnimation({
        container: profileContainer,
        renderer: 'svg',
        loop: true,
        autoplay: true,
        animationData: animProfile,
      });
      profileAnim.setSpeed(0.5);
      this.lottieAnimations.push(profileAnim);
    }

    // Animación de cámara
    const scanContainer = $('#scanIcon');
    if (scanContainer) {
      const scanAnim = lottie.loadAnimation({
        container: scanContainer,
        renderer: 'svg',
        loop: true,
        autoplay: true,
        animationData: animCamera,
      });
      scanAnim.setSpeed(0.3);
      this.lottieAnimations.push(scanAnim);
    }
  }

  /**
   * Event listeners que requieren módulos cargados
   */
  setupModuleEventListeners() {
    // Listeners de firma y audio si los módulos están disponibles
    if (this.signatureManager) {
      // Los event listeners de firma ya están en signatureManager.init()
    }

    if (this.audioRecorder) {
      // Los event listeners de audio ya están en audioRecorder.init()
    }
  }

  /**
   * Cargar preguntas dinámicas de forma asíncrona
   */
  async loadDynamicQuestions() {
    try {
      const response = await datosService.obtenerPreguntas();

      if (this.abortController.signal.aborted) return;

      if (response.success && response.data && response.data.length > 0) {
        this.questionsData = response.data;

        // Mostrar la sección con fade-in
        const section = $('#questionsSection');
        if (section) {
          dom(section).css('display', 'block').addClass('fade-in');
        }

        // Inicializar componente dinámicamente
        const { DynamicQuestions } = await import('../../components/dynamicQuestions.js');

        if (this.abortController.signal.aborted) return;

        this.dynamicQuestions = new DynamicQuestions(
          'dynamicQuestionsContainer',
          this.questionsData,
        );
        this.dynamicQuestions.init();

        // Escuchar cambios
        this.dynamicQuestions.onChange(() => {
          this._updateProgress();
        });
      }
    } catch (error) {
      console.error('Error al cargar preguntas dinámicas:', error);
      // No es crítico, el formulario puede funcionar sin preguntas adicionales
    }
  }

  /**
   * Configurar tracking de progreso
   */
  setupProgressTracking() {
    if (!this.form) return;

    const controls = this.form.querySelectorAll('input, select, textarea');

    // Usar delegación de eventos para mejor performance
    dom(this.form).on('input', e => {
      if (e.target.matches('input, select, textarea')) {
        this._updateProgress();
      }
    });

    dom(this.form).on('change', e => {
      if (e.target.matches('input, select, textarea')) {
        this._updateProgress();
      }
    });

    // Actualizar progreso inicial
    this._updateProgress();
  }

  /**
   * Inicializar estado del formulario
   */
  initializeFormState() {
    // Deshabilitar botón guardar inicialmente
    if (this.saveButton) {
      this.saveButton.disabled = true;
    }
  }

  /**
   * Manejar submit del formulario
   */
  async handleSubmit(e) {
    e.preventDefault();
    const btn = this.saveButton;

    if (!btn) return;

    btn.disabled = true;
    btn.classList.add('loading');

    try {
      // Validar preguntas dinámicas
      if (this.dynamicQuestions) {
        const { isValid, unanswered } = this.dynamicQuestions.validate();
        if (!isValid) {
          await dialogService.alert(
            'Preguntas Incompletas',
            `Por favor responde: ${unanswered.map(u => u.question).join(', ')}`,
          );
          return;
        }
      }

      // Validar firma
      if (!this.signatureManager?.hasSignature()) {
        await hapticsService.error();
        await dialogService.alert(
          'Firma Requerida',
          'Por favor proporcione su firma antes de continuar.',
        );
        return;
      }

      // Validar audio
      if (!this.audioRecorder?.hasRecording()) {
        await hapticsService.error();
        await dialogService.alert(
          'Audio Requerido',
          'Por favor proporcione un audio antes de continuar.',
        );
        return;
      }

      // Confirmar envío
      const shouldSubmit = await dialogService.confirm(
        'Confirmar Registro',
        '¿Estás seguro que deseas guardar este registro? Verifica que toda la información sea correcta.',
        'Guardar',
        'Revisar',
      );

      if (!shouldSubmit) return;

      await hapticsService.medium();

      // Preparar datos
      const formData = new FormData(e.target);
      const data = Object.fromEntries(formData.entries());

      // Agregar datos adicionales
      if (this.dynamicQuestions) {
        data.Questions = this.dynamicQuestions.getFormattedAnswers();
      }

      if (this.signatureManager) {
        data.signatureData = this.signatureManager.getSignatureAsBase64();
      }

      if (this.audioRecorder) {
        const audio = this.audioRecorder.getAudioData();
        data.audioData = audio.data;
        data.audioMimeType = audio.mimeType;
      }

      // Enviar formulario
      const result = await datosService.enviarFormularioPersona(data);

      if (!result.success) {
        throw new Error(result.error);
      }

      await hapticsService.success();

      // Diálogo de éxito
      const cont = await dialogService.successWithContinue(
        '¡Registro Guardado!',
        'Los datos se han guardado correctamente en el sistema.',
        'Crear Otro',
        'Dar de Alta Gestión',
      );

      // Limpiar formulario
      e.target.reset();
      this.signatureManager?.clear();
      this.audioRecorder?.deleteRecording();
      this._updateProgress();

      if (cont) {
        window.location.reload();
      } else {
        setTimeout(() => navigateTo(ROUTES.ALTA_GESTION), 1000);
      }
    } catch (err) {
      await hapticsService.error();
      await dialogService.alert('Error Inesperado', `Ha ocurrido un error: ${err.message}`);
    } finally {
      btn.disabled = false;
      btn.classList.remove('loading');
    }
  }

  /**
   * Verificar CURP duplicado
   */
  async verificarCurpDuplicado(curp) {
    try {
      const r = await datosService.buscarPorCurp(curp);
      const el = $('#curp');

      if (!el) return;

      if (r.success && r.exists) {
        window.mostrarMensajeEstado?.('⚠️ Ya existe un registro con este CURP', 3000);
        dom(el).addClass('error');
      } else {
        dom(el).removeClass('error');
      }
    } catch (error) {
      console.error('Error verificando CURP:', error);
    }
  }

  /**
   * Confirmar salida con datos
   */
  async confirmBackWithData() {
    if (!this.form) return true;

    const formData = new FormData(this.form);
    let hasData = false;

    for (const [, value] of formData.entries()) {
      if (value && value.toString().trim()) {
        hasData = true;
        break;
      }
    }

    const hasSignature = this.signatureManager?.hasSignature() || false;
    const hasAudio = this.audioRecorder?.hasRecording() || false;

    if (hasData || hasSignature || hasAudio) {
      return await dialogService.confirm(
        'Datos sin Guardar',
        'Tienes información sin guardar. ¿Estás seguro que deseas salir?',
        'Salir sin Guardar',
        'Quedarme',
      );
    }

    return true;
  }

  /**
   * Poblar formulario con datos del escaneo
   */
  poblarFormulario(scanResult) {
    hapticsService.light();
    const data = scanResult.result || scanResult;
    const getVal = f => f?.description || f?.latin || '';

    // Poblar campos básicos
    const fields = {
      nombre: getVal(data.fullName),
      apellidoPaterno: getVal(data.fathersName),
      apellidoMaterno: getVal(data.mothersName),
      curp: getVal(data.personalIdNumber),
      claveElector: getVal(data.documentAdditionalNumber),
    };

    Object.entries(fields).forEach(([id, value]) => {
      const el = $(`#${id}`);
      if (el) el.value = value;
    });

    // Fecha de nacimiento
    if (data.dateOfBirth) {
      const { day, month, year } = data.dateOfBirth;
      const fecha = [year, String(month).padStart(2, '0'), String(day).padStart(2, '0')].join('-');

      const fechaEl = $('#fechaNacimiento');
      if (fechaEl) fechaEl.value = fecha;
    }

    // Género
    const sex = getVal(data.sex).toUpperCase();
    if (sex === 'H') {
      const hombreEl = $('#hombre');
      if (hombreEl) hombreEl.checked = true;
    } else if (sex === 'M') {
      const mujerEl = $('#mujer');
      if (mujerEl) mujerEl.checked = true;
    }

    // Dirección
    if (data.address) {
      const domicilioEl = $('#domicilio');
      if (domicilioEl) {
        domicilioEl.value = data.address.latin.replace(/\n/g, ' ');
      }
    }

    // Sección
    const opt1 = data.mrzResult?.sanitizedOpt1?.slice(0, 4);
    if (opt1) {
      const seccionEl = $('#seccion');
      if (seccionEl) seccionEl.value = opt1;
    }

    // Imagen de perfil
    if (data.faceImage) {
      this._showImage('profileImage', 'profilePlaceholder', data.faceImage);
      const faceImageEl = $('#faceImageData');
      if (faceImageEl) faceImageEl.value = data.faceImage;

      // Agregar clase visual
      const profilePhoto = $('#profilePhoto');
      if (profilePhoto) {
        dom(profilePhoto).addClass('has-image');
      }
    }

    // Campos ocultos
    const hiddenFields = {
      signatureImageData: data.signatureImage,
      fullDocumentFrontImage: data.fullDocumentFrontImage,
      fullDocumentBackImage: data.fullDocumentBackImage,
      idMex: data.documentNumber?.description,
    };

    Object.entries(hiddenFields).forEach(([id, value]) => {
      if (value) {
        const el = $(`#${id}`);
        if (el) el.value = value;
      }
    });

    // Actualizar progreso
    this._updateProgress();
  }

  /**
   * Mostrar imagen
   */
  _showImage(imgId, placeholderId, base64) {
    const img = $(`#${imgId}`);
    const placeholder = $(`#${placeholderId}`);

    if (img && placeholder) {
      img.src = `data:image/png;base64,${base64}`;
      img.style.display = 'block';
      placeholder.style.display = 'none';
    }
  }

  /**
   * Actualizar barra de progreso
   */
  _updateProgress() {
    if (!this.progressFill || !this.form) return;

    const required = this.form.querySelectorAll('[required]');
    const saveButton = this.saveButton;
    let filled = 0;
    const countedGroups = new Set();

    required.forEach(el => {
      if (el.type === 'radio') {
        const groupName = el.name;
        if (countedGroups.has(groupName)) return;

        const groupChecked = this.form.querySelector(`input[name="${groupName}"]:checked`);
        if (groupChecked) {
          filled++;
          countedGroups.add(groupName);
        }
      } else if (el.value && el.value.trim() !== '') {
        filled++;
      }
    });

    const pct = required.length ? Math.round((filled / required.length) * 100) : 0;

    // Animar cambio de progreso
    requestAnimationFrame(() => {
      this.progressFill.style.width = pct + '%';

      if (this.progressText) {
        this.progressText.textContent = pct === 100 ? '¡Listo para guardar!' : `${pct}% completado`;
      }

      if (saveButton) {
        saveButton.disabled = pct < 100;
      }
    });
  }

  /**
   * Mostrar error en select
   */
  showErrorInSelect(selectId, message) {
    const select = $(`#${selectId}`);
    if (!select) return;

    dom(select)
      .removeClass('loading')
      .addClass('error')
      .html(`<option value="">${message}</option>`);
  }

  /**
   * Cleanup al salir de la vista
   */
  cleanup() {
    console.log('🧹 Limpiando FormView');

    // Cancelar peticiones
    this.abortController.abort();

    // Limpiar referencias globales
    window.poblarFormulario = null;

    // Destruir animaciones Lottie
    this.lottieAnimations.forEach(anim => anim.destroy());

    // Limpiar módulos si están cargados
    this.signatureManager?.cleanup?.();
    this.audioRecorder?.cleanup?.();
  }
}
