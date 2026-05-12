# 2. Arquitectura — Modelo 4 + 1 de Kruchten

LogiCo se documenta con las cinco vistas del modelo 4+1 de Philippe Kruchten:

```
            ┌──────────────────────┐
            │     Escenarios       │  ← +1 (casos de uso)
            └──────────┬───────────┘
        ┌──────────────┼──────────────┐
        ▼              ▼              ▼
  Vista lógica   Vista procesos  Vista física
        ▲                              ▲
        └─────── Vista de desarrollo ──┘
```

---

## 2.1 Vista lógica — Modelo de datos y módulos

Describe **qué** hace el sistema desde la perspectiva del dominio.

### 2.1.1 Diagrama Entidad-Relación

```mermaid
erDiagram
    USUARIOS ||--o{ PEDIDOS                  : "crea"
    USUARIOS ||--o{ HISTORIAL_ESTADOS        : "registra"
    USUARIOS ||--o{ RUTAS                    : "es motorista"
    USUARIOS ||--|| DISPONIBILIDAD_MOTORISTA : "tiene"
    USUARIOS ||--o{ INCIDENCIAS              : "reporta"
    USUARIOS ||--o{ REPROGRAMACIONES         : "ejecuta"
    USUARIOS ||--o{ EVIDENCIAS               : "sube"
    USUARIOS ||--o{ AUDIT_LOGS               : "actor"

    PEDIDOS ||--|| ESTADOS_PEDIDO            : "estado_actual"
    PEDIDOS ||--o{ HISTORIAL_ESTADOS         : "trazabilidad"
    PEDIDOS ||--o| RUTAS                     : "1 ruta activa"
    PEDIDOS ||--o{ INCIDENCIAS               : "puede tener"
    PEDIDOS ||--o{ REPROGRAMACIONES          : "puede tener"
    PEDIDOS ||--o{ EVIDENCIAS                : "tiene"

    ESTADOS_PEDIDO ||--o{ HISTORIAL_ESTADOS  : "categoriza"
    RUTAS ||--o{ INCIDENCIAS                 : "asociadas"

    USUARIOS {
        bigserial id_usuario PK
        varchar firebase_uid UK
        varchar nombre
        varchar apellido
        citext  correo UK
        varchar contrasena
        varchar rol "operadora|motorista|admin"
        boolean activo
        timestamptz fecha_creacion
    }
    PEDIDOS {
        bigserial id_pedido PK
        varchar codigo_pedido UK
        varchar nombre_cliente
        varchar direccion_entrega
        varchar telefono_cliente
        text    detalle_pedido
        text    observacion
        timestamptz fecha_creacion
        timestamptz fecha_programada
        int     estado_actual_id FK
        bigint  operadora_crea_id FK
        bigint  operadora_modifica_id FK
        boolean activo
    }
    ESTADOS_PEDIDO {
        serial id_estado PK
        varchar nombre_estado UK
    }
    HISTORIAL_ESTADOS {
        bigserial id_historial PK
        bigint pedido_id FK
        int    estado_id FK
        timestamptz fecha_hora
        text   comentario
        bigint usuario_id FK
    }
    RUTAS {
        bigserial id_ruta PK
        varchar codigo_ruta UK
        bigint  pedido_id FK
        bigint  motorista_id FK
        timestamptz fecha_asignacion
        timestamptz fecha_inicio
        timestamptz fecha_fin
        varchar estado_ruta
    }
    DISPONIBILIDAD_MOTORISTA {
        bigserial id_disponibilidad PK
        bigint  motorista_id FK UK
        boolean disponible
        timestamptz fecha_actualizacion
    }
    INCIDENCIAS {
        bigserial id_incidencia PK
        bigint  pedido_id FK
        bigint  ruta_id FK
        varchar tipo_incidencia
        text    descripcion
        timestamptz fecha_hora
        bigint  usuario_id FK
    }
    REPROGRAMACIONES {
        bigserial id_reprogramacion PK
        bigint  pedido_id FK
        timestamptz fecha_anterior
        timestamptz fecha_nueva
        text    motivo
        timestamptz fecha_registro
        bigint  usuario_id FK
    }
    EVIDENCIAS {
        bigserial id_evidencia PK
        bigint  pedido_id FK
        bigint  incidencia_id FK
        varchar tipo
        varchar storage_path
        text    download_url
        bigint  subido_por FK
    }
    AUDIT_LOGS {
        bigserial id_log PK
        timestamptz fecha_hora
        bigint  usuario_id FK
        varchar accion
        varchar entidad
        bigint  entidad_id
        jsonb   payload
        varchar nivel
    }
```

### 2.1.2 Módulos lógicos del backend

```mermaid
graph LR
    subgraph "API Layer (Express)"
        IDX[index.js<br/>routing]
    end
    subgraph "Domain Services"
        PED[pedidos.js]
        RUT[rutas.js]
        EST[estados.js]
        INC[incidencias.js]
        REP[reprogramaciones.js]
        EVI[evidencias.js]
    end
    subgraph "Cross-cutting"
        AUTH[auth.js]
        ERR[errors.js]
        AUD[audit.js]
        DB[db.js<br/>pool + transacciones]
    end
    IDX --> AUTH
    IDX --> PED
    IDX --> RUT
    IDX --> EST
    IDX --> INC
    IDX --> REP
    IDX --> EVI
    IDX --> AUD
    PED --> DB
    RUT --> DB
    EST --> DB
    INC --> DB
    REP --> DB
    EVI --> DB
    AUD --> DB
    IDX --> ERR
```

---

## 2.2 Vista de desarrollo — Estructura del código

Describe **cómo** está organizado el código fuente.

```
Logico/
├── firebase.json / .firebaserc / storage.rules
├── database/                       Capa SQL (DDL + triggers + seeds)
│   ├── 01_schema.sql
│   ├── 02_triggers.sql
│   ├── 03_seeds.sql
│   └── 04_audit_storage.sql
├── functions/                      Backend (Node 20 + Express)
│   ├── index.js                    API HTTP única
│   ├── package.json                Dependencias + scripts npm
│   ├── src/
│   │   ├── db.js                   Pool PG + withTransaction
│   │   ├── auth.js                 verifyIdToken + carga usuario
│   │   ├── audit.js                Logs JSONB
│   │   ├── errors.js               Errores tipados
│   │   ├── pedidos.js              Servicio dominio
│   │   ├── rutas.js                Servicio dominio
│   │   ├── estados.js              Máquina de transiciones
│   │   ├── incidencias.js          Servicio dominio
│   │   ├── reprogramaciones.js     Servicio dominio
│   │   └── evidencias.js           Metadatos Storage
│   └── tests/                      Jest (unitarias)
│       ├── helpers/fakeDb.js
│       ├── pedidos.test.js
│       ├── rutas.test.js
│       ├── estados.test.js
│       └── incidencias.test.js
├── public/                         Frontend (HTML + JS módulos ES)
│   ├── index.html (login)
│   ├── dashboard.html
│   ├── pedidos.html
│   ├── pedido.html (detalle)
│   ├── crear-pedido.html
│   ├── motorista.html
│   ├── css/styles.css
│   └── js/
│       ├── config.js               Config Firebase
│       ├── firebase-init.js        Auth + Storage + apiFetch
│       └── sidebar.js              Navegación por rol
├── postman/
│   └── LogiCo.postman_collection.json
└── docs/                           Documentación académica
    ├── 01-metodologia-scrum.md
    ├── 02-arquitectura-4+1.md      ← este archivo
    ├── 03-tecnologias.md
    ├── 04-base-datos.md
    ├── 05-datos-estructurados-no-estructurados.md
    ├── 06-seguridad.md
    ├── 07-codificacion-segura.md
    ├── 08-plan-pruebas.md
    ├── 09-prototipo.md
    └── 10-retroalimentacion.md
```

### Decisiones de empaquetado

- **Una sola Function HTTP (`api`)** que monta Express, en lugar de N funciones
  individuales. Reduce cold starts y simplifica el routing/CORS.
- **Servicios sin estado** (`src/*.js`): cada función recibe el `usuario` y retorna
  un resultado puro. Permite probarlos con mocks sin levantar Express.
- **Frontend sin bundler**: HTML + módulos ES nativos cargados con
  `<script type="module">` desde CDN de Google. Cero build step.

---

## 2.3 Vista de procesos — Flujos de ejecución

Describe **cómo** se comportan los procesos en tiempo de ejecución.

### 2.3.1 Flujo principal: Pedido → Entrega

```mermaid
sequenceDiagram
    autonumber
    participant Op as Operadora (UI)
    participant FE as Frontend
    participant Auth as Firebase Auth
    participant Fn as Firebase Functions (Express)
    participant PG as PostgreSQL
    participant Mo as Motorista (UI)

    Op->>FE: Login (email + pass)
    FE->>Auth: signInWithEmailAndPassword
    Auth-->>FE: ID Token
    Op->>FE: Crear pedido
    FE->>Fn: POST /api/pedidos (Bearer ID Token)
    Fn->>Auth: verifyIdToken
    Fn->>PG: BEGIN
    Fn->>PG: INSERT pedidos
    Fn->>PG: INSERT historial_estados
    Fn->>PG: COMMIT
    Fn-->>FE: 201 pedido creado

    Op->>FE: Asignar motorista
    FE->>Fn: POST /api/rutas/asignar
    Fn->>PG: BEGIN + SELECT FOR UPDATE pedido + motorista
    Fn->>PG: INSERT rutas (estado=asignada)
    Fn->>PG: INSERT historial (estado=retiro_pedido)
    Fn->>PG: trigger actualiza disponibilidad_motorista
    Fn->>PG: COMMIT
    Fn-->>FE: 201 ruta
    Note over Auth: Notificación opcional a motorista

    Mo->>FE: Iniciar ruta
    FE->>Fn: POST /api/rutas/{id}/iniciar
    Fn->>PG: UPDATE rutas estado=en_curso
    Fn->>PG: INSERT historial (estado=en_ruta)
    Fn-->>FE: 200

    Mo->>FE: Marcar entregado (+ foto opcional)
    FE->>Fn: POST /api/pedidos/{id}/entregar
    Fn->>PG: BEGIN + INSERT historial (entregado)
    Fn->>PG: UPDATE rutas estado=finalizada
    Fn->>PG: trigger libera disponibilidad
    Fn->>PG: COMMIT
    Fn-->>FE: 200
```

### 2.3.2 Flujo alternativo: Incidencia

```mermaid
sequenceDiagram
    participant Mo as Motorista
    participant FE as Frontend
    participant Fn as Functions
    participant PG as PostgreSQL
    participant ST as Firebase Storage

    Mo->>FE: Cliente ausente → registrar incidencia + foto
    FE->>ST: uploadBytes(foto) → URL
    FE->>Fn: POST /api/pedidos/{id}/incidencias
    Fn->>PG: BEGIN
    Fn->>PG: INSERT incidencias
    Fn->>PG: INSERT historial (no_entregado)
    Fn->>PG: UPDATE rutas estado=cancelada
    Fn->>PG: trigger libera al motorista
    Fn->>PG: COMMIT
    FE->>Fn: POST /api/pedidos/{id}/evidencias (con storagePath)
    Fn->>PG: INSERT evidencias
    Fn-->>FE: OK
```

### 2.3.3 Concurrencia y bloqueos

- **`SELECT ... FOR UPDATE`** en `asignarMotorista` y `cambiarEstadoPedido` impide
  carreras (ej: dos operadoras intentan asignar el mismo motorista al mismo tiempo).
- **Índices únicos parciales** (`uq_motorista_ruta_activa`, `uq_pedido_ruta_activa`)
  son la red de seguridad final: aunque la lógica falle, PostgreSQL rechaza el INSERT.
- **Transacciones**: todas las operaciones multi-tabla usan `withTransaction(work)`
  que envuelve `BEGIN/COMMIT/ROLLBACK`.

---

## 2.4 Vista física — Despliegue

Describe **dónde** corre cada componente.

```mermaid
graph TB
    subgraph "Cliente"
        BR[Navegador<br/>HTML+JS]
    end

    subgraph "Google Cloud / Firebase"
        subgraph "Hosting"
            HS[Firebase Hosting<br/>CDN global<br/>HTTPS forzado]
        end
        subgraph "Auth"
            AU[Firebase Auth<br/>Email/Password]
        end
        subgraph "Functions"
            FN[Cloud Functions v2<br/>Node 20 / us-central1<br/>Express + helmet + rate-limit]
        end
        subgraph "Storage"
            STO[Firebase Storage<br/>logico-20f73.firebasestorage.app<br/>storage.rules]
        end
        subgraph "Cloud SQL"
            DB[(PostgreSQL 15<br/>Cloud SQL Auth Proxy<br/>VPC privada)]
        end
        LOG[Cloud Logging]
        MON[Cloud Monitoring]
    end

    BR -- HTTPS --> HS
    BR -- HTTPS --> AU
    BR -- HTTPS + ID Token --> FN
    BR -- HTTPS + ID Token --> STO
    HS -- rewrite /api/** --> FN
    FN -- verifyIdToken --> AU
    FN -- socket /cloudsql/... --> DB
    FN -- logs --> LOG
    FN -- métricas --> MON
```

### Especificaciones de infraestructura

| Componente | Tier sugerido | SLA | Backup |
|---|---|---|---|
| Cloud SQL PostgreSQL | `db-g1-small` (prod) / `db-f1-micro` (dev) | 99.95% | Diario automático, retención 7 días |
| Cloud Functions v2 | 256 MB, max 10 instancias | 99.95% | Stateless |
| Firebase Hosting | Plan Spark / Blaze | 99.95% global CDN | Versionado por deploy |
| Firebase Auth | — | 99.95% | Cuentas en backend de Google |
| Firebase Storage | Multi-region us | 99.95% | Versioning opcional |

### Aislamiento de red

- Cloud SQL **sin IP pública**; acceso solo vía Cloud SQL Auth Proxy o VPC.
- Las Functions se conectan vía **socket UNIX** `/cloudsql/PROJECT:REGION:INSTANCE`.
- Hosting expone el dominio público; las Functions están detrás de él via `rewrites`.

---

## 2.5 Escenarios (+1) — Casos de uso

### CU-01: Crear pedido

| Campo | Valor |
|---|---|
| Actor primario | Operadora |
| Precondición | Sesión Firebase activa con rol operadora |
| Disparador | Click en "Crear pedido" |
| Flujo principal | 1. Llenar formulario<br/>2. Validar campos en cliente<br/>3. POST `/api/pedidos`<br/>4. Functions valida, abre tx, INSERT pedido + historial<br/>5. UI redirige al listado |
| Flujo alterno | Si BD detecta duplicado (índice único parcial), responde 409 |
| Postcondición | Pedido en estado `retiro_receta` con historial inicial |

### CU-02: Entregar pedido

| Campo | Valor |
|---|---|
| Actor primario | Motorista |
| Precondición | Ruta `en_curso` asignada al motorista |
| Disparador | Botón "Marcar entregado" |
| Flujo principal | 1. POST `/api/pedidos/{id}/entregar`<br/>2. Functions valida que el motorista sea el asignado<br/>3. Tx: insertar historial `entregado` + cerrar ruta `finalizada`<br/>4. Trigger libera disponibilidad |
| Postcondición | Pedido entregado; motorista vuelve a estar disponible |

### CU-03: Registrar incidencia

| Campo | Valor |
|---|---|
| Actor primario | Motorista |
| Precondición | Ruta activa |
| Disparador | "Registrar incidencia" |
| Flujo principal | 1. Subir foto a Storage (`evidencias/{pid}/incidencia/...`)<br/>2. POST `/api/pedidos/{id}/incidencias` con tipo + descripción<br/>3. Tx: INSERT incidencia + historial `no_entregado` + ruta `cancelada`<br/>4. POST `/api/pedidos/{id}/evidencias` para enlazar la foto |
| Postcondición | Pedido en `no_entregado`; motorista disponible; foto vinculada |

### CU-04: Reprogramar pedido

| Campo | Valor |
|---|---|
| Actor primario | Operadora |
| Precondición | Pedido activo, fecha nueva > fecha actual |
| Flujo principal | 1. POST `/api/pedidos/{id}/reprogramar`<br/>2. Tx: INSERT reprogramaciones + UPDATE pedidos.fecha_programada + INSERT historial `reprogramado` |
| Postcondición | Nueva fecha programada; histórico de reprogramaciones |

### CU-05: Asignar motorista (con concurrencia)

| Campo | Valor |
|---|---|
| Actor primario | Operadora |
| Precondición | Pedido sin ruta activa, motorista disponible |
| Flujo principal | 1. UI lista motoristas disponibles (vista `v_motoristas_disponibles`)<br/>2. Operadora elige uno<br/>3. POST `/api/rutas/asignar`<br/>4. Functions hace `SELECT FOR UPDATE` en pedido y motorista<br/>5. Verifica que ningún otro tenga ruta activa<br/>6. INSERT en `rutas` (estado=asignada)<br/>7. Trigger marca motorista no disponible |
| Flujo alterno (carrera) | Si dos operadoras intentan asignarlo simultáneamente, una completa COMMIT y la otra falla con 409 por el índice único parcial |
