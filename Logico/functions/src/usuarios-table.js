/**
 * Resuelve la tabla física de usuarios (no una VIEW).
 * En algunos despliegues `public.usuarios` es una vista: el UPDATE parece OK
 * pero el SELECT sigue mostrando el rol anterior.
 */
const { pool, TBL_USUARIOS } = require('./db');

let resolved = TBL_USUARIOS;
let initPromise = null;

async function ensureUsuariosTableResolved() {
    if (process.env.NODE_ENV === 'test') return resolved;
    if (initPromise) return initPromise;

    initPromise = (async () => {
        try {
            const { rows: kind } = await pool.query(
                `SELECT c.relkind
                   FROM pg_class c
                   JOIN pg_namespace n ON n.oid = c.relnamespace
                  WHERE n.nspname = 'public' AND c.relname = 'usuarios'`
            );
            const relkind = kind[0]?.relkind;
            if (relkind === 'v') {
                const { rows: bases } = await pool.query(
                    `SELECT table_schema AS s, table_name AS t
                       FROM information_schema.view_table_usage
                      WHERE view_schema = 'public' AND view_name = 'usuarios'`
                );
                if (bases.length === 1) {
                    resolved = `${bases[0].s}.${bases[0].t}`;
                } else if (bases.length > 1) {
                    const fisica = bases.find(
                        (b) => b.t === 'usuarios' && b.s === 'public'
                    ) || bases[0];
                    resolved = `${fisica.s}.${fisica.t}`;
                }
                console.warn(
                    '[usuarios-table] public.usuarios es VIEW; escritura/lectura en',
                    resolved
                );
            } else {
                resolved = TBL_USUARIOS;
            }
        } catch (e) {
            console.error('[usuarios-table] init falló:', e.message);
            resolved = TBL_USUARIOS;
        }
        return resolved;
    })();

    return initPromise;
}

function getTblUsuarios() {
    return resolved;
}

/** Diagnóstico para errores de rol (admin / logs). */
async function diagnosticarUsuarios(idUsuario) {
    const id = Number(idUsuario);
    const tbl = getTblUsuarios();
    const { rows: entorno } = await pool.query(
        `SELECT current_database() AS db,
                pg_is_in_recovery() AS es_replica,
                current_setting('search_path') AS search_path`
    );
    const { rows: objetos } = await pool.query(
        `SELECT table_schema, table_name, table_type
           FROM information_schema.tables
          WHERE table_name = 'usuarios'
          ORDER BY 1, 2`
    );
    const { rows: relkind } = await pool.query(
        `SELECT c.relkind, n.nspname, c.relname
           FROM pg_class c
           JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE c.relname = 'usuarios'
          ORDER BY n.nspname`
    );
    const rolesPorTabla = {};
    for (const obj of objetos.filter((o) => o.table_type === 'BASE TABLE')) {
        const fq = `${obj.table_schema}.${obj.table_name}`;
        try {
            const { rows } = await pool.query(
                `SELECT id_usuario, correo, rol::text AS rol
                   FROM ${fq}
                  WHERE id_usuario = $1`,
                [id]
            );
            rolesPorTabla[fq] = rows[0] || null;
        } catch (e) {
            rolesPorTabla[fq] = { error: e.message };
        }
    }
    let desdeVista = null;
    try {
        const { rows } = await pool.query(
            `SELECT id_usuario, correo, rol::text AS rol
               FROM public.usuarios WHERE id_usuario = $1`,
            [id]
        );
        desdeVista = rows[0] || null;
    } catch (e) {
        desdeVista = { error: e.message };
    }
    let desdeResuelta = null;
    try {
        const { rows } = await pool.query(
            `SELECT id_usuario, correo, rol::text AS rol
               FROM ${tbl} WHERE id_usuario = $1`,
            [id]
        );
        desdeResuelta = rows[0] || null;
    } catch (e) {
        desdeResuelta = { error: e.message };
    }
    return {
        entorno: entorno[0],
        tabla_activa_codigo: tbl,
        objetos_usuarios: objetos,
        relkind_pg_class: relkind,
        rol_desde_public_usuarios: desdeVista,
        rol_desde_tabla_activa: desdeResuelta,
        roles_en_tablas_base: rolesPorTabla,
    };
}

module.exports = {
    ensureUsuariosTableResolved,
    getTblUsuarios,
    diagnosticarUsuarios,
};
