# Diseño maestro — Datos hardcodeados del detalle de grupo → dinámicos

**Fecha:** 2026-05-31
**Estado:** aprobado (brainstorming), pendiente de plan de implementación.
**Repos:** `polla-backend` (modelos/lambdas/scoring) + `polla-app` (consumo en `group-detail` y `right-rail`).

## Contexto

Tras rediseñar el detalle de grupo (`/groups/:id`) al diseño "Prueba GG", varios datos quedaron **hardcodeados/demo** (marcados con `FALTA:` y badge "Ejemplo"). Ver memoria `polla-hardcoded-placeholders`. El objetivo es volverlos **dinámicos** con datos reales.

Items hardcodeados hoy:
- **group-detail**: KPI "Jornada" + subtítulo de "Tu posición" (movimiento); columnas **J1 / Acierto / Mov** del leaderboard; fecha de reparto del podio ("19 jul"); "$X por persona".
- **right-rail** (cards solo en `/groups/:id`): `demoChampDist` ("¿A quién le va el grupo?") y `demoActivity` ("Actividad reciente").

## Restricción arquitectónica clave

`Pick` y `SpecialPick` usan **owner-auth** (`allow.ownerDefinedIn('userId')`): un usuario solo puede leer sus propias picks. Por lo tanto **cualquier dato cross-miembro** (puntos por jornada de otros, distribución de campeón, etc.) **no se puede calcular en el cliente** — debe **precomputarse/agregarse server-side** (Lambda con acceso directo a DynamoDB que salta owner-auth) y persistirse en modelos legibles por el grupo.

`UserGroupTotal` (alimenta el leaderboard) **sí** es group-readable pero es **acumulado** (points/exactCount/resultCount), sin desglose por jornada ni historial de posiciones. "Jornada" vive en `Phase` (orders 1–3 = Fecha 1/2/3; 4–8 = R32/R16/QF/SF/Final; 9 = 3er puesto). `Match.matchday` fue eliminado; la jornada = `phaseId`.

## Decomposición en 5 sub-proyectos

Cada sub-proyecto tendrá su propio spec→plan→implementación. Orden sugerido: Sub-1, Sub-2, Sub-3, Sub-4, Sub-5 (Sub-5 depende de Sub-4 para el evento "cambio de líder").

---

### Sub-1 · Quick wins (solo frontend, sin backend)

**KPI "Jornada"** (`group-detail`):
- Derivar la jornada actual y el countdown desde `Phase` (orders 1–8) + `Match.kickoffAt` (ya disponibles vía `listMatches`/`listPhases`).
- Jornada actual = la primera phase (por `order`) con algún match no-FINAL; "Arranca en N días" = días al `kickoffAt` mínimo de esa phase. `/8` = phases con order 1–8.

**Acierto %** (columna del leaderboard):
- `Math.round((exactCount + resultCount) / partidosFinal * 100)` por miembro, donde `exactCount`/`resultCount` vienen de `UserGroupTotal` (ya cargado) y `partidosFinal` = count de `Match` con `status === 'FINAL'` (de `listMatches`).
- Si `partidosFinal === 0` → "—".

**Cambios:** `group-detail.component.ts` (KPI Jornada + helper `acierto` real); quitar el placeholder `jornadaPts`/`movement` solo cuando Sub-4 esté listo (acá solo Acierto y Jornada).

**Tests:** unit del cálculo de jornada actual y de acierto% (casos: 0 finales, todos finales, mixto).

---

### Sub-2 · Campos del grupo (backend chico)

- Agregar `entryFeeAmount: a.integer()` a `Group` en `polla-backend/amplify/data/resource.ts` — **monto entero por persona en la moneda del grupo** (ej. `5` = $5; sin decimales). Nullable para grupos legacy. Editable desde el editor de grupo (`group-edit`) y el modal de crear grupo cuando `entryFeeEnabled`.
- Fecha de reparto: usar el fin de torneo real. Si `Tournament` tiene `endsAt`, consumirlo; si no, agregar el campo o exponer una constante de torneo. El podio muestra esa fecha en vez de "19 jul".

**Cambios:** schema `Group` (+ migración suave: nullable), `group-edit`/create modal (input monto), `group-detail` podio ("$X por persona" = `entryFeeAmount`; fecha = torneo).

**Tests:** unit/back de upsert con `entryFeeAmount`; front muestra "$X por persona" y fecha real.

---

### Sub-3 · Distribución de campeón (backend medio)

- Nueva **custom query** `groupChampionDistribution(groupId: ID!)` en el schema, resuelta por una **Lambda** con permisos de lectura directa sobre DynamoDB (Membership + SpecialPick).
- Lógica: lee membresías del grupo → para cada miembro lee su `SpecialPick` type=`CHAMPION` del modo del grupo → cuenta por `teamId` → devuelve `[{ teamId, teamName, flagCode, count, pct }]` ordenado desc.
- **Privacidad:** devuelve **solo agregados** (conteos/%); nunca el pick individual de cada usuario. Auth de la query: miembros autenticados.
- Front: `right-rail` reemplaza `demoChampDist` por esta query (solo en `/groups/:id`; necesita el `groupId` de la URL).

**Tests:** back — Lambda agrega correctamente (varios miembros, mismo equipo, empates, miembro sin pick). Front — render desde la query, fallback vacío si no hay picks.

---

### Sub-4 · Snapshots de standings (backend grande) → J1 + Mov + movimiento

- Nuevo modelo `GroupStandingSnapshot`:
  - `groupId: id`, `phaseOrder: integer`, `takenAt: datetime`, `rows: AWSJSON` (= `[{ userId, position, points }]`), `tournamentId`.
  - Identificador `[groupId, phaseOrder]`; índice `byGroup`. Group-readable.
- **Escritura:** cuando el scoring termina de procesar una jornada (todas las matches de una `Phase` quedan FINAL), un paso (en el flujo de `scoreMatch`/`score-group-stage` o un job) escribe el snapshot de cada grupo con la posición+puntos acumulados de cada miembro en ese corte.
- **Derivados (en `UserGroupTotal` o on-read en el front):**
  - **J1 (pts de la jornada)** = `points_actual − points_snapshotJornadaAnterior` por miembro.
  - **Mov** = `position_snapshotAnterior − position_actual` (↑ positivo).
  - Subtítulo "Tu posición" del KPI = mismo dato (subiste/bajaste N).
- Front: `group-detail` reemplaza los helpers placeholder `jornadaPts`/`movement` por estos datos (vía un resolver/query que entregue, por miembro, J1 y Mov del último corte) y la nota al pie deja de decir "ejemplo".

**Alternativa descartada:** calcular J1 on-the-fly desde picks por phase — imposible client-side (picks de otros = owner-auth). Snapshots además habilitan Mov (historial) y el evento "cambio de líder" de Sub-5.

**Tests:** back — generación de snapshot al cerrar una phase; cálculo de J1/Mov entre dos cortes (incluye empates de posición, miembro nuevo sin snapshot previo). Front — render de J1/Mov reales.

---

### Sub-5 · Feed de actividad (backend grande)

- Nuevo modelo `GroupActivity`:
  - `groupId: id`, `type: enum(JOINED | COMODIN | EXACT_SCORE | LEADER_CHANGE)`, `actorSub: id`, `payload: AWSJSON` (texto/metadata para render), `createdAt` (auto). Índice `byGroupRecent` (sortKey createdAt desc). Group-readable; create solo server-side (lambdas).
- **Emisores (4 eventos confirmados):**
  - **JOINED** — flujo de unirse al grupo (join/invite).
  - **COMODIN** — mutations de comodines (al usar ×2 / reasignar / etc.).
  - **EXACT_SCORE** — scoring, al detectar un pick con marcador exacto.
  - **LEADER_CHANGE** — paso de snapshot de Sub-4, cuando cambia el 1er lugar del grupo.
- Front: `right-rail` reemplaza `demoActivity` por `listByGroup` (recientes ~4), solo en `/groups/:id`.

**Tests:** back — cada emisor escribe una fila con el payload correcto; query recientes ordena desc. Front — render del feed, fallback vacío.

## Front afectado (resumen)

- `polla-app/src/app/features/groups/group-detail.component.ts` — Sub-1, Sub-2, Sub-4 (quitar `FALTA:` a medida que aterrizan).
- `polla-app/src/app/shared/layout/right-rail.component.ts` — Sub-3 (`demoChampDist`), Sub-5 (`demoActivity`).
- `polla-app/src/app/core/api/api.service.ts` — nuevas queries (champion distribution, snapshots/J1-Mov, activity, group con entryFeeAmount).

## Auth / privacidad

- Toda agregación cross-miembro corre en Lambda con lectura directa (salta owner-auth) y **solo expone agregados**, nunca picks individuales ajenas.
- `GroupStandingSnapshot`, `GroupActivity`, `entryFeeAmount` → legibles por miembros del grupo; escritura solo server-side / admin.

## Verificación end-to-end

- Backend: `npx jest --maxWorkers=2` en `polla-backend` (unit de lambdas/scoring/snapshots/agregación).
- Frontend: `npm test -- --watch=false` en `polla-app` (178+ verdes) + build watch limpio.
- Manual (con `npm run seed` + `sync-from-golgana`): abrir `/groups/:id`, verificar Jornada/Acierto reales (Sub-1), "$X por persona"+fecha (Sub-2), card de campeón con agregados (Sub-3), J1/Mov tras correr scoring de ≥2 jornadas (Sub-4), feed con eventos reales (Sub-5).
- Marcadores `FALTA:` / `demoChampDist` / `demoActivity` deben desaparecer del front al cerrar cada sub-proyecto.

## Notas

- El endpoint/apiKey de golgana (editorial) quedan fuera de este spec (ya cableado; su TODO es mover la config a env/proxy).
- Definir "jornada" = `Phase` order 1–8 en todo el cómputo (consistencia entre Sub-1 y Sub-4).
