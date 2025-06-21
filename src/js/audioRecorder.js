// audioRecorder.js - Módulo para manejar grabación de audio
import { VoiceRecorder } from "capacitor-voice-recorder";

class AudioRecorderManager {
  constructor() {
    this.isRecording = false;
    this.isPaused = false;
    this.recordingStartTime = null;
    this.recordingData = null;
    this.audioPlayer = null;
    this.timerInterval = null;
    this.elapsedTime = 0;
  }

  async init() {
    // Solicitar permisos
    const hasPermission = await this.checkPermissions();
    if (!hasPermission) {
      console.log("No se otorgaron permisos de audio");
      return false;
    }

    // Configurar eventos de los botones
    this.setupEventListeners();
    return true;
  }

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

  setupEventListeners() {
    const audioBtn = document.getElementById("audioBtn");
    const audioDelete = document.getElementById("audioDelete");
    const audioTimer = document.getElementById("audioTimer");

    if (audioBtn) {
      let isHolding = false;
      let holdTimeout = null;

      // Función para iniciar grabación
      const startHoldRecording = (e) => {
        e.preventDefault();

        // Si ya hay una grabación, reproducir en lugar de grabar
        if (this.recordingData && !this.isRecording) {
          this.togglePlayback();
          return;
        }

        isHolding = true;
        // Pequeño delay para diferenciar entre click y hold
        holdTimeout = setTimeout(() => {
          if (isHolding && !this.recordingData) {
            this.startRecording();
          }
        }, 200);
      };

      // Función para detener grabación
      const stopHoldRecording = (e) => {
        e.preventDefault();

        if (holdTimeout) {
          clearTimeout(holdTimeout);
          holdTimeout = null;
        }

        if (isHolding) {
          isHolding = false;
          if (this.isRecording) {
            this.stopRecording();
          }
        }
      };

      // Eventos para mouse
      audioBtn.addEventListener("mousedown", startHoldRecording);
      audioBtn.addEventListener("mouseup", stopHoldRecording);
      audioBtn.addEventListener("mouseleave", stopHoldRecording);

      // Eventos para touch (móvil)
      audioBtn.addEventListener("touchstart", startHoldRecording, {
        passive: false,
      });
      audioBtn.addEventListener("touchend", stopHoldRecording, {
        passive: false,
      });
      audioBtn.addEventListener("touchcancel", stopHoldRecording);

      // Prevenir el comportamiento por defecto del click
      audioBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
      });
    }

    if (audioDelete) {
      audioDelete.addEventListener("click", () => this.deleteRecording());
    }
  }

  async startRecording() {
    if (this.isRecording) return;

    try {
      // Verificar permisos nuevamente
      const hasPermission = await this.checkPermissions();
      if (!hasPermission) {
        this.showMessage("❌ Permisos de micrófono denegados");
        return;
      }

      // Limpiar grabación anterior si existe
      if (this.recordingData) {
        this.deleteRecording();
      }

      // Iniciar grabación
      const { value } = await VoiceRecorder.startRecording();
      if (!value) {
        throw new Error("No se pudo iniciar la grabación");
      }

      this.isRecording = true;
      this.recordingStartTime = Date.now();

      // Actualizar UI
      this.updateRecordingUI(true);

      // Iniciar timer
      this.startTimer();

      // Vibrar al iniciar (feedback táctil)
      if ("vibrate" in navigator) {
        navigator.vibrate(50);
      }
    } catch (error) {
      console.error("Error al iniciar grabación:", error);
      this.showMessage("❌ Error al iniciar grabación");
    }
  }

  async stopRecording() {
    if (!this.isRecording) return;

    try {
      // Detener grabación
      const { value } = await VoiceRecorder.stopRecording();
      if (!value) {
        throw new Error("No se pudo detener la grabación");
      }

      this.isRecording = false;

      // Guardar datos de la grabación
      this.recordingData = {
        recordDataBase64: value.recordDataBase64,
        mimeType: value.mimeType || "audio/aac",
        msDuration: value.msDuration || this.elapsedTime * 1000,
        format: value.format || "aac",
      };

      // Detener timer
      this.stopTimer();

      // Actualizar UI
      this.updateRecordingUI(false);
      this.showDeleteButton(true);

      // Vibrar al terminar
      if ("vibrate" in navigator) {
        navigator.vibrate(30);
      }

      // Guardar en el campo oculto del formulario
      this.saveToForm();
    } catch (error) {
      console.error("Error al detener grabación:", error);
      this.showMessage("❌ Error al detener grabación");
      this.isRecording = false;
      this.stopTimer();
      this.updateRecordingUI(false);
    }
  }

  startTimer() {
    this.elapsedTime = 0;
    const timerElement = document.getElementById("audioTimer");

    this.timerInterval = setInterval(() => {
      this.elapsedTime++;
      if (timerElement) {
        timerElement.textContent = this.formatTime(this.elapsedTime);
      }
    }, 1000);
  }

  stopTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  formatTime(seconds) {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    return `${hrs.toString().padStart(2, "0")}:${mins
      .toString()
      .padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }

  updateRecordingUI(isRecording) {
    const audioBtn = document.getElementById("audioBtn");
    const audioTimer = document.getElementById("audioTimer");
    const audioHint = document.getElementById("audioHint");
    const audioWave = document.getElementById("audioWave");

    if (audioBtn) {
      if (isRecording) {
        audioBtn.textContent = "⏹️";
        audioBtn.classList.add("recording");
        audioBtn.style.background = "#ef4444";
        audioBtn.style.cursor = "pointer";
      } else if (this.recordingData) {
        audioBtn.textContent = "▶️";
        audioBtn.classList.remove("recording");
        audioBtn.style.background = "#10b981";
        audioBtn.style.cursor = "pointer";
      } else {
        audioBtn.textContent = "🎤";
        audioBtn.classList.remove("recording");
        audioBtn.style.background = "#3b82f6";
        audioBtn.style.cursor = "pointer";
      }
    }

    if (audioHint) {
      if (isRecording) {
        audioHint.textContent = "Suelta para detener";
      } else if (this.recordingData) {
        audioHint.textContent = "Toca para reproducir";
      } else {
        audioHint.textContent = "Mantén presionado para grabar";
      }
    }

    if (audioWave) {
      audioWave.style.display = isRecording ? "flex" : "none";
    }

    if (audioTimer && !isRecording && !this.recordingData) {
      audioTimer.textContent = "00:00:00";
    }
  }

  showDeleteButton(show) {
    const deleteBtn = document.getElementById("audioDelete");
    if (deleteBtn) {
      deleteBtn.style.display = show ? "block" : "none";
    }
  }

  async togglePlayback() {
    if (!this.recordingData) return;

    const audioBtn = document.getElementById("audioBtn");

    if (this.audioPlayer && !this.audioPlayer.paused) {
      // Pausar
      this.audioPlayer.pause();
      audioBtn.textContent = "▶️";
    } else {
      // Reproducir
      if (!this.audioPlayer) {
        // Crear el audio con el formato correcto
        const mimeType = this.recordingData.mimeType || "audio/aac";
        this.audioPlayer = new Audio(
          `data:${mimeType};base64,${this.recordingData.recordDataBase64}`
        );

        this.audioPlayer.addEventListener("ended", () => {
          audioBtn.textContent = "▶️";
        });

        this.audioPlayer.addEventListener("error", (e) => {
          console.error("Error al reproducir audio:", e);
          this.showMessage("❌ Error al reproducir audio");
        });
      }

      try {
        await this.audioPlayer.play();
        audioBtn.textContent = "⏸️";
      } catch (error) {
        console.error("Error al reproducir:", error);
        this.showMessage("❌ Error al reproducir audio");
      }
    }
  }

  deleteRecording() {
    // Detener reproducción si está activa
    if (this.audioPlayer) {
      this.audioPlayer.pause();
      this.audioPlayer = null;
    }

    // Limpiar datos
    this.recordingData = null;
    this.elapsedTime = 0;

    // Actualizar UI
    this.updateRecordingUI(false);
    this.showDeleteButton(false);
    document.getElementById("audioTimer").textContent = "00:00:00";

    // Limpiar campo del formulario
    const audioField = document.getElementById("audioData");
    if (audioField) {
      audioField.value = "";
    }

    this.showMessage("🗑️ Audio eliminado");
  }

  saveToForm() {
    if (!this.recordingData) return;

    // Buscar o crear campo oculto para el audio
    let audioField = document.getElementById("audioData");
    if (!audioField) {
      audioField = document.createElement("input");
      audioField.type = "hidden";
      audioField.id = "audioData";
      audioField.name = "audioData";
      document.getElementById("formPersona").appendChild(audioField);
    }

    // Guardar datos del audio
    audioField.value = JSON.stringify({
      data: this.recordingData.recordDataBase64,
      mimeType: this.recordingData.mimeType,
      format: this.recordingData.format,
      duration: Math.floor(this.recordingData.msDuration / 1000),
      timestamp: new Date().toISOString(),
    });
  }

  showMessage(message) {
    // Reutilizar tu función mostrarMensajeEstado
    if (window.mostrarMensajeEstado) {
      window.mostrarMensajeEstado(message, 2000);
    } else {
      console.log(message);
    }
  }

  // Obtener datos del audio para enviar
  getAudioData() {
    if (!this.recordingData) return null;

    return {
      data: this.recordingData.recordDataBase64,
      mimeType: this.recordingData.mimeType,
      format: this.recordingData.format,
      duration: Math.floor(this.recordingData.msDuration / 1000),
      size: Math.round(this.recordingData.recordDataBase64.length * 0.75), // Aproximado
      timestamp: new Date().toISOString(),
    };
  }

  hasRecording() {
    return !!this.recordingData;
  }
}

export const audioRecorder = new AudioRecorderManager();
