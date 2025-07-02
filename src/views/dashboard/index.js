// src/views/dashboard/index.js

import Handlebars from 'handlebars';
import imgHeader from '../../img/logo-icono-structech.png';
import { navigateTo } from '../../routes/index.js';
import { authService } from '../../services/auth.service.js';
import { ROUTES } from '../../utils/constants.js';
import { dom } from '../../utils/dom.helper.js';
import './style.less';
import tplSource from './template.hbs?raw';

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
    this.loadStats();
  }

  // Conecta los botones a sus acciones
  setupEventListeners() {
    // Botón de logout
    document.getElementById('logoutBtn')?.addEventListener('click', async () => {
      if (confirm('¿Estás seguro de que deseas cerrar sesión?')) {
        await authService.logout();
        // el evento auth:logout redirige automáticamente
      }
    });

    // Tarjeta de registro con INE (escaneo)
    document.getElementById('scanCard')?.addEventListener('click', () => {
      navigateTo(ROUTES.FORM);
    });

    // ** Tarjeta de Enrolamiento Manual **
    document.getElementById('enrollCard')?.addEventListener('click', () => {
      navigateTo(ROUTES.ENROLLMENT_MANUAL);
    });

    // Alta Gestión
    dom('#altaGestionCard').on('click', () => {
      console.log('🎫 Navegando a Alta Gestión');
      navigateTo(ROUTES.ALTA_GESTION);
    });

    // Tarjeta de registro manual (sin INE)
    document.getElementById('manualCard')?.addEventListener('click', () => {
      window.mostrarMensajeEstado?.('📝 Registro manual en desarrollo', 2000);
      // TODO: Implementar ruta para registro manual
      // navigateTo(ROUTES.FORM_MANUAL);
    });

    // Tarjeta de copia de INE
    document.getElementById('copyCard')?.addEventListener('click', () => {
      window.mostrarMensajeEstado?.('📎 Carga de archivos en desarrollo', 2000);
      // TODO: Implementar ruta para subir archivo
      // navigateTo(ROUTES.FORM_UPLOAD);
    });

    // Botón de refrescar actividad
    document.getElementById('refreshActivity')?.addEventListener('click', () => {
      this.loadRecentActivity(true);
    });
  }

  // Cargar estadísticas (simuladas por ahora)
  loadStats() {
    // En producción, estos datos vendrían de tu API
    const stats = {
      todayCount: Math.floor(Math.random() * 20) + 5,
      totalCount: Math.floor(Math.random() * 500) + 100,
      lastSync: new Date().toLocaleTimeString('es-MX', {
        hour: '2-digit',
        minute: '2-digit',
      }),
    };

    // Actualizar los números en el DOM
    const todayElement = document.querySelector('.stat-card:nth-child(1) .stat-number');
    const totalElement = document.querySelector('.stat-card:nth-child(2) .stat-number');
    const syncElement = document.querySelector('.stat-card:nth-child(3) .stat-time');

    if (todayElement) todayElement.textContent = stats.todayCount;
    if (totalElement) totalElement.textContent = stats.totalCount;
    if (syncElement) syncElement.textContent = stats.lastSync;
  }

  // Simula y muestra actividad reciente
  loadRecentActivity(showRefreshMessage = false) {
    const activityList = document.getElementById('activityList');

    if (showRefreshMessage) {
      activityList.innerHTML = '<p class="loading-text">Actualizando...</p>';
    }

    setTimeout(
      () => {
        const activities = [
          {
            text: 'Registro con INE - María García',
            time: 'Hace 2 minutos',
            type: 'scan',
          },
          {
            text: 'Registro manual - José López',
            time: 'Hace 15 minutos',
            type: 'manual',
          },
          {
            text: 'Copia de INE cargada - Ana Martínez',
            time: 'Hace 1 hora',
            type: 'upload',
          },
          {
            text: 'Registro con INE - Pedro Hernández',
            time: 'Hace 2 horas',
            type: 'scan',
          },
          {
            text: 'Sesión iniciada',
            time: 'Hace 3 horas',
            type: 'login',
          },
        ];

        activityList.innerHTML = activities
          .map(a => {
            const icon = this.getActivityIcon(a.type);
            return `
              <div class="activity-item">
                <span class="activity-text">${icon} ${a.text}</span>
                <span class="activity-time">${a.time}</span>
              </div>
            `;
          })
          .join('');

        if (showRefreshMessage) {
          window.mostrarMensajeEstado?.('✅ Actividad actualizada', 1500);
        }
      },
      showRefreshMessage ? 500 : 1000,
    );
  }

  // Helper para obtener iconos según el tipo de actividad
  getActivityIcon(type) {
    const icons = {
      scan: '📷',
      manual: '✏️',
      upload: '📎',
      login: '🔑',
      default: '📋',
    };
    return icons[type] || icons.default;
  }

  // Cleanup opcional si agregas listeners globales
  cleanup() {
    console.log('Limpiando vista del dashboard');
  }
}
