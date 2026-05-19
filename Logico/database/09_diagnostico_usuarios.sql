-- Diagnóstico: por qué el rol no persiste
-- IMPORTANTE: conecte a la base "logico" (la API NO usa "postgres").
--
-- Cloud Shell (desde la carpeta del repo):
--   gcloud sql connect free-trial-first-project --user=logico_app --database=logico
-- o en psql ya conectado:
--   \c logico
--   \i database/09_diagnostico_usuarios.sql

SELECT current_database() AS db, pg_is_in_recovery() AS es_replica;

SELECT table_schema, table_name, table_type
  FROM information_schema.tables
 WHERE table_name = 'usuarios'
 ORDER BY 1, 2;

SELECT n.nspname AS schema, c.relname AS name, c.relkind
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE c.relname = 'usuarios'
 ORDER BY 1, 2;

SELECT id_usuario, correo, rol, es_admin_principal
  FROM public.usuarios
 WHERE id_usuario = 10 OR correo = 'andy@test.cl';

-- Prueba manual (solo si el SELECT anterior devolvió una fila):
-- BEGIN;
-- UPDATE public.usuarios SET rol = 'motorista' WHERE id_usuario = 10 RETURNING id_usuario, rol;
-- SELECT rol FROM public.usuarios WHERE id_usuario = 10;
-- ROLLBACK;   -- o COMMIT; si desea dejar el cambio
