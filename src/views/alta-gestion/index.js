// src/views/alta-gestion/index.js
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Geolocation } from '@capacitor/geolocation';
import Handlebars from 'handlebars';
import { router } from '../../routes/index.js';
import { apiService } from '../../services/api.service.js';
import { dialogService } from '../../services/dialog.service.js';
import { hapticsService } from '../../services/haptics.service.js';
import { keyboardService } from '../../services/keyboard.service.js';
import { ROUTES } from '../../utils/constants.js';
import { $, dom } from '../../utils/dom.helper.js';
import './style.less';
import tplSource from './template.hbs?raw';

const template = Handlebars.compile(tplSource);

// ========= Helpers para portal (montar modal en <body>) =========
function ensureModalRoot() {
  let root = document.getElementById('modal-root');
  if (!root) {
    root = document.createElement('div');
    root.id = 'modal-root';
    document.body.appendChild(root);
  }
  return root;
}
function mountToTopLayer(el) {
  const root = ensureModalRoot();
  if (el && el.parentElement !== root) root.appendChild(el);
}
// ================================================================

export default class AltaGestionView {
  constructor(context = {}) {
    this.context = context;
    this.isSubmitting = false;
    this.formData = {
      Type: null,
      Classification: null,
      Citizen: null,
      Description: '',
      File: '',
      Latitude: '',
      Longitude: '',
    };
    this.citizens = [];
    this.types = [];
    this.classifications = [];
    this.selectedFile = null;

    // unsub teclado
    this._keyboardUnsub = null;
  }

  render() {
    return template({
      title: 'Alta de gestión',
      backIcon: this._getBackIcon(),
      uploadIcon: this._getUploadIcon(),
      fileIcon: this._getFileIcon(),
      removeIcon: this._getRemoveIcon(),
      plusIcon: this._getPlusIcon(),
      chevronIcon: this._getChevronIcon(),
      cameraIcon: this._getCameraIcon(),
    });
  }

  async afterRender() {
    // --- REFERENCIAS DEL DOM ---
    this.form = $('#altaGestionForm');
    this.typeSelect = $('#typeSelect');
    this.classificationSelect = $('#classificationSelect');
    this.descriptionTextarea = $('#description');
    this.fileInput = $('#fileInput');
    this.fileUploadArea = $('#fileUploadArea');
    this.fileUploadContent = $('#fileUploadContent');
    this.filePreview = $('#filePreview');
    this.submitBtn = $('#submitBtn');
    this.charCounter = $('#charCounter');
    this.btnText = $('#btnText');
    this.btnLoader = $('#btnLoader');
    this.successOverlay = $('#successOverlay');
    this.cameraBtn = $('#cameraBtn');

    // Referencias para el nuevo selector de ciudadano
    this.citizenSelector = {
      trigger: $('#citizen-selector-trigger'),
      modal: $('#citizen-selector-modal'),
      closeBtn: $('#modal-close-btn'),
      searchInput: $('#citizen-search-input'),
      resultsList: $('#citizen-results-list'),
      loader: $('#citizenLoader'),
      selectedAvatar: $('#selected-citizen-avatar'),
      selectedName: $('#selected-citizen-name'),
    };

    // Monta la modal en <body> para evitar stacking con header sticky (iOS)
    mountToTopLayer(this.citizenSelector.modal);

    if (!this.form || !this.citizenSelector.trigger || !this.typeSelect) {
      console.error('Error: elementos del formulario no encontrados');
      return;
    }

    this._attachEventListeners();

    // Soporte básico de teclado móvil (simple y seguro)
    await this._setupKeyboardSupport();

    await this._loadInitialData();
  }

  _attachEventListeners() {
    // Volver
    dom('#backBtn').on('click', async () => {
      await hapticsService.light();
      router.navigate(ROUTES.DASHBOARD);
    });

    // Botón de cámara
    dom('#cameraBtn').on('click', async () => {
      await hapticsService.light();
      await this._takePicture();
    });

    // --- LÓGICA DEL NUEVO SELECTOR DE CIUDADANO ---
    dom(this.citizenSelector.trigger).on('click', () => this._openCitizenModal());
    dom(this.citizenSelector.closeBtn).on('click', () => this._closeCitizenModal());
    dom(this.citizenSelector.modal).on('click', e => {
      if (e.target === this.citizenSelector.modal) {
        this._closeCitizenModal(); // Cierra si se hace clic en el fondo
      }
    });
    dom(this.citizenSelector.searchInput).on('input', e => {
      this._filterCitizens(e.target.value);
    });
    dom(this.citizenSelector.resultsList).on('click', e => {
      const item = e.target.closest('li');
      if (item && item.dataset.id) {
        this._handleCitizenSelection(parseInt(item.dataset.id));
      }
    });

    dom('#citizen-results-list').on('keydown', e => {
      const items = Array.from(e.currentTarget.querySelectorAll('[role=option]'));
      let idx = items.findIndex(i => i.classList.contains('focused'));
      if (e.key === 'ArrowDown') idx = Math.min(idx + 1, items.length - 1);
      if (e.key === 'ArrowUp') idx = Math.max(idx - 1, 0);
      if (e.key.match(/Enter| /)) items[idx]?.click();
      items.forEach(i => i.classList.toggle('focused', items.indexOf(i) === idx));
      e.preventDefault();
    });

    // --- RESTO DE EVENT LISTENERS ---
    // Tipo
    dom(this.typeSelect).on('change', async e => {
      await hapticsService.selection();
      this.formData.Type = parseInt(e.target.value) || null;
      this.formData.Classification = null;
      this.classificationSelect.value = '';
      if (this.formData.Type) {
        await this._loadClassifications(this.formData.Type);
      } else {
        this.classificationSelect.innerHTML =
          '<option value="">Primero selecciona un tipo</option>';
        this.classificationSelect.disabled = true;
      }
      this._validateForm();
    });

    // Clasificación
    dom(this.classificationSelect).on('change', async e => {
      await hapticsService.selection();
      this.formData.Classification = parseInt(e.target.value) || null;
      this._validateForm();
    });

    // Descripción
    dom(this.descriptionTextarea).on('input', e => {
      let val = e.target.value;
      if (val.length > 500) {
        val = val.substring(0, 500);
        e.target.value = val;
      }
      this.formData.Description = val;
      this.charCounter.textContent = `${val.length} / 500`;
      this._validateForm();
    });

    // Drag & Drop archivo
    dom(this.fileUploadArea).on('dragover', e => {
      e.preventDefault();
      dom(this.fileUploadArea).addClass('drag-over');
    });
    dom(this.fileUploadArea).on('dragleave', () => {
      dom(this.fileUploadArea).removeClass('drag-over');
    });
    dom(this.fileUploadArea).on('drop', async e => {
      e.preventDefault();
      dom(this.fileUploadArea).removeClass('drag-over');
      if (e.dataTransfer.files.length > 0) {
        await this._handleFileSelect(e.dataTransfer.files[0]);
      }
    });

    // Click para seleccionar archivo
    dom('#selectFileBtn').on('click', async () => {
      await hapticsService.light();
      this.fileInput.click();
    });
    dom(this.fileInput).on('change', async e => {
      if (e.target.files.length > 0) {
        await this._handleFileSelect(e.target.files[0]);
      }
    });
    dom('#removeFileBtn').on('click', async () => {
      await hapticsService.light();
      this._removeFile();
    });

    // Submit
    dom(this.form).on('submit', e => this._handleSubmit(e));
  }

  // ==========================
  // Teclado móvil (simple)
  // ==========================
  async _setupKeyboardSupport() {
    try {
      await keyboardService.init();

      // contenedor para clases reactivas
      const container = document.querySelector('.form-container');

      // optimizar campos
      const inputs = document.querySelectorAll(
        '.form-container input:not([type="file"]), .form-container select, .form-container textarea, #citizen-search-input',
      );
      inputs.forEach(input => this._optimizeKeyboardType(input));

      // suscripción
      this._keyboardUnsub = keyboardService.subscribe((event, data) => {
        if (event === 'focus') {
          container?.classList.add('keyboard-active');
          keyboardService.scrollToInput(data);
        } else if (event === 'blur') {
          container?.classList.remove('keyboard-active');
        }
      });
    } catch (e) {
      // si falla, no rompe la vista
      console.warn('keyboardService no disponible:', e);
    }
  }

  _optimizeKeyboardType(input) {
    const map = {
      description: {
        autocapitalize: 'sentences',
        autocorrect: 'on',
        spellcheck: 'true',
        enterkeyhint: 'done',
      },
      'citizen-search-input': {
        inputmode: 'text',
        autocapitalize: 'words',
        autocorrect: 'off',
        spellcheck: 'false',
        enterkeyhint: 'search',
      },
      typeSelect: { enterkeyhint: 'next' },
      classificationSelect: { enterkeyhint: 'next' },
    };

    const conf = map[input.id] || { enterkeyhint: 'next' };
    Object.entries(conf).forEach(([k, v]) => input.setAttribute(k, v));

    // Evitar zoom en iOS
    if (input.tagName === 'INPUT' || input.tagName === 'SELECT' || input.tagName === 'TEXTAREA') {
      input.style.fontSize = '16px';
    }
  }
  // ====== Fin teclado ======

  async _loadInitialData() {
    try {
      const [citizensOk, typesOk] = await Promise.all([this._loadCitizens(), this._loadTypes()]);
      if (citizensOk && typesOk) this._validateForm();
    } catch (err) {
      console.error(err);
      await dialogService.alert('Error', 'No se pudieron cargar los datos iniciales.');
    }
  }

  async _loadCitizens() {
    const { loader, trigger, resultsList } = this.citizenSelector;
    try {
      dom(loader).removeClass('hidden');
      dom(trigger).css('pointer-events', 'none');

      const loc = await this._getCurrentLocation();
      const resp = await apiService.post('/api/combos/Citizens', {
        Phone: '',
        CURP: '',
        Mail: '',
        Names: '',
        latitude: loc.latitude.toString(),
        longitude: loc.longitude.toString(),
      });

      // Orden descendente por iCitizenId (más recientes primero)
      this.citizens = (resp.data || [])
        .slice()
        .sort((a, b) => (b.iCitizenId || 0) - (a.iCitizenId || 0));
      this._renderCitizensList(this.citizens);

      dom(trigger).css('pointer-events', 'auto');
      return true;
    } catch (err) {
      console.error(err);
      resultsList.innerHTML = '<li class="no-results">Error al cargar ciudadanos</li>';
      return false;
    } finally {
      dom(loader).addClass('hidden');
    }
  }

  // --- MÉTODOS DEL NUEVO SELECTOR DE CIUDADANO ---
  _openCitizenModal() {
    dom(this.citizenSelector.modal).removeClass('hidden').addClass('visible');
    document.body.classList.add('modal-open'); // bloquea scroll fondo en iOS
    // ❌ Sin auto-focus para evitar teclado inmediato
  }

  _closeCitizenModal() {
    dom(this.citizenSelector.modal).removeClass('visible').addClass('hidden');
    document.body.classList.remove('modal-open');
  }

  _renderCitizensList(citizens) {
    const list = this.citizenSelector.resultsList;
    if (citizens.length === 0) {
      list.innerHTML = `<li class="no-results">No se encontraron resultados</li>`;
      return;
    }
    list.innerHTML = citizens
      .map(
        c => `
        <li data-id="${c.iCitizenId}" role="option" tabindex="-1" class="selector-modal-item">
          <img src="${
            c.vcFace ||
            'https://ui-avatars.com/api/?name=' +
              (c.vcNames?.charAt(0) || '?') +
              '&background=e0e0e0&color=a0a0a0'
          }" 
            alt="${c.vcNames}" class="citizen-avatar">
          <span>${c.vcNames}</span>
        </li>
      `,
      )
      .join('');
  }

  _filterCitizens(searchTerm) {
    const term = searchTerm.toLowerCase().trim();
    if (!term) {
      this._renderCitizensList(this.citizens);
      return;
    }
    const filtered = this.citizens.filter(
      c => c.vcNames.toLowerCase().includes(term) || (c.vcPhone && c.vcPhone.includes(term)),
    );
    this._renderCitizensList(filtered);
  }

  async _handleCitizenSelection(citizenId) {
    await hapticsService.selection();
    this.formData.Citizen = citizenId;

    const selected = this.citizens.find(c => c.iCitizenId === citizenId);

    if (selected) {
      this.citizenSelector.selectedName.textContent = selected.vcNames;
      this.citizenSelector.selectedAvatar.src =
        selected.vcFace ||
        'https://ui-avatars.com/api/?name=' +
          selected.vcNames.charAt(0) +
          '&background=e0e0e0&color=a0a0a0';
    }

    this._closeCitizenModal();
    this._validateForm();
  }

  async _loadTypes() {
    const loader = $('#typeLoader');
    try {
      if (loader) dom(loader).removeClass('hidden');
      this.typeSelect.disabled = true;

      const resp = await apiService.get('/api/combos/Ticket_Types');
      this.types = resp.data || [];
      let html = '<option value="">Selecciona un tipo</option>';
      this.types.forEach(t => {
        html += `<option value="${t.iTypeId}">${t.vcType}</option>`;
      });
      this.typeSelect.innerHTML = html;
      this.typeSelect.disabled = false;
      return true;
    } catch (err) {
      console.error(err);
      this.typeSelect.innerHTML = '<option value="">Error al cargar</option>';
      return false;
    } finally {
      if (loader) dom(loader).addClass('hidden');
    }
  }

  async _loadClassifications(typeId) {
    const loader = $('#classificationLoader');
    try {
      if (loader) dom(loader).removeClass('hidden');
      this.classificationSelect.disabled = true;
      this.classificationSelect.innerHTML = '<option value="">Cargando clasificaciones...</option>';

      const resp = await apiService.get(`/api/combos/Classifications/${typeId}`);
      this.classifications = resp.data || [];
      let html = '<option value="">Selecciona una clasificación</option>';
      this.classifications.forEach(c => {
        html += `<option value="${c.iClassificationId}">${c.vcClassification}</option>`;
      });
      this.classificationSelect.innerHTML = html;
      this.classificationSelect.disabled = false;
    } catch (err) {
      console.error(err);
      this.classificationSelect.innerHTML = '<option value="">Error al cargar</option>';
    } finally {
      if (loader) dom(loader).addClass('hidden');
    }
  }

  async _takePicture() {
    try {
      // 1. Permisos
      const perms = await Camera.checkPermissions();
      if (perms.camera !== 'granted') {
        const req = await Camera.requestPermissions();
        if (req.camera !== 'granted') {
          await dialogService.alert(
            'Permiso denegado',
            'Se requiere acceso a la cámara para tomar fotos.',
          );
          return;
        }
      }

      // 2. Abrir cámara
      const image = await Camera.getPhoto({
        quality: 10,
        allowEditing: false,
        resultType: CameraResultType.Uri, // <--- usamos URI para ahorrar memoria
        source: CameraSource.Camera,
        saveToGallery: false,
      });

      // 3. Descargar blob desde la URI
      const response = await fetch(image.webPath);
      const blob = await response.blob();
      const arrayBuf = await blob.arrayBuffer();
      const uint8Arr = new Uint8Array(arrayBuf);

      // 4. Convertir a Base64
      const base64Data = btoa(
        uint8Arr.reduce((data, byte) => data + String.fromCharCode(byte), ''),
      );

      // 5. Preparar objeto "File" simulado
      const mimeType = blob.type || 'image/jpeg';
      const fileName = `foto_${Date.now()}.${mimeType.split('/')[1]}`;
      const photoFile = {
        name: fileName,
        size: blob.size,
        type: mimeType,
      };

      // 6. Actualizar estado y formulario
      this.selectedFile = photoFile;
      this.formData.File = base64Data;
      await hapticsService.success();

      // 7. Mostrar preview usando tu helper existente
      this._showPhotoPreview(photoFile, base64Data);
      this._validateForm();

      // 8. Toast de éxito
      window.mostrarMensajeEstado('📸 Foto capturada exitosamente', 2000);
    } catch (error) {
      console.error('Error al tomar foto:', error);
      await hapticsService.error();

      // Si el usuario canceló, no mostramos alerta
      if (error.message?.includes('User cancelled')) {
        return;
      }

      // Mensajes específicos
      if (error.message?.includes('Camera service not available')) {
        await dialogService.alert(
          'Cámara no disponible',
          'La cámara no está disponible en este dispositivo.',
        );
      } else {
        await dialogService.alert(
          'Error',
          'No se pudo tomar la foto. Por favor, intenta de nuevo.',
        );
      }
    }
  }

  _showPhotoPreview(file, base64Data) {
    // Actualizar la información del archivo
    $('#fileName').textContent = file.name;
    $('#fileSize').textContent = this._formatFileSize(file.size);

    // Para fotos, podemos mostrar un preview visual
    const filePreview = $('#filePreview');

    // Agregar una miniatura de la imagen si no existe
    let thumbnail = filePreview.querySelector('.file-thumbnail');
    if (!thumbnail) {
      thumbnail = document.createElement('img');
      thumbnail.className = 'file-thumbnail';
      const fileInfo = filePreview.querySelector('.file-info');
      if (fileInfo) {
        fileInfo.insertBefore(thumbnail, fileInfo.firstChild);
      }
    }

    // Establecer la imagen
    thumbnail.src = `data:image/jpeg;base64,${base64Data}`;
    thumbnail.alt = 'Vista previa de la foto';

    // Mostrar el preview
    dom(this.fileUploadContent).addClass('hidden');
    dom(this.filePreview).removeClass('hidden');
  }

  async _handleFileSelect(file) {
    const valid = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];
    const max = 5 * 1024 * 1024;
    if (!valid.includes(file.type)) {
      await hapticsService.error();
      return dialogService.alert('Error', 'Sólo JPG, PNG o PDF');
    }
    if (file.size > max) {
      await hapticsService.error();
      return dialogService.alert('Error', 'Máx. 5MB');
    }
    try {
      const b64 = await this._fileToBase64(file);
      this.selectedFile = file;
      this.formData.File = b64;
      await hapticsService.success();
      this._showFilePreview(file);
      this._validateForm();
    } catch (err) {
      console.error(err);
      await hapticsService.error();
      dialogService.alert('Error', 'No se pudo procesar el archivo');
    }
  }

  _fileToBase64(file) {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => {
        res(r.result.split(',')[1]);
      };
      r.onerror = rej;
      r.readAsDataURL(file);
    });
  }

  _showFilePreview(file) {
    $('#fileName').textContent = file.name;
    $('#fileSize').textContent = this._formatFileSize(file.size);
    dom(this.fileUploadContent).addClass('hidden');
    dom(this.filePreview).removeClass('hidden');
  }

  _removeFile() {
    this.selectedFile = null;
    this.formData.File = '';
    this.fileInput.value = '';

    // Remover miniatura si existe
    const thumbnail = this.filePreview?.querySelector('.file-thumbnail');
    if (thumbnail) {
      thumbnail.remove();
    }

    dom(this.fileUploadContent).removeClass('hidden');
    dom(this.filePreview).addClass('hidden');
    this._validateForm();
  }

  _formatFileSize(b) {
    if (b === 0) return '0 Bytes';
    const k = 1024,
      sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(b) / Math.log(k));
    return `${(b / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
  }

  async _getCurrentLocation() {
    try {
      const pos = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 10000,
      });
      return pos.coords;
    } catch {
      return new Promise(resolve => {
        if (!navigator.geolocation) {
          return resolve({ latitude: 25.6830443, longitude: -100.4683308 });
        }
        navigator.geolocation.getCurrentPosition(
          pos => resolve(pos.coords),
          () => resolve({ latitude: 25.6830443, longitude: -100.4683308 }),
          { enableHighAccuracy: true, timeout: 10000 },
        );
      });
    }
  }

  _validateForm() {
    // Validar campos
    const pasos = [
      this.formData.Citizen,
      this.formData.Type,
      this.formData.Classification,
      this.formData.Description.trim(),
    ];
    const llenos = pasos.filter(v => v).length;
    // Actualizar barra de progreso
    const pct = Math.round((llenos / pasos.length) * 100);
    dom('#progressFill').css('width', pct + '%');

    const ok = llenos === pasos.length;
    if (this.submitBtn) this.submitBtn.disabled = !ok;
  }

  async _handleSubmit(e) {
    e.preventDefault();
    if (this.isSubmitting) return;
    await hapticsService.light();
    this._setLoading(true);

    try {
      const loc = await this._getCurrentLocation();
      this.formData.Latitude = loc.latitude.toString();
      this.formData.Longitude = loc.longitude.toString();

      const payload = {
        Type: this.formData.Type,
        Classification: this.formData.Classification,
        Citizen: this.formData.Citizen,
        Description: this.formData.Description,
        File: this.formData.File || '',
        Latitude: this.formData.Latitude,
        Longitude: this.formData.Longitude,
      };

      const resp = await apiService.post('/api/ticket/ticket', payload);
      const { success, ticketId } = resp.data;

      if (success) {
        // Toast
        await hapticsService.success();
        window.mostrarMensajeEstado(`✅ Gestión ${ticketId} creada exitosamente`, 3000);

        // Overlay con ID
        dom('#successMessage').text(`¡Gestión creada! ID: ${ticketId}`);
        dom('#successOverlay').removeClass('hidden');

        // Redirigir
        setTimeout(() => router.navigate(ROUTES.DASHBOARD), 1500);
      }
    } catch (err) {
      console.error(err);
      await hapticsService.error();
      let msg = 'Error al crear la gestión';
      if (err.response?.data?.message) msg = err.response.data.message;
      else if (err.response?.status === 413)
        msg = 'El archivo es muy grande. Usa un archivo menor a 5MB.';
      await dialogService.alert('Error', msg);
    } finally {
      this._setLoading(false);
    }
  }

  _setLoading(on) {
    this.isSubmitting = on;
    dom(this.submitBtn).attr('disabled', on || null);
    dom(this.btnText).css('display', on ? 'none' : 'inline');
    dom(this.btnLoader).css('display', on ? 'inline-flex' : 'none');
  }

  // Helpers para iconos SVG
  _getBackIcon() {
    return `<svg viewBox="0 0 24 24" width="20" height="20">
      <path fill="currentColor" d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/>
    </svg>`;
  }

  _getUploadIcon() {
    return `<svg viewBox="0 0 24 24" width="48" height="48" class="upload-icon">
      <path fill="currentColor" d="M9 16h6v-6h4l-7-7-7 7h4zm-4 2h14v2H5z"/>
    </svg>`;
  }

  _getFileIcon() {
    return `<svg viewBox="0 0 24 24" width="32" height="32" class="file-icon">
      <path fill="currentColor" d="M13 9V3.5L18.5 9M6 2c-1.11 0-2 .89-2 2v16c0 1.11.89 2 2 2h12c1.11 0 2-.89 2-2V8l-6-6H6z"/>
    </svg>`;
  }

  _getRemoveIcon() {
    return `<svg viewBox="0 0 24 24" width="20" height="20">
      <path fill="currentColor" d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
    </svg>`;
  }

  _getPlusIcon() {
    return `<svg viewBox="0 0 24 24" width="20" height="20">
      <path fill="currentColor" d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
    </svg>`;
  }

  _getChevronIcon() {
    return `<svg class="select-icon" viewBox="0 0 24 24" width="16" height="16">
      <path fill="currentColor" d="M7 10l5 5 5-5z"/>
    </svg>`;
  }

  _getCameraIcon() {
    return `<svg viewBox="0 0 24 24" width="20" height="20">
      <path fill="currentColor" d="M12 15.2c-1.7 0-3.1-1.4-3.1-3.1S10.3 9 12 9s3.1 1.4 3.1 3.1-1.4 3.1-3.1 3.1zm7-9.2h-2.4l-1.3-2h-6.6L7.4 6H5C3.3 6 2 7.3 2 9v9c0 1.7 1.3 3 3 3h14c1.7 0 3-1.3 3-3V9c0-1.7-1.3-3-3-3z"/>
    </svg>`;
  }

  cleanup() {
    // limpiar keyboardService
    if (this._keyboardUnsub) this._keyboardUnsub();
    keyboardService.cleanup?.();

    // Aquí puedes desuscribir otros listeners si lo deseas
    console.log('🧹 Limpieza Alta Gestión');
  }
}
