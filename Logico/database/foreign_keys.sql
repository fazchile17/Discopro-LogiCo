-- LogiCo — Claves foráneas e integridad referencial

ALTER TABLE usuarios
    ADD CONSTRAINT chk_usuarios_rol
    CHECK (rol IN ('operadora','motorista','admin'));

ALTER TABLE estados_pedido
    ADD CONSTRAINT chk_estados_pedido_nombre
    CHECK (nombre_estado IN (
        'retiro_receta','en_ruta','entregado','no_entregado','reprogramado','retiro_pedido'
    ));

ALTER TABLE pedidos
    ADD CONSTRAINT fk_pedidos_estado
    FOREIGN KEY (estado_actual_id) REFERENCES estados_pedido(id_estado)
    ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE pedidos
    ADD CONSTRAINT fk_pedidos_operadora_crea
    FOREIGN KEY (operadora_crea_id) REFERENCES usuarios(id_usuario)
    ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE pedidos
    ADD CONSTRAINT fk_pedidos_operadora_modifica
    FOREIGN KEY (operadora_modifica_id) REFERENCES usuarios(id_usuario)
    ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE pedidos
    ADD CONSTRAINT fk_pedidos_farmacia
    FOREIGN KEY (farmacia_id) REFERENCES farmacias(id_farmacia)
    ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE historial_estados
    ADD CONSTRAINT fk_hist_pedido
    FOREIGN KEY (pedido_id) REFERENCES pedidos(id_pedido)
    ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE historial_estados
    ADD CONSTRAINT fk_hist_estado
    FOREIGN KEY (estado_id) REFERENCES estados_pedido(id_estado)
    ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE historial_estados
    ADD CONSTRAINT fk_hist_usuario
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id_usuario)
    ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE rutas
    ADD CONSTRAINT fk_ruta_pedido
    FOREIGN KEY (pedido_id) REFERENCES pedidos(id_pedido)
    ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE rutas
    ADD CONSTRAINT fk_ruta_motorista
    FOREIGN KEY (motorista_id) REFERENCES usuarios(id_usuario)
    ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE rutas
    ADD CONSTRAINT chk_rutas_estado
    CHECK (estado_ruta IN ('asignada','en_curso','finalizada','cancelada'));

ALTER TABLE disponibilidad_motorista
    ADD CONSTRAINT fk_disp_motorista
    FOREIGN KEY (motorista_id) REFERENCES usuarios(id_usuario)
    ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE motos
    ADD CONSTRAINT fk_motos_motorista
    FOREIGN KEY (motorista_id) REFERENCES usuarios(id_usuario)
    ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE incidencias
    ADD CONSTRAINT fk_inc_pedido
    FOREIGN KEY (pedido_id) REFERENCES pedidos(id_pedido)
    ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE incidencias
    ADD CONSTRAINT fk_inc_ruta
    FOREIGN KEY (ruta_id) REFERENCES rutas(id_ruta)
    ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE incidencias
    ADD CONSTRAINT fk_inc_usuario
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id_usuario)
    ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE reprogramaciones
    ADD CONSTRAINT fk_rep_pedido
    FOREIGN KEY (pedido_id) REFERENCES pedidos(id_pedido)
    ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE reprogramaciones
    ADD CONSTRAINT fk_rep_usuario
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id_usuario)
    ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE reprogramaciones
    ADD CONSTRAINT chk_rep_fecha
    CHECK (fecha_nueva > fecha_anterior);

ALTER TABLE evidencias
    ADD CONSTRAINT fk_evi_pedido
    FOREIGN KEY (pedido_id) REFERENCES pedidos(id_pedido)
    ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE evidencias
    ADD CONSTRAINT fk_evi_incidencia
    FOREIGN KEY (incidencia_id) REFERENCES incidencias(id_incidencia)
    ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE evidencias
    ADD CONSTRAINT fk_evi_usuario
    FOREIGN KEY (subido_por) REFERENCES usuarios(id_usuario)
    ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE audit_logs
    ADD CONSTRAINT fk_audit_usuario
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id_usuario)
    ON UPDATE CASCADE ON DELETE SET NULL;
