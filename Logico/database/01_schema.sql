-- =====================================================================
-- LogiCo - Sistema Logístico
-- Esquema principal (PostgreSQL 14+)
-- =====================================================================
-- Orden de ejecución:
--   1) 01_schema.sql      <-- este archivo (tablas, índices, FK)
--   2) 02_triggers.sql    (reglas de negocio en BD)
--   3) 03_seeds.sql       (datos iniciales: estados_pedido, admin)
-- =====================================================================

-- Para entornos limpios (CUIDADO en prod):
-- DROP SCHEMA public CASCADE; CREATE SCHEMA public;

CREATE EXTENSION IF NOT EXISTS pgcrypto;     -- hashing y gen_random_uuid
CREATE EXTENSION IF NOT EXISTS citext;       -- correo case-insensitive

-- ---------------------------------------------------------------------
-- usuarios
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS usuarios (
    id_usuario       BIGSERIAL PRIMARY KEY,
    firebase_uid     VARCHAR(128) UNIQUE,                       -- enlaza con Firebase Auth
    nombre           VARCHAR(80)  NOT NULL,
    apellido         VARCHAR(80)  NOT NULL,
    correo           CITEXT       NOT NULL UNIQUE,
    contrasena       VARCHAR(255) NOT NULL,                     -- hash bcrypt (fallback si no usa Firebase)
    rol              VARCHAR(20)  NOT NULL
                     CHECK (rol IN ('operadora','motorista','admin')),
    activo           BOOLEAN      NOT NULL DEFAULT TRUE,
    fecha_creacion   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_usuarios_rol      ON usuarios(rol);
CREATE INDEX IF NOT EXISTS idx_usuarios_activo   ON usuarios(activo);

-- ---------------------------------------------------------------------
-- estados_pedido (catálogo)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS estados_pedido (
    id_estado     SERIAL PRIMARY KEY,
    nombre_estado VARCHAR(40) NOT NULL UNIQUE
                  CHECK (nombre_estado IN (
                      'retiro_receta',
                      'en_ruta',
                      'entregado',
                      'no_entregado',
                      'reprogramado',
                      'retiro_pedido'
                  ))
);

-- ---------------------------------------------------------------------
-- pedidos (tabla central)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pedidos (
    id_pedido              BIGSERIAL PRIMARY KEY,
    codigo_pedido          VARCHAR(30)  NOT NULL UNIQUE,
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

    CONSTRAINT fk_pedidos_estado
        FOREIGN KEY (estado_actual_id)
        REFERENCES estados_pedido(id_estado)
        ON UPDATE CASCADE ON DELETE RESTRICT,

    CONSTRAINT fk_pedidos_operadora_crea
        FOREIGN KEY (operadora_crea_id)
        REFERENCES usuarios(id_usuario)
        ON UPDATE CASCADE ON DELETE RESTRICT,

    CONSTRAINT fk_pedidos_operadora_modifica
        FOREIGN KEY (operadora_modifica_id)
        REFERENCES usuarios(id_usuario)
        ON UPDATE CASCADE ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_pedidos_estado_actual ON pedidos(estado_actual_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_fecha_prog    ON pedidos(fecha_programada);
CREATE INDEX IF NOT EXISTS idx_pedidos_activo        ON pedidos(activo);
CREATE INDEX IF NOT EXISTS idx_pedidos_operadora     ON pedidos(operadora_crea_id);

-- Índice parcial para evitar duplicidad lógica de pedidos activos
-- (mismo cliente + misma fecha + mismo detalle se considera duplicado).
CREATE UNIQUE INDEX IF NOT EXISTS uq_pedidos_no_duplicado
    ON pedidos (nombre_cliente, telefono_cliente, fecha_programada, md5(detalle_pedido))
    WHERE activo = TRUE;

-- ---------------------------------------------------------------------
-- historial_estados
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS historial_estados (
    id_historial   BIGSERIAL PRIMARY KEY,
    pedido_id      BIGINT       NOT NULL,
    estado_id      INTEGER      NOT NULL,
    fecha_hora     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    comentario     TEXT,
    usuario_id     BIGINT       NOT NULL,

    CONSTRAINT fk_hist_pedido
        FOREIGN KEY (pedido_id) REFERENCES pedidos(id_pedido)
        ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT fk_hist_estado
        FOREIGN KEY (estado_id) REFERENCES estados_pedido(id_estado)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_hist_usuario
        FOREIGN KEY (usuario_id) REFERENCES usuarios(id_usuario)
        ON UPDATE CASCADE ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_hist_pedido    ON historial_estados(pedido_id);
CREATE INDEX IF NOT EXISTS idx_hist_fecha     ON historial_estados(fecha_hora DESC);

-- ---------------------------------------------------------------------
-- rutas
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rutas (
    id_ruta           BIGSERIAL PRIMARY KEY,
    codigo_ruta       VARCHAR(30)  NOT NULL UNIQUE,
    pedido_id         BIGINT       NOT NULL,
    motorista_id      BIGINT       NOT NULL,
    fecha_asignacion  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    fecha_inicio      TIMESTAMPTZ,
    fecha_fin         TIMESTAMPTZ,
    estado_ruta       VARCHAR(20)  NOT NULL DEFAULT 'asignada'
                      CHECK (estado_ruta IN ('asignada','en_curso','finalizada','cancelada')),

    CONSTRAINT fk_ruta_pedido
        FOREIGN KEY (pedido_id) REFERENCES pedidos(id_pedido)
        ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT fk_ruta_motorista
        FOREIGN KEY (motorista_id) REFERENCES usuarios(id_usuario)
        ON UPDATE CASCADE ON DELETE RESTRICT
);

-- Regla 2: un pedido NO puede tener más de 1 ruta activa.
CREATE UNIQUE INDEX IF NOT EXISTS uq_pedido_ruta_activa
    ON rutas (pedido_id)
    WHERE estado_ruta IN ('asignada','en_curso');

-- Regla 1: un motorista NO puede tener más de 1 ruta activa simultáneamente.
CREATE UNIQUE INDEX IF NOT EXISTS uq_motorista_ruta_activa
    ON rutas (motorista_id)
    WHERE estado_ruta IN ('asignada','en_curso');

CREATE INDEX IF NOT EXISTS idx_rutas_motorista    ON rutas(motorista_id);
CREATE INDEX IF NOT EXISTS idx_rutas_estado       ON rutas(estado_ruta);

-- ---------------------------------------------------------------------
-- disponibilidad_motorista
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS disponibilidad_motorista (
    id_disponibilidad     BIGSERIAL PRIMARY KEY,
    motorista_id          BIGINT      NOT NULL UNIQUE,
    disponible            BOOLEAN     NOT NULL DEFAULT TRUE,
    fecha_actualizacion   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_disp_motorista
        FOREIGN KEY (motorista_id) REFERENCES usuarios(id_usuario)
        ON UPDATE CASCADE ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_disp_motorista ON disponibilidad_motorista(disponible);

-- ---------------------------------------------------------------------
-- incidencias
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS incidencias (
    id_incidencia      BIGSERIAL PRIMARY KEY,
    pedido_id          BIGINT       NOT NULL,
    ruta_id            BIGINT,
    tipo_incidencia    VARCHAR(40)  NOT NULL
                       CHECK (tipo_incidencia IN (
                           'cliente_ausente',
                           'direccion_incorrecta',
                           'rechazo_cliente',
                           'accidente',
                           'producto_danado',
                           'otro'
                       )),
    descripcion        TEXT         NOT NULL,
    fecha_hora         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    usuario_id         BIGINT       NOT NULL,

    CONSTRAINT fk_inc_pedido
        FOREIGN KEY (pedido_id) REFERENCES pedidos(id_pedido)
        ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT fk_inc_ruta
        FOREIGN KEY (ruta_id) REFERENCES rutas(id_ruta)
        ON UPDATE CASCADE ON DELETE SET NULL,
    CONSTRAINT fk_inc_usuario
        FOREIGN KEY (usuario_id) REFERENCES usuarios(id_usuario)
        ON UPDATE CASCADE ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_inc_pedido  ON incidencias(pedido_id);
CREATE INDEX IF NOT EXISTS idx_inc_ruta    ON incidencias(ruta_id);
CREATE INDEX IF NOT EXISTS idx_inc_fecha   ON incidencias(fecha_hora DESC);

-- ---------------------------------------------------------------------
-- reprogramaciones
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reprogramaciones (
    id_reprogramacion  BIGSERIAL PRIMARY KEY,
    pedido_id          BIGINT       NOT NULL,
    fecha_anterior     TIMESTAMPTZ  NOT NULL,
    fecha_nueva        TIMESTAMPTZ  NOT NULL,
    motivo             TEXT         NOT NULL,
    fecha_registro     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    usuario_id         BIGINT       NOT NULL,

    CONSTRAINT fk_rep_pedido
        FOREIGN KEY (pedido_id) REFERENCES pedidos(id_pedido)
        ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT fk_rep_usuario
        FOREIGN KEY (usuario_id) REFERENCES usuarios(id_usuario)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT chk_rep_fecha CHECK (fecha_nueva > fecha_anterior)
);

CREATE INDEX IF NOT EXISTS idx_rep_pedido ON reprogramaciones(pedido_id);

-- ---------------------------------------------------------------------
-- VISTAS de soporte para reportes
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW v_pedidos_completos AS
SELECT  p.id_pedido,
        p.codigo_pedido,
        p.nombre_cliente,
        p.direccion_entrega,
        p.telefono_cliente,
        p.detalle_pedido,
        p.fecha_creacion,
        p.fecha_programada,
        e.nombre_estado                                AS estado_actual,
        (uc.nombre || ' ' || uc.apellido)              AS operadora_crea,
        r.codigo_ruta,
        r.estado_ruta,
        (m.nombre || ' ' || m.apellido)                AS motorista,
        p.activo
FROM    pedidos p
JOIN    estados_pedido e ON e.id_estado = p.estado_actual_id
JOIN    usuarios uc      ON uc.id_usuario = p.operadora_crea_id
LEFT JOIN rutas r        ON r.pedido_id   = p.id_pedido
                            AND r.estado_ruta IN ('asignada','en_curso','finalizada')
LEFT JOIN usuarios m     ON m.id_usuario  = r.motorista_id;

CREATE OR REPLACE VIEW v_motoristas_disponibles AS
SELECT  u.id_usuario,
        u.nombre,
        u.apellido,
        u.correo,
        COALESCE(d.disponible, TRUE) AS disponible,
        CASE WHEN EXISTS (
            SELECT 1 FROM rutas r
            WHERE r.motorista_id = u.id_usuario
              AND r.estado_ruta IN ('asignada','en_curso')
        ) THEN FALSE ELSE TRUE END AS sin_ruta_activa
FROM    usuarios u
LEFT JOIN disponibilidad_motorista d ON d.motorista_id = u.id_usuario
WHERE   u.rol = 'motorista'
  AND   u.activo = TRUE;
