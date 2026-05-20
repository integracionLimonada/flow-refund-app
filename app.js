// app.js
require('dotenv').config();

const {
  // payment
  getPaymentStatusByCommerceId,
  // refund
  createRefund,
  getRefundStatus,
} = require('./services/flowRefundService');

const {
  getDevolucionByCabId,
  getDevolucionesPendientesFlow,
  upReembolsoCreadoFlow,
  getReembolsosCreadosFlow,
  upReembolsoDevueltoFlow,
  getNotasCreditoPagadasFlow
} = require('./services/dbService');

const {
  insertIncomingVendorPayment,
  getDocEntryByFolioRef
} = require('./services/sapDbService');

// ---- helpers locales ----
function sumarDevolucion(det) {
  return det.reduce((acc, r) => {
    const v = Number(String(r.DEVOLUCION).replace(',', '.'));
    return acc + (Number.isNaN(v) ? 0 : v);
  }, 0) | 0;
}

function getCuentaTransferenciaPorMedioPago(medioPago) {
  const medio = String(medioPago || '').toLowerCase();

  if (medio.includes('mercado pago') || medio.includes('mercadopago')) {
    return { cuenta: '11020209', nombre: 'Mercado Pago' };
  }

  if (medio.includes('flow')) {
    return { cuenta: '11020219', nombre: 'Flow' };
  }

  return null;
}

/**
 * Revisa todos los reembolsos que ya están "creados" en Flow
 * y actualiza su estado en RT_INFO_REEMBOLSO cuando pasan a
 * accepted / refunded (Dinero Devuelto).
 */
async function revisarReembolsosCreados(apiKey, secret, host) {
  console.log('→ Revisando reembolsos creados en FLOW…');

  const lista = await getReembolsosCreadosFlow();
  if (!lista.length) {
    console.log('No hay reembolsos creados por revisar.');
    return;
  }

  for (const r of lista) {
    const { ORDER_ID, REFUND_TOKEN_FLOW } = r;

    if (!REFUND_TOKEN_FLOW) {
      console.warn(`ORDER_ID=${ORDER_ID} está creado pero sin token, se omite.`);
      continue;
    }

    try {
      const statusResp = await getRefundStatus(
        { apiKey, token: REFUND_TOKEN_FLOW },
        secret,
        host
      );

      const flowStatus = statusResp.status; // created, accepted, rejected, refunded, canceled
      console.log(`→ ORDER_ID=${ORDER_ID} estado Flow actual = ${flowStatus}`);

      // 1) Si sigue "created", no hacemos nada (se revisa en próxima ejecución)
      if (flowStatus === 'created') {
        continue;
      }

      // 2) Dinero devuelto
      if (flowStatus === 'accepted' || flowStatus === 'refunded') {
        await upReembolsoDevueltoFlow(ORDER_ID);
        console.log(`✓ ORDER_ID=${ORDER_ID} → Dinero Devuelto`);
        continue;
      }

      // Si quisieras mapear rejected/canceled más adelante, lo agregamos aquí.

      // Cualquier otro estado
      console.log(`⚠ ORDER_ID=${ORDER_ID} estado Flow no mapeado: ${flowStatus}`);
    } catch (err) {
      console.error(`✗ Error revisando ORDER_ID=${ORDER_ID}:`, err.message || err);
    }
  }
}

/**
 * Genera pagos de notas de crédito (IncomingVendorPayment_CAB en REPORTESAP)
 * para aquellas NC cuyo reembolso ya fue marcado como "Dinero Devuelto"
 * en Tesorería (ID_STATUS_TESO = 3).
 */
async function pagarNotasCreditoFlow() {
  console.log('→ Buscando notas de crédito con reembolso ya pagado (TESORERIA = 3)…');

  const notas = await getNotasCreditoPagadasFlow();

  if (!notas.length) {
    console.log('No hay notas de crédito para pagar en REPORTESAP.');
    return;
  }

  for (const ncc of notas) {
    try {
      // Obtenemos cab+det por si necesitamos monto u otros datos
      const { cab, det } = await getDevolucionByCabId(ncc.ID);
      if (!cab) {
        console.warn(`No se encontró cabecera para ID=${ncc.ID}, se omite.`);
        continue;
      }

      // 1) Folio de la boleta para buscar en MarketingDocument_SAP_CAB
      // 🔧 IMPORTANTE: ajusta el nombre de la columna real en NC_DEVOLUCION_CAB
      const folioBoleta =
        cab.FOLIO_BOLETA || 
        cab.N_BOLETA     || 
        cab.BOLETA       || 
        cab.U_Fae_FolioRef; 

      if (!folioBoleta) {
        console.warn(`ID=${cab.ID} no tiene folio de boleta asociado, se omite.`);
        continue;
      }

      // 2) Buscar DocEntry de la boleta en REPORTESAP..MarketingDocument_SAP_CAB
      const refDocument = await getDocEntryByFolioRef(folioBoleta);
      if (!refDocument) {
        console.warn(
          `No se encontró DocEntry en MarketingDocument_SAP_CAB para folio ${folioBoleta} (ID=${cab.ID}), se omite.`
        );
        continue;
      }

      // 3) Monto (que coincida con el valor del reembolso)
      const monto = sumarDevolucion(det);
      if (!monto) {
        console.warn(`Monto de devolución = 0 para ID=${cab.ID}, se omite.`);
        continue;
      }

      // 4) Parámetros del pago
      const docDate    = cab.FECHA_NC || cab.FECHA_CREACION || new Date();
      const cardCode   = 'T1999';     // Cliente de reembolsos
      const docType    = 'C';         // Payment - customers
      const medioPago  = ncc.MEDIO_PAGO || cab.MEDIO_PAGO;
      const cuentaTransferencia = getCuentaTransferenciaPorMedioPago(medioPago);

      if (!cuentaTransferencia) {
        console.warn(
          `Medio de pago no reconocido para ID=${cab.ID} (${medioPago || 'sin MEDIO_PAGO'}), se omite.`
        );
        continue;
      }

      // El documento referenciado es la BOLETA (DocEntry) → normalmente tipo 13
      const refTypeDocument = 14;     // Ajusta si tu codificación es distinta
      const series          = 1;
      const lineNum         = 1;
      const proccessSap     = 0;

      const comentarioSAP = 'Pago Nota de Crédito'; // como el ejemplo que mostraste

      const result = await insertIncomingVendorPayment({
        DocDate:        docDate,
        CardCode:       cardCode,
        DocDueDate:     docDate,
        TaxDate:        docDate,
        DocType:        docType,
        CounterRef:     null,
        CashSum:        0,           // solo transferencia
        CashAcct:       null,
        TrsfrSum:       monto,
        TrsfrAcct:      cuentaTransferencia.cuenta,
        TrsfrDate:      docDate,
        JrnlMemo:       comentarioSAP,
        RefDocument:    refDocument,
        RefTypeDocument: refTypeDocument,
        Series:         series,
        LineNum:        lineNum,
        ProccessSap:    proccessSap
      });

      if (result.duplicate) {
        console.log(
          `NC ID=${cab.ID} / Boleta folio=${folioBoleta} ya tenía pago en REPORTESAP, se omitió.`
        );
      } else {
        console.log(
          `✓ Insertado pago en REPORTESAP para NC ID=${cab.ID}, ` +
          `Boleta folio=${folioBoleta}, DocEntry=${refDocument}, ` +
          `medio=${cuentaTransferencia.nombre}, cuenta=${cuentaTransferencia.cuenta}, monto=${monto}`
        );
      }
    } catch (err) {
      console.error(`✗ Error pagando NC ID=${ncc.ID}:`, err.message || err);
    }
  }
}

/**
 * Procesa la creación de un nuevo reembolso en Flow para:
 * - Una NC específica (cabIdArg) si viene por CLI/.env
 * - O la TOP 1 pendiente desde DB si no se pasa ID.
 */
async function procesarDevolucionCab(cab, det, apiKey, secret, host, callback) {
  // 1) Monto y correo
  const amount = sumarDevolucion(det);
  if (!amount) {
    console.warn(`Monto de devolución = 0 para CHECKOUT_ID=${cab.CHECKOUT_ID}, se omite.`);
    return false;
  }

  const commerceId = cab.ID_MEDIO_PAGO; // <-- ESTE es el commerceId para Flow
  if (!commerceId) {
    console.warn(`ID_MEDIO_PAGO vacío para CHECKOUT_ID=${cab.CHECKOUT_ID}, se omite.`);
    return false;
  }

  // 2) Obtener payment en Flow por commerceId
  console.log(`→ Consultando payment/getStatusByCommerceId commerceId=${commerceId}`);
  const pay = await getPaymentStatusByCommerceId({ apiKey, commerceId }, secret, host);

  // Validar pagada
  if (Number(pay.status) !== 2) {
    console.warn(
      `La orden en Flow no está pagada (status=${pay.status}). ` +
      `flowOrder=${pay.flowOrder}, commerceOrder=${pay.commerceOrder}. Se omite creación de reembolso.`
    );
    return false;
  }

  // Seguridad: no exceder lo pagado
  const maxPago = Number(pay.amount || 0);
  if (amount > maxPago) {
    console.warn(`Monto de reembolso (${amount}) excede el pagado (${maxPago}), se omite.`);
    return false;
  }

  // 3) Crear reembolso
  const refundCommerceOrder = `RFD-${cab.ID}-${Date.now()}`;
  const receiverEmail       = cab.MAIL || pay.payer;

  // Opción A (recomendada): usa flowTrxId = flowOrder
  const flowTrxId = pay.flowOrder;

  console.log('→ Creando reembolso en Flow…');
  const created = await createRefund({
    apiKey,
    refundCommerceOrder,
    receiverEmail,
    amount,
    urlCallBack: callback,
    flowTrxId
    // Opción B: en vez de flowTrxId, usa commerceTrxId: pay.commerceOrder
  }, secret, host);

  console.log('✓ Reembolso creado:', created);

  // 4) Consultar estado si hay token y marcar como "Reembolso Creado"
  if (created && created.token) {
    console.log('→ Consultando estado del reembolso…');
    const status = await getRefundStatus({ apiKey, token: created.token }, secret, host);
    console.log('✓ Estado del reembolso:', status);
    try {
      await upReembolsoCreadoFlow(cab.ORDER_ID, created.token);
      console.log('✓ Estado de reembolso actualizado a "Reembolso Creado"');
      return true;
    } catch (e) {
      console.error('✗ Error actualizando estado de reembolso en BD:', e.message || e);
      return false;
    }
  } else {
    console.log('No se obtuvo token en la creación del reembolso.');
    return false;
  }
}

async function procesarNuevaDevolucion(apiKey, secret, host, callback) {
  // Si pasas un ID por CLI (o env), procesa solo ese; si no, procesa todas las pendientes.
  const cabIdArg = Number(process.argv[2] || process.env.REFUND_CAB_ID || 0);

  if (cabIdArg) {
    const { cab, det } = await getDevolucionByCabId(cabIdArg);
    if (!cab) {
      console.warn(`No existe NC_DEVOLUCION_CAB ID=${cabIdArg}, se omite creación de reembolso.`);
      return;
    }

    console.log(`→ Procesando devolución CAB_ID=${cabIdArg}`);
    await procesarDevolucionCab(cab, det, apiKey, secret, host, callback);
    return;
  }

  const pendientes = await getDevolucionesPendientesFlow();
  if (!pendientes.length) {
    console.log('No hay devoluciones pendientes que cumplan criterio.');
    return;
  }

  console.log(`→ Se encontraron ${pendientes.length} devoluciones pendientes para reembolso Flow.`);

  let procesadas = 0;
  for (const pendiente of pendientes) {
    try {
      const { cab, det } = await getDevolucionByCabId(pendiente.ID);
      if (!cab) {
        console.warn(`No se encontró cabecera para ID=${pendiente.ID}, se omite.`);
        continue;
      }

      console.log(`→ Procesando devolución CHECKOUT_ID=${cab.CHECKOUT_ID}`);
      const ok = await procesarDevolucionCab(cab, det, apiKey, secret, host, callback);
      if (ok) procesadas += 1;
    } catch (err) {
      console.error(`✗ Error procesando devolución ID=${pendiente.ID}:`, err.message || err);
    }
  }

  console.log(`✓ Proceso masivo finalizado. Reembolsos creados: ${procesadas}/${pendientes.length}`);
}

async function main() {
  const host     = process.env.FLOW_HOSTING || 'sandbox.flow.cl';
  const apiKey   = process.env.FLOW_API_KEY;
  const secret   = process.env.FLOW_SECRET_KEY;
  const callback = process.env.REFUND_CALLBACK_URL; // tu URL pública de callback

  if (!apiKey || !secret) throw new Error('Faltan FLOW_API_KEY o FLOW_SECRET_KEY en .env');
  if (!callback)          throw new Error('Falta REFUND_CALLBACK_URL en .env');

  // 1) Intentar procesar una nueva devolución (si existe)
  try {
    await procesarNuevaDevolucion(apiKey, secret, host, callback);
  } catch (err) {
    console.error('✗ Error procesando nueva devolución:', err.message || err);
  }

  // 2) Revisar todos los reembolsos que ya estaban creados en Flow
  try {
    await revisarReembolsosCreados(apiKey, secret, host);
  } catch (err) {
    console.error('✗ Error revisando reembolsos creados:', err.message || err);
  }

  // 3) Generar pagos de notas de crédito en REPORTESAP
  try {
    await pagarNotasCreditoFlow();
  } catch (err) {
    console.error('✗ Error generando pagos de notas de crédito:', err.message || err);
  }
}

main().catch(err => {
  const payload = err?.response?.data || err?.message || err;
  console.error('✗ Error crítico en proceso:', payload);
  process.exit(1);
});
