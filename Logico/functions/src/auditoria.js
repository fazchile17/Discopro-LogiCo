/**
 * Tabla `auditoria` (estructurada): registro de acciones críticas
 * (gestión de usuarios, farmacias, intentos bloqueados, etc.).
 *
 * Diseñada para consultas tabulares y reportes administrativos.
 * Convive con `audit_logs` (JSONB de uso general) y NUNCA debe
 * lanzar excepciones que aborten la operación de negocio.
 */
const { pool } = require('./db');

const ACCIONES = Object.freeze({
    USUARIO_CREADO:           'usuario_creado',
    USUARIO_ELIMINADO:        'usuario_eliminado',
    USUARIO_DESACTIVADO:      'usuario_desactivado',
    USUARIO_ACTIVADO:         'usuario_activado',
    ROL_CAMBIADO:             'rol_cambiado',
    FARMACIA_CREADA:          'farmacia_creada',
    FARMACIA_ACTUALIZADA:     'farmacia_actualizada',
    FARMACIA_DESACTIVADA:     'farmacia_desactivada',
    FARMACIA_ACTIVADA:        'farmacia_activada',
    MOTO_CREADA:              'moto_creada',
    MOTO_ACTUALIZADA:         'moto_actualizada',
    MOTO_DESACTIVADA:         'moto_desactivada',
    INTENTO_BLOQUEADO:        'intento_bloqueado',
    TRANSFERENCIA_ADMIN:      'transferencia_admin_principal',
});

/**
 * Inserta una fila en la tabla `auditoria`.
 * Devuelve el id_auditoria insertado (o null si falló silenciosamente).
 *
 * @param {object} args
 * @param {object} [args.client] - Cliente SQL dentro de transacción (opcional).
 * @param {object} [args.usuario] - Usuario actor (req.user).
 * @param {string} args.accion - Catálogo en `ACCIONES`.
 * @param {string} [args.entidadAfectada] - 'usuario' | 'farmacia' | 'pedido' | ...
 * @param {number|null} [args.idEntidad] - PK de la entidad afectada.
 * @param {string|object} [args.detalle] - Texto o JSON serializable.
 * @param {boolean} [args.exito=true] - false si fue un intento bloqueado.
 * @param {object} [args.req] - Request HTTP (para extraer IP).
 */
async function registrarAuditoria({
    client,
    usuario = null,
    accion,
    entidadAfectada = null,
    idEntidad = null,
    detalle = null,
    exito = true,
    req = null,
}) {
    const ip = req
        ? (req.headers['x-forwarded-for'] || req.ip || null)
        : null;

    const detalleStr = detalle == null
        ? null
        : (typeof detalle === 'string' ? detalle : JSON.stringify(detalle));

    const sql = `
        INSERT INTO auditoria
            (usuario_id, accion, entidad_afectada, id_entidad, detalle, exito, ip)
        VALUES ($1,$2,$3,$4,$5,$6,$7)
        RETURNING id_auditoria`;
    const params = [
        usuario?.id_usuario ?? null,
        accion,
        entidadAfectada,
        idEntidad,
        detalleStr,
        exito,
        ip,
    ];

    try {
        const runner = client || pool;
        const { rows } = await runner.query(sql, params);
        return rows[0]?.id_auditoria ?? null;
    } catch (e) {
        console.error('[auditoria] error:', e.message);
        return null;
    }
}

/**
 * Atajo para registrar intentos bloqueados (security events).
 */
async function registrarIntentoBloqueado({ usuario, motivo, entidadAfectada, idEntidad, req }) {
    return registrarAuditoria({
        usuario,
        accion: ACCIONES.INTENTO_BLOQUEADO,
        entidadAfectada,
        idEntidad,
        detalle: motivo,
        exito: false,
        req,
    });
}

/**
 * Lista filas de auditoría con filtros opcionales.
 */
async function listarAuditoria({ accion, usuarioId, exito, limit = 200 } = {}) {
    const filtros = [];
    const params = [];
    if (accion) {
        params.push(accion);
        filtros.push(`a.accion = $${params.length}`);
    }
    if (usuarioId) {
        params.push(Number(usuarioId));
        filtros.push(`a.usuario_id = $${params.length}`);
    }
    if (exito === true || exito === false) {
        params.push(exito);
        filtros.push(`a.exito = $${params.length}`);
    }
    params.push(Math.min(Number(limit) || 200, 500));

    const sql = `
        SELECT a.id_auditoria,
               a.fecha_hora,
               a.accion,
               a.entidad_afectada,
               a.id_entidad,
               a.detalle,
               a.exito,
               a.ip,
               a.usuario_id,
               u.nombre || ' ' || u.apellido AS usuario_nombre,
               u.correo                       AS usuario_correo
          FROM auditoria a
          LEFT JOIN usuarios u ON u.id_usuario = a.usuario_id
         ${filtros.length ? 'WHERE ' + filtros.join(' AND ') : ''}
         ORDER BY a.fecha_hora DESC
         LIMIT $${params.length}`;

    const { rows } = await pool.query(sql, params);
    return rows;
}

module.exports = {
    ACCIONES,
    registrarAuditoria,
    registrarIntentoBloqueado,
    listarAuditoria,
};
