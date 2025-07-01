// src/utils/curp.helper.js

/**
 * Normaliza cadenas: quita acentos, mayúsculas y borrar no-letras.
 */
function normalize(str) {
  return str
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z\s]/g, '')
    .trim();
}

/**
 * Obtiene la primera vocal interna (pos >0) o 'X'.
 */
function primeraVocalInterna(str) {
  for (let i = 1; i < str.length; i++) {
    if ('AEIOU'.includes(str[i])) return str[i];
  }
  return 'X';
}

/**
 * Obtiene la primera consonante interna (pos >0) o 'X'.
 */
function primeraConsonanteInterna(str) {
  for (let i = 1; i < str.length; i++) {
    if ('BCDFGHJKLMNPQRSTVWXYZ'.includes(str[i])) return str[i];
  }
  return 'X';
}

/**
 * Mapea género ('M'|'F') a CURP ('H' o 'M').
 */
function mapGenero(g) {
  return g === 'M' ? 'H' : g === 'F' ? 'M' : 'X';
}

/**
 * Valores numéricos para cada carácter CURP (0–9 y A–Z).
 */
const valorTabla = (() => {
  const table = {};
  '0123456789'.split('').forEach((d, i) => (table[d] = i));
  'ABCDEFGHIJKLMNÑOPQRSTUVWXYZ'.split('').forEach((c, i) => {
    table[c] = i + 10;
  });
  return table;
})();

/**
 * Calcula el dígito verificador (último carácter) para una CURP de 16 chars.
 * @param {string} curp16
 * @returns {string} dígito 0–9
 */
function calcularDigitoVerificador(curp16) {
  let suma = 0;
  for (let i = 0; i < 16; i++) {
    const valor = valorTabla[curp16[i]] ?? 0;
    suma += valor * (18 - i);
  }
  const resto = suma % 10;
  return ((10 - resto) % 10).toString();
}

/**
 * Genera la CURP completa de 18 caracteres.
 */
export function generateCurp({
  nombre,
  apellidoPaterno,
  apellidoMaterno = '',
  fechaNacimiento, // YYYY-MM-DD
  genero, // 'M' | 'F'
  estadoClave, // e.g. 'NL'
}) {
  const ap = normalize(apellidoPaterno);
  const am = normalize(apellidoMaterno) || 'X';
  const nm = normalize(nombre);

  // elegir segundo nombre si el primero es común
  const primeros = nm.split(/\s+/);
  let nombrePara = primeros[0];
  const excepciones = ['JOSE', 'JOSÉ', 'MARIA', 'MARÍA'];
  if (excepciones.includes(nombrePara) && primeros.length > 1) {
    nombrePara = primeros[1];
  }

  // 1–4 letras iniciales
  const l1 = ap[0] || 'X';
  const l2 = primeraVocalInterna(ap);
  const l3 = am[0] || 'X';
  const l4 = nombrePara[0] || 'X';

  // YYMMDD
  const [yyyy, mm, dd] = fechaNacimiento.split('-');
  const yy = yyyy.slice(-2);
  const m2 = mm.padStart(2, '0');
  const d2 = dd.padStart(2, '0');

  // H / M
  const g1 = mapGenero(genero);

  // estado
  const est = estadoClave.toUpperCase();

  // consonantes internas
  const c1 = primeraConsonanteInterna(ap);
  const c2 = primeraConsonanteInterna(am);
  const c3 = primeraConsonanteInterna(nombrePara);

  // CURP 16 primeros
  const curp16 = [l1, l2, l3, l4, yy, m2, d2, g1, est, c1, c2, c3].join('');

  // Homoclave pos 17: '0' para nacidos <2000, o 'A'…'Z' si >=2000
  const homoclave1 = Number(yyyy) < 2000 ? '0' : 'A';

  // Dígito verificador
  const homoclave2 = calcularDigitoVerificador(curp16 + homoclave1);

  return curp16 + homoclave1 + homoclave2;
}
