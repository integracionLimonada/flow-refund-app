require('dotenv').config();
const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');
const { flow } = require('../config');
const { getRefundStatus } = require('../services/flowRefundService');

async function main() {
  const argv = yargs(hideBin(process.argv)).option('token', {
    type: 'string',
    demandOption: true
  }).argv;

  const status = await getRefundStatus({ apiKey: flow.apiKey, token: argv.token }, flow.secretKey, flow.host);
  console.log('✓ refund/getStatus =>', status);
}

main().catch(err => {
  console.error('✗ Error:', err?.response?.data || err?.message || err);
  process.exit(1);
});
