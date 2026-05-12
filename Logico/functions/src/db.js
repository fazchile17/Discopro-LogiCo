/**
 * Pool de conexiones PostgreSQL.
 * Usa Cloud SQL Auth Proxy en producción (socket UNIX en /cloudsql/...)
 * o host/puerto en desarrollo local.
 */
const { Pool } = require('pg');

const isUnixSocket = (process.env.PG_HOST || '').startsWith('/cloudsql/');

const pool = new Pool({
    host: process.env.PG_HOST || '127.0.0.1',
    port: isUnixSocket ? undefined : Number(process.env.PG_PORT || 5432),
    database: process.env.PG_DATABASE || 'logico',
    user: process.env.PG_USER || 'logico_app',
    password: process.env.PG_PASSWORD || '',
    max: Number(process.env.PG_MAX_POOL || 10),
    idleTimeoutMillis: Number(process.env.PG_IDLE_MS || 30000),
});

pool.on('error', (err) => {
    console.error('[pg] error inesperado en cliente idle:', err);
});

/**
 * Ejecuta una función dentro de una transacción SQL (BEGIN/COMMIT/ROLLBACK).
 * @param {(client: import('pg').PoolClient) => Promise<any>} work
 */
async function withTransaction(work) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const result = await work(client);
        await client.query('COMMIT');
        return result;
    } catch (err) {
        try { await client.query('ROLLBACK'); } catch (_) { /* noop */ }
        throw err;
    } finally {
        client.release();
    }
}

/**
 * Helper de query simple (sin transacción explícita).
 */
async function query(sql, params = []) {
    return pool.query(sql, params);
}

module.exports = { pool, query, withTransaction };
