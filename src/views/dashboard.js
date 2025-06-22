// src/views/dashboard.js
// Dashboard principal después del login

import { navigateTo } from "../routes/index.js";
import { authService } from "../services/auth.service.js";
import { ROUTES } from "../utils/constants.js";

export default class DashboardView {
  constructor() {
    this.user = authService.getCurrentUser();
  }

  render() {
    return `
      <div class="dashboard-container">
        <!-- Header -->
        <header class="dashboard-header">
          <div class="header-content">
            <div class="header-left">
              <img src="img/logo-icono-structech.png" alt="StructTech" class="header-logo" />
              <h1>StructTech Dashboard</h1>
            </div>
            <div class="header-right">
              <div class="user-info">
                <span class="user-name">${
                  this.user?.name || this.user?.email || "Usuario"
                }</span>
                <button id="logoutBtn" class="btn-logout" title="Cerrar sesión">
                  🚪
                </button>
              </div>
            </div>
          </div>
        </header>

        <!-- Main Content -->
        <main class="dashboard-main">
          <div class="welcome-section">
            <h2>Bienvenido, ${this.user?.name || "Usuario"}</h2>
            <p>Selecciona una opción para continuar</p>
          </div>

          <div class="dashboard-grid">
            <!-- Tarjeta para escanear INE -->
            <div class="dashboard-card" id="scanCard">
              <div class="card-icon">📷</div>
              <h3>Escanear INE</h3>
              <p>Captura los datos de una INE mexicana</p>
              <button class="btn-card">Ir al formulario</button>
            </div>

            <!-- Tarjeta para registros -->
            <div class="dashboard-card" id="recordsCard">
              <div class="card-icon">📋</div>
              <h3>Mis Registros</h3>
              <p>Ver y gestionar registros anteriores</p>
              <button class="btn-card">Ver registros</button>
            </div>

            <!-- Tarjeta para estadísticas -->
            <div class="dashboard-card" id="statsCard">
              <div class="card-icon">📊</div>
              <h3>Estadísticas</h3>
              <p>Consulta métricas y reportes</p>
              <button class="btn-card">Ver estadísticas</button>
            </div>

            <!-- Tarjeta para configuración -->
            <div class="dashboard-card" id="settingsCard">
              <div class="card-icon">⚙️</div>
              <h3>Configuración</h3>
              <p>Ajusta las preferencias de la app</p>
              <button class="btn-card">Configurar</button>
            </div>
          </div>

          <!-- Sección de actividad reciente -->
          <div class="recent-activity">
            <h3>Actividad Reciente</h3>
            <div id="activityList" class="activity-list">
              <p class="loading-text">Cargando actividad...</p>
            </div>
          </div>
        </main>
      </div>

      <style>
        .dashboard-container {
          min-height: 100vh;
          background: #f3f4f6;
        }

        .dashboard-header {
          background: white;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
          position: sticky;
          top: 0;
          z-index: 100;
        }

        .header-content {
          max-width: 1200px;
          margin: 0 auto;
          padding: 16px 20px;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .header-left {
          display: flex;
          align-items: center;
          gap: 16px;
        }

        .header-logo {
          width: 40px;
          height: 40px;
        }

        .header-left h1 {
          font-size: 20px;
          color: #1f2937;
          margin: 0;
        }

        .header-right {
          display: flex;
          align-items: center;
          gap: 16px;
        }

        .user-info {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .user-name {
          color: #4b5563;
          font-size: 14px;
        }

        .btn-logout {
          background: #ef4444;
          color: white;
          border: none;
          border-radius: 6px;
          padding: 8px 12px;
          cursor: pointer;
          font-size: 16px;
          transition: all 0.2s;
        }

        .btn-logout:hover {
          background: #dc2626;
          transform: translateY(-1px);
        }

        .dashboard-main {
          max-width: 1200px;
          margin: 0 auto;
          padding: 32px 20px;
        }

        .welcome-section {
          margin-bottom: 32px;
        }

        .welcome-section h2 {
          color: #1f2937;
          margin-bottom: 8px;
        }

        .welcome-section p {
          color: #6b7280;
        }

        .dashboard-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          gap: 24px;
          margin-bottom: 48px;
        }

        .dashboard-card {
          background: white;
          border-radius: 12px;
          padding: 24px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
          transition: all 0.3s;
          cursor: pointer;
        }

        .dashboard-card:hover {
          transform: translateY(-4px);
          box-shadow: 0 8px 16px rgba(0, 0, 0, 0.1);
        }

        .card-icon {
          font-size: 48px;
          margin-bottom: 16px;
        }

        .dashboard-card h3 {
          color: #1f2937;
          margin-bottom: 8px;
          font-size: 20px;
        }

        .dashboard-card p {
          color: #6b7280;
          margin-bottom: 16px;
          font-size: 14px;
        }

        .btn-card {
          background: #0ea5e9;
          color: white;
          border: none;
          border-radius: 6px;
          padding: 10px 20px;
          cursor: pointer;
          font-size: 14px;
          font-weight: 500;
          transition: all 0.2s;
          width: 100%;
        }

        .btn-card:hover {
          background: #0284c7;
        }

        .recent-activity {
          background: white;
          border-radius: 12px;
          padding: 24px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }

        .recent-activity h3 {
          color: #1f2937;
          margin-bottom: 20px;
        }

        .activity-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .activity-item {
          padding: 12px;
          background: #f9fafb;
          border-radius: 6px;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .activity-item .activity-text {
          color: #4b5563;
          font-size: 14px;
        }

        .activity-item .activity-time {
          color: #9ca3af;
          font-size: 12px;
        }

        .loading-text {
          color: #9ca3af;
          text-align: center;
          padding: 20px;
        }

        @media (max-width: 768px) {
          .dashboard-grid {
            grid-template-columns: 1fr;
          }

          .header-left h1 {
            display: none;
          }
        }
      </style>
    `;
  }

  async afterRender() {
    // Configurar event listeners
    this.setupEventListeners();

    // Cargar actividad reciente
    this.loadRecentActivity();
  }

  setupEventListeners() {
    // Botón de logout
    const logoutBtn = document.getElementById("logoutBtn");
    if (logoutBtn) {
      logoutBtn.addEventListener("click", async () => {
        if (confirm("¿Estás seguro de que deseas cerrar sesión?")) {
          await authService.logout();
          // La navegación se maneja automáticamente por el evento auth:logout
        }
      });
    }

    // Tarjeta de escanear INE
    const scanCard = document.getElementById("scanCard");
    if (scanCard) {
      scanCard.addEventListener("click", () => {
        navigateTo(ROUTES.FORM);
      });
    }

    // Tarjeta de registros
    const recordsCard = document.getElementById("recordsCard");
    if (recordsCard) {
      recordsCard.addEventListener("click", () => {
        // TODO: Implementar vista de registros
        if (window.mostrarMensajeEstado) {
          window.mostrarMensajeEstado("Vista de registros en desarrollo", 2000);
        }
      });
    }

    // Tarjeta de estadísticas
    const statsCard = document.getElementById("statsCard");
    if (statsCard) {
      statsCard.addEventListener("click", () => {
        // TODO: Implementar vista de estadísticas
        if (window.mostrarMensajeEstado) {
          window.mostrarMensajeEstado(
            "Vista de estadísticas en desarrollo",
            2000
          );
        }
      });
    }

    // Tarjeta de configuración
    const settingsCard = document.getElementById("settingsCard");
    if (settingsCard) {
      settingsCard.addEventListener("click", () => {
        // TODO: Implementar vista de configuración
        if (window.mostrarMensajeEstado) {
          window.mostrarMensajeEstado(
            "Vista de configuración en desarrollo",
            2000
          );
        }
      });
    }
  }

  async loadRecentActivity() {
    const activityList = document.getElementById("activityList");

    // Simular carga de actividad
    // En producción, esto vendría de tu API
    setTimeout(() => {
      const activities = [
        { text: "Registro completado - Juan Pérez", time: "Hace 5 minutos" },
        { text: "INE escaneada exitosamente", time: "Hace 15 minutos" },
        { text: "Sesión iniciada", time: "Hace 30 minutos" },
      ];

      activityList.innerHTML = activities
        .map(
          (activity) => `
        <div class="activity-item">
          <span class="activity-text">${activity.text}</span>
          <span class="activity-time">${activity.time}</span>
        </div>
      `
        )
        .join("");
    }, 1000);
  }

  cleanup() {
    console.log("Limpiando vista del dashboard");
  }
}
