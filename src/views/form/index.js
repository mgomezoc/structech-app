// src/views/form/index.js

import Handlebars from "handlebars";
import "./style.less";
import tplSource from "./template.hbs?raw";

import logoUrl from "../../img/logo-icono-structech.png";
import { navigateTo } from "../../routes/index.js";
import { authService } from "../../services/auth.service.js";
import { datosService } from "../../services/datos.service.js";
import { dialogService } from "../../services/dialog.service.js";
import { hapticsService } from "../../services/haptics.service.js";
import { ROUTES } from "../../utils/constants.js";

import lottie from "lottie-web";
import { audioRecorder } from "../../js/audioRecorder.js";
import { signatureManager } from "../../js/signature.js";
import animCamera from "../../lottie/camara.json";
import animProfile from "../../lottie/user.json";

const template = Handlebars.compile(tplSource);

export default class FormView {
  constructor() {
    this.user = authService.getCurrentUser();
  }

  render() {
    return template({
      user: {
        name: this.user?.name || this.user?.email || "Usuario",
      },
      logoUrl,
    });
  }

  async afterRender() {
    // Inyectamos la función global para poblar desde el plugin
    window.poblarFormulario = this.poblarFormulario.bind(this);

    await this.initializeModules();
    this.setupEventListeners();
    await this.loadInitialData();
  }

  async initializeModules() {
    signatureManager.init();
    await audioRecorder.init();

    // Lottie anims
    lottie
      .loadAnimation({
        container: document.getElementById("profilePlaceholder"),
        renderer: "svg",
        loop: true,
        autoplay: true,
        animationData: animProfile,
      })
      .setSpeed(0.5);

    lottie
      .loadAnimation({
        container: document.getElementById("scanIcon"),
        renderer: "svg",
        loop: true,
        autoplay: true,
        animationData: animCamera,
      })
      .setSpeed(0.3);
  }

  setupEventListeners() {
    document.getElementById("backBtn")?.addEventListener("click", async () => {
      const canGoBack = await this.confirmBackWithData();
      if (canGoBack) {
        await hapticsService.light();
        navigateTo(ROUTES.DASHBOARD);
      }
    });

    document
      .getElementById("formPersona")
      ?.addEventListener("submit", (e) => this.handleSubmit(e));

    document.getElementById("curp")?.addEventListener("blur", async () => {
      const curp = document.getElementById("curp").value.trim();
      if (curp && datosService.validarCurp(curp)) {
        await this.verificarCurpDuplicado(curp);
      }
    });

    document.getElementById("btnScan")?.addEventListener("click", async () => {
      await hapticsService.medium();
      window.scanINE?.();
    });

    // Cuando el usuario selecciona una Estructura, cargar sus SubEstructuras
    document
      .getElementById("estructura")
      ?.addEventListener("change", async (e) => {
        await hapticsService.light();

        const estructuraId = e.target.value;
        const subSel = document.getElementById("subestructura");
        // Reiniciar opciones
        subSel.innerHTML = `<option value="">Sin selección</option>`;
        if (!estructuraId) return;

        // Llamar al servicio y poblar
        const res = await datosService.obtenerSubestructuras(estructuraId);
        if (res.success) {
          await hapticsService.light();

          res.data.forEach((s) => {
            subSel.innerHTML += `<option value="${s.iSubCatalogId}">${s.vcSubCatalog}</option>`;
          });
        } else {
          await hapticsService.error();
          window.mostrarMensajeEstado?.(`⚠️ ${res.error}`, 3000);
        }
      });
  }

  async loadInitialData() {
    const res = await datosService.obtenerEstructuras();
    if (res.success) {
      const sel = document.getElementById("estructura");
      sel.innerHTML = `<option value="">Sin selección</option>`;
      res.data.forEach((e) => {
        sel.innerHTML += `<option value="${e.iCatalogId}">${e.vcCatalog}</option>`;
      });
      // Asegurarse de limpiar el select de subestructura al inicio
      document.getElementById(
        "subestructura"
      ).innerHTML = `<option value="">Sin selección</option>`;
    }
  }

  async handleSubmit(e) {
    e.preventDefault();
    const btn = e.target.querySelector(".save-button");
    btn.disabled = true;
    btn.classList.add("loading");

    try {
      if (!signatureManager.hasSignature()) {
        await hapticsService.error();

        await dialogService.alert(
          "Firma Requerida",
          "Por favor proporcione su firma antes de continuar."
        );
        return;
      }

      const shouldSubmit = await dialogService.confirm(
        "Confirmar Registro",
        "¿Estás seguro que deseas guardar este registro? Verifica que toda la información sea correcta.",
        "Guardar",
        "Revisar"
      );

      if (!shouldSubmit) {
        return; // Usuario canceló
      }

      await hapticsService.medium();

      const data = Object.fromEntries(new FormData(e.target).entries());

      data.signatureData = signatureManager.getSignatureAsBase64();

      if (audioRecorder.hasRecording()) {
        const audio = audioRecorder.getAudioData();
        data.audioData = audio.data; // <-- solo la cadena Base64
        data.audioMimeType = audio.mimeType; // opcional, si tu API la necesita
      }

      const result = await datosService.enviarFormularioPersona(data);
      if (!result.success) throw new Error(result.error);

      await hapticsService.success();

      const shouldContinue = await dialogService.successWithContinue(
        "¡Registro Guardado!",
        "Los datos se han guardado correctamente en el sistema.",
        "Crear Otro",
        "Volver al Dashboard"
      );

      e.target.reset();
      signatureManager.clear();
      audioRecorder.deleteRecording();

      if (shouldContinue) {
        window.location.reload();
      } else {
        setTimeout(() => navigateTo(ROUTES.DASHBOARD), 1000);
      }
    } catch (err) {
      await hapticsService.error();
      await dialogService.alert(
        "Error Inesperado",
        `Ha ocurrido un error: ${err.message}`
      );
    } finally {
      btn.disabled = false;
      btn.classList.remove("loading");
    }
  }

  async verificarCurpDuplicado(curp) {
    const r = await datosService.buscarPorCurp(curp);
    if (r.success && r.exists) {
      window.mostrarMensajeEstado?.(
        "⚠️ Ya existe un registro con este CURP",
        3000
      );
      document.getElementById("curp").classList.add("error");
    } else {
      document.getElementById("curp").classList.remove("error");
    }
  }

  // Confirmación antes de volver atrás si hay datos
  async confirmBackWithData() {
    const form = document.getElementById("formPersona");
    const formData = new FormData(form);

    // Verificar si hay datos en el formulario
    let hasData = false;
    for (const [key, value] of formData.entries()) {
      if (value && value.toString().trim()) {
        hasData = true;
        break;
      }
    }

    if (
      hasData ||
      signatureManager.hasSignature() ||
      audioRecorder.hasRecording()
    ) {
      return await dialogService.confirm(
        "Datos sin Guardar",
        "Tienes información sin guardar. ¿Estás seguro que deseas salir?",
        "Salir sin Guardar",
        "Quedarme"
      );
    }

    return true; // No hay datos, puede salir libremente
  }

  poblarFormulario(scanResult) {
    hapticsService.light();
    const data = scanResult.result || scanResult;
    const getVal = (f) => f?.description || f?.latin || "";

    // Nombre y apellidos
    document.getElementById("nombre").value = getVal(data.fullName);
    document.getElementById("apellidoPaterno").value = getVal(data.fathersName);
    document.getElementById("apellidoMaterno").value = getVal(data.mothersName);

    // CURP y elector
    document.getElementById("curp").value = getVal(data.personalIdNumber);
    document.getElementById("claveElector").value = getVal(
      data.documentAdditionalNumber
    );

    // Fecha de nacimiento
    if (data.dateOfBirth) {
      const { day, month, year } = data.dateOfBirth;
      document.getElementById("fechaNacimiento").value = [
        year,
        String(month).padStart(2, "0"),
        String(day).padStart(2, "0"),
      ].join("-");
    }

    // Género
    const sex = getVal(data.sex).toUpperCase();
    if (sex === "H") document.getElementById("hombre").checked = true;
    if (sex === "M") document.getElementById("mujer").checked = true;

    // Domicilio y sección
    if (data.address) {
      document.getElementById("domicilio").value = data.address.latin.replace(
        /\n/g,
        " "
      );
    }
    const opt1 = data.mrzResult?.sanitizedOpt1?.slice(0, 4);
    if (opt1) document.getElementById("seccion").value = opt1;

    // Imágenes
    if (data.faceImage) {
      this._showImage("profileImage", "profilePlaceholder", data.faceImage);
      document.getElementById("faceImageData").value = data.faceImage;
    }

    if (data.signatureImage) {
      document.getElementById("signatureImageData").value = data.signatureImage;
    }

    if (data.fullDocumentFrontImage)
      document.getElementById("fullDocumentFrontImage").value =
        data.fullDocumentFrontImage;
    if (data.fullDocumentBackImage)
      document.getElementById("fullDocumentBackImage").value =
        data.fullDocumentBackImage;

    //idMex
    if (data.documentNumber.description) {
      document.getElementById("idMex").value = data.documentNumber.description;
    }
  }

  _showImage(imgId, placeholderId, base64) {
    const img = document.getElementById(imgId);
    const placeholder = document.getElementById(placeholderId);
    img.src = `data:image/png;base64,${base64}`;
    img.style.display = "block";
    placeholder.style.display = "none";
  }

  cleanup() {
    window.poblarFormulario = null;
  }
}
