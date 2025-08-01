// src/app.js
// Punto de entrada principal - Optimizado para carga rápida
import { Capacitor } from '@capacitor/core';
import { Keyboard } from '@capacitor/keyboard';
import { SplashScreen } from '@capacitor/splash-screen';
import { StatusBar, Style } from '@capacitor/status-bar';
import { Toast } from '@capacitor/toast';
import { defineCustomElements } from '@ionic/pwa-elements/loader';
import { setupRoutes } from './routes/index.js';
import { eventBus } from './services/api.service.js';
import { authService } from './services/auth.service.js';
import { dialogService } from './services/dialog.service.js';
import { hapticsService } from './services/haptics.service.js';
import { notificationService } from './services/notification.service.js';
import { $, dom } from './utils/dom.helper.js';

import './css/style.less';

// Definir elementos PWA de forma asíncrona
defineCustomElements(window);

// Variables globales necesarias
window.mostrarMensajeEstado = mostrarMensajeEstado;

// Función principal de inicialización optimizada
async function initializeApp() {
  try {
    console.log('🚀 Iniciando StructTech App...');

    // 1. Mostrar UI mínima inmediatamente
    showMinimalUI();

    // 2. Inicialización crítica (auth)
    const authPromise = authService.init();

    // 3. Configurar rutas inmediatamente (no esperar auth)
    setupRoutes();

    // 4. Configuraciones paralelas no bloqueantes
    const configPromises = [];

    if (Capacitor.isNativePlatform()) {
      configPromises.push(configurePlatform(), configureKeyboard());
    }

    // 5. Cargar dependencias pesadas de forma diferida
    deferHeavyImports();

    // 6. Setup de listeners globales (no bloqueante)
    setupGlobalListeners();

    // 7. Esperar solo auth para continuar
    const isAuthenticated = await authPromise;
    console.log('🔐 Estado de autenticación:', isAuthenticated);

    if (isAuthenticated) {
      await notificationService.init();
    }

    // 8. Esperar configs de plataforma si es necesario
    if (configPromises.length > 0) {
      await Promise.allSettled(configPromises);
    }

    // 9. Ocultar splash y mostrar app
    hideMinimalUI();

    console.log('✅ App inicializada correctamente');
  } catch (error) {
    console.error('❌ Error al inicializar la app:', error);
    showErrorScreen(error.message);
  }
}

/**
 * Mostrar UI mínima mientras carga
 */
function showMinimalUI() {
  // Solo mostrar un indicador muy ligero
  const minimalLoader = dom(document.createElement('div'))
    .attr('id', 'minimal-loader')
    .addClass('minimal-loader')
    .html('<div class="pulse"></div>');

  document.body.appendChild(minimalLoader.get());

  // Estilos inline para evitar esperar CSS
  const style = document.createElement('style');
  style.textContent = `
    .minimal-loader {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      height: 3px;
      background: rgba(55, 166, 166, 0.2);
      z-index: 9999;
    }
    .minimal-loader .pulse {
      height: 100%;
      background: #37a6a6;
      animation: pulse-width 1.5s ease-in-out infinite;
    }
    @keyframes pulse-width {
      0% { width: 0%; }
      50% { width: 70%; }
      100% { width: 100%; }
    }
  `;
  document.head.appendChild(style);
}

/**
 * Ocultar UI mínima
 */
function hideMinimalUI() {
  const loader = $('#minimal-loader');
  if (loader) {
    dom(loader).addClass('fade-out');
    setTimeout(() => loader.remove(), 300);
  }
}

/**
 * Configurar plataforma nativa
 */
async function configurePlatform() {
  try {
    await Promise.all([
      StatusBar.setStyle({ style: Style.Dark }),
      StatusBar.setOverlaysWebView({ overlay: true }),
      SplashScreen.hide(),
    ]);
  } catch (error) {
    console.error('Error configurando plataforma:', error);
  }
}

/**
 * Configurar teclado de forma optimizada
 */
async function configureKeyboard() {
  try {
    // Configuraciones básicas primero
    await Promise.all([
      Keyboard.setAccessoryBarVisible({ isVisible: true }),
      Keyboard.setResizeMode({ mode: 'ionic' }),
      Keyboard.setStyle({ style: 'light' }),
    ]);

    // Listeners después (no bloqueante)
    Keyboard.addListener('keyboardWillShow', info => {
      requestAnimationFrame(() => {
        document.body.classList.add('keyboard-visible');
        document.body.style.setProperty('--keyboard-height', `${info.keyboardHeight}px`);
      });
    });

    Keyboard.addListener('keyboardWillHide', () => {
      requestAnimationFrame(() => {
        document.body.classList.remove('keyboard-visible');
        document.body.style.removeProperty('--keyboard-height');
      });
    });
  } catch (error) {
    console.error('Error configurando teclado:', error);
  }
}

/**
 * Importar dependencias pesadas de forma diferida
 */
function deferHeavyImports() {
  // Cargar Lottie solo cuando se necesite
  if ('requestIdleCallback' in window) {
    requestIdleCallback(() => loadHeavyDeps(), { timeout: 2000 });
  } else {
    setTimeout(loadHeavyDeps, 1000);
  }
}

async function loadHeavyDeps() {
  try {
    // Importar dependencias pesadas
    const [{ defineElement }, lottie, BlinkID] = await Promise.all([
      import('@lordicon/element'),
      import('lottie-web'),
      import('@microblink/blinkid-capacitor'),
    ]);

    // Configurar después de cargar
    window.lottie = lottie.default || lottie;
    defineElement(window.lottie.loadAnimation);

    // Configurar BlinkID
    window.BlinkID = BlinkID;
    window.scanINE = createScanINE(BlinkID);
  } catch (error) {
    console.error('Error cargando dependencias diferidas:', error);
  }
}

/**
 * Crear función scanINE optimizada
 */
function createScanINE(BlinkID) {
  return async function scanINE() {
    await hapticsService.light();
    mostrarMensajeEstado('▶️ Iniciando escáner...', 2000);

    // Verificar permisos
    const { Camera } = Capacitor.Plugins;
    const perm = await Camera.requestPermissions();

    if (perm.camera !== 'granted') {
      await hapticsService.error();
      return mostrarMensajeEstado('❌ Permiso de cámara denegado', 3000);
    }

    try {
      const plugin = new BlinkID.BlinkIDPlugin();
      const recognizer = new BlinkID.BlinkIdMultiSideRecognizer();

      // Configuración optimizada
      recognizer.returnFullDocumentImage = true;
      recognizer.returnFaceImage = true;
      recognizer.returnSignatureImage = true;
      recognizer.enableBlurFilter = true;
      recognizer.enableGlareFilter = true;
      recognizer.fullDocumentImageDpi = 200; // Reducido para performance
      recognizer.faceImageDpi = 200;

      const rc = new BlinkID.RecognizerCollection([recognizer]);
      const overlay = new BlinkID.BlinkIdOverlaySettings();

      // Configuración de overlay
      overlay.language = 'es';
      overlay.country = 'MX';
      overlay.showMicroblinkLogo = false;
      overlay.poweredByText = 'STRUCTECH';
      overlay.firstSideInstructionsText = 'Coloca el FRENTE de tu INE dentro del marco';
      overlay.flipInstructions = 'Ahora voltea tu INE y escanea el REVERSO';

      const keys = {
        android:
          'sRwCABFjb20uc3RydWN0ZWNoLmFwcABsZXlKRGNtVmhkR1ZrVDI0aU9qRTNOVEl5TXpFMU5UWXhOVGdzSWtOeVpXRjBaV1JHYjNJaU9pSmtOVGxoT1dFMU5DMWlOV1EzTFRFek56VXRNRFkyWVMxbVlURmhZemcyTkdaa1pqSWlmUT09DbgY5pEazKW1FM0yIcUkMoZy1UkBI8dMWchnH/GnjczJHqe0hVr51BAiWM25FjsicPtpmfBLtmIZVE2lz8ARr4nB63QBhLjwccCjzYWTZrcqfe1yQzoHzujEn1ty9VpCVxIwM5HXmJPKNV7vgIiaeLyIQiTOQ3dE/A==',
        ios: 'sRwCABFjb20uc3RydWN0ZWNoLmFwcAFsZXlKRGNtVmhkR1ZrVDI0aU9qRTNOVE14TnpNNU5URTRNRFlzSWtOeVpXRjBaV1JHYjNJaU9pSXlNMlUzTnpOaE9DMWlNR1psTFRSaE1tWXRZamcwWWkxbFl6RTFOVEl6TlRRd1pXRWlmUT097bBhYnf2GNz76bOt44pkNlEuLuEJr5v/ykxczWzyu1T/u7IBRgvNi9Cs2wTmtwTpBGZydZcAnPWd3sPCemR3qbKRSCGgp5WzZFZMJGJf17Tk97c661IzzXH+CHq7jgrr2gdZbee6mUzlJsCno9N+h4zOA/k0lMvytA==',
        showTimeLimitedLicenseKeyWarning: false,
      };

      const results = await plugin.scanWithCamera(overlay, rc, keys);

      if (!results.length) {
        await hapticsService.warning();
        mostrarMensajeEstado('⚠️ Escaneo cancelado', 3000);
      } else {
        await hapticsService.success();
        eventBus.emit('scan:complete', results[0]);
        window.poblarFormulario?.(results[0]);
        mostrarMensajeEstado('✅ ¡Documento escaneado!', 3000);
      }
    } catch (e) {
      await hapticsService.error();
      console.error('Error en scanINE:', e);
      mostrarMensajeEstado(`❌ Error: ${e.message || e}`, 5000);
    }
  };
}

/**
 * Configurar listeners globales optimizados
 */
function setupGlobalListeners() {
  // Error handling
  window.addEventListener('unhandledrejection', event => {
    console.error('Error no manejado:', event.reason);
    // No mostrar diálogo, solo log
  });

  // Conexión
  window.addEventListener('online', () => {
    mostrarMensajeEstado('✅ Conexión restaurada', 2000);
  });

  window.addEventListener('offline', () => {
    mostrarMensajeEstado('⚠️ Sin conexión', 3000);
  });

  // Back button para Android
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

/**
 * Toast multiplataforma optimizado
 * Usa plugin nativo en móviles y fallback visual en web
 */
async function mostrarMensajeEstado(mensaje, duracion = 3000) {
  // Haptics (opcional)
  if (mensaje.includes('✅')) hapticsService.light();
  else if (mensaje.includes('❌')) hapticsService.error();
  else if (mensaje.includes('⚠️')) hapticsService.warning();

  if (Capacitor.isNativePlatform()) {
    await Toast.show({
      text: mensaje,
      duration: duracion >= 4000 ? 'long' : 'short',
    });
  } else {
    // Fallback visual solo para web
    let toast = document.querySelector('.toast-message');
    if (!toast) {
      toast = document.createElement('div');
      toast.className = 'toast-message';
      document.body.appendChild(toast);
    }

    toast.textContent = mensaje;
    toast.classList.remove('hide');
    toast.classList.add('show');

    clearTimeout(toast._timeout);
    toast._timeout = setTimeout(() => {
      toast.classList.remove('show');
      toast.classList.add('hide');
    }, duracion);
  }
}

/**
 * Pantalla de error mejorada
 */
function showErrorScreen(message) {
  hideMinimalUI();

  const errorHtml = `
    <div class="error-screen">
      <div class="error-icon">⚠️</div>
      <h1>Error al iniciar</h1>
      <p>${message}</p>
      <button id="retryButton">Reintentar</button>
    </div>
  `;

  dom(document.body).html(errorHtml);
  dom('#retryButton').on('click', () => window.location.reload());
}

// Estilos críticos inline
const criticalStyles = `
  .toast-message {
    position: fixed;
    bottom: 80px;
    left: 50%;
    transform: translateX(-50%) translateY(100%);
    background: rgba(0,0,0,0.85);
    color: white;
    padding: 12px 24px;
    border-radius: 24px;
    z-index: 10000;
    font-size: 14px;
    transition: transform 0.3s ease-out;
    pointer-events: none;
  }
  
  .toast-message.show {
    transform: translateX(-50%) translateY(0);
  }
  
  .toast-message.hide {
    transform: translateX(-50%) translateY(100%);
  }
  
  .error-screen {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    padding: 20px;
    text-align: center;
  }
  
  .error-icon {
    font-size: 48px;
    margin-bottom: 16px;
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
    background: #37a6a6;
    color: white;
    border: none;
    border-radius: 8px;
    padding: 12px 24px;
    font-size: 16px;
    cursor: pointer;
  }
  
  .minimal-loader.fade-out {
    opacity: 0;
    transition: opacity 0.3s ease-out;
  }
`;

// Inyectar estilos críticos inmediatamente
const styleEl = document.createElement('style');
styleEl.textContent = criticalStyles;
document.head.appendChild(styleEl);

// Iniciar cuando el DOM esté listo
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeApp);
} else {
  initializeApp();
}
