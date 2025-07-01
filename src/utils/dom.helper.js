// src/utils/dom.helper.js
// Helper para manipulación DOM similar a jQuery pero nativo

/**
 * Selector único - equivalente a $()
 * @param {string} selector
 * @param {Element} context
 * @returns {Element|null}
 */
export const $ = (selector, context = document) => {
  return context.querySelector(selector);
};

/**
 * Selector múltiple - equivalente a $()
 * @param {string} selector
 * @param {Element} context
 * @returns {NodeList}
 */
export const $$ = (selector, context = document) => {
  return context.querySelectorAll(selector);
};

/**
 * Crear elemento con atributos y contenido
 * @param {string} tag
 * @param {object} attrs
 * @param {string} content
 * @returns {Element}
 */
export const createElement = (tag, attrs = {}, content = '') => {
  const el = document.createElement(tag);

  Object.entries(attrs).forEach(([key, value]) => {
    if (key === 'className') {
      el.className = value;
    } else if (key === 'dataset') {
      Object.entries(value).forEach(([dataKey, dataValue]) => {
        el.dataset[dataKey] = dataValue;
      });
    } else {
      el.setAttribute(key, value);
    }
  });

  if (content) {
    el.innerHTML = content;
  }

  return el;
};

/**
 * Wrapper para elemento con métodos chainables
 */
class DOMElement {
  constructor(element) {
    this.el = element;
  }

  // Eventos
  on(event, handler, options = {}) {
    if (this.el) {
      this.el.addEventListener(event, handler, options);
    }
    return this;
  }

  off(event, handler) {
    if (this.el) {
      this.el.removeEventListener(event, handler);
    }
    return this;
  }

  // Clases
  addClass(className) {
    if (this.el) {
      this.el.classList.add(className);
    }
    return this;
  }

  removeClass(nameOrFn) {
    if (!this.el) return this;
    if (typeof nameOrFn === 'function') {
      // iteramos sobre una copia porque vamos a modificar classList
      Array.from(this.el.classList).forEach(cls => {
        if (nameOrFn(cls)) {
          this.el.classList.remove(cls);
        }
      });
    } else {
      this.el.classList.remove(nameOrFn);
    }
    return this;
  }

  toggleClass(className) {
    if (this.el) {
      this.el.classList.toggle(className);
    }
    return this;
  }

  hasClass(className) {
    return this.el ? this.el.classList.contains(className) : false;
  }

  // Contenido
  html(content) {
    if (content !== undefined) {
      if (this.el) this.el.innerHTML = content;
      return this;
    }
    return this.el ? this.el.innerHTML : '';
  }

  text(content) {
    if (content !== undefined) {
      if (this.el) this.el.textContent = content;
      return this;
    }
    return this.el ? this.el.textContent : '';
  }

  val(value) {
    if (value !== undefined) {
      if (this.el) this.el.value = value;
      return this;
    }
    return this.el ? this.el.value : '';
  }

  // Atributos
  attr(name, value) {
    if (value !== undefined) {
      if (this.el) this.el.setAttribute(name, value);
      return this;
    }
    return this.el ? this.el.getAttribute(name) : null;
  }

  removeAttr(name) {
    if (this.el) {
      this.el.removeAttribute(name);
    }
    return this;
  }

  // Estilos
  css(property, value) {
    if (typeof property === 'object') {
      Object.entries(property).forEach(([prop, val]) => {
        if (this.el) this.el.style[prop] = val;
      });
      return this;
    }

    if (value !== undefined) {
      if (this.el) this.el.style[property] = value;
      return this;
    }

    return this.el ? getComputedStyle(this.el)[property] : null;
  }

  // Mostrar/ocultar
  show() {
    if (this.el) this.el.style.display = '';
    return this;
  }

  hide() {
    if (this.el) this.el.style.display = 'none';
    return this;
  }

  toggle() {
    if (this.el) {
      this.el.style.display = this.el.style.display === 'none' ? '' : 'none';
    }
    return this;
  }

  // Utilidades
  focus() {
    if (this.el) this.el.focus();
    return this;
  }

  blur() {
    if (this.el) this.el.blur();
    return this;
  }

  click() {
    if (this.el) this.el.click();
    return this;
  }

  // Navegación DOM
  parent() {
    return this.el ? new DOMElement(this.el.parentElement) : new DOMElement(null);
  }

  find(selector) {
    return this.el ? new DOMElement(this.el.querySelector(selector)) : new DOMElement(null);
  }

  closest(selector) {
    return this.el ? new DOMElement(this.el.closest(selector)) : new DOMElement(null);
  }

  // Obtener elemento nativo
  get() {
    return this.el;
  }

  // Verificar existencia
  exists() {
    return this.el !== null;
  }
}

/**
 * Función principal que devuelve wrapper con métodos chainables
 * @param {string|Element} selector
 * @param {Element} context
 * @returns {DOMElement}
 */
export const dom = (selector, context = document) => {
  let element;

  if (typeof selector === 'string') {
    element = context.querySelector(selector);
  } else if (selector instanceof Element) {
    element = selector;
  } else {
    element = null;
  }

  return new DOMElement(element);
};

/**
 * Esperar a que el DOM esté listo
 * @param {Function} callback
 */
export const ready = callback => {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', callback);
  } else {
    callback();
  }
};

/**
 * Delegación de eventos - equivalente a $(document).on()
 * @param {string} event
 * @param {string} selector
 * @param {Function} handler
 */
export const delegate = (event, selector, handler) => {
  document.addEventListener(event, e => {
    if (e.target.matches(selector) || e.target.closest(selector)) {
      handler.call(e.target.closest(selector) || e.target, e);
    }
  });
};

/**
 * Throttle para eventos que se disparan frecuentemente
 * @param {Function} func
 * @param {number} delay
 * @returns {Function}
 */
export const throttle = (func, delay) => {
  let timeoutId;
  let lastExecTime = 0;

  return function (...args) {
    const currentTime = Date.now();

    if (currentTime - lastExecTime > delay) {
      func.apply(this, args);
      lastExecTime = currentTime;
    } else {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        func.apply(this, args);
        lastExecTime = Date.now();
      }, delay - (currentTime - lastExecTime));
    }
  };
};

/**
 * Debounce para eventos como input
 * @param {Function} func
 * @param {number} delay
 * @returns {Function}
 */
export const debounce = (func, delay) => {
  let timeoutId;

  return function (...args) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func.apply(this, args), delay);
  };
};
