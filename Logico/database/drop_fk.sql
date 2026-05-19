-- LogiCo — Eliminar claves foráneas (orden inverso a foreign_keys.sql)

ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS fk_audit_usuario;
ALTER TABLE evidencias DROP CONSTRAINT IF EXISTS fk_evi_usuario;
ALTER TABLE evidencias DROP CONSTRAINT IF EXISTS fk_evi_incidencia;
ALTER TABLE evidencias DROP CONSTRAINT IF EXISTS fk_evi_pedido;
ALTER TABLE reprogramaciones DROP CONSTRAINT IF EXISTS chk_rep_fecha;
ALTER TABLE reprogramaciones DROP CONSTRAINT IF EXISTS fk_rep_usuario;
ALTER TABLE reprogramaciones DROP CONSTRAINT IF EXISTS fk_rep_pedido;
ALTER TABLE incidencias DROP CONSTRAINT IF EXISTS fk_inc_usuario;
ALTER TABLE incidencias DROP CONSTRAINT IF EXISTS fk_inc_ruta;
ALTER TABLE incidencias DROP CONSTRAINT IF EXISTS fk_inc_pedido;
ALTER TABLE motos DROP CONSTRAINT IF EXISTS fk_motos_motorista;
ALTER TABLE disponibilidad_motorista DROP CONSTRAINT IF EXISTS fk_disp_motorista;
ALTER TABLE rutas DROP CONSTRAINT IF EXISTS chk_rutas_estado;
ALTER TABLE rutas DROP CONSTRAINT IF EXISTS fk_ruta_motorista;
ALTER TABLE rutas DROP CONSTRAINT IF EXISTS fk_ruta_pedido;
ALTER TABLE historial_estados DROP CONSTRAINT IF EXISTS fk_hist_usuario;
ALTER TABLE historial_estados DROP CONSTRAINT IF EXISTS fk_hist_estado;
ALTER TABLE historial_estados DROP CONSTRAINT IF EXISTS fk_hist_pedido;
ALTER TABLE pedidos DROP CONSTRAINT IF EXISTS fk_pedidos_farmacia;
ALTER TABLE pedidos DROP CONSTRAINT IF EXISTS fk_pedidos_operadora_modifica;
ALTER TABLE pedidos DROP CONSTRAINT IF EXISTS fk_pedidos_operadora_crea;
ALTER TABLE pedidos DROP CONSTRAINT IF EXISTS fk_pedidos_estado;
ALTER TABLE estados_pedido DROP CONSTRAINT IF EXISTS chk_estados_pedido_nombre;
ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS chk_usuarios_rol;
