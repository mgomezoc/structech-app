import { Capacitor } from "@capacitor/core";
import * as BlinkID from "@microblink/blinkid-capacitor";
import lottie from "lottie-web";
import "../css/style.less";
import animationDataCamera from "../img/camara.json";
import animationData from "../img/pp.json";

const LICENSE =
  "sRwCABFjb20uc3RydWN0ZWNoLmFwcABsZXlKRGNtVmhkR1ZrVDI0aU9qRTNOVEEwTVRjMk1EY3hPREVzSWtOeVpXRjBaV1JHYjNJaU9pSTVabVExT0RCa05pMHlaRFJpTFRSak5HWXRPVFUzTUMwMVpXVXlZV1EyTWpZMk5ERWlmUT098Er7cjB+qDKvj4bUcp/EE0Gl92iO/qtPJowZOAmJqazLqMSRnDwD6vCpAUYaRf53vP7WrSYMLcwOB2BeiyNoa3DdBaCH+P3ju2ixpiEEuIRGgB1eQaFhpVkiVdEB5sWN94u4mqp/6HglO50sKXXWcex0mw==";

const btnScan = document.getElementById("btnScan");
const formPersona = document.getElementById("formPersona");

// Inicializar eventos
btnScan.addEventListener("click", scanINE);
formPersona.addEventListener("submit", handleSubmit);

document.addEventListener("DOMContentLoaded", () => {
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
});

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

  // Función auxiliar para extraer valores
  const getValue = (field) => field?.description || field?.latin || "";

  // Nombre
  const secondaryId = data?.mrzResult?.secondaryId;
  const latinName = data?.fullName?.latin;

  let nombre = "";

  if (secondaryId || latinName) {
    if (secondaryId && latinName) {
      nombre = secondaryId.length >= latinName.length ? secondaryId : latinName;
    } else {
      nombre = secondaryId || latinName;
    }
  }

  document.getElementById("nombre").value = nombre;

  // Apellidos - vienen separados en fathersName (paterno) y mothersName (materno)
  if (data.fathersName) {
    document.getElementById("apellidoPaterno").value = getValue(
      data.fathersName
    );
  }

  if (data.mothersName) {
    document.getElementById("apellidoMaterno").value = getValue(
      data.mothersName
    );
  }

  // CURP - viene en personalIdNumber
  if (data.personalIdNumber) {
    document.getElementById("curp").value = getValue(data.personalIdNumber);
  }

  // Clave de Elector - viene en documentAdditionalNumber
  if (data.documentAdditionalNumber) {
    document.getElementById("claveElector").value = getValue(
      data.documentAdditionalNumber
    );
  }

  // Número de documento
  if (data.documentNumber) {
    document.getElementById("documentNumber").value = getValue(
      data.documentNumber
    );
  }

  // Fecha de nacimiento
  if (data.dateOfBirth) {
    const fechaFormateada = formatDateForInput(data.dateOfBirth);
    if (fechaFormateada) {
      document.getElementById("fechaNacimiento").value = fechaFormateada;
    }
  }

  // Género

  if (data.sex) {
    const genero = getValue(data.sex).toUpperCase();
    if (genero === "H") {
      document.getElementById("hombre").checked = true;
    } else if (genero === "M") {
      document.getElementById("mujer").checked = true;
    }
  }

  // Domicilio - viene en address
  if (data.address) {
    const domicilio = getValue(data.address).replace(/\n/g, " ");
    document.getElementById("domicilio").value = domicilio;
  }

  // Sección - extraer de mrz.sanitizedOpt1
  const opt1 = data?.mrzResult?.sanitizedOpt1;
  const docNumber = data?.documentNumber?.latin;

  let seccion = "";

  if (typeof opt1 === "string" && opt1.length >= 4) {
    seccion = opt1.substring(0, 4);
  } else if (typeof docNumber === "string" && docNumber.length >= 4) {
    seccion = docNumber.substring(0, 4);
  }

  // Si existe el campo en el DOM, le asignamos el valor correspondiente
  const seccionInput = document.getElementById("seccion");
  if (seccionInput) {
    seccionInput.value = seccion;
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
  // Para INE mexicana, los datos vienen principalmente en los campos directos

  // Verificar datos del MRZ para completar información faltante
  if (data.mrz) {
    const mrz = data.mrz;

    // Verificar si tenemos el primaryId y secondaryId del MRZ
    if (mrz.primaryId && !document.getElementById("apellidoPaterno").value) {
      // primaryId suele contener apellidos
      document.getElementById("apellidoPaterno").value = mrz.primaryId;
    }

    if (mrz.secondaryId && !document.getElementById("nombre").value) {
      // secondaryId suele contener nombres
      document.getElementById("nombre").value = mrz.secondaryId;
    }

    // Verificar género del MRZ
    if (mrz.gender && !document.querySelector('input[name="genero"]:checked')) {
      if (mrz.gender === "M") {
        document.getElementById("hombre").checked = true;
      } else if (mrz.gender === "F") {
        document.getElementById("mujer").checked = true;
      }
    }

    // Extraer sección de sanitizedOpt1 si no se ha extraído antes
    if (mrz.sanitizedOpt1 && !document.getElementById("seccion").value) {
      const seccion = mrz.sanitizedOpt1.substring(0, 4);
      document.getElementById("seccion").value = seccion;
    }
  }

  // Verificar si hay datos en el resultado del código de barras
  if (data.barcodeResult?.stringData) {
    const barcodeData = data.barcodeResult.stringData;
    console.log("Datos del código de barras:", barcodeData);

    // El CURP en INE suele estar en una posición específica del código de barras
    const curpMatch = barcodeData.match(/[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d/);
    if (curpMatch && !document.getElementById("curp").value) {
      document.getElementById("curp").value = curpMatch[0];
    }
  }

  // Si no se encontró el domicilio en address, buscar en otros campos
  if (!document.getElementById("domicilio").value) {
    // A veces el domicilio completo viene en campos adicionales
    if (data.additionalAddressInformation) {
      const domicilio = getValue(data.additionalAddressInformation);
      document.getElementById("domicilio").value = domicilio;
    }
  }

  // Función auxiliar para extraer valores
  function getValue(field) {
    return field?.description || field?.latin || "";
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
