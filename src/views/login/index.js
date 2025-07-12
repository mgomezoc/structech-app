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
    this.emailInput = $('#email');
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
    this.emailValidation = $('#emailValidation');
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
    // Añadir clases de animación inicial
    dom(this.form).addClass('animate-in');

    // Detectar dispositivos de baja gama y ajustar animaciones
    await this._optimizeForDevice();
  }

  async _optimizeForDevice() {
    // Detectar capacidades del dispositivo
    const isLowEnd = this._isLowEndDevice();

    if (isLowEnd) {
      // Reducir animaciones para dispositivos de gama baja
      dom(document.body).addClass('low-end-device');

      // Simplificar efectos visuales
      const orbs = document.querySelectorAll('.gradient-orb');
      orbs.forEach((orb, index) => {
        if (index > 1) orb.style.display = 'none'; // Ocultar orbes adicionales
      });

      // Deshabilitar partículas
      const particles = document.querySelector('.floating-particles');
      if (particles) particles.style.display = 'none';
    }
  }

  _isLowEndDevice() {
    // Heurística simple para detectar dispositivos de baja gama
    const ram = navigator.deviceMemory; // En GB, undefined si no está disponible
    const cores = navigator.hardwareConcurrency;
    const isAndroid = navigator.userAgent.includes('Android');
    const connection = navigator.connection;

    // Considerar dispositivo de baja gama si:
    return (
      (ram && ram <= 2) || // 2GB RAM o menos
      (cores && cores <= 2) || // 2 núcleos o menos
      (isAndroid && connection && connection.effectiveType === '2g') || // Conexión lenta
      navigator.userAgent.includes('Android 7') || // Android viejo
      navigator.userAgent.includes('Android 8')
    );
  }

  _hidePageLoader() {
    // Ocultar loader con delay para suavidad visual
    setTimeout(() => {
      dom(this.pageLoader).addClass('hidden');

      // Remover del DOM después de la animación
      setTimeout(() => {
        if (this.pageLoader && this.pageLoader.parentNode) {
          this.pageLoader.parentNode.removeChild(this.pageLoader);
        }
      }, 500);
    }, 800);
  }

  _attachEventListeners() {
    // Toggle mostrar/ocultar contraseña
    dom('#togglePassword').on('click', async e => {
      e.preventDefault();
      await this._togglePasswordVisibility();
    });

    // Submit del formulario
    dom(this.form).on('submit', e => this._handleSubmit(e));

    // Validación en tiempo real
    this._attachValidationListeners();

    // Efectos visuales en inputs
    this._attachInputEffects();

    // Prevenir zoom en iOS
    if (this._isIOS()) {
      this.emailInput.addEventListener('touchstart', () => {
        this.emailInput.style.fontSize = '16px';
      });
      this.passwordInput.addEventListener('touchstart', () => {
        this.passwordInput.style.fontSize = '16px';
      });
    }
  }

  _attachValidationListeners() {
    // Validación de email en tiempo real
    this.emailInput.addEventListener('blur', () => {
      this._validateEmail();
    });

    this.emailInput.addEventListener('input', () => {
      // Limpiar mensaje de error mientras escribe
      this._clearInputValidation(this.emailInput);
    });

    // Validación de contraseña en tiempo real
    this.passwordInput.addEventListener('blur', () => {
      this._validatePassword();
    });

    this.passwordInput.addEventListener('input', () => {
      // Limpiar mensaje de error mientras escribe
      this._clearInputValidation(this.passwordInput);
    });
  }

  _validateEmail() {
    const email = this.emailInput.value.trim();

    if (!email) {
      this._showInputValidation(this.emailInput, 'El correo electrónico es requerido', 'error');
      return false;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      this._showInputValidation(this.emailInput, 'Ingresa un correo electrónico válido', 'error');
      return false;
    }

    this._showInputValidation(this.emailInput, 'Correo válido', 'success');
    return true;
  }

  _validatePassword() {
    const password = this.passwordInput.value;

    if (!password) {
      this._showInputValidation(this.passwordInput, 'La contraseña es requerida', 'error');
      return false;
    }

    if (password.length < 6) {
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
    const inputGroup = input.closest('.input-group');
    const validationElement = inputGroup.querySelector('.validation-message');

    // Remover clases previas
    dom(input).removeClass('valid invalid');
    dom(validationElement).removeClass('show success');

    // Añadir nuevas clases
    dom(input).addClass(type === 'error' ? 'invalid' : 'valid');

    if (validationElement) {
      validationElement.textContent = message;
      dom(validationElement).addClass('show');
      if (type === 'success') {
        dom(validationElement).addClass('success');
      }
    }
  }

  _clearInputValidation(input) {
    const inputGroup = input.closest('.input-group');
    const validationElement = inputGroup.querySelector('.validation-message');

    dom(input).removeClass('valid invalid');
    if (validationElement) {
      dom(validationElement).removeClass('show success');
    }
  }

  _attachInputEffects() {
    // Efectos en focus/blur para inputs
    [this.emailInput, this.passwordInput].forEach(input => {
      input.addEventListener('focus', () => {
        const group = input.closest('.input-group');
        dom(group).addClass('focused');
      });

      input.addEventListener('blur', () => {
        const group = input.closest('.input-group');
        dom(group).removeClass('focused');
      });

      // Efecto ripple en click
      input.addEventListener('click', e => {
        this._createRippleEffect(e.target);
      });
    });
  }

  _createRippleEffect(element) {
    const rect = element.getBoundingClientRect();
    const ripple = document.createElement('div');
    ripple.className = 'input-ripple';
    ripple.style.cssText = `
      position: absolute;
      width: 10px;
      height: 10px;
      background: rgba(55, 166, 166, 0.3);
      border-radius: 50%;
      transform: scale(0);
      animation: ripple 0.6s ease-out;
      left: ${rect.width / 2}px;
      top: ${rect.height / 2}px;
      pointer-events: none;
      z-index: 1;
    `;

    const inputGroup = element.closest('.input-group');
    inputGroup.style.position = 'relative';
    inputGroup.appendChild(ripple);

    // Remover después de la animación
    setTimeout(() => ripple.remove(), 600);
  }

  async _togglePasswordVisibility() {
    await hapticsService.light();

    this.isPasswordVisible = !this.isPasswordVisible;
    this.passwordInput.type = this.isPasswordVisible ? 'text' : 'password';

    // Cambiar icono
    const eyeIcon = this.isPasswordVisible
      ? `<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
         <line x1="1" y1="1" x2="23" y2="23"></line>`
      : `<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
         <circle cx="12" cy="12" r="3"></circle>`;

    this.toggleIcon.innerHTML = eyeIcon;

    // Animación del botón
    dom('#togglePassword').addClass('clicked');
    setTimeout(() => dom('#togglePassword').removeClass('clicked'), 200);
  }

  _loadSavedCredentials() {
    const savedEmail = localStorage.getItem('remembered_email');
    if (savedEmail) {
      this.emailInput.value = savedEmail;
      this.rememberCheckbox.checked = true;

      // Añadir clase para mostrar que hay contenido
      dom(this.emailInput.closest('.input-group')).addClass('has-content');
    }
  }

  _setInitialFocus() {
    // Foco inteligente basado en contenido
    const targetInput = this.emailInput.value ? this.passwordInput : this.emailInput;

    // Delay para evitar conflictos con animaciones
    setTimeout(() => {
      targetInput.focus();
    }, 500);
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

        // Mostrar el divider también
        dom(this.loginDivider).addClass('show');
      }
    } catch (error) {
      console.warn('Error setting up biometric:', error);
    }
  }

  async _handleBiometricLogin() {
    await hapticsService.light();

    try {
      this._showBiometricLoading(true);

      const result = await authService.loginWithBiometric();

      if (result.success) {
        await hapticsService.success();
        this._showSuccessMessage('✅ ¡Bienvenido!');
      } else {
        await hapticsService.error();
        this._showError('Error biométrico: ' + result.error);
      }
    } catch (error) {
      await hapticsService.error();
      this._showError('Error en autenticación biométrica');
    } finally {
      this._showBiometricLoading(false);
    }
  }

  _showBiometricLoading(show) {
    if (show) {
      dom(this.biometricBtn).addClass('loading');
      this.biometricBtn.disabled = true;
    } else {
      dom(this.biometricBtn).removeClass('loading');
      this.biometricBtn.disabled = false;
    }
  }

  async _handleSubmit(e) {
    e.preventDefault();
    if (this.isLoading) return;

    const email = this.emailInput.value.trim();
    const password = this.passwordInput.value;

    // Validación
    if (!this._validateForm(email, password)) return;

    await hapticsService.light();
    this._setLoading(true);
    this._hideError();

    try {
      // Obtener coordenadas
      const coords = await this._getCoordinates();

      // Realizar login
      const result = await authService.login(email, password, coords.latitude, coords.longitude);

      if (result.success) {
        await this._handleLoginSuccess(email);
      } else {
        await this._handleLoginError(result.error);
      }
    } catch (error) {
      await this._handleLoginError(error.message || 'Error inesperado');
    } finally {
      this._setLoading(false);
    }
  }

  async _validateForm(email, password) {
    let isValid = true;

    // Validar email
    if (!email) {
      this._showInputValidation(this.emailInput, 'El correo electrónico es requerido', 'error');
      isValid = false;
    } else {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        this._showInputValidation(this.emailInput, 'Ingresa un correo electrónico válido', 'error');
        isValid = false;
      }
    }

    // Validar contraseña
    if (!password) {
      this._showInputValidation(this.passwordInput, 'La contraseña es requerida', 'error');
      isValid = false;
    } else if (password.length < 6) {
      this._showInputValidation(
        this.passwordInput,
        'La contraseña debe tener al menos 6 caracteres',
        'error',
      );
      isValid = false;
    }

    if (!isValid) {
      await hapticsService.error();

      // Enfocar el primer campo con error
      const firstErrorField = !email ? this.emailInput : this.passwordInput;
      firstErrorField.focus();
    }

    return isValid;
  }

  async _handleLoginSuccess(email) {
    await hapticsService.success();

    // Guardar credenciales si está marcado
    this._saveCredentials(email);

    // Preguntar por biometría si está disponible
    await this._offerBiometricSetup();

    // Mostrar mensaje de éxito
    this._showSuccessMessage('✅ ¡Bienvenido!');

    // La navegación se maneja en el evento auth:login
  }

  async _handleLoginError(errorMessage) {
    await hapticsService.error();
    this._showError(errorMessage || 'Error al iniciar sesión. Verifica tus credenciales.');

    // NO limpiar la contraseña, mantenerla como estaba
    this.passwordInput.focus();
  }

  _saveCredentials(email) {
    if (this.rememberCheckbox.checked) {
      localStorage.setItem('remembered_email', email);
    } else {
      localStorage.removeItem('remembered_email');
    }
  }

  async _offerBiometricSetup() {
    if (!Capacitor.isNativePlatform()) return;

    try {
      const available = await authService.isBiometricAvailable();
      const enabled = await authService.isBiometricEnabled();

      if (available && !enabled) {
        const enable = await dialogService.confirm(
          'Autenticación Biométrica',
          '¿Deseas habilitar inicio con huella para la próxima vez?',
        );

        if (enable) {
          await authService.enableBiometric();
          this._showSuccessMessage('🔒 Biometría habilitada');
        }
      }
    } catch (error) {
      console.warn('Error setting up biometric:', error);
    }
  }

  async _getCoordinates() {
    // Intentar con Capacitor primero, luego web API
    try {
      const position = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000, // Cache por 1 minuto
      });
      return position.coords;
    } catch (capacitorError) {
      // Fallback a web API
      return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
          reject(new Error('Geolocalización no soportada'));
          return;
        }

        navigator.geolocation.getCurrentPosition(
          position => resolve(position.coords),
          error => {
            // Manejo específico de errores de geolocalización
            const errorMessages = {
              1: 'Acceso a ubicación denegado',
              2: 'Ubicación no disponible',
              3: 'Tiempo de espera agotado',
            };
            reject(new Error(errorMessages[error.code] || 'Error obteniendo ubicación'));
          },
          {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 60000,
          },
        );
      });
    }
  }

  _setLoading(loading) {
    this.isLoading = loading;
    this.submitBtn.disabled = loading;

    if (loading) {
      dom(this.submitBtn).addClass('loading');
    } else {
      dom(this.submitBtn).removeClass('loading');
    }
  }

  _showError(message) {
    const errorText = this.errorMessage.querySelector('.error-text');
    if (errorText) {
      errorText.textContent = message;
    } else {
      this.errorMessage.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="15" y1="9" x2="9" y2="15"></line>
          <line x1="9" y1="9" x2="15" y2="15"></line>
        </svg>
        <span class="error-text">${message}</span>
      `;
    }

    dom(this.errorMessage).addClass('show');

    // Auto-ocultar después de 5 segundos
    setTimeout(() => this._hideError(), 5000);
  }

  _hideError() {
    dom(this.errorMessage).removeClass('show');
  }

  _showSuccessMessage(message) {
    // Usar el sistema de mensajes global si está disponible
    if (window.mostrarMensajeEstado) {
      window.mostrarMensajeEstado(message, 2000);
    } else {
      console.log(message);
    }
  }

  _isIOS() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent);
  }

  cleanup() {
    // Limpiar event listeners si es necesario
    this._cleanupRippleStyles();
  }

  _cleanupRippleStyles() {
    // Remover estilos de ripple que puedan haber quedado
    const ripples = document.querySelectorAll('.input-ripple');
    ripples.forEach(ripple => ripple.remove());
  }
}
