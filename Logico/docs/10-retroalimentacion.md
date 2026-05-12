# 10. Retroalimentación de usuarios y mejoras aplicadas

Durante el Sprint 4 se realizó una sesión de **usabilidad** con 3 perfiles de
usuarios reales que simularon el flujo en LogiCo. Esta sección documenta los
hallazgos y las mejoras concretas aplicadas en el código.

## 10.1 Sesión de pruebas con usuarios

| Participante | Rol simulado | Tarea asignada |
|---|---|---|
| U1 | Operadora con 2 años de experiencia | Crear 5 pedidos y asignarlos |
| U2 | Motorista | Recibir asignación, iniciar ruta y entregar 3 pedidos |
| U3 | Supervisora (admin) | Auditar el día y reprogramar 1 pedido |

Modalidad: tarea guiada con observación + cuestionario SUS abreviado.

## 10.2 Hallazgos detectados

### Hallazgo 1 — Doble click podía crear pedidos duplicados

**Reportado por**: U1
**Severidad**: Alta
**Síntoma**: al hacer click rápido en "Crear pedido", a veces se creaban 2 registros.

**Causa raíz**: el botón no se deshabilitaba durante el `await`.

**Mejora aplicada**:

```js
// public/crear-pedido.html
form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('btn-submit');
    btn.disabled = true;                   // ← deshabilita inmediatamente
    try {
        const p = await apiFetch('/pedidos', { ... });
        ...
    } catch (err) {
        toast(err.message, 'error');
        btn.disabled = false;              // ← rehabilita solo si falla
    }
});
```

Como **doble red de seguridad**, además agregamos el índice único parcial
`uq_pedidos_no_duplicado` en `pedidos` para que la BD rechace duplicados aun si el
frontend fallara.

### Hallazgo 2 — Difícil distinguir estados a simple vista

**Reportado por**: U1, U3
**Severidad**: Media
**Síntoma**: la columna "estado" mostraba texto plano y se confundían `entregado` vs `no_entregado`.

**Mejora**: badges con color semántico por estado (verde / rojo / azul / etc.) en
`css/styles.css` y helper `badgeEstado()` en `firebase-init.js`.

### Hallazgo 3 — Motorista no sabía si podía iniciar ruta o no

**Reportado por**: U2
**Severidad**: Alta
**Síntoma**: el botón "Marcar entregado" aparecía siempre, lo que confundía al motorista
cuando aún no había iniciado la ruta.

**Mejora**: la vista del motorista (`motorista.html`) ahora muestra el botón apropiado
según el `estado_ruta`:

```js
${activa.estado_ruta === 'asignada' ? `<button id="btn-iniciar">Iniciar ruta</button>` : ''}
${activa.estado_ruta === 'en_curso' ? `<button id="btn-entregar">Marcar entregado</button>` : ''}
```

### Hallazgo 4 — No quedaba claro qué motoristas estaban "realmente" disponibles

**Reportado por**: U1
**Severidad**: Media
**Síntoma**: la lista de motoristas mostraba a todos, incluyendo los que ya tenían ruta.

**Mejora**: se creó la vista SQL `v_motoristas_disponibles` que cruza
`disponibilidad_motorista` con la existencia de rutas activas, y el endpoint
`/motoristas/disponibles` solo retorna a los `disponible = TRUE` y `sin_ruta_activa = TRUE`.

### Hallazgo 5 — Errores del backend salían como "HTTP 500"

**Reportado por**: U1, U3
**Severidad**: Alta
**Síntoma**: cuando algo fallaba (FK violada, duplicado), el usuario veía un mensaje genérico.

**Mejora**: handler central `errorHandler` en `functions/src/errors.js` que mapea
códigos PG a HTTP semánticos:

```js
if (err.code === '23505') return res.status(409).json({ error: 'Duplicado', details: err.detail });
if (err.code === '23503') return res.status(409).json({ error: 'FK violada', details: err.detail });
if (err.code === 'P0001') return res.status(422).json({ error: err.message });
```

Y los servicios lanzan `BusinessRuleError` con mensajes claros, ej:
*"El motorista ya tiene una ruta activa."*.

### Hallazgo 6 — Necesidad de comentarios al cambiar estado

**Reportado por**: U2
**Severidad**: Baja
**Síntoma**: motorista quería justificar por qué cambia un estado.

**Mejora**: el endpoint `POST /pedidos/:id/estado` ya acepta `comentario`, pero la UI
no lo exponía. Ahora todos los cambios de estado en `pedido.html` permiten texto libre,
que se guarda en `historial_estados.comentario`.

### Hallazgo 7 — Falta de evidencia fotográfica en entregas

**Reportado por**: U3 (admin)
**Severidad**: Alta
**Síntoma**: al disputar entregas, no había pruebas.

**Mejora**: integración con Firebase Storage. El motorista puede subir foto de
entrega (o incidencia), que se guarda en `evidencias/{pedidoId}/...` y el metadato
queda en la tabla `evidencias`.

### Hallazgo 8 — El listado de pedidos se cargaba lento con muchos registros

**Reportado por**: U1
**Severidad**: Media
**Síntoma**: con 5000 registros, la consulta tardaba > 2 s.

**Mejora**: índices en `pedidos.fecha_programada`, `pedidos.estado_actual_id`,
`pedidos.activo` y `pedidos.operadora_crea_id`. El listado por defecto trae
`LIMIT 100` ordenado por `fecha_programada DESC`.

## 10.3 Resultados de la 2da iteración

Después de aplicar las 8 mejoras se repitió la sesión con los mismos usuarios:

| Métrica | Antes | Después |
|---|---|---|
| SUS Score (0-100) | 64 | 84 |
| Tiempo medio crear pedido | 1:35 min | 0:55 min |
| Errores en 5 pedidos | 4 | 0 |
| Confianza del motorista en flujo | 6/10 | 9/10 |
| Pedidos duplicados accidentales | 2 / 50 | 0 / 50 |

## 10.4 Backlog derivado del feedback (próximos sprints)

| Item | Origen | Prioridad |
|---|---|---|
| Push notification al motorista cuando se le asigna pedido | U2 | Alta |
| Paginación + búsqueda full-text en `pedidos.html` | U1 | Media |
| Vista "Mis turnos del día" en motorista con orden geográfico | U2 | Media |
| Reporte exportable CSV / PDF | U3 | Media |
| Filtro multi-estado en listado | U1 | Baja |
| Modo oscuro | U2 | Baja |

## 10.5 Política de retroalimentación continua

- Cada Sprint Review incluye demo a un usuario real diferente.
- Hotjar / FullStory recomendado para capturar comportamiento en producción.
- Canal directo de soporte (Slack/Forms) integrado en el footer del frontend.
- Auditorías de UX cada 2 meses.
