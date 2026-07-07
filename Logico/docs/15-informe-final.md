# 15. Informe final — LogiCo

> Criterio 3.1.6.15 — Documento que cumple el formato base, con todos los elementos requeridos y
> estándar profesional. Sirve como **portada e índice maestro** del informe.

## 15.1 Portada

| Campo | Valor |
|---|---|
| Proyecto | **LogiCo — Sistema de gestión logística de última milla** |
| Tipo | Proyecto Integrado Final |
| Stack | Firebase (Hosting, Auth, Functions, Storage) + Cloud SQL PostgreSQL 15 |
| Repositorio | (completar URL) |
| Sitio en producción | https://logico-20f73.web.app |
| Proyecto Firebase | `logico-20f73` |
| Fecha de entrega | (completar) |
| Equipo | (completar integrantes y roles, ver §15.4) |

## 15.2 Resumen ejecutivo

LogiCo digitaliza el flujo de reparto de pedidos: una **operadora** registra pedidos y asigna
**motoristas**; el motorista **inicia ruta**, **entrega** o reporta **incidencia**; un **admin**
gestiona farmacias, flota de motos, usuarios y auditoría. El sistema garantiza invariantes de
negocio (una ruta activa por pedido y por motorista) mediante transacciones SQL con bloqueos y
restricciones, trazabilidad de estados append-only y evidencias en almacenamiento de objetos.

## 15.3 Índice maestro de la documentación

| # | Documento | Criterios de rúbrica que cubre |
|---|---|---|
| 01 | [Metodología Scrum](01-metodologia-scrum.md) | Proceso, colaboración (3.1.3.6) |
| 02 | [Arquitectura 4+1](02-arquitectura-4+1.md) | Diseño, UML, dominio |
| 03 | [Tecnologías](03-tecnologias.md) | Justificación stack |
| 04 | [Base de datos](04-base-datos.md) | Estructura BD (3.1.x), normalización |
| 05 | [Datos estructurados/no estructurados](05-datos-estructurados-no-estructurados.md) | Modelos de datos eficientes |
| 06 | [Seguridad](06-seguridad.md) | Patrones de seguridad (3.1.3.5) |
| 07 | [Codificación segura](07-codificacion-segura.md) | Calidad y estándares |
| 08 | [Plan de pruebas](08-plan-pruebas.md) | Cobertura del plan (3.1.5.9) |
| 09 | [Prototipo](09-prototipo.md) | Interfaces y negocio (3.1.1.1/2) |
| 10 | [Retroalimentación](10-retroalimentacion.md) | Validación con usuarios |
| 11 | [Backend / funciones](11-backend-funciones.md) | Implementación |
| 12 | [Configuración del entorno](12-configuracion-entorno.md) | Entorno paso a paso (3.1.4.7) |
| 13 | [Validación de resultados](13-validacion-resultados.md) | Ejecución/validación (3.1.5.10/11), comparación (3.1.6.12), recomendaciones (3.1.6.13) |
| 14 | [Preguntas de defensa](14-preguntas-defensa.md) | Respuesta a preguntas (3.1.6.14) |
| 15 | Informe final (este documento) | Informe final (3.1.6.15) |

## 15.4 Equipo y colaboración (3.1.3.6)

| Rol | Responsabilidad | Artefactos / evidencia |
|---|---|---|
| Product Owner | Backlog y aceptación | `01-metodologia-scrum.md`, `docs/assets/jira-*` |
| Scrum Master | Ceremonias e impedimentos | Actas de sprint (assets) |
| Dev Backend | SQL + Functions | `functions/`, `database/` |
| Dev Frontend | UI + Auth | `public/` |
| QA / DevOps | Pruebas + deploy | `functions/tests/`, `postman/`, despliegues |

### Prácticas de colaboración

- **Control de versiones** con commits descriptivos y PRs revisados (Definition of Done §1.3).
- **Documentación viva** en `docs/` actualizada en cada sprint.
- **Convenciones de código** y estándares en `07-codificacion-segura.md`.
- **Trazabilidad** issue → commit → prueba (matriz §13.2).

## 15.5 Estado de cumplimiento por criterio (autoevaluación)

| Criterio | Evidencia principal | Nivel objetivo |
|---|---|---|
| 3.1.1.1 Interfaz ↔ negocio | Matriz 18/18 procesos §9.1.2 | Destacado |
| 3.1.1.2 Lineamientos estéticos | Sistema de diseño §9.2 | Destacado |
| 3.1.x Estructura BD | FK/índices/triggers §4.2–4.4 | Destacado |
| 3.1.x Normalización | 3FN §4.6 | Destacado |
| 3.1.3.5 Seguridad | RBAC + IDOR cerrado + CORS §6 | Destacado |
| 3.1.3.6 Colaboración | §15.4, Scrum §1 | Destacado/Habilitado |
| 3.1.4.7 Entorno | Guía paso a paso doc 12 | Destacado |
| 3.1.4.8 Doc implementación | docs 02, 04, 11 | Destacado |
| 3.1.5.9 Plan de pruebas | doc 08 (borde + estrés) | Destacado/Habilitado |
| 3.1.5.10 Ejecución | doc 13 §13.1–13.5 | Destacado |
| 3.1.5.11 Validación | doc 13 §13.7 | Destacado |
| 3.1.6.12 Obtenido vs esperado | doc 13 §13.4–13.6 | Destacado |
| 3.1.6.13 Recomendaciones | doc 13 §13.8 | Destacado |
| 3.1.6.14 Preguntas | doc 14 | Destacado |
| 3.1.6.15 Informe final | este documento | Destacado/Habilitado |

## 15.6 Limitaciones y trabajo futuro

Resumen consolidado (detalle en `06-seguridad.md` §6.10 y `13-validacion-resultados.md` §13.8):

1. Lectura de Storage por cualquier autenticado → URLs firmadas (R3).
2. Falta cobertura unitaria de `motos.js` / `evidencias.js` (R1).
3. Integración automatizada con supertest / CI (R2, R6).
4. Pruebas de carga formales versionadas (R7).

## 15.7 Convenciones del documento

- Formato Markdown renderizable en GitHub/VS Code; diagramas en **Mermaid**.
- Numeración jerárquica por sección; enlaces cruzados entre documentos.
- Código citado con rutas reales del repositorio.
