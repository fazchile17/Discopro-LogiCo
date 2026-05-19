/**
 * Cambios de estado del pedido y registro de entregas.
 */
const { withTransaction } = require('./db');
const {
    ValidationError,
    NotFoundError,
    BusinessRuleError,
} = require('./errors');

const ESTADOS_VALIDOS = [
    'retiro_receta',
    'en_ruta',
    'entregado',
    'no_entregado',
    'reprogramado',
    'retiro_pedido',
];

// Transiciones permitidas (origen → destinos válidos)
const TRANSICIONES = {
    retiro_receta: ['retiro_pedido', 'reprogramado'],
    retiro_pedido: ['en_ruta', 'reprogramado', 'no_entregado'],
    en_ruta: ['entregado', 'no_entregado'],
    no_entregado: ['reprogramado', 'retiro_pedido'],
    reprogramado: ['retiro_receta', 'retiro_pedido'],
    entregado: [],
};

/**
 * cambiar_estado_pedido(): inserta historial y deja que el trigger
 * sincronice pedidos.estado_actual_id.
 */
async function cambiarEstadoPedido({ pedidoId, nuevoEstado, comentario, usuario }) {
    if (!ESTADOS_VALIDOS.includes(nuevoEstado)) {
        throw new ValidationError(`Estado '${nuevoEstado}' no es válido.`);
    }

    return withTransaction(async (client) => {
        const { rows: pedidoRows } = await client.query(
            `SELECT p.id_pedido, p.activo, e.nombre_estado AS estado_actual
               FROM pedidos p
               JOIN estados_pedido e ON e.id_estado = p.estado_actual_id
              WHERE p.id_pedido = $1
              FOR UPDATE`,
            [pedidoId]
        );
        const pedido = pedidoRows[0];
        if (!pedido) throw new NotFoundError('Pedido no encontrado.');
        if (!pedido.activo) {
            throw new BusinessRuleError('El pedido está inactivo.');
        }

        const permitidos = TRANSICIONES[pedido.estado_actual] || [];
        if (!permitidos.includes(nuevoEstado)) {
            throw new BusinessRuleError(
                `Transición inválida: '${pedido.estado_actual}' → '${nuevoEstado}'. ` +
                `Permitidos: [${permitidos.join(', ') || 'ninguno'}].`
            );
        }

        // Si el motorista actualiza, debe ser el motorista asignado a la ruta activa.
        if (usuario.rol === 'motorista') {
            const { rows: rutaRows } = await client.query(
                `SELECT motorista_id FROM rutas
                  WHERE pedido_id = $1 AND estado_ruta IN ('asignada','en_curso')
                  LIMIT 1`,
                [pedidoId]
            );
            if (!rutaRows[0] || Number(rutaRows[0].motorista_id) !== Number(usuario.id_usuario)) {
                throw new BusinessRuleError(
                    'Solo el motorista asignado puede actualizar este pedido.'
                );
            }
        }

        const { rows: estadoRows } = await client.query(
            `SELECT id_estado FROM estados_pedido WHERE nombre_estado = $1`,
            [nuevoEstado]
        );
        const estadoId = estadoRows[0].id_estado;

        const { rows: histRows } = await client.query(
            `INSERT INTO historial_estados (pedido_id, estado_id, comentario, usuario_id)
             VALUES ($1, $2, $3, $4)
             RETURNING *`,
            [pedidoId, estadoId, comentario || null, usuario.id_usuario]
        );

        // Si el nuevo estado es terminal (entregado), cerramos la ruta.
        if (nuevoEstado === 'entregado') {
            await client.query(
                `UPDATE rutas
                    SET estado_ruta = 'finalizada',
                        fecha_fin = NOW()
                  WHERE pedido_id = $1
                    AND estado_ruta IN ('asignada','en_curso')`,
                [pedidoId]
            );
        }

        return histRows[0];
    });
}

/**
 * registrar_entrega(): atajo de cambiar_estado_pedido a 'entregado'.
 * Acepta foto o comentario adicional.
 */
async function registrarEntrega({ pedidoId, comentario, usuario }) {
    return cambiarEstadoPedido({
        pedidoId,
        nuevoEstado: 'entregado',
        comentario: comentario || 'Entrega confirmada',
        usuario,
    });
}

module.exports = {
    cambiarEstadoPedido,
    registrarEntrega,
    ESTADOS_VALIDOS,
    TRANSICIONES,
};
