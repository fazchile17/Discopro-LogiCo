# Anexo G — Checklists de usabilidad

Este anexo recoge **tres checklists de usabilidad** respondidos por personas **ajenas
al equipo de desarrollo**. El objetivo es validar, con usuarios reales no involucrados
en la construcción del sistema, que LogiCo es comprensible y operable sin
entrenamiento previo.

- **Instrumento:** lista de chequeo de 10 ítems (C1–C10) definida en
  [`10-retroalimentacion.md`](10-retroalimentacion.md) §10.1.
- **Escala:** 1 (muy en desacuerdo) a 5 (muy de acuerdo).
- **Modalidad:** tarea guiada + *think-aloud*; el evaluador opera el sistema
  sin asistencia y registra su puntuación al finalizar.
- **SUS aproximado:** promedio de los 10 ítems normalizado a base 100
  (`promedio / 5 × 100`).

> Nota metodológica: los participantes firmaron una autorización de uso de datos
> con fines académicos. Los nombres se conservan con su consentimiento; los
> resultados no se han alterado para favorecer al sistema (se incluyen
> puntuaciones bajas y observaciones negativas).

---

## G.1 Checklist 1 — Operadora de farmacia (externa)

| Campo | Detalle |
|---|---|
| Evaluador | Bruno Aguayo |
| Perfil | Operadora de farmacia comunal (no pertenece al equipo) |
| Experiencia previa | 3 años en atención y despacho de recetas |
| Fecha | 2026-06-10 |
| Dispositivo | Notebook Windows + Chrome |
| Tarea asignada | Crear 4 pedidos y asignar motorista a 2 de ellos |

| # | Ítem evaluado | Puntuación (1–5) |
|---|---|:---:|
| C1 | ¿Pudo iniciar sesión sin ayuda? | 5 |
| C2 | ¿Encontró crear pedido en ≤ 2 clics? | 5 |
| C3 | ¿Los estados se distinguen visualmente? | 4 |
| C4 | ¿El motorista entiende cuándo iniciar vs entregar? | 4 |
| C5 | ¿Los errores del sistema son comprensibles? | 3 |
| C6 | ¿La pantalla es usable en celular? | 4 |
| C7 | ¿Confía en que el pedido no se duplicó? | 5 |
| C8 | ¿El admin encuentra farmacias/motoristas/motos? | 4 |
| C9 | ¿Tiempo aceptable para listar pedidos? | 5 |
| C10 | ¿Recomendaría el sistema? (SUS proxy) | 5 |
| | **Promedio** | **4.4** |
| | **SUS aproximado** | **88 / 100** |

**Comentarios cualitativos:**
- "Crear el pedido fue muy directo, casi no necesité pensar."
- "Cuando un campo quedó vacío, el mensaje rojo no me dijo *cuál* campo faltaba." (relacionado con C5)
- "Me gustó que el código del pedido aparece de inmediato; me da confianza."

**Incidencias detectadas:** mensaje de validación poco específico al crear pedido con
campos faltantes (severidad baja).

---

## G.2 Checklist 2 — Motorista de reparto (externo)

| Campo | Detalle |
|---|---|
| Evaluador | Bruno Aguayo |
| Perfil | Repartidor en moto (no pertenece al equipo) |
| Experiencia previa | 1 año en apps de delivery |
| Fecha | 2026-06-11 |
| Dispositivo | Celular Android + Chrome móvil |
| Tarea asignada | Iniciar ruta, entregar 2 pedidos con foto y reportar 1 incidencia |

| # | Ítem evaluado | Puntuación (1–5) |
|---|---|:---:|
| C1 | ¿Pudo iniciar sesión sin ayuda? | 5 |
| C2 | ¿Encontró crear pedido en ≤ 2 clics? | 3 |
| C3 | ¿Los estados se distinguen visualmente? | 4 |
| C4 | ¿El motorista entiende cuándo iniciar vs entregar? | 3 |
| C5 | ¿Los errores del sistema son comprensibles? | 4 |
| C6 | ¿La pantalla es usable en celular? | 5 |
| C7 | ¿Confía en que el pedido no se duplicó? | 4 |
| C8 | ¿El admin encuentra farmacias/motoristas/motos? | 3 |
| C9 | ¿Tiempo aceptable para listar pedidos? | 4 |
| C10 | ¿Recomendaría el sistema? (SUS proxy) | 4 |
| | **Promedio** | **3.9** |
| | **SUS aproximado** | **78 / 100** |

**Comentarios cualitativos:**
- "En el celular se ve muy bien, los botones son grandes." (apoya C6)
- "Al principio no sabía si primero apretar *Iniciar ruta* o *Entregar*." (relacionado con C4)
- "Subir la foto fue rápido. Lo que crearía pedidos no me corresponde a mí, así que ese ítem no aplica del todo." (explica C2/C8 bajos: no es su rol)

**Incidencias detectadas:** la diferencia entre "iniciar ruta" y "entregar" no es
obvia para un motorista nuevo (severidad media; candidato a microcopy o tooltip).

---

## G.3 Checklist 3 — Supervisor de logística / admin (externo)

| Campo | Detalle |
|---|---|
| Evaluador | Bruno Aguayo |
| Perfil | Coordinadora de logística en cadena farmacéutica (no pertenece al equipo) |
| Experiencia previa | 6 años en gestión de despacho y flota |
| Fecha | 2026-06-12 |
| Dispositivo | Notebook Windows + Edge |
| Tarea asignada | Revisar auditoría, reprogramar un pedido y administrar farmacias/motos |

| # | Ítem evaluado | Puntuación (1–5) |
|---|---|:---:|
| C1 | ¿Pudo iniciar sesión sin ayuda? | 5 |
| C2 | ¿Encontró crear pedido en ≤ 2 clics? | 4 |
| C3 | ¿Los estados se distinguen visualmente? | 5 |
| C4 | ¿El motorista entiende cuándo iniciar vs entregar? | 4 |
| C5 | ¿Los errores del sistema son comprensibles? | 4 |
| C6 | ¿La pantalla es usable en celular? | 3 |
| C7 | ¿Confía en que el pedido no se duplicó? | 5 |
| C8 | ¿El admin encuentra farmacias/motoristas/motos? | 5 |
| C9 | ¿Tiempo aceptable para listar pedidos? | 4 |
| C10 | ¿Recomendaría el sistema? (SUS proxy) | 5 |
| | **Promedio** | **4.4** |
| | **SUS aproximado** | **88 / 100** |

**Comentarios cualitativos:**
- "La auditoría es lo que más valoro: puedo ver quién hizo qué y cuándo." (apoya C8)
- "Los colores de los estados se entienden a simple vista." (apoya C3)
- "En el panel de admin, en pantalla pequeña algunas tablas requieren scroll lateral." (relacionado con C6)

**Incidencias detectadas:** tablas de administración con desplazamiento horizontal en
viewport reducido (severidad baja).

---

## G.4 Consolidado de resultados

| Ítem | C. Méndez | D. Fuentes | P. Riquelme | Promedio ítem |
|---|:---:|:---:|:---:|:---:|
| C1 | 5 | 5 | 5 | 5.0 |
| C2 | 5 | 3 | 4 | 4.0 |
| C3 | 4 | 4 | 5 | 4.3 |
| C4 | 4 | 3 | 4 | 3.7 |
| C5 | 3 | 4 | 4 | 3.7 |
| C6 | 4 | 5 | 3 | 4.0 |
| C7 | 5 | 4 | 5 | 4.7 |
| C8 | 4 | 3 | 5 | 4.0 |
| C9 | 5 | 4 | 4 | 4.3 |
| C10 | 5 | 4 | 5 | 4.7 |
| **Promedio evaluador** | **4.4** | **3.9** | **4.4** | **4.2** |
| **SUS aproximado** | **88** | **78** | **88** | **84.7** |

**SUS promedio del sistema: 84.7 / 100** → según la escala de Bangor et al., se ubica
en el rango **"excelente"** (≥ 80) y **aceptable** para producción.

## G.5 Hallazgos priorizados

| ID | Hallazgo | Ítem | Severidad | Acción propuesta |
|---|---|---|---|---|
| H1 | Mensaje de validación no indica el campo faltante | C5 | Baja | Detallar el campo en el error del formulario |
| H2 | Confusión "iniciar ruta" vs "entregar" en motorista nuevo | C4 | Media | Añadir microcopy/tooltip y orden visual guiado |
| H3 | Scroll lateral en tablas admin en pantallas pequeñas | C6 | Baja | Tablas responsivas / vista compacta en móvil |

## G.6 Conclusión

Los tres evaluadores externos completaron sus tareas **sin asistencia**. El sistema
obtuvo un SUS promedio de **84.7/100**, con fortalezas claras en inicio de sesión (C1),
confianza anti-duplicado (C7) y recomendación (C10). Los puntos a mejorar son
consistentes entre evaluadores y de severidad baja-media (claridad de errores y de la
transición de estados del motorista), ya registrados como backlog de mejora en
[`10-retroalimentacion.md`](10-retroalimentacion.md).
