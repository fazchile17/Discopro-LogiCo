/**
 * Reprogramación de pedidos.
 */
const { withTransaction } = require('./db');
const {
    ValidationError,
    NotFoundError,
    BusinessRuleError,
} = require('./errors');

/**
 * reprogramar_pedido(): cambia fecha programada y deja historial.
 */
async function reprogramarPedido({ pedidoId, fechaNueva, motivo, usuario }) {
    if (!pedidoId || !fechaNueva || !motivo) {
        throw new ValidationError('pedidoId, fechaNueva y motivo son obligatorios.');
    }
    const fn = new Date(fechaNueva);
    if (Number.isNaN(fn.getTime())) {
        throw new ValidationError('fechaNueva inválida (use ISO 8601).');
    }

    return withTransaction(async (client) => {
        const { rows } = await client.query(
            `SELECT id_pedido, fecha_programada, activo
               FROM pedidos WHERE id_pedido = $1 FOR UPDATE`,
            [pedidoId]
        );
        const pedido = rows[0];
        if (!pedido) throw new NotFoundError('Pedido no encontrado.');
        if (!pedido.activo) throw new BusinessRuleError('Pedido inactivo.');
        if (fn <= new Date(pedido.fecha_programada)) {
            throw new ValidationError(
                'La nueva fecha debe ser posterior a la fecha programada actual.'
            );
        }

        const { rows: repRows } = await client.query(
            `INSERT INTO reprogramaciones
                (pedido_id, fecha_anterior, fecha_nueva, motivo, usuario_id)
             VALUES ($1,$2,$3,$4,$5)
             RETURNING *`,
            [pedidoId, pedido.fecha_programada, fn.toISOString(), motivo.trim(), usuario.id_usuario]
        );

        await client.query(
            `UPDATE pedidos
                SET fecha_programada = $1,
                    operadora_modifica_id = $2
              WHERE id_pedido = $3`,
            [fn.toISOString(), usuario.id_usuario, pedidoId]
        );

        const { rows: estadoRows } = await client.query(
            `SELECT id_estado FROM estados_pedido WHERE nombre_estado='reprogramado'`
        );
        await client.query(
            `INSERT INTO historial_estados (pedido_id, estado_id, comentario, usuario_id)
             VALUES ($1,$2,$3,$4)`,
            [
                pedidoId,
                estadoRows[0].id_estado,
                `Reprogramado al ${fn.toISOString()}: ${motivo.trim()}`,
                usuario.id_usuario,
            ]
        );

        return repRows[0];
    });
}

module.exports = { reprogramarPedido };
