require('dotenv').config();
const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');
const { flow } = require('../config');
const { getDevolucion, ensureTables, insertRefundRow } = require('../repos/repos');
const { createRefund } = require('../services/flowRefundService');
const { getPaymentStatus } = require('../services/flowPaymentService');

async function main() {
  const argv = yargs(hideBin(process.argv)).options({
    devolucionId: { type: 'number', demandOption: true, describe: 'ID de NC_DEVOLUCION_CAB (ej: 1736)' },
    use: { type: 'string', default: 'commerceOrder', choices: ['flowOrder', 'commerceOrder'], describe: 'Identificador para refund' },
    amount: { type: 'number', describe: 'Monto a reembolsar (por defecto, desde la devolución)' },
    email: { type: 'string', describe: 'Email receptor (por defecto, MAIL cabecera)' },
    token: { type: 'string', describe: 'Opcional: token del pago para reconfirmar status=2 antes de reembolsar' }
  }).argv;

  await ensureTables();

  const dev = await getDevolucion(argv.devolucionId);
  if (!dev) throw new Error('Devolución no encontrada');
  const { cab, det } = dev;

  const calcAmount = det.reduce((acc, d) => acc + (Number(d.DEVOLUCION) || 0) * (Number(d.CANTIDAD) || 1), 0);
  const amount = argv.amount != null ? argv.amount : calcAmount;
  const receiverEmail = argv.email || cab.MAIL;

  if (argv.token) {
    const p = await getPaymentStatus({ apiKey: flow.apiKey, token: argv.token }, flow.secretKey, flow.host);
    if (Number(p.status) !== 2) throw new Error(`El pago aún no está pagado (status=${p.status}).`);
  }

  const commerceTrxId = String(cab.ID_DEVOLUCION || cab.ID || cab.ORDER_ID);
  const refundCommerceOrder = `RFD-${Date.now()}-${argv.devolucionId}`;

  const payload = {
    apiKey: flow.apiKey,
    refundCommerceOrder,
    receiverEmail,
    amount,
    urlCallBack: flow.refundCallback
  };

  if (argv.use === 'flowOrder' && cab.ID_MEDIO_PAGO && !isNaN(Number(cab.ID_MEDIO_PAGO))) {
    payload.flowTrxId = Number(cab.ID_MEDIO_PAGO);
  } else {
    payload.commerceTrxId = commerceTrxId;
  }

  console.log('→ Creando refund con', payload);
  const resp = await createRefund(payload, flow.secretKey, flow.host);
  console.log('✓ refund/create =>', resp);

  await insertRefundRow(cab.ID, cab.ORDER_ID, refundCommerceOrder, resp.token, resp.flowRefundOrder, resp.status || 'created', amount, receiverEmail);
  console.log('✓ Registrado en Shopify..FLOW_REFUNDS');
}

main().catch(err => {
  console.error('✗ Error:', err?.response?.data || err?.message || err);
  process.exit(1);
});
