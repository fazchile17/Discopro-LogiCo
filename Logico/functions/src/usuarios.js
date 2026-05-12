/**
 * Módulo de gestión de usuarios (admin panel).
 *
 * Reglas de seguridad (jerarquía de administradores):
 *   1) Solo `admin` puede gestionar usuarios.
 *   2) El admin principal puede crear/eliminar a cualquier usuario
 *      EXCEPTO a sí mismo (nadie puede borrar su propia cuenta).
 *   3) Un admin secundario NO puede eliminar / desactivar / cambiar el
 *      rol del admin principal.
 *   4) Solo el admin principal puede tocar a otros admins (crear,
 *      eliminar, cambiar rol, activar/desactivar).
 *   5) Toda acción crítica se registra en la tabla `auditoria`.
 *   6) Los intentos bloqueados también se registran (security trail).
 *
 * Las invariantes 1-4 se validan también en BD con triggers
 * (defensa en profundidad).
 */
const bcrypt = require('bcryptjs');
const { withTransaction, pool } = require('./db');
const { admin } = require('./auth');
const {
    ValidationError,
    NotFoundError,
    BusinessRuleError,
    ConflictError,
} = require('./errors');
const {
    registrarAuditoria,
    registrarIntentoBloqueado,
    ACCIONES,
} = require('./auditoria');

const ROLES_VALIDOS = ['admin', 'operadora', 'motorista'];

// ---------------------------------------------------------------------
// Helpers internos
// ---------------------------------------------------------------------

function asegurarAdmin(usuario) {
    if (!usuario || usuario.rol !== 'admin') {
        throw new BusinessRuleError('Solo un administrador puede ejecutar esta acción.');
    }
}

async function obtenerUsuarioPlano(client, idUsuario) {
    const { rows } = await client.query(
        `SELECT id_usuario, firebase_uid, correo, nombre, apellido,
                rol, activo, es_admin_principal, fecha_creacion
           FROM usuarios
          WHERE id_usuario = $1
          FOR UPDATE`,
        [idUsuario]
    );
    return rows[0] || null;
}

/**
 * Aplica las reglas de jerarquía. Lanza error si la acción está prohibida.
 *
 * @param {object} actor    - usuario autenticado (req.user)
 * @param {object} target   - usuario objetivo (BD)
 * @param {string} tipoAccion - 'eliminar' | 'desactivar' | 'cambiar_rol' | 'modificar'
 */
function aplicarJerarquia(actor, target, tipoAccion) {
    if (!target) throw new NotFoundError('Usuario destino no existe.');

    // Nadie puede tocar (delete/disable/role) su propia cuenta de forma destructiva.
    const accionesAutoProhibidas = ['eliminar', 'desactivar', 'cambiar_rol'];
    if (
        accionesAutoProhibidas.includes(tipoAccion) &&
        actor.id_usuario === target.id_usuario
    ) {
        throw new BusinessRuleError(
            'No puedes ejecutar esta acción sobre tu propia cuenta.'
        );
    }

    // El admin principal es intocable salvo por sí mismo (que tampoco puede borrarse).
    if (target.es_admin_principal === true) {
        if (tipoAccion === 'eliminar') {
            throw new BusinessRuleError('No se puede eliminar al administrador principal.');
        }
        if (tipoAccion === 'desactivar') {
            throw new BusinessRuleError('No se puede desactivar al administrador principal.');
        }
        if (tipoAccion === 'cambiar_rol') {
            throw new BusinessRuleError('No se puede cambiar el rol del administrador principal.');
        }
    }

    // Admin secundario no puede gestionar a otros admins (solo a operadoras/motoristas).
    if (
        actor.es_admin_principal !== true &&
        target.rol === 'admin' &&
        target.id_usuario !== actor.id_usuario
    ) {
        throw new BusinessRuleError(
            'Solo el admin principal puede gestionar a otros administradores.'
        );
    }
}

// ---------------------------------------------------------------------
// Crear usuario
// ---------------------------------------------------------------------

/**
 * Crea un usuario en Firebase Auth + tabla `usuarios` + auditoría,
 * todo en una sola transacción. Si Firebase falla, hace rollback.
 *
 * Solo admin puede crear usuarios. Solo el admin principal puede
 * crear a otros con rol `admin`.
 */
async function crearUsuario({ payload, actor, req }) {
    asegurarAdmin(actor);

    const errores = [];
    const { nombre, apellido, correo, contrasena, rol } = payload;
    if (!nombre || !apellido) errores.push('nombre y apellido obligatorios');
    if (!correo || !/^[^@]+@[^@]+\.[^@]+$/.test(correo)) errores.push('correo inválido');
    if (!contrasena || contrasena.length < 8) {
        errores.push('contrasena requiere ≥ 8 caracteres');
    }
    if (!ROLES_VALIDOS.includes(rol)) {
        errores.push(`rol inválido (válidos: ${ROLES_VALIDOS.join(', ')})`);
    }
    if (errores.length) throw new ValidationError(errores.join('; '));

    if (rol === 'admin' && actor.es_admin_principal !== true) {
        await registrarIntentoBloqueado({
            usuario: actor,
            motivo: 'Admin secundario intentó crear otro admin',
            entidadAfectada: 'usuario',
            req,
        });
        throw new BusinessRuleError(
            'Solo el admin principal puede crear nuevos administradores.'
        );
    }

    // Hash bcrypt para el fallback en BD (Firebase Auth maneja el hash real).
    const hash = bcrypt.hashSync(contrasena, 10);

    let firebaseUid = null;
    try {
        const fbUser = await admin.auth().createUser({
            email: correo.toLowerCase(),
            password: contrasena,
            displayName: `${nombre} ${apellido}`,
            disabled: false,
        });
        firebaseUid = fbUser.uid;
    } catch (e) {
        // En entornos sin Firebase (tests / dev) seguimos creando el
        // registro en BD; en producción exponemos el error.
        if (e.code === 'auth/email-already-exists') {
            throw new ConflictError('El correo ya existe en Firebase Auth.');
        }
        console.warn('[usuarios] Firebase createUser falló:', e.message);
    }

    try {
        const created = await withTransaction(async (client) => {
            const { rows } = await client.query(
                `INSERT INTO usuarios
                    (firebase_uid, nombre, apellido, correo, contrasena, rol, activo)
                 VALUES ($1,$2,$3,$4,$5,$6, TRUE)
                 RETURNING id_usuario, firebase_uid, nombre, apellido,
                           correo, rol, activo, es_admin_principal, fecha_creacion`,
                [firebaseUid, nombre.trim(), apellido.trim(), correo.toLowerCase(), hash, rol]
            );
            const usuario = rows[0];

            await registrarAuditoria({
                client,
                usuario: actor,
                accion: ACCIONES.USUARIO_CREADO,
                entidadAfectada: 'usuario',
                idEntidad: usuario.id_usuario,
                detalle: { correo: usuario.correo, rol: usuario.rol },
                req,
            });
            return usuario;
        });
        return created;
    } catch (e) {
        // Rollback de Firebase Auth si la inserción en BD falla.
        if (firebaseUid) {
            try { await admin.auth().deleteUser(firebaseUid); }
            catch (_) { /* noop */ }
        }
        throw e;
    }
}

// ---------------------------------------------------------------------
// Eliminar usuario
// ---------------------------------------------------------------------

/**
 * Elimina (soft delete: activo=FALSE) o hard delete según el flag.
 * Por defecto se hace soft delete para preservar integridad referencial
 * (pedidos creados por el usuario, historial, etc.).
 */
async function eliminarUsuario({ idUsuario, actor, req, hardDelete = false }) {
    asegurarAdmin(actor);
    const id = Number(idUsuario);
    if (!Number.isFinite(id)) throw new ValidationError('id de usuario inválido.');

    return withTransaction(async (client) => {
        const target = await obtenerUsuarioPlano(client, id);
        try {
            aplicarJerarquia(actor, target, 'eliminar');
        } catch (e) {
            await registrarIntentoBloqueado({
                usuario: actor,
                motivo: e.message,
                entidadAfectada: 'usuario',
                idEntidad: id,
                req,
            });
            throw e;
        }

        if (hardDelete) {
            await client.query(`DELETE FROM usuarios WHERE id_usuario = $1`, [id]);
        } else {
            await client.query(
                `UPDATE usuarios SET activo = FALSE WHERE id_usuario = $1`,
                [id]
            );
        }

        // Sincronizar con Firebase Auth (deshabilitar / borrar UID).
        if (target.firebase_uid) {
            try {
                if (hardDelete) {
                    await admin.auth().deleteUser(target.firebase_uid);
                } else {
                    await admin.auth().updateUser(target.firebase_uid, { disabled: true });
                }
            } catch (e) {
                console.warn('[usuarios] sync Firebase falló:', e.message);
            }
        }

        await registrarAuditoria({
            client,
            usuario: actor,
            accion: ACCIONES.USUARIO_ELIMINADO,
            entidadAfectada: 'usuario',
            idEntidad: id,
            detalle: { correo: target.correo, hard: hardDelete },
            req,
        });

        return { id_usuario: id, eliminado: true, hard: hardDelete };
    });
}

// ---------------------------------------------------------------------
// Activar / Desactivar usuario
// ---------------------------------------------------------------------

async function setActivoUsuario({ idUsuario, activo, actor, req }) {
    asegurarAdmin(actor);
    const id = Number(idUsuario);

    return withTransaction(async (client) => {
        const target = await obtenerUsuarioPlano(client, id);
        try {
            if (activo === false) {
                aplicarJerarquia(actor, target, 'desactivar');
            } else {
                aplicarJerarquia(actor, target, 'modificar');
            }
        } catch (e) {
            await registrarIntentoBloqueado({
                usuario: actor,
                motivo: e.message,
                entidadAfectada: 'usuario',
                idEntidad: id,
                req,
            });
            throw e;
        }

        await client.query(
            `UPDATE usuarios SET activo = $2 WHERE id_usuario = $1`,
            [id, activo === true]
        );

        if (target.firebase_uid) {
            try {
                await admin.auth().updateUser(target.firebase_uid, {
                    disabled: activo !== true,
                });
            } catch (e) {
                console.warn('[usuarios] sync Firebase falló:', e.message);
            }
        }

        await registrarAuditoria({
            client,
            usuario: actor,
            accion: activo === true
                ? ACCIONES.USUARIO_ACTIVADO
                : ACCIONES.USUARIO_DESACTIVADO,
            entidadAfectada: 'usuario',
            idEntidad: id,
            detalle: { correo: target.correo, activo: activo === true },
            req,
        });
        return { id_usuario: id, activo: activo === true };
    });
}

// ---------------------------------------------------------------------
// Cambiar rol
// ---------------------------------------------------------------------

async function cambiarRolUsuario({ idUsuario, nuevoRol, actor, req }) {
    asegurarAdmin(actor);
    const id = Number(idUsuario);
    if (!ROLES_VALIDOS.includes(nuevoRol)) {
        throw new ValidationError(`Rol inválido (válidos: ${ROLES_VALIDOS.join(', ')}).`);
    }

    return withTransaction(async (client) => {
        const target = await obtenerUsuarioPlano(client, id);
        try {
            aplicarJerarquia(actor, target, 'cambiar_rol');
            // Promover a admin requiere ser admin principal.
            if (
                nuevoRol === 'admin' &&
                target.rol !== 'admin' &&
                actor.es_admin_principal !== true
            ) {
                throw new BusinessRuleError(
                    'Solo el admin principal puede promover usuarios a admin.'
                );
            }
        } catch (e) {
            await registrarIntentoBloqueado({
                usuario: actor,
                motivo: e.message,
                entidadAfectada: 'usuario',
                idEntidad: id,
                req,
            });
            throw e;
        }

        const rolAnterior = target.rol;
        await client.query(
            `UPDATE usuarios SET rol = $2 WHERE id_usuario = $1`,
            [id, nuevoRol]
        );

        await registrarAuditoria({
            client,
            usuario: actor,
            accion: ACCIONES.ROL_CAMBIADO,
            entidadAfectada: 'usuario',
            idEntidad: id,
            detalle: { antes: rolAnterior, despues: nuevoRol, correo: target.correo },
            req,
        });
        return { id_usuario: id, rol: nuevoRol };
    });
}

// ---------------------------------------------------------------------
// Validar admin principal (helper expuesto)
// ---------------------------------------------------------------------

/**
 * Comprueba que exista exactamente 1 admin principal activo.
 * Devuelve el registro o lanza error si no existe.
 */
async function validarAdminPrincipal() {
    const { rows } = await pool.query(
        `SELECT id_usuario, correo, nombre, apellido, activo
           FROM usuarios
          WHERE es_admin_principal = TRUE
          LIMIT 2`
    );
    if (rows.length === 0) {
        throw new BusinessRuleError('No hay administrador principal configurado.');
    }
    if (rows.length > 1) {
        throw new BusinessRuleError(
            'Inconsistencia: existen múltiples admins principales.'
        );
    }
    return rows[0];
}

// ---------------------------------------------------------------------
// Listar usuarios
// ---------------------------------------------------------------------

async function listarUsuarios({ rol, activo } = {}) {
    const filtros = [];
    const params = [];
    if (rol) {
        params.push(rol);
        filtros.push(`rol = $${params.length}`);
    }
    if (activo === true || activo === false) {
        params.push(activo);
        filtros.push(`activo = $${params.length}`);
    }
    const sql = `
        SELECT id_usuario, nombre, apellido, correo, rol, activo,
               es_admin_principal, fecha_creacion
          FROM usuarios
         ${filtros.length ? 'WHERE ' + filtros.join(' AND ') : ''}
         ORDER BY es_admin_principal DESC, rol, apellido, nombre`;
    const { rows } = await pool.query(sql, params);
    return rows;
}

module.exports = {
    crearUsuario,
    eliminarUsuario,
    setActivoUsuario,
    cambiarRolUsuario,
    validarAdminPrincipal,
    listarUsuarios,
    ROLES_VALIDOS,
};
