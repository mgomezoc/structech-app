// src/views/form/index.js

import Handlebars from 'handlebars';
import './style.less';
import tplSource from './template.hbs?raw';

import { navigateTo } from '../../routes/index.js';
import { addressService } from '../../services/address.service.js';
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

    // 🆕 Referencias para ubicación
    this.cpInput = $('#codigoPostal');
    this.coloniaSelect = $('#colonia');
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

    // 🆕 Event listeners para ubicación
    this.setupLocationEventListeners();
  }

  /**
   * 🆕 Configurar event listeners para ubicación
   */
  setupLocationEventListeners() {
    // Evento para código postal (blur para cargar colonias)
    if (this.cpInput) {
      dom(this.cpInput).on('blur', async e => {
        const cp = e.target.value.trim();
        await this.handleCodigoPostalChange(cp);
      });

      // También detectar Enter
      dom(this.cpInput).on('keypress', async e => {
        if (e.key === 'Enter') {
          const cp = e.target.value.trim();
          await this.handleCodigoPostalChange(cp);
        }
      });
    }

    // Evento para colonia (actualizar campos ocultos)
    if (this.coloniaSelect) {
      dom(this.coloniaSelect).on('change', e => {
        this.handleColoniaChange(e);
        this._updateProgress();
      });
    }
  }

  /**
   * 🆕 Manejar cambio de código postal
   */
  async handleCodigoPostalChange(cp) {
    if (!cp || !this.coloniaSelect) {
      this._updateProgress();
      return;
    }

    console.log('🔍 Buscando colonias para CP:', cp);

    try {
      // Mostrar indicador de carga en el select de colonia
      this.showColoniaLoading(true);

      // Consultar colonias
      const colRes = await datosService.obtenerColoniasPorCP(cp);

      if (this.abortController.signal.aborted) return;

      if (colRes.success && Array.isArray(colRes.data) && colRes.data.length > 0) {
        await hapticsService.light();
        console.log(`🏘️ Se encontraron ${colRes.data.length} colonias para CP ${cp}`);

        // Poblar select de colonias
        this.populateColoniasSelect(colRes.data);

        // Habilitar el select
        this.coloniaSelect.disabled = false;

        // Mostrar feedback positivo
        this.showCPFeedback('success', `${colRes.data.length} colonias encontradas`);
      } else {
        await hapticsService.error();
        console.warn('⚠️ No se encontraron colonias para CP:', cp);

        // Limpiar y deshabilitar select
        this.clearColoniasSelect();
        this.coloniaSelect.disabled = true;

        // Mostrar feedback de error
        this.showCPFeedback('error', 'No se encontraron colonias para este código postal');
      }
    } catch (error) {
      console.error('❌ Error consultando colonias:', error);

      // Limpiar select en caso de error
      this.clearColoniasSelect();
      this.coloniaSelect.disabled = true;

      // Mostrar feedback de error
      this.showCPFeedback('error', 'Error al consultar colonias');
    } finally {
      this.showColoniaLoading(false);
      this._updateProgress();
    }
  }

  /**
   * 🆕 Poblar select de colonias
   */
  populateColoniasSelect(colonias) {
    if (!this.coloniaSelect) return;

    let optionsHtml = '<option value="">— Selecciona tu colonia —</option>';

    colonias.forEach(colonia => {
      optionsHtml += `
        <option 
          value="${colonia.vcNeighborhood}"
          data-municipio="${colonia.vcMunicipality || ''}"
          data-estado="${colonia.vcState || ''}"
          data-cp="${colonia.iZipCode || ''}"
          data-id="${colonia.iNeighborhoodId || ''}"
          data-municipio-id="${colonia.iMunicipalityId || ''}"
        >
          ${colonia.vcNeighborhood}
        </option>
      `;
    });

    dom(this.coloniaSelect).html(optionsHtml);
  }

  /**
   * 🆕 Limpiar select de colonias
   */
  clearColoniasSelect() {
    if (!this.coloniaSelect) return;
    dom(this.coloniaSelect).html('<option value="">— Selecciona tu colonia —</option>');
  }

  /**
   * 🆕 Manejar cambio de colonia seleccionada
   */
  handleColoniaChange(e) {
    const selectedOption = e.target.selectedOptions[0];

    if (!selectedOption || !selectedOption.value) {
      // Remover campos ocultos si no hay selección
      this.removeLocationHiddenFields();
      return;
    }

    // Construir objeto con datos de la colonia
    const coloniaData = {
      iNeighborhoodId: selectedOption.getAttribute('data-id') || '',
      vcNeighborhood: selectedOption.value,
      iZipCode: selectedOption.getAttribute('data-cp') || '',
      iMunicipalityId: selectedOption.getAttribute('data-municipio-id') || '',
      vcMunicipality: selectedOption.getAttribute('data-municipio') || '',
      vcState: selectedOption.getAttribute('data-estado') || '',
    };

    console.log('🎯 Colonia seleccionada:', coloniaData);

    // Agregar campos ocultos al formulario
    this.addLocationHiddenFields(coloniaData, this.cpInput?.value || '');
  }

  /**
   * 🆕 Actualizar dirección completa
   */
  updateFullAddress(coloniaData) {
    const calleNumeroValue = this.calleNumero.value.trim();

    if (calleNumeroValue && coloniaData.vcNeighborhood) {
      // Construir dirección completa
      const direccionCompleta = [
        calleNumeroValue,
        coloniaData.vcNeighborhood,
        coloniaData.vcMunicipality,
        coloniaData.vcState,
        coloniaData.iZipCode,
      ]
        .filter(Boolean)
        .join(', ');

      // Actualizar campo de domicilio si existe
      const domicilioEl = $('#domicilio');
      if (domicilioEl) {
        domicilioEl.value = direccionCompleta;
      }

      console.log('📍 Dirección completa actualizada:', direccionCompleta);
    }
  }

  /**
   * 🆕 Mostrar indicador de carga en select de colonia
   */
  showColoniaLoading(show) {
    if (!this.coloniaSelect) return;

    if (show) {
      dom(this.coloniaSelect).addClass('loading');
      dom(this.coloniaSelect).html('<option value="">Cargando colonias...</option>');
    } else {
      dom(this.coloniaSelect).removeClass('loading');
    }
  }

  /**
   * 🆕 Mostrar feedback para código postal
   */
  showCPFeedback(type, message) {
    // Remover feedback previo
    $('#cpFeedback')?.remove();

    const feedback = document.createElement('div');
    feedback.id = 'cpFeedback';
    feedback.className = `cp-feedback ${type}`;

    const icon = type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️';
    feedback.innerHTML = `
      <div class="feedback-icon">${icon}</div>
      <div class="feedback-text">${message}</div>
    `;

    // Insertar después del input de código postal
    if (this.cpInput?.parentNode) {
      this.cpInput.parentNode.appendChild(feedback);

      // Auto-hide después de 3 segundos
      setTimeout(() => {
        if (feedback.parentNode) {
          feedback.classList.add('fade-out');
          setTimeout(() => feedback.remove(), 300);
        }
      }, 3000);
    }
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

        // Si es el campo de calle y número, actualizar dirección completa
        if (e.target.id === 'calleNumero' && this.coloniaSelect?.value) {
          const selectedOption = this.coloniaSelect.selectedOptions[0];
          if (selectedOption) {
            const coloniaData = {
              vcNeighborhood: selectedOption.value,
              vcMunicipality: selectedOption.getAttribute('data-municipio') || '',
              vcState: selectedOption.getAttribute('data-estado') || '',
              iZipCode: selectedOption.getAttribute('data-cp') || '',
            };
            this.updateFullAddress(coloniaData);
          }
        }
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

    // 🆕 Deshabilitar select de colonia inicialmente
    if (this.coloniaSelect) {
      this.coloniaSelect.disabled = true;
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

      // 🆕 Construir domicilio si hay datos de colonia
      if (this.coloniaSelect?.value && this.calleNumero?.value) {
        const selectedOption = this.coloniaSelect.selectedOptions[0];
        if (selectedOption) {
          data.domicilio = [
            this.calleNumero.value.trim(),
            selectedOption.value,
            selectedOption.getAttribute('data-municipio'),
            selectedOption.getAttribute('data-estado'),
            selectedOption.getAttribute('data-cp'),
          ]
            .filter(Boolean)
            .join(', ');
        }
      }

      // Agregar datos adicionales
      if (this.dynamicQuestions) {
        data.Questions = this.dynamicQuestions.getFormattedAnswers();
      }

      if (this.signatureManager) {
        data.signatureData = this.signatureManager.getSignatureAsBase64();
      }

      // Validar audio
      if (this.audioRecorder?.hasRecording()) {
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
      this.resetForm();

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
   * 🆕 Resetear formulario completamente
   */
  resetForm() {
    // Reset del form HTML
    this.form?.reset();

    // Limpiar módulos
    this.signatureManager?.clear();
    this.audioRecorder?.deleteRecording();

    // Limpiar selects de ubicación
    this.clearColoniasSelect();
    if (this.coloniaSelect) {
      this.coloniaSelect.disabled = true;
    }

    // Remover campos ocultos de ubicación
    this.removeLocationHiddenFields();

    // Actualizar progreso
    this._updateProgress();
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
  async poblarFormulario(scanResult) {
    try {
      hapticsService.light();
      const data = scanResult.result || scanResult;
      const getVal = f => f?.description || f?.latin || '';

      console.log('🔄 Iniciando poblado de formulario con datos:', data);

      // 1. Poblar campos básicos (código existente)
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

      // 2. Fecha de nacimiento (código existente)
      if (data.dateOfBirth) {
        const { day, month, year } = data.dateOfBirth;
        const fecha = [year, String(month).padStart(2, '0'), String(day).padStart(2, '0')].join(
          '-',
        );
        const fechaEl = $('#fechaNacimiento');
        if (fechaEl) fechaEl.value = fecha;
      }

      // 3. Género (código existente)
      const sex = getVal(data.sex).toUpperCase();
      if (sex === 'H') {
        const hombreEl = $('#hombre');
        if (hombreEl) hombreEl.checked = true;
      } else if (sex === 'M') {
        const mujerEl = $('#mujer');
        if (mujerEl) mujerEl.checked = true;
      }

      // 4. 🆕 NUEVA FUNCIONALIDAD: Dirección + Consulta automática de colonias
      if (data.address) {
        const addressText = data.address.latin.replace(/\n/g, ' ');
        const domicilioEl = $('#domicilio');
        if (domicilioEl) {
          domicilioEl.value = addressText;
        }

        console.log('🏠 Procesando dirección:', addressText);

        // Extraer código postal de la dirección
        const extractedCP = addressService.extractPostalCode(addressText);

        if (extractedCP) {
          console.log(`📮 Código postal extraído: ${extractedCP}`);

          // 🆕 Llenar el campo de código postal
          if (this.cpInput) {
            this.cpInput.value = extractedCP;
          }

          // Mostrar indicador de carga
          this.showLocationLoadingIndicator(true);

          try {
            // Consultar colonias por código postal
            const coloniesResult = await datosService.obtenerColoniasPorCP(extractedCP);

            if (
              coloniesResult.success &&
              Array.isArray(coloniesResult.data) &&
              coloniesResult.data.length > 0
            ) {
              console.log(
                `🏘️ Se encontraron ${coloniesResult.data.length} colonias para CP ${extractedCP}`,
              );

              // 🆕 Poblar select de colonias
              this.populateColoniasSelect(coloniesResult.data);
              this.coloniaSelect.disabled = false;

              // Encontrar mejor coincidencia de colonia
              const bestMatch = addressService.findBestNeighborhoodMatch(
                addressText,
                coloniesResult.data,
              );

              if (bestMatch) {
                console.log('🎯 Mejor coincidencia encontrada:', bestMatch);

                // 🆕 Seleccionar automáticamente la colonia
                if (this.coloniaSelect) {
                  // Buscar la opción que coincida
                  const options = this.coloniaSelect.querySelectorAll('option');
                  for (let option of options) {
                    if (option.value === bestMatch.vcNeighborhood) {
                      option.selected = true;
                      break;
                    }
                  }

                  // Disparar evento change para actualizar campos ocultos
                  this.coloniaSelect.dispatchEvent(new Event('change'));
                }

                // Mostrar feedback visual al usuario
                this.showLocationMatchFeedback(bestMatch, extractedCP);

                // Actualizar progreso del formulario
                this._updateProgress();
              } else {
                // No se encontró coincidencia exacta, pero hay colonias disponibles
                this.showLocationPartialFeedback(coloniesResult.data.length, extractedCP);
              }
            } else {
              console.warn('⚠️ No se encontraron colonias para CP:', extractedCP);
              this.showLocationErrorFeedback(
                `No se encontraron colonias para el código postal ${extractedCP}`,
              );
            }
          } catch (error) {
            console.error('❌ Error consultando colonias:', error);
            this.showLocationErrorFeedback('Error al consultar información de ubicación');
          } finally {
            this.showLocationLoadingIndicator(false);
          }
        } else {
          console.warn('⚠️ No se pudo extraer código postal de:', addressText);
          this.showLocationErrorFeedback('No se pudo detectar el código postal en la dirección');
        }
      }

      // 5. Sección (código existente)
      const opt1 = data.mrzResult?.sanitizedOpt1?.slice(0, 4);
      if (opt1) {
        const seccionEl = $('#seccion');
        if (seccionEl) seccionEl.value = opt1;
      }

      // 6. Imagen de perfil (código existente)
      if (data.faceImage) {
        this._showImage('profileImage', 'profilePlaceholder', data.faceImage);
        const faceImageEl = $('#faceImageData');
        if (faceImageEl) faceImageEl.value = data.faceImage;

        const profilePhoto = $('#profilePhoto');
        if (profilePhoto) {
          dom(profilePhoto).addClass('has-image');
        }
      }

      // 7. Campos ocultos (código existente)
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

      // 8. Actualizar progreso final
      this._updateProgress();

      console.log('✅ Formulario poblado exitosamente');
    } catch (error) {
      console.error('❌ Error en poblarFormulario:', error);
      window.mostrarMensajeEstado?.('⚠️ Error procesando datos del INE', 3000);
    }
  }

  /**
   * 🆕 Mostrar feedback de coincidencia encontrada
   */
  showLocationMatchFeedback(neighborhood, postalCode) {
    // Remover feedback previo
    $('#locationFeedback')?.remove();

    const feedback = document.createElement('div');
    feedback.id = 'locationFeedback';
    feedback.className = 'location-feedback success';
    feedback.innerHTML = `
      <div class="feedback-icon">🎯</div>
      <div class="feedback-text">
        <strong>¡Ubicación detectada automáticamente!</strong><br>
        ${neighborhood.vcNeighborhood}, ${neighborhood.vcMunicipality}<br>
        <small>CP: ${postalCode}</small>
      </div>
    `;

    const domicilioEl = $('#domicilio');
    if (domicilioEl?.parentNode) {
      domicilioEl.parentNode.appendChild(feedback);

      // Auto-hide después de 5 segundos
      setTimeout(() => {
        if (feedback.parentNode) {
          feedback.classList.add('fade-out');
          setTimeout(() => feedback.remove(), 300);
        }
      }, 5000);
    }
  }

  /**
   * 🆕 Mostrar feedback de coincidencia parcial
   */
  showLocationPartialFeedback(coloniaCount, postalCode) {
    // Remover feedback previo
    $('#locationFeedback')?.remove();

    const feedback = document.createElement('div');
    feedback.id = 'locationFeedback';
    feedback.className = 'location-feedback info';
    feedback.innerHTML = `
      <div class="feedback-icon">📍</div>
      <div class="feedback-text">
        <strong>Código postal detectado: ${postalCode}</strong><br>
        ${coloniaCount} colonias disponibles. Selecciona la tuya.
      </div>
    `;

    const domicilioEl = $('#domicilio');
    if (domicilioEl?.parentNode) {
      domicilioEl.parentNode.appendChild(feedback);

      // Auto-hide después de 4 segundos
      setTimeout(() => {
        if (feedback.parentNode) {
          feedback.classList.add('fade-out');
          setTimeout(() => feedback.remove(), 300);
        }
      }, 4000);
    }
  }

  /**
   * Agrega campos hidden para los datos de ubicación
   */
  addLocationHiddenFields(neighborhood, postalCode) {
    // Remover campos previos si existen
    this.removeLocationHiddenFields();

    const hiddenFields = [
      { name: 'iNeighborhoodId', value: neighborhood.iNeighborhoodId || '' },
      { name: 'vcNeighborhood', value: neighborhood.vcNeighborhood || '' },
      { name: 'iZipCode', value: postalCode || '' },
      { name: 'iMunicipalityId', value: neighborhood.iMunicipalityId || '' },
      { name: 'vcMunicipality', value: neighborhood.vcMunicipality || '' },
      { name: 'vcState', value: neighborhood.vcState || '' },
      { name: 'codigoPostal', value: postalCode || '' }, // Para compatibilidad
      { name: 'colonia', value: neighborhood.vcNeighborhood || '' }, // Para compatibilidad
    ];

    hiddenFields.forEach(field => {
      if (field.value) {
        // Solo agregar si tiene valor
        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = field.name;
        input.value = field.value;
        input.classList.add('auto-location-field'); // Para fácil identificación
        this.form.appendChild(input);
      }
    });

    console.log(
      '✅ Campos de ubicación agregados:',
      hiddenFields.filter(f => f.value),
    );
  }

  /**
   * Remueve campos hidden de ubicación previos
   */
  removeLocationHiddenFields() {
    const existingFields = this.form?.querySelectorAll('.auto-location-field');
    existingFields?.forEach(field => field.remove());
  }

  /**
   * Muestra indicador de carga para consulta de ubicación
   */
  showLocationLoadingIndicator(show) {
    const domicilioEl = $('#domicilio');
    if (!domicilioEl) return;

    if (show) {
      // Agregar clase de loading
      dom(domicilioEl).addClass('loading-location');

      // Agregar spinner si no existe
      if (!$('#locationSpinner')) {
        const spinner = document.createElement('div');
        spinner.id = 'locationSpinner';
        spinner.className = 'field-spinner';
        spinner.innerHTML = '<div class="mini-spinner"></div>';
        domicilioEl.parentNode.appendChild(spinner);
      }
    } else {
      dom(domicilioEl).removeClass('loading-location');
      $('#locationSpinner')?.remove();
    }
  }

  /**
   * Muestra feedback de error en ubicación
   */
  showLocationErrorFeedback(message) {
    // Remover feedback previo
    $('#locationFeedback')?.remove();

    const feedback = document.createElement('div');
    feedback.id = 'locationFeedback';
    feedback.className = 'location-feedback warning';
    feedback.innerHTML = `
      <div class="feedback-icon">⚠️</div>
      <div class="feedback-text">
        <strong>Atención:</strong><br>
        ${message}
      </div>
    `;

    const domicilioEl = $('#domicilio');
    if (domicilioEl?.parentNode) {
      domicilioEl.parentNode.appendChild(feedback);

      // Auto-hide después de 3 segundos
      setTimeout(() => {
        if (feedback.parentNode) {
          feedback.classList.add('fade-out');
          setTimeout(() => feedback.remove(), 300);
        }
      }, 3000);
    }
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

    // 🆕 Limpiar referencias de ubicación
    this.cpInput = null;
    this.coloniaSelect = null;
  }
}
