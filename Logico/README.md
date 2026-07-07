# LogiCo · Sistema Logístico

Sistema completo de gestión de pedidos, rutas, motoristas e incidencias construido con:

- **Cloud SQL for PostgreSQL** (Firebase SQL Connect) como base de datos principal
- **Firebase Authentication** para usuarios
- **Firebase Functions (Node.js + Express)** como backend único
- **Firebase Storage** para datos no estructurados (evidencias)
- **Firebase Hosting** + HTML / CSS / JS vanilla en el frontend

> No se utiliza Firestore como base principal. Toda la lógica de negocio se ejecuta
> en Firebase Functions con transacciones SQL reales (`BEGIN/COMMIT`).

**Sitio web:** [https://logico-20f73.web.app/index.html](https://logico-20f73.web.app/index.html)

Proyecto Firebase: `logico-20f73`

> Limitaciones de seguridad del MVP y matriz de acceso por rol: [`docs/06-seguridad.md`](docs/06-seguridad.md) §6.10–§6.11.



---

## 📚 Documentación académica (`docs/`)

Toda la documentación del proyecto vive en la carpeta **`docs/`** (carpeta oficial).

| Documento | Cubre |
| --- | --- |
| [01-metodologia-scrum.md](docs/01-metodologia-scrum.md) | Gantt, Jira, esfuerzo, sprints |
| [02-arquitectura-4+1.md](docs/02-arquitectura-4+1.md) | 4+1, UML, secuencias, estados, mantenedores |
| [03-tecnologias.md](docs/03-tecnologias.md) | Comparativa HW/SW/Cloud/BD |
| [04-base-datos.md](docs/04-base-datos.md) | MER, FK, triggers, scripts SQL |
| [05-datos-estructurados-no-estructurados.md](docs/05-datos-estructurados-no-estructurados.md) | SQL + JSONB + Storage |
| [06-seguridad.md](docs/06-seguridad.md) | RBAC, OWASP, limitaciones MVP §6.10 |
| [07-codificacion-segura.md](docs/07-codificacion-segura.md) | Estándares + SonarQube |
| [08-plan-pruebas.md](docs/08-plan-pruebas.md) | Unitarias, E2E, rendimiento |
| [09-prototipo.md](docs/09-prototipo.md) | UI, flujos pedidos/motorista |
| [10-retroalimentacion.md](docs/10-retroalimentacion.md) | Usabilidad ≥5 usuarios |
| [11-backend-funciones.md](docs/11-backend-funciones.md) | API y servicios |
| [12-configuracion-entorno.md](docs/12-configuracion-entorno.md) | Setup paso a paso, deploy, troubleshooting |
| [13-validacion-resultados.md](docs/13-validacion-resultados.md) | Ejecución de pruebas, obtenido vs esperado, recomendaciones |
| [14-preguntas-defensa.md](docs/14-preguntas-defensa.md) | Q&A para la defensa |
| [15-informe-final.md](docs/15-informe-final.md) | Portada e índice maestro del informe |


---

## 🗂️ Estructura del proyecto

```
Logico/
├── firebase.json / .firebaserc / storage.rules
├── database/
│   ├── create_tables.sql … seed.sql Scripts SQL rúbrica (ver docs/04-base-datos.md §4.11)
│   ├── 01_schema.sql               Tablas, FK, índices, vistas
│   ├── 07_motos.sql                Mantenedor flota motos
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
│   │   ├── motos.js                CRUD flota motos
│   │   └── evidencias.js           Metadatos Storage
│   └── tests/                      Jest (6 suites, 38 casos)
├── public/                         Frontend (HTML + ES Modules)
│   ├── index.html (login)
│   ├── dashboard.html
│   ├── pedidos.html
│   ├── pedido.html (detalle)
│   ├── crear-pedido.html
│   ├── motorista.html
│   ├── admin-farmacias.html
│   ├── admin-motoristas.html
│   ├── admin-motos.html
│   ├── css/styles.css
│   └── js/{config,firebase-init,sidebar}.js
├── postman/
│   └── LogiCo.postman_collection.json    14 escenarios E2E
└── docs/                           Documentación académica y rúbrica (22+ archivos .md)
```

---

## 🚨 Reglas de negocio críticas (cumplidas)


| #   | Regla                              | Implementación                                                         |
| --- | ---------------------------------- | ---------------------------------------------------------------------- |
| 1   | Motorista → 1 ruta activa          | Índice único parcial `uq_motorista_ruta_activa` + `SELECT FOR UPDATE`  |
| 2   | Pedido → 1 ruta activa             | Índice único parcial `uq_pedido_ruta_activa`                           |
| 3   | Estado actual = último historial   | Triggers `fn_sync_estado_pedido` + `fn_bloquear_update_estado_directo` |
| 4   | FK obligatorias                    | Todas las relaciones declaradas con `ON UPDATE/DELETE` apropiados      |
| 5   | Sin pedidos duplicados             | Índice único parcial `uq_pedidos_no_duplicado`                         |
| 6   | Toda acción registra usuario+fecha | `historial_estados`, `audit_logs`, columnas `*_id` y `fecha_*`         |
| 7   | Solo autenticados operan           | `authRequired` + `verifyIdToken` en todas las rutas                    |


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

# 3) Aplicar esquema (siempre dbname=logico, no postgres)
psql "host=... user=logico_app dbname=logico" \
    -f database/01_schema.sql \
    -f database/02_triggers.sql \
    -f database/03_seeds.sql \
    -f database/04_audit_storage.sql \
    -f database/05_admin_farmacias.sql \
    -f database/07_motos.sql \
    -f database/08_cambiar_rol_usuario.sql
```

En Cloud Shell, si ya está en psql: `\c logico` y luego `\i database/07_motos.sql`.

**Motos vs rutas:** en **Admin → Motos** se registra el vehículo y se asigna a un motorista. Las **rutas de entrega** se crean en **Pedidos → detalle → Asignar motorista** (operadora/admin).

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


| Correo                 | Rol       |
| ---------------------- | --------- |
| `admin@logico.app`     | admin     |
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


| Endpoint      | Método          | Esperado                               |
| ------------- | --------------- | -------------------------------------- |
| `/api/health` | GET             | `{ ok: true, db: "PostgreSQL 15..." }` |
| `/api/me`     | GET (con token) | Datos del usuario actual               |


```bash
curl https://us-central1-logico-20f73.cloudfunctions.net/api/health
```

---

## 📋 API expuesta (`/api/...`)


| Método | Ruta                             | Roles                   | Función                               |
| ------ | -------------------------------- | ----------------------- | ------------------------------------- |
| GET    | `/health`                        | público                 | Test de conexión                      |
| GET    | `/me`                            | autenticado             | Perfil del usuario                    |
| POST   | `/pedidos`                       | operadora, admin        | `crearPedido()`                       |
| GET    | `/pedidos`                       | autenticado             | Listar (filtros: estado, motoristaId) |
| GET    | `/pedidos/:id`                   | autenticado             | Detalle + historial                   |
| POST   | `/pedidos/:id/estado`            | todos                   | `cambiarEstadoPedido()`               |
| POST   | `/pedidos/:id/entregar`          | motorista, admin        | `registrarEntrega()`                  |
| POST   | `/pedidos/:id/incidencias`       | autenticado             | `registrarIncidencia()`               |
| GET    | `/pedidos/:id/incidencias`       | autenticado             | Listar incidencias                    |
| POST   | `/pedidos/:id/reprogramar`       | operadora, admin        | `reprogramarPedido()`                 |
| POST   | `/pedidos/:id/evidencias`        | autenticado             | Vincular foto en Storage              |
| GET    | `/pedidos/:id/evidencias`        | autenticado             | Listar evidencias                     |
| POST   | `/rutas/asignar`                 | operadora, admin        | `asignarMotorista()`                  |
| POST   | `/rutas/:id/iniciar`             | motorista, admin        | Iniciar ruta                          |
| GET    | `/motoristas/disponibles`        | autenticado             | Lista filtrada                        |
| GET    | `/motoristas/:id/validar`        | operadora, admin        | `validarDisponibilidadMotorista()`    |
| GET    | `/motoristas/:id/rutas`          | propio motorista, admin | Rutas asignadas                       |
| PUT    | `/motoristas/:id/disponibilidad` | propio motorista, admin | Toggle disponible                     |
| GET    | `/audit`                         | admin                   | Listar auditoría                      |


Todas las llamadas (excepto `/health`) requieren `Authorization: Bearer <Firebase ID Token>`.

---

## 📊 Cumplimiento de la rúbrica


