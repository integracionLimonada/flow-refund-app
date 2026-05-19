const sql = require('mssql');
const { sql: cfg } = require('../config');

let pool;
async function getPool() {
  if (pool) return pool;
  pool = await sql.connect({
    server: cfg.server,
    database: cfg.database,
    user: cfg.user,
    password: cfg.password,
    options: cfg.options,
    pool: cfg.pool
  });
  return pool;
}

module.exports = { getPool, sql };
