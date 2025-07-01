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

import { generateCurp } from '../../utils/curp.helper.js';
import { createElement, debounce, dom } from '../../utils/dom.helper.js';
import { ESTADOS_MEXICO } from '../../utils/estados.js';

const template = Handlebars.compile(tplSource);

export default class EnrollmentManualView {
  constructor() {
    this.logoUrl = logoUrl;
  }

  render() {
    // pasamos la lista de estados al template
    return template({
      logoUrl: this.logoUrl,
      estados: ESTADOS_MEXICO,
    });
  }

  async afterRender() {
    // inicializar firma y audio
    signatureManager.init();
    await audioRecorder.init();

    // referencias DOM
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
    this.estadoNacimiento = dom('#estadoNacimiento');
    this.curpField = dom('#curp');
    this.recalcCurpBtn = dom('#recalcularCurp');
    this.submitBtn = dom('#submitBtn');

    // wiring de eventos estáticos
    this.backBtn.on('click', () => navigateTo(ROUTES.DASHBOARD));
    this.clearSigBtn.on('click', () => signatureManager.clear());
    this.undoSigBtn.on('click', () => signatureManager.undo());
    this.form.on('submit', e => this.handleSubmit(e));
    this.recalcCurpBtn.on('click', () => this._actualizarCurp());

    // cargar estructuras
    const estrRes = await datosService.obtenerEstructuras();
    if (estrRes.success) {
      estrRes.data.forEach(e =>
        this.estrSelect
          .get()
          .appendChild(createElement('option', { value: e.iCatalogId }, e.vcCatalog)),
      );
    }

    // cambio de estructura → subestructuras
    this.estrSelect.on('change', async e => {
      const id = e.target.value;
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

    // cambio de CP → colonias
    this.cpInput.on('blur', async e => {
      const cp = e.target.value.trim();
      if (!cp) return;
      const colRes = await datosService.obtenerColoniasPorCP(cp);
      if (colRes.success && Array.isArray(colRes.data)) {
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

    // previsualización de imagen + Base64
    this.fileInput.on('change', e => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const [, base64] = reader.result.split(',');
        this.hiddenOtherData.attr('value', base64);
        this.filePreview.html(`<img src="${reader.result}" alt="Preview" />`);
      };
      reader.readAsDataURL(file);
    });

    // campos que influyen en la CURP
    const recalcFields = [
      dom('#nombre'),
      dom('#apellidoPaterno'),
      dom('#apellidoMaterno'),
      dom('#fechaNacimiento'),
      this.estadoNacimiento,
      dom('#hombre'),
      dom('#mujer'),
    ];
    const debouncedRecalc = debounce(() => this._actualizarCurp(), 300);

    recalcFields.forEach(
      field => field.exists() && field.on('input', debouncedRecalc).on('change', debouncedRecalc),
    );

    // cálculo inicial
    this._actualizarCurp();
  }

  _actualizarCurp() {
    try {
      const nombre = dom('#nombre').val().trim();
      const ap = dom('#apellidoPaterno').val().trim();
      const am = dom('#apellidoMaterno').val().trim();
      const fecha = dom('#fechaNacimiento').val();
      const genero = dom('#hombre').get().checked ? 'M' : 'F';
      const estadoClave = this.estadoNacimiento.val();

      let curp = '';
      if (nombre && ap && am && fecha && estadoClave) {
        curp = generateCurp({
          nombre,
          apellidoPaterno: ap,
          apellidoMaterno: am,
          fechaNacimiento: fecha,
          genero,
          estadoClave,
        }).toUpperCase();
      }

      // actualizar el campo y el estado del botón Enviar
      if (curp && curp.length === 18) {
        this.curpField.val(curp);
        this.submitBtn.removeAttr('disabled');
      } else {
        this.curpField.val('');
        this.submitBtn.attr('disabled', 'true');
      }
    } catch (err) {
      console.error('Error generando CURP:', err);
    }
  }

  async handleSubmit(e) {
    e.preventDefault();
    const btn = this.submitBtn;
    btn.attr('disabled', 'true').addClass('loading');

    try {
      // validar firma
      if (!signatureManager.hasSignature()) {
        throw new Error('Por favor, proporciona tu firma');
      }

      // armar payload
      const data = Object.fromEntries(new FormData(this.form.get()).entries());
      data.signatureData = signatureManager.getSignatureAsBase64();

      // audio opcional
      if (audioRecorder.hasRecording()) {
        const { data: audioData, mimeType } = audioRecorder.getAudioData();
        data.audioData = audioData;
        data.audioMimeType = mimeType;
      }

      // domicilio completo
      const sel = this.coloniaSelect.get().selectedOptions[0];
      data.domicilio = [
        this.calleNumero.value.trim(),
        sel.value,
        sel.dataset.municipio,
        sel.dataset.estado,
        sel.dataset.cp,
      ].join(', ');

      // llamada al servicio
      const result = await enrollmentService.enrollManual(data);
      if (!result.success) throw new Error(result.error);

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
    // remover listeners si es necesario
    this.backBtn.off('click');
    this.clearSigBtn.off('click');
    this.undoSigBtn.off('click');
    this.form.off('submit');
    this.recalcCurpBtn.off('click');
  }
}
