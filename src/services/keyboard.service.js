// src/services/keyboard.service.js
// Servicio robusto de teclado para iOS/Android/Web (Capacitor 7)
// - Usa visualViewport en todas las plataformas para altura/oclusión reales
// - Re-scroll en keyboardDidShow para posición final estable
// - Limpieza idempotente de listeners y animaciones
// - Feature detection (safeCall) para APIs del plugin
// - Soporte contenteditable y contenedor de scroll configurable

import { Capacitor } from '@capacitor/core';
import { Keyboard } from '@capacitor/keyboard';
import { hapticsService } from './haptics.service.js';

class KeyboardService {
  constructor() {
    this._initialized = false;

    this.isNative =
      typeof Capacitor.isNativePlatform === 'function'
        ? Capacitor.isNativePlatform()
        : Capacitor.getPlatform?.() !== 'web';

    this.platform = this._detectPlatform();

    this.isKeyboardVisible = false;
    this.keyboardHeight = 0;
    this.activeInput = null;
    this.scrollContainer = null; // opcional: se puede setear vía setScrollContainer

    this.observers = [];

    // Handles/cleanup
    this._nativeHandles = [];
    this._domListeners = [];
    this._vvCleanup = null;
    this._onFocusIn = null;
    this._onFocusOut = null;
    this._scrollRAF = null;

    // Config por plataforma (delays mínimos; preferimos eventos reales)
    this.config = {
      ios: {
        scrollDelay: 120,
        hideDelay: 120,
        extraPadding: 50,
        useInertialScrolling: true,
        preventZoom: true,
      },
      android: {
        scrollDelay: 80,
        hideDelay: 80,
        extraPadding: 30,
        useInertialScrolling: false,
        preventZoom: false,
      },
      web: {
        scrollDelay: 60,
        hideDelay: 60,
        extraPadding: 20,
        useInertialScrolling: false,
        preventZoom: false,
      },
    };
  }

  _detectPlatform() {
    const p = Capacitor.getPlatform?.() || 'web';
    if (p === 'ios' || p === 'android' || p === 'web') return p;

    const ua = (navigator?.userAgent || '').toLowerCase();
    if (/iphone|ipad|ipod/.test(ua)) return 'ios';
    if (/android/.test(ua)) return 'android';
    return 'web';
  }

  async init() {
    if (this._initialized) return;
    this._initialized = true;

    try {
      document.body.classList.remove('platform-ios', 'platform-android', 'platform-web');
      document.body.classList.add(`platform-${this.platform}`);
    } catch {
      /* noop */
    }

    console.log(`🎹 [KeyboardService] Init ${this.platform} (native=${this.isNative})`);

    // Viewport listeners (visualViewport) ayudan SIEMPRE (web y nativo)
    this._setupViewportListeners();

    if (this.isNative) {
      await this._configure();
      this._setupNativeListeners();
      this._setupInputListeners();
    } else {
      // Fallback web-only para navegadores sin visualViewport
      if (!window.visualViewport) this._setupResizeFallbackForWeb();
      this._setupInputListeners();
    }

    console.log('✅ [KeyboardService] Inicialización completa');
  }

  async _safeCall(fnName, args) {
    const fn = Keyboard?.[fnName];
    if (typeof fn === 'function') {
      try {
        return await fn.call(Keyboard, args);
      } catch (e) {
        console.warn(`[KeyboardService] ${fnName} falló:`, e?.message || e);
      }
    }
    return undefined;
  }

  async _configure() {
    // Capacitor 7: setResizeMode puede no existir → usamos safeCall
    if (this.platform === 'ios') {
      await this._safeCall('setAccessoryBarVisible', { isVisible: true });
      await this._safeCall('setScroll', { isDisabled: false });
      await this._safeCall('setResizeMode', { mode: 'ionic' }); // si no existe, safeCall lo ignora
    } else if (this.platform === 'android') {
      await this._safeCall('setAccessoryBarVisible', { isVisible: false });
      await this._safeCall('setScroll', { isDisabled: true });
      await this._safeCall('setResizeMode', { mode: 'native' });
    }
  }

  _setupNativeListeners() {
    const push = (ev, cb) => this._nativeHandles.push(Keyboard.addListener(ev, cb));

    push('keyboardWillShow', info => {
      this._handleKeyboardWillShow(info);
    });

    push('keyboardDidShow', info => {
      this.isKeyboardVisible = true;
      this.keyboardHeight = info?.keyboardHeight || this.keyboardHeight || 0;
      this._notifyObservers('keyboardDidShow', info);
      // Reubica con altura final estable
      if (this.activeInput) this._scrollToInput(this.activeInput);
    });

    push('keyboardWillHide', info => {
      this._handleKeyboardWillHide(info);
    });

    push('keyboardDidHide', info => {
      this.isKeyboardVisible = false;
      this.keyboardHeight = 0;
      this.activeInput = null;
      this._notifyObservers('keyboardDidHide', info);
    });
  }

  _setupViewportListeners() {
    const vv = window.visualViewport;
    if (!vv) return; // navegadores antiguos usarán fallback web

    const onVV = () => {
      const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      this.keyboardHeight = kb;
      document.documentElement.style.setProperty('--keyboard-height', `${kb}px`);

      // En web (no nativo), inferimos visibilidad a partir de vv
      if (!this.isNative) {
        const willShow = kb > 100;
        if (willShow !== this.isKeyboardVisible) {
          this.isKeyboardVisible = willShow;
          if (willShow) {
            document.body.classList.add('keyboard-visible');
            this._notifyObservers('keyboardWillShow', { keyboardHeight: kb });
            if (this.activeInput) this._scrollToInput(this.activeInput);
          } else {
            document.body.classList.remove('keyboard-visible');
            this._notifyObservers('keyboardWillHide', {});
          }
        }
      } else {
        // En nativo, NO cambiamos isKeyboardVisible aquí (lo hacen eventos del plugin)
        // pero sí podemos re-ajustar scroll si cambió el viewport y hay input activo
        if (this.isKeyboardVisible && this.activeInput) this._scrollToInput(this.activeInput);
      }
    };

    vv.addEventListener('resize', onVV, { passive: true });
    vv.addEventListener('scroll', onVV, { passive: true });
    this._vvCleanup = () => {
      vv.removeEventListener('resize', onVV);
      vv.removeEventListener('scroll', onVV);
    };
  }

  _setupResizeFallbackForWeb() {
    const handler = () => {
      const diff = (window.screen?.height || window.innerHeight) - window.innerHeight;
      const willShow = diff > 150;
      this.keyboardHeight = willShow ? diff : 0;
      if (willShow !== this.isKeyboardVisible) {
        this.isKeyboardVisible = willShow;
        if (willShow) {
          document.body.classList.add('keyboard-visible');
          document.documentElement.style.setProperty('--keyboard-height', `${diff}px`);
          this._notifyObservers('keyboardWillShow', { keyboardHeight: diff });
          if (this.activeInput) this._scrollToInput(this.activeInput);
        } else {
          document.body.classList.remove('keyboard-visible');
          document.documentElement.style.removeProperty('--keyboard-height');
          this._notifyObservers('keyboardWillHide', {});
        }
      }
    };
    window.addEventListener('resize', handler, { passive: true });
    this._domListeners.push({ target: window, type: 'resize', handler });
  }

  _setupInputListeners() {
    this._onFocusIn = e => {
      const t = e.target;
      if (this._isInputElement(t)) this._handleInputFocus(t);
    };
    this._onFocusOut = e => {
      const t = e.target;
      if (this._isInputElement(t)) this._handleInputBlur(t);
    };

    document.addEventListener('focusin', this._onFocusIn, true);
    document.addEventListener('focusout', this._onFocusOut, true);
  }

  _isInputElement(el) {
    if (!el) return false;
    const tag = (el.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') {
      const type = (el.type || '').toLowerCase();
      const excluded = ['hidden', 'file', 'checkbox', 'radio', 'range'];
      return !excluded.includes(type);
    }
    if (el.isContentEditable) return true; // soporte contenteditable
    return false;
  }

  async _handleInputFocus(element) {
    this.activeInput = element;

    // Anti-zoom iOS por clase + fallback inline si hiciera falta
    if (this.platform === 'ios' && this.config.ios.preventZoom) {
      element.classList.add('ios-anti-zoom');
      const fs = parseInt(getComputedStyle(element).fontSize, 10);
      if (!Number.isNaN(fs) && fs < 16) element.style.fontSize = '16px';
    }

    // Atributos óptimos por tipo de campo
    this._applyOptimalAttributes(element);

    this._notifyObservers('focus', {
      element,
      id: element.id,
      type: element.type,
      name: element.name,
    });

    const delay = this.config[this.platform]?.scrollDelay ?? 80;
    setTimeout(() => {
      requestAnimationFrame(() => {
        this._scrollToInput(element);
      });
    }, delay);

    // feedback háptico suave (ignorar si no aplica)
    try {
      await hapticsService?.light?.();
    } catch {}
  }

  _handleInputBlur(element) {
    this._notifyObservers('blur', {
      element,
      id: element.id,
      type: element.type,
      name: element.name,
    });
    if (this.activeInput === element) this.activeInput = null;
  }

  _handleKeyboardWillShow(info) {
    this.isKeyboardVisible = true;
    this.keyboardHeight = info?.keyboardHeight || this.keyboardHeight || 0;

    document.body.classList.add('keyboard-visible', `keyboard-${this.platform}`);
    document.documentElement.style.setProperty('--keyboard-height', `${this.keyboardHeight}px`);

    this._notifyObservers('keyboardWillShow', info);

    try {
      hapticsService?.light?.();
    } catch {}
  }

  _handleKeyboardWillHide(info) {
    const delay = this.config[this.platform]?.hideDelay ?? 80;
    setTimeout(() => {
      document.body.classList.remove('keyboard-visible', `keyboard-${this.platform}`);
      document.documentElement.style.removeProperty('--keyboard-height');
    }, delay);
    this._notifyObservers('keyboardWillHide', info);
  }

  _applyOptimalAttributes(input) {
    const fieldType = this._getFieldType(input);
    const attrs = this._getOptimalAttributes(fieldType);
    for (const [k, v] of Object.entries(attrs)) {
      if (v !== null && v !== undefined) input.setAttribute(k, v);
    }
  }

  _getFieldType(input) {
    const id = (input.id || '').toLowerCase();
    const name = (input.name || '').toLowerCase();
    const type = (input.type || 'text').toLowerCase();
    const placeholder = (input.placeholder || '').toLowerCase();

    if (type === 'email') return 'email';
    if (type === 'tel') return 'tel';
    if (type === 'number') return 'number';
    if (type === 'search') return 'search';
    if (type === 'url') return 'url';
    if (type === 'password') return 'password';
    if (input.tagName?.toLowerCase() === 'textarea' || input.isContentEditable) return 'textarea';

    if (id.includes('email') || name.includes('email') || placeholder.includes('email'))
      return 'email';
    if (
      id.includes('phone') ||
      id.includes('tel') ||
      name.includes('phone') ||
      name.includes('tel') ||
      placeholder.includes('teléfono')
    )
      return 'tel';
    if (
      id.includes('number') ||
      id.includes('codigo') ||
      id.includes('cantidad') ||
      name.includes('amount')
    )
      return 'number';
    if (id.includes('search') || placeholder.includes('buscar') || placeholder.includes('search'))
      return 'search';
    if (id.includes('reference') || id.includes('referencia') || name.includes('reference'))
      return 'reference';
    if (id.includes('password') || name.includes('password')) return 'password';

    return 'text';
  }

  _getOptimalAttributes(fieldType) {
    const cfg = {
      email: {
        inputmode: 'email',
        autocapitalize: 'off',
        autocorrect: 'off',
        autocomplete: 'email',
        spellcheck: 'false',
        enterkeyhint: 'next',
      },
      tel: {
        inputmode: 'tel',
        pattern: '[0-9+\\-\\s()]*',
        autocomplete: 'tel',
        enterkeyhint: 'next',
      },
      number: { inputmode: 'numeric', pattern: '[0-9]*', enterkeyhint: 'next' },
      password: {
        autocapitalize: 'off',
        autocorrect: 'off',
        autocomplete: 'current-password',
        spellcheck: 'false',
        enterkeyhint: 'go',
      },
      textarea: {
        autocapitalize: 'sentences',
        autocorrect: 'on',
        spellcheck: 'true',
        enterkeyhint: 'done',
      },
      search: {
        inputmode: 'search',
        autocapitalize: 'off',
        autocorrect: 'off',
        enterkeyhint: 'search',
      },
      url: {
        inputmode: 'url',
        autocapitalize: 'off',
        autocorrect: 'off',
        spellcheck: 'false',
        enterkeyhint: 'go',
      },
      reference: {
        autocapitalize: 'characters',
        autocorrect: 'off',
        spellcheck: 'false',
        enterkeyhint: 'done',
      },
      text: {
        autocapitalize: 'sentences',
        autocorrect: 'on',
        spellcheck: 'true',
        enterkeyhint: 'next',
      },
    };
    return cfg[fieldType] || cfg.text;
  }

  // Scroll inteligente usando visualViewport para oclusión real
  _scrollToInput(input) {
    if (!input) return;

    const container =
      this.scrollContainer ||
      input.closest('.keyboard-scrollable') ||
      input.closest('.survey-content') ||
      input.closest('.content-scroll') ||
      input.closest('.ion-content, .ion-content-scroll-host, .modal-content, .page-content') ||
      document.scrollingElement ||
      document.body;

    const vv = window.visualViewport;
    const extra = this.config[this.platform]?.extraPadding ?? 40;

    const viewportTop = vv ? vv.offsetTop : 0;
    const viewportHeight = vv ? vv.height : window.innerHeight;

    const rect = input.getBoundingClientRect();
    const inputTop = rect.top;
    const inputBottom = rect.bottom;

    // Límite inferior visible (evitando teclado)
    const visibleBottom = viewportTop + viewportHeight - extra;

    let delta = 0;
    if (inputBottom > visibleBottom) {
      delta = inputBottom - visibleBottom; // subir
    } else if (inputTop < viewportTop + extra) {
      delta = inputTop - (viewportTop + extra); // bajar
    }

    if (delta !== 0) {
      const target = container.scrollTop + delta;
      this._smoothScrollTo(container, target, 300);
    }
  }

  _smoothScrollTo(element, target, duration) {
    if (!element) return;

    if (this._scrollRAF) cancelAnimationFrame(this._scrollRAF);

    const start = element.scrollTop;
    const change = target - start;
    if (Math.abs(change) < 1) return;

    const t0 = performance.now();
    const animate = now => {
      const x = Math.min((now - t0) / duration, 1);
      const ease = x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; // ease-in-out-cubic
      element.scrollTop = start + change * ease;
      if (x < 1) this._scrollRAF = requestAnimationFrame(animate);
      else this._scrollRAF = null;
    };
    this._scrollRAF = requestAnimationFrame(animate);
  }

  // ===== API pública =====

  async hide() {
    try {
      if (this.isNative) {
        await this._safeCall('hide');
      } else {
        document.activeElement?.blur?.();
      }
    } catch (e) {
      console.warn('[KeyboardService] Error al ocultar:', e);
    }
  }

  async show() {
    try {
      if (this.isNative) {
        if (!this.activeInput) return;
        // En algunos dispositivos es necesario enfoque + show
        this.activeInput.focus();
        await this._safeCall('show');
      } else {
        this.activeInput?.focus?.();
      }
    } catch (e) {
      console.warn('[KeyboardService] Error al mostrar:', e);
    }
  }

  getKeyboardHeight() {
    return this.keyboardHeight;
  }
  isVisible() {
    return this.isKeyboardVisible;
  }

  subscribe(callback) {
    if (typeof callback !== 'function') return () => {};
    this.observers.push(callback);
    return () => {
      this.observers = this.observers.filter(fn => fn !== callback);
    };
  }

  _notifyObservers(event, data) {
    for (const fn of this.observers) {
      try {
        fn(event, data);
      } catch (e) {
        console.warn('[KeyboardService] Error observer:', e);
      }
    }
  }

  async setAccessoryBarVisible(isVisible = true) {
    if (!this.isNative) return;
    await this._safeCall('setAccessoryBarVisible', { isVisible });
  }

  async setScrollEnabled(isEnabled = true) {
    if (!this.isNative) return;
    await this._safeCall('setScroll', { isDisabled: !isEnabled });
  }

  setScrollContainer(el) {
    this.scrollContainer = el || null;
  }

  async cleanup() {
    // Cancelar animación
    if (this._scrollRAF) {
      cancelAnimationFrame(this._scrollRAF);
      this._scrollRAF = null;
    }

    // Listeners nativos
    for (const h of this._nativeHandles) {
      try {
        await h?.remove?.();
      } catch {}
    }
    this._nativeHandles = [];

    // visualViewport
    this._vvCleanup?.();
    this._vvCleanup = null;

    // Listeners DOM
    for (const { target, type, handler, options } of this._domListeners) {
      try {
        target.removeEventListener(type, handler, options);
      } catch {}
    }
    this._domListeners = [];

    // Focus listeners
    if (this._onFocusIn) document.removeEventListener('focusin', this._onFocusIn, true);
    if (this._onFocusOut) document.removeEventListener('focusout', this._onFocusOut, true);
    this._onFocusIn = this._onFocusOut = null;

    // Estado/CSS
    this.observers = [];
    this.activeInput = null;
    this.isKeyboardVisible = false;
    this.keyboardHeight = 0;

    document.body.classList.remove(
      'keyboard-visible',
      `keyboard-${this.platform}`,
      'platform-ios',
      'platform-android',
      'platform-web',
    );
    document.documentElement.style.removeProperty('--keyboard-height');

    this._initialized = false;
  }

  // Helpers
  handleInputFocus(inputData) {
    const el = inputData?.element || inputData;
    if (this._isInputElement(el)) this._handleInputFocus(el);
  }
  handleInputBlur(inputData) {
    const el = inputData?.element || inputData;
    if (this._isInputElement(el)) this._handleInputBlur(el);
  }

  scrollToElement(element, offset = 0) {
    if (!element) return;
    const container =
      this.scrollContainer ||
      element.closest(
        '.keyboard-scrollable, .survey-content, .content-scroll, .ion-content, .ion-content-scroll-host, .modal-content, .page-content',
      ) ||
      document.scrollingElement ||
      document.body;

    const elRect = element.getBoundingClientRect();
    const contRect = container.getBoundingClientRect();
    const targetTop = elRect.top - contRect.top + container.scrollTop + offset;
    this._smoothScrollTo(container, targetTop, 300);
  }

  focusNextInput() {
    if (!this.activeInput) return null;
    const inputs = Array.from(
      document.querySelectorAll('input, textarea, select, [contenteditable="true"]'),
    ).filter(el => !el.disabled && !el.readOnly && this._isInputElement(el));
    const idx = inputs.indexOf(this.activeInput);
    if (idx > -1 && idx < inputs.length - 1) {
      inputs[idx + 1].focus();
      return inputs[idx + 1];
    }
    return null;
  }
  focusPreviousInput() {
    if (!this.activeInput) return null;
    const inputs = Array.from(
      document.querySelectorAll('input, textarea, select, [contenteditable="true"]'),
    ).filter(el => !el.disabled && !el.readOnly && this._isInputElement(el));
    const idx = inputs.indexOf(this.activeInput);
    if (idx > 0) {
      inputs[idx - 1].focus();
      return inputs[idx - 1];
    }
    return null;
  }

  getFormInputs() {
    if (!this.activeInput) return [];
    const form = this.activeInput.closest('form');
    if (!form) return [];
    return Array.from(
      form.querySelectorAll('input, textarea, select, [contenteditable="true"]'),
    ).filter(el => !el.disabled && !el.readOnly && this._isInputElement(el));
  }

  async detectKeyboardState() {
    const vv = window.visualViewport;
    if (vv) {
      const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      this.keyboardHeight = kb;
      if (!this.isNative) this.isKeyboardVisible = kb > 100;
    } else if (!this.isNative) {
      const diff = (window.screen?.height || window.innerHeight) - window.innerHeight;
      this.keyboardHeight = diff > 0 ? diff : 0;
      this.isKeyboardVisible = diff > 150;
    }
    return { isVisible: this.isKeyboardVisible, height: this.keyboardHeight };
  }

  updateConfig(platform, newConfig) {
    if (!this.config[platform]) return;
    this.config[platform] = { ...this.config[platform], ...newConfig };
  }

  debug() {
    const state = {
      platform: this.platform,
      isNative: this.isNative,
      isKeyboardVisible: this.isKeyboardVisible,
      keyboardHeight: this.keyboardHeight,
      activeInput: this.activeInput
        ? {
            id: this.activeInput.id,
            name: this.activeInput.name,
            type: this.activeInput.type,
            tag: this.activeInput.tagName,
          }
        : null,
      observers: this.observers.length,
      config: this.config[this.platform],
    };
    console.group('🎹 KeyboardService Debug');
    console.table(state);
    console.groupEnd();
    return state;
  }
}

// Singleton + auto-init seguro
const keyboardService = new KeyboardService();

if (typeof document !== 'undefined') {
  const boot = () =>
    keyboardService.init().catch(err => console.error('[KeyboardService] init error:', err));
  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    keyboardService.cleanup().catch(err => console.error('[KeyboardService] cleanup error:', err));
  });
}

export { keyboardService };
