# UX Walkthrough Synthesis — Docs 01-16

**Date**: 2026-05-28
**Source**: Subagent opus 4.7 dispatched to read docs 01-16 and synthesize against spec sub-projects A1-A8.
**Purpose**: Enriquecer el master plan spec con findings detallados que la síntesis comprimida no capturó.

---

## New bugs surfaced (NO en spec A3)

Agregar a A3 scope:
- **Score input `maxlength="1"`** en picks-list + pick-detail bloquea marcadores 10+. Fix: `maxlength="2"`.
- **Empty state `/groups` desktop sin CTAs visibles** ("Usa los botones de arriba" cuando design v3 los topnav buttons son `display:none`) — first-time desktop user perdido.
- **Fragment mismatch** notif resolver `#card-{comodinId}` vs comodines-list `id="card-pending-{id}"` — deep link silently fails.
- **gs-card flag-icons CSS directo** ignora crests custom admin (doc 04).
- **prizesTotalLabel** parsea solo montos numéricos — "iPhone 15" no suma (doc 09).
- **aria-hidden inconsistente** Cuenta vs Mi juego en `/profile` (P4 incomplete) (doc 14).
- **`<li (click)>` no semántico** en `/notificaciones` (doc 16).
- **Mode switch sin `role="tablist"`** en `/picks/bracket` (los otros segmented controls sí) (doc 05).
- **"R32" vs "16avos" naming mismatch** en `/picks/bracket` (doc 05).
- **Doble h1 cuando embed** `/picks/group-stage/predict` dentro de `/picks/group-stage` (doc 06).
- **Hero card sin clase mobile-only** ranking — bug visibilidad dual (doc 07).
- **scrollToTop ignora `prefers-reduced-motion`** (doc 07).
- **toUpperCase input handler cursor jumping** en /mis-comodines (doc 13).
- **Subject line del email ausente** en preview group-invite (doc 12).
- **Variant `--hit` ausente** en CSS pick-detail (solo `--miss` / `--none`).

## Cross-cutting patterns globales (G1-G20)

Patrones que aparecen en muchos docs y necesitan tratamiento explícito:

| ID | Pattern | Sub-proyecto que aplica | Notas |
|---|---|---|---|
| G1 | Page header con 4 stats duplicado en 4+ surfaces | A8b | Eliminar de `/picks/*`, conservar contextual donde aplique |
| G2 | 3 sistemas distintos de segmented controls (`.seg`, `.wf-seg`, `.tabs`) | A1 token + A8 | Sistema unificado con `role="tablist"` consistente |
| G3 | Empty states inconsistentes (5 estilos diferentes) | A1 component + A8 | Sistema único `.empty-block` con variants |
| G4 | CTAs "Crear grupo" → `/groups/new` vs `openCreate()` modal (5 surfaces inconsistentes) | A4 + A8 | Todos deben usar modal, eliminar links a /groups/new |
| G5 | "Unirme con código" CTA falta en empty states | A8b/A8c | Agregar como par de "Crear grupo" |
| G6 | Emoji icons pervasivos — **count real ~30-35 únicos** (no 50) | A1 | Inventario más preciso que en spec |
| G7 | Save state inconsistente entre flows de picks (group-stage es único con manual save) | A6 + A8b | Unificar a auto-save backend |
| G8 | Mode switch sin warning al cambiar | A8 | Confirmar antes de switch si dirty |
| G9 | Hardcoded localizations / `updatedAgo` español | A1 helper + A8 | `Intl.RelativeTimeFormat` |
| G10 | `/groups/new` standalone route — candidato a eliminar | A4 decisión | Verificar si se usa más allá de los 5 links |
| G11 | Loading states sin skeleton (ubiquitous) | A1 component + A8 | Skeleton reusable |
| G12 | Stats redundantes 4-up en muchos surfaces | A8 | Cada surface decide contextual vs duplicado |
| G13 | Inline styles ubiquitous (design system gap) | A1 + A8 | Completar tokens, sweep cleanup |
| G14 | Description del grupo no renderizado (B2 ya en spec) | A3 | Verificar también backend persistence |
| G15 | Notif kinds limitados bloquea promesas (JOIN, MATCH_LIVE, RANK_CHANGED, GROUP_ACTIVITY) | A6 priority | Alto leverage transversal |
| G16 | Hit targets pequeños / a11y gaps recurrentes | A1 token + A8 | Hit-target token + cada surface fix |
| G17 | Sin sort options en tablas grandes | A8 | Mejora consistente |
| G18 | `app-team-flag` vs CSS flag-icons inconsistency | A1 + A8 | Component shared |
| G19 | Routing duplicado / surfaces consolidables | A4 + A8 | 5 rutas candidatas |
| G20 | CanDeactivate guard inconsistente (solo group-edit lo tiene) | A8 | Pattern mecánico, replicar |

## Surface refactor complexity (A8 sub-fases)

Estimación complejidad por surface para sub-fases A8b/A8c:

**A8b (core features)**:
- 01 home: **L** (refactor jerarquía + estados condicionales + eliminar redundancias)
- 02 picks: **L** (corazón funcional, 2-template strategy)
- 03 pick-detail: **M** (eliminar dead UI + agregar contenido real backend)
- 04 picks-group-stage: **L** (drag/drop refactor + save consolidation + 3eros mobile)
- 05 picks-bracket: **L** (mobile layout overhaul + slot system + scoring table)
- 06 picks-group-stage-predict: **S** (es 90% duplicado, consolidación)
- 08 groups: **M** (CTAs siempre visibles, card design unificado con home)
- 09 group-detail: **L** (hero compactación + B2 description fix + transfer modal A2 + admin actions)
- 10 group-edit: **M** (image upload rich + bug fix description display)
- 11 group-prizes: **S** (form simple + CanDeactivate + dirty check)
- 12 group-invite: **M** (semantic fix + preview enrichment + backend JOIN notif)

**A8c (sub-features)**:
- 07 ranking: **M** (mobile/desktop layout + delta system + sort + dropdowns)
- 13 comodines: **L** (3 modales + colapsables + redeem consolidation)
- 14 profile: **M** (hero compactación + columnas reorganization + bug aria)
- 15 special-picks: **M** (search/filter + validation visible + mode switch + 96 buttons UX)
- 16 notifications: **M** (con backend kinds) / **S** (solo UI)

**A8d (micro-surfaces)** — already estimated S each.

## Recomendaciones para el plan

1. **Expandir A1 inventario emojis** — usar count real ~30-35 únicos.
2. **Agregar a A1**: skeleton component reusable, empty-block component reusable, segmented-control token system, hit-target token.
3. **Expandir A3 bugs** con la lista de 15 bugs nuevos surfaced arriba.
4. **Confirmar A4 cleanup expandido**: eliminar también `/groups/new` standalone (G10), evaluar `/sponsor-redeem` page, Material Symbols dead dependency.
5. **A8b reordenar prioridad** por complejidad — empezar con S (06, 11) para win rápido + Bug B2 fix (relacionado 09, 10).
6. **A6 backend expandir** con notif kinds JOIN/MATCH_LIVE/RANK_CHANGED/GROUP_ACTIVITY (G15).

---

Esta síntesis informa el plan A1 (Sprint 1 foundation). Sub-proyectos posteriores la referenciarán para mantener cobertura.
