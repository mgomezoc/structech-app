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

    // Tarjeta de registro con Identificación (escaneo)
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
  }

  // Cleanup opcional si agregas listeners globales
  cleanup() {
    console.log('Limpiando vista del dashboard');
  }
}
