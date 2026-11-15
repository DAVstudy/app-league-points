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

## Próximos pasos

- Importar resultados de torneos.
- Persistir ligas mensuales y torneos con aislamiento por tienda.
- Implementar sesiones e invitaciones de acceso para organizadores.
- Construir la interfaz pública de clasificación.

## Estado del proyecto

Actualmente, el repositorio contiene la lógica de puntuación, la clasificación mensual, la resolución de desempates y la primera frontera de persistencia para tiendas y membresías. La gestión persistente de ligas y torneos y la interfaz web se incorporarán incrementalmente.

## Aviso

Este es un proyecto comunitario no oficial y no está afiliado ni respaldado por The Pokémon Company.
