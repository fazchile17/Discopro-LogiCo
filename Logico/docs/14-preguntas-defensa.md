# 14. Preparación de defensa — preguntas y respuestas

> Criterio 3.1.6.14 — Responder al profesor de forma clara, precisa y con fundamentos sólidos.
> Cada respuesta enlaza a la evidencia del proyecto para sostenerla.

## 14.1 Negocio y alcance

**P: ¿Qué problema resuelve LogiCo?**
R: Gestiona la **última milla** de pedidos (despacho tipo farmacia): creación del pedido,
asignación de motorista, seguimiento de estados y evidencia de entrega, con trazabilidad completa.
Ver dominio y glosario en `02-arquitectura-4+1.md` §2.0.1.

**P: ¿“retiro_receta” significa que manejan recetas médicas?**
R: No. Es un **estado logístico** (recogida en punto). Las farmacias son puntos de origen
opcionales y no implican dispensación regulada en el MVP (glosario §2.0.1).

**P: ¿Un pedido necesita una farmacia?**
R: No, `pedidos.farmacia_id` es opcional; la operadora puede crear un despacho directo.

## 14.2 Arquitectura

**P: ¿Por qué Cloud Functions + PostgreSQL y no Firestore?**
R: El negocio tiene **invariantes transaccionales** (1 ruta activa por pedido/motorista, estado =
último historial) que requieren transacciones multi-tabla con bloqueos pesimistas
(`SELECT ... FOR UPDATE`), que Firestore no ofrece. Justificación en `03-tecnologias.md` §3.1.

**P: ¿Qué vistas del modelo 4+1 documentaron?**
R: Las cinco: lógica (§2.1), desarrollo (§2.2), procesos (§2.3), física (§2.4) y escenarios (§2.5),
con trazabilidad de artefactos UML en `02-arquitectura-4+1.md` §2.0.

**P: ¿Cómo evitan condiciones de carrera al asignar?**
R: `SELECT ... FOR UPDATE` sobre pedido y motorista + **índices únicos parciales**
(`uq_motorista_ruta_activa`, `uq_pedido_ruta_activa`) como red de seguridad en BD.
Validado en la prueba de concurrencia (`13-validacion-resultados.md` §13.5, S-10).

## 14.3 Base de datos

**P: ¿Está normalizada?**
R: Hasta 3FN (`04-base-datos.md` §4.6). La única desnormalización (`pedidos.estado_actual_id`)
es **controlada** y la mantiene consistente el trigger `trg_sync_estado_pedido`.

**P: ¿Por qué dos tablas de auditoría?**
R: `audit_logs` (JSONB flexible, vía middleware) para trazabilidad técnica y `auditoria`
(columnas fijas) para acciones de mantenedores admin. Comparativa en §4.11.

**P: ¿Cómo garantizan integridad?**
R: FK con políticas `ON DELETE` razonadas (§4.2), CHECK, UNIQUE e índices parciales (§4.3),
y triggers de reglas de negocio (§4.4).

## 14.4 Seguridad (3.1.3.5)

**P: ¿Qué patrones de seguridad implementaron?**
R: Autenticación con Firebase (`verifyIdToken`), **RBAC** por endpoint (`requireRole`),
**control de acceso a nivel de objeto** (`puedeAccederPedido` cierra IDOR en pedidos/evidencias/incidencias),
consultas parametrizadas (anti-inyección), `helmet`, rate-limit, **CORS con allowlist**,
ocultamiento de detalles de error en producción y **auto-provisión deshabilitada por defecto**.
Detalle en `06-seguridad.md` §6.3–§6.4 y §6.10.

**P: ¿Un motorista puede ver pedidos de otro?**
R: No. Tras el ajuste, `GET /pedidos/:id`, `/evidencias` e `/incidencias` validan que el motorista
tenga ruta sobre ese pedido; si no, **403** (caso S-04..S-06).

**P: ¿Qué riesgo de seguridad queda abierto y por qué?**
R: La **lectura directa en Firebase Storage** solo exige autenticación (no ownership por pedido).
Se mitiga en la capa API y la solución completa (URLs firmadas por backend) está priorizada como
recomendación R3 (`13-validacion-resultados.md` §13.8). Transparencia en §6.10 (L-02).

**P: ¿Cómo protegen contra inyección SQL?**
R: 100 % de las consultas usan parámetros `$1..$n` de `pg`; nunca se concatena input. Validado en S-03.

## 14.5 Pruebas

**P: ¿Cuántas pruebas tienen y de qué tipo?**
R: 38 unitarias (Jest, 6 suites) + 14 escenarios E2E (Postman) + borde (§13.4), seguridad (§13.5)
y concurrencia (§8.5.3). Cobertura ~84 % (Sonar).

**P: ¿Qué les falta probar?**
R: Honestamente, `motos.js` y `evidencias.js` no tienen unitarias y no hay suite supertest
automatizada (recomendaciones R1–R2). Documentado en §13.6.

**P: ¿Cómo validan obtenido vs esperado?**
R: Tablas comparativas con discrepancias y causas en `13-validacion-resultados.md` §13.4–§13.6.

## 14.6 Proceso y equipo (3.1.3.6)

**P: ¿Qué metodología usaron?**
R: Scrum, sprints de 1 semana, roles y ceremonias en `01-metodologia-scrum.md`; evidencia Jira/Gantt
en `docs/assets/`.

**P: ¿Cómo se repartió el trabajo?**
R: Backend (SQL + Functions), Frontend (HTML/JS + Auth) y QA/DevOps (pruebas + deploy); matriz de
esfuerzo en §1 y `15-informe-final.md` §15.4.

## 14.7 Preguntas “trampa” frecuentes

| Pregunta | Respuesta corta sólida |
|---|---|
| “¿La cobertura 84 % la da Jest?” | No, la da SonarQube; Jest no tiene `--coverage` configurado (§7.10). |
| “¿Tienen integración con supertest?” | Está la dependencia, pero la integración real es Postman/Newman manual (§8.3). |
| “¿`/health` no filtra info?” | Expone flags operativos; en prod se puede reducir (L-07, §6.10). |
| “¿Cuántas tablas hay?” | 16 de negocio + geografía; inventario por script en §4.1. |
| “¿Qué pasa si ejecuto solo `01`–`04`?” | Falla farmacias/motos/geo; hay checklist en §4.11 y §12.4. |

## 14.8 Cierre de defensa (mensaje de 30 segundos)

> “LogiCo resuelve la última milla con un backend transaccional sólido: garantizamos una sola ruta
> activa por pedido y por motorista con bloqueos y constraints, trazamos cada cambio de estado, y
> aplicamos múltiples patrones de seguridad (RBAC, control de acceso a objetos, CORS, anti-inyección).
> Documentamos con honestidad lo cubierto y lo pendiente, con recomendaciones priorizadas de mejora
> continua.”
