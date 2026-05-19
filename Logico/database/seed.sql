-- LogiCo — Datos semilla (equivalente a 03_seeds.sql + motos demo)
-- Ejecutar después de create_tables.sql, primary_keys.sql, foreign_keys.sql y 02_triggers.sql

INSERT INTO estados_pedido (nombre_estado) VALUES
    ('retiro_receta'),
    ('en_ruta'),
    ('entregado'),
    ('no_entregado'),
    ('reprogramado'),
    ('retiro_pedido')
ON CONFLICT (nombre_estado) DO NOTHING;

INSERT INTO usuarios (nombre, apellido, correo, contrasena, rol, activo)
VALUES (
    'Admin', 'LogiCo', 'admin@logico.app',
    '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy',
    'admin', TRUE
)
ON CONFLICT (correo) DO NOTHING;

INSERT INTO usuarios (nombre, apellido, correo, contrasena, rol, activo)
VALUES (
    'Maria', 'Operadora', 'operadora@logico.app',
    '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy',
    'operadora', TRUE
)
ON CONFLICT (correo) DO NOTHING;

INSERT INTO usuarios (nombre, apellido, correo, contrasena, rol, activo)
VALUES (
    'Carlos', 'Motorista', 'motorista@logico.app',
    '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy',
    'motorista', TRUE
)
ON CONFLICT (correo) DO NOTHING;

INSERT INTO disponibilidad_motorista (motorista_id, disponible)
SELECT id_usuario, TRUE FROM usuarios WHERE correo = 'motorista@logico.app'
ON CONFLICT (motorista_id) DO NOTHING;

INSERT INTO motos (patente, marca, modelo, anio, motorista_id, activa)
SELECT 'ABCD12', 'Honda', 'CB190R', 2022, id_usuario, TRUE
FROM usuarios WHERE correo = 'motorista@logico.app'
ON CONFLICT (patente) DO NOTHING;
