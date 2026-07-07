# Carta Gantt — LogiCo (28 días hábiles)

Cronograma del proyecto en **6 sprints** (28 días hábiles). El diagrama siguiente usa `flowchart`
porque el preview de Cursor/VS Code **no renderiza** diagramas `gantt`.

## Diagrama cronológico (renderiza en preview)

```mermaid
flowchart LR
    subgraph S0["Sprint 0 Infra 02-04 Mar"]
        direction TB
        s0a[Firebase + Cloud SQL]
        s0b[Auth Storage Functions]
        s0a --> s0b
    end

    subgraph S1["Sprint 1 Datos 05-09 Mar"]
        direction TB
        s1a[MER + schema SQL]
        s1b[Triggers + seeds]
        s1c[Pool PG + auth]
        s1a --> s1b
    end

    subgraph S2["Sprint 2 Backend 10-14 Mar"]
        direction TB
        s2a[Pedidos rutas estados]
        s2b[Tests unitarios]
        s2a --> s2b
    end

    subgraph S3["Sprint 3 Frontend 17-21 Mar"]
        direction TB
        s3a[Login dashboard]
        s3b[Pedidos motorista UI]
        s3a --> s3b
    end

    subgraph S4["Sprint 4 Extras 24-28 Mar"]
        direction TB
        s4a[Incidencias evidencias]
        s4b[Farmacias geografia]
        s4a --> s4b
    end

    subgraph S5["Sprint 5 Cierre 31 Mar-03 Abr"]
        direction TB
        s5a[QA seguridad docs]
        s5b[Deploy produccion]
        s5a --> s5b
    end

    S0 --> S1 --> S2 --> S3 --> S4 --> S5
```

> Misma versión en [`gantt-logico.mmd`](gantt-logico.mmd) (abrir con preview Mermaid).

## Tabla resumen por sprint

| Sprint | Fechas | Objetivo | Entregables clave |
|:---:|---|---|---|
| **0** | 02–04 Mar | Infraestructura | Firebase, Cloud SQL, Auth, Functions |
| **1** | 05–09 Mar | Modelo de datos | `01_schema.sql`, triggers, seeds, `auth.js` |
| **2** | 10–14 Mar | Backend núcleo | Pedidos, rutas, estados, tests Jest |
| **3** | 17–21 Mar | Frontend | Login, dashboard, pedidos, vista motorista |
| **4** | 24–28 Mar | Extras | Incidencias, evidencias, farmacias, geografía |
| **5** | 31 Mar – 03 Abr | Cierre | QA, hardening seguridad, docs, deploy |

## Detalle de tareas por sprint

| Sprint | Tarea | Duración | Dependencia |
|---|---|:---:|---|
| 0 | Firebase + Cloud SQL | 2 d | — |
| 0 | Auth / Storage / Functions | 1 d | anterior |
| 1 | MER + schema SQL | 2 d | Sprint 0 |
| 1 | Triggers + seeds | 2 d | schema |
| 1 | Pool PG + auth middleware | 2 d | Sprint 0 |
| 2 | Pedidos + rutas + estados | 4 d | Sprint 1 |
| 2 | Tests unitarios core | 1 d | backend |
| 3 | Login + dashboard | 2 d | Sprint 2 |
| 3 | Pedidos + motorista UI | 3 d | login |
| 4 | Incidencias + evidencias | 3 d | Sprint 3 |
| 4 | Farmacias + geografía | 2 d | incidencias |
| 5 | QA + seguridad + docs | 3 d | Sprint 4 |
| 5 | Deploy producción | 2 d | QA |

## Gantt clásico (solo herramientas externas)

El tipo `gantt` de Mermaid **no funciona** en el preview integrado de Cursor/VS Code.
Para ver barras temporales:

1. Copiar el contenido de [`gantt-logico-gantt.txt`](gantt-logico-gantt.txt)
2. Pegar en [mermaid.live](https://mermaid.live) o exportar desde GitHub al subir el repo
