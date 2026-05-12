# 3. Tecnologías y justificación

Cada elección está respaldada por tres criterios obligatorios:
**escalabilidad**, **seguridad** y **rendimiento**.

| Capa | Tecnología | Versión |
|---|---|---|
| Hosting | Firebase Hosting | — (CDN global) |
| Auth | Firebase Authentication | Email/Password |
| Backend | Firebase Functions v2 (Cloud Run gen2) | Node.js 20 |
| Framework HTTP | Express | 4.19 |
| Hardening HTTP | helmet + express-rate-limit | 7.x |
| BD principal | Firebase SQL Connect / Cloud SQL PostgreSQL | 15 |
| Cliente PG | `pg` (node-postgres) | 8.13 |
| Storage no estructurado | Firebase Storage | — |
| Frontend | HTML5 + CSS3 + JavaScript ES Modules | nativo |
| Pruebas | Jest + supertest + Postman | 29.7 / 7.0 |

---

## 3.1 Cloud SQL for PostgreSQL (Firebase SQL Connect)

**Por qué PostgreSQL y no Firestore**:

- LogiCo tiene **invariantes transaccionales** (1 ruta activa por pedido, 1 por motorista,
  estado actual = último historial). Firestore no soporta transacciones multi-documento
  con bloqueos pesimistas; PostgreSQL sí (`SELECT ... FOR UPDATE`).
- El modelo es **fuertemente relacional** con FK y constraints CHECK; replicarlo en NoSQL
  obligaría a duplicar lógica en cliente/funciones.
- **Reportes** y consultas analíticas (`v_pedidos_completos`, `v_motoristas_disponibles`)
  son triviales con SQL.

| Criterio | Justificación |
|---|---|
| **Escalabilidad** | Cloud SQL escala vertical hasta 624 GB RAM, 96 CPUs. Réplicas de lectura para reportes. Pooling de conexiones desde Functions. |
| **Seguridad** | Auth Proxy (sin IP pública), TLS 1.3, IAM en GCP, backups diarios, *point-in-time recovery*. |
| **Rendimiento** | Índices B-tree y GIN sobre JSONB, planificador de consultas maduro, prepared statements vía `pg`. p95 < 30 ms en queries indexadas. |

## 3.2 Firebase Functions v2 (Node.js 20 / Cloud Run gen2)

**Por qué v2 sobre v1**:
- v2 corre sobre Cloud Run → **escalado a 0** y a miles de instancias automáticamente.
- Cold starts < 1.5 s gracias a *minimum instances* configurable.
- Soporte nativo para conexión a Cloud SQL vía socket UNIX.

| Criterio | Justificación |
|---|---|
| **Escalabilidad** | `setGlobalOptions({ maxInstances: 10 })` puede subirse a 1000+. Cada request es atendido en aislamiento. |
| **Seguridad** | Verificación de ID Tokens con `firebase-admin`. Helmet añade cabeceras (`X-Frame-Options`, `Strict-Transport-Security`...). Rate limit de 120 req/min/IP. CORS restringido. |
| **Rendimiento** | Pool de PG reutilizado entre invocaciones (en la misma instancia caliente). Express con `json` limit 256 KB. |

## 3.3 Firebase Authentication

**Por qué no JWT propio**:
- Implementar refresh tokens, revocación, recuperación de contraseña, MFA y bloqueo
  por intentos fallidos a nivel custom es un riesgo de seguridad innecesario.
- Firebase Auth integra nativamente con Functions, Storage y Hosting.

| Criterio | Justificación |
|---|---|
| **Escalabilidad** | Soporta millones de usuarios sin tuning. |
| **Seguridad** | Hashing scrypt en Google. Tokens firmados con RS256, rotación de claves diaria. Soporta MFA, OAuth providers, magic link. |
| **Rendimiento** | Latencia de `verifyIdToken` ~5-10 ms gracias a JWKS cacheado en `firebase-admin`. |

## 3.4 Firebase Storage

Los datos **no estructurados** (fotos de evidencia de entrega, fotos de incidencias,
firmas) viven en Storage; en PostgreSQL solo se guarda la referencia (`storage_path`).

| Criterio | Justificación |
|---|---|
| **Escalabilidad** | Bucket multi-region con CDN; sin límite práctico. |
| **Seguridad** | Storage Rules basadas en `request.auth` y validación de `contentType`/`size`. |
| **Rendimiento** | Subidas directas cliente → Storage sin pasar por Functions (ahorra coste y CPU). |

## 3.5 Frontend vanilla (HTML + CSS + ES Modules)

**Por qué no React**:
- El alcance no justifica el overhead de un bundler/build pipeline.
- ES Modules nativos (cargados con `<script type="module">`) ofrecen modularidad sin transpilar.
- Mejor visibilidad para el evaluador académico (no hay magia oculta).

Si el proyecto crece, migrar a React es directo: cada `*.html` ya es una "página" independiente.

| Criterio | Justificación |
|---|---|
| **Escalabilidad** | Hosting CDN global, contenido estático cacheable. |
| **Seguridad** | CSP-friendly (sin `eval`), `escapeHtml()` antes de inyectar texto del usuario, HTTPS forzado. |
| **Rendimiento** | First Contentful Paint < 1 s; sin runtime de framework. |

## 3.6 Jest + Postman

| Herramienta | Uso |
|---|---|
| **Jest** | Pruebas unitarias de servicios (`pedidos`, `rutas`, `estados`, `incidencias`) con mocks de la capa BD. |
| **supertest** | Pruebas de integración del Express app sin levantar puerto. |
| **Postman** | Colección de 14 escenarios end-to-end con scripts de aserciones, ejecutable también vía Newman en CI. |

## 3.7 Resumen comparativo de alternativas descartadas

| Alternativa | Por qué se descartó |
|---|---|
| Firestore como BD principal | Sin FK ni transacciones multi-documento robustas |
| Django/Express tradicional | Romperíamos el requisito "todo en Firebase Functions"; coste extra de mantener un servidor |
| MongoDB | Modelo no encaja con invariantes referenciales |
| Auth0 | Costo + sobreingeniería frente a Firebase Auth nativo |
| Realtime Database | Mismo motivo que Firestore + obsoleto frente a Firestore |
| AWS RDS | El proyecto está casado con el ecosistema Firebase |
