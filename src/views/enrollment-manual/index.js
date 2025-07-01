// src/views/enrollment-manual/index.js

import Handlebars from 'handlebars';
import '../form/style.less';
import './style.less';
import tplSource from './template.hbs?raw';

import logoUrl from '../../img/logo-icono-structech.png';
import { navigateTo } from '../../routes/index.js';
import { datosService } from '../../services/datos.service.js';
import { enrollmentService } from '../../services/enrollment.service.js';
import { ROUTES } from '../../utils/constants.js';

import { audioRecorder } from '../../js/audioRecorder.js';
import { signatureManager } from '../../js/signature.js';

const template = Handlebars.compile(tplSource);

export default class EnrollmentManualView {
  constructor() {
    this.logoUrl = logoUrl;
  }

  render() {
    return template({ logoUrl: this.logoUrl });
  }

  async afterRender() {
    // Inicializar firma y audio
    signatureManager.init();
    await audioRecorder.init();

    // Referencias DOM
    this.form = document.getElementById('enrollForm');
    this.backBtn = document.getElementById('backBtn');
    this.estrSelect = document.getElementById('estructura');
    this.subSelect = document.getElementById('subestructura');
    this.cpInput = document.getElementById('codigoPostal');
    this.coloniaSelect = document.getElementById('colonia');
    this.calleNumeroInput = document.getElementById('calleNumero');
    this.fileInput = document.getElementById('otherFile');
    this.hiddenOtherData = document.getElementById('otherData');
    this.filePreview = document.getElementById('filePreview');

    // Controles de firma
    this.clearSignatureBtn = document.getElementById('clearSignature');
    this.undoSignatureBtn = document.getElementById('undoSignature');

    this.clearSignatureBtn.addEventListener('click', () => {
      signatureManager.clear();
    });
    this.undoSignatureBtn.addEventListener('click', () => {
      signatureManager.undo();
    });

    // ← Volver
    this.backBtn.addEventListener('click', () => navigateTo(ROUTES.DASHBOARD));

    // Envío de formulario
    this.form.addEventListener('submit', e => this.handleSubmit(e));

    // 1) Cargar estructuras
    const estrRes = await datosService.obtenerEstructuras();
    if (estrRes.success) {
      estrRes.data.forEach(e => {
        this.estrSelect.innerHTML += `
          <option value="${e.iCatalogId}">${e.vcCatalog}</option>
        `;
      });
    }

    // 2) Cambiar estructura → subestructuras
    this.estrSelect.addEventListener('change', async e => {
      const id = e.target.value;
      this.subSelect.innerHTML = `<option value="">Sin selección</option>`;
      if (!id) return;
      const subRes = await datosService.obtenerSubestructuras(id);
      if (subRes.success) {
        subRes.data.forEach(s => {
          this.subSelect.innerHTML += `
            <option value="${s.iSubCatalogId}">${s.vcSubCatalog}</option>
          `;
        });
      }
    });

    // 3) Código Postal → colonias
    this.cpInput.addEventListener('blur', async e => {
      const cp = e.target.value.trim();
      if (!cp) return;
      const colRes = await datosService.obtenerColoniasPorCP(cp);
      if (colRes.success && Array.isArray(colRes.data)) {
        this.coloniaSelect.innerHTML = `<option value="">— Selecciona tu colonia —</option>`;
        colRes.data.forEach(c => {
          this.coloniaSelect.innerHTML += `
            <option
              value="${c.vcNeighborhood}"
              data-municipio="${c.vcMunicipality}"
              data-estado="${c.vcState}"
              data-cp="${c.iZipCode}"
            >
              ${c.vcNeighborhood}
            </option>
          `;
        });
      }
    });

    // 4) Previsualización y Base64 del archivo
    this.fileInput.addEventListener('change', e => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const [_, base64] = reader.result.split(',');
        this.hiddenOtherData.value = base64;
        this.filePreview.innerHTML = `<img src="${reader.result}" alt="Preview" />`;
      };
      reader.readAsDataURL(file);
    });
  }

  async handleSubmit(e) {
    e.preventDefault();
    const btn = this.form.querySelector('.save-button');
    btn.disabled = true;
    btn.classList.add('loading');

    try {
      // Revisar firma
      if (!signatureManager.hasSignature()) {
        throw new Error('Por favor, proporciona tu firma');
      }

      // Construir payload
      const data = Object.fromEntries(new FormData(this.form).entries());

      // Agregar datos de firma
      data.signatureData = signatureManager.getSignatureAsBase64();

      // Agregar datos de audio si existen
      if (audioRecorder.hasRecording()) {
        const audio = audioRecorder.getAudioData();
        data.audioData = audio.data;
        data.audioMimeType = audio.mimeType;
      }

      // Armar domicilio para geocoding
      const option = this.coloniaSelect.options[this.coloniaSelect.selectedIndex];
      const calleNumero = this.calleNumeroInput.value.trim();
      const colonia = option.value;
      const municipio = option.dataset.municipio;
      const estado = option.dataset.estado;
      const codigoPostal = option.dataset.cp;
      data.domicilio = `${calleNumero}, ${colonia}, ${municipio}, ${estado}, ${codigoPostal}`;

      // Enviar
      const result = await enrollmentService.enrollManual(data);
      if (!result.success) throw new Error(result.error);

      window.mostrarMensajeEstado('✅ Enrolamiento exitoso', 3000);
      this.form.reset();
      this.filePreview.innerHTML = '';
      this.coloniaSelect.innerHTML = `<option value="">— Selecciona tu colonia —</option>`;
      signatureManager.clear();
      audioRecorder.deleteRecording();
    } catch (err) {
      window.mostrarMensajeEstado(`❌ ${err.message}`, 5000);
    } finally {
      btn.disabled = false;
      btn.classList.remove('loading');
    }
  }

  cleanup() {
    window.poblarFormulario = null;
  }
}
