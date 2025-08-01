// src/services/notification.service.js
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';

class NotificationService {
  constructor() {
    this.isRegistered = false;
    this.deviceToken = null;
  }

  async init() {
    console.log('🔔 [NotificationService] Inicializando...');

    if (!Capacitor.isNativePlatform()) {
      console.log('⚠️ Push notifications no disponibles en web');
      return;
    }

    try {
      // Solicitar permisos
      console.log('📱 Solicitando permisos de notificación...');
      const permission = await PushNotifications.requestPermissions();
      console.log('🔐 Permisos obtenidos:', permission);

      if (permission.receive === 'granted') {
        await this.registerPushNotifications();
      } else {
        console.log('❌ Permisos de notificación denegados');
      }
    } catch (error) {
      console.error('❌ Error inicializando notificaciones:', error);
    }
  }

  async registerPushNotifications() {
    console.log('📝 Registrando para push notifications...');

    try {
      // Registrar con el sistema
      await PushNotifications.register();
      console.log('✅ Registro completado');

      // Listener para token de dispositivo
      PushNotifications.addListener('registration', token => {
        console.log('🎯 =============================================');
        console.log('📱 TOKEN DE DISPOSITIVO OBTENIDO:');
        console.log(token.value);
        console.log('🎯 =============================================');
        console.log('💡 Copia este token para usar en Postman');
        console.log('🎯 =============================================');

        this.deviceToken = token.value;

        // También mostrar en la UI para fácil copia
        this.showTokenInUI(token.value);
      });

      // Listener para notificaciones recibidas (app abierta)
      PushNotifications.addListener('pushNotificationReceived', notification => {
        console.log('🔔 =============================================');
        console.log('📥 NOTIFICACIÓN RECIBIDA (APP ABIERTA):');
        console.log('Título:', notification.title);
        console.log('Cuerpo:', notification.body);
        console.log('Data:', notification.data);
        console.log('🔔 =============================================');

        // Mostrar notificación en la app
        this.showInAppNotification(notification);
      });

      // Listener para notificaciones tocadas (app cerrada/background)
      PushNotifications.addListener('pushNotificationActionPerformed', notification => {
        console.log('👆 =============================================');
        console.log('🎯 NOTIFICACIÓN TOCADA (APP CERRADA):');
        console.log('Título:', notification.notification.title);
        console.log('Cuerpo:', notification.notification.body);
        console.log('Data:', notification.notification.data);
        console.log('👆 =============================================');

        // Aquí puedes navegar a pantallas específicas
        this.handleNotificationAction(notification);
      });

      // Listener para errores
      PushNotifications.addListener('registrationError', error => {
        console.error('❌ =============================================');
        console.error('🚨 ERROR REGISTRANDO NOTIFICACIONES:');
        console.error(error);
        console.error('❌ =============================================');
      });

      this.isRegistered = true;
      console.log('✅ Listeners configurados correctamente');
    } catch (error) {
      console.error('❌ Error en registerPushNotifications:', error);
    }
  }

  showTokenInUI(token) {
    // Crear modal para mostrar el token
    const modal = document.createElement('div');
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0,0,0,0.8);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10000;
      padding: 20px;
    `;

    modal.innerHTML = `
      <div style="
        background: white;
        padding: 20px;
        border-radius: 10px;
        max-width: 90%;
        max-height: 80%;
        overflow: auto;
      ">
        <h3 style="margin-bottom: 15px; color: #333;">🔔 Token de Dispositivo</h3>
        <p style="margin-bottom: 15px; color: #666;">Copia este token para usar en Postman:</p>
        <textarea readonly style="
          width: 100%;
          height: 100px;
          padding: 10px;
          border: 1px solid #ddd;
          border-radius: 5px;
          font-family: monospace;
          font-size: 12px;
          resize: none;
        ">${token}</textarea>
        <div style="margin-top: 15px; text-align: center;">
          <button onclick="this.parentElement.parentElement.parentElement.remove()" style="
            background: #37a6a6;
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 5px;
            cursor: pointer;
          ">Cerrar</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // Auto-seleccionar el texto para fácil copia
    const textarea = modal.querySelector('textarea');
    textarea.focus();
    textarea.select();
  }

  showInAppNotification(notification) {
    // Crear toast de notificación
    const toast = document.createElement('div');
    toast.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: #37a6a6;
      color: white;
      padding: 15px;
      border-radius: 10px;
      box-shadow: 0 4px 15px rgba(0,0,0,0.3);
      z-index: 9999;
      min-width: 300px;
      animation: slideIn 0.3s ease-out;
    `;

    toast.innerHTML = `
      <div style="font-weight: bold; margin-bottom: 5px;">${notification.title}</div>
      <div style="font-size: 14px; opacity: 0.9;">${notification.body}</div>
    `;

    // Agregar CSS de animación
    const style = document.createElement('style');
    style.textContent = `
      @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
    `;
    document.head.appendChild(style);

    document.body.appendChild(toast);

    // Remover después de 5 segundos
    setTimeout(() => {
      toast.style.animation = 'slideIn 0.3s ease-out reverse';
      setTimeout(() => toast.remove(), 300);
    }, 5000);
  }

  handleNotificationAction(notification) {
    console.log('🔄 Manejando acción de notificación...');
    // Aquí puedes agregar navegación específica según el tipo
    // Por ahora solo logueamos
  }

  // Método para obtener el token manualmente (útil para debugging)
  getDeviceToken() {
    return this.deviceToken;
  }
}

export const notificationService = new NotificationService();
