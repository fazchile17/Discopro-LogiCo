-- LogiCo — Función atómica para cambiar rol (ejecutar UNA vez en Cloud SQL, base logico)
-- Parte del despliegue del proyecto, no es un arreglo manual por usuario.

CREATE OR REPLACE FUNCTION fn_cambiar_rol_usuario(p_id BIGINT, p_rol TEXT)
RETURNS TABLE (id_usuario BIGINT, rol VARCHAR, correo CITEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_row usuarios%ROWTYPE;
BEGIN
    IF p_rol NOT IN ('operadora', 'motorista', 'admin') THEN
        RAISE EXCEPTION 'Rol inválido: %', p_rol USING ERRCODE = 'P0001';
    END IF;

    UPDATE usuarios u
       SET rol = p_rol
     WHERE u.id_usuario = p_id
     RETURNING u.* INTO v_row;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Usuario % no existe', p_id USING ERRCODE = 'P0001';
    END IF;

    IF p_rol = 'motorista' THEN
        INSERT INTO disponibilidad_motorista (motorista_id, disponible)
        VALUES (p_id, TRUE)
        ON CONFLICT (motorista_id) DO NOTHING;
    END IF;

    RETURN QUERY
    SELECT v_row.id_usuario, v_row.rol::VARCHAR, v_row.correo;
END;
$$;

GRANT EXECUTE ON FUNCTION fn_cambiar_rol_usuario(BIGINT, TEXT) TO logico_app;
