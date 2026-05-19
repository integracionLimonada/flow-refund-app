require('dotenv').config();
const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');
const { getRefundStatus } = require('../services/flowRefundService');

async function run() {
  const argv = yargs(hideBin(process.argv)).option('token', {
    type: 'string',
    demandOption: true,
    describe: 'Token del reembolso entregado por Flow'
  }).argv;

  const host = process.env.FLOW_HOSTING || 'sandbox.flow.cl';
  const apiKey = process.env.FLOW_API_KEY;
  const secretKey = process.env.FLOW_SECRET_KEY;

  const resp = await getRefundStatus({ apiKey, token: argv.token }, secretKey, host);
  console.log(JSON.stringify(resp, null, 2));
}

run().catch(e => {
  const payload = e?.response?.data || e.message || e;
  console.error('✗ Error:', payload);
  process.exit(1);
});
