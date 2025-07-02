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
    // Referencias
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
    this.successOverlay = $('#successOverlay');

    if (!this.form || !this.citizenSelect || !this.typeSelect || !this.classificationSelect) {
      console.error('Error: elementos del formulario no encontrados');
      return;
    }

    this._attachEventListeners();
    await this._loadInitialData();
  }

  _attachEventListeners() {
    // Volver
    dom('#backBtn').on('click', async () => {
      await hapticsService.light();
      router.navigate(ROUTES.DASHBOARD);
    });

    // Ciudadano
    dom(this.citizenSelect).on('change', async e => {
      await hapticsService.selection();
      this.formData.Citizen = parseInt(e.target.value) || null;
      this._validateForm();
    });

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
    const loader = $('#citizenLoader');
    try {
      if (loader) dom(loader).removeClass('hidden');
      this.citizenSelect.disabled = true;

      const loc = await this._getCurrentLocation();
      const resp = await apiService.post('/api/combos/Citizens', {
        Phone: '',
        CURP: '',
        Mail: '',
        Names: '',
        latitude: loc.latitude.toString(),
        longitude: loc.longitude.toString(),
      });

      this.citizens = resp.data || [];
      let html = '<option value="">Selecciona un ciudadano</option>';
      this.citizens.forEach(c => {
        const name = c.vcNames || c.vcPhone || 'Sin nombre';
        html += `<option value="${c.iCitizenId}">${name}</option>`;
      });
      this.citizenSelect.innerHTML = html;
      this.citizenSelect.disabled = false;
      return true;
    } catch (err) {
      console.error(err);
      this.citizenSelect.innerHTML = '<option value="">Error al cargar</option>';
      return false;
    } finally {
      if (loader) dom(loader).addClass('hidden');
    }
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

  cleanup() {
    // Aquí puedes desuscribir listeners si lo deseas
    console.log('🧹 Limpieza Alta Gestión');
  }
}
