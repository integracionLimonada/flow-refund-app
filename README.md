# flow-refund-app

Pequeña app Node.js para crear un reembolso en Flow y consultar su estado, siguiendo la firma usada en las colecciones oficiales de Postman.

## Uso

1. `npm install`
2. Copia `.env.example` a `.env` y completa:
   - `FLOW_HOSTING` = `sandbox.flow.cl` (test) o `www.flow.cl` (producción)
   - `FLOW_API_KEY` y `FLOW_SECRET_KEY`
   - `RECEIVER_EMAIL`, `AMOUNT`, `REFUND_CALLBACK_URL`
   - **Uno** entre `COMMERCE_TRX_ID` (tu commerce order original) o `FLOW_TRX_ID` (orden de Flow de la transacción original).
3. Ejecuta: `npm start`

La app imprimirá la respuesta de `refund/create` (incluye `token` y `flowRefundOrder`) y luego consultará `refund/getStatus` con ese `token`.


## Servidor de callback (opcional, recomendado en pruebas)
1. Ajusta en `.env` `REFUND_CALLBACK_URL` a `http://<tu_host_publico>/flow/refund/callback`
2. `npm run start:callback` (usa ngrok para exponerlo desde sandbox)

## Consultar estado por token
```
npm run status -- --token=TOKEN_DEL_REEMBOLSO
```

## Cancelar reembolso por token
```
npm run cancel -- --token=TOKEN_DEL_REEMBOLSO
```
