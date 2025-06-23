// src/views/login/index.js

import Handlebars from "handlebars";
import logoUrl from "../../img/logo-icono-structech.png";
import { authService } from "../../services/auth.service.js";
import "./style.less";
import tplSource from "./template.hbs?raw";

const template = Handlebars.compile(tplSource);

export default class LoginView {
  constructor() {
    this.isLoading = false;
  }

  // Renderiza el HTML a partir del template compilado
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
      logoUrl, // disponible en el template como {{logoUrl}}
    });
  }

  // Después de inyectar el HTML, vinculamos eventos
  async afterRender() {
    const form = document.getElementById("loginForm");
    const emailInput = document.getElementById("email");
    const passwordInput = document.getElementById("password");
    const togglePassword = document.getElementById("togglePassword");
    const errorMessage = document.getElementById("errorMessage");
    const rememberCheckbox = document.getElementById("remember");

    // Mostrar/ocultar contraseña
    togglePassword.addEventListener("click", () => {
      const type = passwordInput.type === "password" ? "text" : "password";
      passwordInput.type = type;
      togglePassword.textContent = type === "password" ? "👁️" : "👁️‍🗨️";
    });

    // Pre-cargar email si “recordarme” estaba activo
    const saved = localStorage.getItem("remembered_email");
    if (saved) {
      emailInput.value = saved;
      rememberCheckbox.checked = true;
    }

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (this.isLoading) return;

      const email = emailInput.value.trim();
      const password = passwordInput.value;

      if (!email || !password) {
        return this._showError("Por favor completa todos los campos");
      }

      this._setLoading(true);
      errorMessage.style.display = "none";

      const result = await authService.login(email, password);
      if (result.success) {
        if (rememberCheckbox.checked) {
          localStorage.setItem("remembered_email", email);
        } else {
          localStorage.removeItem("remembered_email");
        }
        window.mostrarMensajeEstado?.("✅ ¡Bienvenido!", 2000);
        // El evento auth:login se encarga de la navegación
      } else {
        this._showError(result.error);
      }

      this._setLoading(false);
    });

    // Foco en el primer campo vacío
    (!emailInput.value ? emailInput : passwordInput).focus();
  }

  // Activa/desactiva el estado de carga en el botón
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

  // Muestra un mensaje de error bajo el formulario
  _showError(msg) {
    const errorMessage = document.getElementById("errorMessage");
    errorMessage.textContent = msg;
    errorMessage.style.display = "block";
    setTimeout(() => (errorMessage.style.display = "none"), 5000);
  }

  // Cleanup si fuera necesario
  cleanup() {
    // aquí podrías eliminar event listeners globales si los hubieras añadido
  }
}
