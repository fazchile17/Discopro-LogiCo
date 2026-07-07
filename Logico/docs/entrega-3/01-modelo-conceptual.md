# 01 — Modelo conceptual

El **modelo conceptual** describe el dominio de negocio **sin detalles de implementación**
(tipos SQL, índices ni nombres de columnas técnicas). Representa *qué* existe en el mundo
real que LogiCo gestiona y *cómo* se relacionan las entidades.

## 1.1 Alcance del dominio

| Entidad | Descripción en el negocio |
|---|---|
| **Usuario** | Persona del sistema: operadora (crea pedidos), motorista (reparte) o administrador (mantenedores) |
| **Pedido** | Solicitud de entrega a un cliente final (dirección, fecha, detalle) |
| **Estado de pedido** | Etapa del ciclo logístico (retiro, en ruta, entregado, etc.) |
| **Historial de estado** | Registro inmutable de cada cambio de estado de un pedido |
| **Ruta** | Asignación de un motorista a un pedido para ejecutar la entrega |
| **Disponibilidad motorista** | Indica si un motorista puede recibir una nueva ruta |
| **Incidencia** | Evento que impide completar la entrega según lo planificado |
| **Reprogramación** | Cambio de fecha programada de un pedido |
| **Evidencia** | Prueba documental de entrega o incidencia (foto/archivo) |
| **Farmacia** | Punto de origen opcional del pedido |
| **Moto** | Vehículo de la flota asignado a un motorista |
| **Región / Provincia / Comuna** | Jerarquía geográfica para ubicar farmacias |
| **Auditoría** | Registro de acciones críticas realizadas por administradores |

## 1.2 Diagrama conceptual (Mermaid)

```mermaid
erDiagram
    USUARIO ||--o{ PEDIDO : "crea / modifica"
    USUARIO ||--o{ HISTORIAL_ESTADO : "registra"
    USUARIO ||--o{ RUTA : "es motorista"
    USUARIO ||--|| DISPONIBILIDAD : "tiene"
    USUARIO ||--o{ INCIDENCIA : "reporta"
    USUARIO ||--o{ REPROGRAMACION : "ejecuta"
    USUARIO ||--o{ EVIDENCIA : "sube"
    USUARIO ||--o{ AUDITORIA : "realiza"
    USUARIO ||--o| MOTO : "conduce"

    PEDIDO ||--|| ESTADO_PEDIDO : "estado actual"
    PEDIDO ||--o{ HISTORIAL_ESTADO : "trazabilidad"
    PEDIDO ||--o| RUTA : "asignación activa"
    PEDIDO ||--o{ INCIDENCIA : "puede tener"
    PEDIDO ||--o{ REPROGRAMACION : "puede tener"
    PEDIDO ||--o{ EVIDENCIA : "adjunta"
    PEDIDO }o--o| FARMACIA : "origen opcional"

    FARMACIA }o--|| COMUNA : "ubicada en"
    COMUNA }o--|| PROVINCIA : "pertenece a"
    PROVINCIA }o--|| REGION : "pertenece a"

    RUTA ||--o{ INCIDENCIA : "contexto"
    INCIDENCIA ||--o{ EVIDENCIA : "opcional"

    USUARIO {
        string nombre
        string correo
        string rol
    }
    PEDIDO {
        string codigo
        string cliente
        string direccion
        datetime fecha_programada
    }
    RUTA {
        string codigo
        string estado_ruta
    }
    FARMACIA {
        string nombre
        string direccion
    }
```

## 1.3 Relaciones de negocio (cardinalidades)

```mermaid
flowchart LR
    subgraph Operacion["Operación diaria"]
        OP[Operadora] -->|1:N crea| P[Pedido]
        P -->|1:N historial| H[Historial estado]
        P -->|0:1 ruta activa| R[Ruta]
        R -->|N:1| M[Motorista]
    end

    subgraph Excepciones["Excepciones"]
        P -->|0:N| I[Incidencia]
        P -->|0:N| RE[Reprogramación]
        P -->|0:N| E[Evidencia]
    end

    subgraph Admin["Administración"]
        AD[Admin] -->|CRUD| F[Farmacia]
        AD -->|CRUD| MO[Moto]
        AD -->|consulta| AU[Auditoría]
        F -->|N:1| GEO[Comuna]
    end
```

## 1.4 Reglas de negocio conceptuales

| ID | Regla | Entidades involucradas |
|---|---|---|
| RN-01 | Solo operadora o admin puede crear un pedido | Usuario, Pedido |
| RN-02 | Un pedido tiene **como máximo una ruta activa** a la vez | Pedido, Ruta |
| RN-03 | Un motorista tiene **como máximo una ruta activa** a la vez | Usuario, Ruta |
| RN-04 | El estado del pedido se cambia **solo** registrando historial | Pedido, Historial |
| RN-05 | Estados terminales (`entregado`) no vuelven atrás sin reprogramación | Pedido, Estado |
| RN-06 | La farmacia es **opcional** en un pedido | Pedido, Farmacia |
| RN-07 | Toda acción crítica de admin queda en auditoría | Usuario, Auditoría |
| RN-08 | La evidencia fotográfica complementa entrega o incidencia | Evidencia, Pedido |

## 1.5 Mejoras respecto a versión anterior

| Mejora | Descripción |
|---|---|
| Entidades admin | Incorporación de **Farmacia**, **Moto**, **Auditoría** y geografía Chile |
| Trazabilidad | Separación explícita **Estado actual** vs **Historial append-only** |
| Flota | Entidad **Moto** vinculada a motorista |
| Ubicación | Reemplazo de «ciudad libre» por jerarquía **Región → Provincia → Comuna** |
| Evidencias | Entidad explícita ligada a Storage (no estructurado) |

## 1.6 Actores y su vista del modelo

```mermaid
flowchart TB
    LOGICO((LogiCo))
    LOGICO --> OP[Operadora]
    LOGICO --> MOT[Motorista]
    LOGICO --> ADM[Administrador]
    OP --> OP1[Crear pedido]
    OP --> OP2[Asignar motorista]
    OP --> OP3[Reprogramar]
    MOT --> MOT1[Ver ruta activa]
    MOT --> MOT2[Iniciar y entregar]
    MOT --> MOT3[Incidencia con foto]
    ADM --> ADM1[Farmacias]
    ADM --> ADM2[Motos]
    ADM --> ADM3[Usuarios y roles]
    ADM --> ADM4[Auditoría]
```
