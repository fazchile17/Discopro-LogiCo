-- =====================================================================
-- LogiCo - Triggers que refuerzan reglas de negocio en BD
-- (defensa adicional a las validaciones que harán las Firebase Functions)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Sincronizar estado_actual_id con el último historial.
--    Cualquier UPDATE de estado_actual_id debe quedar registrado en
--    historial_estados; y cualquier inserción en historial_estados debe
--    actualizar el pedido (cuando es el más reciente).
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION fn_sync_estado_pedido()
RETURNS TRIGGER AS $$
BEGIN
    -- Si se inserta un historial cuya fecha es la más reciente, actualizamos pedido
    IF (TG_OP = 'INSERT') THEN
        UPDATE pedidos
           SET estado_actual_id      = NEW.estado_id,
               operadora_modifica_id = NEW.usuario_id
         WHERE id_pedido = NEW.pedido_id
           AND NOT EXISTS (
               SELECT 1 FROM historial_estados h2
                WHERE h2.pedido_id = NEW.pedido_id
                  AND h2.fecha_hora > NEW.fecha_hora
           );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_estado_pedido ON historial_estados;
CREATE TRIGGER trg_sync_estado_pedido
AFTER INSERT ON historial_estados
FOR EACH ROW
EXECUTE FUNCTION fn_sync_estado_pedido();

-- ---------------------------------------------------------------------
-- 2) Validar rol al crear pedido / asignar ruta / etc.
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION fn_validar_rol_creacion_pedido()
RETURNS TRIGGER AS $$
DECLARE v_rol TEXT;
BEGIN
    SELECT rol INTO v_rol FROM usuarios WHERE id_usuario = NEW.operadora_crea_id;
    IF v_rol NOT IN ('operadora','admin') THEN
        RAISE EXCEPTION 'Solo operadoras o admins pueden crear pedidos (rol=%).', v_rol;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_validar_rol_pedido ON pedidos;
CREATE TRIGGER trg_validar_rol_pedido
BEFORE INSERT ON pedidos
FOR EACH ROW
EXECUTE FUNCTION fn_validar_rol_creacion_pedido();

CREATE OR REPLACE FUNCTION fn_validar_rol_motorista()
RETURNS TRIGGER AS $$
DECLARE v_rol TEXT;
BEGIN
    SELECT rol INTO v_rol FROM usuarios WHERE id_usuario = NEW.motorista_id;
    IF v_rol <> 'motorista' THEN
        RAISE EXCEPTION 'El usuario % no tiene rol motorista.', NEW.motorista_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_validar_rol_ruta ON rutas;
CREATE TRIGGER trg_validar_rol_ruta
BEFORE INSERT OR UPDATE OF motorista_id ON rutas
FOR EACH ROW
EXECUTE FUNCTION fn_validar_rol_motorista();

-- ---------------------------------------------------------------------
-- 3) Auto-cerrar disponibilidad de motorista al asignar ruta.
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION fn_actualizar_disp_motorista()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'INSERT') THEN
        INSERT INTO disponibilidad_motorista (motorista_id, disponible, fecha_actualizacion)
        VALUES (NEW.motorista_id, FALSE, NOW())
        ON CONFLICT (motorista_id) DO UPDATE
            SET disponible = FALSE,
                fecha_actualizacion = NOW();
    ELSIF (TG_OP = 'UPDATE') THEN
        IF NEW.estado_ruta IN ('finalizada','cancelada')
           AND OLD.estado_ruta NOT IN ('finalizada','cancelada') THEN
            UPDATE disponibilidad_motorista
               SET disponible = TRUE,
                   fecha_actualizacion = NOW()
             WHERE motorista_id = NEW.motorista_id;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_actualizar_disp_motorista ON rutas;
CREATE TRIGGER trg_actualizar_disp_motorista
AFTER INSERT OR UPDATE OF estado_ruta ON rutas
FOR EACH ROW
EXECUTE FUNCTION fn_actualizar_disp_motorista();

-- ---------------------------------------------------------------------
-- 4) Bloquear actualizaciones manuales del estado del pedido sin historial.
--    Se permite UPDATE si el cambio viene del trigger sync (cuando recién
--    se insertó un historial). Detectamos esto verificando que exista un
--    historial reciente (último minuto) con ese estado y pedido.
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION fn_bloquear_update_estado_directo()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.estado_actual_id IS DISTINCT FROM OLD.estado_actual_id THEN
        IF NOT EXISTS (
            SELECT 1
              FROM historial_estados h
             WHERE h.pedido_id = NEW.id_pedido
               AND h.estado_id = NEW.estado_actual_id
               AND h.fecha_hora >= NOW() - INTERVAL '5 minutes'
        ) THEN
            RAISE EXCEPTION
              'El estado del pedido solo puede cambiar mediante un registro en historial_estados.';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_bloquear_update_estado_directo ON pedidos;
CREATE TRIGGER trg_bloquear_update_estado_directo
BEFORE UPDATE OF estado_actual_id ON pedidos
FOR EACH ROW
EXECUTE FUNCTION fn_bloquear_update_estado_directo();
