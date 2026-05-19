/**
 * Registro de incidencias asociadas a pedidos / rutas.
 */
const { withTransaction, query } = require('./db');
const {
    ValidationError,
    NotFoundError,
    BusinessRuleError,
} = require('./errors');

const TIPOS_VALIDOS = [
    'cliente_ausente',
    'direccion_incorrecta',
    'rechazo_cliente',
    'accidente',
    'producto_danado',
    'otro',
];

/**
 * registrar_incidencia(): crea una incidencia y opcionalmente cambia
 * el estado del pedido a 'no_entregado'.
 */
async function registrarIncidencia({
    pedidoId,
    tipoIncidencia,
    descripcion,
    cambiarANoEntregado = true,
    usuario,
}) {
    if (!pedidoId) throw new ValidationError('pedidoId es obligatorio.');
    if (!TIPOS_VALIDOS.includes(tipoIncidencia)) {
        throw new ValidationError(`tipo_incidencia inválido. Valores: ${TIPOS_VALIDOS.join(', ')}`);
    }
    if (!descripcion || descripcion.trim() === '') {
        throw new ValidationError('descripcion es obligatoria.');
    }

    return withTransaction(async (client) => {
        const { rows: pedidoRows } = await client.query(
            `SELECT id_pedido, activo FROM pedidos WHERE id_pedido = $1 FOR UPDATE`,
            [pedidoId]
        );
        if (!pedidoRows[0]) throw new NotFoundError('Pedido no encontrado.');
        if (!pedidoRows[0].activo) throw new BusinessRuleError('Pedido inactivo.');

        const { rows: rutaRows } = await client.query(
            `SELECT id_ruta, motorista_id, estado_ruta FROM rutas
              WHERE pedido_id = $1
              ORDER BY fecha_asignacion DESC LIMIT 1`,
            [pedidoId]
        );
        const ruta = rutaRows[0] || null;

        // Motorista solo puede reportar incidencias de su propia ruta
        if (usuario.rol === 'motorista') {
            if (!ruta || Number(ruta.motorista_id) !== Number(usuario.id_usuario)) {
                throw new BusinessRuleError(
                    'Solo el motorista asignado puede registrar incidencias de este pedido.'
                );
            }
        }

        const { rows: incRows } = await client.query(
            `INSERT INTO incidencias (
                pedido_id, ruta_id, tipo_incidencia, descripcion, usuario_id
             ) VALUES ($1,$2,$3,$4,$5)
             RETURNING *`,
            [pedidoId, ruta?.id_ruta || null, tipoIncidencia, descripcion.trim(), usuario.id_usuario]
        );

        if (cambiarANoEntregado) {
            const { rows: estadoRows } = await client.query(
                `SELECT id_estado FROM estados_pedido WHERE nombre_estado='no_entregado'`
            );
            await client.query(
                `INSERT INTO historial_estados (pedido_id, estado_id, comentario, usuario_id)
                 VALUES ($1,$2,$3,$4)`,
                [
                    pedidoId,
                    estadoRows[0].id_estado,
                    `Incidencia: ${tipoIncidencia} - ${descripcion.trim()}`,
                    usuario.id_usuario,
                ]
            );
            // Cancelamos la ruta para liberar al motorista
            if (ruta && ['asignada', 'en_curso'].includes(ruta.estado_ruta)) {
                await client.query(
                    `UPDATE rutas SET estado_ruta='cancelada', fecha_fin=NOW()
                      WHERE id_ruta=$1`,
                    [ruta.id_ruta]
                );
            }
        }

        return incRows[0];
    });
}

async function listarIncidenciasPedido(pedidoId) {
    const { rows } = await query(
        `SELECT i.*, u.nombre || ' ' || u.apellido AS usuario
           FROM incidencias i
           JOIN usuarios u ON u.id_usuario = i.usuario_id
          WHERE i.pedido_id = $1
          ORDER BY i.fecha_hora DESC`,
        [pedidoId]
    );
    return rows;
}

module.exports = { registrarIncidencia, listarIncidenciasPedido, TIPOS_VALIDOS };
