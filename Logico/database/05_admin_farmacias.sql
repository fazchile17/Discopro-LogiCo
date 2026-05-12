-- =====================================================================
-- LogiCo - Extensión: Farmacias, jerarquía de administradores y auditoría
-- =====================================================================
-- Orden de ejecución:
--   1) 01_schema.sql
--   2) 02_triggers.sql
--   3) 03_seeds.sql
--   4) 04_audit_storage.sql
--   5) 05_admin_farmacias.sql   <-- este archivo
--
-- Este script es idempotente: puede ejecutarse varias veces sin romper
-- nada (usa IF NOT EXISTS, DROP TRIGGER IF EXISTS, etc.).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) FARMACIAS  (puntos logísticos / despacho)
--    No requieren receta médica; pueden originar pedidos.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS farmacias (
    id_farmacia      BIGSERIAL PRIMARY KEY,
    nombre           VARCHAR(120) NOT NULL,
    direccion        VARCHAR(255) NOT NULL,
    ciudad           VARCHAR(80)  NOT NULL,
    telefono         VARCHAR(30),
    activa           BOOLEAN      NOT NULL DEFAULT TRUE,
    fecha_creacion   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_farmacia_nombre_ciudad UNIQUE (nombre, ciudad)
);

CREATE INDEX IF NOT EXISTS idx_farmacias_activa ON farmacias(activa);
CREATE INDEX IF NOT EXISTS idx_farmacias_ciudad ON farmacias(ciudad);

-- ---------------------------------------------------------------------
-- 2) PEDIDOS ← FARMACIAS
--    Un pedido puede originarse desde una farmacia (opcional).
-- ---------------------------------------------------------------------
ALTER TABLE pedidos
    ADD COLUMN IF NOT EXISTS farmacia_id BIGINT;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
         WHERE constraint_name = 'fk_pedidos_farmacia'
           AND table_name = 'pedidos'
    ) THEN
        ALTER TABLE pedidos
            ADD CONSTRAINT fk_pedidos_farmacia
            FOREIGN KEY (farmacia_id)
            REFERENCES farmacias(id_farmacia)
            ON UPDATE CASCADE ON DELETE SET NULL;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_pedidos_farmacia ON pedidos(farmacia_id);

-- ---------------------------------------------------------------------
-- 3) JERARQUÍA DE ADMINISTRADORES
--    Bandera `es_admin_principal` con índice parcial UNIQUE para
--    garantizar que SOLO 1 usuario pueda tener este flag = TRUE.
-- ---------------------------------------------------------------------
ALTER TABLE usuarios
    ADD COLUMN IF NOT EXISTS es_admin_principal BOOLEAN NOT NULL DEFAULT FALSE;

CREATE UNIQUE INDEX IF NOT EXISTS uq_unico_admin_principal
    ON usuarios ((es_admin_principal))
    WHERE es_admin_principal = TRUE;

-- Si la columna ya existía sin restricción de rol, garantizamos que
-- solo un usuario con rol = admin pueda ser admin principal.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
         WHERE constraint_name = 'chk_admin_principal_rol'
           AND table_name = 'usuarios'
    ) THEN
        ALTER TABLE usuarios
            ADD CONSTRAINT chk_admin_principal_rol
            CHECK (es_admin_principal = FALSE OR rol = 'admin');
    END IF;
END $$;

-- ---------------------------------------------------------------------
-- 4) AUDITORÍA ESTRUCTURADA
--    Tabla relacional para acciones críticas (usuarios, farmacias,
--    intentos bloqueados). Convive con `audit_logs` (JSONB de uso
--    general) y se enfoca en eventos administrativos donde se necesita
--    consulta tabular, indexada y reportable.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS auditoria (
    id_auditoria       BIGSERIAL PRIMARY KEY,
    usuario_id         BIGINT,
    accion             VARCHAR(60)  NOT NULL,
    entidad_afectada   VARCHAR(40),
    id_entidad         BIGINT,
    fecha_hora         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    detalle            TEXT,
    exito              BOOLEAN      NOT NULL DEFAULT TRUE,
    ip                 INET,

    CONSTRAINT fk_auditoria_usuario
        FOREIGN KEY (usuario_id) REFERENCES usuarios(id_usuario)
        ON UPDATE CASCADE ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_auditoria_fecha    ON auditoria(fecha_hora DESC);
CREATE INDEX IF NOT EXISTS idx_auditoria_usuario  ON auditoria(usuario_id);
CREATE INDEX IF NOT EXISTS idx_auditoria_accion   ON auditoria(accion);
CREATE INDEX IF NOT EXISTS idx_auditoria_entidad  ON auditoria(entidad_afectada, id_entidad);
CREATE INDEX IF NOT EXISTS idx_auditoria_exito    ON auditoria(exito);

-- ---------------------------------------------------------------------
-- 5) TRIGGERS DE PROTECCIÓN DEL ADMIN PRINCIPAL
--    Defensa en profundidad: incluso si algún path del backend olvidara
--    validar, la base de datos rechaza la operación con un mensaje claro.
-- ---------------------------------------------------------------------

-- 5.1) Bloquear DELETE del admin principal.
CREATE OR REPLACE FUNCTION fn_proteger_delete_admin_principal()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.es_admin_principal = TRUE THEN
        RAISE EXCEPTION
            'No se puede eliminar al administrador principal (id=%).',
            OLD.id_usuario
            USING ERRCODE = 'P0001';
    END IF;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_proteger_delete_admin_principal ON usuarios;
CREATE TRIGGER trg_proteger_delete_admin_principal
BEFORE DELETE ON usuarios
FOR EACH ROW
EXECUTE FUNCTION fn_proteger_delete_admin_principal();

-- 5.2) Bloquear cambio de rol o desactivación del admin principal,
--      y bloquear que se "robe" la bandera (solo se puede transferir
--      por la función SQL controlada `transferir_admin_principal`).
CREATE OR REPLACE FUNCTION fn_proteger_update_admin_principal()
RETURNS TRIGGER AS $$
BEGIN
    -- Si era admin principal y se intenta degradar / desactivar
    IF OLD.es_admin_principal = TRUE THEN
        IF NEW.rol IS DISTINCT FROM OLD.rol THEN
            RAISE EXCEPTION
                'No se puede cambiar el rol del administrador principal.'
                USING ERRCODE = 'P0001';
        END IF;
        IF NEW.activo = FALSE AND OLD.activo = TRUE THEN
            RAISE EXCEPTION
                'No se puede desactivar al administrador principal.'
                USING ERRCODE = 'P0001';
        END IF;
        IF NEW.es_admin_principal = FALSE THEN
            -- Solo se permite si simultáneamente otro usuario fue
            -- promovido (transacción de transferencia). Verificamos
            -- la existencia de otro admin principal en la misma BD.
            IF NOT EXISTS (
                SELECT 1 FROM usuarios u
                 WHERE u.es_admin_principal = TRUE
                   AND u.id_usuario <> OLD.id_usuario
            ) THEN
                RAISE EXCEPTION
                    'No se puede quitar la bandera de admin principal sin transferirla a otro admin.'
                    USING ERRCODE = 'P0001';
            END IF;
        END IF;
    END IF;

    -- Si se intenta promover a admin principal a alguien que no es admin
    IF NEW.es_admin_principal = TRUE AND NEW.rol <> 'admin' THEN
        RAISE EXCEPTION
            'Solo un usuario con rol = admin puede ser admin principal.'
            USING ERRCODE = 'P0001';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_proteger_update_admin_principal ON usuarios;
CREATE TRIGGER trg_proteger_update_admin_principal
BEFORE UPDATE ON usuarios
FOR EACH ROW
EXECUTE FUNCTION fn_proteger_update_admin_principal();

-- 5.3) Garantizar que SIEMPRE exista al menos 1 admin principal
--      (validación a nivel de transacción tras cualquier UPDATE/DELETE).
CREATE OR REPLACE FUNCTION fn_validar_existencia_admin_principal()
RETURNS TRIGGER AS $$
DECLARE total_principales INT;
BEGIN
    SELECT COUNT(*) INTO total_principales
      FROM usuarios
     WHERE es_admin_principal = TRUE
       AND activo = TRUE;

    IF total_principales = 0 THEN
        RAISE EXCEPTION
            'Debe existir al menos un administrador principal activo.'
            USING ERRCODE = 'P0001';
    END IF;
    RETURN NULL;   -- AFTER STATEMENT trigger ignora retorno
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_validar_existencia_admin_principal ON usuarios;
CREATE CONSTRAINT TRIGGER trg_validar_existencia_admin_principal
AFTER UPDATE OR DELETE ON usuarios
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION fn_validar_existencia_admin_principal();

-- ---------------------------------------------------------------------
-- 6) FUNCIÓN SQL: transferir_admin_principal()
--    Transfiere la bandera de admin principal en una sola transacción
--    para no caer en el trigger de "siempre debe existir uno".
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION transferir_admin_principal(
    p_actual_id   BIGINT,
    p_nuevo_id    BIGINT
) RETURNS VOID AS $$
DECLARE v_rol_nuevo TEXT;
BEGIN
    IF p_actual_id = p_nuevo_id THEN
        RAISE EXCEPTION 'El nuevo admin principal debe ser un usuario distinto.'
            USING ERRCODE = 'P0001';
    END IF;

    SELECT rol INTO v_rol_nuevo FROM usuarios WHERE id_usuario = p_nuevo_id;
    IF v_rol_nuevo IS NULL THEN
        RAISE EXCEPTION 'Usuario destino no existe.' USING ERRCODE = 'P0001';
    END IF;
    IF v_rol_nuevo <> 'admin' THEN
        RAISE EXCEPTION 'El usuario destino debe tener rol = admin.'
            USING ERRCODE = 'P0001';
    END IF;

    -- Quita la bandera al actual y la otorga al nuevo dentro
    -- de un mismo statement (gracias a CONSTRAINT DEFERRABLE
    -- el trigger de validación se evalúa al COMMIT).
    UPDATE usuarios SET es_admin_principal = FALSE WHERE id_usuario = p_actual_id;
    UPDATE usuarios SET es_admin_principal = TRUE  WHERE id_usuario = p_nuevo_id;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------
-- 7) Promover a admin principal al usuario admin@logico.app si aún
--    nadie tiene la bandera. Solo afecta entornos recién migrados.
-- ---------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM usuarios WHERE es_admin_principal = TRUE) THEN
        UPDATE usuarios
           SET es_admin_principal = TRUE
         WHERE correo = 'admin@logico.app'
           AND rol = 'admin';
    END IF;
END $$;

-- ---------------------------------------------------------------------
-- 8) DATOS DEMO: farmacias iniciales (idempotente)
-- ---------------------------------------------------------------------
INSERT INTO farmacias (nombre, direccion, ciudad, telefono, activa)
VALUES
    ('Farmacia Central',  'Av. Roosevelt 123',          'San Salvador', '+503 2222-1111', TRUE),
    ('Farmacia Norte',    'Blvd. Constitución 456',     'Mejicanos',    '+503 2222-2222', TRUE),
    ('Farmacia del Valle','Calle El Progreso 789',      'Santa Tecla',  '+503 2222-3333', TRUE)
ON CONFLICT (nombre, ciudad) DO NOTHING;

-- ---------------------------------------------------------------------
-- 9) VISTA: pedidos completos con farmacia
--    DROP + CREATE en lugar de OR REPLACE porque añadimos columnas
--    intermedias y PostgreSQL no permite renombrar columnas existentes
--    de una vista vía CREATE OR REPLACE.
-- ---------------------------------------------------------------------
DROP VIEW IF EXISTS v_pedidos_completos;
CREATE VIEW v_pedidos_completos AS
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
        p.farmacia_id,
        f.nombre                                       AS farmacia_nombre,
        f.ciudad                                       AS farmacia_ciudad,
        p.activo
FROM    pedidos p
JOIN    estados_pedido e ON e.id_estado = p.estado_actual_id
JOIN    usuarios uc      ON uc.id_usuario = p.operadora_crea_id
LEFT JOIN rutas r        ON r.pedido_id   = p.id_pedido
                            AND r.estado_ruta IN ('asignada','en_curso','finalizada')
LEFT JOIN usuarios m     ON m.id_usuario  = r.motorista_id
LEFT JOIN farmacias f    ON f.id_farmacia = p.farmacia_id;
