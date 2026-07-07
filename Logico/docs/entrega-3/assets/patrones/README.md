# Capturas de patrones de seguridad

Guardar aquí las capturas de pantalla del IDE referenciadas en
[`06-codigo-fuente-y-patrones-seguridad.md`](../06-codigo-fuente-y-patrones-seguridad.md).

| Archivo | Contenido a mostrar en la captura |
|---|---|
| `p01-auth-jwt.png` | `authRequired` + `verifyIdToken` en `functions/src/auth.js` |
| `p02-rbac.png` | `requireRole` en `auth.js` + uso en `index.js` |
| `p03-idor.png` | `puedeAccederPedido` en `functions/index.js` |
| `p04-sql-parametrizado.png` | Queries con `$1, $2…` en `functions/src/pedidos.js` |
| `p05-cors.png` | `ALLOWED_ORIGINS` en `functions/index.js` |
| `p06-rate-limit.png` | `apiLimiter` en `functions/index.js` |
| `p07-storage-rules.png` | Reglas en `storage.rules` |

Formato recomendado: PNG, ancho ≥ 900 px, tema claro del IDE.
