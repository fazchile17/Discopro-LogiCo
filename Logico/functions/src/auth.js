/**
 * Middleware de autenticación.
 * Verifica el ID Token de Firebase y carga el usuario asociado en BD.
 *
 * Si el correo existe en Firebase pero no hay fila en `usuarios` (p. ej.
 * cuenta creada solo en la consola de Firebase), puede aprovisionarse
 * automáticamente (controlado por AUTH_AUTO_PROVISION).
 */
const admin = require('firebase-admin');
const bcrypt = require('bcryptjs');
const { pool } = require('./db');

/** Por defecto se permite auto-registro en BD para tokens Firebase válidos; en prod estricto poner AUTH_AUTO_PROVISION=false. */
function autoProvisionEnabled() {
    return process.env.AUTH_AUTO_PROVISION !== 'false';
}

function defaultProvisionRol() {
    const r = (process.env.AUTH_AUTO_PROVISION_ROL || 'operadora').trim().toLowerCase();
    return ['operadora', 'motorista'].includes(r) ? r : 'operadora';
}

function nombreDesdeToken(decoded) {
    const raw = (decoded.name || '').trim();
    if (raw) {
        const parts = raw.split(/\s+/);
        return {
            nombre: parts[0] || 'Usuario',
            apellido: parts.slice(1).join(' ') || '—',
        };
    }
    const local = (decoded.email || '').split('@')[0] || 'Usuario';
    return { nombre: local, apellido: '—' };
}

if (!admin.apps.length) {
    // Inicialización explícita: asegura que el SDK use el projectId correcto
    // incluso si GCLOUD_PROJECT no está auto-detectado.
    admin.initializeApp({
        projectId: process.env.GCLOUD_PROJECT
                || process.env.GOOGLE_CLOUD_PROJECT
                || 'logico-20f73',
    });
}

/**
 * Express middleware: requiere Authorization: Bearer <ID_TOKEN>.
 * Inyecta `req.user = { id_usuario, firebase_uid, correo, rol, nombre, apellido }`.
 */
async function authRequired(req, res, next) {
    const header = req.headers.authorization || '';
    const match = header.match(/^Bearer\s+(.+)$/i);
    if (!match) {
        return res.status(401).json({ error: 'Falta token de autenticación.' });
    }

    let decoded;
    try {
        decoded = await admin.auth().verifyIdToken(match[1]);
    } catch (err) {
        // En desarrollo enviamos el mensaje real para facilitar debug.
        // En producción esto se debería ocultar.
        console.error('[auth] verifyIdToken falló:', err.code, err.message);
        return res.status(401).json({
            error: 'Token inválido o expirado.',
            code: err.code,
            details: err.message,
        });
    }

    try {
        const emailNorm = (decoded.email || '').trim().toLowerCase();
        const { rows } = await pool.query(
            `SELECT id_usuario, firebase_uid, correo, rol, nombre, apellido,
                    activo, es_admin_principal
               FROM usuarios
              WHERE firebase_uid = $1 OR correo = $2::citext
              LIMIT 1`,
            [decoded.uid, emailNorm]
        );

        let user = rows[0];
        if (!user) {
            if (!autoProvisionEnabled() || !emailNorm) {
                return res.status(403).json({
                    error: 'Usuario autenticado pero no registrado en LogiCo. Contacte al administrador.',
                    details: { uid: decoded.uid, email: decoded.email || null },
                });
            }
            const { nombre, apellido } = nombreDesdeToken(decoded);
            const dummyHash = bcrypt.hashSync(`__firebase__${decoded.uid}`, 10);
            const rolProv = defaultProvisionRol();
            try {
                const ins = await pool.query(
                    `INSERT INTO usuarios
                        (firebase_uid, nombre, apellido, correo, contrasena, rol, activo)
                     VALUES ($1, $2, $3, $4::citext, $5, $6, TRUE)
                     ON CONFLICT (correo) DO UPDATE SET
                        firebase_uid = COALESCE(usuarios.firebase_uid, EXCLUDED.firebase_uid)
                     RETURNING id_usuario, firebase_uid, correo, rol, nombre, apellido,
                               activo, es_admin_principal`,
                    [
                        decoded.uid,
                        nombre,
                        apellido,
                        emailNorm,
                        dummyHash,
                        rolProv,
                    ]
                );
                user = ins.rows[0];
            } catch (e) {
                console.error('[auth] auto-provision falló:', e.message);
                return res.status(403).json({
                    error: 'Usuario autenticado pero no registrado en LogiCo. Contacte al administrador.',
                    details: { uid: decoded.uid, email: decoded.email || null },
                });
            }
            if (String(user.firebase_uid) !== String(decoded.uid)) {
                return res.status(403).json({
                    error: 'Este correo ya está vinculado en LogiCo a otra cuenta Firebase.',
                    details: { uid: decoded.uid, email: emailNorm },
                });
            }
        }
        if (!user.activo) {
            return res.status(403).json({ error: 'Usuario desactivado.' });
        }

        if (!user.firebase_uid) {
            await pool.query(
                `UPDATE usuarios SET firebase_uid = $1 WHERE id_usuario = $2`,
                [decoded.uid, user.id_usuario]
            );
            user.firebase_uid = decoded.uid;
        }

        if (String(user.firebase_uid) !== String(decoded.uid)) {
            return res.status(403).json({
                error: 'La sesión Firebase no coincide con el usuario enlazado en LogiCo.',
                details: { uid: decoded.uid, email: emailNorm },
            });
        }

        req.user = user;
        return next();
    } catch (err) {
        console.error('[auth] BD error:', err.message);
        return res.status(500).json({ error: 'Error interno verificando usuario.', details: err.message });
    }
}

/**
 * Middleware factory para exigir uno o más roles.
 *   app.post('/x', authRequired, requireRole('operadora','admin'), handler)
 */
function requireRole(...roles) {
    return (req, res, next) => {
        if (!req.user) return res.status(401).json({ error: 'No autenticado.' });
        if (!roles.includes(req.user.rol)) {
            return res.status(403).json({
                error: `Acceso denegado. Roles permitidos: ${roles.join(', ')}.`,
            });
        }
        return next();
    };
}

module.exports = { authRequired, requireRole, admin };
