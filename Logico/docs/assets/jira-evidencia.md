# Evidencia Jira — Proyecto LogiCo

**Proyecto:** LOGICO-PI  
**Metodología:** Scrum (sprints semanales)  
**Tablero:** Kanban con columnas *Backlog → En progreso → En revisión → Hecho*

## Enlace y export

| Recurso | Ubicación |
|---|---|
| Tablero Jira (demo académico) | `https://logico-team.atlassian.net/jira/software/projects/LOGICO/boards/1` |
| Export CSV backlog | `docs/assets/jira-backlog-export.csv` |
| Capturas sprint planning | `docs/assets/jira-sprint-1.png`, `jira-sprint-3.png`, `jira-burndown-s5.png` |

> **Nota para evaluación:** Si el enlace Atlassian no está disponible en el entorno del evaluador, la evidencia primaria es el CSV + capturas en `docs/assets/` y la trazabilidad ID de tarea ↔ commits en `docs/01-metodologia-scrum.md` (S0-1 … S5-6).

## Muestra de issues (trazabilidad)

| Key Jira | Título | Sprint | Estado | Responsable |
|---|---|---|---|---|
| LOGICO-1 | Crear proyecto Firebase | Sprint 0 | Hecho | DevOps |
| LOGICO-8 | MER 10 tablas + FK | Sprint 1 | Hecho | BE |
| LOGICO-15 | crearPedido() + tests | Sprint 2 | Hecho | BE |
| LOGICO-22 | UI pedidos operadora | Sprint 3 | Hecho | FE |
| LOGICO-31 | Mantenedor farmacias | Sprint 4 | Hecho | BE+FE |
| LOGICO-38 | Plan pruebas + Sonar | Sprint 5 | Hecho | QA |

## Ceremonias registradas en Jira

- **Sprint Planning:** issues movidos de Backlog al sprint activo con story points (1 SP ≈ 0.5 día).
- **Daily:** comentarios en sub-tareas con bloqueos (`Blocked by LOGICO-12`).
- **Review:** versión `v1.0.0-mvp` etiquetada al cierre Sprint 5.
- **Retro:** ítems de mejora enlazados a `docs/10-retroalimentacion.md`.
