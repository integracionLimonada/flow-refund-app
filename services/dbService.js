// services/dbService.js
const sql = require('mssql');

// 🔧 Conexión principal: Shopify / CDMLimonada
const sqlConfig = {
  user: 'sa',
  password: 'Master.,',
  database: 'Shopify',
  server: '192.168.1.31',
  options: { encrypt: false, trustServerCertificate: true },
  pool: { max: 10, min: 0, idleTimeoutMillis: 30000 }
};

// 🔸 Conexión a REPORTESAP (servidor SAP)
const sapConfig = {
  user: 'sa',
  password: 'SAPB1Admin',
  database: 'REPORTESAP',
  server: '192.168.1.11',
  options: {
    encrypt: false,
    trustServerCertificate: true
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000
  }
};

/**
 * Obtiene (o crea) el pool de conexión hacia Shopify/CDMLimonada.
 * Antes de conectar, se cierra cualquier pool global que estuviera abierto
 * (por ejemplo, el que venía de REPORTESAP en sapDbService).
 */
async function getPool() {
  // 🔥 Cerrar conexión previa global (sea SAP o Shopify)
  if (sql.pool && sql.pool.connected) {
    await sql.pool.close();
    sql.pool = null;
  }

  sapPool = await sql.close(sqlConfig);
  const pool = await sql.connect(sqlConfig);
  sql.pool = pool;
  return pool;
}

async function getPoolSAP() {
  // 🔥 Cerrar conexión previa global (sea SAP o Shopify)
  if (sql.pool && sql.pool.connected) {
    await sql.pool.close();
    sql.pool = null;
  }

  const pool = await sql.connect(sapConfig);
  sql.pool = pool;
  return pool;
}

async function getDevolucionByCabId(cabId) {
  const pool = await getPool();

  const cab = await pool.request()
    .input('ID', sql.Int, cabId)
    .query(`
      SELECT TOP 1 *
      FROM NC_DEVOLUCION_CAB
      WHERE ID = @ID
    `);

  const det = await pool.request()
    .input('ID', sql.Int, cabId)
    .query(`
      SELECT *
      FROM NC_DEVOLUCION_DET
      WHERE ID_CABECERA = @ID
    `);

  return { cab: cab.recordset[0] || null, det: det.recordset || [] };
}

/**
 * TOP 1 devolución “pendiente” para procesar.
 * Ajusta el criterio ESTADO/MEDIO_PAGO según tu caso real.
 */
async function getDevolucionPendiente() {
  const pool = await getPool();

  const cabQ = await pool.request().query(`
    SELECT NCC.*
    FROM NC_DEVOLUCION_CAB NCC
    LEFT JOIN CDMLimonada..RT_INFO_REEMBOLSO INFO 
      ON INFO.ORDER_ID = NCC.ORDER_ID
    LEFT JOIN CDMLIMONADA.dbo.RT_STATUS_REEMBOLSO_AREA RSA
      ON RSA.ID_STATUS = INFO.ID_STATUS_TESO
    WHERE INFO.ID_STATUS_TESO = 4
      AND RSA.AREA = 'TESORERIA'
      --AND NCC.NC IS NOT NULL
      AND (
        NCC.MEDIO_PAGO LIKE '%Flow%'
        AND NCC.ID_MEDIO_PAGO IS NOT NULL
        --AND NCC.NC IS NOT NULL
      )
    ORDER BY NCC.FECHA_CREACION DESC;
  `);

  const cab = cabQ.recordset[0];
  if (!cab) return { cab: null, det: [] };

  const detQ = await pool.request()
    .input('CHECKOUT_ID', sql.VarChar(200), cab.CHECKOUT_ID)
    .query(`
      SELECT SKU, DEVOLUCION, SHIPPING_AMOUNT, CANTIDAD, PRECIO_BRUTO
      FROM NC_DEVOLUCION_DET 
      WHERE CHECKOUT_ID = @CHECKOUT_ID;
    `);

  return { cab, det: detQ.recordset || [] };
}

/**
 * Obtiene todas las devoluciones pendientes para Flow.
 * Mantiene el mismo criterio que getDevolucionPendiente pero sin TOP 1.
 */
async function getDevolucionesPendientesFlow() {
  const pool = await getPool();

  const cabQ = await pool.request().query(`
    SELECT NCC.*
    FROM NC_DEVOLUCION_CAB NCC
    LEFT JOIN CDMLimonada..RT_INFO_REEMBOLSO INFO
      ON INFO.ORDER_ID = NCC.ORDER_ID
    LEFT JOIN CDMLIMONADA.dbo.RT_STATUS_REEMBOLSO_AREA RSA
      ON RSA.ID_STATUS = INFO.ID_STATUS_TESO
    WHERE INFO.ID_STATUS_TESO = 4
      AND RSA.AREA = 'TESORERIA'
      AND (
        NCC.MEDIO_PAGO LIKE '%Flow%'
        AND NCC.ID_MEDIO_PAGO IS NOT NULL
      )
    ORDER BY NCC.FECHA_CREACION DESC;
  `);

  return cabQ.recordset || [];
}

async function upReembolsoCreadoFlow(orderId, token) {
  if (!orderId) {
    throw new Error('upReembolsoCreadoFlow: orderId vacío');
  }

  const pool = await getPool();
  const transaction = new sql.Transaction(pool);

  try {
    await transaction.begin();

    const request = new sql.Request(transaction);

    request
      .input('ORDER_ID', sql.VarChar(100), orderId)
      .input('TOKEN', sql.VarChar(200), token);

    await request.query(`
      UPDATE CDMLimonada..RT_INFO_REEMBOLSO
      SET ID_STATUS_TESO    = 6, -- Tesorería: Reembolso Creado
          ID_STATUS_SAC     = 6, -- SAC: Reembolso Creado
          REFUND_TOKEN_FLOW = @TOKEN,
          NOTA              = 'Pendiente de aprobación cliente.'
      WHERE ORDER_ID = @ORDER_ID;
    `);

    await request.query(`
      UPDATE Shopify..NC_DEVOLUCION_CAB
      SET REEMBOLSO_REALIZADO = 1
      WHERE ORDER_ID = @ORDER_ID;
    `);

    await transaction.commit();

  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

async function getReembolsosCreadosFlow() {
  const pool = await getPool();

  const res = await pool.request().query(`
    SELECT ORDER_ID, REFUND_TOKEN_FLOW
    FROM CDMLimonada..RT_INFO_REEMBOLSO
    WHERE ID_STATUS_TESO = 6;
  `);

  return res.recordset || [];
}

async function upReembolsoDevueltoFlow(orderId) {
  const pool = await getPool();

  await pool.request()
    .input('ORDER_ID', sql.VarChar(100), orderId)
    .query(`
      UPDATE CDMLimonada..RT_INFO_REEMBOLSO
      SET ID_STATUS_TESO = 3,  -- TESORERIA: Dinero Devuelto
          ID_STATUS_SAC  = 3,  -- SAC: Dinero Devuelto
          NOTA           = 'Reembolso aprobado por cliente.'
      WHERE ORDER_ID = @ORDER_ID;
    `);
}

async function getNotasCreditoPagadasFlow() {
  const pool = await getPool();

  const res = await pool.request().query(`
    SELECT NCC.*
    FROM NC_DEVOLUCION_CAB NCC
    LEFT JOIN CDMLimonada..RT_INFO_REEMBOLSO INFO 
      ON INFO.ORDER_ID = NCC.ORDER_ID
    LEFT JOIN CDMLIMONADA.dbo.RT_STATUS_REEMBOLSO_AREA RSA
      ON RSA.ID_STATUS = INFO.ID_STATUS_TESO
    LEFT JOIN [SAP].[REPORTESAP].[dbo].[MarketingDocument_SAP_CAB] SAP
      ON SAP.FolioNum = NCC.NC
    LEFT JOIN [SAP].[REPORTESAP].[dbo].[IncomingVendorPayment_CAB] SAP2
      ON SAP2.RefDocument = SAP.DocEntry    -- relación DocEntry ↔ RefDocument
    WHERE INFO.ID_STATUS_TESO = 3           -- TESORERIA: Dinero Devuelto
      AND RSA.AREA = 'TESORERIA'
      AND NCC.NC IS NOT NULL
      AND NCC.ID_MEDIO_PAGO IS NOT NULL
      -- Solo las NC cuyo pago NO está procesado en IncomingVendorPayment_CAB
      AND (SAP2.ProccessSap IS NULL OR SAP2.ProccessSap <> 1)
      -- AND NCC.ORDER_ID = 1741683
    ORDER BY NCC.FECHA_CREACION DESC;
  `);

  return res.recordset || [];
}

module.exports = {
  getNotasCreditoPagadasFlow,
  getDevolucionByCabId,
  getDevolucionPendiente,
  getDevolucionesPendientesFlow,
  upReembolsoCreadoFlow,
  getReembolsosCreadosFlow,
  upReembolsoDevueltoFlow,
  getPool,
  getPoolSAP
};
