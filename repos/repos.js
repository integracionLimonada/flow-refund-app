const { getPool, sql } = require('../db/sqlserver');

async function getDevolucion(idCabecera) {
  const pool = await getPool();
  const cab = await pool.request()
    .input('id', sql.Int, idCabecera)
    .query(`SELECT TOP 1 * FROM Shopify..NC_DEVOLUCION_CAB WHERE ID = @id`);
  const det = await pool.request()
    .input('id', sql.Int, idCabecera)
    .query(`SELECT * FROM Shopify..NC_DEVOLUCION_DET WHERE ID_CABECERA = @id`);

  if (cab.recordset.length === 0) return null;
  return { cab: cab.recordset[0], det: det.recordset };
}

async function ensureTables() {
  const pool = await getPool();
  await pool.request().batch(`
IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE name = 'FLOW_PAYMENTS' AND type = 'U')
BEGIN
  CREATE TABLE Shopify..FLOW_PAYMENTS (
    ID INT IDENTITY(1,1) PRIMARY KEY,
    DEV_ID INT NULL,
    ORDER_ID INT NULL,
    COMMERCE_ORDER VARCHAR(100) NOT NULL,
    FLOW_ORDER INT NULL,
    TOKEN VARCHAR(100) NOT NULL,
    STATUS INT NULL,
    SUBJECT NVARCHAR(200) NULL,
    CURRENCY VARCHAR(10) NULL,
    AMOUNT DECIMAL(18,2) NULL,
    EMAIL NVARCHAR(255) NULL,
    REQUEST_DATE DATETIME NULL,
    PAYMENT_DATE DATETIME NULL,
    MEDIA NVARCHAR(50) NULL,
    FEE DECIMAL(18,2) NULL,
    BALANCE INT NULL,
    TRANSFER_DATE DATETIME NULL,
    TAXES DECIMAL(18,2) NULL,
    CREATED_AT DATETIME DEFAULT GETDATE(),
    UPDATED_AT DATETIME NULL
  );
END

IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE name = 'FLOW_REFUNDS' AND type = 'U')
BEGIN
  CREATE TABLE Shopify..FLOW_REFUNDS (
    ID INT IDENTITY(1,1) PRIMARY KEY,
    DEV_ID INT NULL,
    ORDER_ID INT NULL,
    REFUND_COMMERCE_ORDER VARCHAR(100) NOT NULL,
    TOKEN VARCHAR(100) NULL,
    FLOW_REFUND_ORDER INT NULL,
    STATUS NVARCHAR(50) NULL,
    AMOUNT DECIMAL(18,2) NULL,
    RECEIVER_EMAIL NVARCHAR(255) NULL,
    CREATED_AT DATETIME DEFAULT GETDATE(),
    UPDATED_AT DATETIME NULL
  );
END
`);
}

async function insertPaymentFromStatus(devId, orderId, commerceOrder, token, statusObj) {
  const pool = await getPool();
  const p = statusObj || {};
  await pool.request()
    .input('dev', sql.Int, devId || null)
    .input('ord', sql.Int, orderId || null)
    .input('co', sql.VarChar(100), commerceOrder)
    .input('fo', sql.Int, p.flowOrder || null)
    .input('tk', sql.VarChar(100), token)
    .input('st', sql.Int, p.status || null)
    .input('sub', sql.NVarChar(200), p.subject || null)
    .input('cur', sql.VarChar(10), p.currency || null)
    .input('amt', sql.Decimal(18,2), p.amount ? Number(p.amount) : null)
    .input('em', sql.NVarChar(255), p.payer || null)
    .input('req', sql.DateTime, p.requestDate ? new Date(p.requestDate) : null)
    .input('pdate', sql.DateTime, p.paymentData?.date ? new Date(p.paymentData.date) : null)
    .input('media', sql.NVarChar(50), p.paymentData?.media || null)
    .input('fee', sql.Decimal(18,2), p.paymentData?.fee ? Number(p.paymentData.fee) : null)
    .input('bal', sql.Int, p.paymentData?.balance ?? null)
    .input('tdate', sql.DateTime, p.paymentData?.transferDate ? new Date(p.paymentData.transferDate) : null)
    .input('tax', sql.Decimal(18,2), p.paymentData?.taxes ? Number(p.paymentData.taxes) : null)
    .query(`
      INSERT INTO Shopify..FLOW_PAYMENTS
      (DEV_ID, ORDER_ID, COMMERCE_ORDER, FLOW_ORDER, TOKEN, STATUS, SUBJECT, CURRENCY, AMOUNT, EMAIL, REQUEST_DATE, PAYMENT_DATE, MEDIA, FEE, BALANCE, TRANSFER_DATE, TAXES, UPDATED_AT)
      VALUES (@dev, @ord, @co, @fo, @tk, @st, @sub, @cur, @amt, @em, @req, @pdate, @media, @fee, @bal, @tdate, @tax, GETDATE());
    `);
}

async function insertRefundRow(devId, orderId, refundCommerceOrder, token, flowRefundOrder, status, amount, receiverEmail) {
  const pool = await getPool();
  await pool.request()
    .input('dev', sql.Int, devId || null)
    .input('ord', sql.Int, orderId || null)
    .input('rco', sql.VarChar(100), refundCommerceOrder)
    .input('tk', sql.VarChar(100), token || null)
    .input('fro', sql.Int, flowRefundOrder || null)
    .input('st', sql.NVarChar(50), status || null)
    .input('amt', sql.Decimal(18,2), amount != null ? Number(amount) : null)
    .input('em', sql.NVarChar(255), receiverEmail || null)
    .query(`
      INSERT INTO Shopify..FLOW_REFUNDS
      (DEV_ID, ORDER_ID, REFUND_COMMERCE_ORDER, TOKEN, FLOW_REFUND_ORDER, STATUS, AMOUNT, RECEIVER_EMAIL, UPDATED_AT)
      VALUES (@dev, @ord, @rco, @tk, @fro, @st, @amt, @em, GETDATE());
    `);
}

module.exports = {
  getDevolucion,
  ensureTables,
  insertPaymentFromStatus,
  insertRefundRow
};
