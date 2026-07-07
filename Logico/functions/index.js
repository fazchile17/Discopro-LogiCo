/**
 * Punto de entrada de Firebase Functions para LogiCo.
 *
 * Expone una única función HTTP `api` que monta una app Express con todos
 * los endpoints. Las rutas SQL ejecutan transacciones reales contra
 * PostgreSQL (Cloud SQL). Toda la lógica de negocio vive aquí.
 */
require('dotenv').config({ path: __dirname + '/.env' });

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { onRequest } = require('firebase-functions/v2/https');
const { setGlobalOptions } = require('firebase-functions/v2');

const { authRequired, requireRole } = require('./src/auth');
const { errorHandler } = require('./src/errors');
const { logAudit, auditMiddleware } = require('./src/audit');

const pedidosSvc = require('./src/pedidos');
const rutasSvc = require('./src/rutas');
const estadosSvc = require('./src/estados');
const incidenciasSvc = require('./src/incidencias');
const reprogSvc = require('./src/reprogramaciones');
const evidenciasSvc = require('./src/evidencias');
const farmaciasSvc = require('./src/farmacias');
const usuariosSvc = require('./src/usuarios');
const auditoriaSvc = require('./src/auditoria');
const geografiaSvc = require('./src/geografia');
const motosSvc = require('./src/motos');
const { query } = require('./src/db');
const { ensureUsuariosTableResolved, getTblUsuarios } = require('./src/usuarios-table');

setGlobalOptions({ region: 'us-central1', maxInstances: 10 });

const app = express();

// Detrás de Firebase Hosting → Cloud Run hay un proxy delante. Confiar en 1
// salto permite que req.ip refleje la IP real del cliente y evita el
// ValidationError de express-rate-limit por el header X-Forwarded-For.
app.set('trust proxy', 1);

// ------------------- Middlewares de seguridad -------------------
app.use(helmet({ contentSecurityPolicy: false }));   // Cabeceras seguras

// CORS con lista blanca (OWASP A05). Orígenes permitidos: dominios de Hosting
// del proyecto + localhost para desarrollo. Se puede ampliar vía CORS_ORIGINS
// (separados por coma) sin tocar código.
const DEFAULT_ORIGINS = [
    'https://logico-app.web.app',
    'https://logico-app.firebaseapp.com',
    'http://localhost:5000',
    'http://localhost:5002',
    'http://127.0.0.1:5000',
];
const ALLOWED_ORIGINS = new Set(
    (process.env.CORS_ORIGINS
        ? process.env.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean)
        : DEFAULT_ORIGINS)
);
app.use(cors({
    origin(origin, callback) {
        // Permite herramientas sin Origin (curl, Postman, health checks server-to-server).
        if (!origin || ALLOWED_ORIGINS.has(origin)) return callback(null, true);
        return callback(new Error('Origen no permitido por CORS.'));
    },
    credentials: false,
}));
app.use(express.json({ limit: '256kb' }));           // anti-payload-bomb

// Las respuestas de la API NUNCA deben cachearse. Sin esto, el CDN de
// Hosting o el browser pueden devolver 304 Not Modified con datos viejos
// después de un POST/DELETE, dando la sensación de que la UI no se
// actualizó. La página HTML sí puede cachearse (eso lo controla Hosting
// vía firebase.json), pero los JSON de /api/** deben ser frescos siempre.
app.use((_req, res, next) => {
    res.set({
        'Cache-Control': 'no-store, no-cache, must-revalidate, private',
        'Pragma': 'no-cache',
        'Expires': '0',
    });
    next();
});

// Firebase Hosting reescribe /api/** → función "api" pero conserva el
// prefijo /api en req.url. Lo eliminamos para que las routes definidas
// como /health, /me, /pedidos... matcheen tanto vía Hosting (/api/health)
// como invocación directa de la función (/health).
app.use((req, _res, next) => {
    if (req.url === '/api') req.url = '/';
    else if (req.url.startsWith('/api/')) req.url = req.url.substring(4);
    next();
});

// Rate limiting (anti fuerza bruta / abuso)
const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 120,                  // 120 req/min/IP
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Demasiadas solicitudes. Reintenta en un minuto.' },
});
app.use(apiLimiter);

// ---------------------------------------------------------------------
// Health check (público)
// ---------------------------------------------------------------------
const API_BUILD = '2026-05-19-motorista-id-fix';

app.get('/health', async (_req, res) => {
    try {
        await ensureUsuariosTableResolved();
        const { rows } = await query(
            'SELECT NOW() AS now, version() AS pg_version, current_database() AS database'
        );
        let motosTable = false;
        try {
            const { rows: m } = await query(
                `SELECT 1 FROM information_schema.tables
                  WHERE table_schema = 'public' AND table_name = 'motos'`
            );
            motosTable = m.length > 0;
        } catch (_) { /* noop */ }
        res.json({
            ok: true,
            build: API_BUILD,
            usuarios_table: getTblUsuarios(),
            motos_table: motosTable,
            now: rows[0].now,
            database: rows[0].database,
            pg_version: rows[0].pg_version,
        });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// ---------------------------------------------------------------------
// Sesión actual
// ---------------------------------------------------------------------
app.get('/me', authRequired, async (req, res, next) => {
    try {
        await ensureUsuariosTableResolved();
        const tbl = getTblUsuarios();
        const { rows } = await query(
            `SELECT id_usuario, firebase_uid, correo, rol::text AS rol, nombre, apellido,
                    es_admin_principal
               FROM ${tbl}
              WHERE id_usuario = $1`,
            [req.user.id_usuario]
        );
        const u = rows[0];
        if (!u) {
            return res.status(403).json({ error: 'Usuario no encontrado en LogiCo.' });
        }
        res.json({
            id_usuario: Number(u.id_usuario),
            firebase_uid: u.firebase_uid,
            correo: u.correo,
            rol: String(u.rol),
            nombre: u.nombre,
            apellido: u.apellido,
            es_admin_principal: u.es_admin_principal === true,
        });
    } catch (e) { next(e); }
});

// Auditoría automática para cualquier endpoint mutador autenticado
app.use(authRequired, auditMiddleware);

/**
 * Control de acceso a nivel de objeto (OWASP API1 / IDOR):
 * un motorista solo puede acceder a un pedido si tiene (o tuvo) una ruta
 * sobre ese pedido. operadora y admin no tienen esta restricción.
 * Devuelve true si el acceso está permitido.
 */
async function puedeAccederPedido(usuario, pedidoId) {
    if (usuario.rol !== 'motorista') return true;
    const rutas = await rutasSvc.listarRutasDeMotorista(Number(usuario.id_usuario));
    return rutas.some((r) => Number(r.pedido_id) === Number(pedidoId));
}

// =====================================================================
// PEDIDOS
// =====================================================================
app.post(
    '/pedidos',
    requireRole('operadora', 'admin'),
    async (req, res, next) => {
        try {
            const pedido = await pedidosSvc.crearPedido({
                payload: req.body,
                usuario: req.user,
            });
            await logAudit({
                usuario: req.user, accion: 'pedido_creado',
                entidad: 'pedido', entidadId: pedido.id_pedido,
                payload: { codigo_pedido: pedido.codigo_pedido }, req,
            });
            res.status(201).json(pedido);
        } catch (e) { next(e); }
    }
);

app.get('/pedidos', async (req, res, next) => {
    try {
        const filtros = {
            estado: req.query.estado,
            motoristaId: req.query.motoristaId
                ? Number(req.query.motoristaId)
                : (req.user.rol === 'motorista' ? req.user.id_usuario : null),
            soloActivos: req.query.soloActivos !== 'false',
            limit: req.query.limit ? Number(req.query.limit) : 100,
        };
        res.json(await pedidosSvc.listarPedidos(filtros));
    } catch (e) { next(e); }
});

app.get('/pedidos/:id', async (req, res, next) => {
    try {
        const pedidoId = Number(req.params.id);
        if (!(await puedeAccederPedido(req.user, pedidoId))) {
            return res.status(403).json({ error: 'Acceso denegado a este pedido.' });
        }
        res.json(await pedidosSvc.obtenerPedido(pedidoId));
    } catch (e) { next(e); }
});

// =====================================================================
// RUTAS / MOTORISTAS
// =====================================================================
app.get('/motoristas/disponibles', async (_req, res, next) => {
    try { res.json(await rutasSvc.listarMotoristasDisponibles()); }
    catch (e) { next(e); }
});

app.get(
    '/motoristas/:id/validar',
    requireRole('operadora', 'admin'),
    async (req, res, next) => {
        try {
            await rutasSvc.validarDisponibilidadMotorista(Number(req.params.id));
            res.json({ disponible: true });
        } catch (e) {
            if (e.status === 422) return res.json({ disponible: false, motivo: e.message });
            next(e);
        }
    }
);

app.put('/motoristas/:id/disponibilidad', async (req, res, next) => {
    try {
        const motoristaId = Number(req.params.id);
        if (req.user.rol !== 'admin' && Number(req.user.id_usuario) !== motoristaId) {
            return res.status(403).json({ error: 'Acceso denegado.' });
        }
        const r = await rutasSvc.actualizarDisponibilidad({
            motoristaId, disponible: req.body.disponible,
        });
        res.json(r);
    } catch (e) { next(e); }
});

app.post(
    '/rutas/asignar',
    requireRole('operadora', 'admin'),
    async (req, res, next) => {
        try {
            const ruta = await rutasSvc.asignarMotorista({
                pedidoId: Number(req.body.pedidoId),
                motoristaId: Number(req.body.motoristaId),
                usuario: req.user,
            });
            await logAudit({
                usuario: req.user, accion: 'ruta_asignada',
                entidad: 'ruta', entidadId: ruta.id_ruta,
                payload: { pedido_id: ruta.pedido_id, motorista_id: ruta.motorista_id }, req,
            });
            res.status(201).json(ruta);
        } catch (e) { next(e); }
    }
);

app.post(
    '/rutas/:id/iniciar',
    requireRole('motorista', 'admin'),
    async (req, res, next) => {
        try {
            const r = await rutasSvc.iniciarRuta({
                rutaId: Number(req.params.id), usuario: req.user,
            });
            await logAudit({
                usuario: req.user, accion: 'ruta_iniciada',
                entidad: 'ruta', entidadId: r.id_ruta, req,
            });
            res.json(r);
        } catch (e) { next(e); }
    }
);

app.get('/motoristas/:id/rutas', async (req, res, next) => {
    try {
        const motoristaId = Number(req.params.id);
        if (req.user.rol === 'motorista' && Number(req.user.id_usuario) !== motoristaId) {
            return res.status(403).json({ error: 'Acceso denegado.' });
        }
        res.json(await rutasSvc.listarRutasDeMotorista(motoristaId));
    } catch (e) { next(e); }
});

app.get('/motoristas/:id/moto', async (req, res, next) => {
    try {
        const motoristaId = Number(req.params.id);
        if (req.user.rol === 'motorista' && Number(req.user.id_usuario) !== motoristaId) {
            return res.status(403).json({ error: 'Acceso denegado.' });
        }
        const moto = await motosSvc.obtenerMotoPorMotorista(motoristaId);
        res.json(moto || { asignada: false });
    } catch (e) { next(e); }
});

// =====================================================================
// ESTADOS / ENTREGA
// =====================================================================
app.post(
    '/pedidos/:id/estado',
    requireRole('operadora', 'admin', 'motorista'),
    async (req, res, next) => {
        try {
            const r = await estadosSvc.cambiarEstadoPedido({
                pedidoId: Number(req.params.id),
                nuevoEstado: req.body.estado,
                comentario: req.body.comentario,
                usuario: req.user,
            });
            await logAudit({
                usuario: req.user, accion: 'estado_cambiado',
                entidad: 'pedido', entidadId: Number(req.params.id),
                payload: { nuevo_estado: req.body.estado }, req,
            });
            res.json(r);
        } catch (e) { next(e); }
    }
);

app.post(
    '/pedidos/:id/entregar',
    requireRole('motorista', 'admin'),
    async (req, res, next) => {
        try {
            const r = await estadosSvc.registrarEntrega({
                pedidoId: Number(req.params.id),
                comentario: req.body.comentario,
                usuario: req.user,
            });
            await logAudit({
                usuario: req.user, accion: 'pedido_entregado',
                entidad: 'pedido', entidadId: Number(req.params.id), req,
            });
            res.json(r);
        } catch (e) { next(e); }
    }
);

// =====================================================================
// INCIDENCIAS
// =====================================================================
app.post('/pedidos/:id/incidencias', async (req, res, next) => {
    try {
        const r = await incidenciasSvc.registrarIncidencia({
            pedidoId: Number(req.params.id),
            tipoIncidencia: req.body.tipo,
            descripcion: req.body.descripcion,
            cambiarANoEntregado: req.body.cambiarANoEntregado !== false,
            usuario: req.user,
        });
        await logAudit({
            usuario: req.user, accion: 'incidencia_registrada',
            entidad: 'incidencia', entidadId: r.id_incidencia,
            payload: { pedido_id: r.pedido_id, tipo: r.tipo_incidencia },
            nivel: 'WARN', req,
        });
        res.status(201).json(r);
    } catch (e) { next(e); }
});

app.get('/pedidos/:id/incidencias', async (req, res, next) => {
    try {
        const pedidoId = Number(req.params.id);
        if (!(await puedeAccederPedido(req.user, pedidoId))) {
            return res.status(403).json({ error: 'Acceso denegado a este pedido.' });
        }
        res.json(await incidenciasSvc.listarIncidenciasPedido(pedidoId));
    } catch (e) { next(e); }
});

// =====================================================================
// REPROGRAMACIONES
// =====================================================================
app.post(
    '/pedidos/:id/reprogramar',
    requireRole('operadora', 'admin'),
    async (req, res, next) => {
        try {
            const r = await reprogSvc.reprogramarPedido({
                pedidoId: Number(req.params.id),
                fechaNueva: req.body.fechaNueva,
                motivo: req.body.motivo,
                usuario: req.user,
            });
            await logAudit({
                usuario: req.user, accion: 'pedido_reprogramado',
                entidad: 'pedido', entidadId: Number(req.params.id),
                payload: { fecha_nueva: r.fecha_nueva }, req,
            });
            res.status(201).json(r);
        } catch (e) { next(e); }
    }
);

// =====================================================================
// EVIDENCIAS (datos no estructurados en Firebase Storage)
// =====================================================================
app.post('/pedidos/:id/evidencias', async (req, res, next) => {
    try {
        const pedidoId = Number(req.params.id);
        if (!(await puedeAccederPedido(req.user, pedidoId))) {
            return res.status(403).json({ error: 'Acceso denegado a este pedido.' });
        }
        const e = await evidenciasSvc.registrarEvidencia({
            pedidoId: Number(req.params.id),
            incidenciaId: req.body.incidenciaId || null,
            tipo: req.body.tipo,
            storagePath: req.body.storagePath,
            downloadUrl: req.body.downloadUrl,
            mimeType: req.body.mimeType,
            tamanoBytes: req.body.tamanoBytes,
            usuario: req.user,
        });
        await logAudit({
            usuario: req.user, accion: 'evidencia_subida',
            entidad: 'evidencia', entidadId: e.id_evidencia,
            payload: { tipo: e.tipo, path: e.storage_path }, req,
        });
        res.status(201).json(e);
    } catch (err) { next(err); }
});

app.get('/pedidos/:id/evidencias', async (req, res, next) => {
    try {
        const pedidoId = Number(req.params.id);
        if (!(await puedeAccederPedido(req.user, pedidoId))) {
            return res.status(403).json({ error: 'Acceso denegado a este pedido.' });
        }
        res.json(await evidenciasSvc.listarEvidencias(pedidoId));
    } catch (e) { next(e); }
});

// =====================================================================
// AUDITORÍA - audit_logs JSONB (solo admin)
// =====================================================================
app.get(
    '/audit',
    requireRole('admin'),
    async (req, res, next) => {
        try {
            const limit = Math.min(Number(req.query.limit) || 200, 500);
            const { rows } = await query(
                `SELECT a.*, u.nombre || ' ' || u.apellido AS usuario
                   FROM audit_logs a
                   LEFT JOIN usuarios u ON u.id_usuario = a.usuario_id
                  ORDER BY a.fecha_hora DESC
                  LIMIT $1`,
                [limit]
            );
            res.json(rows);
        } catch (e) { next(e); }
    }
);

// =====================================================================
// AUDITORÍA - tabla estructurada `auditoria` (solo admin)
// =====================================================================
app.get(
    '/auditoria',
    requireRole('admin'),
    async (req, res, next) => {
        try {
            const filtros = {
                accion: req.query.accion || undefined,
                usuarioId: req.query.usuarioId || undefined,
                exito: req.query.exito === 'true' ? true
                     : req.query.exito === 'false' ? false
                     : undefined,
                limit: req.query.limit ? Number(req.query.limit) : 200,
            };
            res.json(await auditoriaSvc.listarAuditoria(filtros));
        } catch (e) { next(e); }
    }
);

// =====================================================================
// GEOGRAFÍA (catálogo de Chile - solo lectura)
// =====================================================================
app.get('/geografia/regiones', async (_req, res, next) => {
    try { res.json(await geografiaSvc.listarRegiones()); }
    catch (e) { next(e); }
});

app.get('/geografia/regiones/:id/provincias', async (req, res, next) => {
    try { res.json(await geografiaSvc.listarProvincias(req.params.id)); }
    catch (e) { next(e); }
});

app.get('/geografia/provincias/:id/comunas', async (req, res, next) => {
    try { res.json(await geografiaSvc.listarComunas(req.params.id)); }
    catch (e) { next(e); }
});

app.get('/geografia/arbol', async (_req, res, next) => {
    try { res.json(await geografiaSvc.obtenerArbolGeografico()); }
    catch (e) { next(e); }
});

// =====================================================================
// FARMACIAS
// =====================================================================

// Listar (cualquier usuario autenticado puede ver para selector en pedidos)
app.get('/farmacias', async (req, res, next) => {
    try {
        const soloActivas = req.query.soloActivas !== 'false';
        res.json(await farmaciasSvc.listarFarmacias({
            soloActivas,
            regionId: req.query.regionId,
            provinciaId: req.query.provinciaId,
            comunaId: req.query.comunaId,
        }));
    } catch (e) { next(e); }
});

app.get('/farmacias/:id', async (req, res, next) => {
    try { res.json(await farmaciasSvc.obtenerFarmacia(Number(req.params.id))); }
    catch (e) { next(e); }
});

app.post(
    '/farmacias',
    requireRole('admin'),
    async (req, res, next) => {
        try {
            const f = await farmaciasSvc.crearFarmacia({
                payload: req.body, usuario: req.user, req,
            });
            res.status(201).json(f);
        } catch (e) { next(e); }
    }
);

app.put(
    '/farmacias/:id',
    requireRole('admin'),
    async (req, res, next) => {
        try {
            const f = await farmaciasSvc.actualizarFarmacia({
                idFarmacia: Number(req.params.id),
                payload: req.body, usuario: req.user, req,
            });
            res.json(f);
        } catch (e) { next(e); }
    }
);

app.post(
    '/farmacias/:id/desactivar',
    requireRole('admin'),
    async (req, res, next) => {
        try {
            res.json(await farmaciasSvc.desactivarFarmacia({
                idFarmacia: Number(req.params.id), usuario: req.user, req,
            }));
        } catch (e) { next(e); }
    }
);

app.post(
    '/farmacias/:id/activar',
    requireRole('admin'),
    async (req, res, next) => {
        try {
            res.json(await farmaciasSvc.activarFarmacia({
                idFarmacia: Number(req.params.id), usuario: req.user, req,
            }));
        } catch (e) { next(e); }
    }
);

// =====================================================================
// MOTOS (mantenedor admin)
// =====================================================================

app.get('/motos', requireRole('admin'), async (req, res, next) => {
    try {
        res.json(await motosSvc.listarMotos({
            soloActivas: req.query.soloActivas !== 'false',
        }));
    } catch (e) { next(e); }
});

app.get('/motos/:id', requireRole('admin'), async (req, res, next) => {
    try { res.json(await motosSvc.obtenerMoto(Number(req.params.id))); }
    catch (e) { next(e); }
});

app.post('/motos', requireRole('admin'), async (req, res, next) => {
    try {
        const m = await motosSvc.crearMoto({
            payload: req.body, usuario: req.user, req,
        });
        res.status(201).json(m);
    } catch (e) { next(e); }
});

app.put('/motos/:id', requireRole('admin'), async (req, res, next) => {
    try {
        res.json(await motosSvc.actualizarMoto({
            idMoto: Number(req.params.id),
            payload: req.body, usuario: req.user, req,
        }));
    } catch (e) { next(e); }
});

app.post('/motos/:id/desactivar', requireRole('admin'), async (req, res, next) => {
    try {
        res.json(await motosSvc.desactivarMoto({
            idMoto: Number(req.params.id), usuario: req.user, req,
        }));
    } catch (e) { next(e); }
});

// =====================================================================
// USUARIOS (gestión por admins)
// =====================================================================

app.get(
    '/usuarios/admin-principal',
    requireRole('admin'),
    async (_req, res, next) => {
        try { res.json(await usuariosSvc.validarAdminPrincipal()); }
        catch (e) { next(e); }
    }
);

app.get(
    '/usuarios/:id',
    requireRole('admin'),
    async (req, res, next) => {
        try {
            const id = Number(req.params.id);
            await ensureUsuariosTableResolved();
            const tbl = getTblUsuarios();
            const { rows } = await query(
                `SELECT id_usuario, nombre, apellido, correo, rol::text AS rol, activo,
                        firebase_uid, es_admin_principal, fecha_creacion
                   FROM ${tbl} WHERE id_usuario = $1`,
                [id]
            );
            if (!rows[0]) {
                return res.status(404).json({ error: 'Usuario no encontrado.' });
            }
            res.json(rows[0]);
        } catch (e) { next(e); }
    }
);

app.get(
    '/usuarios',
    requireRole('admin'),
    async (req, res, next) => {
        try {
            const filtros = {
                rol: req.query.rol || undefined,
                activo: req.query.activo === 'true' ? true
                      : req.query.activo === 'false' ? false
                      : undefined,
            };
            res.json(await usuariosSvc.listarUsuarios(filtros));
        } catch (e) { next(e); }
    }
);

app.post(
    '/usuarios',
    requireRole('admin'),
    async (req, res, next) => {
        try {
            const u = await usuariosSvc.crearUsuario({
                payload: req.body, actor: req.user, req,
            });
            res.status(201).json(u);
        } catch (e) { next(e); }
    }
);

app.delete(
    '/usuarios/:id',
    requireRole('admin'),
    async (req, res, next) => {
        try {
            const r = await usuariosSvc.eliminarUsuario({
                idUsuario: req.params.id,
                actor: req.user,
                hardDelete: req.query.hard === 'true',
                req,
            });
            res.json(r);
        } catch (e) { next(e); }
    }
);

app.post(
    '/usuarios/:id/activo',
    requireRole('admin'),
    async (req, res, next) => {
        try {
            const r = await usuariosSvc.setActivoUsuario({
                idUsuario: req.params.id,
                activo: req.body.activo === true,
                actor: req.user, req,
            });
            res.json(r);
        } catch (e) { next(e); }
    }
);

app.post(
    '/usuarios/:id/rol',
    requireRole('admin'),
    async (req, res, next) => {
        try {
            const r = await usuariosSvc.cambiarRolUsuario({
                idUsuario: req.params.id,
                nuevoRol: req.body?.rol ?? req.body?.nuevoRol,
                actor: req.user, req,
            });
            res.json(r);
        } catch (e) { next(e); }
    }
);

app.get(
    '/usuarios/:id/diagnostico-rol',
    requireRole('admin'),
    async (req, res, next) => {
        try {
            res.json(await usuariosSvc.diagnosticarUsuarios(req.params.id));
        } catch (e) { next(e); }
    }
);

// =====================================================================
// 404 + Manejo central de errores
// =====================================================================
app.use((req, res) => res.status(404).json({ error: 'Endpoint no encontrado.' }));
app.use(errorHandler);

// Cloud SQL: PG_HOST=/cloudsql/PROYECTO:REGION:INSTANCIA en .env (deploy carga .env)
exports.api = onRequest({ cors: true, memory: '512MiB' }, app);
