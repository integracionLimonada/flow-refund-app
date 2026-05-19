const crypto = require('crypto');

/**
 * Firma HMAC-SHA256 según ejemplos oficiales de Postman:
 * 1) tomar todos los parámetros excepto 's'
 * 2) ordenar por nombre de parámetro ascendente
 * 3) concatenar key + value (sin separadores) en un string
 * 4) HMAC-SHA256 sobre ese string usando secretKey
 */
function signParams(params, secretKey) {
  const entries = Object.entries(params).filter(([k, v]) => k !== 's' && v !== undefined && v !== null);
  entries.sort(([a], [b]) => a.localeCompare(b));

  let textToSign = '';
  for (const [k, v] of entries) {
    textToSign += String(k) + String(v);
  }
  return crypto.createHmac('sha256', secretKey).update(textToSign).digest('hex');
}

module.exports = { signParams };
