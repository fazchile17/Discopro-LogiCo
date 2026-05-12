/**
 * Módulo de pedidos: crear, listar, consultar.
 */
const { withTransaction, query } = require('./db');
const { ValidationError, NotFoundError } = require('./errors');

function generarCodigoPedido() {
    const ts = Date.now().toString(36).toUpperCase();
    const rnd = Math.random().toString(36).slice(2, 6).toUpperCase();
    return `PED-${ts}-${rnd}`;
}

function validarPayloadPedido(p) {
    const obligatorios = [
        'nombre_cliente',
        'direccion_entrega',
        'telefono_cliente',
        'detalle_pedido',
        'fecha_programada',
    ];
    const faltan = obligatorios.filter((k) => !p[k] || String(p[k]).trim() === '');
    if (faltan.length) {
        throw new ValidationError(`Campos obligatorios faltantes: ${faltan.join(', ')}`);
    }
    const fp = new Date(p.fecha_programada);
    if (Number.isNaN(fp.getTime())) {
        throw new ValidationError('fecha_programada inválida (use ISO 8601).');
    }
}

/**
 * crear_pedido(): registra un pedido nuevo, su estado inicial y el historial.
 * Solo operadora/admin.
 */
async function crearPedido({ payload, usuario }) {
    validarPayloadPedido(payload);

    return withTransaction(async (client) => {
        // Estado inicial: 'retiro_receta' por defecto (operadora gestionará flujo)
        const estadoInicialNombre = payload.estado_inicial || 'retiro_receta';
        const { rows: estados } = await client.query(
            `SELECT id_estado FROM estados_pedido WHERE nombre_estado = $1`,
            [estadoInicialNombre]
        );
        if (!estados[0]) {
            throw new ValidationError(`Estado inicial '${estadoInicialNombre}' no existe.`);
        }
        const estadoId = estados[0].id_estado;

        const codigo = payload.codigo_pedido || generarCodigoPedido();

        // farmacia_id es opcional. Si viene, validamos que exista y esté activa.
        let farmaciaId = null;
        if (payload.farmacia_id != null && payload.farmacia_id !== '') {
            farmaciaId = Number(payload.farmacia_id);
            if (!Number.isFinite(farmaciaId)) {
                throw new ValidationError('farmacia_id inválido.');
            }
            const { rows: f } = await client.query(
                `SELECT id_farmacia, activa FROM farmacias WHERE id_farmacia = $1`,
                [farmaciaId]
            );
            if (!f[0]) throw new ValidationError('Farmacia no existe.');
            if (!f[0].activa) throw new ValidationError('La farmacia está desactivada.');
        }

        const { rows: pedidoRows } = await client.query(
            `INSERT INTO pedidos (
                codigo_pedido, nombre_cliente, direccion_entrega, telefono_cliente,
                detalle_pedido, observacion, fecha_programada,
                estado_actual_id, operadora_crea_id, farmacia_id
             ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
             RETURNING *`,
            [
                codigo,
                payload.nombre_cliente.trim(),
                payload.direccion_entrega.trim(),
                payload.telefono_cliente.trim(),
                payload.detalle_pedido.trim(),
                payload.observacion ? payload.observacion.trim() : null,
                payload.fecha_programada,
                estadoId,
                usuario.id_usuario,
                farmaciaId,
            ]
        );
        const pedido = pedidoRows[0];

        await client.query(
            `INSERT INTO historial_estados (pedido_id, estado_id, comentario, usuario_id)
             VALUES ($1, $2, $3, $4)`,
            [pedido.id_pedido, estadoId, 'Pedido creado', usuario.id_usuario]
        );

        return pedido;
    });
}

/**
 * Listar pedidos con filtros opcionales.
 */
async function listarPedidos({ estado, motoristaId, soloActivos = true, limit = 100 }) {
    const filtros = [];
    const params = [];
    if (soloActivos) filtros.push('p.activo = TRUE');
    if (estado) {
        params.push(estado);
        filtros.push(`e.nombre_estado = $${params.length}`);
    }
    if (motoristaId) {
        params.push(motoristaId);
        filtros.push(`r.motorista_id = $${params.length}`);
    }

    params.push(Number(limit) || 100);
    const sql = `
        SELECT p.id_pedido, p.codigo_pedido, p.nombre_cliente, p.direccion_entrega,
               p.telefono_cliente, p.detalle_pedido, p.observacion,
               p.fecha_creacion, p.fecha_programada, p.activo,
               p.farmacia_id, f.nombre AS farmacia_nombre,
               co.nombre AS farmacia_comuna, reg.nombre AS farmacia_region,
               reg.codigo_romano AS farmacia_region_codigo,
               e.nombre_estado AS estado_actual,
               r.id_ruta, r.codigo_ruta, r.estado_ruta, r.motorista_id,
               m.nombre AS motorista_nombre, m.apellido AS motorista_apellido
          FROM pedidos p
          JOIN estados_pedido e ON e.id_estado = p.estado_actual_id
          LEFT JOIN rutas r ON r.pedido_id = p.id_pedido
                            AND r.estado_ruta IN ('asignada','en_curso','finalizada')
          LEFT JOIN usuarios m ON m.id_usuario = r.motorista_id
          LEFT JOIN farmacias  f   ON f.id_farmacia = p.farmacia_id
          LEFT JOIN comunas    co  ON co.id_comuna  = f.comuna_id
          LEFT JOIN provincias pr  ON pr.id_provincia = co.provincia_id
          LEFT JOIN regiones   reg ON reg.id_region = pr.region_id
         ${filtros.length ? 'WHERE ' + filtros.join(' AND ') : ''}
         ORDER BY p.fecha_programada DESC
         LIMIT $${params.length}`;
    const { rows } = await query(sql, params);
    return rows;
}

async function obtenerPedido(idPedido) {
    const { rows } = await query(
        `SELECT * FROM v_pedidos_completos WHERE id_pedido = $1`,
        [idPedido]
    );
    if (!rows[0]) throw new NotFoundError('Pedido no encontrado.');

    const { rows: historial } = await query(
        `SELECT h.id_historial, h.fecha_hora, h.comentario,
                e.nombre_estado, u.nombre || ' ' || u.apellido AS usuario
           FROM historial_estados h
           JOIN estados_pedido e ON e.id_estado = h.estado_id
           JOIN usuarios u ON u.id_usuario = h.usuario_id
          WHERE h.pedido_id = $1
          ORDER BY h.fecha_hora ASC`,
        [idPedido]
    );

    return { ...rows[0], historial };
}

module.exports = { crearPedido, listarPedidos, obtenerPedido };
