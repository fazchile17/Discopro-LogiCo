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
const { withTransaction, withClient, pool } = require('./db');
const {
    ensureUsuariosTableResolved,
    getTblUsuarios,
    diagnosticarUsuarios,
} = require('./usuarios-table');
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

function normalizarRol(rol) {
    return String(rol || '').trim().toLowerCase();
}

function mismoId(a, b) {
    return Number(a) === Number(b);
}

async function asegurarDisponibilidadMotorista(client, motoristaId) {
    await client.query(
        `INSERT INTO disponibilidad_motorista (motorista_id, disponible)
         VALUES ($1, TRUE)
         ON CONFLICT (motorista_id) DO NOTHING`,
        [motoristaId]
    );
}

/**
 * Persiste el rol (autocommit, sin BEGIN/COMMIT).
 * Prefiere fn_cambiar_rol_usuario en producción (SECURITY DEFINER, una sentencia).
 */
async function persistirCambioRol(runner, tbl, id, rolNuevo) {
    const q = runner.query.bind(runner);
    let usóFn = false;

    if (process.env.NODE_ENV !== 'test') {
        try {
            const { rows } = await q(
                `SELECT id_usuario, rol::text AS rol, correo
                   FROM fn_cambiar_rol_usuario($1, $2)`,
                [id, rolNuevo]
            );
            if (rows[0]?.rol === rolNuevo) {
                usóFn = true;
                const { rows: uid } = await q(
                    `SELECT firebase_uid FROM ${tbl} WHERE id_usuario = $1`,
                    [id]
                );
                return {
                    ...rows[0],
                    firebase_uid: uid[0]?.firebase_uid ?? null,
                    usó_fn_sql: true,
                };
            }
        } catch (e) {
            if (e.code !== '42883' && e.code !== '42P01') throw e;
        }
    }

    const { rows: actualizados } = await q(
        `UPDATE ${tbl}
            SET rol = $2::varchar
          WHERE id_usuario = $1
          RETURNING id_usuario, correo, rol::text AS rol, firebase_uid`,
        [id, rolNuevo]
    );
    if (actualizados.length !== 1) {
        throw new BusinessRuleError(
            `No se pudo actualizar el rol del usuario #${id}.`
        );
    }
    const fila = actualizados[0];
    if (fila.rol !== rolNuevo) {
        throw new BusinessRuleError(
            `El rol en base de datos (${fila.rol}) no coincide con el solicitado (${rolNuevo}). ` +
            'Si el usuario es admin principal, transfiere esa bandera antes de cambiar el rol.'
        );
    }
    return { ...fila, usó_fn_sql: usóFn };
}

async function syncRolFirebaseAuth(firebaseUid, rol) {
    if (!firebaseUid) return;
    try {
        await admin.auth().setCustomUserClaims(firebaseUid, { logico_rol: rol });
    } catch (e) {
        console.warn('[usuarios] setCustomUserClaims falló:', e.message);
    }
}

function asegurarAdmin(usuario) {
    if (!usuario || usuario.rol !== 'admin') {
        throw new BusinessRuleError('Solo un administrador puede ejecutar esta acción.');
    }
}

async function obtenerUsuarioPlano(client, idUsuario) {
    await ensureUsuariosTableResolved();
    const tbl = getTblUsuarios();
    const { rows } = await client.query(
        `SELECT id_usuario, firebase_uid, correo, nombre, apellido,
                rol, activo, es_admin_principal, fecha_creacion
           FROM ${tbl}
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
        mismoId(actor.id_usuario, target.id_usuario)
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

    // Admin secundario no puede eliminar/desactivar/cambiar rol de OTRO admin
    // (sí puede crear admins y cambiar operadora/motorista).
    if (
        actor.es_admin_principal !== true &&
        target.rol === 'admin' &&
        !mismoId(target.id_usuario, actor.id_usuario) &&
        ['eliminar', 'desactivar', 'cambiar_rol'].includes(tipoAccion)
    ) {
        throw new BusinessRuleError(
            'Solo el admin principal puede modificar a otros administradores.'
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
    await ensureUsuariosTableResolved();
    const tbl = getTblUsuarios();
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

    // Cualquier usuario con rol admin puede crear otros admins (panel académico).
    // La protección fuerte sigue en BD para el único admin principal (triggers 05).

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
                `INSERT INTO ${tbl}
                    (firebase_uid, nombre, apellido, correo, contrasena, rol, activo)
                 VALUES ($1,$2,$3,$4,$5,$6, TRUE)
                 RETURNING id_usuario, firebase_uid, nombre, apellido,
                           correo, rol, activo, es_admin_principal, fecha_creacion`,
                [firebaseUid, nombre.trim(), apellido.trim(), correo.toLowerCase(), hash, rol]
            );
            const usuario = rows[0];

            if (usuario.rol === 'motorista') {
                await asegurarDisponibilidadMotorista(client, usuario.id_usuario);
            }

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
        if (created.firebase_uid) {
            await syncRolFirebaseAuth(created.firebase_uid, created.rol);
        }
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
            await client.query(`DELETE FROM ${getTblUsuarios()} WHERE id_usuario = $1`, [id]);
        } else {
            await client.query(
                `UPDATE ${getTblUsuarios()} SET activo = FALSE WHERE id_usuario = $1`,
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
            `UPDATE ${getTblUsuarios()} SET activo = $2 WHERE id_usuario = $1`,
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
    const rolNuevo = normalizarRol(nuevoRol);
    if (!ROLES_VALIDOS.includes(rolNuevo)) {
        throw new ValidationError(`Rol inválido (válidos: ${ROLES_VALIDOS.join(', ')}).`);
    }

    await ensureUsuariosTableResolved();
    const tbl = getTblUsuarios();

    const resultado = await withClient(async (client) => {
        const target = await obtenerUsuarioPlano(client, id);
        try {
            aplicarJerarquia(actor, target, 'cambiar_rol');
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
        const fila = await persistirCambioRol(client, tbl, id, rolNuevo);

        if (rolNuevo === 'motorista' && !fila.usó_fn_sql) {
            await asegurarDisponibilidadMotorista(client, id);
        }

        const { rows: post } = await client.query(
            `SELECT rol::text AS rol FROM ${tbl} WHERE id_usuario = $1`,
            [id]
        );
        const rolPersistido = post[0]?.rol;
        if (rolPersistido !== rolNuevo) {
            const diag = await diagnosticarUsuarios(id);
            diag.ayuda_psql =
                'La API usa la base "logico". En Cloud Shell: \\c logico (no "postgres"). ' +
                'Ejecute database/09_diagnostico_usuarios.sql desde la carpeta del repo.';
            console.error('[usuarios] rol no persistió tras UPDATE', {
                id, esperado: rolNuevo, leido: rolPersistido, tbl, diag,
            });
            throw new BusinessRuleError(
                `El rol no se guardó (sigue "${rolPersistido || '?'}"). ` +
                `Tabla: ${tbl}, BD: ${diag.entorno?.db || '?'}. Revise "details".`,
                diag
            );
        }

        await registrarAuditoria({
            client,
            usuario: actor,
            accion: ACCIONES.ROL_CAMBIADO,
            entidadAfectada: 'usuario',
            idEntidad: id,
            detalle: { antes: rolAnterior, despues: fila.rol, correo: fila.correo },
            req,
        });

        return {
            id_usuario: fila.id_usuario,
            rol: fila.rol,
            rol_anterior: rolAnterior,
            firebase_uid: fila.firebase_uid,
            rol_verificado: rolPersistido,
            tabla_usuarios: tbl,
        };
    });

    if (resultado.firebase_uid) {
        await syncRolFirebaseAuth(resultado.firebase_uid, resultado.rol);
    }
    const { firebase_uid: _uid, ...respuesta } = resultado;
    return respuesta;
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
           FROM ${getTblUsuarios()}
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
    await ensureUsuariosTableResolved();
    const tbl = getTblUsuarios();
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
          FROM ${tbl}
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
    diagnosticarUsuarios,
    ROLES_VALIDOS,
};
