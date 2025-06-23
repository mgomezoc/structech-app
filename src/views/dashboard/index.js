// src/views/dashboard/index.js

import Handlebars from "handlebars";
import imgHeader from "../../img/logo-icono-structech.png";
import "./style.less";
import tplSource from "./template.hbs?raw";

import { navigateTo } from "../../routes/index.js";
import { authService } from "../../services/auth.service.js";
import { ROUTES } from "../../utils/constants.js";

const template = Handlebars.compile(tplSource);

export default class DashboardView {
  constructor() {
    this.user = authService.getCurrentUser();
  }

  // Renderiza el HTML a partir del template compilado
  render() {
    return template({
      user: this.user,
      imgHeader,
    });
  }

  // Después de inyectar el HTML, vinculamos eventos y cargas
  async afterRender() {
    this.setupEventListeners();
    this.loadRecentActivity();
  }

  // Conecta los botones a sus acciones
  setupEventListeners() {
    document
      .getElementById("logoutBtn")
      ?.addEventListener("click", async () => {
        if (confirm("¿Estás seguro de que deseas cerrar sesión?")) {
          await authService.logout();
          // el evento auth:logout redirige automáticamente
        }
      });

    document
      .getElementById("scanCard")
      ?.addEventListener("click", () => navigateTo(ROUTES.FORM));

    document
      .getElementById("recordsCard")
      ?.addEventListener("click", () =>
        window.mostrarMensajeEstado?.("Vista de registros en desarrollo", 2000)
      );

    document
      .getElementById("statsCard")
      ?.addEventListener("click", () =>
        window.mostrarMensajeEstado?.(
          "Vista de estadísticas en desarrollo",
          2000
        )
      );

    document
      .getElementById("settingsCard")
      ?.addEventListener("click", () =>
        window.mostrarMensajeEstado?.(
          "Vista de configuración en desarrollo",
          2000
        )
      );
  }

  // Simula y muestra actividad reciente
  loadRecentActivity() {
    const activityList = document.getElementById("activityList");
    setTimeout(() => {
      const activities = [
        { text: "Registro completado - Juan Pérez", time: "Hace 5 minutos" },
        { text: "INE escaneada exitosamente", time: "Hace 15 minutos" },
        { text: "Sesión iniciada", time: "Hace 30 minutos" },
      ];

      activityList.innerHTML = activities
        .map(
          (a) => `
            <div class="activity-item">
              <span class="activity-text">${a.text}</span>
              <span class="activity-time">${a.time}</span>
            </div>
          `
        )
        .join("");
    }, 1000);
  }

  // Cleanup opcional si agregas listeners globales
  cleanup() {
    console.log("Limpiando vista del dashboard");
  }
}
