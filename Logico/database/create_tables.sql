-- LogiCo — Creación de tablas (sin PK/FK explícitas; ver primary_keys.sql y foreign_keys.sql)
-- Orden: ejecutar después de extensiones y antes de índices parciales en 01_schema si aplica.

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE IF NOT EXISTS usuarios (
    id_usuario       BIGSERIAL,
    firebase_uid     VARCHAR(128),
    nombre           VARCHAR(80)  NOT NULL,
    apellido         VARCHAR(80)  NOT NULL,
    correo           CITEXT       NOT NULL,
    contrasena       VARCHAR(255) NOT NULL,
    rol              VARCHAR(20)  NOT NULL,
    activo           BOOLEAN      NOT NULL DEFAULT TRUE,
    fecha_creacion   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS estados_pedido (
    id_estado     SERIAL,
    nombre_estado VARCHAR(40) NOT NULL
);

CREATE TABLE IF NOT EXISTS pedidos (
    id_pedido              BIGSERIAL,
    codigo_pedido          VARCHAR(30)  NOT NULL,
    nombre_cliente         VARCHAR(120) NOT NULL,
    direccion_entrega      VARCHAR(255) NOT NULL,
    telefono_cliente       VARCHAR(30)  NOT NULL,
    detalle_pedido         TEXT         NOT NULL,
    observacion            TEXT,
    fecha_creacion         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    fecha_programada       TIMESTAMPTZ  NOT NULL,
    estado_actual_id       INTEGER      NOT NULL,
    operadora_crea_id      BIGINT       NOT NULL,
    operadora_modifica_id  BIGINT,
    activo                 BOOLEAN      NOT NULL DEFAULT TRUE,
    farmacia_id            BIGINT
);

CREATE TABLE IF NOT EXISTS historial_estados (
    id_historial   BIGSERIAL,
    pedido_id      BIGINT       NOT NULL,
    estado_id      INTEGER      NOT NULL,
    fecha_hora     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    comentario     TEXT,
    usuario_id     BIGINT       NOT NULL
);

CREATE TABLE IF NOT EXISTS rutas (
    id_ruta           BIGSERIAL,
    codigo_ruta       VARCHAR(30)  NOT NULL,
    pedido_id         BIGINT       NOT NULL,
    motorista_id      BIGINT       NOT NULL,
    fecha_asignacion  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    fecha_inicio      TIMESTAMPTZ,
    fecha_fin         TIMESTAMPTZ,
    estado_ruta       VARCHAR(20)  NOT NULL DEFAULT 'asignada'
);

CREATE TABLE IF NOT EXISTS disponibilidad_motorista (
    id_disponibilidad     BIGSERIAL,
    motorista_id          BIGINT      NOT NULL,
    disponible            BOOLEAN     NOT NULL DEFAULT TRUE,
    fecha_actualizacion   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS motos (
    id_moto           BIGSERIAL,
    patente           VARCHAR(12)  NOT NULL,
    marca             VARCHAR(60)  NOT NULL,
    modelo            VARCHAR(60)  NOT NULL,
    anio              INTEGER,
    motorista_id      BIGINT,
    activa            BOOLEAN      NOT NULL DEFAULT TRUE,
    fecha_creacion    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS incidencias (
    id_incidencia      BIGSERIAL,
    pedido_id          BIGINT       NOT NULL,
    ruta_id            BIGINT,
    tipo_incidencia    VARCHAR(40)  NOT NULL,
    descripcion        TEXT         NOT NULL,
    fecha_hora         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    usuario_id         BIGINT       NOT NULL
);

CREATE TABLE IF NOT EXISTS reprogramaciones (
    id_reprogramacion  BIGSERIAL,
    pedido_id          BIGINT       NOT NULL,
    fecha_anterior     TIMESTAMPTZ  NOT NULL,
    fecha_nueva        TIMESTAMPTZ  NOT NULL,
    motivo             TEXT         NOT NULL,
    fecha_registro     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    usuario_id         BIGINT       NOT NULL
);

CREATE TABLE IF NOT EXISTS evidencias (
    id_evidencia       BIGSERIAL,
    pedido_id          BIGINT       NOT NULL,
    incidencia_id      BIGINT,
    tipo               VARCHAR(20)  NOT NULL,
    storage_path       VARCHAR(512) NOT NULL,
    download_url       TEXT,
    subido_por         BIGINT       NOT NULL,
    fecha_subida       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id_log             BIGSERIAL,
    fecha_hora         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    usuario_id         BIGINT,
    accion             VARCHAR(80)  NOT NULL,
    entidad            VARCHAR(40),
    entidad_id         BIGINT,
    payload            JSONB,
    nivel              VARCHAR(10)  NOT NULL DEFAULT 'INFO'
);

CREATE TABLE IF NOT EXISTS farmacias (
    id_farmacia      BIGSERIAL,
    nombre           VARCHAR(120) NOT NULL,
    direccion        VARCHAR(255) NOT NULL,
    telefono         VARCHAR(30),
    activa           BOOLEAN      NOT NULL DEFAULT TRUE,
    fecha_creacion   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    comuna_id        INTEGER
);
