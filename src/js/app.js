import { Capacitor } from "@capacitor/core";
import * as BlinkID from "@microblink/blinkid-capacitor";
import "../css/style.less";

const LICENSE =
  "sRwCABFjb20uc3RydWN0ZWNoLmFwcABsZXlKRGNtVmhkR1ZrVDI0aU9qRTNOVEEwTVRjMk1EY3hPREVzSWtOeVpXRjBaV1JHYjNJaU9pSTVabVExT0RCa05pMHlaRFJpTFRSak5HWXRPVFUzTUMwMVpXVXlZV1EyTWpZMk5ERWlmUT098Er7cjB+qDKvj4bUcp/EE0Gl92iO/qtPJowZOAmJqazLqMSRnDwD6vCpAUYaRf53vP7WrSYMLcwOB2BeiyNoa3DdBaCH+P3ju2ixpiEEuIRGgB1eQaFhpVkiVdEB5sWN94u4mqp/6HglO50sKXXWcex0mw==";

const btnScan = document.getElementById("btnScan");
const formPersona = document.getElementById("formPersona");

// Inicializar eventos
btnScan.addEventListener("click", scanINE);
formPersona.addEventListener("submit", handleSubmit);

async function scanINE() {
  mostrarMensajeEstado("▶️ Solicitando permisos de cámara…");

  const { Camera } = Capacitor.Plugins;
  const perm = await Camera.requestPermissions();
  if (perm.camera !== "granted") {
    mostrarMensajeEstado("❌ Permiso de cámara denegado", 3000);
    return;
  }

  mostrarMensajeEstado("🔎 Iniciando BlinkID…");

  try {
    const plugin = new BlinkID.BlinkIDPlugin();
    const recognizer = new BlinkID.BlinkIdMultiSideRecognizer();

    // Ajustes de calidad / filtrado
    recognizer.returnFullDocumentImage = true;
    recognizer.returnFaceImage = true;
    recognizer.returnSignatureImage = true;
    recognizer.allowBarcodeScanOnly = true;
    recognizer.enableBlurFilter = true;
    recognizer.enableGlareFilter = true;
    recognizer.fullDocumentImageDpi = 150;
    recognizer.faceImageDpi = 150;
    recognizer.signatureImageDpi = 150;

    const rc = new BlinkID.RecognizerCollection([recognizer]);

    // Overlay con instrucciones en español
    const overlay = new BlinkID.BlinkIdOverlaySettings();
    overlay.language = "es";
    overlay.country = "MX";
    overlay.showIntroductionDialog = true;
    overlay.showOnboardingInfo = true;
    overlay.showDocumentNotSupportedDialog = true;
    overlay.showFlashlightWarning = true;
    overlay.firstSideInstructionsText =
      "Coloca el FRENTE de tu INE dentro del marco";
    overlay.flipInstructions = "Ahora voltea tu INE y escanea el REVERSO";
    overlay.androidCameraResolutionPreset =
      BlinkID.AndroidCameraResolutionPreset.PresetFullHD;
    overlay.iosCameraResolutionPreset =
      BlinkID.iOSCameraResolutionPreset.PresetFullHD;
    overlay.showTorchButton = true;
    overlay.showCancelButton = true;

    const keys = {
      android: LICENSE,
      ios: LICENSE,
      showTimeLimitedLicenseKeyWarning: true,
    };

    console.log("► Lanzando scanWithCamera…", { recognizer, overlay });
    const results = await plugin.scanWithCamera(overlay, rc, keys);
    console.log("► Resultados:", results);

    if (!results.length) {
      mostrarMensajeEstado("⚠️ Usuario canceló el escaneo", 3000);
    } else {
      poblarFormulario(results[0]);
      mostrarMensajeEstado("✅ ¡Documento escaneado exitosamente!", 3000);
    }
  } catch (e) {
    console.error("Error en scanINE:", e);
    mostrarMensajeEstado(`❌ Error al escanear: ${e.message || e}`, 5000);
  }
}

function poblarFormulario(resultado) {
  const data = resultado.result || resultado;
  console.log("Datos recibidos del escaneo:", data);

  // Nombre(s)
  if (data.firstName?.value) {
    document.getElementById("nombre").value = data.firstName.value;
  }

  // Apellidos - BlinkID puede devolver todo en lastName o separado
  if (data.lastName?.value) {
    // Intentar separar apellidos si vienen juntos
    const apellidos = data.lastName.value.trim().split(" ");
    if (apellidos.length >= 2) {
      document.getElementById("apellidoPaterno").value = apellidos[0];
      document.getElementById("apellidoMaterno").value = apellidos
        .slice(1)
        .join(" ");
    } else {
      document.getElementById("apellidoPaterno").value = data.lastName.value;
    }
  }

  // CURP
  if (data.personalIdNumber?.value) {
    document.getElementById("curp").value = data.personalIdNumber.value;
  }

  // Clave de Elector - puede venir en documentNumber o en otro campo
  if (data.documentNumber?.value) {
    document.getElementById("claveElector").value = data.documentNumber.value;
    document.getElementById("documentNumber").value = data.documentNumber.value;
  }

  // Fecha de nacimiento
  if (data.dateOfBirth) {
    const fechaFormateada = formatDateForInput(data.dateOfBirth);
    if (fechaFormateada) {
      document.getElementById("fechaNacimiento").value = fechaFormateada;
    }
  }

  // Género
  if (data.sex?.value) {
    const genero = data.sex.value.toUpperCase();
    if (genero === "M" || genero === "MASCULINO") {
      document.getElementById("hombre").checked = true;
    } else if (genero === "F" || genero === "FEMENINO") {
      document.getElementById("mujer").checked = true;
    }
  }

  // Domicilio
  if (data.address?.value) {
    document.getElementById("domicilio").value = data.address.value;
  } else if (data.placeOfBirth?.value) {
    // A veces el domicilio viene en placeOfBirth
    document.getElementById("domicilio").value = data.placeOfBirth.value;
  }

  // Foto del rostro
  if (data.faceImage) {
    mostrarFotoPerfil(data.faceImage);
    document.getElementById("faceImageData").value = data.faceImage;
  }

  // Firma
  if (data.signatureImage) {
    mostrarFirma(data.signatureImage);
    document.getElementById("signatureImageData").value = data.signatureImage;
  }

  // Imágenes del documento completo
  if (data.fullDocumentFrontImage) {
    document.getElementById("fullDocumentFrontImage").value =
      data.fullDocumentFrontImage;
  }
  if (data.fullDocumentBackImage) {
    document.getElementById("fullDocumentBackImage").value =
      data.fullDocumentBackImage;
  }

  // Intentar extraer más datos de campos adicionales
  extraerDatosAdicionales(data);
}

function extraerDatosAdicionales(data) {
  // BlinkID puede devolver datos en diferentes estructuras
  // Revisar campos MRZ
  if (data.mrzResult) {
    const mrz = data.mrzResult;

    if (mrz.primaryId && !document.getElementById("apellidoPaterno").value) {
      document.getElementById("apellidoPaterno").value = mrz.primaryId;
    }

    if (mrz.secondaryId && !document.getElementById("nombre").value) {
      document.getElementById("nombre").value = mrz.secondaryId;
    }

    if (mrz.documentNumber && !document.getElementById("claveElector").value) {
      document.getElementById("claveElector").value = mrz.documentNumber;
    }
  }

  // Revisar campos VIZ (Visual Inspection Zone)
  if (data.vizResult) {
    const viz = data.vizResult;

    if (viz.firstName && !document.getElementById("nombre").value) {
      document.getElementById("nombre").value = viz.firstName;
    }

    if (viz.lastName && !document.getElementById("apellidoPaterno").value) {
      document.getElementById("apellidoPaterno").value = viz.lastName;
    }

    if (
      viz.additionalNameInformation &&
      !document.getElementById("apellidoMaterno").value
    ) {
      document.getElementById("apellidoMaterno").value =
        viz.additionalNameInformation;
    }
  }

  // Para INE mexicana, intentar extraer CURP del código de barras
  if (data.barcodeResult?.stringData) {
    const barcodeData = data.barcodeResult.stringData;
    // El CURP en INE suele estar en una posición específica del código de barras
    const curpMatch = barcodeData.match(/[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d/);
    if (curpMatch && !document.getElementById("curp").value) {
      document.getElementById("curp").value = curpMatch[0];
    }
  }
}

function mostrarFotoPerfil(imageBase64) {
  const profileImage = document.getElementById("profileImage");
  const profilePlaceholder = document.getElementById("profilePlaceholder");

  profileImage.src = `data:image/png;base64,${imageBase64}`;
  profileImage.style.display = "block";
  profilePlaceholder.style.display = "none";
}

function mostrarFirma(imageBase64) {
  const signatureImage = document.getElementById("signatureImage");
  const signaturePlaceholder = document.getElementById("signaturePlaceholder");

  signatureImage.src = `data:image/png;base64,${imageBase64}`;
  signatureImage.style.display = "block";
  signaturePlaceholder.style.display = "none";
}

function formatDateForInput(dateObj) {
  if (!dateObj) return "";

  if (dateObj.day && dateObj.month && dateObj.year) {
    const day = String(dateObj.day).padStart(2, "0");
    const month = String(dateObj.month).padStart(2, "0");
    const year = dateObj.year;
    return `${year}-${month}-${day}`;
  }

  // Si viene como string, intentar parsear
  if (dateObj.originalString) {
    const parts = dateObj.originalString.match(/(\d{2})\/(\d{2})\/(\d{4})/);
    if (parts) {
      return `${parts[3]}-${parts[2]}-${parts[1]}`;
    }
  }

  return "";
}

function mostrarMensajeEstado(mensaje, duracion = 0) {
  // Crear un toast notification o usar el div de resultado temporalmente
  const toast = document.createElement("div");
  toast.className = "toast-message";
  toast.textContent = mensaje;
  toast.style.cssText = `
    position: fixed;
    bottom: 80px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(0,0,0,0.8);
    color: white;
    padding: 12px 24px;
    border-radius: 24px;
    z-index: 1000;
    font-size: 14px;
  `;

  document.body.appendChild(toast);

  if (duracion > 0) {
    setTimeout(() => {
      toast.remove();
    }, duracion);
  } else {
    // Para mensajes de estado sin duración, remover después de 10 segundos
    setTimeout(() => {
      toast.remove();
    }, 10000);
  }
}

async function handleSubmit(e) {
  e.preventDefault();

  // Recopilar todos los datos del formulario
  const formData = new FormData(formPersona);
  const data = Object.fromEntries(formData.entries());

  console.log("Datos del formulario:", data);

  // Aquí puedes agregar la lógica para enviar los datos a tu servidor
  // Por ejemplo:
  // await enviarDatosAlServidor(data);

  mostrarMensajeEstado("✅ Datos guardados correctamente", 3000);
}

// Función placeholder para envío de datos
async function enviarDatosAlServidor(data) {
  // Implementar según tu backend
  try {
    const response = await fetch("/api/personas", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      throw new Error("Error al guardar");
    }

    return await response.json();
  } catch (error) {
    console.error("Error:", error);
    throw error;
  }
}
