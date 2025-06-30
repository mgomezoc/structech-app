// src/views/login/index.js

import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
import Handlebars from 'handlebars';
import videoUrl from '../../img/login3.mp4';
import logoUrl from '../../img/logo-icono-structech.png';
import { authService } from '../../services/auth.service.js';
import { dialogService } from '../../services/dialog.service.js';
import { hapticsService } from '../../services/haptics.service.js';
import { $, dom } from '../../utils/dom.helper.js'; // 👈 Importar helper
import './style.less';
import tplSource from './template.hbs?raw';

const template = Handlebars.compile(tplSource);

export default class LoginView {
  constructor() {
    this.isLoading = false;
  }

  render() {
    return template({
      logoUrl,
      videoUrl,
    });
  }

  async afterRender() {
    // ✅ $ para referencias que usaremos múltiples veces (elementos almacenados)
    this.form = $('#loginForm');
    this.emailInput = $('#email');
    this.passwordInput = $('#password');
    this.toggleIcon = $('#toggleIcon');
    this.rememberCheckbox = $('#remember');
    this.submitBtn = $('#submitBtn');
    this.btnText = $('#btnText');
    this.btnLoader = $('#btnLoader');
    this.biometricBtn = $('#biometricBtn');
    this.bgVideo = $('#bgVideo');

    this._attachEventListeners();

    // Ralentiza el video de fondo
    if (this.bgVideo) {
      this.bgVideo.playbackRate = 0.8;
    }

    // Precarga "recordarme"
    const saved = localStorage.getItem('remembered_email');
    if (saved) {
      this.emailInput.value = saved;
      this.rememberCheckbox.checked = true;
    }

    // Foco inicial
    (!this.emailInput.value ? this.emailInput : this.passwordInput).focus();

    // ✅ dom() para manipulación directa con métodos chainables
    if ((await authService.isBiometricAvailable()) && (await authService.isBiometricEnabled())) {
      dom(this.biometricBtn)
        .show()
        .on('click', () => this._handleBiometricLogin());
    } else {
      dom(this.biometricBtn).hide();
    }

    if (Capacitor.isNativePlatform()) {
      const available = await authService.isBiometricAvailable();
      const enabled = await authService.isBiometricEnabled();
      console.log('🔒 Biométrico disponible:', available);
      console.log('🔑 Biométrico habilitado:', enabled);
    }
  }

  _attachEventListeners() {
    // ✅ dom() para manipulación directa de elementos con eventos
    dom('#togglePassword').on('click', async () => {
      await hapticsService.light();
      const isPwd = this.passwordInput.type === 'password';
      this.passwordInput.type = isPwd ? 'text' : 'password';

      // ✅ Usando referencia almacenada con dom() para manipulación
      dom(this.toggleIcon).attr(
        'src',
        isPwd ? 'https://cdn.lordicon.com/knitbwfa.json' : 'https://cdn.lordicon.com/lalzjnnh.json',
      );
    });

    // ✅ Usando referencia almacenada con dom() para eventos
    dom(this.form).on('submit', e => this._handleSubmit(e));
  }

  async _handleBiometricLogin() {
    await hapticsService.light();
    const result = await authService.loginWithBiometric();
    if (result.success) {
      await hapticsService.success();
      window.mostrarMensajeEstado?.('✅ ¡Bienvenido!', 2000);
      // La navegación se dispara en el evento auth:login
    } else {
      await hapticsService.error();
      await dialogService.alert('Error biométrico', result.error);
    }
  }

  async _handleSubmit(e) {
    e.preventDefault();
    if (this.isLoading) return;

    const email = this.emailInput.value.trim();
    const password = this.passwordInput.value;

    if (!email || !password) {
      await hapticsService.error();
      await dialogService.alert(
        'Campos Requeridos',
        'Por favor completa todos los campos para continuar.',
      );
      return;
    }

    await hapticsService.light();
    this._setLoading(true);

    // ✅ dom() para manipulación directa sin almacenar referencia
    dom('#errorMessage').hide();

    // 1) Obtener coordenadas
    let coords;
    try {
      coords = await this._getCoordinates();
    } catch (err) {
      console.error('Error al obtener ubicación:', err);
      const retry = await dialogService.errorWithAction(
        'Ubicación Requerida',
        'Necesitamos acceso a tu ubicación para iniciar sesión. ¿Deseas intentar de nuevo?',
        'Reintentar',
        'Cancelar',
      );
      this._setLoading(false);
      if (retry) return this._handleSubmit(e);
      return;
    }

    // 2) Llamar al servicio de login
    let result;
    try {
      result = await authService.login(email, password, coords.latitude, coords.longitude);
    } catch (err) {
      console.error('Error en authService.login:', err);
      result = { success: false, error: 'Error inesperado' };
    }

    if (result.success) {
      await hapticsService.success();

      // Guardar "recordarme"
      if (this.rememberCheckbox.checked) {
        localStorage.setItem('remembered_email', email);
      } else {
        localStorage.removeItem('remembered_email');
      }

      // Preguntar si habilitar biometría
      if (await authService.isBiometricAvailable()) {
        const enable = await dialogService.confirm(
          'Autenticación Biométrica',
          '¿Deseas habilitar inicio con huella la próxima vez?',
        );
        if (enable) {
          try {
            await authService.enableBiometric();
            window.mostrarMensajeEstado('🔒 Biometría habilitada', 2000);
          } catch (err) {
            window.mostrarMensajeEstado(`❌ ${err.message}`, 3000);
          }
        }
      }

      window.mostrarMensajeEstado('✅ ¡Bienvenido!', 2000);
      // La navegación se dispara en el evento auth:login
    } else {
      await hapticsService.error();
      await dialogService.alert(
        'Error de Acceso',
        result.error || 'No se pudo iniciar sesión. Verifica tus credenciales.',
      );
    }

    this._setLoading(false);
  }

  /** Fallback de geolocalización */
  async _getCoordinates() {
    try {
      const pos = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 10000,
      });
      return pos.coords;
    } catch {
      return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
          return reject(new Error('Geolocalización no soportada'));
        }
        navigator.geolocation.getCurrentPosition(
          pos => resolve(pos.coords),
          err => reject(err),
          { enableHighAccuracy: true, timeout: 10000 },
        );
      });
    }
  }

  _setLoading(on) {
    this.isLoading = on;

    // ✅ Usando dom helper para manipulación más limpia
    dom(this.submitBtn).attr('disabled', on || null);
    dom(this.btnText).css('display', on ? 'none' : 'inline');
    dom(this.btnLoader).css('display', on ? 'inline-flex' : 'none');
  }

  cleanup() {
    // ✅ Limpieza de eventos usando referencias almacenadas
    // dom(this.form).off("submit");
    // dom("#togglePassword").off("click");
    // dom(this.biometricBtn).off("click");
  }
}
