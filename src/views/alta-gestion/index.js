// src/views/alta-gestion/index.js

import { Geolocation } from '@capacitor/geolocation';
import Handlebars from 'handlebars';
import { router } from '../../routes/index.js';
import { apiService } from '../../services/api.service.js';
import { dialogService } from '../../services/dialog.service.js';
import { hapticsService } from '../../services/haptics.service.js';
import { ROUTES } from '../../utils/constants.js';
import { $, dom } from '../../utils/dom.helper.js';
import './style.less';
import tplSource from './template.hbs?raw';

const template = Handlebars.compile(tplSource);

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
    });
  }

  async afterRender() {
    // Referencias a elementos - verificar que existan antes de asignar
    this.form = $('#altaGestionForm');
    this.citizenSelect = $('#citizenSelect');
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

    // Solo continuar si los elementos esenciales existen
    if (!this.form || !this.citizenSelect || !this.typeSelect || !this.classificationSelect) {
      console.error('Error: No se encontraron elementos esenciales del formulario');
      return;
    }

    this._attachEventListeners();
    await this._loadInitialData();
  }

  _attachEventListeners() {
    // Navegación
    dom('#backBtn').on('click', async () => {
      await hapticsService.light();
      router.navigate(ROUTES.DASHBOARD);
    });

    // Selects
    dom(this.citizenSelect).on('change', async e => {
      await hapticsService.selection();
      this.formData.Citizen = parseInt(e.target.value) || null;
      this._validateForm();
    });

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

    dom(this.classificationSelect).on('change', async e => {
      await hapticsService.selection();
      this.formData.Classification = parseInt(e.target.value) || null;
      this._validateForm();
    });

    // Descripción
    dom(this.descriptionTextarea).on('input', e => {
      const value = e.target.value;
      const length = value.length;

      this.formData.Description = value;
      this.charCounter.textContent = `${length} / 500`;

      if (length > 500) {
        e.target.value = value.substring(0, 500);
        this.formData.Description = e.target.value;
        this.charCounter.textContent = '500 / 500';
      }

      this._validateForm();
    });

    // Archivo - Drag & Drop
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

      const files = e.dataTransfer.files;
      if (files.length > 0) {
        await hapticsService.light();
        await this._handleFileSelect(files[0]);
      }
    });

    // Archivo - Click
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

  async _loadInitialData() {
    try {
      // Cargar ciudadanos y tipos en paralelo
      const [citizensResult, typesResult] = await Promise.all([
        this._loadCitizens(),
        this._loadTypes(),
      ]);

      // Habilitar el botón si todo está bien
      if (citizensResult && typesResult) {
        this._validateForm();
      }
    } catch (error) {
      console.error('Error al cargar datos iniciales:', error);
      await dialogService.alert('Error', 'Error al cargar los datos. Por favor recarga la página.');
    }
  }

  async _loadCitizens() {
    try {
      const loader = $('#citizenLoader');
      if (loader) {
        dom(loader).removeClass('hidden');
      }

      if (this.citizenSelect) {
        this.citizenSelect.disabled = true;
      }

      // Obtener ubicación actual
      const location = await this._getCurrentLocation();

      const response = await apiService.post('/api/combos/Citizens', {
        Phone: '',
        CURP: '',
        Mail: '',
        Names: '',
        latitude: location.latitude.toString(),
        longitude: location.longitude.toString(),
      });

      this.citizens = response.data || [];

      // Llenar el select
      let optionsHtml = '<option value="">Selecciona un ciudadano</option>';
      this.citizens.forEach(citizen => {
        const displayName = citizen.vcNames || citizen.vcPhone || 'Sin nombre';
        optionsHtml += `<option value="${citizen.iCitizenId}">${displayName}</option>`;
      });

      if (this.citizenSelect) {
        this.citizenSelect.innerHTML = optionsHtml;
        this.citizenSelect.disabled = false;
      }

      return true;
    } catch (error) {
      console.error('Error al cargar ciudadanos:', error);
      if (this.citizenSelect) {
        this.citizenSelect.innerHTML = '<option value="">Error al cargar ciudadanos</option>';
      }
      return false;
    } finally {
      const loader = $('#citizenLoader');
      if (loader) {
        dom(loader).addClass('hidden');
      }
    }
  }

  async _loadTypes() {
    try {
      const loader = $('#typeLoader');
      if (loader) {
        dom(loader).removeClass('hidden');
      }

      if (this.typeSelect) {
        this.typeSelect.disabled = true;
      }

      const response = await apiService.get('/api/combos/Ticket_Types');
      this.types = response.data || [];

      // Llenar el select
      let optionsHtml = '<option value="">Selecciona un tipo</option>';
      this.types.forEach(type => {
        optionsHtml += `<option value="${type.iTypeId}">${type.vcType}</option>`;
      });

      if (this.typeSelect) {
        this.typeSelect.innerHTML = optionsHtml;
        this.typeSelect.disabled = false;
      }

      return true;
    } catch (error) {
      console.error('Error al cargar tipos:', error);
      if (this.typeSelect) {
        this.typeSelect.innerHTML = '<option value="">Error al cargar tipos</option>';
      }
      return false;
    } finally {
      const loader = $('#typeLoader');
      if (loader) {
        dom(loader).addClass('hidden');
      }
    }
  }

  async _loadClassifications(typeId) {
    try {
      const loader = $('#classificationLoader');
      if (loader) {
        dom(loader).removeClass('hidden');
      }

      if (this.classificationSelect) {
        this.classificationSelect.disabled = true;
        this.classificationSelect.innerHTML =
          '<option value="">Cargando clasificaciones...</option>';
      }

      const response = await apiService.get(`/api/combos/Classifications/${typeId}`);
      this.classifications = response.data || [];

      // Llenar el select
      let optionsHtml = '<option value="">Selecciona una clasificación</option>';
      this.classifications.forEach(classification => {
        optionsHtml += `<option value="${classification.iClassificationId}">${classification.vcClassification}</option>`;
      });

      if (this.classificationSelect) {
        this.classificationSelect.innerHTML = optionsHtml;
        this.classificationSelect.disabled = false;
      }
    } catch (error) {
      console.error('Error al cargar clasificaciones:', error);
      if (this.classificationSelect) {
        this.classificationSelect.innerHTML =
          '<option value="">Error al cargar clasificaciones</option>';
      }
    } finally {
      const loader = $('#classificationLoader');
      if (loader) {
        dom(loader).addClass('hidden');
      }
    }
  }

  async _handleFileSelect(file) {
    // Validar tipo de archivo
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];
    if (!validTypes.includes(file.type)) {
      await hapticsService.error();
      await dialogService.alert('Error', 'Por favor selecciona un archivo JPG, PNG o PDF');
      return;
    }

    // Validar tamaño (5MB)
    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      await hapticsService.error();
      await dialogService.alert('Error', 'El archivo no debe superar los 5MB');
      return;
    }

    // Convertir a base64
    try {
      const base64 = await this._fileToBase64(file);
      this.selectedFile = file;
      this.formData.File = base64;

      // Mostrar preview
      await hapticsService.success();
      this._showFilePreview(file);
      this._validateForm();
    } catch (error) {
      console.error('Error al procesar archivo:', error);
      await hapticsService.error();
      await dialogService.alert('Error', 'Error al procesar el archivo');
    }
  }

  _fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = reader.result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  _showFilePreview(file) {
    const fileName = file.name;
    const fileSize = this._formatFileSize(file.size);

    $('#fileName').textContent = fileName;
    $('#fileSize').textContent = fileSize;

    dom(this.fileUploadContent).addClass('hidden');
    dom(this.filePreview).removeClass('hidden');
  }

  _removeFile() {
    this.selectedFile = null;
    this.formData.File = '';
    this.fileInput.value = '';

    dom(this.fileUploadContent).removeClass('hidden');
    dom(this.filePreview).addClass('hidden');

    this._validateForm();
  }

  _formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  async _getCurrentLocation() {
    try {
      const pos = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 10000,
      });
      return pos.coords;
    } catch {
      // Fallback con navigator.geolocation
      return new Promise(resolve => {
        if (!navigator.geolocation) {
          // Coordenadas por defecto
          return resolve({
            latitude: 25.683044339204386,
            longitude: -100.46833076762884,
          });
        }
        navigator.geolocation.getCurrentPosition(
          pos => resolve(pos.coords),
          () => {
            // Coordenadas por defecto si falla
            resolve({
              latitude: 25.683044339204386,
              longitude: -100.46833076762884,
            });
          },
          { enableHighAccuracy: true, timeout: 10000 },
        );
      });
    }
  }

  _validateForm() {
    const isValid =
      this.formData.Citizen &&
      this.formData.Type &&
      this.formData.Classification &&
      this.formData.Description.trim().length > 0;

    if (this.submitBtn) {
      this.submitBtn.disabled = !isValid;
    }
  }

  async _handleSubmit(e) {
    e.preventDefault();
    if (this.isSubmitting) return;

    await hapticsService.light();
    this._setLoading(true);

    try {
      // Obtener ubicación actual
      const location = await this._getCurrentLocation();
      this.formData.Latitude = location.latitude.toString();
      this.formData.Longitude = location.longitude.toString();

      // Preparar payload
      const payload = {
        Type: this.formData.Type,
        Classification: this.formData.Classification,
        Citizen: this.formData.Citizen,
        Description: this.formData.Description,
        File: this.formData.File || '',
        Latitude: this.formData.Latitude,
        Longitude: this.formData.Longitude,
      };

      console.log('📤 Enviando gestión:', payload);

      const response = await apiService.post('/api/ticket/ticket', payload);

      if (response.data) {
        await hapticsService.success();
        window.mostrarMensajeEstado?.('✅ Gestión creada exitosamente', 2000);

        // Pequeña pausa para que el usuario vea el mensaje
        setTimeout(() => {
          router.navigate(ROUTES.DASHBOARD);
        }, 1500);
      }
    } catch (error) {
      console.error('Error al crear gestión:', error);
      await hapticsService.error();

      let errorMessage = 'Error al crear la gestión';
      if (error.response?.data?.message) {
        errorMessage = error.response.data.message;
      } else if (error.response?.status === 413) {
        errorMessage = 'El archivo es muy grande. Por favor usa un archivo más pequeño.';
      }

      await dialogService.alert('Error', errorMessage);
    } finally {
      this._setLoading(false);
    }
  }

  _setLoading(on) {
    this.isSubmitting = on;

    if (this.submitBtn) {
      dom(this.submitBtn).attr('disabled', on || null);
    }

    if (this.btnText) {
      dom(this.btnText).css('display', on ? 'none' : 'inline');
    }

    if (this.btnLoader) {
      dom(this.btnLoader).css('display', on ? 'inline-flex' : 'none');
    }
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

  cleanup() {
    // Limpiar event listeners si es necesario
    console.log('🧹 Limpiando vista Alta Gestión');
  }
}
