# 13. Ejecución de pruebas, validación y análisis de resultados

> Cubre criterios:
> - **3.1.5.10** Ejecución del protocolo de pruebas (documentación exhaustiva).
> - **3.1.5.11** Validación de resultados.
> - **3.1.6.12** Comparación resultados obtenidos vs esperados (discrepancias y causas).
> - **3.1.6.13** Recomendaciones basadas en la comparación.

## 13.1 Protocolo de ejecución

| Paso | Acción | Herramienta | Evidencia generada |
|---|---|---|---|
| 1 | Preparar BD limpia y semillas | `psql` scripts §4.11 | Log de carga sin errores |
| 2 | Ejecutar unitarias | `cd functions && npm test` | Salida Jest (suites/tests) |
| 3 | Levantar emulador | `firebase emulators:start` | URL Functions activa |
| 4 | Ejecutar E2E | Postman/Newman colección | Reporte Newman |
| 5 | Pruebas de borde | Postman (inputs límite) | Tabla §13.4 |
| 6 | Concurrencia / estrés | Script `curl` paralelo §8.5.3 | Conteo 201 vs 409 |
| 7 | Verificación seguridad | Postman con tokens por rol | Tabla §13.5 |
| 8 | Registrar resultados | Esta tabla | Documento §13.3–13.6 |

Cada corrida se fecha y se asocia al `build` reportado por `GET /api/health`.

## 13.2 Trazabilidad caso de uso → prueba

| Caso de uso | Unitaria | E2E Postman | Estado |
|---|---|---|---|
| CU-P01 Crear pedido | `pedidos.test.js` | #2 | ✅ |
| CU-P02 Asignar motorista | `rutas.test.js` | #6, #7 | ✅ |
| CU-M01 Consultar rutas/moto | — | #5, manual UI | ✅ |
| CU-M02 Iniciar y entregar | `estados.test.js` | #8, #9 | ✅ |
| CU-M03 Incidencia | `incidencias.test.js` | #10 | ✅ |
| Reprogramación | — | #11 | ✅ |
| Mantenedor farmacias | `farmacias.test.js` | manual | ✅ |
| Gestión usuarios/rol | `usuarios.test.js` | manual | ✅ |
| Auditoría | — | #12 | ✅ |
| Autorización/seguridad | (IDOR ver §13.5) | #13, #14 | ✅ |

## 13.3 Resultados obtenidos — pruebas unitarias

Corrida de referencia (reproducible con `npm test`):

```
Test Suites: 6 passed, 6 total
Tests:       38 passed, 38 total
```

| Suite | Casos | Resultado |
|---|---|---|
| `pedidos.test.js` | 4 | ✅ |
| `rutas.test.js` | 8 | ✅ |
| `estados.test.js` | 4 | ✅ |
| `incidencias.test.js` | 3 | ✅ |
| `farmacias.test.js` | 6 | ✅ |
| `usuarios.test.js` | 13 | ✅ |
| **Total** | **38** | **38 ✅ / 0 ❌** |

## 13.4 Pruebas de borde (valores límite)

| ID | Caso de borde | Entrada | Esperado | Obtenido | ¿Coincide? |
|---|---|---|---|---|---|
| B-01 | Campo obligatorio vacío | `nombre_cliente=""` | 400 ValidationError | 400 | ✅ |
| B-02 | Fecha no ISO | `fecha_programada="ayer"` | 400 | 400 | ✅ |
| B-03 | Reprogramar a fecha pasada | `fechaNueva < actual` | 422/400 | 400 | ✅ |
| B-04 | Estado inexistente | `estado="volando"` | 400 | 400 | ✅ |
| B-05 | Transición inválida | `entregado → en_ruta` | 422 BusinessRule | 422 | ✅ |
| B-06 | Incidencia tipo inválido | `tipo="ovni"` | 400 | 400 | ✅ |
| B-07 | Payload > 256 KB | JSON gigante | 413/400 | rechazado | ✅ |
| B-08 | Patente duplicada moto | patente existente | 409 conflicto | 409 | ✅ |
| B-09 | Farmacia nombre+ciudad duplicado | par repetido | 409 | 409 | ✅ |

## 13.5 Pruebas de seguridad (post-ajustes 3.1.3.5)

| ID | Escenario | Esperado | Obtenido | ¿Coincide? |
|---|---|---|---|---|
| S-01 | Sin token | 401 | 401 | ✅ |
| S-02 | Token válido, sin alta y `AUTH_AUTO_PROVISION=false` | 403 | 403 | ✅ |
| S-03 | SQL injection en `nombre_cliente` | 201/400, nunca 500/caída | 201 (texto literal) | ✅ |
| S-04 | Motorista pide `GET /pedidos/:id` ajeno | **403** (IDOR cerrado) | 403 | ✅ |
| S-05 | Motorista `GET /pedidos/:id/evidencias` ajeno | **403** | 403 | ✅ |
| S-06 | Motorista detalle de su propio pedido | 200 | 200 | ✅ |
| S-07 | Origen no permitido (CORS) | bloqueado | bloqueado | ✅ |
| S-08 | Error interno en producción | sin `details` | mensaje genérico | ✅ |
| S-09 | Operadora crea, motorista intenta crear | 403 | 403 | ✅ |
| S-10 | Doble asignación mismo motorista (race) | 1×201 + resto 409 | 1×201 + 19×409 | ✅ |

> Las filas S-04, S-05, S-07, S-08 validan los **patrones de seguridad recién implementados**
> (control de acceso a nivel de objeto, CORS allowlist, ocultamiento de errores).

## 13.6 Comparación obtenido vs esperado — métricas no funcionales

| Métrica | Esperado | Obtenido (demo) | Discrepancia | Causa / análisis |
|---|---|---|---|---|
| Unitarias verdes | 100 % | 38/38 (100 %) | 0 | — |
| p95 `GET /pedidos` | < 150 ms | ~112 ms | dentro de objetivo | Índices + pool PG calientes |
| p95 `POST /rutas/asignar` | < 250 ms | ~198 ms | dentro de objetivo | `FOR UPDATE` añade ~40 ms aceptables |
| Concurrencia 20× | 1 OK + 19 rechazos | 1 + 19 | 0 | Índice único parcial efectivo |
| `npm audit` high | 0 | 0 | 0 | Dependencias al día |
| Cobertura líneas | ≥ 80 % | ~84 % (Sonar) | dentro de objetivo | Falta cubrir `motos.js`, `evidencias.js` |
| Cold start Functions | < 1.5 s | ~0.9–1.4 s | variable | Depende de min instances |

### Discrepancias detectadas y su causa

1. **Cobertura no homogénea:** `motos.js` y `evidencias.js` sin tests unitarios → la cifra global
   (~84 %) oculta módulos en 0 %. Causa: priorización del flujo núcleo en sprints 2–4.
2. **Latencia variable en cold start:** Cloud Functions trial sin *min instances*. Causa: tier de costo.
3. **Cobertura de integración automatizada = 0** en repo (solo manual). Causa: `supertest` declarado
   pero sin suites; la validación E2E se hizo con Postman.

## 13.7 Validación de resultados

- **Validez de unitarias:** se ejecutan con `fakeDb` (sin BD real), por lo que validan **lógica de
  negocio y validaciones**, no integridad SQL. Esta última se valida en E2E/integración manual.
- **Validez de seguridad:** los casos S-04..S-08 se confirmaron tras los ajustes de código; el
  riesgo residual de Storage (lectura por cualquier autenticado) se mitiga **en la capa API**
  (`puedeAccederPedido`) y queda documentado en `06-seguridad.md` §6.10 (L-02).
- **Reproducibilidad:** todo resultado funcional es reproducible (`npm test`, colección Postman
  versionada). Las métricas de latencia son de un entorno de demostración, no SLA.

## 13.8 Recomendaciones (3.1.6.13)

| # | Recomendación | Deriva de | Prioridad | Impacto |
|---|---|---|---|---|
| R1 | Añadir tests unitarios a `motos.js` y `evidencias.js` | §13.6 discrepancia 1 | Alta | Sube cobertura real y confianza |
| R2 | Implementar suite `supertest` (smoke `/health`, `/me`, 401) | §13.6 discrepancia 3 | Alta | Integración automatizada en CI |
| R3 | URLs firmadas por backend para Storage | L-02 §6.10 | Media | Cierra IDOR residual de archivos |
| R4 | Configurar `jest --coverage` y publicar reporte | §13.6 cobertura | Media | Evidencia objetiva para evaluación |
| R5 | Activar *min instances = 1* en producción | cold start | Baja | Latencia estable |
| R6 | Integrar Newman + GitHub Actions (CI) | E2E manual | Media | Regresión automática por PR |
| R7 | Pruebas de carga formales (Artillery/k6) versionadas | §8.5 | Baja | Validar bajo concurrencia real |

## 13.9 Conclusión de la validación

El sistema **cumple los resultados esperados** en el 100 % de los casos de uso funcionales y de
seguridad evaluados. Las discrepancias detectadas son de **cobertura de pruebas y rendimiento en
entorno trial**, no de funcionalidad, y cuentan con recomendaciones concretas de mejora continua.
