// services/sapDbService.js
const sql = require('mssql');

// 🔧 Conexión a REPORTESAP (servidor SAP)
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

let sapPool;

const sqlConfig = {
    user: 'sa',
    password: 'Master.,',
    database: 'Shopify',
    server: '192.168.1.31',
    options: {
        encrypt: false, trustServerCertificate: true 
    },
    pool: { 
        max: 10, 
        min: 0, 
        idleTimeoutMillis: 30000 
    }
};

let pool;

/**
 * Obtiene (o crea) el pool de conexión hacia REPORTESAP.
 */
async function getSapPool() {
    if (sapPool && sapPool.connected) return sapPool;
    pool = await sql.close(sqlConfig);
    sapPool = await sql.connect(sapConfig);
    return sapPool;
}

/**
 * Busca el DocEntry de la boleta/factura en MarketingDocument_SAP_CAB
 * usando el folio que está en U_Fae_FolioRef.
 *
 * folioRef = número de boleta que tengas en NC_DEVOLUCION_CAB (ajústalo en app.js)
 */
async function getDocEntryByFolioRef(folioRef) {
    if (!folioRef) return null;

    const pool = await getSapPool();

    const res = await pool.request()
        .input('FOLIO', sql.NVarChar(50), folioRef)
        .query(`
        SELECT TOP 1 DocEntry
        FROM REPORTESAP..MarketingDocument_SAP_CAB
        WHERE U_Fae_FolioRef = @FOLIO
        ORDER BY DocEntry DESC;
    `);

    return res.recordset[0]?.DocEntry || null;
}

/**
 * Verifica si ya existe un pago para el mismo documento en IncomingVendorPayment_CAB
 * Criterio:
 *   - Mismo RefDocument (DocEntry)
 *   - Mismo RefTypeDocument
 *   - Mismo CardCode
 */
async function existsIncomingVendorPayment({ RefDocument, RefTypeDocument, CardCode }) {
    if (!RefDocument || !RefTypeDocument || !CardCode) return false;

    const pool = await getSapPool();

    const res = await pool.request()
        .input('RefDocument', sql.Int, RefDocument)
        .input('RefTypeDocument', sql.Int, RefTypeDocument)
        .input('CardCode', sql.NVarChar(50), CardCode)
        .query(`
        SELECT TOP 1 ID
        FROM REPORTESAP..IncomingVendorPayment_CAB
        WHERE RefDocument     = @RefDocument
        AND RefTypeDocument = @RefTypeDocument
        AND CardCode        = @CardCode;
    `);

    return res.recordset.length > 0;
}

/**
 * Inserta un pago en REPORTESAP..IncomingVendorPayment_CAB,
 * SI Y SOLO SI no existe ya un pago para el mismo DocEntry.
 */
async function insertIncomingVendorPayment(data) {
    const pool = await getSapPool();

    const {
        DocDate,
        CardCode,
        DocDueDate,
        TaxDate,
        DocType,
        CounterRef,
        CashSum,
        CashAcct,
        TrsfrSum,
        TrsfrAcct,
        TrsfrDate,
        JrnlMemo,
        RefDocument,
        RefTypeDocument,
        Series,
        LineNum,
        ProccessSap
    } = data;

    // 1) Verificar duplicados antes de insertar
    const yaExiste = await existsIncomingVendorPayment({
        RefDocument,
        RefTypeDocument,
        CardCode
    });

    if (yaExiste) {
        console.warn(
            `⚠ Pago ya existe en IncomingVendorPayment_CAB ` +
            `(RefDocument=${RefDocument}, RefTypeDocument=${RefTypeDocument}, CardCode=${CardCode}). Se omite inserción.`
        );
        return { inserted: false, duplicate: true };
    }

    // 2) Insertar el pago si no existe
    await pool.request()
        .input('DocDate', sql.DateTime, DocDate)
        .input('CardCode', sql.NVarChar(50), CardCode)
        .input('DocDueDate', sql.DateTime, DocDueDate)
        .input('TaxDate', sql.DateTime, TaxDate)
        .input('DocType', sql.NVarChar(1), DocType)
        .input('CounterRef', sql.NVarChar(50), CounterRef)
        .input('CashSum', sql.Numeric(19, 3), CashSum)
        .input('CashAcct', sql.NVarChar(50), CashAcct)
        .input('TrsfrSum', sql.Numeric(19, 3), TrsfrSum)
        .input('TrsfrAcct', sql.NVarChar(50), TrsfrAcct)
        .input('TrsfrDate', sql.DateTime, TrsfrDate)
        .input('JrnlMemo', sql.NVarChar(100), JrnlMemo)
        .input('RefDocument', sql.Int, RefDocument)
        .input('RefTypeDocument', sql.Int, RefTypeDocument)
        .input('Series', sql.Int, Series)
        .input('LineNum', sql.Int, LineNum)
        .input('ProccessSap', sql.Int, ProccessSap)
        .query(`
        INSERT INTO REPORTESAP..IncomingVendorPayment_CAB
        (
        DocDate, CardCode, DocDueDate, TaxDate, DocType, CounterRef,
        CashSum, CashAcct,
        TrsfrSum, TrsfrAcct, TrsfrDate,
        JrnlMemo, RefDocument, RefTypeDocument, Series, LineNum, ProccessSap
        )
        VALUES
        (
        @DocDate, @CardCode, @DocDueDate, @TaxDate, @DocType, @CounterRef,
        CASE WHEN @CashSum  > 0 THEN @CashSum  ELSE NULL END,
        CASE WHEN @CashSum  > 0 THEN @CashAcct ELSE NULL END,
        CASE WHEN @TrsfrSum > 0 THEN @TrsfrSum ELSE NULL END,
        CASE WHEN @TrsfrSum > 0 THEN @TrsfrAcct ELSE NULL END,
        CASE WHEN @TrsfrSum > 0 THEN @TrsfrDate ELSE NULL END,
        @JrnlMemo, @RefDocument, @RefTypeDocument, @Series, @LineNum, @ProccessSap
        );
    `);

    return { inserted: true, duplicate: false };
}

module.exports = {
    getSapPool,
    getDocEntryByFolioRef,
    existsIncomingVendorPayment,
    insertIncomingVendorPayment
};
