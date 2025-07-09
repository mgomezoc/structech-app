// src/js/signature.js
import SignaturePad from 'signature_pad';
import { hapticsService } from '../services/haptics.service.js';

class SignatureManager {
  constructor() {
    this.canvas = null;
    this.signaturePad = null;
    this.isFromScan = false;
    this.placeholder = null;
    this.signatureBox = null;
    this.hasStartedDrawing = false;
  }

  init() {
    this.canvas = document.getElementById('signatureCanvas');
    this.placeholder = document.getElementById('signaturePlaceholder');
    this.signatureBox = document.getElementById('signatureBox');

    if (!this.canvas) return;

    // Configuración inicial
    this._resizeCanvas();

    // Crear SignaturePad con opciones base
    this.signaturePad = new SignaturePad(this.canvas, {
      minWidth: 0.5,
      maxWidth: 2.5,
      throttle: 16,
      backgroundColor: 'rgba(255,255,255,0)', // Transparente
      penColor: 'rgb(0,0,0)',
      velocityFilterWeight: 0.7,
    });

    // Agregar event listeners personalizados para detectar inicio/fin
    this._attachDrawingEvents();

    // Listeners
    this._setupEventListeners();

    // Resize listener con debounce
    let resizeTimeout;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => this._resizeCanvas(), 250);
    });
  }

  _attachDrawingEvents() {
    if (!this.canvas) return;

    // Detectar inicio de dibujo
    const handleStart = e => {
      e.preventDefault();
      this._handleDrawingStart();
    };

    // Detectar fin de dibujo
    const handleEnd = e => {
      e.preventDefault();
      this._handleDrawingEnd();
    };

    // Mouse events
    this.canvas.addEventListener('mousedown', handleStart);
    this.canvas.addEventListener('mouseup', handleEnd);

    // Touch events
    this.canvas.addEventListener('touchstart', handleStart);
    this.canvas.addEventListener('touchend', handleEnd);

    // Pointer events (más moderno, cubre mouse y touch)
    if ('PointerEvent' in window) {
      this.canvas.addEventListener('pointerdown', handleStart);
      this.canvas.addEventListener('pointerup', handleEnd);
    }
  }

  _setupEventListeners() {
    const clearBtn = document.getElementById('clearSignature');
    const undoBtn = document.getElementById('undoSignature');

    clearBtn?.addEventListener('click', () => this.clear());
    undoBtn?.addEventListener('click', () => this.undo());

    // Mouse enter/leave effects para el box
    this.signatureBox?.addEventListener('mouseenter', () => {
      if (!this.hasSignature() && this.placeholder) {
        this.placeholder.classList.add('hover');
      }
    });

    this.signatureBox?.addEventListener('mouseleave', () => {
      if (this.placeholder) {
        this.placeholder.classList.remove('hover');
      }
    });
  }

  _handleDrawingStart() {
    this.isFromScan = false;

    // Ocultar placeholder con animación
    if (this.placeholder && !this.hasStartedDrawing) {
      this.placeholder.style.opacity = '0';
      this.placeholder.style.transform = 'translate(-50%, -50%) scale(0.8)';
      this.hasStartedDrawing = true;

      // Haptic feedback
      if (hapticsService) {
        hapticsService.light();
      }

      // Cambiar estado visual del box
      if (this.signatureBox) {
        this.signatureBox.classList.add('signing');
      }
    }
  }

  _handleDrawingEnd() {
    // Guardar automáticamente al terminar cada trazo
    setTimeout(() => {
      this._autoSave();
    }, 100);
  }

  _resizeCanvas() {
    if (!this.canvas) return;

    const data = this.signaturePad?.toData();
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    const rect = this.canvas.getBoundingClientRect();

    this.canvas.width = rect.width * ratio;
    this.canvas.height = rect.height * ratio;

    const ctx = this.canvas.getContext('2d');
    ctx.scale(ratio, ratio);

    // Restaurar datos si existen
    if (this.signaturePad && data?.length) {
      this.signaturePad.fromData(data);
    }
  }

  clear() {
    if (this.signaturePad) {
      this.signaturePad.clear();
    }

    this.isFromScan = false;
    this.hasStartedDrawing = false;

    this._showCanvas();
    this._showPlaceholder();

    // Remover clase de signing
    if (this.signatureBox) {
      this.signatureBox.classList.remove('signing');
    }

    // Limpiar campo oculto
    const hiddenField = document.getElementById('signatureImageData');
    if (hiddenField) {
      hiddenField.value = '';
    }

    // Haptic feedback
    if (hapticsService) {
      hapticsService.medium();
    }

    // Mostrar mensaje de estado
    if (window.mostrarMensajeEstado) {
      window.mostrarMensajeEstado('✏️ Firma limpiada', 1500);
    }
  }

  undo() {
    // Si venía de un escaneo, limpia todo
    if (this.isFromScan) {
      return this.clear();
    }

    if (!this.signaturePad) return;

    const data = this.signaturePad.toData();
    if (!data || data.length === 0) return;

    data.pop(); // quita el último stroke
    this.signaturePad.clear();
    this.signaturePad.fromData(data);

    // Si no quedan trazos, mostrar placeholder
    if (data.length === 0) {
      this.hasStartedDrawing = false;
      this._showPlaceholder();
      if (this.signatureBox) {
        this.signatureBox.classList.remove('signing');
      }
    }

    // Haptic feedback
    if (hapticsService) {
      hapticsService.light();
    }

    this._autoSave();
  }

  _showPlaceholder() {
    if (this.placeholder) {
      this.placeholder.style.opacity = '1';
      this.placeholder.style.transform = 'translate(-50%, -50%) scale(1)';
      this.placeholder.style.transition = 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
    }
  }

  _hidePlaceholder() {
    if (this.placeholder) {
      this.placeholder.style.opacity = '0';
      this.placeholder.style.transform = 'translate(-50%, -50%) scale(0.8)';
      this.placeholder.style.transition = 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
    }
  }

  showScannedSignature(base64) {
    // Crear o obtener imagen
    let img = document.getElementById('signatureImage');
    if (!img) {
      img = document.createElement('img');
      img.id = 'signatureImage';
      img.style.position = 'absolute';
      img.style.maxWidth = '90%';
      img.style.maxHeight = '160px';
      img.style.objectFit = 'contain';
      this.signatureBox?.appendChild(img);
    }

    const canvas = this.canvas;

    if (!img || !canvas) return;

    canvas.style.display = 'none';
    img.style.display = 'block';
    img.src = `data:image/png;base64,${base64}`;

    this.isFromScan = true;
    this.hasStartedDrawing = true;
    this._hidePlaceholder();

    if (this.signatureBox) {
      this.signatureBox.classList.add('signing', 'has-scan');
    }

    const hiddenField = document.getElementById('signatureImageData');
    if (hiddenField) {
      hiddenField.value = base64;
    }

    // Mensaje de confirmación
    if (window.mostrarMensajeEstado) {
      window.mostrarMensajeEstado('✅ Firma cargada desde INE', 2000);
    }
  }

  _showCanvas() {
    const img = document.getElementById('signatureImage');
    const canvas = this.canvas;

    if (img && canvas) {
      img.style.display = 'none';
      canvas.style.display = 'block';
      if (this.signatureBox) {
        this.signatureBox.classList.remove('has-scan');
      }
    }
  }

  _autoSave() {
    // Guardar automáticamente en el campo oculto
    const base64 = this.getSignatureAsBase64();
    const hiddenField = document.getElementById('signatureImageData');
    if (hiddenField && base64) {
      hiddenField.value = base64;
    }
  }

  getSignatureAsBase64() {
    if (this.isFromScan) {
      const hiddenField = document.getElementById('signatureImageData');
      return hiddenField?.value || '';
    }

    if (this.signaturePad && !this.signaturePad.isEmpty()) {
      const dataUrl = this.signaturePad.toDataURL('image/png');
      return dataUrl.split(',')[1];
    }

    return '';
  }

  hasSignature() {
    if (this.isFromScan) {
      const hiddenField = document.getElementById('signatureImageData');
      return !!hiddenField?.value;
    }

    return this.signaturePad && !this.signaturePad.isEmpty();
  }

  getSignatureData() {
    const data = this.getSignatureAsBase64();
    return {
      data: data,
      type: this.isFromScan ? 'scanned' : 'drawn',
      timestamp: new Date().toISOString(),
      strokeCount: this.isFromScan ? 0 : this.signaturePad?.toData()?.length || 0,
    };
  }

  loadSignature(base64, fromScan = false) {
    if (!base64) return;

    if (fromScan) {
      this.showScannedSignature(base64);
    } else if (this.signaturePad) {
      this._showCanvas();
      try {
        this.signaturePad.fromDataURL(`data:image/png;base64,${base64}`);
        this.hasStartedDrawing = true;
        this._hidePlaceholder();
        if (this.signatureBox) {
          this.signatureBox.classList.add('signing');
        }
      } catch (error) {
        console.error('Error loading signature:', error);
      }
    }
  }

  // Método para validar la firma
  validateSignature() {
    if (!this.hasSignature()) {
      return { valid: false, message: 'Por favor proporcione su firma' };
    }

    // Validar que tenga al menos algunos trazos si es dibujada
    if (!this.isFromScan && this.signaturePad) {
      const data = this.signaturePad.toData();
      if (!data || data.length < 2) {
        return { valid: false, message: 'La firma parece incompleta' };
      }
    }

    return { valid: true };
  }

  // Método para exportar firma en diferentes formatos
  exportSignature(format = 'png') {
    if (!this.hasSignature()) return null;

    const formats = {
      png: 'image/png',
      jpg: 'image/jpeg',
      svg: 'image/svg+xml',
    };

    if (this.signaturePad && !this.isFromScan) {
      try {
        return this.signaturePad.toDataURL(formats[format] || formats.png);
      } catch (error) {
        console.error('Error exporting signature:', error);
        return null;
      }
    }

    const base64 = this.getSignatureAsBase64();
    return base64 ? `data:image/png;base64,${base64}` : null;
  }
}

export const signatureManager = new SignatureManager();
