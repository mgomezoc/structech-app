import { Capacitor } from "@capacitor/core";
import * as BlinkID from "@microblink/blinkid-capacitor";

const LICENSE =
  "sRwCABFjb20uc3RydWN0ZWNoLmFwcABsZXlKRGNtVmhkR1ZrVDI0aU9qRTNOVEF5TmpNME1qQTBPRGtzSWtOeVpXRjBaV1JHYjNJaU9pSmtOVGxoT1dFMU5DMWlOV1EzTFRFek56VXRNRFkyWVMxbVlURmhZemcyTkdaa1pqSWlmUT09bLATkl1ftQKgpSfNvfLD29qQQW85A2ZvLnY+ILLX1VhBLi1QVHev3d2y/qbuw55Z7xbwft1p+FHD61+Zwmm9ryd8xRyS5KcWQI3yScHZC/k+gt568pRAiFMLVvjB";
const btnScan = document.getElementById("btnScan");
const resultado = document.getElementById("resultado");

btnScan.addEventListener("click", scanINE);

async function scanINE() {
  resultado.textContent = "▶️ Solicitando permisos de cámara…";
  const { Camera } = Capacitor.Plugins;
  const perm = await Camera.requestPermissions();
  if (perm.camera !== "granted") {
    resultado.textContent = "❌ Permiso de cámara denegado";
    return;
  }

  resultado.textContent = "🔎 Iniciando BlinkID…";
  try {
    const plugin = new BlinkID.BlinkIDPlugin();
    const recognizer = new BlinkID.BlinkIdMultiSideRecognizer();

    // --- Ajustes de calidad / filtrado ---
    recognizer.returnFullDocumentImage = true;
    recognizer.returnFaceImage = true;
    recognizer.returnSignatureImage = true;
    recognizer.allowBarcodeScanOnly = true;
    recognizer.enableBlurFilter = true; // activar filtro de desenfoque
    recognizer.enableGlareFilter = true; // activar filtro de brillo
    // Usamos DPI moderadas para no pixelar la preview
    recognizer.fullDocumentImageDpi = 150;
    recognizer.faceImageDpi = 150;
    recognizer.signatureImageDpi = 150;

    const rc = new BlinkID.RecognizerCollection([recognizer]);

    // --- Overlay con instrucciones en español y buena resolución de cámara ---
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
      resultado.textContent = "⚠️ Usuario canceló el escaneo";
    } else {
      mostrarDatosINE(results[0]);
    }
  } catch (e) {
    console.error("Error en scanINE:", e);
    resultado.textContent = `❌ Error al escanear:\n${e.message || e}`;
  }
}

function mostrarDatosINE(res) {
  const d = res.result || res;
  let out = "✅ ¡Documento procesado!\n\n";

  out += `Nombre: ${d.firstName?.value || ""} ${d.lastName?.value || ""}\n`;
  out += `CURP:  ${d.personalIdNumber?.value || ""}\n`;
  out += `Nacimiento: ${formatDate(d.dateOfBirth)}\n\n`;

  // … añade aquí los campos extras que necesites …

  resultado.textContent = out;

  // Mostrar imágenes debajo del texto
  document.querySelectorAll(".scan-image").forEach((el) => el.remove());
  [
    { img: d.fullDocumentFrontImage, label: "Frontal" },
    { img: d.fullDocumentBackImage, label: "Reverso" },
    { img: d.faceImage, label: "Foto" },
    { img: d.signatureImage, label: "Firma" },
  ].forEach(({ img, label }) => {
    if (img) {
      const div = document.createElement("div");
      div.className = "scan-image";
      div.innerHTML = `<strong>📷 ${label}:</strong><br/>
                       <img src="data:image/png;base64,${img}" 
                            style="max-width:100%;margin:5px 0;border:1px solid#ccc">`;
      resultado.parentNode.insertBefore(div, resultado.nextSibling);
    }
  });
}

function formatDate(d) {
  if (!d) return "";
  if (d.day && d.month && d.year) {
    return `${String(d.day).padStart(2, "0")}/${String(d.month).padStart(
      2,
      "0"
    )}/${d.year}`;
  }
  return d.originalString || "";
}
