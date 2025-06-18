import * as BlinkID from "@microblink/blinkid-capacitor";
// 1) Tu licencia (Android e iOS usan la misma clave aquí)
const BLINKID_LICENSE_KEY =
  "sRwCABFjb20uc3RydWN0ZWNoLmFwcABsZXlKRGNtVmhkR1ZrVDI0aU9qRTNOVEF5TmpNME1qQTBPRGtzSWtOeVpXRjBaV1JHYjNJaU9pSmtOVGxoT1dFMU5DMWlOV1EzTFRFek56VXRNRFkyWVMxbVlURmhZemcyTkdaa1pqSWlmUT09bLATkl1ftQKgpSfNvfLD29qQQW85A2ZvLnY+ILLX1VhBLi1QVHev3d2y/qbuw55Z7xbwft1p+FHD61+Zwmm9ryd8xRyS5KcWQI3yScHZC/k+gt568pRAiFMLVvjB";

import { Capacitor } from "@capacitor/core";

const btnScan = document.getElementById("btnScan");
const resultado = document.getElementById("resultado");

btnScan.addEventListener("click", scanINE);

async function scanINE() {
  resultado.textContent = "▶️ Solicitud permisos de cámara…";
  // 2) Pedir permisos de cámara
  const { Camera } = Capacitor.Plugins;
  const perm = await Camera.requestPermissions();
  if (perm.camera !== "granted") {
    return (resultado.textContent = "❌ Permiso de cámara denegado");
  }

  resultado.textContent = "🔎 Iniciando BlinkID…";

  try {
    // 3) Inicializar plugin BlinkID
    const plugin = new BlinkID.BlinkIDPlugin();

    // 4) Configurar reconocedor multiside (ambos lados)
    const recognizer = new BlinkID.BlinkIdMultiSideRecognizer();
    recognizer.returnFullDocumentImage = true;
    recognizer.returnFaceImage = true;

    const recognizerCollection = new BlinkID.RecognizerCollection([recognizer]);
    const overlaySettings = new BlinkID.BlinkIdOverlaySettings();
    const licenseKeys = {
      android: BLINKID_LICENSE_KEY,
      ios: BLINKID_LICENSE_KEY,
      showTimeLimitedLicenseKeyWarning: true,
    };

    // 5) Lanzar UI nativa de escaneo
    const results = await plugin.scanWithCamera(
      overlaySettings,
      recognizerCollection,
      licenseKeys
    );

    // 6) Mostrar resultados
    if (results.length === 0) {
      resultado.textContent = "⚠️ Escaneo cancelado";
    } else {
      mostrarDatos(results[0]);
    }
  } catch (err) {
    resultado.textContent = `❌ Error al escanear:\n${err.message || err}`;
    console.error(err);
  }
}

function mostrarDatos(res) {
  const data = res.result || res;
  let out = "✅ ¡Documento encontrado!\n\n";

  // Campos básicos
  const campos = {
    Nombre: data.firstName?.value || data.firstName,
    Apellido: data.lastName?.value || data.lastName,
    Número: data.documentNumber?.value || data.documentNumber,
    "Fecha Nac.": formatDate(data.dateOfBirth),
    Nacionalidad: data.nationality?.value || data.nationality,
    Sexo: data.sex?.value || data.sex,
  };
  for (let [k, v] of Object.entries(campos)) {
    if (v) out += `${k}: ${v}\n`;
  }

  // Imágenes
  if (data.fullDocumentFrontImage) {
    out += "\n[ Frontal ]\n";
    out += `data:image/png;base64,${data.fullDocumentFrontImage}\n`;
  }
  if (data.fullDocumentBackImage) {
    out += "\n[ Posterior ]\n";
    out += `data:image/png;base64,${data.fullDocumentBackImage}\n`;
  }
  if (data.faceImage) {
    out += "\n[ Foto ]\n";
    out += `data:image/png;base64,${data.faceImage}\n`;
  }

  resultado.textContent = out;
}

function formatDate(d) {
  if (!d) return "";
  const day = String(d.day).padStart(2, "0");
  const month = String(d.month).padStart(2, "0");
  return `${day}/${month}/${d.year}`;
}
