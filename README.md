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
- Las sesiones de organizadores derivan la identidad exclusivamente de tokens verificados por Supabase Auth.
- El registro público está deshabilitado: el primer organizador se provisiona administrativamente y los siguientes ingresan mediante invitación.
- Una invitación pendiente no concede acceso; la membresía se activa atómicamente cuando la identidad invitada la acepta autenticada.
- Una misma identidad puede pertenecer a varias tiendas mediante una selección explícita de tienda activa.
- Cualquier organizador puede revocar otra membresía o la propia, pero SQLite impide eliminar al último organizador activo de una tienda.
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
- Revocar una membresía conserva el identificador del autor y todo el historial de desempates; no concede permiso para registrar nuevas resoluciones en esa tienda.
- SQLite comprueba la membresía exacta al registrar cada resolución. Al abrir bases existentes, actualiza únicamente la relación de autoría histórica, sin borrar revisiones, órdenes de jugadores ni otros datos.

## Tecnologías

- TypeScript
- Vitest
- Node.js
- SQLite mediante `node:sqlite`
- Supabase Auth mediante `@supabase/supabase-js`
- npm

## Ejecución local

```bash
npm install
npm test
npm run typecheck
```

Se requiere Node.js 24 o posterior. En Node.js 24, `node:sqlite` puede emitir una advertencia experimental durante la ejecución.

## Configuración de Supabase Auth

- Deshabilitar el registro público de usuarios en la configuración de Auth.
- Crear o invitar al primer organizador desde un entorno administrativo confiable.
- Ejecutar `auth.admin.inviteUserByEmail` únicamente en el servidor mediante una clave secreta de Supabase.
- No exponer la clave secreta en el navegador, variables públicas de Vite ni respuestas de la API.
- Permitir que el organizador invitado establezca su contraseña mediante el enlace enviado por Supabase.
- Validar cada token de acceso con Supabase antes de derivar el `organizerId` y comprobar la membresía de la tienda activa.

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
- Verificación de sesiones mediante la identidad confirmada por Supabase.
- Invitaciones pendientes, aceptación autenticada y activación atómica de membresías.
- Reutilización de una identidad de organizador en varias tiendas.
- Selección explícita de tienda activa y rechazo de contextos ajenos.
- Revocación exacta de membresías con protección durable del último organizador.
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
- Integrar la autenticación y las invitaciones en la API y el espacio de organizadores.
- Construir la interfaz pública de clasificación.

## Estado del proyecto

Actualmente, el repositorio contiene la lógica de puntuación, la clasificación mensual, la resolución auditable de desempates, autenticación de organizadores mediante Supabase Auth y persistencia SQLite para identidades, invitaciones pendientes, membresías, tiendas, ligas mensuales, torneos y participantes. La clasificación protegida ya se construye desde estos datos persistidos; la integración HTTP, la importación de resultados y la interfaz web se incorporarán incrementalmente.

## Aviso

Este es un proyecto comunitario no oficial y no está afiliado ni respaldado por The Pokémon Company.
