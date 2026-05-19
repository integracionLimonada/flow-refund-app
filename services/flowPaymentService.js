const axios = require('axios');
const qs = require('qs');
const { signParams } = require('../utils/signature');

async function createPayment(params, secretKey, host = 'sandbox.flow.cl') {
  const payload = Object.fromEntries(Object.entries(params).filter(([_, v]) => v !== undefined && v !== null && v !== ''));
  payload.s = signParams(payload, secretKey);
  const url = `https://${host}/api/payment/create`;
  const resp = await axios.post(url, qs.stringify(payload), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  });
  return resp.data; // { token, url, flowOrder }
}

async function getPaymentStatus(params, secretKey, host = 'sandbox.flow.cl') {
  const query = Object.fromEntries(Object.entries(params).filter(([_, v]) => v !== undefined && v !== null && v !== ''));
  query.s = signParams(query, secretKey);
  const url = `https://${host}/api/payment/getStatus`;
  const resp = await axios.get(url, { params: query });
  return resp.data;
}

module.exports = { createPayment, getPaymentStatus };
