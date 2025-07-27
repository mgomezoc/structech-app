// src/services/enrollment.service.js

import { API_CONFIG } from "../utils/constants.js";
import { apiService } from "./api.service.js";

class EnrollmentService {
  /**
   * Envía enrolamiento manual
   * @param {object} data  { estructura, subestructura, idMex, …, otherData }
   */
  async enrollManual(data) {
    try {
      console.log("[EnrollmentService] enrollManual()", data);

      // 1) Serializamos los datos según la API
      const payload = {
        Data: JSON.stringify(data),
      };

      // 2) Hacemos POST al endpoint protegido
      const response = await apiService.post(
        API_CONFIG.ENDPOINTS.ENROLLMENT_MANUAL,
        payload
      );

      console.log("[EnrollmentService] success:", response.data);
      return {
        success: true,
        data: response.data,
      };
    } catch (error) {
      console.error("[EnrollmentService] error:", error);

      // Extraemos mensaje de error si viene en la respuesta
      const message =
        error.response?.data?.message ||
        "Error en enrolamiento manual. Intenta de nuevo.";

      return {
        success: false,
        error: message,
      };
    }
  }
}

export const enrollmentService = new EnrollmentService();
