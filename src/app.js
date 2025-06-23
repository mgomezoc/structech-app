// src/app.js
// Punto de entrada principal - Inicializa toda la aplicación

import { Capacitor } from "@capacitor/core";
import { SplashScreen } from "@capacitor/splash-screen";
import { setupRoutes } from "./routes/index.js";
import { eventBus } from "./services/api.service.js";
import { authService } from "./services/auth.service.js";

// Importar tu código de escaneo existente
import * as BlinkID from "@microblink/blinkid-capacitor";
import lottie from "lottie-web";
import "./css/style.less";

// Hacer disponibles funciones globales que necesitas
window.lottie = lottie;
window.mostrarMensajeEstado = mostrarMensajeEstado;

// Tu licencia de BlinkID
const LICENSE =
  "sRwCABFjb20uc3RydWN0ZWNoLmFwcABsZXlKRGNtVmhkR1ZrVDI0aU9qRTNOVEEwTVRjMk1EY3hPREVzSWtOeVpXRjBaV1JHYjNJaU9pSTVabVExT0RCa05pMHlaRFJpTFRSak5HWXRPVFUzTUMwMVpXVXlZV1EyTWpZMk5ERWlmUT098Er7cjB+qDKvj4bUcp/EE0Gl92iO/qtPJowZOAmJqazLqMSRnDwD6vCpAUYaRf53vP7WrSYMLcwOB2BeiyNoa3DdBaCH+P3ju2ixpiEEuIRGgB1eQaFhpVkiVdEB5sWN94u4mqp/6HglO50sKXXWcex0mw==";

// Función principal de inicialización
async function initializeApp() {
  try {
    console.log("🚀 Iniciando StructTech App...");

    // Mostrar mensaje de carga
    showLoadingScreen();

    // Inicializar servicios
    const isAuthenticated = await authService.init();
    console.log("🔐 Estado de autenticación:", isAuthenticated);

    // Configurar sistema de rutas
    setupRoutes();

    // Configurar listeners globales
    setupGlobalListeners();

    // Hacer disponible la función de escaneo globalmente
    window.scanINE = scanINE;

    // Ocultar splash screen si es app nativa
    if (Capacitor.isNativePlatform()) {
      await SplashScreen.hide();
    }

    // Ocultar pantalla de carga
    hideLoadingScreen();

    console.log("✅ App inicializada correctamente");
  } catch (error) {
    console.error("❌ Error al inicializar la app:", error);
    hideLoadingScreen();
    showErrorScreen(error.message);
  }
}

// Mostrar pantalla de carga
function showLoadingScreen() {
  const loader = document.createElement("div");
  loader.id = "app-loader";
  loader.innerHTML = `
    <div class="app-loader-container">
      <img src="img/logo-icono-structech.png" alt="StructTech" class="loader-logo" />
      <div class="loader-spinner"></div>
      <p>Cargando...</p>
    </div>
  `;
  document.body.appendChild(loader);
}

// Ocultar pantalla de carga
function hideLoadingScreen() {
  const loader = document.getElementById("app-loader");
  if (loader) {
    loader.remove();
  }
}

// Mostrar pantalla de error
function showErrorScreen(message) {
  document.body.innerHTML = `
    <div class="error-screen">
      <h1>Error al iniciar</h1>
      <p>${message}</p>
      <button onclick="window.location.reload()">Reintentar</button>
    </div>
  `;
}

// Configurar listeners globales
function setupGlobalListeners() {
  // Manejar errores no capturados
  window.addEventListener("unhandledrejection", (event) => {
    console.error("Error no manejado:", event.reason);
    mostrarMensajeEstado("❌ Ha ocurrido un error inesperado", 3000);
  });

  // Manejar cambios de conectividad
  window.addEventListener("online", () => {
    mostrarMensajeEstado("✅ Conexión restaurada", 2000);
  });

  window.addEventListener("offline", () => {
    mostrarMensajeEstado("❌ Sin conexión a internet", 3000);
  });

  // Manejar botón atrás en Android
  if (Capacitor.isNativePlatform()) {
    document.addEventListener("backbutton", () => {
      // Si estamos en login o dashboard, preguntar si salir
      const currentPath = window.location.hash;
      if (
        currentPath === "#/login" ||
        currentPath === "#/dashboard" ||
        currentPath === "#/"
      ) {
        if (confirm("¿Deseas salir de la aplicación?")) {
          navigator.app?.exitApp();
        }
      } else {
        // En otras vistas, volver atrás
        window.history.back();
      }
    });
  }
}

// Tu función de escaneo existente (adaptada)
async function scanINE() {
  mostrarMensajeEstado("▶️ Solicitando permisos de cámara…");

  const { Camera } = Capacitor.Plugins;
  const perm = await Camera.requestPermissions();
  if (perm.camera !== "granted") {
    mostrarMensajeEstado("❌ Permiso de cámara denegado", 3000);
    return;
  }

  mostrarMensajeEstado("🔎 Iniciando BlinkID…");

  try {
    const plugin = new BlinkID.BlinkIDPlugin();
    const recognizer = new BlinkID.BlinkIdMultiSideRecognizer();

    // Ajustes de calidad / filtrado
    recognizer.returnFullDocumentImage = true;
    recognizer.returnFaceImage = true;
    recognizer.returnSignatureImage = true;
    recognizer.allowBarcodeScanOnly = true;
    recognizer.enableBlurFilter = true;
    recognizer.enableGlareFilter = true;
    recognizer.fullDocumentImageDpi = 150;
    recognizer.faceImageDpi = 150;
    recognizer.signatureImageDpi = 150;

    const rc = new BlinkID.RecognizerCollection([recognizer]);

    // Overlay con instrucciones en español
    const overlay = new BlinkID.BlinkIdOverlaySettings();
    overlay.language = "es";
    overlay.country = "MX";
    overlay.showIntroductionDialog = false;
    overlay.showOnboardingInfo = true;
    overlay.showDocumentNotSupportedDialog = true;
    overlay.showFlashlightWarning = true;
    overlay.firstSideInstructionsText =
      "Coloca el FRENTE de tu INE dentro del marco";
    overlay.flipInstructions = "Ahora voltea tu INE y escanea el REVERSO";
    overlay.androidCameraResolutionPreset =
      BlinkID.AndroidCameraResolutionPreset.PresetFullHD;
    overlay.iosCameraResolutionPreset =
      BlinkID.iOSCameraResolutionPreset.PresetFullHD;
    overlay.showTorchButton = true;
    overlay.showCancelButton = true;

    const keys = {
      android: LICENSE,
      ios: LICENSE,
      showTimeLimitedLicenseKeyWarning: true,
    };

    console.log("► Lanzando scanWithCamera…", { recognizer, overlay });
    const results = await plugin.scanWithCamera(overlay, rc, keys);
    console.log("► Resultados:", results);

    if (!results.length) {
      mostrarMensajeEstado("⚠️ Usuario canceló el escaneo", 3000);
    } else {
      // Emitir evento con los resultados
      eventBus.emit("scan:complete", results[0]);

      // Si estamos en la vista del formulario, poblar datos
      if (window.poblarFormulario) {
        window.poblarFormulario(results[0]);
      }

      mostrarMensajeEstado("✅ ¡Documento escaneado exitosamente!", 3000);
    }
  } catch (e) {
    console.error("Error en scanINE:", e);
    mostrarMensajeEstado(`❌ Error al escanear: ${e.message || e}`, 5000);
  }
}

// Función para mostrar mensajes de estado (tu implementación actual)
function mostrarMensajeEstado(mensaje, duracion = 0) {
  // Crear un toast notification
  const toast = document.createElement("div");
  toast.className = "toast-message";
  toast.textContent = mensaje;
  toast.style.cssText = `
    position: fixed;
    bottom: 80px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(0,0,0,0.8);
    color: white;
    padding: 12px 24px;
    border-radius: 24px;
    z-index: 10000;
    font-size: 14px;
    animation: slideUp 0.3s ease-out;
  `;

  document.body.appendChild(toast);

  if (duracion > 0) {
    setTimeout(() => {
      toast.style.animation = "slideDown 0.3s ease-out";
      setTimeout(() => toast.remove(), 300);
    }, duracion);
  } else {
    // Para mensajes sin duración, remover después de 10 segundos
    setTimeout(() => {
      toast.remove();
    }, 10000);
  }
}

// Estilos globales para la app
const globalStyles = `
  <style>
    /* Loader de la app */
    #app-loader {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: white;
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 99999;
    }

    .app-loader-container {
      text-align: center;
    }

    .loader-logo {
      width: 80px;
      height: 80px;
      margin-bottom: 20px;
      animation: pulse 1.5s ease-in-out infinite;
    }

    .loader-spinner {
      width: 40px;
      height: 40px;
      border: 3px solid #e5e7eb;
      border-top-color: #0ea5e9;
      border-radius: 50%;
      margin: 0 auto 20px;
      animation: spin 1s linear infinite;
    }

    /* Animaciones */
    @keyframes pulse {
      0%, 100% { transform: scale(1); opacity: 1; }
      50% { transform: scale(1.1); opacity: 0.8; }
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    @keyframes slideUp {
      from {
        transform: translate(-50%, 100%);
        opacity: 0;
      }
      to {
        transform: translate(-50%, 0);
        opacity: 1;
      }
    }

    @keyframes slideDown {
      from {
        transform: translate(-50%, 0);
        opacity: 1;
      }
      to {
        transform: translate(-50%, 100%);
        opacity: 0;
      }
    }

    /* Toast messages */
    .toast-message {
      animation: slideUp 0.3s ease-out;
    }

    /* Error screen */
    .error-screen {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 20px;
      text-align: center;
    }

    .error-screen h1 {
      color: #ef4444;
      margin-bottom: 16px;
    }

    .error-screen p {
      color: #6b7280;
      margin-bottom: 24px;
    }

    .error-screen button {
      background: #0ea5e9;
      color: white;
      border: none;
      border-radius: 6px;
      padding: 12px 24px;
      font-size: 16px;
      cursor: pointer;
    }

    .error-screen button:hover {
      background: #0284c7;
    }

    /* Asegurar que el contenedor principal use toda la pantalla */
    #app {
      min-height: 100vh;
    }
  </style>
`;

// Inyectar estilos globales
document.head.insertAdjacentHTML("beforeend", globalStyles);

// Iniciar la aplicación cuando el DOM esté listo
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeApp);
} else {
  initializeApp();
}
