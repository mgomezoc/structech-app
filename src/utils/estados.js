// src/utils/estados.js

/**
 * Lista de las 32 entidades federativas de México,
 * con la clave oficial usada en la generación de la CURP.
 */
export const ESTADOS_MEXICO = [
  { clave: 'AS', nombre: 'Aguascalientes' },
  { clave: 'BC', nombre: 'Baja California' },
  { clave: 'BS', nombre: 'Baja California Sur' },
  { clave: 'CC', nombre: 'Campeche' },
  { clave: 'CS', nombre: 'Chiapas' },
  { clave: 'CH', nombre: 'Chihuahua' },
  { clave: 'CL', nombre: 'Coahuila' },
  { clave: 'CM', nombre: 'Colima' },
  { clave: 'DF', nombre: 'Ciudad de México' },
  { clave: 'DG', nombre: 'Durango' },
  { clave: 'GT', nombre: 'Guanajuato' },
  { clave: 'GR', nombre: 'Guerrero' },
  { clave: 'HG', nombre: 'Hidalgo' },
  { clave: 'JC', nombre: 'Jalisco' },
  { clave: 'MC', nombre: 'México' },
  { clave: 'MN', nombre: 'Michoacán' },
  { clave: 'MS', nombre: 'Morelos' },
  { clave: 'NT', nombre: 'Nayarit' },
  { clave: 'NL', nombre: 'Nuevo León' },
  { clave: 'OC', nombre: 'Oaxaca' },
  { clave: 'PL', nombre: 'Puebla' },
  { clave: 'QT', nombre: 'Querétaro' },
  { clave: 'QR', nombre: 'Quintana Roo' },
  { clave: 'SP', nombre: 'San Luis Potosí' },
  { clave: 'SL', nombre: 'Sinaloa' },
  { clave: 'SR', nombre: 'Sonora' },
  { clave: 'TC', nombre: 'Tabasco' },
  { clave: 'TS', nombre: 'Tamaulipas' },
  { clave: 'TL', nombre: 'Tlaxcala' },
  { clave: 'VZ', nombre: 'Veracruz' },
  { clave: 'YN', nombre: 'Yucatán' },
  { clave: 'ZS', nombre: 'Zacatecas' },
];

/**
 * Devuelve el nombre completo de un estado a partir de su clave.
 * @param {string} clave — Dos letras de la entidad federativa.
 * @returns {string|undefined} Nombre del estado, o undefined si no existe.
 */
export function getNombreEstado(clave) {
  const estado = ESTADOS_MEXICO.find(e => e.clave === clave);
  return estado?.nombre;
}
