// src/services/dialog.service.js

import { Capacitor } from "@capacitor/core";
import { Dialog } from "@capacitor/dialog";
import { hapticsService } from "./haptics.service.js";

class DialogService {
  constructor() {
    this.isNative = Capacitor.isNativePlatform();
  }

  // Alerta simple
  async alert(title, message, buttonTitle = "OK") {
    await hapticsService.light(); // Haptic al mostrar diálogo

    if (this.isNative) {
      await Dialog.alert({
        title,
        message,
        buttonTitle,
      });
    } else {
      // Fallback para web
      window.alert(`${title}\n\n${message}`);
    }
  }

  // Confirmación (Si/No)
  async confirm(
    title,
    message,
    okButtonTitle = "Aceptar",
    cancelButtonTitle = "Cancelar"
  ) {
    await hapticsService.light();

    if (this.isNative) {
      const result = await Dialog.confirm({
        title,
        message,
        okButtonTitle,
        cancelButtonTitle,
      });

      // Haptic diferente según la respuesta
      if (result.value) {
        await hapticsService.success();
      } else {
        await hapticsService.light();
      }

      return result.value;
    } else {
      // Fallback para web
      return window.confirm(`${title}\n\n${message}`);
    }
  }

  // Prompt para entrada de texto
  async prompt(
    title,
    message,
    placeholder = "",
    inputText = "",
    okButtonTitle = "OK",
    cancelButtonTitle = "Cancelar"
  ) {
    await hapticsService.light();

    if (this.isNative) {
      const result = await Dialog.prompt({
        title,
        message,
        okButtonTitle,
        cancelButtonTitle,
        inputPlaceholder: placeholder,
        inputText,
      });

      if (!result.cancelled) {
        await hapticsService.light();
      }

      return {
        cancelled: result.cancelled,
        value: result.value,
      };
    } else {
      // Fallback para web
      const value = window.prompt(`${title}\n\n${message}`, inputText);
      return {
        cancelled: value === null,
        value: value || "",
      };
    }
  }

  // Confirmación de eliminación (estilo destructivo)
  async confirmDelete(
    itemName,
    title = "Confirmar Eliminación",
    okButtonTitle = "Eliminar"
  ) {
    await hapticsService.warning(); // Haptic de advertencia

    const message = `¿Estás seguro que deseas eliminar "${itemName}"?\n\nEsta acción no se puede deshacer.`;

    if (this.isNative) {
      const result = await Dialog.confirm({
        title,
        message,
        okButtonTitle,
        cancelButtonTitle: "Cancelar",
      });

      if (result.value) {
        await hapticsService.error(); // Haptic de confirmación destructiva
      }

      return result.value;
    } else {
      return window.confirm(`${title}\n\n${message}`);
    }
  }

  // Confirmación de salida de la app
  async confirmExit() {
    return await this.confirm(
      "Salir de StructTech",
      "¿Estás seguro que deseas salir de la aplicación?",
      "Salir",
      "Quedarme"
    );
  }

  // Error con acción
  async errorWithAction(
    title,
    message,
    actionTitle = "Reintentar",
    cancelTitle = "Cerrar"
  ) {
    await hapticsService.error();

    return await this.confirm(title, message, actionTitle, cancelTitle);
  }

  // Success con opción de continuar
  async successWithContinue(
    title,
    message,
    continueTitle = "Continuar",
    cancelTitle = "Cerrar"
  ) {
    await hapticsService.success();

    return await this.confirm(title, message, continueTitle, cancelTitle);
  }
}

export const dialogService = new DialogService();
