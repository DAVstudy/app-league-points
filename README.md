# League Points

Base de lógica de negocio desarrollada en TypeScript para calcular los puntajes de una liga mensual de Pokémon TCG.

El proyecto busca resolver un problema real de los organizadores de torneos locales: mantener una clasificación mensual precisa cuando se realizan varios torneos por semana y los jugadores obtienen puntos por asistencia, posición, continuidad e invitaciones.

> Estado actual: MVP de la lógica de puntuación en desarrollo activo.

## El problema

Actualmente, los organizadores actualizan manualmente la clasificación de la liga. Esta tarea se vuelve compleja cuando deben considerar:

- La asistencia a los torneos.
- Los premios por posición.
- La continuidad semanal.
- Las invitaciones de jugadores nuevos.
- La clasificación mensual y el acceso al Top Cut.

League Points busca convertir estas reglas en una aplicación verificable y mantenible.

## Reglas implementadas

- 5 puntos por asistir a un torneo.
- 10 puntos de posición para el ganador.
- 5 puntos de posición para los puestos 2–4 cuando participan al menos 8 jugadores.
- 3 puntos de posición para los puestos 5–8 cuando participan al menos 16 jugadores.
- 2 puntos por asistir a los torneos originalmente programados para miércoles y viernes.
- 3 puntos por cada jugador invitado que participa por primera vez en la tienda.
- Cada invitado se contabiliza una sola vez mediante su Player ID.
- Los premios por posición son excluyentes; los bonos independientes se acumulan.
- La clasificación mensual acumula los puntos de cada jugador utilizando la fecha programada original de los torneos.
- Los jugadores con igual puntaje comparten una posición provisional.
- Los empates que afectan el límite del Top 8 quedan pendientes de desempate.
- Cada liga configura `PLAYOFF_MATCH` o `MANUAL_ORDER`; la política se bloquea al registrar el primer torneo.
- Un playoff imposible puede resolverse manualmente, registrando obligatoriamente el motivo.
- El orden debe incluir exactamente una vez a todos los jugadores empatados.
- Las operaciones protegidas exigen una membresía que coincida con el organizador y la tienda.
- Una autorización rechazada no ejecuta lecturas ni cambios sobre los datos protegidos.
- Las tiendas y membresías de organizadores persisten en SQLite tras reiniciar el proceso.
- Las consultas de membresías siempre están limitadas a una tienda.
- Una misma membresía de organizador y tienda no puede registrarse dos veces.
- Cada tienda conserva como máximo una liga por mes calendario y su política de desempate.
- El bloqueo de la política se deriva de torneos persistidos para esa tienda y mes.
- Los torneos conservan sus fechas programada y efectiva, participantes, posiciones y asignaciones de invitación.
- La fecha programada original determina el mes de liga, incluso cuando la fecha efectiva corresponde a una reprogramación posterior.
- Las consultas de torneos e historial de jugadores siempre están limitadas a una tienda.
- Las asignaciones de invitación exigen que ambos jugadores participen en el mismo torneo y prohíben la autoinvitación.
- La clasificación protegida se construye desde los torneos persistidos de una tienda y combina puntos base, invitaciones y continuidad.
- Una pareja miércoles-viernes que cruza el límite del mes no concede puntos de continuidad.
- Las resoluciones de desempate se conservan como revisiones auditadas con orden completo, método, motivo de fallback, organizador y fecha controlada por la aplicación.
- Una corrección agrega una revisión sin sobrescribir las anteriores; la última revisión válida determina el orden final del Top 8.

## Tecnologías

- TypeScript
- Vitest
- Node.js
- SQLite mediante `node:sqlite`
- npm

## Ejecución local

```bash
npm install
npm test
npm run typecheck
```

Se requiere Node.js 24 o posterior. En Node.js 24, `node:sqlite` puede emitir una advertencia experimental durante la ejecución.

## Pruebas

La lógica de puntuación se desarrolla mediante pruebas unitarias orientadas al comportamiento.

La suite actual cubre:

- Puntos de asistencia y posición.
- Exclusividad de los premios por posición.
- Continuidad semanal.
- Identificación de jugadores nuevos.
- Puntos por invitaciones.
- Protección contra invitados duplicados.
- Clasificación mensual y acumulación por jugador.
- Posiciones provisionales y límite del Top 8.
- Empates que requieren desempate para definir la clasificación.
- Configuración y bloqueo de políticas de desempate.
- Resolución mediante playoff, orden manual y uso justificado de la alternativa manual.
- Autorización exacta por organizador y tienda, incluido el aislamiento entre tiendas.
- Persistencia de tiendas y membresías después de reabrir la base de datos.
- Consultas de membresías aisladas por tienda y rechazo de duplicados.
- Persistencia de ligas mensuales y políticas de desempate por tienda.
- Bloqueo durable y aislado de la política después de registrar un torneo.
- Persistencia atómica de torneos, fechas, participantes, posiciones e invitaciones.
- Aislamiento de torneos e historial de jugadores por tienda y mes de liga.
- Validación durable de fechas, posiciones y relaciones entre invitado e invitador.
- Construcción de la clasificación protegida desde torneos persistidos.
- Historial auditable de resoluciones y correcciones de desempate.
- Aplicación de la última resolución válida al empate del límite del Top 8.

## Próximos pasos

- Importar resultados de torneos.
- Implementar sesiones e invitaciones de acceso para organizadores.
- Construir la interfaz pública de clasificación.

## Estado del proyecto

Actualmente, el repositorio contiene la lógica de puntuación, la clasificación mensual, la resolución auditable de desempates y persistencia SQLite para tiendas, membresías, ligas mensuales, torneos, participantes e invitaciones. La clasificación protegida ya se construye desde estos datos persistidos; las sesiones, la importación de resultados y la interfaz web se incorporarán incrementalmente.

## Aviso

Este es un proyecto comunitario no oficial y no está afiliado ni respaldado por The Pokémon Company.
