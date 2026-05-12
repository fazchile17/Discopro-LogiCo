# LogiCo · Sistema Logístico

Sistema completo de gestión de pedidos, rutas, motoristas e incidencias construido con:

- **Cloud SQL for PostgreSQL** (Firebase SQL Connect) como base de datos principal
- **Firebase Authentication** para usuarios
- **Firebase Functions (Node.js + Express)** como backend único
- **Firebase Storage** para datos no estructurados (evidencias)
- **Firebase Hosting** + HTML / CSS / JS vanilla en el frontend

> No se utiliza Firestore como base principal. Toda la lógica de negocio se ejecuta
> en Firebase Functions con transacciones SQL reales (`BEGIN/COMMIT`).

Proyecto Firebase: **`logico-20f73`**

---

## 📚 Documentación académica (carpeta `docs/`)

| # | Documento | Cubre |
|---|---|---|
| 1 | [Metodología Scrum](docs/01-metodologia-scrum.md) | Cronograma, sprints, dependencias, riesgos |
| 2 | [Arquitectura 4+1](docs/02-arquitectura-4+1.md) | Vista lógica, desarrollo, procesos, física, escenarios |
| 3 | [Tecnologías](docs/03-tecnologias.md) | Justificación (escalabilidad/seguridad/rendimiento) |
| 4 | [Base de datos](docs/04-base-datos.md) | MER, FK, constraints, triggers, diccionario |
| 5 | [Estructurados / no estructurados](docs/05-datos-estructurados-no-estructurados.md) | SQL + JSONB + Storage |
| 6 | [Seguridad](docs/06-seguridad.md) | RBAC, STRIDE, controles, OWASP |
| 7 | [Codificación segura](docs/07-codificacion-segura.md) | Validación, prepared statements, errores |
| 8 | [Plan de pruebas](docs/08-plan-pruebas.md) | Unitarias, integración, rendimiento |
| 9 | [Prototipo](docs/09-prototipo.md) | UI, responsive, design system |
| 10 | [Retroalimentación](docs/10-retroalimentacion.md) | Feedback de usuarios + mejoras aplicadas |
| 11 | [Backend funciones](docs/11-backend-funciones.md) | Documentación detallada de cada función |

---

## 🗂️ Estructura del proyecto

```
Logico/
├── firebase.json / .firebaserc / storage.rules
├── database/
│   ├── 01_schema.sql               Tablas, FK, índices, vistas
│   ├── 02_triggers.sql             Triggers de reglas de negocio
│   ├── 03_seeds.sql                Estados + usuarios demo
│   └── 04_audit_storage.sql        audit_logs (JSONB) + evidencias
├── functions/
│   ├── package.json
│   ├── index.js                    API Express expuesta como Function "api"
│   ├── .env.example
│   ├── src/
│   │   ├── db.js                   Pool PG + withTransaction()
│   │   ├── auth.js                 verifyIdToken + RBAC
│   │   ├── audit.js                Logs en JSONB
│   │   ├── errors.js               Errores tipados + handler
│   │   ├── pedidos.js              crearPedido(), listar, obtener
│   │   ├── rutas.js                asignarMotorista(), iniciarRuta(), validar...
│   │   ├── estados.js              cambiarEstadoPedido(), registrarEntrega()
│   │   ├── incidencias.js          registrarIncidencia()
│   │   ├── reprogramaciones.js     reprogramarPedido()
│   │   └── evidencias.js           Metadatos Storage
│   └── tests/                      Jest (4 suites, 17 casos)
├── public/                         Frontend (HTML + ES Modules)
│   ├── index.html (login)
│   ├── dashboard.html
│   ├── pedidos.html
│   ├── pedido.html (detalle)
│   ├── crear-pedido.html
│   ├── motorista.html
│   ├── css/styles.css
│   └── js/{config,firebase-init,sidebar}.js
├── postman/
│   └── LogiCo.postman_collection.json    14 escenarios E2E
└── docs/                           Documentación de la rúbrica (11 archivos)
```

---

## 🚨 Reglas de negocio críticas (cumplidas)

| # | Regla | Implementación |
|---|---|---|
| 1 | Motorista → 1 ruta activa | Índice único parcial `uq_motorista_ruta_activa` + `SELECT FOR UPDATE` |
| 2 | Pedido → 1 ruta activa | Índice único parcial `uq_pedido_ruta_activa` |
| 3 | Estado actual = último historial | Triggers `fn_sync_estado_pedido` + `fn_bloquear_update_estado_directo` |
| 4 | FK obligatorias | Todas las relaciones declaradas con `ON UPDATE/DELETE` apropiados |
| 5 | Sin pedidos duplicados | Índice único parcial `uq_pedidos_no_duplicado` |
| 6 | Toda acción registra usuario+fecha | `historial_estados`, `audit_logs`, columnas `*_id` y `fecha_*` |
| 7 | Solo autenticados operan | `authRequired` + `verifyIdToken` en todas las rutas |

---

## 🚀 Despliegue paso a paso

### 1. Cloud SQL (PostgreSQL)

```bash
# 1) Crear instancia en GCP Console o gcloud
gcloud sql instances create logico-pg \
    --database-version=POSTGRES_15 \
    --region=us-central1 \
    --tier=db-f1-micro

# 2) Crear base y usuario
gcloud sql databases create logico --instance=logico-pg
gcloud sql users create logico_app --instance=logico-pg --password=...

# 3) Aplicar esquema
psql "host=... user=logico_app dbname=logico" \
    -f database/01_schema.sql \
    -f database/02_triggers.sql \
    -f database/03_seeds.sql \
    -f database/04_audit_storage.sql
```

### 2. Firebase

```bash
npm install -g firebase-tools
firebase login
firebase use logico-20f73
```

### 3. Functions

```bash
cd functions
npm install
cp .env.example .env
# editar .env con credenciales de Cloud SQL
```

### 4. Auth

Crear en **Firebase Console → Authentication → Users** los correos seed:

| Correo | Rol |
|---|---|
| `admin@logico.app` | admin |
| `operadora@logico.app` | operadora |
| `motorista@logico.app` | motorista |

Usar contraseñas seguras (el hash en `03_seeds.sql` es solo fallback).

### 5. Pruebas locales

```bash
firebase emulators:start
# Hosting:    http://localhost:5000
# Functions:  http://localhost:5001
# Auth UI:    http://localhost:9099
# Storage:    http://localhost:9199

# Pruebas unitarias backend
cd functions && npm test
```

### 6. Producción

```bash
firebase deploy
# o por capas
firebase deploy --only functions
firebase deploy --only hosting
firebase deploy --only storage
```

---

## 🧪 Verificar la instalación

| Endpoint | Método | Esperado |
|---|---|---|
| `/api/health` | GET | `{ ok: true, db: "PostgreSQL 15..." }` |
| `/api/me` | GET (con token) | Datos del usuario actual |

```bash
curl https://us-central1-logico-20f73.cloudfunctions.net/api/health
```

---

## 📋 API expuesta (`/api/...`)

| Método | Ruta | Roles | Función |
|---|---|---|---|
| GET | `/health` | público | Test de conexión |
| GET | `/me` | autenticado | Perfil del usuario |
| POST | `/pedidos` | operadora, admin | `crearPedido()` |
| GET | `/pedidos` | autenticado | Listar (filtros: estado, motoristaId) |
| GET | `/pedidos/:id` | autenticado | Detalle + historial |
| POST | `/pedidos/:id/estado` | todos | `cambiarEstadoPedido()` |
| POST | `/pedidos/:id/entregar` | motorista, admin | `registrarEntrega()` |
| POST | `/pedidos/:id/incidencias` | autenticado | `registrarIncidencia()` |
| GET | `/pedidos/:id/incidencias` | autenticado | Listar incidencias |
| POST | `/pedidos/:id/reprogramar` | operadora, admin | `reprogramarPedido()` |
| POST | `/pedidos/:id/evidencias` | autenticado | Vincular foto en Storage |
| GET | `/pedidos/:id/evidencias` | autenticado | Listar evidencias |
| POST | `/rutas/asignar` | operadora, admin | `asignarMotorista()` |
| POST | `/rutas/:id/iniciar` | motorista, admin | Iniciar ruta |
| GET | `/motoristas/disponibles` | autenticado | Lista filtrada |
| GET | `/motoristas/:id/validar` | operadora, admin | `validarDisponibilidadMotorista()` |
| GET | `/motoristas/:id/rutas` | propio motorista, admin | Rutas asignadas |
| PUT | `/motoristas/:id/disponibilidad` | propio motorista, admin | Toggle disponible |
| GET | `/audit` | admin | Listar auditoría |

Todas las llamadas (excepto `/health`) requieren `Authorization: Bearer <Firebase ID Token>`.

---

## 📊 Cumplimiento de la rúbrica

| Criterio | Documento | Implementación |
|---|---|---|
| Metodología Scrum | `docs/01-metodologia-scrum.md` | Cronograma 28 días, 6 sprints, 30+ tareas con dependencias |
| Arquitectura 4+1 | `docs/02-arquitectura-4+1.md` | 5 vistas + 5 casos de uso con diagramas mermaid |
| Tecnologías justificadas | `docs/03-tecnologias.md` | Cada stack evaluado contra escalabilidad/seguridad/rendimiento |
| Base de datos | `docs/04-base-datos.md` + `database/*.sql` | 10 tablas, FK, CHECK, UNIQUE, triggers |
| Estructurados / no estructurados | `docs/05-...md` | PostgreSQL + JSONB + Firebase Storage |
| Seguridad | `docs/06-seguridad.md` | RBAC + STRIDE + OWASP API Top 10 |
| Codificación segura | `docs/07-codificacion-segura.md` | Prepared statements, errores, redacted logs |
| Pruebas | `docs/08-plan-pruebas.md` + `tests/` + `postman/` | 17 unitarias + 14 E2E + perf |
| Prototipo | `docs/09-prototipo.md` + `public/` | 6 pantallas funcionales responsive |
| Retroalimentación | `docs/10-retroalimentacion.md` | 8 hallazgos + mejoras aplicadas + SUS |
| Backend funciones | `docs/11-backend-funciones.md` + `functions/src/*.js` | 7 funciones con tx + auditoría |
