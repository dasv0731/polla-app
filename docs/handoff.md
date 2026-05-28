# Handoff — Polla Mundialista (Design v3 + audit)

> Documento autocontenido para retomar trabajo en una sesión nueva sin necesidad de leer transcripts previos.

**Fecha del handoff:** 2026-05-28
**Branch / commit:** `main` @ `a809faa` (sincronizado con `origin/main`)
**Repos involucrados:**
- `polla-app/` (Angular 18 standalone, jest, este repo)
- `polla-backend/` (AWS Amplify Gen 2: AppSync, DynamoDB, Cognito, S3) — repo hermano
- `polla-public/` (Nuxt, landing pública) — repo hermano

---

## Meta del producto

Polla mundialista en español: usuarios pronostican el Mundial 2026 en grupos privados con sistemas de puntaje, comodines, picks especiales (campeón/sub/revelación) y trivia. Dos modos por grupo: SIMPLE (sin comodines, sin ranking global) y COMPLETE (todo el sistema). Admin global carga partidos/resultados; admins de grupo configuran premios y comodines.

## Meta de la sesión completada

Re-skin pixel-perfect del frontend al **Design v3** (handoff de Claude Design `polla-v3.html`): sidebar negro hover-expand, KPI strip, dark cards, comodines visuales, modales rediseñados, FAB de trivia con gradient + pulse, right-rail con próximo partido (countdown) + upcoming + news.

---

## Estado del código (al cierre)

**Implementado y mergeado a `main` + pusheado:**

1. **Tokens** (`src/styles/tokens.css`, `base.css`): `--color-primary-black: #0A0A0A`, `--color-ink-soft: #1A1A1A` (alias preservado), `--color-bg-cream: #F5F4F0`, `--color-line`. Body usa cream bg.
2. **Sidebar v3** (`shared/layout/sidebar.component.ts` con clase `.lsb`): negro `#0a0a0a`, fixed 64px → hover 200px, items Inicio/Picks/Grupos/Ranking/Mundial 2026 (+ Admin si admin) + bell + avatar. En mobile <768px se transforma en bottom-nav horizontal con icon+label. **Reemplaza** al `bottom-nav.component.ts` (borrado).
3. **Trivia toast banner** (`shared/layout/trivia-toast.component.ts`): banner negro top con dot pulse que aparece cuando hay trivia live. Consume `TriviaModalService.pendingCount` (signal expuesto nuevo, actualizado por effect en `trivia-popup`).
4. **Right-rail** (`shared/layout/right-rail.component.ts`): 3 bloques verticales con `.side > * { flex-shrink: 0 }` para evitar colapso. Dark card próximo partido + countdown ticker (1s) + 4 filas upcoming + news hero + 3 rows. **Fallback seed** activo cuando la API devuelve vacío (matches mock MEX vs ARG + 4 upcoming + 4 noticias mock — ver sección "Próximos pasos pendientes" para reemplazo).
5. **Shell** (`shell.component.ts`): flex column con grid anidado `.shell { grid-template-columns: 1fr 320px; gap: 24px; padding: 24px; max-width: 1480px; margin-left: 64px }`. Rail colapsa a 1 col en <1100px. Mobile <768px sin margin-left + padding-bottom para clearance del bottom-nav.
6. **Home** (`features/home/home.component.ts`): hero gradient compacto + KPI strip 5-up + picks pendientes dark block + grupos list + row(especiales|ranking) + comodines (solo COMPLETE).
7. **Modales + FAB**:
   - `group-actions-modals.component.ts` re-skin (backdrop blur, Bebas título, primary green CTA).
   - FAB trivia (`styles/app.css`) gradient pulse, en mobile sube por encima del bottom-nav.
   - `nav.component.ts` oculta `.app-topnav` (desktop) y `.app-tabbar` (mobile) — el sidebar v3 los absorbe; deja `.app-topbar` mobile-only (logo + bell + avatar).
8. **Asset**: `public/assets/news-placeholder.svg` (placeholder verde con leyenda GOLGANA).
9. **Limpieza CSS legacy**: borradas ~195 líneas del `@media (min-width: 992px) .app-shell { display:grid; grid-template-areas: ... }` y reglas de `.app-sidebar-wrap`, `.app-rail-wrap`, `.app-rail`, `.app-main` en `styles/app.css`. Esa CSS sobrescribía el shell v3 forzando layout viejo (era la causa raíz de la dark card colapsada a 1px).
10. **Skills bundle**: `npx skills add vercel-labs/agent-skills` instaló 8 skills en `.agents/skills/`. Copiadas a `~/.claude/skills/` (cross-project). `.agents/` + `skills-lock.json` gitignored.

**Auditoría completa de rutas + modales + flujo nuevo usuario hecha en chat.** Hallazgos en sección "Próximos pasos" abajo.

---

## Cambios fallidos / revertidos

1. **Hero "tira delgada" (single-row strip)**: intenté shrinkar el hero a ~50px de alto pensando que era el tamaño del texto. El user corrigió que era el contenedor padre. Revertido al diseño v3 original (avatar 54px, Bebas 24px, kicker + 2 líneas + alert + CTA).
2. **Comentar bloque CSS legacy en vez de borrarlo**: intenté envolver el `@media .app-shell { ... }` legacy en `/* ... */` para preservarlo. Falló porque ese bloque tiene comentarios anidados (`/* Cuando RightRailService... */`) que cerraban el outer comment prematuramente. Solución: borrado directo con `head -n N`.
3. **Shrinkar hero text para resolver "está muy grande"**: lo hice primero antes de diagnosticar root cause. El user pidió código de consola DevTools (lo escribí, pegó output) y reveló que el global `.hero { min-height: 640px }` de `components.css:573` (para el hero editorial de landing/torneo/equipo/jugador) cascadeaba al `.hero` del home v3 porque mi componente no override-aba `min-height`. **Fix correcto:** `min-height: 0; display: block; align-items: initial` en el rule del componente.

---

## Archivos editados en la sesión (major)

```
src/styles/tokens.css                                  M
src/styles/base.css                                    M
src/styles/app.css                                     M (−195 líneas legacy + FAB re-skin)
src/app/shared/layout/shell.component.ts               M (rewrite)
src/app/shared/layout/sidebar.component.ts             M (rewrite)
src/app/shared/layout/trivia-toast.component.ts        A (nuevo)
src/app/shared/layout/right-rail.component.ts          M (rewrite + seed fallback)
src/app/shared/layout/group-actions-modals.component.ts M (re-skin styles)
src/app/shared/layout/nav.component.ts                 M (overrides display:none topnav/tabbar)
src/app/shared/layout/bottom-nav.component.ts          D (borrado, absorbido por sidebar)
src/app/core/trivia/trivia-modal.service.ts            M (+pendingCount signal)
src/app/features/trivia/trivia-popup.component.ts      M (effect sync pendingCount)
src/app/features/home/home.component.ts                M (rewrite)
public/assets/news-placeholder.svg                     A (nuevo)
docs/superpowers/specs/2026-05-27-design-v3-redesign-design.md  A
docs/superpowers/plans/2026-05-27-design-v3-redesign.md         A
.gitignore                                             M (+.agents/ +skills-lock.json)
```

---

## Estado de git

- `main` local = `origin/main` = `a809faa` (sincronizados, sin commits pendientes).
- Branch `feature/design-v3-redesign` **borrado** local; nunca existió en remoto.
- Untracked en working tree: `design-input/` (handoff de Claude Design — no parte del repo, mantener fuera de commits).

## Estado de tests + build

- `npx tsc --noEmit -p tsconfig.app.json` — clean
- `npx ng build --configuration=development` — clean (1 warning preexistente en `group-invite-email.component.ts:95` sobre `??` redundante, no relacionado a esta sesión)
- `npx jest --no-coverage` — 40/40 tests pasando

## Skills disponibles

Copiadas a `~/.claude/skills/`:
- `vercel-composition-patterns`, `deploy-to-vercel`, `vercel-react-best-practices`, `vercel-react-native-skills`, `vercel-react-view-transitions`, `vercel-cli-with-tokens`, `vercel-optimize`, `web-design-guidelines`

**Relevancia para polla-app**: la mayoría son React-céntricas (este repo es Angular). Útiles potenciales: `web-design-guidelines` (genérica) y `deploy-to-vercel` (solo si se cambia de Amplify Hosting a Vercel).

---

## Próximos pasos pendientes (de la auditoría del 2026-05-28)

### 🚫 URLs huérfanas o inaccesibles desde la UI

| URL | Estado | Decisión sugerida |
|---|---|---|
| `/picks/by-group` (`PicksGrupoComponent`) | sin routerLink | decidir: agregar link en sidebar/topnav O borrar componente + ruta |
| `/picks/trivia/:matchId` (`TriviaComponent` full page) | sin trigger en UI (la trivia moderna usa modal global) | candidato a borrar (verificar primero que no se linkea desde notifs externas) |
| `/groups/new` (`GroupCreateComponent`) | sin routerLink (todo el flujo es modal `openCreate()`) | borrar componente + ruta, o mantener como fallback documentado |
| `/admin/bracket` (`AdminBracketComponent`) | ruta registrada pero NO está en admin nav actual | agregar al admin sidebar |
| `/admin/articles` (`AdminArticlesComponent`) | ruta registrada pero NO está en admin nav actual | agregar al admin sidebar |

### 🔁 Bucles/fricción detectados

- **`/groups/join/:code` sin returnUrl**: el `authGuard` redirige a `/login` si el user no está logueado, pero `login.component.ts` aterriza siempre en `/home` (línea ~175). El user pierde el código de invitación. **Fix:** soportar `returnUrl` query param en `authGuard` + `login.component`.

### 🧹 Limpieza candidatos

- **`RedeemModalComponent`** sigue importado en `shell.component.ts` pero el rail v3 ya no lo triggerea. Buscar otros call-sites (`RedeemModalService.open()`) — si no hay, removerlo del shell.
- **Tour overlay** (`features/onboarding/tour-overlay.component.ts:216`) referencia `.app-topnav a[href="/picks"]` para spotlight de un step. Ahora `.app-topnav` está `display: none`. El spotlight no encontrará el elemento — verificar si el tour rompe o cae con gracia.

### 📰 Seguimiento de noticias

- El right-rail muestra **noticias mock** cuando `listPublishedArticles` está vacío (titulares mundialistas inventados). Cuando el admin cargue Articles reales vía `/admin/articles`, las reales ganan automáticamente. **Pendiente:** decidir si conectar un feed RSS/news API externo en lugar de depender solo de Articles manuales del admin.

### 🎨 Posible polish QA visual

El user no reportó issues visuales adicionales después de los fixes finales, pero al reiniciar sesión vale validar:
- Sidebar hover-expand en desktop (transición fluida)
- Bottom-nav mobile (iconos + labels chicas en uppercase)
- Right-rail scrolling interno cuando contenido > viewport
- FAB de trivia sobre bottom-nav en mobile
- Modales con backdrop blur

---

## Pitfalls grabados en memory (para sesiones futuras)

`~/.claude/projects/.../memory/feedback_css_gotchas.md`:

1. **Angular view encapsulation NO aísla de CSS global**. Si un componente y `src/styles/*.css` definen la misma clase, ambas reglas cascadean; el componente gana en propiedades que declara, pero **hereda** del global las que NO declara. Antes de elegir un nombre corto (`.hero`, `.np`, `.com`), correr `grep -rEn "^\s*\.<class>\s*[\{,]" src/styles` para detectar colisión.
2. **Flex column con `max-height` aplasta hijos en vez de scrollear**. Default `flex-shrink: 1` achica items para "caber" antes de que `overflow-y: auto` se active. Fix: `.container > * { flex-shrink: 0 }`.

---

## Comandos útiles para retomar

```bash
# Working directory
cd 'C:\Users\Marke\Documents\Respaldo\polla mundialista\polla-app'

# Verificar estado
git status -sb
git log --oneline -5

# Levantar dev server (asegurarse de copiar amplify_outputs.json a src/ primero, está gitignored)
npm start

# Build + tests
npx ng build --configuration=development
npx jest --no-coverage
npx tsc --noEmit -p tsconfig.app.json

# Spec + plan del re-skin (para revisión)
# docs/superpowers/specs/2026-05-27-design-v3-redesign-design.md
# docs/superpowers/plans/2026-05-27-design-v3-redesign.md
```

## Recordatorios del usuario (memory persistente)

- **Modelo para subagentes**: opus (no sonnet) — preferencia guardada.
- **Layout del proyecto**: 3 repos hermanos, polla-app es la app Angular.
- **Setup local**: `src/amplify_outputs.json` está gitignored; copiarlo desde root del polla-app antes de `ng serve`.
