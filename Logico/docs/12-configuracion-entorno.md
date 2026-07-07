# 12. Configuración del entorno de trabajo (paso a paso)

> Criterio 3.1.4.7 — Configuración funcional, eficiente y **documentada paso a paso**.
> Cualquier integrante puede levantar LogiCo desde cero siguiendo esta guía.

## 12.1 Requisitos previos

| Herramienta | Versión | Verificar con |
|---|---|---|
| Node.js | 20.x LTS | `node -v` |
| npm | 10.x | `npm -v` |
| Firebase CLI | ≥ 13 | `firebase --version` |
| Git | cualquiera reciente | `git --version` |
| PostgreSQL cliente (`psql`) | 15 | `psql --version` |
| Docker (opcional, BD local) | ≥ 24 | `docker -v` |
| Cuenta Google + proyecto Firebase | `logico-20f73` | consola Firebase |

## 12.2 Clonado e instalación de dependencias

```bash
git clone <URL_DEL_REPO> logico
cd logico/functions
npm install
```

> El frontend (`public/`) no requiere build ni `npm install`: usa módulos ES nativos desde CDN.

## 12.3 Variables de entorno

```bash
cd functions
cp .env.example .env
```

Editar `functions/.env` con valores reales:

| Variable | Desarrollo (BD local) | Producción (Cloud SQL) |
|---|---|---|
| `PG_HOST` | `127.0.0.1` | `/cloudsql/PROJECT:REGION:INSTANCE` |
| `PG_PORT` | `5432` | — (socket) |
| `PG_DATABASE` | `logico` | `logico` |
| `PG_USER` | `logico_app` | `logico_app` |
| `PG_PASSWORD` | la tuya | Secret Manager |
| `AUTH_AUTO_PROVISION` | `true` (demo) | `false` (seguro) |
| `CORS_ORIGINS` | (omitir) | dominios Hosting |
| `NODE_ENV` | (omitir) | `production` |

> **Importante:** la base se llama **`logico`**, no `postgres`. Conectarse a la BD equivocada
> es la causa #1 de “el rol no se actualiza” o “0 filas” en diagnósticos.

## 12.4 Base de datos (orden obligatorio)

### Opción A — PostgreSQL local con Docker

```bash
docker run -d --name pg-logico \
  -e POSTGRES_PASSWORD=changeme \
  -e POSTGRES_DB=logico \
  -p 5432:5432 postgres:15
```

### Carga del esquema (idéntica en local y Cloud SQL)

```bash
psql "$CONN" -f database/01_schema.sql
psql "$CONN" -f database/02_triggers.sql
psql "$CONN" -f database/03_seeds.sql
psql "$CONN" -f database/04_audit_storage.sql
psql "$CONN" -f database/05_admin_farmacias.sql
psql "$CONN" -f database/06_geografia_chile.sql
psql "$CONN" -f database/07_motos.sql
# Opcionales de operación:
psql "$CONN" -f database/08_cambiar_rol_usuario.sql
```

donde `CONN="postgresql://logico_app:changeme@127.0.0.1:5432/logico"`.

> Detalle de cada script: [`04-base-datos.md`](04-base-datos.md) §4.11. Saltarse `05`–`07`
> deja sin tabla `farmacias`, `motos` ni geografía y rompe `crear-pedido.html`.

## 12.5 Firebase: autenticación y configuración del cliente

1. En la consola Firebase → **Authentication** → habilitar **Email/Password**.
2. Crear usuarios demo (o usar emulador). Ejemplos del proyecto:
   - `admin@logico.app` (rol admin tras seed/promoción)
   - `andy@test.cl` (motorista de prueba)
3. Verificar `public/js/config.js` → `window.LOGICO_CONFIG` con `apiBase` y claves Firebase.

> Las API keys del cliente Firebase **no son secretas**; la seguridad real está en Auth + RBAC
> del backend (ver `06-seguridad.md` §6.5).

## 12.6 Ejecución local

```bash
# Terminal 1 — emuladores (Hosting + Functions)
firebase emulators:start

# Hosting:   http://localhost:5000
# Functions: http://localhost:5001/logico-20f73/us-central1/api
```

Prueba de humo:

```bash
curl http://localhost:5001/logico-20f73/us-central1/api/health
# Esperado: { "ok": true, "database": "logico", "motos_table": true, "build": "..." }
```

## 12.7 Pruebas

```bash
cd functions
npm test          # 38 pruebas unitarias (6 suites)
```

Integración / E2E manual con Postman/Newman: ver [`08-plan-pruebas.md`](08-plan-pruebas.md) §8.3.

## 12.8 Despliegue a producción

```bash
# Autenticación CLI (una vez)
firebase login

# Despliegue de Functions + Hosting
firebase deploy --only "functions,hosting" --project logico-20f73
```

Checklist post-deploy:

- [ ] `GET /api/health` responde `database: logico`, `motos_table: true` y el `build` esperado.
- [ ] `AUTH_AUTO_PROVISION=false` en el entorno de Functions.
- [ ] `NODE_ENV=production` (Cloud Functions lo define automáticamente).
- [ ] Login admin y motorista funcionan; el motorista ve solo sus rutas.

## 12.9 Solución de problemas frecuentes

| Síntoma | Causa probable | Solución |
|---|---|---|
| “rol no se actualiza” / 0 filas | Conectado a BD `postgres` | `\c logico` y reejecutar |
| 500 en `/api/motos` | Falta `07_motos.sql` | Ejecutar script en `logico` |
| 500 en `/api/farmacias` | Falta `05_admin_farmacias.sql` | Ejecutar script; añade `pedidos.farmacia_id` |
| 401 con “Origen no permitido por CORS” | Dominio fuera de allowlist | Añadir a `CORS_ORIGINS` |
| 403 motorista en su propio pedido | ID como string vs number | Ya corregido (`Number(...)` en backend) |
| Login válido pero 403 “no registrado” | `AUTH_AUTO_PROVISION=false` y usuario sin alta | Dar de alta vía admin o `true` en demo |

## 12.10 Topología del entorno

```mermaid
flowchart LR
    DEV[Equipo dev] -->|firebase deploy| HOST[Firebase Hosting]
    DEV -->|firebase deploy| FN[Cloud Functions v2]
    HOST -->|rewrite /api/**| FN
    FN -->|socket Cloud SQL| DB[(PostgreSQL logico)]
    FN --> AUTH[Firebase Auth]
    FN --> STG[Firebase Storage]
```
