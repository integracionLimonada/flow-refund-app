require('dotenv').config();
const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');
const { flow } = require('../config');
const { getPaymentStatus } = require('../services/flowPaymentService');
const { insertPaymentFromStatus, getDevolucion, ensureTables } = require('../repos/repos');

async function main() {
  const argv = yargs(hideBin(process.argv)).options({
    token: { type: 'string', demandOption: true, describe: 'Token del pago (payment token)' },
    devolucionId: { type: 'number', describe: 'ID de devolución para asociar (ej: 1736)' }
  }).argv;

  await ensureTables();

  const status = await getPaymentStatus({ apiKey: flow.apiKey, token: argv.token }, flow.secretKey, flow.host);
  console.log('✓ payment/getStatus =>', status);

  let dev = null;
  if (argv.devolucionId) dev = await getDevolucion(argv.devolucionId);

  await insertPaymentFromStatus(dev?.cab?.ID || null, dev?.cab?.ORDER_ID || null, status.commerceOrder, argv.token, status);
  console.log('✓ Registrado en Shopify..FLOW_PAYMENTS');
}

main().catch(err => {
  console.error('✗ Error:', err?.response?.data || err?.message || err);
  process.exit(1);
});
