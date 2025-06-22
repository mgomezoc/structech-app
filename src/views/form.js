// src/views/form.js
// Vista del formulario - Integra tu formulario actual con el sistema de rutas

import { navigateTo } from "../routes/index.js";
import { authService } from "../services/auth.service.js";
import { datosService } from "../services/datos.service.js";
import { ROUTES } from "../utils/constants.js";

// Importar tus módulos existentes
import { audioRecorder } from "../js/audioRecorder.js";
import { signatureManager } from "../js/signature.js";
import animationDataCamera from "../lottie/camara.json";
import animationData from "../lottie/user.json";

export default class FormView {
  constructor() {
    this.user = authService.getCurrentUser();
  }

  render() {
    // Aquí retornamos tu HTML actual del formulario
    return `
      <!-- Header con navegación -->
      <div class="header">
        <div class="header-nav">
          <button id="backBtn" class="btn-back" title="Volver al dashboard">
            ← Volver
          </button>
          <h1>
            <img src="img/logo-icono-structech.png" alt="StructTech" class="logo" />
            StructTech
          </h1>
          <div class="user-badge">
            ${this.user?.name || this.user?.email || "Usuario"}
          </div>
        </div>
      </div>

      <!-- Tu formulario actual -->
      <div class="container">
        <form id="formPersona" method="POST">
          <!-- Sección de foto -->
          <div class="profile-section">
            <div class="profile-photo" id="profilePhoto">
              <div id="profilePlaceholder" style="width: 430px; height: 430px"></div>
              <img
                id="profileImage"
                src="img/profile.svg"
                alt=""
                style="display: none; width: 100%; height: 100%; object-fit: cover; border-radius: 50%;"
              />
            </div>
          </div>

          <!-- Formulario -->
          <div class="form-section">
            <div class="form-group">
              <label>Selecciona Estructura*</label>
              <select class="form-control" id="estructura" name="estructura" required>
                <option value="">Sin selección</option>
                <option value="1">Estructura 1</option>
                <option value="2">Estructura 2</option>
              </select>
            </div>

            <div class="form-group">
              <label>Selecciona SubEstructura*</label>
              <select class="form-control" id="subestructura" name="subestructura" required>
                <option value="">Sin selección</option>
                <option value="1">SubEstructura 1</option>
                <option value="2">SubEstructura 2</option>
              </select>
            </div>

            <div class="form-group">
              <label>Nombre*</label>
              <input type="text" class="form-control" id="nombre" name="nombre" placeholder="Nombre(s)" required />
            </div>

            <div class="form-group">
              <label>Apellido Paterno</label>
              <input type="text" class="form-control" id="apellidoPaterno" name="apellidoPaterno" placeholder="Apellido Paterno" />
            </div>

            <div class="form-group">
              <label>Apellido Materno</label>
              <input type="text" class="form-control" id="apellidoMaterno" name="apellidoMaterno" placeholder="Apellido Materno" />
            </div>

            <div class="form-group">
              <label>Fecha de Nacimiento</label>
              <input type="date" class="form-control" id="fechaNacimiento" name="fechaNacimiento" />
            </div>

            <div class="form-group">
              <label>Género</label>
              <div class="gender-group">
                <div class="gender-option">
                  <input type="radio" id="hombre" name="genero" value="M" />
                  <label for="hombre">👨 Hombre</label>
                </div>
                <div class="gender-option">
                  <input type="radio" id="mujer" name="genero" value="F" />
                  <label for="mujer">👩 Mujer</label>
                </div>
              </div>
            </div>

            <div class="form-group">
              <label>CURP</label>
              <input type="text" class="form-control" id="curp" name="curp" placeholder="CURP" maxlength="18" />
            </div>

            <div class="form-group">
              <label>Clave de Elector</label>
              <input type="text" class="form-control" id="claveElector" name="claveElector" placeholder="Clave de Elector" />
            </div>

            <div class="form-group">
              <label>Domicilio</label>
              <input type="text" class="form-control" id="domicilio" name="domicilio" placeholder="Domicilio completo" />
            </div>

            <div class="form-group">
              <label>Sección</label>
              <input type="text" class="form-control" id="seccion" name="seccion" placeholder="Sección electoral" maxlength="4" />
            </div>

            <div class="form-group">
              <label>Observación</label>
              <textarea class="form-control" id="observacion" name="observacion" rows="3" placeholder="Agregar observaciones..."></textarea>
            </div>

            <div class="form-group">
              <label>Teléfono</label>
              <input type="tel" class="form-control" id="telefono" name="telefono" placeholder="Número de teléfono" />
            </div>

            <!-- Sección de firma -->
            <div class="signature-section">
              <label>Firma de Autorización</label>
              <div class="signature-box" id="signatureBox">
                <canvas id="signatureCanvas" style="display: block; width: 100%; height: 150px; border: 1px solid #ddd; border-radius: 8px; background: white;"></canvas>
                <img id="signatureImage" src="" alt="" style="display: none; max-width: 100%; height: auto; border-radius: 8px;" />
                <div class="signature-placeholder" id="signaturePlaceholder" style="display: none">✏️</div>
              </div>
              <div class="signature-controls" style="margin-top: 10px; display: flex; gap: 10px">
                <button type="button" class="btn-clear-signature" id="clearSignature" style="flex: 1">Limpiar Firma</button>
                <button type="button" class="btn-undo-signature" id="undoSignature" style="flex: 1">Deshacer</button>
              </div>
            </div>

            <!-- Sección de audio -->
            <div class="audio-section">
              <label>Mensaje de voz (mantén presionado para grabar)</label>
              <div class="audio-controls">
                <button type="button" class="audio-button" id="audioBtn">🎤</button>
                <div class="audio-info">
                  <div class="audio-timer" id="audioTimer">00:00:00</div>
                  <span class="audio-hint" id="audioHint">Mantén presionado para grabar</span>
                </div>
                <button type="button" id="audioDelete" class="audio-delete" style="display: none">🗑️</button>
              </div>
              <div class="audio-wave" id="audioWave" style="display: none">
                <span></span><span></span><span></span><span></span><span></span>
              </div>
            </div>

            <!-- Campos ocultos -->
            <input type="hidden" id="documentNumber" name="documentNumber" />
            <input type="hidden" id="fullDocumentFrontImage" name="fullDocumentFrontImage" />
            <input type="hidden" id="fullDocumentBackImage" name="fullDocumentBackImage" />
            <input type="hidden" id="faceImageData" name="faceImageData" />
            <input type="hidden" id="signatureImageData" name="signatureImageData" />

            <!-- Botón guardar -->
            <button type="submit" class="save-button">Guardar</button>
          </div>
        </form>
      </div>

      <!-- Botón flotante para escanear INE -->
      <button id="btnScan" class="fab-scan">
        <div id="scanIcon" style="width: 64px; height: 64px"></div>
      </button>

      <!-- Estilos adicionales para la navegación -->
      <style>
        .header-nav {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 20px;
          width: 100%;
        }

        .btn-back {
          background: none;
          border: none;
          color: white;
          font-size: 16px;
          cursor: pointer;
          padding: 8px 16px;
          border-radius: 6px;
          transition: background 0.2s;
        }

        .btn-back:hover {
          background: rgba(255, 255, 255, 0.1);
        }

        .user-badge {
          background: rgba(255, 255, 255, 0.2);
          color: white;
          padding: 6px 12px;
          border-radius: 20px;
          font-size: 14px;
        }

        .save-button:disabled {
          opacity: 0.7;
          cursor: not-allowed;
        }

        .save-button.loading {
          position: relative;
          color: transparent;
        }

        .save-button.loading::after {
          content: '';
          position: absolute;
          width: 20px;
          height: 20px;
          top: 50%;
          left: 50%;
          margin-left: -10px;
          margin-top: -10px;
          border: 2px solid #ffffff40;
          border-top-color: white;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }
      </style>
    `;
  }

  async afterRender() {
    // Inicializar módulos
    await this.initializeModules();

    // Configurar event listeners
    this.setupEventListeners();

    // Cargar datos si es necesario
    await this.loadInitialData();

    window.poblarFormulario = this.poblarFormulario.bind(this);
  }

  async initializeModules() {
    // Inicializar firma
    signatureManager.init();

    // Inicializar audio
    await audioRecorder.init();

    // Inicializar animaciones Lottie si las tienes
    if (typeof lottie !== "undefined") {
      this.initializeLottieAnimations();
    }
  }

  setupEventListeners() {
    // Botón de volver
    const backBtn = document.getElementById("backBtn");
    if (backBtn) {
      backBtn.addEventListener("click", () => {
        navigateTo(ROUTES.DASHBOARD);
      });
    }

    // Formulario
    const formPersona = document.getElementById("formPersona");
    if (formPersona) {
      formPersona.addEventListener("submit", (e) => this.handleSubmit(e));
    }

    // CURP - validación en tiempo real
    const curpInput = document.getElementById("curp");
    if (curpInput) {
      curpInput.addEventListener("blur", async () => {
        const curp = curpInput.value.trim();
        if (curp && datosService.validarCurp(curp)) {
          await this.verificarCurpDuplicado(curp);
        }
      });
    }

    // Tu código existente de escaneo INE
    const btnScan = document.getElementById("btnScan");
    if (btnScan) {
      btnScan.addEventListener("click", () => {
        // Aquí llamas a tu función scanINE existente
        if (window.scanINE) {
          window.scanINE();
        }
      });
    }
  }

  async loadInitialData() {
    try {
      // Cargar estructuras si tu API las proporciona
      const estructurasResult = await datosService.obtenerEstructuras();

      if (estructurasResult.success) {
        const selectEstructura = document.getElementById("estructura");
        selectEstructura.innerHTML = '<option value="">Sin selección</option>';

        estructurasResult.data.forEach((estructura) => {
          const option = document.createElement("option");
          option.value = estructura.id;
          option.textContent = estructura.nombre;
          selectEstructura.appendChild(option);
        });
      }
    } catch (error) {
      console.error("Error al cargar datos iniciales:", error);
    }
  }

  async handleSubmit(e) {
    e.preventDefault();

    const saveButton = e.target.querySelector(".save-button");
    const originalText = saveButton.textContent;

    try {
      // Mostrar loading
      saveButton.disabled = true;
      saveButton.classList.add("loading");
      saveButton.textContent = "";

      // Validar firma
      if (!signatureManager.hasSignature()) {
        throw new Error("Por favor proporcione su firma");
      }

      // Recopilar datos del formulario
      const formData = new FormData(e.target);
      const data = Object.fromEntries(formData.entries());

      // Agregar datos adicionales
      data.signatureData = signatureManager.getSignatureAsBase64();

      if (audioRecorder.hasRecording()) {
        data.audioData = JSON.stringify(audioRecorder.getAudioData());
      }

      // Enviar datos
      const result = await datosService.enviarFormularioPersona(data);

      if (result.success) {
        // Mostrar mensaje de éxito
        if (window.mostrarMensajeEstado) {
          window.mostrarMensajeEstado("✅ Datos guardados correctamente", 3000);
        }

        // Limpiar formulario
        this.resetForm();

        // Opcional: Volver al dashboard después de 2 segundos
        setTimeout(() => {
          navigateTo(ROUTES.DASHBOARD);
        }, 2000);
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      console.error("Error al guardar:", error);

      if (window.mostrarMensajeEstado) {
        window.mostrarMensajeEstado(`❌ ${error.message}`, 5000);
      }
    } finally {
      // Restaurar botón
      saveButton.disabled = false;
      saveButton.classList.remove("loading");
      saveButton.textContent = originalText;
    }
  }

  async verificarCurpDuplicado(curp) {
    const result = await datosService.buscarPorCurp(curp);

    if (result.success && result.exists) {
      if (window.mostrarMensajeEstado) {
        window.mostrarMensajeEstado(
          "⚠️ Ya existe un registro con este CURP",
          3000
        );
      }

      // Opcional: Marcar el campo con error
      document.getElementById("curp").classList.add("error");
    } else {
      document.getElementById("curp").classList.remove("error");
    }
  }

  resetForm() {
    const form = document.getElementById("formPersona");
    form.reset();

    // Limpiar módulos
    signatureManager.clear();
    audioRecorder.deleteRecording();

    // Limpiar imagen de perfil
    document.getElementById("profileImage").style.display = "none";
    document.getElementById("profilePlaceholder").style.display = "block";
  }

  initializeLottieAnimations() {
    const profileAnim = lottie.loadAnimation({
      container: document.getElementById("profilePlaceholder"),
      renderer: "svg",
      loop: true,
      autoplay: true,
      animationData: animationData,
    });

    profileAnim.setSpeed(0.4);

    const scanAnim = lottie.loadAnimation({
      container: document.getElementById("scanIcon"),
      renderer: "svg",
      loop: true,
      autoplay: true,
      animationData: animationDataCamera,
    });
    scanAnim.setSpeed(0.3);
  }

  poblarFormulario(scanResult) {
    const data = scanResult.result || scanResult;
    const getLatin = (field) => field?.description || field?.latin || "";

    // **Nombre** (igual que antes)…
    const secondary = data.mrzResult?.secondaryId;
    const latinName = data.fullName?.latin;
    let nombre =
      secondary && latinName
        ? secondary.length >= latinName.length
          ? secondary
          : latinName
        : secondary || latinName || "";
    document.getElementById("nombre").value = nombre;

    // **Apellidos**: usa fatherName / motherName
    document.getElementById("apellidoPaterno").value = getLatin(
      data.fathersName
    );
    document.getElementById("apellidoMaterno").value = getLatin(
      data.mothersName
    );

    // **CURP**
    document.getElementById("curp").value = getLatin(data.personalIdNumber);

    // **Clave de elector**
    document.getElementById("claveElector").value = getLatin(
      data.documentAdditionalNumber
    );

    // **Número de documento (hidden)**
    document.getElementById("documentNumber").value = getLatin(
      data.documentNumber
    );

    // **Fecha de nacimiento**
    if (data.dateOfBirth) {
      const { day, month, year } = data.dateOfBirth;
      const mm = String(month).padStart(2, "0");
      const dd = String(day).padStart(2, "0");
      document.getElementById("fechaNacimiento").value = `${year}-${mm}-${dd}`;
    }

    // **Género**
    const sex = getLatin(data.sex).toUpperCase();
    if (sex === "H") document.getElementById("hombre").checked = true;
    if (sex === "M") document.getElementById("mujer").checked = true;

    // **Domicilio**
    if (data.address) {
      document.getElementById("domicilio").value = data.address.latin.replace(
        /\n/g,
        " "
      );
    }

    // **Sección (MRZ)**
    const opt1 = data.mrzResult?.sanitizedOpt1 || "";
    if (opt1.length >= 4) {
      document.getElementById("seccion").value = opt1.slice(0, 4);
    }

    // **Foto de perfil**
    if (data.faceImage) {
      this.mostrarFotoPerfil(data.faceImage);
      document.getElementById("faceImageData").value = data.faceImage;
    }

    // **Firma escaneada**
    if (data.signatureImage) {
      this.mostrarFirma(data.signatureImage);
      document.getElementById("signatureImageData").value = data.signatureImage;
    }

    // **Documento completo – front/back**
    if (data.fullDocumentFrontImage) {
      document.getElementById("fullDocumentFrontImage").value =
        data.fullDocumentFrontImage;
    }
    if (data.fullDocumentBackImage) {
      document.getElementById("fullDocumentBackImage").value =
        data.fullDocumentBackImage;
    }
  }

  // Helper para mostrar la foto
  mostrarFotoPerfil(imageBase64) {
    const img = document.getElementById("profileImage");
    const placeholder = document.getElementById("profilePlaceholder");
    img.src = `data:image/png;base64,${imageBase64}`;
    img.style.display = "block";
    placeholder.style.display = "none";
  }

  // Helper para mostrar la firma
  mostrarFirma(imageBase64) {
    const img = document.getElementById("signatureImage");
    const placeholder = document.getElementById("signaturePlaceholder");
    img.src = `data:image/png;base64,${imageBase64}`;
    img.style.display = "block";
    placeholder.style.display = "none";
  }

  cleanup() {
    // Si quieres limpiar la referencia al salir de la vista:
    window.poblarFormulario = null;
    console.log("Limpiando vista del formulario");
  }
}
