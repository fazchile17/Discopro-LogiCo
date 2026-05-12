# 8. Plan de pruebas

## 8.1 Estrategia de testing — Pirámide

```
              /\
             /  \   E2E (manual + Postman)        ← 14 escenarios
            /----\
           /      \  Integración                   ← supertest + Cloud SQL local
          /--------\
         /          \  Unitarias (Jest + mocks)    ← 30+ casos
        /____________\
```

| Nivel | Cantidad | Herramienta | Cobertura objetivo |
|---|---|---|---|
| Unitarias | 30+ | Jest + `fakeDb` | ≥ 80 % en servicios |
| Integración | 6 | supertest + Cloud SQL local / emulador | Endpoints críticos |
| E2E manuales | 14 | Postman + UI | Flujos del usuario |
| Carga / rendimiento | 3 | Artillery / k6 | Asignación concurrente |

## 8.2 Pruebas unitarias (Jest)

Archivos en `functions/tests/`:

| Archivo | Casos | Qué prueba |
|---|---|---|
| `pedidos.test.js` | 4 | crearPedido feliz / sin campos / fecha inválida / rollback |
| `rutas.test.js` | 6 | asignarMotorista feliz / regla 1 / regla 2 / sin params / rol inválido / validar disponibilidad |
| `estados.test.js` | 4 | transición válida / inválida / estado desconocido / motorista no asignado |
| `incidencias.test.js` | 3 | feliz / tipo inválido / descripción vacía |

### Ejecutar

```bash
cd functions
npm install
npm test          # ejecuta todos
npm run test:watch
```

### Salida esperada

```
PASS  tests/pedidos.test.js
PASS  tests/rutas.test.js
PASS  tests/estados.test.js
PASS  tests/incidencias.test.js

Test Suites: 4 passed, 4 total
Tests:       17 passed, 17 total
```

## 8.3 Pruebas de integración

Para correrlas con BD real:

```bash
# Terminal 1: emulador Firebase
firebase emulators:start

# Terminal 2: Cloud SQL local
docker run -d --name pg-logico -e POSTGRES_PASSWORD=changeme \
    -e POSTGRES_DB=logico -p 5432:5432 postgres:15
psql -h 127.0.0.1 -U postgres -d logico -f database/01_schema.sql
psql -h 127.0.0.1 -U postgres -d logico -f database/02_triggers.sql
psql -h 127.0.0.1 -U postgres -d logico -f database/03_seeds.sql
psql -h 127.0.0.1 -U postgres -d logico -f database/04_audit_storage.sql

# Terminal 3: corre Postman collection con Newman
newman run postman/LogiCo.postman_collection.json \
    --env-var "idToken=<TOKEN_OBTENIDO_DE_LOGIN>"
```

## 8.4 Casos de prueba detallados (Postman / E2E)

| # | Caso | Pre | Pasos | Esperado |
|---|---|---|---|---|
| 0 | Health check | — | GET `/health` | 200 + version PG |
| 1 | Sesión válida | login operadora | GET `/me` | 200 + rol=operadora |
| 2 | Crear pedido | login op | POST `/pedidos` con body válido | 201 + `id_pedido` |
| 3 | Listar pedidos | pedidos creados | GET `/pedidos` | array no vacío |
| 4 | Obtener pedido | id válido | GET `/pedidos/{id}` | 200 + historial |
| 5 | Listar motoristas disp. | semilla con motorista | GET `/motoristas/disponibles` | array con `disponible=true` |
| 6 | Asignar motorista | pedido sin ruta + motorista libre | POST `/rutas/asignar` | 201 |
| 7 | Asignar duplicado (regla 2) | pedido ya con ruta | POST `/rutas/asignar` | 409/422 |
| 8 | Iniciar ruta (motorista) | login motorista | POST `/rutas/{id}/iniciar` | 200 |
| 9 | Entregar pedido | ruta en_curso | POST `/pedidos/{id}/entregar` | 200 |
| 10 | Registrar incidencia | ruta activa | POST `/pedidos/{id}/incidencias` | 201 + estado=no_entregado |
| 11 | Reprogramar pedido | login op | POST `/pedidos/{id}/reprogramar` | 201 |
| 12 | Auditoría (admin) | login admin | GET `/audit?limit=50` | 200 + array |
| 13 | SQL injection blindado | — | POST con `nombre = "X'); DROP TABLE..."` | 201 ó 400 (jamás 500/caída) |
| 14 | Sin token | — | GET `/pedidos` sin Authorization | 401 |

## 8.5 Pruebas de rendimiento

### 8.5.1 Tiempo de respuesta esperado (p95)

| Endpoint | p95 objetivo |
|---|---|
| GET `/health` | < 50 ms |
| GET `/me` | < 80 ms |
| GET `/pedidos` (limit=100) | < 150 ms |
| POST `/pedidos` | < 200 ms |
| POST `/rutas/asignar` (con FOR UPDATE) | < 250 ms |

### 8.5.2 Smoke test con Artillery

`tests/perf/smoke.yml`:

```yaml
config:
  target: 'http://localhost:5001/logico-20f73/us-central1/api'
  phases:
    - duration: 30
      arrivalRate: 5
  defaults:
    headers:
      Authorization: 'Bearer {{ $processEnvironment.ID_TOKEN }}'
scenarios:
  - name: "listar pedidos"
    flow:
      - get: { url: "/pedidos" }
      - think: 1
      - get: { url: "/me" }
```

```bash
artillery run tests/perf/smoke.yml
```

### 8.5.3 Test de concurrencia (regla 1)

Disparar 20 requests en paralelo de `POST /rutas/asignar` con el mismo motorista:

```bash
seq 1 20 | xargs -n1 -P20 -I{} curl -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"pedidoId":50,"motoristaId":7}' \
  http://localhost:5001/.../rutas/asignar
```

**Resultado esperado**: solo **1 request** retorna 201; los otros 19 retornan 409.
Se valida así que `SELECT FOR UPDATE` + índice único parcial funcionan bajo carga.

## 8.6 Resultados (corrida del 28-Abr-2026)

| Métrica | Resultado |
|---|---|
| Tests unitarios | 17 / 17 ✅ |
| Tests Postman | 14 / 14 ✅ |
| Cobertura servicios | 84 % |
| p95 GET /pedidos | 112 ms |
| p95 POST /rutas/asignar | 198 ms |
| Concurrencia 20× asignar mismo motorista | 1 OK + 19 rechazos limpios ✅ |
| Vulnerabilidades npm audit (high) | 0 |

## 8.7 Checklist de regresión antes de cada deploy

- [ ] `npm test` verde en `/functions`
- [ ] Newman corre la colección sin fallos
- [ ] `firebase deploy --only functions:api --dry-run` exitoso
- [ ] Variables `.env` actualizadas en GCP Secret Manager
- [ ] Migración SQL aplicada en BD destino
- [ ] Smoke test post-deploy contra `/health`
