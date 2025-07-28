// 1. NUEVO SERVICIO: addressService.js
// src/services/address.service.js
// Servicio especializado para manejo de direcciones y códigos postales

class AddressService {
  /**
   * Extrae código postal de una dirección usando múltiples estrategias
   * Prioriza patrones mexicanos comunes
   */
  extractPostalCode(address) {
    if (!address || typeof address !== 'string') return null;

    const cleanAddress = address.trim().toUpperCase();

    // Estrategia 1: Código postal al final (más común en INE)
    // Ejemplos: "CALLE MORELOS 426, SANTA CATARINA 66350"
    const endPattern = /\b(\d{5})\s*$/;
    const endMatch = cleanAddress.match(endPattern);
    if (endMatch) return endMatch[1];

    // Estrategia 2: CP seguido de ciudad/estado
    // Ejemplos: "MORELOS 426, 66350 SANTA CATARINA"
    const beforeLocationPattern = /\b(\d{5})\s+[A-Z\s]+$/;
    const beforeMatch = cleanAddress.match(beforeLocationPattern);
    if (beforeMatch) return beforeMatch[1];

    // Estrategia 3: CP en cualquier posición (respaldo)
    const anywherePattern = /\b(\d{5})\b/;
    const anyMatch = cleanAddress.match(anywherePattern);
    if (anyMatch) return anyMatch[1];

    return null;
  }

  /**
   * Encuentra la mejor coincidencia de colonia basada en similitud de texto
   * Usa algoritmo de Levenshtein simplificado para performance
   */
  findBestNeighborhoodMatch(address, neighborhoods) {
    if (!address || !Array.isArray(neighborhoods) || neighborhoods.length === 0) {
      return null;
    }

    const cleanAddress = this.normalizeText(address);
    let bestMatch = null;
    let bestScore = 0;

    for (const neighborhood of neighborhoods) {
      const cleanNeighborhood = this.normalizeText(neighborhood.vcNeighborhood);

      // Scoring múltiple para mejor precisión
      let score = 0;

      // 1. Coincidencia exacta (peso alto)
      if (cleanAddress.includes(cleanNeighborhood)) {
        score += 100;
      }

      // 2. Palabras en común (peso medio)
      const addressWords = cleanAddress.split(/\s+/);
      const neighborhoodWords = cleanNeighborhood.split(/\s+/);
      const commonWords = addressWords.filter(
        word => word.length > 2 && neighborhoodWords.some(nWord => nWord.includes(word)),
      );
      score += commonWords.length * 20;

      // 3. Similitud por caracteres (peso bajo, pero útil)
      score += this.calculateSimilarity(cleanAddress, cleanNeighborhood) * 10;

      if (score > bestScore) {
        bestScore = score;
        bestMatch = neighborhood;
      }
    }

    // Solo retornar si hay confianza mínima (score > 15)
    return bestScore > 15 ? bestMatch : neighborhoods[0]; // Fallback al primero
  }

  /**
   * Normaliza texto para comparación (quita acentos, espacios extra, etc.)
   */
  normalizeText(text) {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Quita acentos
      .replace(/[^\w\s]/g, ' ') // Quita puntuación
      .replace(/\s+/g, ' ') // Espacios múltiples a uno
      .trim();
  }

  /**
   * Calcula similitud entre dos strings (0-1)
   * Versión optimizada para performance en mobile
   */
  calculateSimilarity(str1, str2) {
    const len1 = str1.length;
    const len2 = str2.length;

    if (len1 === 0) return len2 === 0 ? 1 : 0;
    if (len2 === 0) return 0;

    // Para strings largos, usar sampling para performance
    if (len1 > 50 || len2 > 50) {
      str1 = str1.substring(0, 50);
      str2 = str2.substring(0, 50);
    }

    let matches = 0;
    const shorter = Math.min(str1.length, str2.length);

    for (let i = 0; i < shorter; i++) {
      if (str1[i] === str2[i]) matches++;
    }

    return matches / Math.max(str1.length, str2.length);
  }
}

// Exportar instancia única
export const addressService = new AddressService();
