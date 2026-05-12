-- =====================================================================
-- LogiCo - RESET COMPLETO DEL ESQUEMA
-- =====================================================================
-- Borra TODO en el esquema `public` (tablas, vistas, funciones,
-- secuencias). Después se debe reaplicar 01..05 en orden.
--
-- Ejecutar como superusuario `postgres`. Ver instrucciones al final
-- del archivo o el README para el comando completo de un solo golpe.
--
-- AVISO: destruye TODOS los datos.
-- =====================================================================

DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;

-- Permisos: el esquema queda propiedad de `postgres` durante la
-- migración (porque `postgres` ejecuta los CREATE), pero al final
-- 00_fix_owners.sql transfiere ownership a `logico_app`.
GRANT USAGE, CREATE ON SCHEMA public TO logico_app;
GRANT USAGE, CREATE ON SCHEMA public TO PUBLIC;

-- Privilegios por defecto: cualquier objeto futuro que cree `postgres`
-- otorga acceso CRUD a `logico_app` automáticamente. Útil si en el
-- futuro un superusuario añade columnas/tablas.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO logico_app;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
    GRANT USAGE, SELECT ON SEQUENCES TO logico_app;
