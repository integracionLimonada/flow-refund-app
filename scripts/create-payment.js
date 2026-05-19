require('dotenv').config();
const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');
const { flow } = require('../config');
const { getDevolucion, ensureTables } = require('../repos/repos');
const { createPayment } = require('../services/flowPaymentService');

async function main() {
  const argv = yargs(hideBin(process.argv)).option('id', {
    alias: 'devolucionId',
    type: 'number',
    demandOption: true,
    describe: 'ID de NC_DEVOLUCION_CAB a procesar (ej: 1736)'
  }).argv;

  await ensureTables();

  const row = await getDevolucion(argv.id);
  if (!row) throw new Error('No existe la devolución solicitada');
  const { cab, det } = row;

  const amount = det.reduce((acc, d) => acc + (Number(d.DEVOLUCION) || 0) * (Number(d.CANTIDAD) || 1), 0);
  const commerceOrder = String(cab.ID_DEVOLUCION || cab.ID || cab.ORDER_ID);
  const payload = {
    apiKey: flow.apiKey,
    subject: `Devolución Limonada #${commerceOrder}`,
    currency: 'CLP',
    amount,
    email: cab.MAIL,
    commerceOrder,
    urlConfirmation: flow.urlConfirmation,
    urlReturn: flow.urlReturn
  };

  console.log('→ Creando pago en Flow con:', { commerceOrder, amount, email: cab.MAIL });
  const resp = await createPayment(payload, flow.secretKey, flow.host);
  console.log('✓ payment/create =>', resp);
  console.log('Abre la URL y paga manualmente con Webpay sandbox.');
}

main().catch(err => {
  console.error('✗ Error:', err?.response?.data || err?.message || err);
  process.exit(1);
});
