-- =====================================================================
-- LogiCo — DDL para diagramadores ER online (PostgreSQL)
-- =====================================================================
-- Uso: copiar TODO este archivo y pegarlo en la opción "Import SQL /
-- PostgreSQL" de herramientas como dbdiagram.io (Import SQL), drawSQL,
-- SqlDBM, ChartDB, Azimutt, etc.
--
-- Notas:
-- * Es una vista consolidada del modelo real (01 + 04 + 05 + 06 geografía).
-- * Se omiten triggers, vistas y algunos índices únicos parciales que los
--   importadores suelen ignorar o rechazan (no afectan el dibujo ER).
-- * `citext` se sustituye por VARCHAR para mayor compatibilidad al parsear.
-- =====================================================================


CREATE TABLE regiones (
    id_region        SERIAL PRIMARY KEY,
    nombre           VARCHAR(80) NOT NULL UNIQUE,
    codigo_romano    VARCHAR(5)  NOT NULL UNIQUE,
    orden            INTEGER     NOT NULL UNIQUE
);

CREATE TABLE provincias (
    id_provincia     SERIAL PRIMARY KEY,
    region_id        INTEGER NOT NULL REFERENCES regiones (id_region)
        ON UPDATE CASCADE ON DELETE CASCADE,
    nombre           VARCHAR(80) NOT NULL,
    UNIQUE (region_id, nombre)
);

CREATE TABLE comunas (
    id_comuna        SERIAL PRIMARY KEY,
    provincia_id     INTEGER NOT NULL REFERENCES provincias (id_provincia)
        ON UPDATE CASCADE ON DELETE CASCADE,
    nombre           VARCHAR(80) NOT NULL,
    UNIQUE (provincia_id, nombre)
);

-- ----- Dominio negocio ----------------------------------------------

CREATE TABLE estados_pedido (
    id_estado     SERIAL PRIMARY KEY,
    nombre_estado VARCHAR(40) NOT NULL UNIQUE
);

CREATE TABLE usuarios (
    id_usuario           BIGSERIAL PRIMARY KEY,
    firebase_uid         VARCHAR(128) UNIQUE,
    nombre               VARCHAR(80)  NOT NULL,
    apellido             VARCHAR(80)  NOT NULL,
    correo               VARCHAR(255) NOT NULL UNIQUE,
    contrasena           VARCHAR(255) NOT NULL,
    rol                  VARCHAR(20)  NOT NULL,
    activo               BOOLEAN      NOT NULL DEFAULT TRUE,
    fecha_creacion       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    es_admin_principal   BOOLEAN      NOT NULL DEFAULT FALSE
);

CREATE TABLE farmacias (
    id_farmacia      BIGSERIAL PRIMARY KEY,
    nombre           VARCHAR(120) NOT NULL,
    direccion        VARCHAR(255) NOT NULL,
    telefono         VARCHAR(30),
    activa           BOOLEAN      NOT NULL DEFAULT TRUE,
    fecha_creacion   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    comuna_id        INTEGER NOT NULL REFERENCES comunas (id_comuna)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    UNIQUE (nombre, comuna_id)
);

CREATE TABLE disponibilidad_motorista (
    id_disponibilidad    BIGSERIAL PRIMARY KEY,
    motorista_id         BIGINT NOT NULL UNIQUE REFERENCES usuarios (id_usuario)
        ON UPDATE CASCADE ON DELETE CASCADE,
    disponible           BOOLEAN NOT NULL DEFAULT TRUE,
    fecha_actualizacion  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE pedidos (
    id_pedido              BIGSERIAL PRIMARY KEY,
    codigo_pedido          VARCHAR(30) NOT NULL UNIQUE,
    nombre_cliente         VARCHAR(120) NOT NULL,
    direccion_entrega      VARCHAR(255) NOT NULL,
    telefono_cliente       VARCHAR(30) NOT NULL,
    detalle_pedido         TEXT NOT NULL,
    observacion            TEXT,
    fecha_creacion         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    fecha_programada       TIMESTAMPTZ NOT NULL,
    estado_actual_id       INTEGER NOT NULL REFERENCES estados_pedido (id_estado)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    operadora_crea_id      BIGINT NOT NULL REFERENCES usuarios (id_usuario)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    operadora_modifica_id  BIGINT REFERENCES usuarios (id_usuario)
        ON UPDATE CASCADE ON DELETE SET NULL,
    farmacia_id            BIGINT REFERENCES farmacias (id_farmacia)
        ON UPDATE CASCADE ON DELETE SET NULL,
    activo                 BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE historial_estados (
    id_historial  BIGSERIAL PRIMARY KEY,
    pedido_id     BIGINT NOT NULL REFERENCES pedidos (id_pedido)
        ON UPDATE CASCADE ON DELETE CASCADE,
    estado_id     INTEGER NOT NULL REFERENCES estados_pedido (id_estado)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    fecha_hora    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    comentario    TEXT,
    usuario_id    BIGINT NOT NULL REFERENCES usuarios (id_usuario)
        ON UPDATE CASCADE ON DELETE RESTRICT
);

CREATE TABLE rutas (
    id_ruta           BIGSERIAL PRIMARY KEY,
    codigo_ruta       VARCHAR(30) NOT NULL UNIQUE,
    pedido_id         BIGINT NOT NULL REFERENCES pedidos (id_pedido)
        ON UPDATE CASCADE ON DELETE CASCADE,
    motorista_id      BIGINT NOT NULL REFERENCES usuarios (id_usuario)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    fecha_asignacion  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    fecha_inicio      TIMESTAMPTZ,
    fecha_fin         TIMESTAMPTZ,
    estado_ruta       VARCHAR(20) NOT NULL DEFAULT 'asignada'
);

CREATE TABLE incidencias (
    id_incidencia    BIGSERIAL PRIMARY KEY,
    pedido_id        BIGINT NOT NULL REFERENCES pedidos (id_pedido)
        ON UPDATE CASCADE ON DELETE CASCADE,
    ruta_id          BIGINT REFERENCES rutas (id_ruta)
        ON UPDATE CASCADE ON DELETE SET NULL,
    tipo_incidencia  VARCHAR(40) NOT NULL,
    descripcion      TEXT NOT NULL,
    fecha_hora       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    usuario_id       BIGINT NOT NULL REFERENCES usuarios (id_usuario)
        ON UPDATE CASCADE ON DELETE RESTRICT
);

CREATE TABLE reprogramaciones (
    id_reprogramacion  BIGSERIAL PRIMARY KEY,
    pedido_id          BIGINT NOT NULL REFERENCES pedidos (id_pedido)
        ON UPDATE CASCADE ON DELETE CASCADE,
    fecha_anterior     TIMESTAMPTZ NOT NULL,
    fecha_nueva        TIMESTAMPTZ NOT NULL,
    motivo             TEXT NOT NULL,
    fecha_registro     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    usuario_id         BIGINT NOT NULL REFERENCES usuarios (id_usuario)
        ON UPDATE CASCADE ON DELETE RESTRICT
);

CREATE TABLE evidencias (
    id_evidencia   BIGSERIAL PRIMARY KEY,
    pedido_id      BIGINT NOT NULL REFERENCES pedidos (id_pedido)
        ON UPDATE CASCADE ON DELETE CASCADE,
    incidencia_id  BIGINT REFERENCES incidencias (id_incidencia)
        ON UPDATE CASCADE ON DELETE SET NULL,
    tipo           VARCHAR(20) NOT NULL,
    storage_path   VARCHAR(500) NOT NULL,
    download_url   TEXT,
    mime_type      VARCHAR(60),
    tamano_bytes   BIGINT,
    subido_por     BIGINT NOT NULL REFERENCES usuarios (id_usuario)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    fecha_subida   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE audit_logs (
    id_log        BIGSERIAL PRIMARY KEY,
    fecha_hora    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    usuario_id    BIGINT REFERENCES usuarios (id_usuario)
        ON UPDATE CASCADE ON DELETE SET NULL,
    firebase_uid  VARCHAR(128),
    accion        VARCHAR(60) NOT NULL,
    entidad       VARCHAR(40),
    entidad_id    BIGINT,
    ip            VARCHAR(45),
    user_agent    TEXT,
    payload       JSONB,
    nivel         VARCHAR(10) NOT NULL DEFAULT 'INFO'
);

CREATE TABLE auditoria (
    id_auditoria      BIGSERIAL PRIMARY KEY,
    usuario_id        BIGINT REFERENCES usuarios (id_usuario)
        ON UPDATE CASCADE ON DELETE SET NULL,
    accion            VARCHAR(60) NOT NULL,
    entidad_afectada  VARCHAR(40),
    id_entidad        BIGINT,
    fecha_hora        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    detalle           TEXT,
    exito             BOOLEAN NOT NULL DEFAULT TRUE,
    ip                VARCHAR(45)
);
