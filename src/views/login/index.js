import Handlebars from "handlebars";
import { authService } from "../../services/auth.service.js";
import "./style.css";
import tplSource from "./template.hbs?raw";

const template = Handlebars.compile(tplSource);

export default class LoginView {
  constructor() {
    this.isLoading = false;
  }

  // Renderiza el HTML con el view-model
  render() {
    return template({
      title: "Iniciar Sesión",
      subtitle: "Ingresa tus credenciales para continuar",
      emailPlaceholder: "correo@ejemplo.com",
      passwordPlaceholder: "••••••••",
      forgotLinkText: "¿Olvidaste tu contraseña?",
      buttonText: "Iniciar Sesión",
      loadingText: "Iniciando...",
      footerText: "¿No tienes cuenta?",
      registerLinkText: "Regístrate aquí",
    });
  }

  // Después de inyectar el HTML en el DOM, configura eventos
  async afterRender() {
    const form = document.getElementById("loginForm");
    const emailInput = document.getElementById("email");
    const passwordInput = document.getElementById("password");
    const togglePassword = document.getElementById("togglePassword");
    const submitBtn = document.getElementById("submitBtn");
    const btnText = document.getElementById("btnText");
    const btnLoader = document.getElementById("btnLoader");
    const errorMessage = document.getElementById("errorMessage");
    const rememberCheckbox = document.getElementById("remember");

    togglePassword.addEventListener("click", () => {
      const type = passwordInput.type === "password" ? "text" : "password";
      passwordInput.type = type;
      togglePassword.textContent = type === "password" ? "👁️" : "👁️‍🗨️";
    });

    // recordarme
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
        // auth:login se encarga de la navegación
      } else {
        this._showError(result.error);
      }
      this._setLoading(false);
    });

    // foco inicial
    (!emailInput.value ? emailInput : passwordInput).focus();
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
    const errorMessage = document.getElementById("errorMessage");
    errorMessage.textContent = msg;
    errorMessage.style.display = "block";
    setTimeout(() => (errorMessage.style.display = "none"), 5000);
  }

  cleanup() {
    // si necesitas quitar listeners manualmente
  }
}
