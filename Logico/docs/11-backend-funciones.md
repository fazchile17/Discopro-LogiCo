# 11. Backend — Funciones implementadas

Cada función vive en `functions/src/*.js`, valida sus inputs, ejecuta una transacción
SQL y registra auditoría. El handler HTTP la conecta en `functions/index.js`.

### Mapa de la API REST por dominio

Prefijo público: `/api` (rewrite desde Hosting). Autenticación: `Authorization: Bearer <ID Token>` salvo `/health`.

```mermaid
flowchart LR
    subgraph Pedidos
        P1[GET/POST /pedidos]
        P2[GET /pedidos/:id]
        P3[POST /pedidos/:id/entregar]
        P4[POST /pedidos/:id/incidencias]
        P5[POST /pedidos/:id/evidencias]
    end
    subgraph Rutas_Motoristas
        R1[POST /rutas/asignar]
        R2[POST /rutas/:id/iniciar]
        R3[GET /motoristas/disponibles]
        R4[GET/PUT /motoristas/:id/...]
    end
    subgraph Admin
        A1[/farmacias CRUD]
        A2[/usuarios + rol]
        A3[/motos CRUD]
        A4[/auditoria]
    end
    subgraph Sistema
        S1[GET /health]
        S2[GET /me]
        S3[/geografia/*]
    end
```

| Dominio | Módulo `src/` | Roles típicos |
|---|---|---|
| Pedidos y estados | `pedidos.js`, `estados.js` | operadora, admin, motorista (asignado) |
| Rutas y disponibilidad | `rutas.js` | operadora, admin, motorista |
| Incidencias / reprogramación | `incidencias.js`, `reprogramaciones.js` | motorista, operadora |
| Evidencias | `evidencias.js` + Storage | motorista |
| Mantenedores | `farmacias.js`, `usuarios.js`, `motos.js` | admin |
| Transversal | `auth.js`, `audit.js` | todos / admin |

## 11.1 `crearPedido()`

| Atributo | Valor |
|---|---|
| Archivo | `functions/src/pedidos.js` |
| Endpoint | `POST /api/pedidos` |
| Autorización | `operadora`, `admin` |

**Validaciones**:
- Campos obligatorios (`nombre_cliente`, `direccion_entrega`, `telefono_cliente`, `detalle_pedido`, `fecha_programada`).
- `fecha_programada` debe ser ISO 8601 válida.
- Estado inicial debe existir en `estados_pedido`.

**Transacción**:
```sql
BEGIN;
    SELECT id_estado FROM estados_pedido WHERE nombre_estado = 'retiro_receta';
    INSERT INTO pedidos (...) VALUES (...) RETURNING *;
    INSERT INTO historial_estados (pedido_id, estado_id, comentario, usuario_id) VALUES (...);
COMMIT;
```

**Errores posibles**:
- 400 ValidationError (campos faltantes / fecha inválida).
- 409 ConflictError (índice único: pedido duplicado).

---

## 11.2 `asignarMotorista()`

| Atributo | Valor |
|---|---|
| Archivo | `functions/src/rutas.js` |
| Endpoint | `POST /api/rutas/asignar` |
| Autorización | `operadora`, `admin` |

**Validaciones**:
- `pedidoId` y `motoristaId` obligatorios.
- Pedido debe existir y estar `activo = TRUE`.
- Motorista debe tener `rol = motorista`, `activo = TRUE`, `disponible = TRUE`.
- **Regla 1** y **2**: ni el motorista ni el pedido tienen ruta activa.

**Transacción** con bloqueo pesimista:
```sql
BEGIN;
    SELECT * FROM pedidos WHERE id_pedido = $1 FOR UPDATE;
    SELECT * FROM rutas WHERE pedido_id = $1 AND estado_ruta IN ('asignada','en_curso');
    SELECT * FROM usuarios u LEFT JOIN disponibilidad_motorista d ... WHERE u.id_usuario = $2 FOR UPDATE OF u;
    SELECT * FROM rutas WHERE motorista_id = $2 AND estado_ruta IN ('asignada','en_curso');
    INSERT INTO rutas (codigo_ruta, pedido_id, motorista_id, estado_ruta) VALUES (..., 'asignada');
    -- trigger trg_actualizar_disp_motorista marca disponible=FALSE
    INSERT INTO historial_estados (..., 'retiro_pedido');
COMMIT;
```

**Errores posibles**:
- 409 ConflictError ("ya tiene ruta activa") — por concurrencia o llamada repetida.
- 422 BusinessRuleError ("motorista no disponible/desactivado").

---

## 11.3 `cambiarEstadoPedido()`

| Atributo | Valor |
|---|---|
| Archivo | `functions/src/estados.js` |
| Endpoint | `POST /api/pedidos/:id/estado` |
| Autorización | `operadora`, `admin`, `motorista` (asignado) |

**Máquina de transiciones**:

```js
const TRANSICIONES = {
    retiro_receta: ['retiro_pedido', 'reprogramado'],
    retiro_pedido: ['en_ruta', 'reprogramado', 'no_entregado'],
    en_ruta:       ['entregado', 'no_entregado'],
    no_entregado:  ['reprogramado', 'retiro_pedido'],
    reprogramado:  ['retiro_receta', 'retiro_pedido'],
    entregado:     [],   // terminal
};
```

**Validaciones**:
- Nuevo estado válido en `ESTADOS_VALIDOS`.
- Transición permitida desde el actual (defensivo, además del trigger BD).
- Si `req.user.rol === 'motorista'`, debe ser el asignado a la ruta activa.

**Transacción**:
```sql
BEGIN;
    SELECT id_pedido, activo, e.nombre_estado FROM pedidos p JOIN estados_pedido e ... FOR UPDATE;
    -- Si motorista, verificar ruta
    SELECT id_estado FROM estados_pedido WHERE nombre_estado = $1;
    INSERT INTO historial_estados (...);
    -- trigger fn_sync_estado_pedido actualiza pedidos.estado_actual_id
    -- Si nuevoEstado='entregado': UPDATE rutas SET estado_ruta='finalizada'
COMMIT;
```

---

## 11.4 `registrarEntrega()`

Atajo de `cambiarEstadoPedido({ nuevoEstado: 'entregado' })`.

| Endpoint | `POST /api/pedidos/:id/entregar` |
| Autorización | `motorista`, `admin` |
| Comentario | `req.body.comentario` (opcional, default "Entrega confirmada") |

Como efecto colateral:
- Inserta historial `entregado`.
- Actualiza `rutas.estado_ruta = finalizada`, `fecha_fin = NOW()`.
- Trigger `trg_actualizar_disp_motorista` libera al motorista.

---

## 11.5 `registrarIncidencia()`

| Atributo | Valor |
|---|---|
| Archivo | `functions/src/incidencias.js` |
| Endpoint | `POST /api/pedidos/:id/incidencias` |
| Autorización | autenticado (motorista solo de su ruta) |

**Validaciones**:
- `tipoIncidencia` ∈ `TIPOS_VALIDOS`.
- `descripcion` no vacía.
- Pedido activo.
- Si motorista, debe ser el asignado a la ruta más reciente.

**Transacción**:
```sql
BEGIN;
    SELECT id_pedido, activo FROM pedidos WHERE id_pedido = $1 FOR UPDATE;
    SELECT id_ruta, motorista_id, estado_ruta FROM rutas WHERE pedido_id = $1 ORDER BY fecha_asignacion DESC LIMIT 1;
    INSERT INTO incidencias (...);
    -- Si cambiarANoEntregado:
    INSERT INTO historial_estados (..., 'no_entregado');
    UPDATE rutas SET estado_ruta='cancelada', fecha_fin=NOW() WHERE id_ruta=...;
COMMIT;
```

Auditoría: nivel `WARN`.

---

## 11.6 `reprogramarPedido()`

| Atributo | Valor |
|---|---|
| Archivo | `functions/src/reprogramaciones.js` |
| Endpoint | `POST /api/pedidos/:id/reprogramar` |
| Autorización | `operadora`, `admin` |

**Validaciones**:
- `fechaNueva` ISO 8601 válida.
- `fechaNueva > pedido.fecha_programada`.
- Motivo obligatorio.

**Transacción**:
```sql
BEGIN;
    SELECT * FROM pedidos WHERE id_pedido = $1 FOR UPDATE;
    INSERT INTO reprogramaciones (pedido_id, fecha_anterior, fecha_nueva, motivo, usuario_id);
    UPDATE pedidos SET fecha_programada = $1, operadora_modifica_id = $2;
    INSERT INTO historial_estados (..., 'reprogramado');
COMMIT;
```

---

## 11.7 `validarDisponibilidadMotorista()`

| Atributo | Valor |
|---|---|
| Archivo | `functions/src/rutas.js` |
| Endpoint | `GET /api/motoristas/:id/validar` |
| Autorización | `operadora`, `admin` |

Verifica que el motorista:
1. Existe y tiene rol `motorista`.
2. `activo = TRUE`.
3. `disponible = TRUE` (en `disponibilidad_motorista`).
4. **No** tiene ruta en estados `asignada` o `en_curso`.

Esta función se invoca implícitamente desde `asignarMotorista`, pero también se
expone para que el frontend liste los disponibles antes de pulsar "Asignar".

Salida JSON:
```json
{ "disponible": true }
// o
{ "disponible": false, "motivo": "El motorista ya tiene una ruta activa." }
```

---

## 11.8 Resumen de garantías por función

| Función | Tx SQL | FOR UPDATE | Auditoría | Tests |
|---|:-:|:-:|:-:|:-:|
| crearPedido | ✓ | — | ✓ | ✓ |
| asignarMotorista | ✓ | ✓ pedido + motorista | ✓ | ✓ |
| iniciarRuta | ✓ | ✓ ruta | ✓ | — |
| cambiarEstadoPedido | ✓ | ✓ pedido | ✓ | ✓ |
| registrarEntrega | ✓ (delegado) | ✓ | ✓ | indirecto |
| registrarIncidencia | ✓ | ✓ pedido | ✓ WARN | ✓ |
| reprogramarPedido | ✓ | ✓ pedido | ✓ | — |
| validarDisponibilidadMotorista | — | — | — | ✓ |

---

## 11.9 Autorización HTTP — contrato real vs política de negocio

| Endpoint | `requireRole` en ruta | Validación adicional en servicio | Nota |
|---|---|---|---|
| `POST /pedidos` | operadora, admin | trigger BD rol | ✅ |
| `GET /pedidos` | auth | filtro si motorista | ✅ listado |
| `GET /pedidos/:id` | auth | **ninguna** por rol/asignación | ⚠ L-01 §6.10 |
| `POST /pedidos/:id/entregar` | motorista, admin | motorista asignado | ✅ |
| `POST /pedidos/:id/incidencias` | auth | motorista solo ruta propia | ✅ motorista; operadora libre |
| `POST /pedidos/:id/evidencias` | auth | solo existe pedido | ⚠ L-03 §6.10 |
| `GET /motoristas/:id/rutas` | auth | motorista = `:id` | ✅ |
| CRUD `/motos`, mutaciones `/farmacias` | admin | servicios admin | ✅ |

Fuente: `functions/index.js` y servicios en `functions/src/`. Matriz de datos del cliente:
[`06-seguridad.md`](06-seguridad.md) §6.11.
