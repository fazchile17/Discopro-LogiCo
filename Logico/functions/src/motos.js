/**
 * Mantenedor de motos — CRUD admin.
 */
const { pool } = require('./db');
const {
    ensureUsuariosTableResolved,
    getTblUsuarios,
} = require('./usuarios-table');
const { ValidationError, NotFoundError, ConflictError } = require('./errors');
const { registrarAuditoria, ACCIONES } = require('./auditoria');

const TBL_MOTOS = 'public.motos';

function buildSelectSql() {
    const tblUsuarios = getTblUsuarios();
    return `
    SELECT  m.id_moto, m.patente, m.marca, m.modelo, m.anio,
            m.motorista_id, m.activa, m.fecha_creacion,
            NULLIF(TRIM(COALESCE(u.nombre, '') || ' ' || COALESCE(u.apellido, '')), '') AS motorista_nombre,
            u.correo AS motorista_correo
      FROM ${TBL_MOTOS} m
      LEFT JOIN ${tblUsuarios} u ON u.id_usuario = m.motorista_id`;
}

function mapMotoRow(row) {
    if (!row) return row;
    return {
        ...row,
        id_moto: Number(row.id_moto),
        motorista_id: row.motorista_id != null ? Number(row.motorista_id) : null,
        anio: row.anio != null ? Number(row.anio) : null,
        activa: row.activa === true || row.activa === 't',
    };
}

function validarPayload(p, { parcial = false } = {}) {
    const errores = [];
    if (!parcial) {
        if (!p.patente || String(p.patente).trim() === '') errores.push('patente es obligatoria');
        if (!p.marca || String(p.marca).trim() === '') errores.push('marca es obligatoria');
        if (!p.modelo || String(p.modelo).trim() === '') errores.push('modelo es obligatorio');
    }
    if (p.patente && p.patente.length > 12) errores.push('patente demasiado larga');
    if (p.anio != null && p.anio !== '') {
        const a = Number(p.anio);
        if (!Number.isFinite(a) || a < 1990 || a > 2100) errores.push('anio inválido');
    }
    if (errores.length) throw new ValidationError(errores.join('; '));
}

async function validarMotoristaAsignado(motoristaId) {
    if (!motoristaId) return;
    await ensureUsuariosTableResolved();
    const tbl = getTblUsuarios();
    const { rows: mot } = await pool.query(
        `SELECT id_usuario, rol::text AS rol, activo
           FROM ${tbl}
          WHERE id_usuario = $1`,
        [Number(motoristaId)]
    );
    if (!mot[0] || mot[0].rol !== 'motorista') {
        throw new ValidationError('motorista_id debe ser un usuario con rol motorista.');
    }
    if (!mot[0].activo) throw new ConflictError('El motorista está inactivo.');
}

async function listarMotos({ soloActivas = true } = {}) {
    await ensureUsuariosTableResolved();
    let sql = buildSelectSql();
    const params = [];
    if (soloActivas) {
        sql += ' WHERE m.activa = TRUE';
    }
    sql += ' ORDER BY m.patente';
    const { rows } = await pool.query(sql, params);
    return rows.map(mapMotoRow);
}

async function obtenerMoto(idMoto) {
    await ensureUsuariosTableResolved();
    const { rows } = await pool.query(
        `${buildSelectSql()} WHERE m.id_moto = $1`,
        [Number(idMoto)]
    );
    if (!rows[0]) throw new NotFoundError('Moto no encontrada.');
    return mapMotoRow(rows[0]);
}

async function obtenerMotoPorMotorista(motoristaId) {
    await ensureUsuariosTableResolved();
    const { rows } = await pool.query(
        `${buildSelectSql()}
          WHERE m.motorista_id = $1 AND m.activa = TRUE
          ORDER BY m.id_moto DESC
          LIMIT 1`,
        [Number(motoristaId)]
    );
    return rows[0] ? mapMotoRow(rows[0]) : null;
}

async function crearMoto({ payload, usuario, req }) {
    validarPayload(payload);
    await ensureUsuariosTableResolved();
    const motoristaId = payload.motorista_id ? Number(payload.motorista_id) : null;
    await validarMotoristaAsignado(motoristaId);

    const { rows } = await pool.query(
        `INSERT INTO ${TBL_MOTOS} (patente, marca, modelo, anio, motorista_id, activa)
         VALUES ($1,$2,$3,$4,$5, COALESCE($6, TRUE))
         RETURNING id_moto`,
        [
            String(payload.patente).trim().toUpperCase(),
            payload.marca.trim(),
            payload.modelo.trim(),
            payload.anio ? Number(payload.anio) : null,
            motoristaId,
            payload.activa,
        ]
    );

    const moto = await obtenerMoto(rows[0].id_moto);
    await registrarAuditoria({
        usuario,
        accion: ACCIONES.MOTO_CREADA,
        entidadAfectada: 'moto',
        idEntidad: moto.id_moto,
        detalle: { patente: moto.patente, motorista_id: moto.motorista_id },
        req,
    });
    return moto;
}

async function actualizarMoto({ idMoto, payload, usuario, req }) {
    validarPayload(payload, { parcial: true });
    await ensureUsuariosTableResolved();
    const id = Number(idMoto);

    const { rows: cur } = await pool.query(
        `SELECT * FROM ${TBL_MOTOS} WHERE id_moto = $1`,
        [id]
    );
    if (!cur[0]) throw new NotFoundError('Moto no encontrada.');

    const patente = payload.patente != null
        ? String(payload.patente).trim().toUpperCase() : cur[0].patente;
    const marca = payload.marca != null ? payload.marca.trim() : cur[0].marca;
    const modelo = payload.modelo != null ? payload.modelo.trim() : cur[0].modelo;
    const anio = payload.anio !== undefined
        ? (payload.anio ? Number(payload.anio) : null) : cur[0].anio;
    const motoristaId = payload.motorista_id !== undefined
        ? (payload.motorista_id ? Number(payload.motorista_id) : null)
        : cur[0].motorista_id;

    await validarMotoristaAsignado(motoristaId);

    await pool.query(
        `UPDATE ${TBL_MOTOS}
            SET patente=$1, marca=$2, modelo=$3, anio=$4, motorista_id=$5
          WHERE id_moto=$6`,
        [patente, marca, modelo, anio, motoristaId, id]
    );

    const moto = await obtenerMoto(id);
    await registrarAuditoria({
        usuario,
        accion: ACCIONES.MOTO_ACTUALIZADA,
        entidadAfectada: 'moto',
        idEntidad: id,
        detalle: { patente: moto.patente, motorista_id: moto.motorista_id },
        req,
    });
    return moto;
}

async function desactivarMoto({ idMoto, usuario, req }) {
    const id = Number(idMoto);
    const { rowCount } = await pool.query(
        `UPDATE ${TBL_MOTOS} SET activa = FALSE, motorista_id = NULL WHERE id_moto = $1`,
        [id]
    );
    if (!rowCount) throw new NotFoundError('Moto no encontrada.');
    await registrarAuditoria({
        usuario,
        accion: ACCIONES.MOTO_DESACTIVADA,
        entidadAfectada: 'moto',
        idEntidad: id,
        detalle: {},
        req,
    });
    return { ok: true, id_moto: id };
}

module.exports = {
    listarMotos,
    obtenerMoto,
    obtenerMotoPorMotorista,
    crearMoto,
    actualizarMoto,
    desactivarMoto,
};
