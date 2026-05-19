-- LogiCo — Flota de motos (mantenedor académico 2.1.3.5)
-- Ejecutar en la base "logico" (NO en postgres):  \c logico
-- Después de 01_schema.sql (o tras create_tables + primary_keys + foreign_keys)

CREATE TABLE IF NOT EXISTS motos (
    id_moto           BIGSERIAL PRIMARY KEY,
    patente           VARCHAR(12)  NOT NULL UNIQUE,
    marca             VARCHAR(60)  NOT NULL,
    modelo            VARCHAR(60)  NOT NULL,
    anio              INTEGER
                      CHECK (anio IS NULL OR (anio >= 1990 AND anio <= 2100)),
    motorista_id      BIGINT,
    activa            BOOLEAN      NOT NULL DEFAULT TRUE,
    fecha_creacion    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_motos_motorista
        FOREIGN KEY (motorista_id) REFERENCES usuarios(id_usuario)
        ON UPDATE CASCADE ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_motos_motorista ON motos(motorista_id);
CREATE INDEX IF NOT EXISTS idx_motos_activa ON motos(activa);

-- Una moto activa solo puede asignarse a un motorista a la vez (patente única ya lo refuerza).
CREATE UNIQUE INDEX IF NOT EXISTS uq_moto_activa_por_motorista
    ON motos (motorista_id)
    WHERE activa = TRUE AND motorista_id IS NOT NULL;

INSERT INTO motos (patente, marca, modelo, anio, motorista_id, activa)
SELECT 'ABCD12', 'Honda', 'CB190R', 2022, id_usuario, TRUE
FROM usuarios WHERE correo = 'motorista@logico.app' AND rol = 'motorista'
ON CONFLICT (patente) DO NOTHING;
