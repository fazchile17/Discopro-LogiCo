-- =====================================================================
-- LogiCo - Datos iniciales
-- =====================================================================

-- Estados de pedido (catálogo obligatorio)
INSERT INTO estados_pedido (nombre_estado) VALUES
    ('retiro_receta'),
    ('en_ruta'),
    ('entregado'),
    ('no_entregado'),
    ('reprogramado'),
    ('retiro_pedido')
ON CONFLICT (nombre_estado) DO NOTHING;

-- Usuario administrador inicial.
-- contrasena = 'Admin123!' (hash bcrypt generado con costo 10)
-- En producción este registro se completa con firebase_uid tras el primer login.
INSERT INTO usuarios (nombre, apellido, correo, contrasena, rol, activo)
VALUES (
    'Admin',
    'LogiCo',
    'admin@logico.app',
    '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy',
    'admin',
    TRUE
)
ON CONFLICT (correo) DO NOTHING;

-- Operadora demo
INSERT INTO usuarios (nombre, apellido, correo, contrasena, rol, activo)
VALUES (
    'Maria',
    'Operadora',
    'operadora@logico.app',
    '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy',
    'operadora',
    TRUE
)
ON CONFLICT (correo) DO NOTHING;

-- Motorista demo
INSERT INTO usuarios (nombre, apellido, correo, contrasena, rol, activo)
VALUES (
    'Carlos',
    'Motorista',
    'motorista@logico.app',
    '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy',
    'motorista',
    TRUE
)
ON CONFLICT (correo) DO NOTHING;

-- Disponibilidad inicial del motorista
INSERT INTO disponibilidad_motorista (motorista_id, disponible)
SELECT id_usuario, TRUE FROM usuarios WHERE correo = 'motorista@logico.app'
ON CONFLICT (motorista_id) DO NOTHING;
