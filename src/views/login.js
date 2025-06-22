// src/views/login.js
// Vista de login - Interfaz para iniciar sesión

import { authService } from "../services/auth.service.js";

export default class LoginView {
  constructor() {
    this.isLoading = false;
  }

  render() {
    return `
      <div class="login-container">
        <div class="login-card">
          <div class="login-header">
            <img src="img/logo-icono-structech.png" alt="StructTech" class="login-logo" />
            <h2>Iniciar Sesión</h2>
            <p>Ingresa tus credenciales para continuar</p>
          </div>

          <form id="loginForm" class="login-form">
            <div class="form-group">
              <label for="email">Correo electrónico</label>
              <input
                type="email"
                id="email"
                name="email"
                class="form-control"
                placeholder="correo@ejemplo.com"
                required
                autocomplete="email"
              />
            </div>

            <div class="form-group">
              <label for="password">Contraseña</label>
              <div class="password-input-wrapper">
                <input
                  type="password"
                  id="password"
                  name="password"
                  class="form-control"
                  placeholder="••••••••"
                  required
                  autocomplete="current-password"
                />
                <button type="button" id="togglePassword" class="toggle-password">
                  👁️
                </button>
              </div>
            </div>

            <div class="form-options">
              <label class="checkbox-wrapper">
                <input type="checkbox" id="remember" name="remember" />
                <span>Recordarme</span>
              </label>
              <a href="#/forgot-password" class="forgot-link">¿Olvidaste tu contraseña?</a>
            </div>

            <button type="submit" class="btn-primary" id="submitBtn">
              <span id="btnText">Iniciar Sesión</span>
              <span id="btnLoader" style="display: none;">
                <span class="spinner-small"></span>
                Iniciando...
              </span>
            </button>

            <div id="errorMessage" class="error-message" style="display: none;"></div>
          </form>

          <div class="login-footer">
            <p>¿No tienes cuenta? <a href="#/register">Regístrate aquí</a></p>
          </div>
        </div>
      </div>

      <style>
        .login-container {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          //background: linear-gradient(135deg, #0ea5e9 0%, #06b6d4 100%);
          padding: 20px;
        }

        .login-card {
          background: white;
          border-radius: 12px;
          box-shadow: 0 10px 40px rgba(0, 0, 0, 0.1);
          width: 100%;
          max-width: 400px;
          padding: 40px;
        }

        .login-header {
          text-align: center;
          margin-bottom: 30px;
        }

        .login-logo {
          width: 80px;
          height: 80px;
          margin-bottom: 20px;
        }

        .login-header h2 {
          color: #1f2937;
          margin-bottom: 10px;
          font-size: 24px;
        }

        .login-header p {
          color: #6b7280;
          font-size: 14px;
        }

        .login-form .form-group {
          margin-bottom: 20px;
        }

        .login-form label {
          display: block;
          margin-bottom: 8px;
          color: #374151;
          font-weight: 500;
          font-size: 14px;
        }

        .password-input-wrapper {
          position: relative;
        }

        .toggle-password {
          position: absolute;
          right: 12px;
          top: 50%;
          transform: translateY(-50%);
          background: none;
          border: none;
          cursor: pointer;
          font-size: 18px;
          padding: 4px;
          opacity: 0.6;
          transition: opacity 0.2s;
        }

        .toggle-password:hover {
          opacity: 1;
        }

        .form-options {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 24px;
          font-size: 14px;
        }

        .checkbox-wrapper {
          display: flex;
          align-items: center;
          cursor: pointer;
        }

        .checkbox-wrapper input {
          margin-right: 8px;
        }

        .forgot-link {
          color: #0ea5e9;
          text-decoration: none;
        }

        .forgot-link:hover {
          text-decoration: underline;
        }

        .btn-primary {
          width: 100%;
          padding: 12px 24px;
          background: #0ea5e9;
          color: white;
          border: none;
          border-radius: 8px;
          font-size: 16px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .btn-primary:hover:not(:disabled) {
          background: #0284c7;
          transform: translateY(-1px);
        }

        .btn-primary:disabled {
          opacity: 0.7;
          cursor: not-allowed;
        }

        .spinner-small {
          width: 16px;
          height: 16px;
          border: 2px solid #ffffff40;
          border-top-color: white;
          border-radius: 50%;
          display: inline-block;
          animation: spin 0.8s linear infinite;
          margin-right: 8px;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .error-message {
          background: #fef2f2;
          color: #dc2626;
          padding: 12px;
          border-radius: 6px;
          margin-top: 16px;
          font-size: 14px;
          text-align: center;
        }

        .login-footer {
          text-align: center;
          margin-top: 24px;
          font-size: 14px;
          color: #6b7280;
        }

        .login-footer a {
          color: #0ea5e9;
          text-decoration: none;
        }

        .view-loader {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
        }

        .spinner {
          width: 40px;
          height: 40px;
          border: 4px solid #e5e7eb;
          border-top-color: #0ea5e9;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }
      </style>
    `;
  }

  async afterRender() {
    // Obtener referencias a elementos
    const form = document.getElementById("loginForm");
    const emailInput = document.getElementById("email");
    const passwordInput = document.getElementById("password");
    const togglePasswordBtn = document.getElementById("togglePassword");
    const submitBtn = document.getElementById("submitBtn");
    const btnText = document.getElementById("btnText");
    const btnLoader = document.getElementById("btnLoader");
    const errorMessage = document.getElementById("errorMessage");
    const rememberCheckbox = document.getElementById("remember");

    // Toggle para mostrar/ocultar contraseña
    togglePasswordBtn.addEventListener("click", () => {
      const type = passwordInput.type === "password" ? "text" : "password";
      passwordInput.type = type;
      togglePasswordBtn.textContent = type === "password" ? "👁️" : "👁️‍🗨️";
    });

    // Cargar email si estaba guardado
    const savedEmail = localStorage.getItem("remembered_email");
    if (savedEmail) {
      emailInput.value = savedEmail;
      rememberCheckbox.checked = true;
    }

    // Manejar envío del formulario
    form.addEventListener("submit", async (e) => {
      e.preventDefault();

      if (this.isLoading) return;

      const email = emailInput.value.trim();
      const password = passwordInput.value;

      // Validación básica
      if (!email || !password) {
        this.showError("Por favor completa todos los campos");
        return;
      }

      // Iniciar loading
      this.setLoading(true);
      errorMessage.style.display = "none";

      try {
        // Intentar login
        const result = await authService.login(email, password);

        if (result.success) {
          // Guardar email si se marcó "recordarme"
          if (rememberCheckbox.checked) {
            localStorage.setItem("remembered_email", email);
          } else {
            localStorage.removeItem("remembered_email");
          }

          // Mostrar mensaje de éxito
          if (window.mostrarMensajeEstado) {
            window.mostrarMensajeEstado("✅ ¡Bienvenido!", 2000);
          }

          // La navegación se maneja automáticamente por el evento auth:login
        } else {
          this.showError(result.error || "Error al iniciar sesión");
        }
      } catch (error) {
        console.error("Error en login:", error);
        this.showError("Error inesperado. Por favor intenta de nuevo.");
      } finally {
        this.setLoading(false);
      }
    });

    // Auto-focus en el primer campo vacío
    if (!emailInput.value) {
      emailInput.focus();
    } else {
      passwordInput.focus();
    }
  }

  setLoading(loading) {
    this.isLoading = loading;
    const submitBtn = document.getElementById("submitBtn");
    const btnText = document.getElementById("btnText");
    const btnLoader = document.getElementById("btnLoader");

    if (!submitBtn || !btnText || !btnLoader) {
      // Ya no estamos en la vista de login
      return;
    }

    if (loading) {
      submitBtn.disabled = true;
      btnText.style.display = "none";
      btnLoader.style.display = "flex";
    } else {
      submitBtn.disabled = false;
      btnText.style.display = "block";
      btnLoader.style.display = "none";
    }
  }

  showError(message) {
    const errorMessage = document.getElementById("errorMessage");
    errorMessage.textContent = message;
    errorMessage.style.display = "block";

    // Auto-ocultar después de 5 segundos
    setTimeout(() => {
      errorMessage.style.display = "none";
    }, 5000);
  }

  cleanup() {
    // Limpiar event listeners si es necesario
    console.log("Limpiando vista de login");
  }
}
