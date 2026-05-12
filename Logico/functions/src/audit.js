/**
 * Capa de auditoría: registra eventos en `audit_logs` (JSONB).
 * Es no bloqueante; un fallo aquí jamás debe romper la operación principal.
 */
const { pool } = require('./db');

async function logAudit({
    usuario,
    accion,
    entidad = null,
    entidadId = null,
    payload = null,
    nivel = 'INFO',
    req = null,
}) {
    try {
        await pool.query(
            `INSERT INTO audit_logs (
                usuario_id, firebase_uid, accion, entidad, entidad_id,
                ip, user_agent, payload, nivel
             ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9)`,
            [
                usuario?.id_usuario ?? null,
                usuario?.firebase_uid ?? null,
                accion,
                entidad,
                entidadId,
                req ? (req.headers['x-forwarded-for'] || req.ip || null) : null,
                req ? (req.headers['user-agent'] || null) : null,
                payload ? JSON.stringify(payload) : null,
                nivel,
            ]
        );
    } catch (e) {
        console.error('[audit] error registrando evento:', e.message);
    }
}

/**
 * Middleware de auditoría: registra automáticamente cada request autenticado.
 */
function auditMiddleware(req, _res, next) {
    if (req.user && ['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
        logAudit({
            usuario: req.user,
            accion: `${req.method} ${req.path}`,
            payload: { body: redactSensitive(req.body) },
            nivel: 'INFO',
            req,
        });
    }
    next();
}

function redactSensitive(obj) {
    if (!obj || typeof obj !== 'object') return obj;
    const clone = { ...obj };
    for (const k of ['contrasena', 'password', 'token', 'idToken', 'secret']) {
        if (k in clone) clone[k] = '[REDACTED]';
    }
    return clone;
}

module.exports = { logAudit, auditMiddleware };
