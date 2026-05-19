// services/flowRefundService.js
const crypto = require('crypto');
const axios  = require('axios');

function buildBaseUrl(host) {
  return `https://${host.replace(/^https?:\/\//, '').replace(/\/$/, '')}/api`;
}

/**
 * Firma Flow: ordenar keys asc y concatenar key+value (sin '=' ni '&').
 * Luego HMAC-SHA256 en hex minúscula.
 */
function signFlow(params, secret) {
  const keys = Object.keys(params).sort();
  const toSign = keys.map(k => `${k}${params[k]}`).join('');
  const s = crypto.createHmac('sha256', secret).update(toSign).digest('hex');
  return { s, toSign };
}

/** GET con firma */
async function getWithSign(host, path, params, secret) {
  const { s } = signFlow(params, secret);
  const qs = new URLSearchParams({ ...params, s }).toString();
  const url = `${buildBaseUrl(host)}${path}?${qs}`;
  const { data } = await axios.get(url, { timeout: 15000 });
  return data;
}

/** POST x-www-form-urlencoded con firma */
async function postFormWithSign(host, path, bodyParams, secret) {
  const { s } = signFlow(bodyParams, secret);
  const body = new URLSearchParams({ ...bodyParams, s }).toString();
  const url = `${buildBaseUrl(host)}${path}`;
  const { data } = await axios.post(url, body, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    timeout: 15000
  });
  return data;
}

/* ===================== PAYMENT ===================== */

/** payment/getStatusByCommerceId — usa commerceId = ID_MEDIO_PAGO */
async function getPaymentStatusByCommerceId({ apiKey, commerceId }, secret, host) {
  const params = { apiKey, commerceId: String(commerceId) };
  return await getWithSign(host, '/payment/getStatusByCommerceId', params, secret);
}

// (Opcionales si los usas en otros flujos)
async function getPaymentStatusByToken({ apiKey, token }, secret, host) {
  const params = { apiKey, token };
  return await getWithSign(host, '/payment/getStatus', params, secret);
}
async function getPaymentStatusByFlowOrder({ apiKey, flowOrder }, secret, host) {
  const params = { apiKey, flowOrder: String(flowOrder) };
  return await getWithSign(host, '/payment/getStatusByFlowOrder', params, secret);
}

/* ===================== REFUND ===================== */

/** refund/create */
async function createRefund({ apiKey, refundCommerceOrder, receiverEmail, amount, urlCallBack, commerceTrxId, flowTrxId }, secret, host) {
  if (!apiKey || !refundCommerceOrder || !receiverEmail || !amount || !urlCallBack) {
    throw new Error('Datos incompletos para refund/create');
  }
  const payload = {
    apiKey,
    refundCommerceOrder,
    receiverEmail,
    amount: String(Math.trunc(Number(amount))),
    urlCallBack
  };
  if (commerceTrxId) payload.commerceTrxId = String(commerceTrxId);
  if (flowTrxId)     payload.flowTrxId     = String(flowTrxId);

  return await postFormWithSign(host, '/refund/create', payload, secret);
}

/** refund/getStatus (por token del callback) */
async function getRefundStatus({ apiKey, token }, secret, host) {
  const params = { apiKey, token };
  return await getWithSign(host, '/refund/getStatus', params, secret);
}

module.exports = {
  // payment
  getPaymentStatusByCommerceId,
  getPaymentStatusByToken,
  getPaymentStatusByFlowOrder,
  // refund
  createRefund,
  getRefundStatus
};
