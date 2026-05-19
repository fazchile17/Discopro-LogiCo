-- LogiCo — Claves primarias y restricciones UNIQUE de nivel tabla

ALTER TABLE usuarios
    ADD CONSTRAINT pk_usuarios PRIMARY KEY (id_usuario);
ALTER TABLE usuarios
    ADD CONSTRAINT uq_usuarios_correo UNIQUE (correo);
ALTER TABLE usuarios
    ADD CONSTRAINT uq_usuarios_firebase_uid UNIQUE (firebase_uid);

ALTER TABLE estados_pedido
    ADD CONSTRAINT pk_estados_pedido PRIMARY KEY (id_estado);
ALTER TABLE estados_pedido
    ADD CONSTRAINT uq_estados_pedido_nombre UNIQUE (nombre_estado);

ALTER TABLE pedidos
    ADD CONSTRAINT pk_pedidos PRIMARY KEY (id_pedido);
ALTER TABLE pedidos
    ADD CONSTRAINT uq_pedidos_codigo UNIQUE (codigo_pedido);

ALTER TABLE historial_estados
    ADD CONSTRAINT pk_historial_estados PRIMARY KEY (id_historial);

ALTER TABLE rutas
    ADD CONSTRAINT pk_rutas PRIMARY KEY (id_ruta);
ALTER TABLE rutas
    ADD CONSTRAINT uq_rutas_codigo UNIQUE (codigo_ruta);

ALTER TABLE disponibilidad_motorista
    ADD CONSTRAINT pk_disponibilidad_motorista PRIMARY KEY (id_disponibilidad);
ALTER TABLE disponibilidad_motorista
    ADD CONSTRAINT uq_disp_motorista UNIQUE (motorista_id);

ALTER TABLE motos
    ADD CONSTRAINT pk_motos PRIMARY KEY (id_moto);
ALTER TABLE motos
    ADD CONSTRAINT uq_motos_patente UNIQUE (patente);

ALTER TABLE incidencias
    ADD CONSTRAINT pk_incidencias PRIMARY KEY (id_incidencia);

ALTER TABLE reprogramaciones
    ADD CONSTRAINT pk_reprogramaciones PRIMARY KEY (id_reprogramacion);

ALTER TABLE evidencias
    ADD CONSTRAINT pk_evidencias PRIMARY KEY (id_evidencia);

ALTER TABLE audit_logs
    ADD CONSTRAINT pk_audit_logs PRIMARY KEY (id_log);

ALTER TABLE farmacias
    ADD CONSTRAINT pk_farmacias PRIMARY KEY (id_farmacia);
