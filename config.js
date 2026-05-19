require('dotenv').config();

module.exports = {
  flow: {
    host: process.env.FLOW_HOSTING || 'sandbox.flow.cl',
    apiKey: process.env.FLOW_API_KEY,
    secretKey: process.env.FLOW_SECRET_KEY,
    urlConfirmation: process.env.URL_CONFIRMATION || 'https://example.com/flow/payment/confirmation',
    urlReturn: process.env.URL_RETURN || 'https://example.com/flow/payment/return',
    refundCallback: process.env.REFUND_CALLBACK_URL || 'http://localhost:3000/flow/refund/callback',
  },
  sql: {
    server: process.env.SQL_SERVER || '192.168.1.31',
    database: process.env.SQL_DATABASE || 'Shopify',
    user: process.env.SQL_USER || 'sa',
    password: process.env.SQL_PASSWORD || 'Master',
    options: {
      encrypt: (process.env.SQL_ENCRYPT || 'false').toLowerCase() === 'true',
      trustServerCertificate: true
    },
    pool: { max: 5, min: 1, idleTimeoutMillis: 30000 }
  }
};
