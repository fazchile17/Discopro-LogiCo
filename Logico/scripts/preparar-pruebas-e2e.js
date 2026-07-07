/**
 * Prepara el entorno E2E contra API desplegada:
 * - Libera motoristas con rutas stale (iniciar + entregar)
 * - Marca motorista como disponible
 * - Emite motoristaId y testRunId para Newman / concurrencia
 *
 * Uso:
 *   node scripts/preparar-pruebas-e2e.js
 *
 * Salida stdout (JSON): { "motoristaId": 3, "testRunId": "...", "fechaTestIso": "..." }
 */
'use strict';

const BASE_URL = process.env.BASE_URL || 'https://logico-app.web.app/api';
const API_KEY = process.env.API_KEY || 'AIzaSyATLiBvaQVf_Tab4nU41YPljzHmAwCBMb8';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const MOTORISTA_EMAIL = process.env.MOTORISTA_EMAIL || 'motorista@logico.app';
const MOTORISTA_PASSWORD = process.env.MOTORISTA_PASSWORD || 'Motorista123!';
const MOTORISTA_ID = Number(process.env.MOTORISTA_ID || 3);

function abort(msg) {
    console.error('ERROR preparar-pruebas:', msg);
    process.exit(1);
}

async function firebaseLogin(email, password) {
    const res = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password, returnSecureToken: true }),
        }
    );
    if (!res.ok) abort(`Login ${email} falló (${res.status})`);
    return (await res.json()).idToken;
}

async function api(token, path, { method = 'GET', body } = {}) {
    const res = await fetch(`${BASE_URL}${path}`, {
        method,
        headers: {
            Authorization: `Bearer ${token}`,
            ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { /* noop */ }
    return { status: res.status, json, text };
}

async function liberarRutasActivas(adminToken, motoToken, motoristaId) {
    const { status, json } = await api(adminToken, `/motoristas/${motoristaId}/rutas`);
    if (status !== 200 || !Array.isArray(json)) return 0;

    let liberadas = 0;
    for (const ruta of json) {
        if (!['asignada', 'en_curso'].includes(ruta.estado_ruta)) continue;

        const rutaId = Number(ruta.id_ruta);
        const pedidoId = Number(ruta.pedido_id);

        if (ruta.estado_ruta === 'asignada') {
            const ini = await api(motoToken, `/rutas/${rutaId}/iniciar`, { method: 'POST' });
            if (ini.status !== 200) {
                console.warn(`  iniciar ruta ${rutaId}: HTTP ${ini.status}`, ini.text?.slice(0, 120));
                continue;
            }
        }

        const ent = await api(motoToken, `/pedidos/${pedidoId}/entregar`, {
            method: 'POST',
            body: { comentario: 'Cierre automático para pruebas E2E' },
        });
        if (ent.status === 200) {
            liberadas += 1;
            console.log(`  ruta ${rutaId} / pedido ${pedidoId} cerrada`);
        } else {
            console.warn(`  entregar pedido ${pedidoId}: HTTP ${ent.status}`, ent.text?.slice(0, 120));
        }
    }
    return liberadas;
}

async function asegurarMotoristaDisponible(adminToken, motoristaId) {
    await api(adminToken, `/motoristas/${motoristaId}/disponibilidad`, {
        method: 'PUT',
        body: { disponible: true },
    });

    const disp = await api(adminToken, '/motoristas/disponibles');
    if (disp.status !== 200) abort('No se pudo listar motoristas disponibles');

    const enLista = disp.json.find((m) => Number(m.id_usuario) === motoristaId);
    if (enLista) return motoristaId;

    const val = await api(adminToken, `/motoristas/${motoristaId}/validar`);
    if (val.status === 200 && val.json?.disponible) return motoristaId;

    abort(
        `Motorista ${motoristaId} sigue no disponible: ${val.json?.motivo || 'sin motivo'}. ` +
        'Revise rutas activas o cree otro motorista.'
    );
}

(async () => {
    if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
        abort('Define ADMIN_EMAIL y ADMIN_PASSWORD.');
    }

    const testRunId = String(Date.now());
    const fechaTestIso = new Date(Date.now() + 86400000).toISOString();

    console.log(`→ Preparando E2E (${BASE_URL})`);
    const adminToken = await firebaseLogin(ADMIN_EMAIL, ADMIN_PASSWORD);
    const motoToken = await firebaseLogin(MOTORISTA_EMAIL, MOTORISTA_PASSWORD);

    console.log(`→ Liberando rutas stale del motorista ${MOTORISTA_ID}...`);
    const n = await liberarRutasActivas(adminToken, motoToken, MOTORISTA_ID);
    console.log(`→ Rutas cerradas: ${n}`);

    const motoristaId = await asegurarMotoristaDisponible(adminToken, MOTORISTA_ID);
    console.log(`→ Motorista listo: id=${motoristaId}`);

    const out = { motoristaId, testRunId, fechaTestIso };
    console.log(JSON.stringify(out));
})().catch((e) => abort(e.message));
