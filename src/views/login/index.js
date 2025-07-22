// src/views/login/index.js

import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
import Handlebars from 'handlebars';
import logoUrl from '../../img/logo-icono-structech.png';
import { authService } from '../../services/auth.service.js';
import { dialogService } from '../../services/dialog.service.js';
import { hapticsService } from '../../services/haptics.service.js';
import { $, dom } from '../../utils/dom.helper.js';
import './style.less';
import tplSource from './template.hbs?raw';

const template = Handlebars.compile(tplSource);

export default class LoginView {
  constructor() {
    this.isLoading = false;
    this.isPasswordVisible = false;
  }

  render() {
    return template({
      logoUrl,
    });
  }

  async afterRender() {
    // Referencias a elementos del DOM
    this.form = $('#loginForm');
    this.usernameInput = $('#email'); // ahora campo "usuario"
    this.passwordInput = $('#password');
    this.toggleIcon = $('#toggleIcon');
    this.rememberCheckbox = $('#remember');
    this.submitBtn = $('#submitBtn');
    this.btnText = $('#btnText');
    this.btnLoader = $('#btnLoader');
    this.biometricBtn = $('#biometricBtn');
    this.errorMessage = $('#errorMessage');
    this.pageLoader = $('#pageLoader');
    this.loginDivider = $('#loginDivider');
    this.usernameValidation = $('#emailValidation');
    this.passwordValidation = $('#passwordValidation');

    // Inicialización
    await this._initializeView();
    this._attachEventListeners();
    this._loadSavedCredentials();
    this._setInitialFocus();
    await this._setupBiometric();

    // Ocultar loader de página después de inicialización
    this._hidePageLoader();
  }

  async _initializeView() {
    dom(this.form).addClass('animate-in');
    await this._optimizeForDevice();
  }

  async _optimizeForDevice() {
    const isLowEnd = this._isLowEndDevice();
    if (isLowEnd) {
      dom(document.body).addClass('low-end-device');
      document.querySelectorAll('.gradient-orb').forEach((orb, i) => {
        if (i > 1) orb.style.display = 'none';
      });
      document.querySelector('.floating-particles')?.remove();
    }
  }

  _isLowEndDevice() {
    const ram = navigator.deviceMemory;
    const cores = navigator.hardwareConcurrency;
    const isAndroid = navigator.userAgent.includes('Android');
    const connection = navigator.connection;
    return (
      (ram && ram <= 2) ||
      (cores && cores <= 2) ||
      (isAndroid && connection?.effectiveType === '2g') ||
      /Android [78]/.test(navigator.userAgent)
    );
  }

  _hidePageLoader() {
    setTimeout(() => {
      dom(this.pageLoader).addClass('hidden');
      setTimeout(() => this.pageLoader.remove(), 500);
    }, 800);
  }

  _attachEventListeners() {
    dom('#togglePassword').on('click', async e => {
      e.preventDefault();
      await this._togglePasswordVisibility();
    });
    dom(this.form).on('submit', e => this._handleSubmit(e));

    this._attachValidationListeners();
    this._attachInputEffects();

    if (this._isIOS()) {
      this.usernameInput.addEventListener('touchstart', () => {
        this.usernameInput.style.fontSize = '16px';
      });
      this.passwordInput.addEventListener('touchstart', () => {
        this.passwordInput.style.fontSize = '16px';
      });
    }
  }

  _attachValidationListeners() {
    this.usernameInput.addEventListener('blur', () => {
      this._validateUsername();
    });
    this.usernameInput.addEventListener('input', () => {
      this._clearInputValidation(this.usernameInput);
    });
    this.passwordInput.addEventListener('blur', () => {
      this._validatePassword();
    });
    this.passwordInput.addEventListener('input', () => {
      this._clearInputValidation(this.passwordInput);
    });
  }

  _validateUsername() {
    const user = this.usernameInput.value.trim();
    if (!user) {
      this._showInputValidation(this.usernameInput, 'El usuario es requerido', 'error');
      return false;
    }
    this._showInputValidation(this.usernameInput, 'Usuario válido', 'success');
    return true;
  }

  _validatePassword() {
    const pwd = this.passwordInput.value;
    if (!pwd) {
      this._showInputValidation(this.passwordInput, 'La contraseña es requerida', 'error');
      return false;
    }
    if (pwd.length < 6) {
      this._showInputValidation(
        this.passwordInput,
        'La contraseña debe tener al menos 6 caracteres',
        'error',
      );
      return false;
    }
    this._showInputValidation(this.passwordInput, 'Contraseña válida', 'success');
    return true;
  }

  _showInputValidation(input, message, type) {
    const group = input.closest('.input-group');
    const msgEl = group.querySelector('.validation-message');
    dom(input).removeClass('valid invalid');
    dom(msgEl).removeClass('show success');
    dom(input).addClass(type === 'error' ? 'invalid' : 'valid');
    if (msgEl) {
      msgEl.textContent = message;
      dom(msgEl).addClass('show');
      if (type === 'success') dom(msgEl).addClass('success');
    }
  }

  _clearInputValidation(input) {
    const group = input.closest('.input-group');
    const msgEl = group.querySelector('.validation-message');
    dom(input).removeClass('valid invalid');
    if (msgEl) dom(msgEl).removeClass('show success');
  }

  _attachInputEffects() {
    [this.usernameInput, this.passwordInput].forEach(input => {
      input.addEventListener('focus', () => {
        dom(input.closest('.input-group')).addClass('focused');
      });
      input.addEventListener('blur', () => {
        dom(input.closest('.input-group')).removeClass('focused');
      });
      input.addEventListener('click', e => this._createRippleEffect(e.target));
    });
  }

  _createRippleEffect(el) {
    const rect = el.getBoundingClientRect();
    const ripple = document.createElement('div');
    ripple.className = 'input-ripple';
    ripple.style.cssText = `
      position:absolute;width:10px;height:10px;
      background:rgba(55,166,166,0.3);border-radius:50%;
      transform:scale(0);animation:ripple 0.6s ease-out;
      left:${rect.width / 2}px;top:${rect.height / 2}px;
      pointer-events:none;z-index:1;
    `;
    const group = el.closest('.input-group');
    group.style.position = 'relative';
    group.appendChild(ripple);
    setTimeout(() => ripple.remove(), 600);
  }

  async _togglePasswordVisibility() {
    await hapticsService.light();
    this.isPasswordVisible = !this.isPasswordVisible;
    this.passwordInput.type = this.isPasswordVisible ? 'text' : 'password';
    const eyeOn = this.isPasswordVisible;
    this.toggleIcon.innerHTML = eyeOn
      ? `<path d="M17.94 17.94A10.07 10.07..." /><line x1="1" y1="1" x2="23" y2="23"/>`
      : `<path d="M1 12s4-8 11-8..." /><circle cx="12" cy="12" r="3"/>`;
    dom('#togglePassword').addClass('clicked');
    setTimeout(() => dom('#togglePassword').removeClass('clicked'), 200);
  }

  _loadSavedCredentials() {
    const saved = localStorage.getItem('remembered_email');
    if (saved) {
      this.usernameInput.value = saved;
      this.rememberCheckbox.checked = true;
      dom(this.usernameInput.closest('.input-group')).addClass('has-content');
    }
  }

  _setInitialFocus() {
    const target = this.usernameInput.value ? this.passwordInput : this.usernameInput;
    setTimeout(() => target.focus(), 500);
  }

  async _setupBiometric() {
    if (!Capacitor.isNativePlatform()) return;
    try {
      const available = await authService.isBiometricAvailable();
      const enabled = await authService.isBiometricEnabled();
      if (available && enabled) {
        dom(this.biometricBtn)
          .addClass('show')
          .on('click', () => this._handleBiometricLogin());
        dom(this.loginDivider).addClass('show');
      }
    } catch (e) {
      console.warn('Error setting up biometric:', e);
    }
  }

  async _handleBiometricLogin() {
    await hapticsService.light();
    this._showBiometricLoading(true);
    try {
      const result = await authService.loginWithBiometric();
      if (result.success) {
        await hapticsService.success();
        this._showSuccessMessage('✅ ¡Bienvenido!');
      } else {
        await hapticsService.error();
        this._showError('Error biométrico: ' + result.error);
      }
    } catch {
      await hapticsService.error();
      this._showError('Error en autenticación biométrica');
    } finally {
      this._showBiometricLoading(false);
    }
  }

  _showBiometricLoading(show) {
    dom(this.biometricBtn)[show ? 'addClass' : 'removeClass']('loading');
    this.biometricBtn.disabled = show;
  }

  async _handleSubmit(e) {
    e.preventDefault();
    if (this.isLoading) return;

    const user = this.usernameInput.value.trim();
    const pwd = this.passwordInput.value;

    if (!this._validateForm(user, pwd)) return;
    await hapticsService.light();
    this._setLoading(true);
    this._hideError();

    try {
      const coords = await this._getCoordinates();
      const result = await authService.login(user, pwd, coords.latitude, coords.longitude);
      if (result.success) {
        await this._handleLoginSuccess(user);
      } else {
        throw new Error(result.error);
      }
    } catch (err) {
      await this._handleLoginError(err.message || 'Error inesperado');
    } finally {
      this._setLoading(false);
    }
  }

  async _validateForm(user, pwd) {
    let valid = true;
    if (!user) {
      this._showInputValidation(this.usernameInput, 'El usuario es requerido', 'error');
      valid = false;
    }
    if (!pwd || pwd.length < 6) {
      this._showInputValidation(
        this.passwordInput,
        !pwd ? 'La contraseña es requerida' : 'La contraseña debe tener al menos 6 caracteres',
        'error',
      );
      valid = false;
    }
    if (!valid) {
      await hapticsService.error();
      (this.usernameInput.value ? this.passwordInput : this.usernameInput).focus();
    }
    return valid;
  }

  async _handleLoginSuccess(user) {
    await hapticsService.success();
    if (this.rememberCheckbox.checked) {
      localStorage.setItem('remembered_email', user);
    } else {
      localStorage.removeItem('remembered_email');
    }
    await this._offerBiometricSetup();
    this._showSuccessMessage('✅ ¡Bienvenido!');
    // navegación se maneja en evento auth:login
  }

  async _handleLoginError(msg) {
    await hapticsService.error();
    this._showError(msg || 'Error al iniciar sesión. Verifica tus credenciales.');
    this.passwordInput.focus();
  }

  async _offerBiometricSetup() {
    if (!Capacitor.isNativePlatform()) return;
    try {
      const available = await authService.isBiometricAvailable();
      const enabled = await authService.isBiometricEnabled();
      if (available && !enabled) {
        const ok = await dialogService.confirm(
          'Autenticación Biométrica',
          '¿Deseas habilitar inicio con huella para la próxima vez?',
        );
        if (ok) {
          await authService.enableBiometric();
          this._showSuccessMessage('🔒 Biometría habilitada');
        }
      }
    } catch {}
  }

  async _getCoordinates() {
    try {
      const pos = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000,
      });
      return pos.coords;
    } catch {
      return new Promise((res, rej) => {
        if (!navigator.geolocation) return rej(new Error('Geolocalización no soportada'));
        navigator.geolocation.getCurrentPosition(
          p => res(p.coords),
          e =>
            rej(
              new Error(
                {
                  1: 'Acceso a ubicación denegado',
                  2: 'Ubicación no disponible',
                  3: 'Tiempo de espera agotado',
                }[e.code] || 'Error obteniendo ubicación',
              ),
            ),
          { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
        );
      });
    }
  }

  _setLoading(loading) {
    this.isLoading = loading;
    this.submitBtn.disabled = loading;
    dom(this.submitBtn)[loading ? 'addClass' : 'removeClass']('loading');
  }

  _showError(message) {
    const txt = this.errorMessage.querySelector('.error-text');
    if (txt) txt.textContent = message;
    dom(this.errorMessage).addClass('show');
    setTimeout(() => this._hideError(), 5000);
  }

  _hideError() {
    dom(this.errorMessage).removeClass('show');
  }

  _showSuccessMessage(message) {
    window.mostrarMensajeEstado?.(message, 2000) || console.log(message);
  }

  _isIOS() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent);
  }

  cleanup() {
    document.querySelectorAll('.input-ripple').forEach(r => r.remove());
  }
}
