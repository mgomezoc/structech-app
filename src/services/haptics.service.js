// src/services/haptics.service.js

import { Capacitor } from "@capacitor/core";
import { Haptics, ImpactStyle, NotificationType } from "@capacitor/haptics";

class HapticsService {
  constructor() {
    this.isAvailable = Capacitor.isNativePlatform();
  }

  // Feedback ligero para interacciones menores
  async light() {
    if (!this.isAvailable) return;
    try {
      await Haptics.impact({ style: ImpactStyle.Light });
    } catch (error) {
      console.warn("Haptics light failed:", error);
    }
  }

  // Feedback medio para acciones importantes
  async medium() {
    if (!this.isAvailable) return;
    try {
      await Haptics.impact({ style: ImpactStyle.Medium });
    } catch (error) {
      console.warn("Haptics medium failed:", error);
    }
  }

  // Feedback fuerte para acciones críticas
  async heavy() {
    if (!this.isAvailable) return;
    try {
      await Haptics.impact({ style: ImpactStyle.Heavy });
    } catch (error) {
      console.warn("Haptics heavy failed:", error);
    }
  }

  // Feedback de éxito
  async success() {
    if (!this.isAvailable) return;
    try {
      await Haptics.notification({ type: NotificationType.Success });
    } catch (error) {
      console.warn("Haptics success failed:", error);
    }
  }

  // Feedback de error
  async error() {
    if (!this.isAvailable) return;
    try {
      await Haptics.notification({ type: NotificationType.Error });
    } catch (error) {
      console.warn("Haptics error failed:", error);
    }
  }

  // Feedback de advertencia
  async warning() {
    if (!this.isAvailable) return;
    try {
      await Haptics.notification({ type: NotificationType.Warning });
    } catch (error) {
      console.warn("Haptics warning failed:", error);
    }
  }

  // Vibración personalizada para selección
  async selection() {
    if (!this.isAvailable) return;
    try {
      await Haptics.selectionStart();
    } catch (error) {
      console.warn("Haptics selection failed:", error);
    }
  }
}

export const hapticsService = new HapticsService();
