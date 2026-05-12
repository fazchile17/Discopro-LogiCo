# 4. Base de datos relacional (PostgreSQL)

> Esquema completo en `database/01_schema.sql`, triggers en `02_triggers.sql`,
> seeds en `03_seeds.sql` y datos no estructurados en `04_audit_storage.sql`.

## 4.1 Tablas principales (10 entidades)

| # | Tabla | PK | Descripción |
|---|---|---|---|
| 1 | `usuarios` | `id_usuario` | Operadoras, motoristas y admins |
| 2 | `estados_pedido` | `id_estado` | Catálogo de estados (6 valores fijos) |
| 3 | `pedidos` | `id_pedido` | Tabla central |
| 4 | `historial_estados` | `id_historial` | Trazabilidad completa |
| 5 | `rutas` | `id_ruta` | Asignación motorista ↔ pedido |
| 6 | `disponibilidad_motorista` | `id_disponibilidad` | Estado actual del motorista |
| 7 | `incidencias` | `id_incidencia` | Eventos de no-entrega |
| 8 | `reprogramaciones` | `id_reprogramacion` | Cambios de fecha |
| 9 | `audit_logs` | `id_log` | Auditoría JSONB (no estructurado) |
| 10 | `evidencias` | `id_evidencia` | Metadatos de archivos en Storage |

## 4.2 Foreign Keys e integridad referencial

| Tabla | FK | Referencia | ON DELETE | Justificación |
|---|---|---|---|---|
| `pedidos` | `estado_actual_id` | `estados_pedido` | RESTRICT | Un estado no se borra si tiene pedidos |
| `pedidos` | `operadora_crea_id` | `usuarios` | RESTRICT | No borrar usuario que ha creado pedidos |
| `pedidos` | `operadora_modifica_id` | `usuarios` | SET NULL | Permitir borrar usuario; el dato histórico queda |
| `historial_estados` | `pedido_id` | `pedidos` | CASCADE | Si se borra el pedido, su historial también |
| `historial_estados` | `estado_id` | `estados_pedido` | RESTRICT | — |
| `historial_estados` | `usuario_id` | `usuarios` | RESTRICT | Trazabilidad |
| `rutas` | `pedido_id` | `pedidos` | CASCADE | — |
| `rutas` | `motorista_id` | `usuarios` | RESTRICT | — |
| `disponibilidad_motorista` | `motorista_id` | `usuarios` | CASCADE | — |
| `incidencias` | `pedido_id` | `pedidos` | CASCADE | — |
| `incidencias` | `ruta_id` | `rutas` | SET NULL | — |
| `incidencias` | `usuario_id` | `usuarios` | RESTRICT | — |
| `reprogramaciones` | `pedido_id` | `pedidos` | CASCADE | — |
| `reprogramaciones` | `usuario_id` | `usuarios` | RESTRICT | — |
| `evidencias` | `pedido_id` | `pedidos` | CASCADE | — |
| `evidencias` | `incidencia_id` | `incidencias` | SET NULL | — |
| `audit_logs` | `usuario_id` | `usuarios` | SET NULL | El log debe sobrevivir al borrado del usuario |

## 4.3 Restricciones (constraints)

### CHECK
- `usuarios.rol IN ('operadora','motorista','admin')`
- `estados_pedido.nombre_estado IN ('retiro_receta','en_ruta','entregado','no_entregado','reprogramado','retiro_pedido')`
- `rutas.estado_ruta IN ('asignada','en_curso','finalizada','cancelada')`
- `incidencias.tipo_incidencia IN ('cliente_ausente','direccion_incorrecta','rechazo_cliente','accidente','producto_danado','otro')`
- `reprogramaciones.fecha_nueva > fecha_anterior`
- `evidencias.tipo IN ('entrega','incidencia','firma','otro')`
- `audit_logs.nivel IN ('INFO','WARN','ERROR','SECURITY')`

### UNIQUE
- `usuarios.correo` (CITEXT case-insensitive)
- `usuarios.firebase_uid`
- `pedidos.codigo_pedido`
- `estados_pedido.nombre_estado`
- `rutas.codigo_ruta`
- `disponibilidad_motorista.motorista_id`

### Índices únicos parciales (regla de negocio enforced en BD)

```sql
-- Regla 1: 1 ruta activa por motorista
CREATE UNIQUE INDEX uq_motorista_ruta_activa
    ON rutas (motorista_id)
    WHERE estado_ruta IN ('asignada','en_curso');

-- Regla 2: 1 ruta activa por pedido
CREATE UNIQUE INDEX uq_pedido_ruta_activa
    ON rutas (pedido_id)
    WHERE estado_ruta IN ('asignada','en_curso');

-- Anti-duplicados de pedido (mismo cliente + fecha + detalle)
CREATE UNIQUE INDEX uq_pedidos_no_duplicado
    ON pedidos (nombre_cliente, telefono_cliente, fecha_programada, md5(detalle_pedido))
    WHERE activo = TRUE;
```

## 4.4 Triggers (defensa en profundidad)

| Trigger | Tabla | Cuándo | Qué hace |
|---|---|---|---|
| `trg_sync_estado_pedido` | `historial_estados` | AFTER INSERT | Actualiza `pedidos.estado_actual_id` con el último historial |
| `trg_validar_rol_pedido` | `pedidos` | BEFORE INSERT | Solo `operadora`/`admin` pueden crear |
| `trg_validar_rol_ruta` | `rutas` | BEFORE INSERT/UPDATE | El usuario asignado debe tener `rol = motorista` |
| `trg_actualizar_disp_motorista` | `rutas` | AFTER INSERT/UPDATE | Marca `disponible=FALSE` al asignar y `TRUE` al cerrar |
| `trg_bloquear_update_estado_directo` | `pedidos` | BEFORE UPDATE OF estado_actual_id | Impide cambiar el estado sin haber insertado historial primero |

## 4.5 Vistas (consultas reutilizables)

```sql
v_pedidos_completos        -- pedido + estado + operadora + ruta + motorista (JOIN)
v_motoristas_disponibles   -- motoristas con flag disponible y sin ruta activa
```

## 4.6 Diagrama del MER

Ver `docs/02-arquitectura-4+1.md` sección 2.1.1 para el ER en formato mermaid.

## 4.7 Diccionario de datos resumido

### `pedidos` (tabla central)

| Columna | Tipo | Null | Default | Descripción |
|---|---|---|---|---|
| `id_pedido` | BIGSERIAL | NO | — | PK |
| `codigo_pedido` | VARCHAR(30) | NO | gen | Código humano único (PED-XXX) |
| `nombre_cliente` | VARCHAR(120) | NO | — | — |
| `direccion_entrega` | VARCHAR(255) | NO | — | — |
| `telefono_cliente` | VARCHAR(30) | NO | — | — |
| `detalle_pedido` | TEXT | NO | — | — |
| `observacion` | TEXT | SI | NULL | — |
| `fecha_creacion` | TIMESTAMPTZ | NO | NOW() | Auditoría |
| `fecha_programada` | TIMESTAMPTZ | NO | — | Cuándo entregar |
| `estado_actual_id` | INT | NO | — | FK estados_pedido |
| `operadora_crea_id` | BIGINT | NO | — | FK usuarios |
| `operadora_modifica_id` | BIGINT | SI | NULL | FK usuarios (último que tocó) |
| `activo` | BOOLEAN | NO | TRUE | Soft delete |

### `historial_estados` (trazabilidad inmutable)

| Columna | Tipo | Descripción |
|---|---|---|
| `id_historial` | BIGSERIAL PK | — |
| `pedido_id` | BIGINT FK | — |
| `estado_id` | INT FK | — |
| `fecha_hora` | TIMESTAMPTZ | NOW() automático |
| `comentario` | TEXT | Opcional |
| `usuario_id` | BIGINT FK | Quien hizo el cambio |

> Esta tabla es **append-only**. Nunca se hace UPDATE ni DELETE en producción.

## 4.8 Estrategia de migraciones

Se usa una convención numérica (`01_*.sql`, `02_*.sql`, ...) ejecutada con `psql -f`.
Para producción se recomienda migrar a una herramienta como **node-pg-migrate** o **Flyway**
con tabla `schema_migrations`.

## 4.9 Plan de respaldos

| Tipo | Frecuencia | Retención | Responsable |
|---|---|---|---|
| Snapshot automático Cloud SQL | Diario 02:00 SLV | 7 días | Google |
| WAL / point-in-time recovery | Continuo | 7 días | Google |
| Export lógico (`pg_dump`) | Semanal lunes 03:00 | 30 días | DevOps (cron) |
| Export anual archivado | Anual | 7 años | DevOps + GCS coldline |
