/**
 * Manejo de evidencias (archivos en Firebase Storage + metadatos en SQL).
 * El binario lo sube el cliente directo a Storage; aquí solo registramos
 * la referencia para que el sistema relacional sepa que existe.
 */
const { query } = require('./db');
const { ValidationError, NotFoundError } = require('./errors');

const TIPOS_VALIDOS = ['entrega', 'incidencia', 'firma', 'otro'];

async function registrarEvidencia({
    pedidoId,
    incidenciaId = null,
    tipo,
    storagePath,
    downloadUrl,
    mimeType,
    tamanoBytes,
    usuario,
}) {
    if (!pedidoId || !storagePath || !tipo) {
        throw new ValidationError('pedidoId, storagePath y tipo son obligatorios.');
    }
    if (!TIPOS_VALIDOS.includes(tipo)) {
        throw new ValidationError(`tipo inválido. Valores: ${TIPOS_VALIDOS.join(', ')}`);
    }

    // Verificar que el pedido existe
    const { rows: pr } = await query(
        `SELECT id_pedido FROM pedidos WHERE id_pedido = $1`,
        [pedidoId]
    );
    if (!pr[0]) throw new NotFoundError('Pedido no encontrado.');

    const { rows } = await query(
        `INSERT INTO evidencias (
            pedido_id, incidencia_id, tipo, storage_path, download_url,
            mime_type, tamano_bytes, subido_por
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         RETURNING *`,
        [
            pedidoId,
            incidenciaId,
            tipo,
            storagePath,
            downloadUrl || null,
            mimeType || null,
            tamanoBytes || null,
            usuario.id_usuario,
        ]
    );
    return rows[0];
}

async function listarEvidencias(pedidoId) {
    const { rows } = await query(
        `SELECT e.*, u.nombre || ' ' || u.apellido AS subido_por_nombre
           FROM evidencias e
           JOIN usuarios u ON u.id_usuario = e.subido_por
          WHERE e.pedido_id = $1
          ORDER BY e.fecha_subida DESC`,
        [pedidoId]
    );
    return rows;
}

module.exports = { registrarEvidencia, listarEvidencias, TIPOS_VALIDOS };
