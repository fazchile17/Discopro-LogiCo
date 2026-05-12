/**
 * Módulo de catálogo geográfico de Chile.
 *
 * Provee el árbol región → provincia → comuna usado por farmacias y,
 * potencialmente, por reportes geográficos. Solo lectura: el catálogo
 * se modifica vía migraciones SQL, no por endpoints HTTP.
 */
const { pool } = require('./db');
const { NotFoundError } = require('./errors');

/**
 * Lista las 16 regiones de Chile en orden norte → sur.
 */
async function listarRegiones() {
    const { rows } = await pool.query(
        `SELECT id_region, nombre, codigo_romano, orden
           FROM regiones
          ORDER BY orden ASC`
    );
    return rows;
}

/**
 * Lista provincias de una región.
 */
async function listarProvincias(idRegion) {
    const id = Number(idRegion);
    if (!Number.isFinite(id)) throw new NotFoundError('Región inválida.');

    const { rows } = await pool.query(
        `SELECT id_provincia, region_id, nombre
           FROM provincias
          WHERE region_id = $1
          ORDER BY nombre ASC`,
        [id]
    );
    return rows;
}

/**
 * Lista comunas de una provincia.
 */
async function listarComunas(idProvincia) {
    const id = Number(idProvincia);
    if (!Number.isFinite(id)) throw new NotFoundError('Provincia inválida.');

    const { rows } = await pool.query(
        `SELECT id_comuna, provincia_id, nombre
           FROM comunas
          WHERE provincia_id = $1
          ORDER BY nombre ASC`,
        [id]
    );
    return rows;
}

/**
 * Devuelve el árbol completo en una sola query (útil para llenar de
 * un solo golpe los dropdowns dependientes en el cliente, sin hacer
 * N+1 requests).
 */
async function obtenerArbolGeografico() {
    const { rows } = await pool.query(
        `SELECT r.id_region,
                r.nombre        AS region_nombre,
                r.codigo_romano AS region_codigo,
                r.orden         AS region_orden,
                p.id_provincia,
                p.nombre        AS provincia_nombre,
                c.id_comuna,
                c.nombre        AS comuna_nombre
           FROM regiones r
           LEFT JOIN provincias p ON p.region_id    = r.id_region
           LEFT JOIN comunas    c ON c.provincia_id = p.id_provincia
          ORDER BY r.orden, p.nombre, c.nombre`
    );

    // Convertir filas planas a árbol anidado.
    const regionesMap = new Map();
    const provinciasMap = new Map();

    for (const row of rows) {
        let region = regionesMap.get(row.id_region);
        if (!region) {
            region = {
                id_region: row.id_region,
                nombre: row.region_nombre,
                codigo_romano: row.region_codigo,
                orden: row.region_orden,
                provincias: [],
            };
            regionesMap.set(row.id_region, region);
        }

        if (row.id_provincia == null) continue;

        let provincia = provinciasMap.get(row.id_provincia);
        if (!provincia) {
            provincia = {
                id_provincia: row.id_provincia,
                nombre: row.provincia_nombre,
                comunas: [],
            };
            provinciasMap.set(row.id_provincia, provincia);
            region.provincias.push(provincia);
        }

        if (row.id_comuna != null) {
            provincia.comunas.push({
                id_comuna: row.id_comuna,
                nombre: row.comuna_nombre,
            });
        }
    }

    return Array.from(regionesMap.values());
}

/**
 * Verifica que un id_comuna exista. Útil para validación previa
 * antes de operaciones que toman `comuna_id` por payload.
 */
async function existeComuna(idComuna) {
    const { rows } = await pool.query(
        `SELECT 1 FROM comunas WHERE id_comuna = $1`,
        [Number(idComuna)]
    );
    return rows.length > 0;
}

module.exports = {
    listarRegiones,
    listarProvincias,
    listarComunas,
    obtenerArbolGeografico,
    existeComuna,
};
