/**
 * Módulo de rutas y disponibilidad de motoristas.
 */
const { withTransaction, query } = require('./db');
const {
    ValidationError,
    NotFoundError,
    BusinessRuleError,
    ConflictError,
} = require('./errors');

function generarCodigoRuta() {
    const ts = Date.now().toString(36).toUpperCase();
    const rnd = Math.random().toString(36).slice(2, 5).toUpperCase();
    return `RUT-${ts}-${rnd}`;
}

/**
 * validar_disponibilidad_motorista(): verifica que el motorista exista,
 * sea rol motorista, esté activo, marcado disponible y sin ruta activa.
 */
async function validarDisponibilidadMotorista(motoristaId) {
    const { rows } = await query(
        `SELECT u.id_usuario, u.rol, u.activo,
                COALESCE(d.disponible, TRUE) AS disponible,
                EXISTS (
                    SELECT 1 FROM rutas r
                     WHERE r.motorista_id = u.id_usuario
                       AND r.estado_ruta IN ('asignada','en_curso')
                ) AS tiene_ruta_activa
           FROM usuarios u
           LEFT JOIN disponibilidad_motorista d ON d.motorista_id = u.id_usuario
          WHERE u.id_usuario = $1`,
        [motoristaId]
    );
    const m = rows[0];
    if (!m) throw new NotFoundError('Motorista no encontrado.');
    if (m.rol !== 'motorista') {
        throw new ValidationError('El usuario no tiene rol motorista.');
    }
    if (!m.activo) {
        throw new BusinessRuleError('El motorista está desactivado.');
    }
    if (m.tiene_ruta_activa) {
        throw new BusinessRuleError('El motorista ya tiene una ruta activa.');
    }
    if (!m.disponible) {
        throw new BusinessRuleError('El motorista está marcado como no disponible.');
    }
    return true;
}

/**
 * asignar_motorista(): asigna un motorista a un pedido creando la ruta.
 * Reglas: 1 ruta activa por pedido, 1 ruta activa por motorista.
 */
async function asignarMotorista({ pedidoId, motoristaId, usuario }) {
    if (!pedidoId || !motoristaId) {
        throw new ValidationError('pedidoId y motoristaId son obligatorios.');
    }

    return withTransaction(async (client) => {
        // Bloqueo a nivel fila para evitar carreras
        const { rows: pedidoRows } = await client.query(
            `SELECT id_pedido, activo FROM pedidos WHERE id_pedido = $1 FOR UPDATE`,
            [pedidoId]
        );
        if (!pedidoRows[0]) throw new NotFoundError('Pedido no encontrado.');
        if (!pedidoRows[0].activo) {
            throw new BusinessRuleError('El pedido está inactivo.');
        }

        // ¿Pedido ya tiene ruta activa?
        const { rows: rutaActiva } = await client.query(
            `SELECT 1 FROM rutas
              WHERE pedido_id = $1 AND estado_ruta IN ('asignada','en_curso')`,
            [pedidoId]
        );
        if (rutaActiva.length) {
            throw new ConflictError('El pedido ya tiene una ruta activa.');
        }

        // Validar motorista disponible
        const { rows: motoRows } = await client.query(
            `SELECT u.id_usuario, u.rol, u.activo,
                    COALESCE(d.disponible, TRUE) AS disponible
               FROM usuarios u
               LEFT JOIN disponibilidad_motorista d ON d.motorista_id = u.id_usuario
              WHERE u.id_usuario = $1
              FOR UPDATE OF u`,
            [motoristaId]
        );
        const m = motoRows[0];
        if (!m) throw new NotFoundError('Motorista no encontrado.');
        if (m.rol !== 'motorista') {
            throw new ValidationError('El usuario no es motorista.');
        }
        if (!m.activo) throw new BusinessRuleError('Motorista desactivado.');
        if (!m.disponible) {
            throw new BusinessRuleError('Motorista marcado como no disponible.');
        }

        const { rows: motoActiva } = await client.query(
            `SELECT 1 FROM rutas
              WHERE motorista_id = $1 AND estado_ruta IN ('asignada','en_curso')`,
            [motoristaId]
        );
        if (motoActiva.length) {
            throw new ConflictError('El motorista ya tiene una ruta activa.');
        }

        // Crear ruta
        const { rows: rutaRows } = await client.query(
            `INSERT INTO rutas (codigo_ruta, pedido_id, motorista_id, estado_ruta)
             VALUES ($1,$2,$3,'asignada')
             RETURNING *`,
            [generarCodigoRuta(), pedidoId, motoristaId]
        );

        // Marcar al pedido en tránsito a "retiro_pedido" (motorista lo va a recoger)
        const { rows: estadoRows } = await client.query(
            `SELECT id_estado FROM estados_pedido WHERE nombre_estado = 'retiro_pedido'`
        );
        await client.query(
            `INSERT INTO historial_estados (pedido_id, estado_id, comentario, usuario_id)
             VALUES ($1,$2,$3,$4)`,
            [
                pedidoId,
                estadoRows[0].id_estado,
                `Asignado al motorista ${motoristaId}`,
                usuario.id_usuario,
            ]
        );

        return rutaRows[0];
    });
}

/**
 * Iniciar ruta (motorista pasa de 'asignada' → 'en_curso').
 * Cambia el estado del pedido a 'en_ruta'.
 */
async function iniciarRuta({ rutaId, usuario }) {
    return withTransaction(async (client) => {
        const { rows } = await client.query(
            `SELECT * FROM rutas WHERE id_ruta = $1 FOR UPDATE`,
            [rutaId]
        );
        const ruta = rows[0];
        if (!ruta) throw new NotFoundError('Ruta no encontrada.');
        if (Number(ruta.motorista_id) !== Number(usuario.id_usuario) && usuario.rol !== 'admin') {
            throw new BusinessRuleError('Solo el motorista asignado puede iniciar la ruta.');
        }
        if (ruta.estado_ruta !== 'asignada') {
            throw new BusinessRuleError(`La ruta está en estado '${ruta.estado_ruta}'.`);
        }

        await client.query(
            `UPDATE rutas SET estado_ruta='en_curso', fecha_inicio=NOW() WHERE id_ruta=$1`,
            [rutaId]
        );

        const { rows: estados } = await client.query(
            `SELECT id_estado FROM estados_pedido WHERE nombre_estado='en_ruta'`
        );
        await client.query(
            `INSERT INTO historial_estados (pedido_id, estado_id, comentario, usuario_id)
             VALUES ($1,$2,$3,$4)`,
            [ruta.pedido_id, estados[0].id_estado, 'Motorista inició la ruta', usuario.id_usuario]
        );

        return { ...ruta, estado_ruta: 'en_curso' };
    });
}

async function listarRutasDeMotorista(motoristaId) {
    const { rows } = await query(
        `SELECT r.*, p.codigo_pedido, p.nombre_cliente, p.direccion_entrega,
                p.telefono_cliente, p.detalle_pedido, p.fecha_programada,
                e.nombre_estado AS estado_pedido
           FROM rutas r
           JOIN pedidos p ON p.id_pedido = r.pedido_id
           JOIN estados_pedido e ON e.id_estado = p.estado_actual_id
          WHERE r.motorista_id = $1
          ORDER BY r.fecha_asignacion DESC
          LIMIT 100`,
        [motoristaId]
    );
    return rows;
}

async function listarMotoristasDisponibles() {
    const { rows } = await query(
        `SELECT id_usuario, nombre, apellido, correo, disponible, sin_ruta_activa
           FROM v_motoristas_disponibles
          WHERE disponible = TRUE AND sin_ruta_activa = TRUE
          ORDER BY nombre`
    );
    return rows;
}

async function actualizarDisponibilidad({ motoristaId, disponible }) {
    if (typeof disponible !== 'boolean') {
        throw new ValidationError('disponible debe ser boolean.');
    }
    const { rows } = await query(
        `INSERT INTO disponibilidad_motorista (motorista_id, disponible)
              VALUES ($1, $2)
         ON CONFLICT (motorista_id) DO UPDATE
              SET disponible = EXCLUDED.disponible,
                  fecha_actualizacion = NOW()
         RETURNING *`,
        [motoristaId, disponible]
    );
    return rows[0];
}

module.exports = {
    asignarMotorista,
    iniciarRuta,
    validarDisponibilidadMotorista,
    listarRutasDeMotorista,
    listarMotoristasDisponibles,
    actualizarDisponibilidad,
};
