// src/services/notification.service.js
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';

const PLUGIN = 'PushNotifications';

class NotificationService {
  constructor() {
    this.isRegistered = false;
    this.deviceToken = null;
  }

  async init() {
    console.log('🔔 [NotificationService] Inicializando...');

    const isNative = Capacitor.isNativePlatform?.() ?? false;
    const hasPlugin = Capacitor.isPluginAvailable?.(PLUGIN) ?? false;
    const platform = Capacitor.getPlatform?.();

    if (!isNative || !hasPlugin) {
      console.log(`⚠️ ${PLUGIN} no disponible. Detalles:`, { isNative, hasPlugin, platform });
      return; // No intentes usar el plugin si no existe
    }

    try {
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
      await PushNotifications.register();
      console.log('✅ Registro solicitado');

      // Token (APNs o FCM según tu integración)
      PushNotifications.addListener('registration', token => {
        console.log('🎯 TOKEN DISPOSITIVO:', token.value);
        this.deviceToken = token.value;
        //this.showTokenInUI(token.value);
      });

      // Notificación recibida en foreground
      PushNotifications.addListener('pushNotificationReceived', notification => {
        console.log('🔔 NOTIFICACIÓN (foreground):', notification);
        this.showInAppNotification(notification);
      });

      // Usuario tocó la notificación
      PushNotifications.addListener('pushNotificationActionPerformed', notification => {
        console.log('👆 Acción en notificación:', notification);
        this.handleNotificationAction(notification);
      });

      // Error en el registro
      PushNotifications.addListener('registrationError', error => {
        console.error('🚨 Error registrando notificaciones:', error);
      });

      this.isRegistered = true;
      console.log('✅ Listeners configurados');
    } catch (error) {
      console.error('❌ Error en registerPushNotifications:', error);
    }
  }

  showTokenInUI(token) {
    const modal = document.createElement('div');
    modal.style.cssText = `
      position: fixed; inset: 0; background: rgba(0,0,0,.8);
      display:flex; align-items:center; justify-content:center;
      z-index: 10000; padding: 20px;
    `;
    modal.innerHTML = `
      <div style="background:#fff; padding:20px; border-radius:10px; max-width:90%; max-height:80%; overflow:auto;">
        <h3 style="margin-bottom: 15px; color: #333;">🔔 Token de Dispositivo</h3>
        <p style="margin-bottom: 15px; color: #666;">Copia este token para usar en Postman:</p>
        <textarea readonly style="width:100%; height:100px; padding:10px; border:1px solid #ddd; border-radius:5px; font-family:monospace; font-size:12px; resize:none;">${token}</textarea>
        <div style="margin-top:15px; text-align:center;">
          <button id="close-token-modal-btn" style="background:#37a6a6; color:#fff; border:none; padding:10px 20px; border-radius:5px; cursor:pointer;">Cerrar</button>
        </div>
      </div>
    `;
    modal.querySelector('#close-token-modal-btn').addEventListener('click', () => modal.remove());
    document.body.appendChild(modal);
    const textarea = modal.querySelector('textarea');
    textarea.focus();
    textarea.select();
  }

  showInAppNotification(notification) {
    const toast = document.createElement('div');
    toast.style.cssText = `
      position: fixed; top: 20px; right: 20px; background: #37a6a6; color: #fff;
      padding: 15px; border-radius: 10px; box-shadow: 0 4px 15px rgba(0,0,0,.3);
      z-index: 9999; min-width: 300px; animation: slideIn .3s ease-out;
    `;
    toast.innerHTML = `
      <div style="font-weight:600; margin-bottom:5px;">${notification.title ?? 'Notificación'}</div>
      <div style="font-size:14px; opacity:.9;">${notification.body ?? ''}</div>
    `;
    const style = document.createElement('style');
    style.textContent = `@keyframes slideIn{from{transform:translateX(100%);opacity:0}to{transform:translateX(0);opacity:1}}`;
    document.head.appendChild(style);
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.style.animation = 'slideIn .3s ease-out reverse';
      setTimeout(() => toast.remove(), 300);
    }, 5000);
  }

  handleNotificationAction(notification) {
    console.log('🔄 Manejar acción de notificación', notification);
    // TODO: navegación según payload
  }

  getDeviceToken() {
    return this.deviceToken;
  }
}

export const notificationService = new NotificationService();
