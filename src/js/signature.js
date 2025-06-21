import SignaturePad from "signature_pad";

class SignatureManager {
  constructor() {
    this.canvas = null;
    this.signaturePad = null;
    this.isFromScan = false;
  }

  init() {
    this.canvas = document.getElementById("signatureCanvas");
    if (!this.canvas) return;

    // Configuración inicial
    this._resizeCanvas();
    this.signaturePad = new SignaturePad(this.canvas, {
      minWidth: 0.5,
      maxWidth: 2.5,
      throttle: 16,
      backgroundColor: "rgba(255,255,255,1)",
      penColor: "rgb(0,0,0)",
      velocityFilterWeight: 0.7,
      onBegin: () => {
        this.isFromScan = false;
      },
    });

    // Listeners
    this._setupEventListeners();
    window.addEventListener("resize", () => this._resizeCanvas());
  }

  _setupEventListeners() {
    const clearBtn = document.getElementById("clearSignature");
    const undoBtn = document.getElementById("undoSignature");

    clearBtn?.addEventListener("click", () => this.clear());
    undoBtn?.addEventListener("click", () => this.undo());

    // Evitar scroll en movil
    this.canvas.addEventListener("touchstart", (e) => e.preventDefault());
    this.canvas.addEventListener("touchmove", (e) => e.preventDefault());
  }

  _resizeCanvas() {
    if (!this.canvas) return;
    const data = this.signaturePad?.toData();
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = rect.width * ratio;
    this.canvas.height = rect.height * ratio;
    this.canvas.getContext("2d").scale(ratio, ratio);
    if (this.signaturePad && data?.length) {
      this.signaturePad.fromData(data);
    }
  }

  clear() {
    this.signaturePad?.clear();
    this.isFromScan = false;
    this._showCanvas();
    // Limpia campo oculto
    document.getElementById("signatureImageData").value = "";
  }

  undo() {
    // Si venía de un escaneo, limpia todo
    if (this.isFromScan) {
      return this.clear();
    }

    if (!this.signaturePad) return;
    const data = this.signaturePad.toData();
    if (!data.length) return;

    data.pop(); // quita el último stroke
    this.signaturePad.clear(); // limpia todo
    this.signaturePad.fromData(data); // redibuja
  }

  showScannedSignature(base64) {
    const img = document.getElementById("signatureImage");
    const canvas = this.canvas;
    if (!img || !canvas) return;

    canvas.style.display = "none";
    img.style.display = "block";
    img.src = `data:image/png;base64,${base64}`;
    this.isFromScan = true;
    document.getElementById("signatureImageData").value = base64;
  }

  _showCanvas() {
    const img = document.getElementById("signatureImage");
    const canvas = this.canvas;
    if (!img || !canvas) return;
    img.style.display = "none";
    canvas.style.display = "block";
  }

  getSignatureAsBase64() {
    if (this.isFromScan) {
      return document.getElementById("signatureImageData").value || "";
    }
    if (this.signaturePad && !this.signaturePad.isEmpty()) {
      return this.signaturePad.toDataURL("image/png").split(",")[1];
    }
    return "";
  }

  hasSignature() {
    if (this.isFromScan) {
      return !!document.getElementById("signatureImageData").value;
    }
    return this.signaturePad && !this.signaturePad.isEmpty();
  }

  getSignatureData() {
    return {
      data: this.getSignatureAsBase64(),
      type: this.isFromScan ? "scanned" : "drawn",
      timestamp: new Date().toISOString(),
    };
  }

  loadSignature(base64, fromScan = false) {
    if (fromScan) {
      this.showScannedSignature(base64);
    } else if (this.signaturePad) {
      this._showCanvas();
      this.signaturePad.fromDataURL(`data:image/png;base64,${base64}`);
    }
  }
}

export const signatureManager = new SignatureManager();
