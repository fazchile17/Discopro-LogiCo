# 9. Prototipo funcional

El prototipo está implementado en HTML + CSS + JavaScript ES Modules.
Es **funcional**, no un mock visual: cada pantalla está cableada a la API real
de Firebase Functions y a PostgreSQL.

## 9.0 Contexto de negocio en la UI

| Rol | Objetivo en pantalla | Pantallas principales |
|---|---|---|
| Operadora | Crear pedidos, asignar motorista, reprogramar | `dashboard`, `pedidos`, `crear-pedido`, `pedido` |
| Motorista | Ver ruta activa, iniciar, entregar o reportar incidencia | `motorista` |
| Admin | Mantenedores + misma visión operativa | `admin-*` + dashboard |

Glosario de estados y limitaciones de acceso API: [`02-arquitectura-4+1.md`](02-arquitectura-4+1.md) §2.0.1
y [`06-seguridad.md`](06-seguridad.md) §6.11. La UI del motorista **no muestra** pedidos ajenos;
la defensa debe distinguir **experiencia de usuario** vs **contrato HTTP** documentado.

## 9.1 Pantallas

| Archivo | Roles | Propósito |
|---|---|---|
| `index.html` | Todos | Login con Firebase Auth |
| `dashboard.html` | operadora, admin | KPIs + últimos pedidos |
| `pedidos.html` | operadora, admin | Listado con filtros por estado |
| `pedido.html` | operadora, admin, motorista (enlace desde su ruta) | Detalle + asignar / reprogramar / incidencia |
| `crear-pedido.html` | operadora, admin | Formulario nuevo pedido |
| `motorista.html` | motorista, admin | Ruta activa + iniciar / entregar / incidencia |
| `admin-farmacias.html` | admin | CRUD farmacias |
| `admin-motoristas.html` | admin | Usuarios motorista + disponibilidad |
| `admin-motos.html` | admin | Flota y asignación patente ↔ motorista |
| `admin-usuarios.html` | admin | Alta usuarios y cambio de rol |
| `admin-auditoria.html` | admin | Consulta `audit_logs` |

### 9.1.1 Mapa de pantallas por rol

```mermaid
flowchart TB
    LOGIN[index.html]

  subgraph Operadora
    D[dashboard]
    P[pedidos]
    CP[crear-pedido]
    DET[pedido detalle]
  end

  subgraph Motorista
    M[motorista]
  end

  subgraph Admin
    AF[admin-farmacias]
    AM[admin-motoristas]
    AMT[admin-motos]
    AU[admin-usuarios]
    AA[admin-auditoria]
  end

  LOGIN -->|operadora| D
  LOGIN -->|motorista| M
  LOGIN -->|admin| D
  D --> P
  P --> CP
  P --> DET
  M --> DET
  D --> AF
  D --> AM
  D --> AMT
  D --> AU
  D --> AA
```

## 9.2 Sistema de diseño

- **Tipografía**: Inter (system-ui fallback).
- **Paleta**: azul corporativo (`#1d4ed8` / `#1e3a8a` / `#3b82f6`) + escala neutra slate.
- **Componentes**: card, kpi, badge por estado, tabla, modal.
- **Iconografía**: símbolos Unicode para mantener cero dependencias.

### Estados visuales con badges semánticos

| Estado | Color de badge |
|---|---|
| `retiro_receta` | celeste suave |
| `retiro_pedido` | ámbar |
| `en_ruta` | azul |
| `entregado` | verde |
| `no_entregado` | rojo |
| `reprogramado` | morado |

## 9.3 Diseño responsive

- **Desktop** (`> 900 px`): grid de sidebar 240 px + main.
- **Tablet** (`< 900 px`): sidebar colapsa a top bar; grids 3 col → 1 col.
- **Mobile** (`< 700 px`): formularios `two` se vuelven 1 columna; modales fullscreen.

```css
.shell { grid-template-columns: 240px 1fr; }
@media (max-width: 900px) {
    .shell { grid-template-columns: 1fr; }
    .grid.cols-3, .grid.cols-2 { grid-template-columns: 1fr; }
}
```

## 9.4 Flujo de navegación

```mermaid
graph LR
    LOGIN[index.html<br/>Login] --> DASH{rol?}
    DASH -- operadora/admin --> D[dashboard.html]
    DASH -- motorista --> M[motorista.html]
    D --> P[pedidos.html]
    P --> DET[pedido.html]
    P --> CRE[crear-pedido.html]
    DET --> P
    M --> DET
```

## 9.5 Componentes reutilizables (JS modules)

```
public/js/
├── config.js          → window.LOGICO_CONFIG (Firebase + apiBase)
├── firebase-init.js   → app, auth, storage, apiFetch, requireSession,
│                        uploadEvidencia, toast, fmtDate, badgeEstado, escapeHtml
└── sidebar.js         → renderSidebar(activePath, me) según rol
```

## 9.6 Captura de comportamiento

Cada pantalla:
1. Monta `firebase-init` y espera `requireSession()`.
2. Llama a `apiFetch(...)` con el ID Token automático.
3. Renderiza datos. Errores se muestran con `toast(...)`.

Ejemplo (`dashboard.html`):

```js
const me = await requireSession();          // redirige si no logueado
const pedidos = await apiFetch('/pedidos?limit=200');
document.getElementById('kpi-activos').textContent =
    pedidos.filter(p => p.activo && p.estado_actual !== 'entregado').length;
```

## 9.7 Cómo levantarlo localmente

```bash
firebase emulators:start
# Hosting → http://localhost:5000
# Login con admin@logico.app / Admin123! (después de crear usuarios en Auth emulator)
```

## 9.8 Flujos pedidos y motorista (manual operativo)

**URL:** https://logico-20f73.web.app

### Operadora / admin — pedidos

1. Login → **Pedidos** → **Crear pedido** (`POST /api/pedidos`).
2. Abrir detalle → **Asignar motorista** (`GET /motoristas/disponibles`, `POST /rutas/asignar`).

### Motorista

1. Login → redirección a **Mis rutas** (`motorista.html`).
2. Activar **Disponible** (`PUT /motoristas/{id}/disponibilidad`).
3. Ver **moto asignada** (`GET /motoristas/{id}/moto`) — la asigna el admin en **Motos**.
4. Con ruta activa: **Iniciar ruta** → **Marcar entregado** (o incidencia).

```mermaid
flowchart LR
    subgraph Operadora
        A[Crear pedido] --> B[Asignar motorista]
    end
    subgraph Motorista
        C[Disponible ON] --> D[Ver rutas]
        D --> E[Iniciar ruta]
        E --> F[Entregar]
    end
    B --> D
```

## 9.9 Roadmap visual (post-MVP)

| Mejora | Prioridad |
|---|---|
| Mapa Leaflet/Maps con tracking del motorista | Media |
| Notificaciones push (FCM) al asignar pedido | Media |
| Drag & drop de evidencias | Baja |
| Modo oscuro | Baja |
| Exportar reportes a CSV/PDF | Media |
| PWA con service worker offline-first | Media |
