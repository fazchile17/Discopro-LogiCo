-- =====================================================================
-- LogiCo - Fix de propiedad (ownership) de objetos
-- =====================================================================
-- Ejecutar UNA SOLA VEZ como superusuario `postgres`:
--
--   gcloud sql connect free-trial-first-project --user=postgres --database=logico < 00_fix_owners.sql
--
-- Razón:
--   Cuando las tablas se crearon con el usuario `postgres`, el usuario
--   de aplicación `logico_app` no puede ejecutar ALTER TABLE / DROP
--   sobre ellas (necesita ser OWNER, no basta con GRANT ALL).
--
--   Este script transfiere la propiedad al usuario de aplicación para
--   que las migraciones futuras (05_admin_farmacias.sql, etc.) puedan
--   correrse directamente como `logico_app`.
--
-- Nota Cloud SQL:
--   En Cloud SQL para PostgreSQL, `postgres` NO es un superusuario
--   tradicional. Para hacer `ALTER ... OWNER TO X`, el usuario actual
--   debe ser miembro del rol X. Por eso primero hacemos
--   `GRANT logico_app TO postgres`.
-- =====================================================================

-- Permitir a postgres transferir propiedad a logico_app
GRANT logico_app TO postgres;

DO $$
DECLARE
    r RECORD;
BEGIN
    -- Transferir todas las tablas del esquema public
    FOR r IN
        SELECT tablename FROM pg_tables WHERE schemaname = 'public'
    LOOP
        EXECUTE format('ALTER TABLE public.%I OWNER TO logico_app', r.tablename);
    END LOOP;

    -- Transferir todas las secuencias (BIGSERIAL las crea automáticamente)
    FOR r IN
        SELECT sequencename FROM pg_sequences WHERE schemaname = 'public'
    LOOP
        EXECUTE format('ALTER SEQUENCE public.%I OWNER TO logico_app', r.sequencename);
    END LOOP;

    -- Transferir todas las vistas
    FOR r IN
        SELECT viewname FROM pg_views WHERE schemaname = 'public'
    LOOP
        EXECUTE format('ALTER VIEW public.%I OWNER TO logico_app', r.viewname);
    END LOOP;

    -- Transferir todas las funciones
    FOR r IN
        SELECT p.proname AS name,
               pg_catalog.pg_get_function_identity_arguments(p.oid) AS args
          FROM pg_proc p
          JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public'
    LOOP
        EXECUTE format(
            'ALTER FUNCTION public.%I(%s) OWNER TO logico_app',
            r.name, r.args
        );
    END LOOP;
END $$;

-- El esquema también queda en manos de la aplicación
ALTER SCHEMA public OWNER TO logico_app;

-- Confirmación rápida
SELECT 'tables'   AS tipo, count(*) AS total
  FROM pg_tables WHERE schemaname='public' AND tableowner='logico_app'
UNION ALL
SELECT 'sequences', count(*) FROM pg_sequences
 WHERE schemaname='public' AND sequenceowner='logico_app';
