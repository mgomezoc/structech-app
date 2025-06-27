// src/views/login/index.js

import { Geolocation } from "@capacitor/geolocation";
import Handlebars from "handlebars";
import videoUrl from "../../img/login3.mp4";
import logoUrl from "../../img/logo-icono-structech.png";
import { authService } from "../../services/auth.service.js";
import "./style.less";
import tplSource from "./template.hbs?raw";

const template = Handlebars.compile(tplSource);

export default class LoginView {
  constructor() {
    this.isLoading = false;
  }

  render() {
    return template({
      title: "Iniciar Sesión",
      subtitle: "Ingresa tus credenciales para continuar",
      emailPlaceholder: "correo@ejemplo.com",
      passwordPlaceholder: "••••••••",
      forgotLinkText: "¿Olvidaste tu contraseña?",
      buttonText: "Iniciar Sesión",
      loadingText: "Iniciando…",
      footerText: "¿No tienes cuenta?",
      registerLinkText: "Regístrate aquí",
      logoUrl,
      videoUrl,
    });
  }

  async afterRender() {
    this.form = document.getElementById("loginForm");
    this.emailInput = document.getElementById("email");
    this.passwordInput = document.getElementById("password");
    this.togglePasswordBtn = document.getElementById("togglePassword");
    this.toggleIcon = document.getElementById("toggleIcon");
    this.errorMessage = document.getElementById("errorMessage");
    this.rememberCheckbox = document.getElementById("remember");
    this.bgVideo = document.getElementById("bgVideo");

    this._attachEventListeners();

    // Ralentiza el video de fondo
    if (this.bgVideo) {
      this.bgVideo.playbackRate = 0.8;
    }

    // Si "recordarme" estaba activo, precarga el email
    const saved = localStorage.getItem("remembered_email");
    if (saved) {
      this.emailInput.value = saved;
      this.rememberCheckbox.checked = true;
    }

    // Foco inicial
    (!this.emailInput.value ? this.emailInput : this.passwordInput).focus();
  }

  _attachEventListeners() {
    // Toggle password
    this.togglePasswordBtn.addEventListener("click", () => {
      const isPwd = this.passwordInput.type === "password";
      this.passwordInput.type = isPwd ? "text" : "password";

      if (isPwd) {
        // mostramos el ojo abierto
        this.toggleIcon.setAttribute(
          "src",
          "https://cdn.lordicon.com/dicvhxpz.json" // ojo abierto
        );
      } else {
        // volvemos al fantasma (ojo cerrado)
        this.toggleIcon.setAttribute(
          "src",
          "https://cdn.lordicon.com/tqbntcar.json" // tu icono original
        );
      }
    });

    // Submit form
    this.form.addEventListener("submit", (e) => this._handleSubmit(e));
  }

  async _handleSubmit(e) {
    e.preventDefault();
    if (this.isLoading) return;

    const email = this.emailInput.value.trim();
    const password = this.passwordInput.value;

    if (!email || !password) {
      return this._showError("Por favor completa todos los campos");
    }

    this._setLoading(true);
    this.errorMessage.style.display = "none";

    // 1) Obtengo coordenadas
    let coords;
    try {
      coords = await this._getCoordinates();
    } catch (err) {
      console.error("Error al obtener ubicación:", err);
      this._showError("Necesitamos acceso a tu ubicación para iniciar sesión.");
      this._setLoading(false);
      return;
    }

    // 2) Llamo al servicio de login enviando lat / lng
    let result;
    try {
      result = await authService.login(
        email,
        password,
        coords.latitude,
        coords.longitude
      );
    } catch (err) {
      console.error("Error en authService.login:", err);
      result = { success: false, error: "Error inesperado" };
    }

    if (result.success) {
      if (this.rememberCheckbox.checked) {
        localStorage.setItem("remembered_email", email);
      } else {
        localStorage.removeItem("remembered_email");
      }
      window.mostrarMensajeEstado?.("✅ ¡Bienvenido!", 2000);
      // auth:login disparará la navegación
    } else {
      this._showError(result.error);
    }

    this._setLoading(false);
  }

  /**
   * Intenta primero con Capacitor.Geolocation y si falla
   * (Not implemented on web) recurre a navigator.geolocation
   */
  async _getCoordinates() {
    // Intento con Capacitor
    try {
      const pos = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 10000,
      });
      return pos.coords;
    } catch (err) {
      console.warn("Capacitor.geolocation falló, usando fallback web", err);
      // Fallback al API nativa del navegador
      return await new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
          return reject(
            new Error("Geolocalización no soportada en este navegador")
          );
        }
        navigator.geolocation.getCurrentPosition(
          (pos) => resolve(pos.coords),
          (err2) => reject(err2),
          { enableHighAccuracy: true, timeout: 10000 }
        );
      });
    }
  }

  _setLoading(on) {
    this.isLoading = on;
    const submitBtn = document.getElementById("submitBtn");
    const btnText = document.getElementById("btnText");
    const btnLoader = document.getElementById("btnLoader");
    if (!submitBtn) return;

    submitBtn.disabled = on;
    btnText.style.display = on ? "none" : "inline";
    btnLoader.style.display = on ? "inline-flex" : "none";
  }

  _showError(msg) {
    this.errorMessage.textContent = msg;
    this.errorMessage.style.display = "block";
    setTimeout(() => (this.errorMessage.style.display = "none"), 5000);
  }

  cleanup() {
    // Si tuvieras listeners globales, aquí los removerías
  }
}
