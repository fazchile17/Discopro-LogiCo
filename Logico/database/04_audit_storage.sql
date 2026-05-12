-- =====================================================================
-- LogiCo - Datos no estructurados / semi-estructurados
--
-- Aunque la base principal es relacional, ciertos datos (logs, evidencias
-- multimedia, payloads JSON) se manejan como datos no estructurados:
--
--   * audit_logs   → eventos en formato JSONB (semi-estructurado)
--   * evidencias   → metadatos de archivos en Firebase Storage
-- =====================================================================

-- ---------------------------------------------------------------------
-- audit_logs : trazabilidad cruda en JSONB.
-- Cada acción crítica (login, crear pedido, asignar, entregar...) se
-- registra aquí con un payload flexible.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_logs (
    id_log         BIGSERIAL PRIMARY KEY,
    fecha_hora     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    usuario_id     BIGINT,
    firebase_uid   VARCHAR(128),
    accion         VARCHAR(60) NOT NULL,
    entidad        VARCHAR(40),
    entidad_id     BIGINT,
    ip             INET,
    user_agent     TEXT,
    payload        JSONB,                       -- datos flexibles (semi-estructurado)
    nivel          VARCHAR(10) NOT NULL DEFAULT 'INFO'
                   CHECK (nivel IN ('INFO','WARN','ERROR','SECURITY')),

    CONSTRAINT fk_audit_usuario
        FOREIGN KEY (usuario_id) REFERENCES usuarios(id_usuario)
        ON UPDATE CASCADE ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_fecha    ON audit_logs(fecha_hora DESC);
CREATE INDEX IF NOT EXISTS idx_audit_accion   ON audit_logs(accion);
CREATE INDEX IF NOT EXISTS idx_audit_entidad  ON audit_logs(entidad, entidad_id);
CREATE INDEX IF NOT EXISTS idx_audit_nivel    ON audit_logs(nivel);
-- Índice GIN para búsquedas dentro del JSON (payload->>'campo')
CREATE INDEX IF NOT EXISTS idx_audit_payload  ON audit_logs USING GIN (payload jsonb_path_ops);

-- ---------------------------------------------------------------------
-- evidencias : referencia a archivos no estructurados en Firebase Storage.
-- El binario vive en Storage; aquí solo guardamos metadatos para
-- relacionarlos con pedidos / incidencias.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS evidencias (
    id_evidencia    BIGSERIAL PRIMARY KEY,
    pedido_id       BIGINT      NOT NULL,
    incidencia_id   BIGINT,
    tipo            VARCHAR(20) NOT NULL
                    CHECK (tipo IN ('entrega','incidencia','firma','otro')),
    storage_path    VARCHAR(500) NOT NULL,    -- ruta dentro del bucket
    download_url    TEXT,                     -- URL pública/firmada (opcional)
    mime_type       VARCHAR(60),
    tamano_bytes    BIGINT,
    subido_por      BIGINT      NOT NULL,
    fecha_subida    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_ev_pedido
        FOREIGN KEY (pedido_id) REFERENCES pedidos(id_pedido)
        ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT fk_ev_incidencia
        FOREIGN KEY (incidencia_id) REFERENCES incidencias(id_incidencia)
        ON UPDATE CASCADE ON DELETE SET NULL,
    CONSTRAINT fk_ev_usuario
        FOREIGN KEY (subido_por) REFERENCES usuarios(id_usuario)
        ON UPDATE CASCADE ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_ev_pedido       ON evidencias(pedido_id);
CREATE INDEX IF NOT EXISTS idx_ev_incidencia   ON evidencias(incidencia_id);
CREATE INDEX IF NOT EXISTS idx_ev_tipo         ON evidencias(tipo);
