// src/app.js
// Punto de entrada principal - Inicializa toda la aplicación

import { Capacitor } from '@capacitor/core';
import { SplashScreen } from '@capacitor/splash-screen';
import { setupRoutes } from './routes/index.js';
import { eventBus } from './services/api.service.js';
import { authService } from './services/auth.service.js';
import { hapticsService } from './services/haptics.service.js';

import { defineElement } from '@lordicon/element';
import * as BlinkID from '@microblink/blinkid-capacitor';
import lottie from 'lottie-web';
import './css/style.less';

// Hacer disponibles funciones globales que necesitas
window.lottie = lottie;
window.mostrarMensajeEstado = mostrarMensajeEstado;

defineElement(lottie.loadAnimation);

// Tu licencia de BlinkID
const LICENSE =
  'sRwCABFjb20uc3RydWN0ZWNoLmFwcABsZXlKRGNtVmhkR1ZrVDI0aU9qRTNOVEEyT0RjNE5UTXpORGdzSWtOeVpXRjBaV1JHYjNJaU9pSmtOVGxoT1dFMU5DMWlOV1EzTFRFek56VXRNRFkyWVMxbVlURmhZemcyTkdaa1pqSWlmUT09K5ZB12XvNfWakJN2x47CRJwF0oSGcF16bKfyRoB8L3L6cosgaXW2pCmyW9k5r+8al2MdRdf2/oLknazvBA/5PqICqpwic3+mjGl5aZcNm63iM/MA1FZx85cKqLZCw+RHY7Zt/VkBQaRfjbRlcRr2vow/EJLOp1TM';

// Función principal de inicialización
async function initializeApp() {
  try {
    console.log('🚀 Iniciando StructTech App...');

    // Mostrar mensaje de carga
    showLoadingScreen();

    // Inicializar servicios
    const isAuthenticated = await authService.init();
    console.log('🔐 Estado de autenticación:', isAuthenticated);

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

    console.log('✅ App inicializada correctamente');
  } catch (error) {
    console.error('❌ Error al inicializar la app:', error);
    hideLoadingScreen();
    showErrorScreen(error.message);
  }
}

// Mostrar pantalla de carga
function showLoadingScreen() {
  const loader = document.createElement('div');
  loader.id = 'app-loader';
  loader.innerHTML = `
    <div class="app-loader-container">
      <div class="loader-content">
        <div class="loader-spinner">
          <div class="spinner-ring"></div>
          <div class="spinner-ring"></div>
          <div class="spinner-ring"></div>
        </div>
        <div class="loader-dots">
          <span></span>
          <span></span>
          <span></span>
        </div>
        <p class="loader-text">Cargando</p>
      </div>
    </div>
  `;

  // Agregar estilos dinámicamente
  const styles = document.createElement('style');
  styles.textContent = `
    #app-loader {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: linear-gradient(135deg, #f0f2f2 0%, #ffffff 100%);
      z-index: 9999;
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 1;
      transition: opacity 0.5s ease-out;
    }

    #app-loader.fade-out {
      opacity: 0;
      pointer-events: none;
    }

    .app-loader-container {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      height: 100%;
      position: relative;
    }

    .loader-content {
      text-align: center;
      position: relative;
    }

    .loader-spinner {
      position: relative;
      width: 80px;
      height: 80px;
      margin: 0 auto 20px;
    }

    .spinner-ring {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      border: 3px solid transparent;
      border-radius: 50%;
    }

    .spinner-ring:nth-child(1) {
      border-top-color: #37a6a6;
      animation: spin 1.5s linear infinite;
    }

    .spinner-ring:nth-child(2) {
      border-right-color: #d96b2b;
      animation: spin 1.5s linear infinite reverse;
      animation-delay: -0.5s;
      width: 90%;
      height: 90%;
      top: 5%;
      left: 5%;
    }

    .spinner-ring:nth-child(3) {
      border-bottom-color: #f2a29b;
      animation: spin 2s linear infinite;
      animation-delay: -1s;
      width: 70%;
      height: 70%;
      top: 15%;
      left: 15%;
    }

    .loader-dots {
      display: flex;
      justify-content: center;
      gap: 8px;
      margin-bottom: 15px;
    }

    .loader-dots span {
      width: 8px;
      height: 8px;
      background: #37a6a6;
      border-radius: 50%;
      animation: dots 1.4s ease-in-out infinite both;
    }

    .loader-dots span:nth-child(1) {
      animation-delay: -0.32s;
    }

    .loader-dots span:nth-child(2) {
      animation-delay: -0.16s;
      background: #d96b2b;
    }

    .loader-dots span:nth-child(3) {
      background: #f2a29b;
    }

    .loader-text {
      color: #732C1C;
      font-size: 16px;
      font-weight: 500;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      margin: 0;
      opacity: 0.8;
      animation: pulse-text 2s ease-in-out infinite;
    }

    @keyframes spin {
      0% {
        transform: rotate(0deg);
      }
      100% {
        transform: rotate(360deg);
      }
    }

    @keyframes dots {
      0%, 80%, 100% {
        transform: scale(0.8);
        opacity: 0.6;
      }
      40% {
        transform: scale(1.2);
        opacity: 1;
      }
    }

    @keyframes pulse-text {
      0%, 100% {
        opacity: 0.6;
      }
      50% {
        opacity: 1;
      }
    }

    /* Responsive */
    @media (max-width: 480px) {
      .loader-spinner {
        width: 60px;
        height: 60px;
      }

      .loader-text {
        font-size: 14px;
      }

      .loader-dots span {
        width: 6px;
        height: 6px;
      }
    }

    /* Dark mode support */
    @media (prefers-color-scheme: dark) {
      #app-loader {
        background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%);
      }

      .loader-text {
        color: #e0e0e0;
      }
    }
  `;

  document.head.appendChild(styles);
  document.body.appendChild(loader);
}

function hideLoadingScreen() {
  const loader = document.getElementById('app-loader');
  if (loader) {
    loader.classList.add('fade-out');
    setTimeout(() => {
      loader.remove();
      // Limpiar estilos también
      const styles = document.querySelector('style');
      if (styles && styles.textContent.includes('#app-loader')) {
        styles.remove();
      }
    }, 500);
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
  window.addEventListener('unhandledrejection', async event => {
    console.error('Error no manejado:', event.reason);

    await dialogService
      .errorWithAction(
        'Error Inesperado',
        'Ha ocurrido un error inesperado en la aplicación.',
        'Recargar',
        'Continuar',
      )
      .then(async shouldReload => {
        if (shouldReload) {
          await hapticsService.medium();
          window.location.reload();
        }
      });
  });

  // Manejar cambios de conectividad
  window.addEventListener('online', async () => {
    await hapticsService.success();
    mostrarMensajeEstado('✅ Conexión restaurada', 2000);
  });

  window.addEventListener('offline', async () => {
    await hapticsService.warning();
    await dialogService.alert(
      'Sin Conexión',
      'Se ha perdido la conexión a internet. Algunas funciones podrían no estar disponibles.',
    );
  });

  // Manejar botón atrás en Android
  if (Capacitor.isNativePlatform()) {
    document.addEventListener('backbutton', async () => {
      const currentPath = window.location.hash;
      if (currentPath === '#/login' || currentPath === '#/dashboard' || currentPath === '#/') {
        // Usar diálogo nativo para confirmar salida
        const shouldExit = await dialogService.confirmExit();
        if (shouldExit) {
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
  await hapticsService.light();

  mostrarMensajeEstado('▶️ Solicitando permisos de cámara…');

  const { Camera } = Capacitor.Plugins;
  const perm = await Camera.requestPermissions();
  if (perm.camera !== 'granted') {
    await hapticsService.error();
    mostrarMensajeEstado('❌ Permiso de cámara denegado', 3000);
    return;
  }

  //mostrarMensajeEstado("🔎 Iniciando BlinkID…");

  try {
    const plugin = new BlinkID.BlinkIDPlugin();
    const recognizer = new BlinkID.BlinkIdMultiSideRecognizer();

    // imágenes completas / faciales / firma
    recognizer.returnFullDocumentImage = true;
    recognizer.returnFaceImage = true;
    recognizer.returnSignatureImage = true;

    // filtrado de mala calidad
    recognizer.enableBlurFilter = true;
    recognizer.enableGlareFilter = true;

    // NO restringir solo a barcode (activar OCR + barcode)
    recognizer.allowBarcodeScanOnly = false;

    // ajustes de DPI
    recognizer.fullDocumentImageDpi = 250; // buena calidad sin ser excesivo
    recognizer.faceImageDpi = 250; // suficiente para detección de rostro
    recognizer.signatureImageDpi = 250; // detalle de trazos fino en firma

    const rc = new BlinkID.RecognizerCollection([recognizer]);

    // Overlay con instrucciones en español
    const overlay = new BlinkID.BlinkIdOverlaySettings();
    // Configuración básica
    overlay.language = 'es';
    overlay.country = 'MX';

    // DESACTIVA TODOS LOS ELEMENTOS DE BRANDING
    overlay.showOnboardingInfo = false; // Oculta la pantalla inicial
    overlay.showIntroductionDialog = false; // Oculta el diálogo introductorio
    overlay.showMicroblinkLogo = false; // Oculta el logo
    overlay.showBrandLogo = false; // Oculta logos adicionales
    overlay.showExitAnimation = false; // Oculta animación al salir
    overlay.showResultScreen = false; // Oculta pantalla de resultados
    overlay.showSuccessFrame = false; // Oculta marco de éxito
    overlay.showCameraListButton = false; // Oculta selector de cámara

    // Texto personalizado (vacío para quitar "Powered by")
    overlay.poweredByText = 'STRUCTECH'; // Elimina el texto de crédito

    // Solo mostrar lo necesario
    overlay.showDocumentNotSupportedDialog = true;
    overlay.showFlashlightWarning = true;
    overlay.showTorchButton = true;
    overlay.showCancelButton = true;

    // Textos personalizados
    overlay.firstSideInstructionsText = 'Coloca el FRENTE de tu INE dentro del marco';
    overlay.flipInstructions = 'Ahora voltea tu INE y escanea el REVERSO';

    // Resolución de cámara
    overlay.androidCameraResolutionPreset = BlinkID.AndroidCameraResolutionPreset.PresetFullHD;
    overlay.iosCameraResolutionPreset = BlinkID.iOSCameraResolutionPreset.PresetFullHD;

    const keys = {
      android: LICENSE,
      ios: LICENSE,
      showTimeLimitedLicenseKeyWarning: false,
    };

    console.log('► Lanzando scanWithCamera…', { recognizer, overlay });
    const results = await plugin.scanWithCamera(overlay, rc, keys);
    console.log('► Resultados:', results);

    if (!results.length) {
      await hapticsService.warning();
      mostrarMensajeEstado('⚠️ Usuario canceló el escaneo', 3000);
    } else {
      await hapticsService.warning();
      // Emitir evento con los resultados
      eventBus.emit('scan:complete', results[0]);

      // Si estamos en la vista del formulario, poblar datos
      if (window.poblarFormulario) {
        window.poblarFormulario(results[0]);
      }

      mostrarMensajeEstado('✅ ¡Documento escaneado exitosamente!', 3000);
    }
  } catch (e) {
    await hapticsService.error();
    console.error('Error en scanINE:', e);
    mostrarMensajeEstado(`❌ Error al escanear: ${e.message || e}`, 5000);
  }
}

// Función para mostrar mensajes de estado (tu implementación actual)
function mostrarMensajeEstado(mensaje, duracion = 0) {
  // Añadir haptic basado en el tipo de mensaje
  if (mensaje.includes('✅')) {
    hapticsService.light(); // Feedback ligero para éxitos
  } else if (mensaje.includes('❌')) {
    hapticsService.error(); // Feedback de error
  } else if (mensaje.includes('⚠️')) {
    hapticsService.warning(); // Feedback de advertencia
  }

  // Crear un toast notification (resto igual)
  const toast = document.createElement('div');
  toast.className = 'toast-message';
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
      toast.style.animation = 'slideDown 0.3s ease-out';
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
document.head.insertAdjacentHTML('beforeend', globalStyles);

// Iniciar la aplicación cuando el DOM esté listo
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeApp);
} else {
  initializeApp();
}
