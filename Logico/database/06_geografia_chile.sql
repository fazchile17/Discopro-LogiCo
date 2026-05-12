-- =====================================================================
-- LogiCo - Geografía de Chile + reemplazo de `ciudad` en farmacias
-- =====================================================================
-- Orden de ejecución:
--   06_geografia_chile.sql  <-- este archivo
--
-- Cambios:
--   1) Crea las tablas catálogo: regiones, provincias, comunas (Chile).
--   2) Inserta el dataset oficial: 16 regiones, 56 provincias, 346 comunas.
--   3) Reemplaza `farmacias.ciudad` por FK `farmacias.comuna_id`.
--   4) Re-siembra las farmacias demo con comunas chilenas válidas.
--
-- Idempotente: puede ejecutarse varias veces.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Catálogo geográfico
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS regiones (
    id_region        SERIAL PRIMARY KEY,
    nombre           VARCHAR(80) NOT NULL UNIQUE,
    codigo_romano    VARCHAR(5)  NOT NULL UNIQUE,
    orden            INTEGER     NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS provincias (
    id_provincia     SERIAL PRIMARY KEY,
    region_id        INTEGER NOT NULL REFERENCES regiones(id_region)
                       ON UPDATE CASCADE ON DELETE CASCADE,
    nombre           VARCHAR(80) NOT NULL,
    UNIQUE (region_id, nombre)
);

CREATE TABLE IF NOT EXISTS comunas (
    id_comuna        SERIAL PRIMARY KEY,
    provincia_id     INTEGER NOT NULL REFERENCES provincias(id_provincia)
                       ON UPDATE CASCADE ON DELETE CASCADE,
    nombre           VARCHAR(80) NOT NULL,
    UNIQUE (provincia_id, nombre)
);

CREATE INDEX IF NOT EXISTS idx_provincias_region ON provincias(region_id);
CREATE INDEX IF NOT EXISTS idx_comunas_provincia ON comunas(provincia_id);
CREATE INDEX IF NOT EXISTS idx_comunas_nombre    ON comunas(nombre);

-- ---------------------------------------------------------------------
-- 2) Seed: 16 regiones de Chile (ordenadas norte → sur)
-- ---------------------------------------------------------------------
INSERT INTO regiones (orden, codigo_romano, nombre) VALUES
    ( 1, 'XV',  'Arica y Parinacota'),
    ( 2, 'I',   'Tarapacá'),
    ( 3, 'II',  'Antofagasta'),
    ( 4, 'III', 'Atacama'),
    ( 5, 'IV',  'Coquimbo'),
    ( 6, 'V',   'Valparaíso'),
    ( 7, 'RM',  'Metropolitana de Santiago'),
    ( 8, 'VI',  'Libertador General Bernardo O''Higgins'),
    ( 9, 'VII', 'Maule'),
    (10, 'XVI', 'Ñuble'),
    (11, 'VIII','Biobío'),
    (12, 'IX',  'La Araucanía'),
    (13, 'XIV', 'Los Ríos'),
    (14, 'X',   'Los Lagos'),
    (15, 'XI',  'Aysén del General Carlos Ibáñez del Campo'),
    (16, 'XII', 'Magallanes y de la Antártica Chilena')
ON CONFLICT (nombre) DO NOTHING;

-- ---------------------------------------------------------------------
-- 3) Seed: 56 provincias
-- ---------------------------------------------------------------------
INSERT INTO provincias (region_id, nombre)
SELECT r.id_region, p.nombre
  FROM (VALUES
    -- XV Arica y Parinacota
    ('Arica y Parinacota','Arica'),
    ('Arica y Parinacota','Parinacota'),
    -- I Tarapacá
    ('Tarapacá','Iquique'),
    ('Tarapacá','El Tamarugal'),
    -- II Antofagasta
    ('Antofagasta','Antofagasta'),
    ('Antofagasta','El Loa'),
    ('Antofagasta','Tocopilla'),
    -- III Atacama
    ('Atacama','Copiapó'),
    ('Atacama','Chañaral'),
    ('Atacama','Huasco'),
    -- IV Coquimbo
    ('Coquimbo','Elqui'),
    ('Coquimbo','Choapa'),
    ('Coquimbo','Limarí'),
    -- V Valparaíso
    ('Valparaíso','Valparaíso'),
    ('Valparaíso','Isla de Pascua'),
    ('Valparaíso','Los Andes'),
    ('Valparaíso','Petorca'),
    ('Valparaíso','Quillota'),
    ('Valparaíso','San Antonio'),
    ('Valparaíso','San Felipe de Aconcagua'),
    ('Valparaíso','Marga Marga'),
    -- RM Metropolitana
    ('Metropolitana de Santiago','Santiago'),
    ('Metropolitana de Santiago','Cordillera'),
    ('Metropolitana de Santiago','Chacabuco'),
    ('Metropolitana de Santiago','Maipo'),
    ('Metropolitana de Santiago','Melipilla'),
    ('Metropolitana de Santiago','Talagante'),
    -- VI O'Higgins
    ('Libertador General Bernardo O''Higgins','Cachapoal'),
    ('Libertador General Bernardo O''Higgins','Cardenal Caro'),
    ('Libertador General Bernardo O''Higgins','Colchagua'),
    -- VII Maule
    ('Maule','Talca'),
    ('Maule','Cauquenes'),
    ('Maule','Curicó'),
    ('Maule','Linares'),
    -- XVI Ñuble
    ('Ñuble','Diguillín'),
    ('Ñuble','Itata'),
    ('Ñuble','Punilla'),
    -- VIII Biobío
    ('Biobío','Concepción'),
    ('Biobío','Arauco'),
    ('Biobío','Biobío'),
    -- IX La Araucanía
    ('La Araucanía','Cautín'),
    ('La Araucanía','Malleco'),
    -- XIV Los Ríos
    ('Los Ríos','Valdivia'),
    ('Los Ríos','Ranco'),
    -- X Los Lagos
    ('Los Lagos','Llanquihue'),
    ('Los Lagos','Chiloé'),
    ('Los Lagos','Osorno'),
    ('Los Lagos','Palena'),
    -- XI Aysén
    ('Aysén del General Carlos Ibáñez del Campo','Coyhaique'),
    ('Aysén del General Carlos Ibáñez del Campo','Aysén'),
    ('Aysén del General Carlos Ibáñez del Campo','Capitán Prat'),
    ('Aysén del General Carlos Ibáñez del Campo','General Carrera'),
    -- XII Magallanes
    ('Magallanes y de la Antártica Chilena','Magallanes'),
    ('Magallanes y de la Antártica Chilena','Antártica Chilena'),
    ('Magallanes y de la Antártica Chilena','Tierra del Fuego'),
    ('Magallanes y de la Antártica Chilena','Última Esperanza')
  ) AS p(region_nombre, nombre)
  JOIN regiones r ON r.nombre = p.region_nombre
ON CONFLICT (region_id, nombre) DO NOTHING;

-- ---------------------------------------------------------------------
-- 4) Seed: 346 comunas (oficiales según División Político-Administrativa)
-- ---------------------------------------------------------------------
INSERT INTO comunas (provincia_id, nombre)
SELECT pp.id_provincia, c.nombre
  FROM (VALUES
    -- ===== XV Arica y Parinacota (4) =====
    ('Arica y Parinacota','Arica','Arica'),
    ('Arica y Parinacota','Arica','Camarones'),
    ('Arica y Parinacota','Parinacota','Putre'),
    ('Arica y Parinacota','Parinacota','General Lagos'),
    -- ===== I Tarapacá (7) =====
    ('Tarapacá','Iquique','Iquique'),
    ('Tarapacá','Iquique','Alto Hospicio'),
    ('Tarapacá','El Tamarugal','Pozo Almonte'),
    ('Tarapacá','El Tamarugal','Camiña'),
    ('Tarapacá','El Tamarugal','Colchane'),
    ('Tarapacá','El Tamarugal','Huara'),
    ('Tarapacá','El Tamarugal','Pica'),
    -- ===== II Antofagasta (9) =====
    ('Antofagasta','Antofagasta','Antofagasta'),
    ('Antofagasta','Antofagasta','Mejillones'),
    ('Antofagasta','Antofagasta','Sierra Gorda'),
    ('Antofagasta','Antofagasta','Taltal'),
    ('Antofagasta','El Loa','Calama'),
    ('Antofagasta','El Loa','Ollagüe'),
    ('Antofagasta','El Loa','San Pedro de Atacama'),
    ('Antofagasta','Tocopilla','Tocopilla'),
    ('Antofagasta','Tocopilla','María Elena'),
    -- ===== III Atacama (9) =====
    ('Atacama','Copiapó','Copiapó'),
    ('Atacama','Copiapó','Caldera'),
    ('Atacama','Copiapó','Tierra Amarilla'),
    ('Atacama','Chañaral','Chañaral'),
    ('Atacama','Chañaral','Diego de Almagro'),
    ('Atacama','Huasco','Vallenar'),
    ('Atacama','Huasco','Alto del Carmen'),
    ('Atacama','Huasco','Freirina'),
    ('Atacama','Huasco','Huasco'),
    -- ===== IV Coquimbo (15) =====
    ('Coquimbo','Elqui','La Serena'),
    ('Coquimbo','Elqui','Coquimbo'),
    ('Coquimbo','Elqui','Andacollo'),
    ('Coquimbo','Elqui','La Higuera'),
    ('Coquimbo','Elqui','Paihuano'),
    ('Coquimbo','Elqui','Vicuña'),
    ('Coquimbo','Choapa','Illapel'),
    ('Coquimbo','Choapa','Canela'),
    ('Coquimbo','Choapa','Los Vilos'),
    ('Coquimbo','Choapa','Salamanca'),
    ('Coquimbo','Limarí','Ovalle'),
    ('Coquimbo','Limarí','Combarbalá'),
    ('Coquimbo','Limarí','Monte Patria'),
    ('Coquimbo','Limarí','Punitaqui'),
    ('Coquimbo','Limarí','Río Hurtado'),
    -- ===== V Valparaíso (38) =====
    ('Valparaíso','Valparaíso','Valparaíso'),
    ('Valparaíso','Valparaíso','Casablanca'),
    ('Valparaíso','Valparaíso','Concón'),
    ('Valparaíso','Valparaíso','Juan Fernández'),
    ('Valparaíso','Valparaíso','Puchuncaví'),
    ('Valparaíso','Valparaíso','Quintero'),
    ('Valparaíso','Valparaíso','Viña del Mar'),
    ('Valparaíso','Isla de Pascua','Isla de Pascua'),
    ('Valparaíso','Los Andes','Los Andes'),
    ('Valparaíso','Los Andes','Calle Larga'),
    ('Valparaíso','Los Andes','Rinconada'),
    ('Valparaíso','Los Andes','San Esteban'),
    ('Valparaíso','Petorca','La Ligua'),
    ('Valparaíso','Petorca','Cabildo'),
    ('Valparaíso','Petorca','Papudo'),
    ('Valparaíso','Petorca','Petorca'),
    ('Valparaíso','Petorca','Zapallar'),
    ('Valparaíso','Quillota','Quillota'),
    ('Valparaíso','Quillota','La Calera'),
    ('Valparaíso','Quillota','Hijuelas'),
    ('Valparaíso','Quillota','La Cruz'),
    ('Valparaíso','Quillota','Nogales'),
    ('Valparaíso','San Antonio','San Antonio'),
    ('Valparaíso','San Antonio','Algarrobo'),
    ('Valparaíso','San Antonio','Cartagena'),
    ('Valparaíso','San Antonio','El Quisco'),
    ('Valparaíso','San Antonio','El Tabo'),
    ('Valparaíso','San Antonio','Santo Domingo'),
    ('Valparaíso','San Felipe de Aconcagua','San Felipe'),
    ('Valparaíso','San Felipe de Aconcagua','Catemu'),
    ('Valparaíso','San Felipe de Aconcagua','Llaillay'),
    ('Valparaíso','San Felipe de Aconcagua','Panquehue'),
    ('Valparaíso','San Felipe de Aconcagua','Putaendo'),
    ('Valparaíso','San Felipe de Aconcagua','Santa María'),
    ('Valparaíso','Marga Marga','Quilpué'),
    ('Valparaíso','Marga Marga','Limache'),
    ('Valparaíso','Marga Marga','Olmué'),
    ('Valparaíso','Marga Marga','Villa Alemana'),
    -- ===== RM Metropolitana (52) =====
    ('Metropolitana de Santiago','Santiago','Santiago'),
    ('Metropolitana de Santiago','Santiago','Cerrillos'),
    ('Metropolitana de Santiago','Santiago','Cerro Navia'),
    ('Metropolitana de Santiago','Santiago','Conchalí'),
    ('Metropolitana de Santiago','Santiago','El Bosque'),
    ('Metropolitana de Santiago','Santiago','Estación Central'),
    ('Metropolitana de Santiago','Santiago','Huechuraba'),
    ('Metropolitana de Santiago','Santiago','Independencia'),
    ('Metropolitana de Santiago','Santiago','La Cisterna'),
    ('Metropolitana de Santiago','Santiago','La Florida'),
    ('Metropolitana de Santiago','Santiago','La Granja'),
    ('Metropolitana de Santiago','Santiago','La Pintana'),
    ('Metropolitana de Santiago','Santiago','La Reina'),
    ('Metropolitana de Santiago','Santiago','Las Condes'),
    ('Metropolitana de Santiago','Santiago','Lo Barnechea'),
    ('Metropolitana de Santiago','Santiago','Lo Espejo'),
    ('Metropolitana de Santiago','Santiago','Lo Prado'),
    ('Metropolitana de Santiago','Santiago','Macul'),
    ('Metropolitana de Santiago','Santiago','Maipú'),
    ('Metropolitana de Santiago','Santiago','Ñuñoa'),
    ('Metropolitana de Santiago','Santiago','Pedro Aguirre Cerda'),
    ('Metropolitana de Santiago','Santiago','Peñalolén'),
    ('Metropolitana de Santiago','Santiago','Providencia'),
    ('Metropolitana de Santiago','Santiago','Pudahuel'),
    ('Metropolitana de Santiago','Santiago','Quilicura'),
    ('Metropolitana de Santiago','Santiago','Quinta Normal'),
    ('Metropolitana de Santiago','Santiago','Recoleta'),
    ('Metropolitana de Santiago','Santiago','Renca'),
    ('Metropolitana de Santiago','Santiago','San Joaquín'),
    ('Metropolitana de Santiago','Santiago','San Miguel'),
    ('Metropolitana de Santiago','Santiago','San Ramón'),
    ('Metropolitana de Santiago','Santiago','Vitacura'),
    ('Metropolitana de Santiago','Cordillera','Puente Alto'),
    ('Metropolitana de Santiago','Cordillera','Pirque'),
    ('Metropolitana de Santiago','Cordillera','San José de Maipo'),
    ('Metropolitana de Santiago','Chacabuco','Colina'),
    ('Metropolitana de Santiago','Chacabuco','Lampa'),
    ('Metropolitana de Santiago','Chacabuco','Tiltil'),
    ('Metropolitana de Santiago','Maipo','San Bernardo'),
    ('Metropolitana de Santiago','Maipo','Buin'),
    ('Metropolitana de Santiago','Maipo','Calera de Tango'),
    ('Metropolitana de Santiago','Maipo','Paine'),
    ('Metropolitana de Santiago','Melipilla','Melipilla'),
    ('Metropolitana de Santiago','Melipilla','Alhué'),
    ('Metropolitana de Santiago','Melipilla','Curacaví'),
    ('Metropolitana de Santiago','Melipilla','María Pinto'),
    ('Metropolitana de Santiago','Melipilla','San Pedro'),
    ('Metropolitana de Santiago','Talagante','Talagante'),
    ('Metropolitana de Santiago','Talagante','El Monte'),
    ('Metropolitana de Santiago','Talagante','Isla de Maipo'),
    ('Metropolitana de Santiago','Talagante','Padre Hurtado'),
    ('Metropolitana de Santiago','Talagante','Peñaflor'),
    -- ===== VI O'Higgins (33) =====
    ('Libertador General Bernardo O''Higgins','Cachapoal','Rancagua'),
    ('Libertador General Bernardo O''Higgins','Cachapoal','Codegua'),
    ('Libertador General Bernardo O''Higgins','Cachapoal','Coinco'),
    ('Libertador General Bernardo O''Higgins','Cachapoal','Coltauco'),
    ('Libertador General Bernardo O''Higgins','Cachapoal','Doñihue'),
    ('Libertador General Bernardo O''Higgins','Cachapoal','Graneros'),
    ('Libertador General Bernardo O''Higgins','Cachapoal','Las Cabras'),
    ('Libertador General Bernardo O''Higgins','Cachapoal','Machalí'),
    ('Libertador General Bernardo O''Higgins','Cachapoal','Malloa'),
    ('Libertador General Bernardo O''Higgins','Cachapoal','Mostazal'),
    ('Libertador General Bernardo O''Higgins','Cachapoal','Olivar'),
    ('Libertador General Bernardo O''Higgins','Cachapoal','Peumo'),
    ('Libertador General Bernardo O''Higgins','Cachapoal','Pichidegua'),
    ('Libertador General Bernardo O''Higgins','Cachapoal','Quinta de Tilcoco'),
    ('Libertador General Bernardo O''Higgins','Cachapoal','Rengo'),
    ('Libertador General Bernardo O''Higgins','Cachapoal','Requínoa'),
    ('Libertador General Bernardo O''Higgins','Cachapoal','San Vicente'),
    ('Libertador General Bernardo O''Higgins','Cardenal Caro','Pichilemu'),
    ('Libertador General Bernardo O''Higgins','Cardenal Caro','La Estrella'),
    ('Libertador General Bernardo O''Higgins','Cardenal Caro','Litueche'),
    ('Libertador General Bernardo O''Higgins','Cardenal Caro','Marchihue'),
    ('Libertador General Bernardo O''Higgins','Cardenal Caro','Navidad'),
    ('Libertador General Bernardo O''Higgins','Cardenal Caro','Paredones'),
    ('Libertador General Bernardo O''Higgins','Colchagua','San Fernando'),
    ('Libertador General Bernardo O''Higgins','Colchagua','Chépica'),
    ('Libertador General Bernardo O''Higgins','Colchagua','Chimbarongo'),
    ('Libertador General Bernardo O''Higgins','Colchagua','Lolol'),
    ('Libertador General Bernardo O''Higgins','Colchagua','Nancagua'),
    ('Libertador General Bernardo O''Higgins','Colchagua','Palmilla'),
    ('Libertador General Bernardo O''Higgins','Colchagua','Peralillo'),
    ('Libertador General Bernardo O''Higgins','Colchagua','Placilla'),
    ('Libertador General Bernardo O''Higgins','Colchagua','Pumanque'),
    ('Libertador General Bernardo O''Higgins','Colchagua','Santa Cruz'),
    -- ===== VII Maule (30) =====
    ('Maule','Talca','Talca'),
    ('Maule','Talca','Constitución'),
    ('Maule','Talca','Curepto'),
    ('Maule','Talca','Empedrado'),
    ('Maule','Talca','Maule'),
    ('Maule','Talca','Pelarco'),
    ('Maule','Talca','Pencahue'),
    ('Maule','Talca','Río Claro'),
    ('Maule','Talca','San Clemente'),
    ('Maule','Talca','San Rafael'),
    ('Maule','Cauquenes','Cauquenes'),
    ('Maule','Cauquenes','Chanco'),
    ('Maule','Cauquenes','Pelluhue'),
    ('Maule','Curicó','Curicó'),
    ('Maule','Curicó','Hualañé'),
    ('Maule','Curicó','Licantén'),
    ('Maule','Curicó','Molina'),
    ('Maule','Curicó','Rauco'),
    ('Maule','Curicó','Romeral'),
    ('Maule','Curicó','Sagrada Familia'),
    ('Maule','Curicó','Teno'),
    ('Maule','Curicó','Vichuquén'),
    ('Maule','Linares','Linares'),
    ('Maule','Linares','Colbún'),
    ('Maule','Linares','Longaví'),
    ('Maule','Linares','Parral'),
    ('Maule','Linares','Retiro'),
    ('Maule','Linares','San Javier'),
    ('Maule','Linares','Villa Alegre'),
    ('Maule','Linares','Yerbas Buenas'),
    -- ===== XVI Ñuble (21) =====
    ('Ñuble','Diguillín','Chillán'),
    ('Ñuble','Diguillín','Bulnes'),
    ('Ñuble','Diguillín','Chillán Viejo'),
    ('Ñuble','Diguillín','El Carmen'),
    ('Ñuble','Diguillín','Pemuco'),
    ('Ñuble','Diguillín','Pinto'),
    ('Ñuble','Diguillín','Quillón'),
    ('Ñuble','Diguillín','San Ignacio'),
    ('Ñuble','Diguillín','Yungay'),
    ('Ñuble','Itata','Quirihue'),
    ('Ñuble','Itata','Cobquecura'),
    ('Ñuble','Itata','Coelemu'),
    ('Ñuble','Itata','Ninhue'),
    ('Ñuble','Itata','Portezuelo'),
    ('Ñuble','Itata','Ránquil'),
    ('Ñuble','Itata','Treguaco'),
    ('Ñuble','Punilla','San Carlos'),
    ('Ñuble','Punilla','Coihueco'),
    ('Ñuble','Punilla','Ñiquén'),
    ('Ñuble','Punilla','San Fabián'),
    ('Ñuble','Punilla','San Nicolás'),
    -- ===== VIII Biobío (33) =====
    ('Biobío','Concepción','Concepción'),
    ('Biobío','Concepción','Coronel'),
    ('Biobío','Concepción','Chiguayante'),
    ('Biobío','Concepción','Florida'),
    ('Biobío','Concepción','Hualpén'),
    ('Biobío','Concepción','Hualqui'),
    ('Biobío','Concepción','Lota'),
    ('Biobío','Concepción','Penco'),
    ('Biobío','Concepción','San Pedro de la Paz'),
    ('Biobío','Concepción','Santa Juana'),
    ('Biobío','Concepción','Talcahuano'),
    ('Biobío','Concepción','Tomé'),
    ('Biobío','Arauco','Lebu'),
    ('Biobío','Arauco','Arauco'),
    ('Biobío','Arauco','Cañete'),
    ('Biobío','Arauco','Contulmo'),
    ('Biobío','Arauco','Curanilahue'),
    ('Biobío','Arauco','Los Álamos'),
    ('Biobío','Arauco','Tirúa'),
    ('Biobío','Biobío','Los Ángeles'),
    ('Biobío','Biobío','Antuco'),
    ('Biobío','Biobío','Cabrero'),
    ('Biobío','Biobío','Laja'),
    ('Biobío','Biobío','Mulchén'),
    ('Biobío','Biobío','Nacimiento'),
    ('Biobío','Biobío','Negrete'),
    ('Biobío','Biobío','Quilaco'),
    ('Biobío','Biobío','Quilleco'),
    ('Biobío','Biobío','San Rosendo'),
    ('Biobío','Biobío','Santa Bárbara'),
    ('Biobío','Biobío','Tucapel'),
    ('Biobío','Biobío','Yumbel'),
    ('Biobío','Biobío','Alto Biobío'),
    -- ===== IX La Araucanía (32) =====
    ('La Araucanía','Cautín','Temuco'),
    ('La Araucanía','Cautín','Carahue'),
    ('La Araucanía','Cautín','Cholchol'),
    ('La Araucanía','Cautín','Cunco'),
    ('La Araucanía','Cautín','Curarrehue'),
    ('La Araucanía','Cautín','Freire'),
    ('La Araucanía','Cautín','Galvarino'),
    ('La Araucanía','Cautín','Gorbea'),
    ('La Araucanía','Cautín','Lautaro'),
    ('La Araucanía','Cautín','Loncoche'),
    ('La Araucanía','Cautín','Melipeuco'),
    ('La Araucanía','Cautín','Nueva Imperial'),
    ('La Araucanía','Cautín','Padre Las Casas'),
    ('La Araucanía','Cautín','Perquenco'),
    ('La Araucanía','Cautín','Pitrufquén'),
    ('La Araucanía','Cautín','Pucón'),
    ('La Araucanía','Cautín','Saavedra'),
    ('La Araucanía','Cautín','Teodoro Schmidt'),
    ('La Araucanía','Cautín','Toltén'),
    ('La Araucanía','Cautín','Vilcún'),
    ('La Araucanía','Cautín','Villarrica'),
    ('La Araucanía','Malleco','Angol'),
    ('La Araucanía','Malleco','Collipulli'),
    ('La Araucanía','Malleco','Curacautín'),
    ('La Araucanía','Malleco','Ercilla'),
    ('La Araucanía','Malleco','Lonquimay'),
    ('La Araucanía','Malleco','Los Sauces'),
    ('La Araucanía','Malleco','Lumaco'),
    ('La Araucanía','Malleco','Purén'),
    ('La Araucanía','Malleco','Renaico'),
    ('La Araucanía','Malleco','Traiguén'),
    ('La Araucanía','Malleco','Victoria'),
    -- ===== XIV Los Ríos (12) =====
    ('Los Ríos','Valdivia','Valdivia'),
    ('Los Ríos','Valdivia','Corral'),
    ('Los Ríos','Valdivia','Lanco'),
    ('Los Ríos','Valdivia','Los Lagos'),
    ('Los Ríos','Valdivia','Máfil'),
    ('Los Ríos','Valdivia','Mariquina'),
    ('Los Ríos','Valdivia','Paillaco'),
    ('Los Ríos','Valdivia','Panguipulli'),
    ('Los Ríos','Ranco','La Unión'),
    ('Los Ríos','Ranco','Futrono'),
    ('Los Ríos','Ranco','Lago Ranco'),
    ('Los Ríos','Ranco','Río Bueno'),
    -- ===== X Los Lagos (30) =====
    ('Los Lagos','Llanquihue','Puerto Montt'),
    ('Los Lagos','Llanquihue','Calbuco'),
    ('Los Lagos','Llanquihue','Cochamó'),
    ('Los Lagos','Llanquihue','Fresia'),
    ('Los Lagos','Llanquihue','Frutillar'),
    ('Los Lagos','Llanquihue','Llanquihue'),
    ('Los Lagos','Llanquihue','Los Muermos'),
    ('Los Lagos','Llanquihue','Maullín'),
    ('Los Lagos','Llanquihue','Puerto Varas'),
    ('Los Lagos','Chiloé','Castro'),
    ('Los Lagos','Chiloé','Ancud'),
    ('Los Lagos','Chiloé','Chonchi'),
    ('Los Lagos','Chiloé','Curaco de Vélez'),
    ('Los Lagos','Chiloé','Dalcahue'),
    ('Los Lagos','Chiloé','Puqueldón'),
    ('Los Lagos','Chiloé','Queilén'),
    ('Los Lagos','Chiloé','Quellón'),
    ('Los Lagos','Chiloé','Quemchi'),
    ('Los Lagos','Chiloé','Quinchao'),
    ('Los Lagos','Osorno','Osorno'),
    ('Los Lagos','Osorno','Puerto Octay'),
    ('Los Lagos','Osorno','Purranque'),
    ('Los Lagos','Osorno','Puyehue'),
    ('Los Lagos','Osorno','Río Negro'),
    ('Los Lagos','Osorno','San Juan de la Costa'),
    ('Los Lagos','Osorno','San Pablo'),
    ('Los Lagos','Palena','Chaitén'),
    ('Los Lagos','Palena','Futaleufú'),
    ('Los Lagos','Palena','Hualaihué'),
    ('Los Lagos','Palena','Palena'),
    -- ===== XI Aysén (10) =====
    ('Aysén del General Carlos Ibáñez del Campo','Coyhaique','Coyhaique'),
    ('Aysén del General Carlos Ibáñez del Campo','Coyhaique','Lago Verde'),
    ('Aysén del General Carlos Ibáñez del Campo','Aysén','Aysén'),
    ('Aysén del General Carlos Ibáñez del Campo','Aysén','Cisnes'),
    ('Aysén del General Carlos Ibáñez del Campo','Aysén','Guaitecas'),
    ('Aysén del General Carlos Ibáñez del Campo','Capitán Prat','Cochrane'),
    ('Aysén del General Carlos Ibáñez del Campo','Capitán Prat','O''Higgins'),
    ('Aysén del General Carlos Ibáñez del Campo','Capitán Prat','Tortel'),
    ('Aysén del General Carlos Ibáñez del Campo','General Carrera','Chile Chico'),
    ('Aysén del General Carlos Ibáñez del Campo','General Carrera','Río Ibáñez'),
    -- ===== XII Magallanes (11) =====
    ('Magallanes y de la Antártica Chilena','Magallanes','Punta Arenas'),
    ('Magallanes y de la Antártica Chilena','Magallanes','Laguna Blanca'),
    ('Magallanes y de la Antártica Chilena','Magallanes','Río Verde'),
    ('Magallanes y de la Antártica Chilena','Magallanes','San Gregorio'),
    ('Magallanes y de la Antártica Chilena','Antártica Chilena','Cabo de Hornos'),
    ('Magallanes y de la Antártica Chilena','Antártica Chilena','Antártica'),
    ('Magallanes y de la Antártica Chilena','Tierra del Fuego','Porvenir'),
    ('Magallanes y de la Antártica Chilena','Tierra del Fuego','Primavera'),
    ('Magallanes y de la Antártica Chilena','Tierra del Fuego','Timaukel'),
    ('Magallanes y de la Antártica Chilena','Última Esperanza','Natales'),
    ('Magallanes y de la Antártica Chilena','Última Esperanza','Torres del Paine')
  ) AS c(region_nombre, provincia_nombre, nombre)
  JOIN regiones r   ON r.nombre  = c.region_nombre
  JOIN provincias pp ON pp.region_id = r.id_region AND pp.nombre = c.provincia_nombre
ON CONFLICT (provincia_id, nombre) DO NOTHING;

-- ---------------------------------------------------------------------
-- 5) Migrar farmacias: reemplazar `ciudad` por `comuna_id`
-- ---------------------------------------------------------------------
-- IMPORTANTE: la vista v_pedidos_completos (creada en la migración 05)
-- referencia farmacias.ciudad. Hay que dropearla ANTES de eliminar la
-- columna; la recrearemos al final de este script con el modelo nuevo.
DROP VIEW IF EXISTS v_pedidos_completos;
DROP VIEW IF EXISTS v_farmacias_completas;

DO $$
BEGIN
    -- Limpiar farmacias demo previas (tenían ciudades de El Salvador)
    DELETE FROM farmacias
     WHERE nombre IN ('Farmacia Central', 'Farmacia Norte', 'Farmacia del Valle');

    -- Quitar la UNIQUE (nombre, ciudad) si existe
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints
         WHERE table_name = 'farmacias'
           AND constraint_name = 'uq_farmacia_nombre_ciudad'
    ) THEN
        ALTER TABLE farmacias DROP CONSTRAINT uq_farmacia_nombre_ciudad;
    END IF;

    -- Quitar la columna `ciudad` (con CASCADE como red de seguridad por
    -- si quedó algún índice/constraint colgando referenciándola)
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_name = 'farmacias' AND column_name = 'ciudad'
    ) THEN
        ALTER TABLE farmacias DROP COLUMN ciudad CASCADE;
    END IF;
END $$;

-- Añadir columna comuna_id (NULL temporalmente para no romper si hay datos
-- legítimos previos; se rellenará y luego se hace NOT NULL).
ALTER TABLE farmacias
    ADD COLUMN IF NOT EXISTS comuna_id BIGINT;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
         WHERE constraint_name = 'fk_farmacias_comuna'
           AND table_name = 'farmacias'
    ) THEN
        ALTER TABLE farmacias
            ADD CONSTRAINT fk_farmacias_comuna
            FOREIGN KEY (comuna_id)
            REFERENCES comunas(id_comuna)
            ON UPDATE CASCADE ON DELETE RESTRICT;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_farmacias_comuna ON farmacias(comuna_id);

-- ---------------------------------------------------------------------
-- 6) Re-sembrar farmacias demo con comunas chilenas válidas
-- ---------------------------------------------------------------------
INSERT INTO farmacias (nombre, direccion, telefono, comuna_id, activa)
SELECT v.nombre, v.direccion, v.telefono, c.id_comuna, TRUE
  FROM (VALUES
    ('Farmacia Central',   'Av. Libertador Bernardo O''Higgins 1234', '+56 2 2222 1111', 'Santiago'),
    ('Farmacia Norte',     'Av. Recoleta 5678',                       '+56 2 2222 2222', 'Recoleta'),
    ('Farmacia del Valle', 'Calle Independencia 910',                  '+56 2 2222 3333', 'Providencia'),
    ('Farmacia Costera',   'Av. Pedro Montt 222',                     '+56 32 222 4444', 'Valparaíso'),
    ('Farmacia Sur',       'Av. Alemania 1500',                       '+56 41 222 5555', 'Concepción')
  ) AS v(nombre, direccion, telefono, comuna_nombre)
  JOIN comunas c ON c.nombre = v.comuna_nombre
ON CONFLICT DO NOTHING;

-- Promover comuna_id a NOT NULL (solo si todas las filas tienen valor)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM farmacias WHERE comuna_id IS NULL) THEN
        ALTER TABLE farmacias
            ALTER COLUMN comuna_id SET NOT NULL;
    END IF;
END $$;

-- Restaurar la unicidad: misma farmacia (mismo nombre) no puede repetirse
-- en la misma comuna; pero sí puede haber "Farmacia Central" en varias.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
         WHERE table_name = 'farmacias'
           AND constraint_name = 'uq_farmacia_nombre_comuna'
    ) THEN
        ALTER TABLE farmacias
            ADD CONSTRAINT uq_farmacia_nombre_comuna
            UNIQUE (nombre, comuna_id);
    END IF;
END $$;

-- ---------------------------------------------------------------------
-- 7) Vista útil: farmacias con jerarquía geográfica completa
-- ---------------------------------------------------------------------
DROP VIEW IF EXISTS v_farmacias_completas;
CREATE VIEW v_farmacias_completas AS
SELECT  f.id_farmacia,
        f.nombre,
        f.direccion,
        f.telefono,
        f.activa,
        f.fecha_creacion,
        f.comuna_id,
        c.nombre  AS comuna,
        pp.id_provincia,
        pp.nombre AS provincia,
        r.id_region,
        r.nombre  AS region,
        r.codigo_romano AS region_codigo
  FROM farmacias f
  JOIN comunas    c  ON c.id_comuna  = f.comuna_id
  JOIN provincias pp ON pp.id_provincia = c.provincia_id
  JOIN regiones   r  ON r.id_region = pp.region_id;

-- ---------------------------------------------------------------------
-- 8) Actualizar la vista v_pedidos_completos para reflejar la comuna
-- ---------------------------------------------------------------------
DROP VIEW IF EXISTS v_pedidos_completos;
CREATE VIEW v_pedidos_completos AS
SELECT  p.id_pedido,
        p.codigo_pedido,
        p.nombre_cliente,
        p.direccion_entrega,
        p.telefono_cliente,
        p.detalle_pedido,
        p.fecha_creacion,
        p.fecha_programada,
        e.nombre_estado                                AS estado_actual,
        (uc.nombre || ' ' || uc.apellido)              AS operadora_crea,
        r.codigo_ruta,
        r.estado_ruta,
        (m.nombre || ' ' || m.apellido)                AS motorista,
        p.farmacia_id,
        f.nombre                                       AS farmacia_nombre,
        co.nombre                                      AS farmacia_comuna,
        reg.nombre                                     AS farmacia_region,
        p.activo
FROM    pedidos p
JOIN    estados_pedido e ON e.id_estado = p.estado_actual_id
JOIN    usuarios uc      ON uc.id_usuario = p.operadora_crea_id
LEFT JOIN rutas r        ON r.pedido_id   = p.id_pedido
                            AND r.estado_ruta IN ('asignada','en_curso','finalizada')
LEFT JOIN usuarios m     ON m.id_usuario  = r.motorista_id
LEFT JOIN farmacias f    ON f.id_farmacia = p.farmacia_id
LEFT JOIN comunas    co  ON co.id_comuna  = f.comuna_id
LEFT JOIN provincias pr  ON pr.id_provincia = co.provincia_id
LEFT JOIN regiones   reg ON reg.id_region = pr.region_id;
