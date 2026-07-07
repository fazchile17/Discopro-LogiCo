/**
 * Prueba de concurrencia para LogiCo.
 *
 * Objetivo: validar que la lógica transaccional impide asignaciones dobles
 * bajo condiciones de carrera. Crea un pedido y lanza N asignaciones del MISMO
 * pedido al MISMO motorista EN PARALELO. El resultado correcto es:
 *   - exactamente 1 respuesta 201 (la asignación que gana la carrera)
 *   - el resto 409/422 (conflicto: el pedido ya tiene ruta activa)
 *
 * Requiere Node 22+ (usa fetch global). NO instala dependencias.
 *
 * Uso (PowerShell):
 *   $env:ADMIN_EMAIL="admin@logico.app"; $env:ADMIN_PASSWORD="TU_CLAVE"; node scripts/concurrencia.js
 *
 * Variables de entorno (con valores por defecto):
 *   BASE_URL        (def: https://logico-app.web.app/api)
 *   API_KEY         (def: web API key de logico-app)
 *   ADMIN_EMAIL     (obligatoria)
 *   ADMIN_PASSWORD  (obligatoria)
 *   MOTORISTA_ID    (def: 3) — se libera automáticamente si tiene ruta stale
 *   N               (def: 5)  cantidad de peticiones en paralelo
 */
'use strict';

const { spawnSync } = require('child_process');
const path = require('path');

const BASE_URL = process.env.BASE_URL || 'https://logico-app.web.app/api';
const API_KEY = process.env.API_KEY || 'AIzaSyATLiBvaQVf_Tab4nU41YPljzHmAwCBMb8';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const N = Number(process.env.N || 5);

function abort(msg) {
    console.error('ERROR:', msg);
    process.exit(1);
}

function prepararEntorno() {
    const script = path.join(__dirname, 'preparar-pruebas-e2e.js');
    const r = spawnSync(process.execPath, [script], {
        env: process.env,
        encoding: 'utf8',
    });
    if (r.status !== 0) {
        abort(r.stderr || r.stdout || 'preparar-pruebas-e2e.js falló');
    }
    const lines = r.stdout.trim().split(/\r?\n/).filter(Boolean);
    const last = lines[lines.length - 1];
    try {
        return JSON.parse(last);
    } catch {
        abort(`Salida inválida de preparar-pruebas: ${last}`);
    }
}

async function login() {
    if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
        abort('Define ADMIN_EMAIL y ADMIN_PASSWORD en variables de entorno.');
    }
    const res = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: ADMIN_EMAIL,
                password: ADMIN_PASSWORD,
                returnSecureToken: true,
            }),
        }
    );
    if (!res.ok) abort(`Login falló (${res.status}): ${await res.text()}`);
    return (await res.json()).idToken;
}

async function crearPedido(token, testRunId, fechaTestIso) {
    const res = await fetch(`${BASE_URL}/pedidos`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
            nombre_cliente: `Concurrencia ${testRunId}`,
            telefono_cliente: `0000-${testRunId}`,
            direccion_entrega: 'Test 123',
            detalle_pedido: `Prueba de carrera ${testRunId}`,
            fecha_programada: fechaTestIso,
        }),
    });
    if (res.status !== 201) abort(`No se pudo crear el pedido (${res.status}): ${await res.text()}`);
    const j = await res.json();
    return Number(j.id_pedido);
}

async function asignar(token, pedidoId, motoristaId) {
    const res = await fetch(`${BASE_URL}/rutas/asignar`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ pedidoId, motoristaId }),
    });
    return res.status;
}

(async () => {
    console.log(`→ Base: ${BASE_URL}`);
    const prep = prepararEntorno();
    console.log(`→ Motorista preparado: #${prep.motoristaId}`);

    const token = await login();
    console.log('→ Login OK');

    const pedidoId = await crearPedido(token, prep.testRunId, prep.fechaTestIso);
    console.log(`→ Pedido creado: #${pedidoId}`);

    console.log(`→ Lanzando ${N} asignaciones en paralelo...`);
    const statuses = await Promise.all(
        Array.from({ length: N }, () => asignar(token, pedidoId, prep.motoristaId))
    );

    const exitos = statuses.filter((s) => s === 201).length;
    const conflictos = statuses.filter((s) => s === 409 || s === 422).length;

    console.log('\nRESULTADOS');
    console.log('  Códigos:', statuses.join(', '));
    console.log(`  201 (éxito):     ${exitos}`);
    console.log(`  409/422 (conflicto): ${conflictos}`);

    const ok = exitos === 1 && (exitos + conflictos) === N;
    console.log(`\n${ok ? 'PASS' : 'FAIL'}: se esperaba exactamente 1 éxito y el resto conflicto.`);
    process.exit(ok ? 0 : 1);
})().catch((e) => abort(e.message));
