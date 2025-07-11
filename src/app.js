// src/app.js
// Punto de entrada principal - Inicializa toda la aplicación

import { Capacitor } from '@capacitor/core';
import { Keyboard } from '@capacitor/keyboard'; // <-- Nuevo import
import { SplashScreen } from '@capacitor/splash-screen';
import { setupRoutes } from './routes/index.js';
import { eventBus } from './services/api.service.js';
import { authService } from './services/auth.service.js';
import { dialogService } from './services/dialog.service.js';
import { hapticsService } from './services/haptics.service.js';
import { $, dom } from './utils/dom.helper.js'; // 👈 Importar dom helper

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
  'sRwCABFjb20uc3RydWN0ZWNoLmFwcABsZXlKRGNtVmhkR1ZrVDI0aU9qRTNOVEl5TXpFMU5UWXhOVGdzSWtOeVpXRjBaV1JHYjNJaU9pSmtOVGxoT1dFMU5DMWlOV1EzTFRFek56VXRNRFkyWVMxbVlURmhZemcyTkdaa1pqSWlmUT09DbgY5pEazKW1FM0yIcUkMoZy1UkBI8dMWchnH/GnjczJHqe0hVr51BAiWM25FjsicPtpmfBLtmIZVE2lz8ARr4nB63QBhLjwccCjzYWTZrcqfe1yQzoHzujEn1ty9VpCVxIwM5HXmJPKNV7vgIiaeLyIQiTOQ3dE/A==';

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

    // Configurar comportamiento global del teclado
    if (Capacitor.isNativePlatform()) {
      await configureKeyboard();
    }

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

// Nueva función para configurar el teclado globalmente
async function configureKeyboard() {
  try {
    // Listener global para cuando se muestra el teclado
    Keyboard.addListener('keyboardWillShow', info => {
      // Agregar clase al body para ajustes globales
      document.body.classList.add('keyboard-visible');
      document.body.style.setProperty('--keyboard-height', `${info.keyboardHeight}px`);
    });

    Keyboard.addListener('keyboardWillHide', () => {
      document.body.classList.remove('keyboard-visible');
      document.body.style.removeProperty('--keyboard-height');
    });

    // Mostrar la barra de accesorios en iOS (Done button)
    await Keyboard.setAccessoryBarVisible({ isVisible: true });

    // Configurar el modo de resize
    await Keyboard.setResizeMode({ mode: 'ionic' });

    // Estilo del teclado (light/dark)
    await Keyboard.setStyle({ style: 'light' });
  } catch (error) {
    console.error('Error configurando teclado:', error);
  }
}

// ✅ Mostrar pantalla de carga usando dom helper
function showLoadingScreen() {
  const loaderHtml = `
    <div class="app-loader-container">
      <div class="loader-content">
        <div class="loader-spinner">
          <div class="spinner-ring"></div>
          <div class="spinner-ring"></div>
          <div class="spinner-ring"></div>
        </div>
        <div class="loader-dots">
          <span></span><span></span><span></span>
        </div>
        <p class="loader-text">Cargando</p>
      </div>
    </div>
  `;

  const loader = dom(document.createElement('div'));
  loader.attr('id', 'app-loader').html(loaderHtml);

  const styles = document.createElement('style');
  styles.textContent = getLoaderStyles();

  document.head.appendChild(styles);
  document.body.appendChild(loader.get());
}

// ✅ Ocultar loader usando dom helper
function hideLoadingScreen() {
  const loader = $('#app-loader');
  if (loader) {
    dom(loader).addClass('fade-out');
    setTimeout(() => {
      loader.parentNode?.removeChild(loader);
      // Limpiar estilos
      document.querySelectorAll('style').forEach(s => {
        if (s.textContent?.includes('#app-loader')) s.parentNode?.removeChild(s);
      });
    }, 500);
  }
}

// ✅ Mostrar pantalla de error usando dom helper
function showErrorScreen(message) {
  const errorHtml = `
    <div class="error-screen">
      <h1>Error al iniciar</h1>
      <p>${message}</p>
      <button id="retryButton">Reintentar</button>
    </div>
  `;
  dom(document.body).html(errorHtml);
  dom('#retryButton').on('click', () => window.location.reload());
}

// Configurar listeners globales
function setupGlobalListeners() {
  window.addEventListener('unhandledrejection', async event => {
    console.error('Error no manejado:', event.reason);
    const shouldReload = await dialogService.errorWithAction(
      'Error Inesperado',
      'Ha ocurrido un error inesperado en la aplicación.',
      'Recargar',
      'Continuar',
    );
    if (shouldReload) {
      await hapticsService.medium();
      window.location.reload();
    }
  });

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

  if (Capacitor.isNativePlatform()) {
    document.addEventListener('backbutton', async () => {
      const path = window.location.hash;
      if (['#/login', '#/dashboard', '#/'].includes(path)) {
        const exit = await dialogService.confirmExit();
        if (exit) navigator.app?.exitApp();
      } else {
        window.history.back();
      }
    });
  }
}

// Función de escaneo con BlinkID
async function scanINE() {
  await hapticsService.light();
  mostrarMensajeEstado('▶️ Solicitando permisos de cámara…');
  const { Camera } = Capacitor.Plugins;
  const perm = await Camera.requestPermissions();
  if (perm.camera !== 'granted') {
    await hapticsService.error();
    return mostrarMensajeEstado('❌ Permiso de cámara denegado', 3000);
  }

  try {
    const plugin = new BlinkID.BlinkIDPlugin();
    const recognizer = new BlinkID.BlinkIdMultiSideRecognizer();
    recognizer.returnFullDocumentImage = true;
    recognizer.returnFaceImage = true;
    recognizer.returnSignatureImage = true;
    recognizer.enableBlurFilter = true;
    recognizer.enableGlareFilter = true;
    recognizer.allowBarcodeScanOnly = false;
    recognizer.fullDocumentImageDpi = 250;
    recognizer.faceImageDpi = 250;
    recognizer.signatureImageDpi = 250;

    const rc = new BlinkID.RecognizerCollection([recognizer]);
    const overlay = new BlinkID.BlinkIdOverlaySettings();
    overlay.language = 'es';
    overlay.country = 'MX';
    overlay.showOnboardingInfo = false;
    overlay.showIntroductionDialog = false;
    overlay.showMicroblinkLogo = false;
    overlay.showBrandLogo = false;
    overlay.showExitAnimation = false;
    overlay.showResultScreen = false;
    overlay.showSuccessFrame = false;
    overlay.showCameraListButton = false;
    overlay.showScanningLine = false;
    overlay.poweredByText = 'STRUCTECH';
    overlay.showDocumentNotSupportedDialog = true;
    overlay.showFlashlightWarning = true;
    overlay.showTorchButton = true;
    overlay.showCancelButton = true;
    overlay.firstSideInstructionsText = 'Coloca el FRENTE de tu INE dentro del marco';
    overlay.flipInstructions = 'Ahora voltea tu INE y escanea el REVERSO';
    overlay.androidCameraResolutionPreset = BlinkID.AndroidCameraResolutionPreset.PresetFullHD;
    overlay.iosCameraResolutionPreset = BlinkID.iOSCameraResolutionPreset.PresetFullHD;

    const keys = {
      android: LICENSE,
      ios: LICENSE,
      showTimeLimitedLicenseKeyWarning: false,
    };
    console.log('► Lanzando scanWithCamera…');
    const results = await plugin.scanWithCamera(overlay, rc, keys);

    if (!results.length) {
      await hapticsService.warning();
      mostrarMensajeEstado('⚠️ Usuario canceló el escaneo', 3000);
    } else {
      await hapticsService.warning();
      eventBus.emit('scan:complete', results[0]);
      window.poblarFormulario?.(results[0]);
      mostrarMensajeEstado('✅ ¡Documento escaneado exitosamente!', 3000);
    }
  } catch (e) {
    await hapticsService.error();
    console.error('Error en scanINE:', e);
    mostrarMensajeEstado(`❌ Error al escanear: ${e.message || e}`, 5000);
  }
}

// Función para mostrar toasts
function mostrarMensajeEstado(mensaje, duracion = 0) {
  if (mensaje.includes('✅')) hapticsService.light();
  else if (mensaje.includes('❌')) hapticsService.error();
  else if (mensaje.includes('⚠️')) hapticsService.warning();

  const toast = dom(document.createElement('div')).addClass('toast-message').text(mensaje).css({
    position: 'fixed',
    bottom: '80px',
    left: '50%',
    transform: 'translateX(-50%)',
    background: 'rgba(0,0,0,0.8)',
    color: 'white',
    padding: '12px 24px',
    borderRadius: '24px',
    zIndex: '10000',
    fontSize: '14px',
    animation: 'slideUp 0.3s ease-out',
  });

  document.body.appendChild(toast.get());

  const removeToast = () => {
    toast.css('animation', 'slideDown 0.3s ease-out');
    setTimeout(() => toast.get().remove(), 300);
  };

  if (duracion > 0) setTimeout(removeToast, duracion);
  else setTimeout(removeToast, 10000);
}

// Estilos del loader
function getLoaderStyles() {
  return `
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
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
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
      0%, 100% { opacity: 0.6; }
      50% { opacity: 1; }
    }

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

    @media (prefers-color-scheme: dark) {
      #app-loader {
        background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%);
      }
      .loader-text {
        color: #e0e0e0;
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
      transition: background 0.2s;
    }

    .error-screen button:hover {
      background: #0284c7;
    }

    /* Animaciones globales */
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

    /* Asegurar que el contenedor principal use toda la pantalla */
    #app {
      min-height: 100vh;
    }
  `;
}

// Iniciar cuando el DOM esté listo
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeApp);
} else {
  initializeApp();
}
