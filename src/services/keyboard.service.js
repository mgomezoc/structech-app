// src/services/keyboard.service.js
import { Capacitor } from '@capacitor/core';
import { Keyboard } from '@capacitor/keyboard';
import { hapticsService } from './haptics.service.js';

class KeyboardService {
  constructor() {
    this.isKeyboardVisible = false;
    this.keyboardHeight = 0;
    this.activeInput = null;
    this.scrollContainer = null;
    this.originalScrollPosition = 0;
    this.observers = [];
  }

  async init() {
    if (!Capacitor.isNativePlatform()) return;

    // Configuración inicial del teclado
    await this.configure();

    // Agregar listeners
    this.setupListeners();
  }

  async configure() {
    try {
      // Configurar el comportamiento del teclado
      await Keyboard.setAccessoryBarVisible({ isVisible: true });
      await Keyboard.setScroll({ isDisabled: false });
      await Keyboard.setResizeMode({ mode: 'ionic' }); // o 'native' según prefieras
    } catch (error) {
      console.error('Error configurando teclado:', error);
    }
  }

  setupListeners() {
    // Listener para cuando el teclado se muestra
    Keyboard.addListener('keyboardWillShow', info => {
      this.handleKeyboardShow(info);
    });

    Keyboard.addListener('keyboardDidShow', info => {
      this.isKeyboardVisible = true;
      this.keyboardHeight = info.keyboardHeight;
    });

    // Listener para cuando el teclado se oculta
    Keyboard.addListener('keyboardWillHide', () => {
      this.handleKeyboardHide();
    });

    Keyboard.addListener('keyboardDidHide', () => {
      this.isKeyboardVisible = false;
      this.keyboardHeight = 0;
    });

    // Delegar eventos de focus/blur
    this.setupInputListeners();
  }

  setupInputListeners() {
    // Usar event delegation para inputs dinámicos
    document.addEventListener(
      'focusin',
      e => {
        if (this.isInputElement(e.target)) {
          this.handleInputFocus(e.target);
        }
      },
      true,
    );

    document.addEventListener(
      'focusout',
      e => {
        if (this.isInputElement(e.target)) {
          this.handleInputBlur(e.target);
        }
      },
      true,
    );

    // Prevenir el comportamiento por defecto en iOS que hace zoom
    document.addEventListener(
      'touchstart',
      e => {
        if (this.isInputElement(e.target)) {
          e.target.style.fontSize = '16px';
        }
      },
      { passive: true },
    );
  }

  isInputElement(element) {
    const tagName = element.tagName.toLowerCase();
    return (
      tagName === 'input' ||
      tagName === 'textarea' ||
      tagName === 'select' ||
      element.contentEditable === 'true'
    );
  }

  handleInputFocus(input) {
    this.activeInput = input;

    // Haptic feedback
    hapticsService?.light();

    // Agregar clase para styling
    input.classList.add('keyboard-focused');

    // Encontrar el contenedor scrolleable más cercano
    this.scrollContainer = this.findScrollContainer(input);

    // Esperar un poco para que el teclado se muestre
    setTimeout(() => {
      this.scrollToInput(input);
    }, 300);

    // Notificar a observers
    this.notifyObservers('focus', input);
  }

  handleInputBlur(input) {
    if (input) {
      input.classList.remove('keyboard-focused');
    }

    this.activeInput = null;

    // Notificar a observers
    this.notifyObservers('blur', input);
  }

  handleKeyboardShow(info) {
    const keyboardHeight = info.keyboardHeight;

    // Ajustar el viewport o el contenedor principal
    this.adjustViewport(keyboardHeight);

    // Asegurar que el input activo sea visible
    if (this.activeInput) {
      setTimeout(() => {
        this.scrollToInput(this.activeInput);
      }, 100);
    }
  }

  handleKeyboardHide() {
    // Restaurar el viewport
    this.restoreViewport();

    // Restaurar scroll si es necesario
    if (this.scrollContainer && this.originalScrollPosition !== undefined) {
      this.scrollContainer.scrollTop = this.originalScrollPosition;
    }
  }

  adjustViewport(keyboardHeight) {
    // Opción 1: Ajustar el padding del contenedor principal
    const appContainer =
      document.querySelector('.app-container') || document.querySelector('#app') || document.body;

    if (appContainer) {
      appContainer.style.paddingBottom = `${keyboardHeight}px`;
      appContainer.style.transition = 'padding-bottom 0.3s ease-out';
    }

    // Opción 2: Ajustar la altura del viewport (para iOS)
    if (Capacitor.getPlatform() === 'ios') {
      document.documentElement.style.height = `calc(100vh - ${keyboardHeight}px)`;
    }
  }

  restoreViewport() {
    const appContainer =
      document.querySelector('.app-container') || document.querySelector('#app') || document.body;

    if (appContainer) {
      appContainer.style.paddingBottom = '';
    }

    if (Capacitor.getPlatform() === 'ios') {
      document.documentElement.style.height = '';
    }
  }

  findScrollContainer(element) {
    let parent = element.parentElement;

    while (parent) {
      const style = window.getComputedStyle(parent);
      if (
        style.overflow === 'auto' ||
        style.overflow === 'scroll' ||
        style.overflowY === 'auto' ||
        style.overflowY === 'scroll'
      ) {
        return parent;
      }
      parent = parent.parentElement;
    }

    // Si no encuentra un contenedor scrolleable, usar el body
    return (
      document.querySelector('.main-content') ||
      document.querySelector('.form-container') ||
      document.body
    );
  }

  scrollToInput(input) {
    if (!input || !this.scrollContainer) return;

    const inputRect = input.getBoundingClientRect();
    const containerRect = this.scrollContainer.getBoundingClientRect();

    // Calcular la posición deseada (input en el centro de la pantalla visible)
    const keyboardOffset = this.keyboardHeight || 250; // Altura estimada del teclado
    const viewportHeight = window.innerHeight - keyboardOffset;
    const desiredPosition = viewportHeight / 2;

    // Calcular el scroll necesario
    const inputTop = inputRect.top - containerRect.top + this.scrollContainer.scrollTop;
    const scrollTo = inputTop - desiredPosition + inputRect.height / 2;

    // Guardar posición original
    this.originalScrollPosition = this.scrollContainer.scrollTop;

    // Hacer scroll suave
    this.smoothScrollTo(this.scrollContainer, scrollTo, 300);
  }

  smoothScrollTo(element, to, duration) {
    const start = element.scrollTop;
    const change = to - start;
    const startTime = performance.now();

    const animateScroll = currentTime => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Easing function
      const easeInOutQuad = progress =>
        progress < 0.5 ? 2 * progress * progress : -1 + (4 - 2 * progress) * progress;

      element.scrollTop = start + change * easeInOutQuad(progress);

      if (progress < 1) {
        requestAnimationFrame(animateScroll);
      }
    };

    requestAnimationFrame(animateScroll);
  }

  // Métodos públicos
  async hide() {
    if (Capacitor.isNativePlatform()) {
      await Keyboard.hide();
    } else {
      // En web, quitar el focus del elemento activo
      if (document.activeElement) {
        document.activeElement.blur();
      }
    }
  }

  async show() {
    if (Capacitor.isNativePlatform() && this.activeInput) {
      await Keyboard.show();
    }
  }

  getKeyboardHeight() {
    return this.keyboardHeight;
  }

  isVisible() {
    return this.isKeyboardVisible;
  }

  // Observer pattern para componentes que necesiten reaccionar
  subscribe(callback) {
    this.observers.push(callback);
    return () => {
      this.observers = this.observers.filter(obs => obs !== callback);
    };
  }

  notifyObservers(event, data) {
    this.observers.forEach(callback => callback(event, data));
  }

  // Utilidad para forms largos - agregar toolbar sobre el teclado
  async addNavigationToolbar() {
    if (!Capacitor.isNativePlatform()) return;

    // Esto es más complejo y requiere plugins adicionales
    // Por ahora, usar el accessory bar nativo
    await Keyboard.setAccessoryBarVisible({ isVisible: true });
  }

  // Limpiar listeners
  cleanup() {
    Keyboard.removeAllListeners();
    this.observers = [];
  }
}

export const keyboardService = new KeyboardService();
