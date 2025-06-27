// src/views/login/index.js

import { Geolocation } from "@capacitor/geolocation";
import Handlebars from "handlebars";
import videoUrl from "../../img/login3.mp4";
import logoUrl from "../../img/logo-icono-structech.png";
import { authService } from "../../services/auth.service.js";
import { dialogService } from "../../services/dialog.service.js";
import { hapticsService } from "../../services/haptics.service.js";
import "./style.less";
import tplSource from "./template.hbs?raw";

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
    // Referencias DOM
    this.form = document.getElementById("loginForm");
    this.emailInput = document.getElementById("email");
    this.passwordInput = document.getElementById("password");
    this.togglePasswordBtn = document.getElementById("togglePassword");
    this.toggleIcon = document.getElementById("toggleIcon");
    this.errorMessage = document.getElementById("errorMessage");
    this.rememberCheckbox = document.getElementById("remember");
    this.submitBtn = document.getElementById("submitBtn");
    this.btnText = document.getElementById("btnText");
    this.btnLoader = document.getElementById("btnLoader");
    this.biometricBtn = document.getElementById("biometricBtn");
    this.bgVideo = document.getElementById("bgVideo");

    this._attachEventListeners();

    // Ralentiza el video de fondo
    if (this.bgVideo) {
      this.bgVideo.playbackRate = 0.8;
    }

    // Precarga “recordarme”
    const saved = localStorage.getItem("remembered_email");
    if (saved) {
      this.emailInput.value = saved;
      this.rememberCheckbox.checked = true;
    }

    // Foco inicial
    (!this.emailInput.value ? this.emailInput : this.passwordInput).focus();

    // Mostrar/ocultar botón biométrico
    if (
      (await authService.isBiometricAvailable()) &&
      (await authService.isBiometricEnabled())
    ) {
      this.biometricBtn.style.display = "flex";
      this.biometricBtn.addEventListener("click", () =>
        this._handleBiometricLogin()
      );
    } else {
      this.biometricBtn.style.display = "none";
    }

    if (Capacitor.isNativePlatform()) {
      const available = await authService.isBiometricAvailable();
      const enabled = await authService.isBiometricEnabled();
      console.log("🔒 Biométrico disponible:", available);
      console.log("🔑 Biométrico habilitado:", enabled);
    }
  }

  _attachEventListeners() {
    // Toggle mostrar/ocultar contraseña
    this.togglePasswordBtn.addEventListener("click", async () => {
      await hapticsService.light();
      const isPwd = this.passwordInput.type === "password";
      this.passwordInput.type = isPwd ? "text" : "password";
      this.toggleIcon.setAttribute(
        "src",
        isPwd
          ? "https://cdn.lordicon.com/knitbwfa.json"
          : "https://cdn.lordicon.com/lalzjnnh.json"
      );
    });

    // Envío de formulario
    this.form.addEventListener("submit", (e) => this._handleSubmit(e));
  }

  async _handleBiometricLogin() {
    await hapticsService.light();
    const result = await authService.loginWithBiometric();
    if (result.success) {
      await hapticsService.success();
      window.mostrarMensajeEstado?.("✅ ¡Bienvenido!", 2000);
      // La navegación se dispara en el evento auth:login
    } else {
      await hapticsService.error();
      await dialogService.alert("Error biométrico", result.error);
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
        "Campos Requeridos",
        "Por favor completa todos los campos para continuar."
      );
      return;
    }

    await hapticsService.light();
    this._setLoading(true);
    this.errorMessage.style.display = "none";

    // 1) Obtener coordenadas
    let coords;
    try {
      coords = await this._getCoordinates();
    } catch (err) {
      console.error("Error al obtener ubicación:", err);
      const retry = await dialogService.errorWithAction(
        "Ubicación Requerida",
        "Necesitamos acceso a tu ubicación para iniciar sesión. ¿Deseas intentar de nuevo?",
        "Reintentar",
        "Cancelar"
      );
      this._setLoading(false);
      if (retry) return this._handleSubmit(e);
      return;
    }

    // 2) Llamar al servicio de login
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
      await hapticsService.success();

      // Guardar “recordarme”
      if (this.rememberCheckbox.checked) {
        localStorage.setItem("remembered_email", email);
      } else {
        localStorage.removeItem("remembered_email");
      }

      // Preguntar si habilitar biometría
      if (await authService.isBiometricAvailable()) {
        const enable = await dialogService.confirm(
          "Autenticación Biométrica",
          "¿Deseas habilitar inicio con huella la próxima vez?"
        );
        if (enable) {
          try {
            await authService.enableBiometric();
            window.mostrarMensajeEstado("🔒 Biometría habilitada", 2000);
          } catch (err) {
            window.mostrarMensajeEstado(`❌ ${err.message}`, 3000);
          }
        }
      }

      window.mostrarMensajeEstado("✅ ¡Bienvenido!", 2000);
      // La navegación se dispara en el evento auth:login
    } else {
      await hapticsService.error();
      await dialogService.alert(
        "Error de Acceso",
        result.error || "No se pudo iniciar sesión. Verifica tus credenciales."
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
          return reject(new Error("Geolocalización no soportada"));
        }
        navigator.geolocation.getCurrentPosition(
          (pos) => resolve(pos.coords),
          (err) => reject(err),
          { enableHighAccuracy: true, timeout: 10000 }
        );
      });
    }
  }

  _setLoading(on) {
    this.isLoading = on;
    this.submitBtn.disabled = on;
    this.btnText.style.display = on ? "none" : "inline";
    this.btnLoader.style.display = on ? "inline-flex" : "none";
  }

  cleanup() {
    // Remover listeners si fuera necesario
  }
}
