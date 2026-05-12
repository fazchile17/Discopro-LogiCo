/**
 * Módulo de farmacias: CRUD con validación + auditoría.
 *
 * Reglas:
 *   - Solo admin puede crear / actualizar / desactivar farmacias.
 *   - Toda mutación se registra en la tabla `auditoria`.
 *   - Las desactivaciones son lógicas (NO DELETE físico).
 *   - La dirección sigue una jerarquía: región → provincia → comuna.
 *     El cliente solo necesita pasar `comuna_id` (la comuna ya
 *     determina su provincia y región vía FK).
 */
const { withTransaction, pool } = require('./db');
const { ValidationError, NotFoundError } = require('./errors');
const { registrarAuditoria, ACCIONES } = require('./auditoria');
const { existeComuna } = require('./geografia');

const SELECT_BASE = `
    SELECT  f.id_farmacia,
            f.nombre,
            f.direccion,
            f.telefono,
            f.activa,
            f.fecha_creacion,
            f.comuna_id,
            COALESCE(c.nombre, '(sin comuna en catálogo)') AS comuna,
            pp.id_provincia,
            COALESCE(pp.nombre, '—') AS provincia,
            r.id_region,
            COALESCE(r.nombre, '—') AS region,
            COALESCE(r.codigo_romano, '—') AS region_codigo
      FROM farmacias f
      LEFT JOIN comunas    c  ON c.id_comuna  = f.comuna_id
      LEFT JOIN provincias pp ON pp.id_provincia = c.provincia_id
      LEFT JOIN regiones   r  ON r.id_region = pp.region_id`;

async function validarPayload(p, { parcial = false } = {}) {
    const errores = [];

    if (!parcial) {
        if (!p.nombre || String(p.nombre).trim() === '') errores.push('nombre es obligatorio');
        if (!p.direccion || String(p.direccion).trim() === '') errores.push('direccion es obligatoria');
        if (p.comuna_id == null || p.comuna_id === '') errores.push('comuna_id es obligatorio');
    }

    if (p.nombre && p.nombre.length > 120) errores.push('nombre demasiado largo');
    if (p.direccion && p.direccion.length > 255) errores.push('direccion demasiado larga');
    if (p.telefono && p.telefono.length > 30) errores.push('telefono demasiado largo');

    if (p.comuna_id != null && p.comuna_id !== '') {
        const idC = Number(p.comuna_id);
        if (!Number.isFinite(idC)) {
            errores.push('comuna_id inválido');
        } else if (!(await existeComuna(idC))) {
            errores.push('comuna_id no existe en el catálogo');
        }
    }

    if (errores.length) throw new ValidationError(errores.join('; '));
}

async function crearFarmacia({ payload, usuario, req }) {
    await validarPayload(payload);

    return withTransaction(async (client) => {
        const { rows } = await client.query(
            `INSERT INTO farmacias (nombre, direccion, telefono, comuna_id, activa)
             VALUES ($1,$2,$3,$4, COALESCE($5, TRUE))
             RETURNING id_farmacia`,
            [
                payload.nombre.trim(),
                payload.direccion.trim(),
                payload.telefono ? String(payload.telefono).trim() : null,
                Number(payload.comuna_id),
                payload.activa,
            ]
        );

        // Recuperamos con JOINs para devolver el modelo enriquecido.
        const { rows: full } = await client.query(
            `${SELECT_BASE} WHERE f.id_farmacia = $1`,
            [rows[0].id_farmacia]
        );
        const farmacia = full[0];

        await registrarAuditoria({
            client,
            usuario,
            accion: ACCIONES.FARMACIA_CREADA,
            entidadAfectada: 'farmacia',
            idEntidad: farmacia.id_farmacia,
            detalle: {
                nombre: farmacia.nombre,
                comuna: farmacia.comuna,
                region: farmacia.region,
            },
            req,
        });
        return farmacia;
    });
}

async function listarFarmacias({ soloActivas = false, regionId, provinciaId, comunaId } = {}) {
    const filtros = [];
    const params = [];

    if (soloActivas) filtros.push('f.activa = TRUE');
    if (regionId != null && regionId !== '') {
        const n = Number(regionId);
        if (Number.isFinite(n)) {
            params.push(n);
            filtros.push(`r.id_region = $${params.length}`);
        }
    }
    if (provinciaId != null && provinciaId !== '') {
        const n = Number(provinciaId);
        if (Number.isFinite(n)) {
            params.push(n);
            filtros.push(`pp.id_provincia = $${params.length}`);
        }
    }
    if (comunaId != null && comunaId !== '') {
        const n = Number(comunaId);
        if (Number.isFinite(n)) {
            params.push(n);
            filtros.push(`f.comuna_id = $${params.length}`);
        }
    }

    const sql = `${SELECT_BASE}
        ${filtros.length ? 'WHERE ' + filtros.join(' AND ') : ''}
        ORDER BY f.activa DESC NULLS LAST,
                 COALESCE(r.orden, 999),
                 COALESCE(c.nombre, ''),
                 f.nombre`;
    const { rows } = await pool.query(sql, params);

    const sinFiltroGeo =
        (regionId == null || regionId === '')
        && (provinciaId == null || provinciaId === '')
        && (comunaId == null || comunaId === '');
    if (sinFiltroGeo) {
        let countSql = 'SELECT COUNT(*)::int AS n FROM farmacias f';
        if (soloActivas) countSql += ' WHERE f.activa = TRUE';
        const { rows: cnt } = await pool.query(countSql);
        const nEsperado = cnt[0]?.n;
        if (Number.isInteger(nEsperado) && nEsperado !== rows.length) {
            console.error(
                '[farmacias] listarFarmacias: el SELECT con JOINs devolvió %d filas pero COUNT en tabla=%d (soloActivas=%s). '
                    + 'Revisa despliegue (¿código antiguo con JOIN interno?) o integridad de comuna_id.',
                rows.length,
                nEsperado,
                soloActivas
            );
        }
    }

    return rows;
}

async function obtenerFarmacia(idFarmacia) {
    const { rows } = await pool.query(
        `${SELECT_BASE} WHERE f.id_farmacia = $1`,
        [Number(idFarmacia)]
    );
    if (!rows[0]) throw new NotFoundError('Farmacia no encontrada.');
    return rows[0];
}

async function actualizarFarmacia({ idFarmacia, payload, usuario, req }) {
    await validarPayload(payload, { parcial: true });

    return withTransaction(async (client) => {
        const { rows: prev } = await client.query(
            `SELECT * FROM farmacias WHERE id_farmacia = $1 FOR UPDATE`,
            [idFarmacia]
        );
        if (!prev[0]) throw new NotFoundError('Farmacia no encontrada.');

        await client.query(
            `UPDATE farmacias SET
                nombre    = COALESCE($2, nombre),
                direccion = COALESCE($3, direccion),
                telefono  = COALESCE($4, telefono),
                comuna_id = COALESCE($5, comuna_id),
                activa    = COALESCE($6, activa)
             WHERE id_farmacia = $1`,
            [
                idFarmacia,
                payload.nombre ? payload.nombre.trim() : null,
                payload.direccion ? payload.direccion.trim() : null,
                payload.telefono != null ? String(payload.telefono).trim() : null,
                payload.comuna_id ? Number(payload.comuna_id) : null,
                payload.activa,
            ]
        );

        const { rows: full } = await client.query(
            `${SELECT_BASE} WHERE f.id_farmacia = $1`,
            [idFarmacia]
        );
        const farmacia = full[0];

        const cambios = {};
        for (const k of ['nombre', 'direccion', 'telefono', 'comuna_id', 'activa']) {
            if (prev[0][k] !== farmacia[k]) {
                cambios[k] = { antes: prev[0][k], despues: farmacia[k] };
            }
        }
        await registrarAuditoria({
            client,
            usuario,
            accion: ACCIONES.FARMACIA_ACTUALIZADA,
            entidadAfectada: 'farmacia',
            idEntidad: idFarmacia,
            detalle: cambios,
            req,
        });
        return farmacia;
    });
}

async function desactivarFarmacia({ idFarmacia, usuario, req }) {
    return withTransaction(async (client) => {
        const { rows } = await client.query(
            `UPDATE farmacias SET activa = FALSE
              WHERE id_farmacia = $1
              RETURNING id_farmacia, nombre`,
            [idFarmacia]
        );
        if (!rows[0]) throw new NotFoundError('Farmacia no encontrada.');

        await registrarAuditoria({
            client,
            usuario,
            accion: ACCIONES.FARMACIA_DESACTIVADA,
            entidadAfectada: 'farmacia',
            idEntidad: idFarmacia,
            detalle: { nombre: rows[0].nombre },
            req,
        });

        const { rows: full } = await client.query(
            `${SELECT_BASE} WHERE f.id_farmacia = $1`,
            [idFarmacia]
        );
        return full[0];
    });
}

async function activarFarmacia({ idFarmacia, usuario, req }) {
    return withTransaction(async (client) => {
        const { rows } = await client.query(
            `UPDATE farmacias SET activa = TRUE
              WHERE id_farmacia = $1
              RETURNING id_farmacia, nombre`,
            [idFarmacia]
        );
        if (!rows[0]) throw new NotFoundError('Farmacia no encontrada.');

        await registrarAuditoria({
            client,
            usuario,
            accion: ACCIONES.FARMACIA_ACTIVADA,
            entidadAfectada: 'farmacia',
            idEntidad: idFarmacia,
            detalle: { nombre: rows[0].nombre },
            req,
        });

        const { rows: full } = await client.query(
            `${SELECT_BASE} WHERE f.id_farmacia = $1`,
            [idFarmacia]
        );
        return full[0];
    });
}

module.exports = {
    crearFarmacia,
    listarFarmacias,
    obtenerFarmacia,
    actualizarFarmacia,
    desactivarFarmacia,
    activarFarmacia,
};
