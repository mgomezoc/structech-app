// src/services/datos.service.js
// Maneja las consultas de datos a la API, incluyendo el envío de datos del formulario

import { API_CONFIG } from "../utils/constants.js";
import { apiService } from "./api.service.js";

class DatosService {
  // Consultar datos (ejemplo del endpoint que compartiste)
  async consultarDatos(data) {
    try {
      console.log("📊 Consultando datos:", data);

      const response = await apiService.post(API_CONFIG.ENDPOINTS.CONSULTA, {
        Data: data,
      });

      return {
        success: true,
        data: response.data,
      };
    } catch (error) {
      console.error("Error al consultar datos:", error);

      return {
        success: false,
        error: error.response?.data?.message || "Error al consultar datos",
      };
    }
  }

  /**
   * Enviar todo el objeto formData stringify dentro de { Data: "..." }
   */
  async enviarFormularioPersona(formData) {
    try {
      console.log("📤 Enviando formulario de persona:", formData);

      // Si quisieras validar campos, lo harías acá…

      // 1) Serializar TODO el objecto formData (o bien dataToSend si lo transformas)
      const serialized = JSON.stringify(formData);

      // 2) Empaquetar en la propiedad "Data"
      const payload = { Data: serialized };

      // 3) Hacer POST a /api/datos/consulta
      const response = await apiService.post(
        API_CONFIG.ENDPOINTS.CONSULTA,
        payload
      );

      console.log("✅ Consulta exitosa:", response.data);

      return {
        success: true,
        data: response.data,
      };
    } catch (error) {
      console.error("❌ Error al enviar formulario:", error);

      let errorMessage = "Error al guardar los datos";
      if (error.response) {
        switch (error.response.status) {
          case 400:
            errorMessage = "Datos inválidos. Por favor verifica el formulario.";
            break;
          case 409:
            errorMessage = "Ya existe un registro con estos datos.";
            break;
          case 413:
            errorMessage =
              "Las imágenes son muy pesadas. Intenta con imágenes más pequeñas.";
            break;
          default:
            errorMessage = error.response.data?.message || errorMessage;
        }
      } else if (error.request) {
        errorMessage = "No hubo respuesta del servidor.";
      }

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  // Obtener lista de estructuras (si tu API lo proporciona)
  async obtenerEstructuras() {
    try {
      const response = await apiService.get("/api/estructuras");
      return {
        success: true,
        data: response.data,
      };
    } catch (error) {
      console.error("Error al obtener estructuras:", error);
      return {
        success: false,
        error: "No se pudieron cargar las estructuras",
      };
    }
  }

  // Obtener subestructuras según la estructura seleccionada
  async obtenerSubestructuras(estructuraId) {
    try {
      const response = await apiService.get(
        `/api/estructuras/${estructuraId}/subestructuras`
      );
      return {
        success: true,
        data: response.data,
      };
    } catch (error) {
      console.error("Error al obtener subestructuras:", error);
      return {
        success: false,
        error: "No se pudieron cargar las subestructuras",
      };
    }
  }

  // Buscar persona por CURP (útil para evitar duplicados)
  async buscarPorCurp(curp) {
    try {
      const response = await apiService.get(
        `/api/personas/buscar?curp=${curp}`
      );
      return {
        success: true,
        exists: response.data.exists,
        data: response.data.persona,
      };
    } catch (error) {
      if (error.response?.status === 404) {
        return {
          success: true,
          exists: false,
          data: null,
        };
      }

      return {
        success: false,
        error: "Error al buscar persona",
      };
    }
  }

  // Comprimir imagen antes de enviar (helper)
  async compressImage(base64String, maxWidth = 1024) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");

        let { width, height } = img;

        // Calcular nuevo tamaño manteniendo proporción
        if (width > maxWidth) {
          height = (maxWidth / width) * height;
          width = maxWidth;
        }

        canvas.width = width;
        canvas.height = height;

        ctx.drawImage(img, 0, 0, width, height);

        // Convertir a base64 con compresión JPEG
        const compressed = canvas.toDataURL("image/jpeg", 0.7);
        resolve(compressed.split(",")[1]); // Retornar solo la parte base64
      };

      img.src = `data:image/png;base64,${base64String}`;
    });
  }

  // Validar CURP (helper)
  validarCurp(curp) {
    const regex = /^[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d$/;
    return regex.test(curp);
  }
}

// Exportar instancia única
export const datosService = new DatosService();
