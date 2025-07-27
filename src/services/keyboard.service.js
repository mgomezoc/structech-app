// src/services/keyboard.service.js
import { Capacitor } from '@capacitor/core';
import { Keyboard } from '@capacitor/keyboard';
import { hapticsService } from './haptics.service.js';

class KeyboardService {
  constructor() {
    this.isNative = Capacitor.isNativePlatform();
    this.isKeyboardVisible = false;
    this.keyboardHeight = 0;
    this.activeInput = null;
    this.scrollContainer = null;
    this.originalScrollPosition = 0;
    this.observers = [];
  }

  async init() {
    if (!this.isNative) return;
    try {
      await this.configure();
      this.setupListeners();
    } catch (err) {
      console.warn('[keyboardService] Error al inicializar:', err.message);
    }
  }

  async configure() {
    try {
      await Keyboard.setAccessoryBarVisible({ isVisible: true });
      await Keyboard.setScroll({ isDisabled: false });
      await Keyboard.setResizeMode({ mode: 'ionic' });
    } catch (error) {
      console.warn('[keyboardService] configure error:', error.message);
    }
  }

  setupListeners() {
    if (!this.isNative) return;

    Keyboard.addListener('keyboardWillShow', info => {
      this.handleKeyboardShow(info);
    });

    Keyboard.addListener('keyboardDidShow', info => {
      this.isKeyboardVisible = true;
      this.keyboardHeight = info.keyboardHeight;
    });

    Keyboard.addListener('keyboardWillHide', () => {
      this.handleKeyboardHide();
    });

    Keyboard.addListener('keyboardDidHide', () => {
      this.isKeyboardVisible = false;
      this.keyboardHeight = 0;
    });

    this.setupInputListeners();
  }

  setupInputListeners() {
    document.addEventListener(
      'focusin',
      e => {
        if (this.isInputElement(e.target)) this.handleInputFocus(e.target);
      },
      true,
    );

    document.addEventListener(
      'focusout',
      e => {
        if (this.isInputElement(e.target)) this.handleInputBlur(e.target);
      },
      true,
    );

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

  isInputElement(el) {
    const tag = el.tagName?.toLowerCase();
    return ['input', 'textarea', 'select'].includes(tag) || el.contentEditable === 'true';
  }

  handleInputFocus(input) {
    this.activeInput = input;
    hapticsService?.light();
    input.classList.add('keyboard-focused');
    this.scrollContainer = this.findScrollContainer(input);

    setTimeout(() => this.scrollToInput(input), 300);
    this.notifyObservers('focus', input);
  }

  handleInputBlur(input) {
    input?.classList.remove('keyboard-focused');
    this.activeInput = null;
    this.notifyObservers('blur', input);
  }

  handleKeyboardShow(info) {
    this.adjustViewport(info.keyboardHeight);
    if (this.activeInput) {
      setTimeout(() => this.scrollToInput(this.activeInput), 100);
    }
  }

  handleKeyboardHide() {
    this.restoreViewport();
    if (this.scrollContainer && this.originalScrollPosition !== undefined) {
      this.scrollContainer.scrollTop = this.originalScrollPosition;
    }
  }

  adjustViewport(keyboardHeight) {
    const container =
      document.querySelector('.app-container') || document.querySelector('#app') || document.body;
    container.style.paddingBottom = `${keyboardHeight}px`;

    if (Capacitor.getPlatform() === 'ios') {
      document.documentElement.style.height = `calc(100vh - ${keyboardHeight}px)`;
    }
  }

  restoreViewport() {
    const container =
      document.querySelector('.app-container') || document.querySelector('#app') || document.body;
    container.style.paddingBottom = '';

    if (Capacitor.getPlatform() === 'ios') {
      document.documentElement.style.height = '';
    }
  }

  findScrollContainer(el) {
    let parent = el.parentElement;
    while (parent) {
      const style = window.getComputedStyle(parent);
      if (
        ['auto', 'scroll'].includes(style.overflow) ||
        ['auto', 'scroll'].includes(style.overflowY)
      ) {
        return parent;
      }
      parent = parent.parentElement;
    }
    return document.querySelector('.form-container') || document.body;
  }

  scrollToInput(input) {
    if (!input || !this.scrollContainer) return;
    const inputRect = input.getBoundingClientRect();
    const containerRect = this.scrollContainer.getBoundingClientRect();
    const keyboardOffset = this.keyboardHeight || 250;
    const viewportHeight = window.innerHeight - keyboardOffset;
    const desired = viewportHeight / 2;
    const inputTop = inputRect.top - containerRect.top + this.scrollContainer.scrollTop;
    const scrollTo = inputTop - desired + inputRect.height / 2;
    this.originalScrollPosition = this.scrollContainer.scrollTop;
    this.smoothScrollTo(this.scrollContainer, scrollTo, 300);
  }

  smoothScrollTo(el, to, duration) {
    const start = el.scrollTop;
    const change = to - start;
    const startTime = performance.now();

    const animate = currentTime => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const ease = progress < 0.5 ? 2 * progress * progress : -1 + (4 - 2 * progress) * progress;
      el.scrollTop = start + change * ease;
      if (progress < 1) requestAnimationFrame(animate);
    };

    requestAnimationFrame(animate);
  }

  async hide() {
    if (this.isNative) {
      try {
        await Keyboard.hide();
      } catch (e) {
        console.warn('[keyboardService.hide] error:', e.message);
      }
    } else {
      document.activeElement?.blur();
    }
  }

  async show() {
    if (this.isNative && this.activeInput) {
      try {
        await Keyboard.show();
      } catch (e) {
        console.warn('[keyboardService.show] error:', e.message);
      }
    }
  }

  getKeyboardHeight() {
    return this.keyboardHeight;
  }

  isVisible() {
    return this.isKeyboardVisible;
  }

  subscribe(callback) {
    this.observers.push(callback);
    return () => {
      this.observers = this.observers.filter(fn => fn !== callback);
    };
  }

  notifyObservers(event, data) {
    this.observers.forEach(fn => fn(event, data));
  }

  async addNavigationToolbar() {
    if (!this.isNative) return;
    await Keyboard.setAccessoryBarVisible({ isVisible: true });
  }

  cleanup() {
    if (this.isNative) {
      Keyboard.removeAllListeners().catch(err =>
        console.warn('[keyboardService.cleanup] error:', err.message),
      );
    }
    this.observers = [];
  }
}

export const keyboardService = new KeyboardService();
