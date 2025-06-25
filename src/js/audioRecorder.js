// src/js/audioRecorder.js
import { VoiceRecorder } from "capacitor-voice-recorder";

class AudioRecorderManager {
  constructor() {
    this.isRecording = false;
    this.recordingData = null;
    this.audioPlayer = null;
    this.timerInterval = null;
    this.elapsedTime = 0;
  }

  /** Inicializa el módulo: pide permisos y conecta listeners */
  async init() {
    const hasPermission = await this.checkPermissions();
    if (!hasPermission) {
      console.warn("No se otorgaron permisos de audio");
      return false;
    }
    this.setupEventListeners();
    return true;
  }

  /** Verifica o solicita permisos de micrófono */
  async checkPermissions() {
    try {
      const { value } = await VoiceRecorder.hasAudioRecordingPermission();
      if (!value) {
        const { value: granted } =
          await VoiceRecorder.requestAudioRecordingPermission();
        return granted;
      }
      return value;
    } catch (error) {
      console.error("Error al verificar permisos:", error);
      return false;
    }
  }

  /** Conecta los botones de la UI a sus handlers */
  setupEventListeners() {
    const btn = document.getElementById("audioBtn");
    const del = document.getElementById("audioDelete");

    if (btn) {
      let holdTimeout = null;
      let isHolding = false;

      const startHold = (e) => {
        e.preventDefault();
        // si ya hay grabación, togglear reproducción
        if (this.recordingData && !this.isRecording) {
          return this.togglePlayback();
        }
        isHolding = true;
        holdTimeout = setTimeout(() => {
          if (isHolding && !this.recordingData) {
            this.startRecording();
          }
        }, 200);
      };

      const stopHold = (e) => {
        e.preventDefault();
        clearTimeout(holdTimeout);
        holdTimeout = null;
        if (isHolding && this.isRecording) {
          this.stopRecording();
        }
        isHolding = false;
      };

      // mouse
      btn.addEventListener("mousedown", startHold);
      btn.addEventListener("mouseup", stopHold);
      btn.addEventListener("mouseleave", stopHold);
      // touch
      btn.addEventListener("touchstart", startHold, { passive: false });
      btn.addEventListener("touchend", stopHold, { passive: false });
      btn.addEventListener("touchcancel", stopHold);
      // evitar click normal
      btn.addEventListener("click", (e) => e.preventDefault());
    }

    if (del) {
      del.addEventListener("click", () => this.deleteRecording());
    }
  }

  /** Inicia la grabación */
  async startRecording() {
    if (this.isRecording) return;
    try {
      if (!(await this.checkPermissions())) {
        return this.showMessage("❌ Permisos de micrófono denegados");
      }

      // limpiar anterior
      if (this.recordingData) this.deleteRecording();

      const { value } = await VoiceRecorder.startRecording();
      if (!value) throw new Error("No se pudo iniciar la grabación");

      this.isRecording = true;
      this.elapsedTime = 0;
      this.updateRecordingUI(true);
      this.startTimer();
      navigator.vibrate?.(50);
    } catch (err) {
      console.error("Error al iniciar grabación:", err);
      this.showMessage("❌ Error al iniciar grabación");
    }
  }

  /** Detiene la grabación y guarda los datos en memoria */
  async stopRecording() {
    if (!this.isRecording) return;
    try {
      const { value } = await VoiceRecorder.stopRecording();
      if (!value) throw new Error("No se pudo detener la grabación");

      this.isRecording = false;
      this.recordingData = {
        recordDataBase64: value.recordDataBase64,
        mimeType: value.mimeType || "audio/aac",
        msDuration: value.msDuration || this.elapsedTime * 1000,
      };

      // Mostrar en consola el Base64 completo para debug
      console.log("🔊 Audio Base64:", this.recordingData.recordDataBase64);

      this.stopTimer();
      this.updateRecordingUI(false);
      this.showDeleteButton(true);
      navigator.vibrate?.(30);

      // guardar el Base64 en el formulario
      this.saveToForm();
    } catch (err) {
      console.error("Error al detener grabación:", err);
      this.showMessage("❌ Error al detener grabación");
      this.isRecording = false;
      this.stopTimer();
      this.updateRecordingUI(false);
    }
  }

  /** Inicia el contador de tiempo */
  startTimer() {
    const display = document.getElementById("audioTimer");
    this.timerInterval = setInterval(() => {
      this.elapsedTime++;
      if (display) display.textContent = this.formatTime(this.elapsedTime);
    }, 1000);
  }

  /** Detiene el contador */
  stopTimer() {
    clearInterval(this.timerInterval);
    this.timerInterval = null;
  }

  /** Formatea segundos a HH:MM:SS */
  formatTime(sec) {
    const h = Math.floor(sec / 3600)
      .toString()
      .padStart(2, "0");
    const m = Math.floor((sec % 3600) / 60)
      .toString()
      .padStart(2, "0");
    const s = (sec % 60).toString().padStart(2, "0");
    return `${h}:${m}:${s}`;
  }

  /** Actualiza la UI del botón según estado */
  updateRecordingUI(isRecording) {
    const btn = document.getElementById("audioBtn");
    const hint = document.getElementById("audioHint");
    const wave = document.getElementById("audioWave");

    if (btn) {
      if (isRecording) {
        btn.textContent = "⏹️";
        btn.style.background = "#ef4444";
      } else if (this.recordingData) {
        btn.textContent = "▶️";
        btn.style.background = "#10b981";
      } else {
        btn.textContent = "🎤";
        btn.style.background = "#3b82f6";
      }
    }
    if (hint) {
      hint.textContent = isRecording
        ? "Suelta para detener"
        : this.recordingData
        ? "Toca para reproducir"
        : "Mantén presionado para grabar";
    }
    if (wave) {
      wave.style.display = isRecording ? "flex" : "none";
    }
    const timer = document.getElementById("audioTimer");
    if (timer && !isRecording && !this.recordingData) {
      timer.textContent = "00:00:00";
    }
  }

  /** Muestra u oculta el botón de eliminar */
  showDeleteButton(show) {
    const del = document.getElementById("audioDelete");
    if (del) del.style.display = show ? "block" : "none";
  }

  /** Reproduce o pausa la grabación */
  async togglePlayback() {
    if (!this.recordingData) return;
    const btn = document.getElementById("audioBtn");
    if (this.audioPlayer && !this.audioPlayer.paused) {
      this.audioPlayer.pause();
      btn.textContent = "▶️";
    } else {
      if (!this.audioPlayer) {
        const mime = this.recordingData.mimeType;
        this.audioPlayer = new Audio(
          `data:${mime};base64,${this.recordingData.recordDataBase64}`
        );
        this.audioPlayer.addEventListener("ended", () => {
          btn.textContent = "▶️";
        });
      }
      try {
        await this.audioPlayer.play();
        btn.textContent = "⏸️";
      } catch (err) {
        console.error("Error al reproducir audio:", err);
        this.showMessage("❌ Error al reproducir audio");
      }
    }
  }

  /** Elimina la grabación actual */
  deleteRecording() {
    this.audioPlayer?.pause();
    this.audioPlayer = null;
    this.recordingData = null;
    this.elapsedTime = 0;
    this.updateRecordingUI(false);
    this.showDeleteButton(false);
    const timerEl = document.getElementById("audioTimer");
    if (timerEl) timerEl.textContent = "00:00:00";
    // limpiar campo oculto
    const fld = document.getElementById("audioData");
    if (fld) fld.value = "";
    this.showMessage("🗑️ Audio eliminado");
  }

  /** Inserta un campo oculto con SOLO el Base64 para el backend */
  saveToForm() {
    if (!this.recordingData) return;
    let fld = document.getElementById("audioData");
    if (!fld) {
      fld = document.createElement("input");
      fld.type = "hidden";
      fld.id = "audioData";
      fld.name = "audioData";
      document.getElementById("formPersona").appendChild(fld);
    }
    fld.value = this.recordingData.recordDataBase64;
  }

  /** Obtiene info de la grabación */
  getAudioData() {
    if (!this.recordingData) return null;
    return {
      data: this.recordingData.recordDataBase64,
      mimeType: this.recordingData.mimeType,
      duration: Math.floor(this.recordingData.msDuration / 1000),
    };
  }

  /** Indica si hay grabación lista */
  hasRecording() {
    return !!this.recordingData;
  }

  /** Toast interno */
  showMessage(msg) {
    window.mostrarMensajeEstado?.(msg, 2000) || console.log(msg);
  }
}

export const audioRecorder = new AudioRecorderManager();
