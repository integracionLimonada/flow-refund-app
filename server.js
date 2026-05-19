require('dotenv').config();
const express = require('express');
const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Flow llamará esta URL con ?token=... o por POST con 'token' y más campos.
app.all('/flow/refund/callback', (req, res) => {
  const token = req.query.token || req.body?.token;
  console.log('↪ Callback de Flow (refund):', {
    method: req.method,
    path: req.path,
    query: req.query,
    body: req.body,
    token
  });
  // Responder 200 OK para que Flow no reintente infinitamente
  res.status(200).send('OK');
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Servidor de callback escuchando en http://localhost:${port}/flow/refund/callback`);
  console.log('Asegúrate de exponer/forwardear esta URL desde internet (ngrok o similar) para pruebas sandbox.');
});
