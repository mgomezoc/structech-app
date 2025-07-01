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

import { createElement, dom } from '../../utils/dom.helper.js'; // ← import dom helper

const template = Handlebars.compile(tplSource);

export default class EnrollmentManualView {
  constructor() {
    this.logoUrl = logoUrl;
  }

  render() {
    return template({ logoUrl: this.logoUrl });
  }

  async afterRender() {
    // 1) inicializar firma y audio
    signatureManager.init();
    await audioRecorder.init();

    // 2) capturar referencias con el wrapper DOM
    this.form = dom('#enrollForm');
    this.backBtn = dom('#backBtn');
    this.estrSelect = dom('#estructura');
    this.subSelect = dom('#subestructura');
    this.cpInput = dom('#codigoPostal');
    this.coloniaSelect = dom('#colonia');
    this.calleNumero = dom('#calleNumero');
    this.fileInput = dom('#otherFile');
    this.hiddenOtherData = dom('#otherData');
    this.filePreview = dom('#filePreview');
    this.clearSigBtn = dom('#clearSignature');
    this.undoSigBtn = dom('#undoSignature');

    // 3) wiring de eventos
    this.backBtn.on('click', () => navigateTo(ROUTES.DASHBOARD));

    this.clearSigBtn.on('click', () => signatureManager.clear());
    this.undoSigBtn.on('click', () => signatureManager.undo());

    this.form.on('submit', e => this.handleSubmit(e));

    // 4) cargar estructuras
    const estrRes = await datosService.obtenerEstructuras();
    if (estrRes.success) {
      estrRes.data.forEach(e =>
        this.estrSelect
          .get()
          .appendChild(createElement('option', { value: e.iCatalogId }, e.vcCatalog)),
      );
    }

    // 5) cuando cambia la estructura, recargar subestructuras
    this.estrSelect.on('change', async e => {
      const id = e.target.value;
      // reset
      this.subSelect.html(`<option value="">Sin selección</option>`);
      if (!id) return;

      const subRes = await datosService.obtenerSubestructuras(id);
      if (subRes.success) {
        subRes.data.forEach(s =>
          this.subSelect
            .get()
            .appendChild(createElement('option', { value: s.iSubCatalogId }, s.vcSubCatalog)),
        );
      }
    });

    // 6) al salir del CP, recargar colonias
    this.cpInput.on('blur', async e => {
      const cp = e.target.value.trim();
      if (!cp) return;
      const colRes = await datosService.obtenerColoniasPorCP(cp);
      if (colRes.success && Array.isArray(colRes.data)) {
        // reset
        this.coloniaSelect.html(`<option value="">— Selecciona tu colonia —</option>`);
        colRes.data.forEach(c => {
          const opt = createElement(
            'option',
            {
              value: c.vcNeighborhood,
              dataset: {
                municipio: c.vcMunicipality,
                estado: c.vcState,
                cp: c.iZipCode,
              },
            },
            c.vcNeighborhood,
          );
          this.coloniaSelect.get().appendChild(opt);
        });
      }
    });

    // 7) previsualización de imagen + Base64
    this.fileInput.on('change', e => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = () => {
        const [, base64] = reader.result.split(',');
        this.hiddenOtherData.attr('value', base64); // input hidden
        this.filePreview.html(`<img src="${reader.result}" alt="Preview" />`);
      };
      reader.readAsDataURL(file);
    });
  }

  async handleSubmit(e) {
    e.preventDefault();

    const btn = dom('.save-button', this.form.get());
    btn.attr('disabled', 'true').addClass('loading');

    try {
      // 1) validar firma
      if (!signatureManager.hasSignature()) {
        throw new Error('Por favor, proporciona tu firma');
      }

      // 2) armar el payload desde el form
      const data = Object.fromEntries(new FormData(this.form.get()).entries());
      data.signatureData = signatureManager.getSignatureAsBase64();

      // 3) audio opcional
      if (audioRecorder.hasRecording()) {
        const { data: audioData, mimeType } = audioRecorder.getAudioData();
        data.audioData = audioData;
        data.audioMimeType = mimeType;
      }

      // 4) armar domicilio con la opción seleccionada
      const sel = this.coloniaSelect.get().selectedOptions[0];
      data.domicilio = [
        this.calleNumero.value.trim(),
        sel.value,
        sel.dataset.municipio,
        sel.dataset.estado,
        sel.dataset.cp,
      ].join(', ');

      // 5) llamar al servicio
      const result = await enrollmentService.enrollManual(data);
      if (!result.success) throw new Error(result.error);

      // 6) éxito: limpiar UI
      window.mostrarMensajeEstado('✅ Enrolamiento exitoso', 3000);
      this.form.get().reset();
      this.filePreview.html('');
      this.coloniaSelect.html(`<option value="">— Selecciona tu colonia —</option>`);
      signatureManager.clear();
      audioRecorder.deleteRecording();
    } catch (err) {
      window.mostrarMensajeEstado(`❌ ${err.message}`, 5000);
    } finally {
      btn.removeClass('loading').removeAttr('disabled');
    }
  }

  cleanup() {
    // si quieres eliminar listeners:
    this.backBtn.off('click');
    this.clearSigBtn.off('click');
    this.undoSigBtn.off('click');
    this.form.off('submit');
  }
}
