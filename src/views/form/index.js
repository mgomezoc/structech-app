// src/views/form/index.js

import Handlebars from 'handlebars';
import './style.less';
import tplSource from './template.hbs?raw';

import logoUrl from '../../img/logo-icono-structech.png';
import { navigateTo } from '../../routes/index.js';
import { authService } from '../../services/auth.service.js';
import { datosService } from '../../services/datos.service.js';
import { dialogService } from '../../services/dialog.service.js';
import { hapticsService } from '../../services/haptics.service.js';
import { ROUTES } from '../../utils/constants.js';

import lottie from 'lottie-web';
import { audioRecorder } from '../../js/audioRecorder.js';
import { signatureManager } from '../../js/signature.js';
import animCamera from '../../lottie/camara.json';
import animProfile from '../../lottie/user.json';

const template = Handlebars.compile(tplSource);

export default class FormView {
  constructor() {
    this.user = authService.getCurrentUser();
  }

  render() {
    return template({
      user: {
        name: this.user?.name || this.user?.email || 'Usuario',
      },
      logoUrl,
    });
  }

  async afterRender() {
    // exposición para plugin de escaneo
    window.poblarFormulario = this.poblarFormulario.bind(this);

    // inicializaciones
    await this.initializeModules();
    // referencia al formulario
    this.form = document.getElementById('formPersona');
    // listener de eventos originales
    this.setupEventListeners();
    await this.loadInitialData();

    // progreso
    this.progressFill = document.getElementById('progressFill');
    this.progressText = document.getElementById('progressText');
    this._attachProgressListeners();
    this._updateProgress();

    // Inicializar estado del botón guardar
    const saveButton = this.form?.querySelector('.save-button');
    if (saveButton) {
      saveButton.disabled = true;
    }
  }

  async initializeModules() {
    signatureManager.init();
    await audioRecorder.init();

    lottie
      .loadAnimation({
        container: document.getElementById('profilePlaceholder'),
        renderer: 'svg',
        loop: true,
        autoplay: true,
        animationData: animProfile,
      })
      .setSpeed(0.5);

    lottie
      .loadAnimation({
        container: document.getElementById('scanIcon'),
        renderer: 'svg',
        loop: true,
        autoplay: true,
        animationData: animCamera,
      })
      .setSpeed(0.3);
  }

  setupEventListeners() {
    // ← Volver
    document.getElementById('backBtn')?.addEventListener('click', async () => {
      const ok = await this.confirmBackWithData();
      if (ok) {
        await hapticsService.light();
        navigateTo(ROUTES.DASHBOARD);
      }
    });

    // envío
    this.form?.addEventListener('submit', e => this.handleSubmit(e));

    // validar CURP duplicado
    document.getElementById('curp')?.addEventListener('blur', async () => {
      const curp = document.getElementById('curp').value.trim();
      if (curp && datosService.validarCurp(curp)) {
        await this.verificarCurpDuplicado(curp);
      }
    });

    // escaneo INE
    document.getElementById('btnScan')?.addEventListener('click', async () => {
      await hapticsService.medium();
      window.scanINE?.();
    });

    // carga subestructuras
    document.getElementById('estructura')?.addEventListener('change', async e => {
      await hapticsService.light();
      const estructuraId = e.target.value;
      const subSel = document.getElementById('subestructura');
      subSel.innerHTML = `<option value="">Sin selección</option>`;
      if (!estructuraId) {
        this._updateProgress();
        return;
      }
      const res = await datosService.obtenerSubestructuras(estructuraId);
      if (res.success) {
        await hapticsService.light();
        res.data.forEach(s => {
          subSel.innerHTML += `<option value="${s.iSubCatalogId}">${s.vcSubCatalog}</option>`;
        });
        subSel.disabled = false;
      } else {
        await hapticsService.error();
        window.mostrarMensajeEstado?.(`⚠️ ${res.error}`, 3000);
      }
      this._updateProgress();
    });
  }

  async loadInitialData() {
    const res = await datosService.obtenerEstructuras();
    if (res.success) {
      const sel = document.getElementById('estructura');
      sel.innerHTML = `<option value="">Sin selección</option>`;
      res.data.forEach(e => {
        sel.innerHTML += `<option value="${e.iCatalogId}">${e.vcCatalog}</option>`;
      });
      document.getElementById(
        'subestructura',
      ).innerHTML = `<option value="">Sin selección</option>`;
    }
  }

  async handleSubmit(e) {
    e.preventDefault();
    const btn = e.target.querySelector('.save-button');
    btn.disabled = true;
    btn.classList.add('loading');

    try {
      if (!signatureManager.hasSignature()) {
        await hapticsService.error();
        await dialogService.alert(
          'Firma Requerida',
          'Por favor proporcione su firma antes de continuar.',
        );
        return;
      }

      const shouldSubmit = await dialogService.confirm(
        'Confirmar Registro',
        '¿Estás seguro que deseas guardar este registro? Verifica que toda la información sea correcta.',
        'Guardar',
        'Revisar',
      );
      if (!shouldSubmit) return;

      await hapticsService.medium();
      const data = Object.fromEntries(new FormData(e.target).entries());
      data.signatureData = signatureManager.getSignatureAsBase64();

      if (audioRecorder.hasRecording()) {
        const audio = audioRecorder.getAudioData();
        data.audioData = audio.data;
        data.audioMimeType = audio.mimeType;
      }

      const result = await datosService.enviarFormularioPersona(data);
      if (!result.success) throw new Error(result.error);

      await hapticsService.success();
      const cont = await dialogService.successWithContinue(
        '¡Registro Guardado!',
        'Los datos se han guardado correctamente en el sistema.',
        'Crear Otro',
        'Dar de Alta Gestión',
      );

      e.target.reset();
      signatureManager.clear();
      audioRecorder.deleteRecording();
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

  async verificarCurpDuplicado(curp) {
    const r = await datosService.buscarPorCurp(curp);
    const el = document.getElementById('curp');
    if (r.success && r.exists) {
      window.mostrarMensajeEstado?.('⚠️ Ya existe un registro con este CURP', 3000);
      el.classList.add('error');
    } else {
      el.classList.remove('error');
    }
  }

  async confirmBackWithData() {
    const form = this.form;
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

  poblarFormulario(scanResult) {
    hapticsService.light();
    const data = scanResult.result || scanResult;
    const getVal = f => f?.description || f?.latin || '';

    document.getElementById('nombre').value = getVal(data.fullName);
    document.getElementById('apellidoPaterno').value = getVal(data.fathersName);
    document.getElementById('apellidoMaterno').value = getVal(data.mothersName);
    document.getElementById('curp').value = getVal(data.personalIdNumber);
    document.getElementById('claveElector').value = getVal(data.documentAdditionalNumber);

    if (data.dateOfBirth) {
      const { day, month, year } = data.dateOfBirth;
      document.getElementById('fechaNacimiento').value = [
        year,
        String(month).padStart(2, '0'),
        String(day).padStart(2, '0'),
      ].join('-');
    }

    const sex = getVal(data.sex).toUpperCase();
    if (sex === 'H') document.getElementById('hombre').checked = true;
    if (sex === 'M') document.getElementById('mujer').checked = true;

    if (data.address) {
      document.getElementById('domicilio').value = data.address.latin.replace(/\n/g, ' ');
    }
    const opt1 = data.mrzResult?.sanitizedOpt1?.slice(0, 4);
    if (opt1) document.getElementById('seccion').value = opt1;

    // Imagen de perfil
    if (data.faceImage) {
      this._showImage('profileImage', 'profilePlaceholder', data.faceImage);
      document.getElementById('faceImageData').value = data.faceImage;

      // Agregar clase visual de confirmación
      const profilePhoto = document.getElementById('profilePhoto');
      if (profilePhoto) {
        profilePhoto.classList.add('has-image');
      }
    }
    if (data.signatureImage) {
      document.getElementById('signatureImageData').value = data.signatureImage;
    }
    if (data.fullDocumentFrontImage)
      document.getElementById('fullDocumentFrontImage').value = data.fullDocumentFrontImage;
    if (data.fullDocumentBackImage)
      document.getElementById('fullDocumentBackImage').value = data.fullDocumentBackImage;
    if (data.documentNumber.description) {
      document.getElementById('idMex').value = data.documentNumber.description;
    }

    // tras poblar, refrescamos progreso
    this._updateProgress();
  }

  _showImage(imgId, placeholderId, base64) {
    const img = document.getElementById(imgId);
    const placeholder = document.getElementById(placeholderId);

    if (img && placeholder) {
      img.src = `data:image/png;base64,${base64}`;
      img.style.display = 'block';
      placeholder.style.display = 'none';
    }
  }

  //–––––– PROGRESS BAR ––––––//

  _attachProgressListeners() {
    if (!this.form) return;

    const controls = this.form.querySelectorAll('input, select, textarea');
    controls.forEach(ctrl => {
      ctrl.addEventListener('input', () => this._updateProgress());
      ctrl.addEventListener('change', () => this._updateProgress());
    });
  }

  _updateProgress() {
    if (!this.progressFill || !this.form) return;

    const required = this.form.querySelectorAll('[required]');
    const saveButton = this.form.querySelector('.save-button');
    let filled = 0;
    const countedGroups = new Set(); // Para evitar duplicados

    required.forEach(el => {
      // Manejar grupos de radio buttons
      if (el.type === 'radio') {
        const groupName = el.name;

        // Si ya contamos este grupo, saltar
        if (countedGroups.has(groupName)) return;

        // Verificar si algún radio del grupo está seleccionado
        const groupChecked = this.form.querySelector(`input[name="${groupName}"]:checked`);
        if (groupChecked) {
          filled++;
          countedGroups.add(groupName); // Marcar grupo como contado
        }
      }
      // Manejar otros campos
      else if (el.value && el.value.trim() !== '') {
        filled++;
      }
    });

    const pct = required.length ? Math.round((filled / required.length) * 100) : 0;
    this.progressFill.style.width = pct + '%';

    if (this.progressText) {
      this.progressText.textContent = pct === 100 ? '¡Listo para guardar!' : `${pct}% completado`;
    }

    // Habilitar/deshabilitar botón guardar
    if (saveButton) {
      saveButton.disabled = pct < 100;
    }
  }

  cleanup() {
    window.poblarFormulario = null;
  }
}
