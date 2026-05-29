# UX Redesign Master Plan — Design Spec

**Date**: 2026-05-28
**Author**: Brainstorm session — alineamiento con user
**Status**: APPROVED design, pending writing-plans handoff
**Scope**: Implementación de hallazgos del walkthrough UX de 36 surfaces end-user (`docs/ux-redesign/01-36.md`)

---

## 1. Context

Se completó un walkthrough exhaustivo de 36 surfaces end-user (excluyendo admin family explícitamente) documentados en `docs/ux-redesign/01-36.md`. El walkthrough identificó:

- **Anti-patterns universales**: emojis como icons en ~50 instancias críticas (sidebar nav, modal closes, trivia FAB, banderas country, etc.)
- **4 sistemas visuales paralelos de modales**: `.picks-modal`, `.edit-profile-modal`, `.prefs-modal`, `.confirm-backdrop` — fragmentación visible
- **Branding chaos**: 4 variantes coexistiendo (Golgana, Polla Mundialista, GOLGANA · MUNDIAL 2026, POLLA)
- **Logo size variance**: 5 valores diferentes (28/32/40/sin valor) cross-surface
- **Tone fragmentation**: 12+ instancias voseo argentino + 1 instancia tú (picks-pending-banner)
- **Bugs latentes globales**: margin-left overlap sidebar hover, routerLinkActive overlap, B2 description no render, deep-link confirm sin password
- **Migration debt**: ~200 líneas zombie en nav.component.ts + auth-shell zombie + checkBracketReady dead code
- **Backend N+1**: redeem history, right-rail news, cross-route refetch
- **Data accuracy**: stats hardcoded en auth (2.4k/180/$15k), seed data fake en right-rail
- **Legal/Security gaps**: `href="#"` placeholders en login/register/forgot/group-join, external "Reglas" sin `rel="noopener"`

Este spec descompone los hallazgos en **8 sub-proyectos secuenciables** con dependencias claras, sub-agentes opus 4.7 paralelizados donde posible, y gates de aceptación verificables.

---

## 2. Goals

**Primary**:
- Convertir hallazgos del walkthrough en sub-proyectos implementables incrementalmente.
- Cada sub-proyecto independientemente deployable y verificable.
- Sub-agentes opus 4.7 paralelizan donde dependencias permiten.

**Secondary**:
- Foundation reutilizable (icon system + modal system + tokens) que reduce trabajo futuro.
- Cleanup de migration debt acumulado en design-v3 transition.
- Resolver bugs latentes documentados.

---

## 3. Decisiones de producto consolidadas

Estas decisiones se tomaron durante el brainstorm session y son load-bearing para el resto del plan:

### 3.1 Branding
**Decision**: Golgana brand global. "Polla Mundialista 2026" como **sub-feature/título de producto** dentro de Golgana.
**Impact**: sidebar, footer, auth headers, group-join, onboarding, edit-profile.

### 3.2 Tone
**Decision**: **tú** consistente cross-app ("Tienes", "Crea", "únete", "puedes").
**Impact**: ~50 strings voseo→tú sweep en auth, modales, errors, confirms, copy.

### 3.3 Stats auth surfaces
**Decision**: backend lambda `getPublicStats` con counts agregados (`totalUsers`, `totalGroups`, `totalPrizesAccrued`). **NO eliminar** el bloque stats; conectar a backend real.
**Impact**: A6 (backend) + A7 (auth surfaces).

### 3.4 News block right-rail
**Decision**: mantener seed data hardcoded en frontend por ahora. **Futura integración con polla-public** (otro repo) cuando esté listo. Article model + admin-articles UI se eliminan completamente de polla-app.
**Impact**: A4 (cleanup admin-articles) + A8d (right-rail conserva seed pero limpia el código).

### 3.5 Mobile navigation
**Decision**: bottom-nav 5 items fijos (Inicio + Picks + Grupos + Ranking + **Más**) + "Más" abre sheet con (Mundial 2026 + Comodines + Notificaciones + Perfil + Admin si aplica).
**Impact**: A4 (recuperar features sidebar) + A8a (sidebar mobile).

### 3.6 Sub-agentes
**Decision**: siempre opus 4.7 cuando dispatcheo (de auto-memory `feedback_agent_model.md`).
**Impact**: cada Agent tool call durante implementación.

---

## 4. Approach

**Bottom-up infrastructure-first** con paralelización máxima donde dependencias permiten.

8 sub-proyectos:
- A1 Foundation (tokens + icons)
- A2 Modal system unificado
- A3 Bugs globales
- A4 Migration debt cleanup
- A5 Tone + branding + legal sweep
- A6 Backend RPCs (separado en polla-backend repo)
- A7 Auth family redesign
- A8 Surfaces remaining (sub-fases a/b/c/d)

---

## 5. Sub-proyectos detallados

### A1 · Design tokens + SVG icon system

**Goal**: Foundation que todos los demás consumen.

**Scope**:
- Design tokens CSS variables en `src/styles/_tokens.css`:
  - `--sidebar-w: 64px` (single var, sidebar muta value en hover a 200px — consumido por shell + trivia-toast en A3)
  - `--logo-size-md: 32px` (decisión single value, ajustable)
  - `--modal-radius: 16px`
  - `--modal-padding: 28px`
  - `--modal-backdrop-opacity: 0.75`
  - `--modal-backdrop-blur: 6px`
  - Scale spacing (4/8/12/16/24/32)
  - Z-index scale (overlay/modal/dropdown/tooltip)
  - Animation durations (`--anim-fast: 150ms` / `--anim-base: 200ms` / `--anim-slow: 300ms`)
- SVG icon system: **Lucide** (más options + smaller bundle vs Heroicons).
- Componente `<app-icon name="bell" size="md" />` con size variants (sm/md/lg).
- **Inventory matrix** `docs/ux-redesign/icon-inventory.md` documenta cada emoji a reemplazar + surface origen + nombre Lucide propuesto.

**Docs referenced**: 17-36 (todos referencian emoji icons + logo sizes).

**Dependencies**: NONE (foundation layer).

**Verification / acceptance gate**:
- [ ] `_tokens.css` con todos los tokens documentados.
- [ ] Lucide integrada via npm.
- [ ] `<app-icon>` renderiza en demo route `/dev/icons` (development only).
- [ ] Inventory matrix completo con ~50 emojis mapeados.
- [ ] CI: `ng build --configuration=production` sin warnings nuevos.
- [ ] No tocan surfaces existentes todavía (solo infra).

**Risk + rollback**: revert PR. No tiene impacto runtime (infra solo).

**Size**: ~1 semana.

---

### A2 · Modal system unificado

**Goal**: 4 sistemas paralelos → 1 `<app-modal>`.

**Scope**:
- Componente `<app-modal>` con slots: header, body, footer + size variants sm/md/lg.
- Animation entrada (scale+fade) y salida (faster ~150ms).
- A11y completo: `cdkTrapFocus` + `cdkTrapFocusAutoCapture` + Escape + `role=dialog` + `aria-labelledby` + `aria-describedby` (donde aplique).
- Backdrop blur+opacity tokens (consume A1).
- **Initial focus configurable**: `initialFocus: 'cancel' | 'confirm'` (default `'cancel'` para destructive).
- **Refactor 8 modales**:
  1. group-actions modal Crear grupo (`group-actions-modals.component.ts`)
  2. group-actions modal Unirme (`group-actions-modals.component.ts`)
  3. trivia-popup modal (`trivia-popup.component.ts`)
  4. randomizer modal (`randomizer-modal.component.ts`)
  5. redeem modal (`redeem-modal.component.ts` + `sponsor-redeem.component.ts` inside)
  6. edit-profile modal (`edit-profile-modal.component.ts`)
  7. preferences modal (`preferences-modal.component.ts`)
  8. transfer-admin modal (inline en `group-detail.component.ts`)
- ConfirmDialog ya tiene A11y benchmark — propagar `aria-describedby` a otros.

**Docs referenced**: 22, 23, 24, 25, 26, 27, 28, 29, 34.

**Dependencies**: A1.

**Verification / acceptance gate**:
- [ ] `<app-modal>` component existe con slots + animations + A11y.
- [ ] 8 modales consumen `<app-modal>` (visual audit).
- [ ] Backdrop blur+opacity consistente cross-modal.
- [ ] Tests E2E existentes (que abren modales) siguen pasando.
- [ ] Screenshots before/after de los 8 modales en PR description.

**Risk + rollback**: revert PR. Modales viejos se restauran. Riesgo medio porque toca surfaces críticas — considerar feature flag opcional.

**Size**: ~1 semana.

---

### A3 · Bugs globales

**Goal**: Fix bugs latentes documentados que afectan multiple surfaces.

**Scope**:

**3.1 margin-left overlap sidebar hover**:
- Shell `.shell { margin-left: 64px }` + trivia-toast `.trivia-toast { margin-left: 64px }` hardcoded.
- Sidebar hover expande a 200px → main NO se mueve → overlap 136px visible.
- **Fix**: CSS variable `--sidebar-w` consume en shell + trivia-toast. Sidebar emite (cambia value en hover). Shell + toast consume reactivamente.

**3.2 routerLinkActive overlap sidebar**:
- "Mis picks" → `/picks` + "Mundial 2026" → `/picks/group-stage/predict`. Ambos active en `/picks/group-stage/predict` (prefix matching).
- **Fix**: agregar `[routerLinkActiveOptions]="{exact:true}"` a "Mis picks" O cambiar wording/url "Mundial 2026" (decisión en spec).

**3.3 B2 description no render**:
- Modal Crear grupo (Fase B) agregó campo `description` que se guarda en backend pero **NO se renderiza** en `/groups/:id`.
- **Fix**: render description en group-detail hero section.

**3.4 Deep-link confirm sin password (register)**:
- `?email=X&confirm=1` flow desde login (UserNotConfirmedException) aterriza en step confirm.
- `submitConfirm` post-OTP hace `auth.login(email, password)` con password='' (no en memory) → falla silenciosamente.
- **Fix options**:
  - **A**: agregar input password al step 'confirm' cuando viene de deep-link (detect via query param).
  - **B**: cambiar handler login para mostrar modal "Tu cuenta no está confirmada. ¿Reenviar código?" en lugar de redirect a register.
  - **Recommendation**: B (mantiene login con password en form).

**3.5 Link "Ir a mis terceros" en /picks/bracket empty state**:
- Apunta a `/profile/special-picks` (incorrecto).
- **Fix**: `/picks/group-stage?view=pred`.

**Docs referenced**: 30, 31, 33 (overlap), 30 (routerLinkActive), 09, 10, 22 (B2), 17, 18 (deep-link), 05, 06 (bracket link).

**Dependencies**: NONE (paralelo con A2, A4).

**Verification / acceptance gate**:
- [ ] E2E test sidebar hover: no overlap visible (screenshot diff).
- [ ] E2E sidebar nav: solo 1 item active simultaneously en `/picks/group-stage/predict`.
- [ ] Manual: crear grupo con descripción → `/groups/:id` muestra description.
- [ ] E2E register UserNotConfirmedException flow funcional (path elegido en fix B).
- [ ] `/picks/bracket` empty state link → `/picks/group-stage?view=pred`.
- [ ] Regression: tests existentes verdes.

**Risk + rollback**: revert PR. Bugs son isolated.

**Size**: ~3 días.

---

### A4 · Migration debt cleanup

**Goal**: Eliminar zombie code + recuperar features perdidos.

**Scope**:

**4.1 Nav.component.ts zombie cleanup**:
- 130 líneas markup topnav desktop (`display: none !important`)
- 30 líneas tabbar mobile (`display: none !important`)
- ~80 líneas CSS asociado
- Solo conservar topbar mobile + service hooks (`unreadCount` subscription, dropdowns logic si se usa en sidebar).

**4.2 Recuperar features perdidos en sidebar**:
- **Bell con badge unread count** en sidebar bottom area (gap actual — solo en topbar mobile).
- **User dropdown bottom area** (notif/perfil/logout) o equivalente accordion.
- **Per-group ranking dropdown** (nuevo design — acordeón sidebar O en `/ranking` landing). Pattern brillante perdido en zombie.

> **Per-group ranking dropdown decision (A4 implementation, 2026-05-28)**: NO se recupera al sidebar (espacio constreñido). La feature vive nativamente en `/ranking` page tab "Mis grupos" (ya implementada — filtra el leaderboard a usuarios que comparten grupos contigo) + en `/groups/:id` que tiene su propia sección de ranking interno del grupo. El sidebar queda simple. Refs: `src/app/features/ranking/ranking.component.ts` scope='mis-grupos'.

**4.3 Eliminar auth-shell.component.ts**:
- NO usado actualmente — 3 auth surfaces implementan layout inline.
- **Default**: eliminar archivo + cualquier referencia.
- (Alternativa: refactor auth surfaces para consumirlo — fuera de scope A4, considera A7).

**4.4 Eliminar checkBracketReady dead code**:
- En `sidebar.component.ts` línea 219-236.
- 2 API calls (`listMatches + listPhases`) en cada mount sin uso en template.

**4.5 Eliminar admin-articles UI completamente**:
- Fase D pendiente — verificar todas las referencias (file + route + sidebar entry).

**Docs referenced**: 30, 31, 32, 36.

**Dependencies**: NONE (paralelo con A2, A3).

**Verification / acceptance gate**:
- [ ] `nav.component.ts` < 200 líneas (vs 393 actual).
- [ ] Sidebar bottom area incluye bell con badge unread.
- [ ] Per-group ranking dropdown recuperado en algún lugar.
- [ ] `grep "auth-shell\|checkBracketReady" src/app` = 0 matches (asumiendo eliminación).
- [ ] admin-articles UI completamente eliminada.
- [ ] Bundle size delta documented en PR description.
- [ ] Tests existentes verdes.

**Risk + rollback**: revert PR. Si auth-shell decisión cambia mid-stream, ajustable.

**Size**: ~3 días.

---

### A5 · Tone + branding + legal sweep

**Goal**: Sweep cross-app de las decisiones de producto consolidadas (3.1, 3.2).

**Scope**:

**5.1 Tone sweep voseo → tú**:
- Lista de strings a reemplazar (exhaustiva, expandible durante implementación):
  - `creá` → `crea`
  - `unite` → `únete`
  - `Tenés` → `Tienes`
  - `tus panas` → `tus panas` (mantener — es regional pero ok)
  - `Vos` → `tú` (si es vocativo)
  - `Querés` → `Quieres`
  - `Pickeá` → `Elige`
  - `Pedile` → `Pídele`
  - `Pegá` → `Pega`
  - `Vas a` → `Vas a` (mantener — futuro neutro)
  - `Podés` → `Puedes`
  - `Empezá` → `Empieza`
  - `apagás` → `apagas`
  - `tipeas` → `tipeas` (mantener — es regional pero ok)
  - `Usá` → `Usa`
  - `encontrás` → `encuentras`
- Sweep file by file con manual review (no blind search/replace — context matters).

**5.2 Branding sweep**:
- Sidebar logo + text: "POLLA" → "Polla Mundialista 2026" sub-title.
- Auth brand panel desktop: "GOLGANA · MUNDIAL 2026" → "Golgana" + "Polla Mundialista 2026" sub-title.
- Mobile heads auth: "Polla Mundialista" mobile-head → "Golgana" + sub-title.
- Footer text: ya dice "Polla Mundialista — sub-módulo de Golgana" (OK).
- Group-join header: logo "Golgana" + alt consistent.
- Onboarding: brand name si visible.

**5.3 Logo size unificado**:
- Decisión single value (default propuesto: 32px).
- Aplicar consistente: sidebar (28px → 32px), auth login (32px ✓), register (40px → 32px), forgot (32px ✓), group-join (sin valor → 32px), onboarding (28px → 32px), footer (size adecuado).

**5.4 Links Términos/Privacidad reales**:
- `href="#"` → `https://polla.golgana.net/terminos` y `https://polla.golgana.net/privacidad`.
- `rel="noopener"` en todos los external.
- Affected surfaces: login terms checkbox (no terms in login actually), register terms checkbox, group-join footer, auth-shell footer (si conservado).

**Docs referenced**: TODOS (sweep cross-cutting).

**Dependencies**: NONE (paralelo con A1, A2, A3, A4 — recomendable post-A1 para usar tokens logo).

**Verification / acceptance gate**:
- [ ] `grep` voseo strings: 0 matches (lista exhaustiva).
- [ ] `grep 'href="#"' src/app` = 0 matches.
- [ ] Logo size: 1 token usado consistente (auditoría visual manual cross-surface).
- [ ] Branding visible audit: sidebar + auth + footer + group-join consistent.
- [ ] Links Términos/Privacidad: rel="noopener" verificado en accessibility tree.
- [ ] Tests existentes verdes (sin regression de copy).

**Risk + rollback**: revert PR. Es copy-only + branding, low risk.

**Size**: ~1 semana.

---

### A6 · Backend RPCs (polla-backend repo separado)

**Goal**: Reducir N+1 + agregar lambdas requeridas por decisiones producto.

**Scope**:

**6.1 `previewJoinCode` expanded**:
- Agregar campos: `createdAt`, `maxMembers`, `tournamentCode`.
- Currently no expuestos → group-join muestra `—` siempre + MAX_MEMBERS=30 hardcoded en frontend + "WC26" hardcoded.

**6.2 `getMyRightRail` consolidated**:
- 1 endpoint que retorne shape consolidado:
```typescript
{
  nextMatch: NextMatchVm | null;
  upcomingPicks: UpcomingPickRow[];
  news: NewsItemVm[];  // imageUrl pre-resolved long-lived
}
```
- Vs actualmente 5+ calls (listMatches + listTeams + myPicks + listPublishedArticles + N×getUrl).

**6.3 `getPublicStats` lambda**:
- Aggregado público:
```typescript
{
  totalUsers: number;
  totalGroups: number;
  totalPrizesAccrued: number;
}
```
- Cacheable 1h (refresh background).
- Consumido por auth brand panel.

**6.4 `leaveGroup` mutation**:
- Documentado pendiente (memoria del walkthrough).

**6.5 `transferGroupAdmin`** (verify existing):
- Post Fase B debería existir. Confirmar.

**6.6 `RankSnapshot` model + weekly job**:
- Documentado pendiente (memoria walkthrough).

**6.7 Notif kinds expandidos**:
- JOIN, MATCH_LIVE, RANK_CHANGED, GROUP_ACTIVITY (memoria walkthrough).

**6.8 Avatar URL persistente**:
- Backend retorna long-lived signed URL vs `getUrl({ expiresIn: 3600 })` actual.

**Docs referenced**: 20, 32, 17-19, 22, 26.

**Dependencies**: NONE (separado en polla-backend repo).

**Verification / acceptance gate**:
- [ ] Cada lambda nueva tiene test de integración (sandbox call → expected response shape).
- [ ] `previewJoinCode` retorna campos nuevos en sandbox.
- [ ] `getMyRightRail` retorna shape consolidado en sandbox.
- [ ] `getPublicStats` retorna shape esperado.
- [ ] `leaveGroup`, `transferGroupAdmin` verified.
- [ ] `RankSnapshot` model + weekly job programado.
- [ ] Notif kinds expandidos en enum.
- [ ] Amplify Gen 2 deploy a sandbox sin errors.

**Risk + rollback**: PR backend permite rollback isolated. Frontend NO consume hasta A7/A8.

**Size**: ~2 semanas (en repo polla-backend, separado).

---

### A7 · Auth family redesign

**Goal**: 5 auth surfaces consumiendo toda la nueva infra.

**Scope**:

**7.1 login (login.component.ts)**:
- Consume `<app-modal>` si aplica (none currently — login no tiene modal).
- SVG eye toggle (reemplaza 👁/👁️‍🗨️).
- Brand panel con stats reales (consume `getPublicStats` de A6).
- Links Términos reales (A5).
- Tone tú (A5).
- Logo size unificado (A5).
- UserNotConfirmedException handler decisión (A3 path B): modal "Reenviar código" en lugar de redirect.

**7.2 register (register.component.ts)**:
- SVG eye toggle.
- SVG icons OTP feedback (✓ disponible, ✗ en uso, verificando…).
- `<app-otp-input>` shared component (extraer de duplicación con forgot-password).
- Auto-submit OTP al 6º dígito.
- Cooldown escalado (60→120→300s).
- Handle suggestions cuando taken.
- Fix deep-link confirm bug (A3 path B aplica).
- Tone + branding (A5).

**7.3 forgot-password (forgot-password.component.ts)**:
- Toggle eye (consistency con register/login).
- `PasswordRulesListComponent` compartido (consistency con register).
- `<app-otp-input>` shared (eliminar duplicación).
- returnUrl propagation (currently missing — gap walkthrough).
- "Confirma password" segundo campo (mitigar typo invisible en surface más crítico).
- Toast success post-reset antes del redirect.

**7.4 group-join (group-join.component.ts)**:
- SVG icons + flag-icons consistency (verificar uso vs emoji).
- maxMembers desde backend (consume A6 `previewJoinCode` expanded).
- Spinner loading (vs solo "Validando código…" texto).
- tournament code dynamic vs "WC26" hardcoded.
- "Copiar código" button.
- Recovery UX código inválido (sugerir similar, soporte link).

**7.5 onboarding (onboarding.component.ts)**:
- SVG hero ilustración o brand graphic (reemplaza ⚽ emoji).
- SVG icons CTAs (＋ → unicode).
- Logo size unificado (28px → 32px token A5).
- Brand title consistente (no solo logo).
- Mobile head diferenciado.
- Tone tú (A5).

**7.6 Brand panel unificado**:
- Component shared `<app-auth-brand-panel>` consumido por login + register + forgot.
- Visual: Golgana logo + "Polla Mundialista 2026" sub-title + tagline + sub + stats reales + footer legal real.

**Docs referenced**: 17, 18, 19, 20, 21.

**Dependencies**: A1 + A2 + A3 + A5 + A6 (parcial — `getPublicStats` ready, `previewJoinCode` expanded ready).

**Verification / acceptance gate**:
- [ ] 5 auth surfaces refactorizados consumiendo infra.
- [ ] Brand panel idéntico cross-surfaces (login + register + forgot).
- [ ] E2E completo: register form → confirm OTP → onboarding → home.
- [ ] E2E login → home (incluyendo UserNotConfirmedException path).
- [ ] E2E forgot → reset → auto-login → home (incluyendo returnUrl propagation).
- [ ] E2E group-join deep-link → login → register (si no auth) → onboarding skip → group-join → `/groups/:id`.
- [ ] Stats reales rendered en brand panel (consume `getPublicStats`).
- [ ] Visual audit screenshots cross-platform (desktop + mobile).

**Risk + rollback**: PR auth family. Riesgo alto porque auth es crítico — considerar feature flag opcional.

**Size**: ~2 semanas.

---

### A8 · Surfaces remaining

**Goal**: Aplicar nueva infra al resto de surfaces.

**Scope** (organizado por sub-fases):

**A8a · Sidebar mobile (3-4 días)**:
- Bottom-nav 5 items fijos: Inicio + Picks + Grupos + Ranking + **Más**.
- "Más" abre sheet (animación slide-up) con: Mundial 2026 + Comodines + Notificaciones + Perfil + Admin (si aplica).
- Topbar mobile actualizado: bell con badge + avatar + sync pill.
- safe-area-inset left/right landscape.
- E2E mobile navigation funcional.

**A8b · Core features — home + picks + groups (2 semanas)**:
- home: tokens + icons + tone + branding.
- picks (lista + bracket + group-stage + group-stage-predict + pick-detail): tokens + icons + tone.
- Bug fix link "Ir a mis terceros" (A3).
- groups (lista + detail + edit + prizes + invite): tokens + icons + tone.
- Bug fix B2 description render (A3).
- CanDeactivate guard agregar en group-prizes (gap walkthrough doc 11).

**A8c · Sub-features (1-2 semanas)**:
- ranking: tokens + icons + tone + delta system honesty mencionado.
- comodines: SVG icons 9 tipos (design por tipo) + fix fragment mismatch notification deep-link (`#card-{id}` vs `card-pending-{id}`).
- profile: tokens + icons + tone + **flag-icons consistency** (vs emoji actual).
- special-picks: SVG icons + **search/filter** para 96 buttons (UX gap documented).
- notifications: tokens + icons + tone + fix `<li (click)>` anti-pattern (a `<button>`) + fix fragment mismatch.

**A8d · Micro-surfaces (1 semana)**:
- picks-pending-banner: SVG close + tone + CSS variable `--sidebar-w` consume (A3) + CTA contextual al match más urgente.
- trivia-toast: SVG icon + `prefers-reduced-motion` respect + `<button>` accessible + dismiss button + CSS variable `--sidebar-w` (A3).
- footer: SVG icons + tone + branding (A5) + `rel="noopener"` en external Reglas.
- right-rail: consume `getMyRightRail` consolidated (A6) + SVG icons + Intl Pad-zero days + role="timer" + skeleton loading.

**Docs referenced**: 01-16, 32, 33, 35, 36.

**Dependencies**: A1 + A2 + A3 + A4 + A5 + A6.

**Verification / acceptance gate por sub-fase**:
- [ ] Sub-fase A8a: E2E mobile nav funcional, sheet "Más" abre/cierra con animación.
- [ ] Sub-fase A8b: bug B2 verified, link bracket verified, CanDeactivate group-prizes verified.
- [ ] Sub-fase A8c: comodines icons + search special-picks + flag-icons profile + fragment fix notif.
- [ ] Sub-fase A8d: right-rail call count baja (consume getMyRightRail), banner + toast usan SVG, footer rel="noopener" verified.
- [ ] **Cross-cutting final audit** post-A8d:
  - `grep` emojis residuales en .ts/.html = 0 (excluyendo strings de copy donde aplique semánticamente).
  - `grep` voseo strings residuales = 0.
  - `grep 'href="#"'` = 0.
  - `grep 'console.error\|console.warn'` (replace con telemetry placeholder o eliminar).
  - Bundle size delta documentado.
  - Lighthouse a11y score ≥ 90 en 5 surfaces clave (home + picks + groups + login + comodines).

**Risk + rollback**: por sub-fase para isolar. A8a-d pueden mergear independientes.

**Size**: ~4-6 semanas.

---

## 6. Dependency graph

```
                ┌─────────────────────┐
                │ A1 · Tokens + Icons │ ← Foundation
                └──────────┬──────────┘
                           │
                ┌──────────┴──────────┐
                ▼                     ▼
        ┌───────────────┐   ┌─────────────────┐
        │ A2 · Modal sys │   │ A5 · Tone+brand │
        └───────┬───────┘   │     sweep       │
                │           └─────────────────┘
                │                     │
                │     ┌───────────────┘
                │     │
┌──────────────┐│     │  ┌─────────────────┐
│ A3 · Bugs    ││     │  │ A6 · Backend RPC│ (polla-backend repo)
│   globales   ││     │  │                 │
└──────┬───────┘│     │  └────────┬────────┘
       │        │     │           │
       │  ┌─────┘     │           │
       │  │           │           │
       ▼  ▼           ▼           ▼
┌─────────────────────────────────────────┐
│  A7 · Auth family redesign              │
└──────────────────┬──────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────┐
│  A8 · Surfaces remaining (a/b/c/d)      │
└─────────────────────────────────────────┘

Independent:
┌──────────────────────────────────────┐
│ A4 · Migration debt cleanup          │ ← paralelo a A1, A2, A3, A5
└──────────────────────────────────────┘
```

### Sprint planning

| Sprint | Tracks paralelos | Gate |
|---|---|---|
| Sprint 1 (sem 1-2) | A1 + A3 + A4 + A6 start | A1+A3+A4 merged. A6 in progress. |
| Sprint 2 (sem 3) | A2 + A5 | A2+A5 merged. A6 finishing. |
| Sprint 3 (sem 4-5) | A7 + A6 finish | A7 merged. E2E auth completo. |
| Sprint 4-7 (sem 6-10/12) | A8a → A8b → A8c → A8d | Cada sub-fase merge + verification. |

**Critical path**: A1 → A2 → A7 → A8a = **8-9 semanas**.
**Total optimista paralelizado**: **10-12 semanas**.
**Total pesimista secuencial**: ~15-18 semanas.

### Sub-agent dispatch strategy (opus 4.7)

- **Sprint 1**: 3-4 sub-agentes opus 4.7 paralelos (1 mensaje, multiple Agent tool calls). A1 + A3 + A4 + A6.
- **Sprint 2**: 2 sub-agentes paralelos. A2 + A5.
- **Sprint 3**: A7 = 1 coordinador sub-agente O 5 sub-agentes (1 por auth surface), depende de scope.
- **Sprint 4-7**: A8 = 1 coordinador por sub-fase (A8a, A8b, A8c, A8d) O paralelos donde no haya conflict.

---

## 7. Constraints

- **Sub-agentes opus 4.7 siempre** (auto-memory `feedback_agent_model.md`).
- **Cada sub-proyecto independientemente deployable**. No half-merged.
- **CanDeactivate guards no se rompen** durante refactor.
- **`src/amplify_outputs.json` está gitignored** (memoria proyecto). Sub-agente backend asume verifica local copy.
- **Tests existentes no rompen** — cada gate de aceptación incluye "regression tests verdes".
- **No introducir nuevas dependencias** salvo Lucide. Cualquier otra dep se discute primero.
- **CSS gotchas** (de memoria): global class collisions bypassean view encapsulation Angular. Clases nuevas namespaceadas con `--app-` o `.app-`. Mantener pattern `flex-shrink: 0` en flex containers para evitar aplastamiento.

---

## 8. Non-goals (explícitamente fuera de scope)

- **Admin family** completa (16+ surfaces admin) — user explícito.
- **Backend Amplify Gen 2 schema changes** más allá de lambdas/mutations enumeradas en A6.
- **Features nuevos**:
  - Dark mode toggle
  - SSO Google/Apple/Facebook
  - Keyboard shortcuts global
  - Drawer search global
  - Smart randomizer FIFA ranking
  - Streak counter trivia
  - Multi-tournament support
  - Geolocation default country
  - Cross-device prefs sync
  - QR scan code redeem
  - Confetti animations
  - Sound notifications
  - Dark mode toggle
- **Polla-public integration** news block — espera polla-public ready. Seed mantenido por ahora.
- **Performance optimization profunda** más allá de N+1 evidente (Lighthouse audits, code splitting agresivo).
- **Mobile app nativo** (React Native / Capacitor).
- **Telemetry/analytics platform** — solo se notan `console.warn/error` a eliminar.

Todos estos documentados en docs walkthrough pero **deferred Q3/Q4**.

---

## 9. Risks + mitigations

| Risk | Mitigation |
|---|---|
| **A2 (modal refactor) rompe modales críticos** (trivia + group create). | Feature flag opcional. E2E tests pre/post. Rollback PR si regression. |
| **A6 backend deploy fails** durante implementación. | A6 en repo separado. Sandbox test antes. A7+A8 mock backend si lambdas no listas. |
| **A5 sweep introduce typos** en copy crítico (auth errors). | Manual review post-sweep. E2E auth flows verifican mensajes. |
| **A4 cleanup elimina features que algún surface usaba silencioso**. | grep cross-app antes de eliminar. Si auth-shell usado en surface no-walkthrough-ed, no eliminar. |
| **A8 scope creep** — surfaces nuevas aparecen mid-work. | Cada sub-fase tiene gate. Surface emerge mid-fase → backlog A8e. |
| **Sub-agente opus 4.7 falla en task complejo** (A2 o A7). | Coordinador agente. Sub-tasks granulares (1 modal a la vez en A2, 1 surface a la vez en A7). |
| **CSS global collision** introduce regression. | Prefix `app-`. View encapsulation activa en components scoped. |

---

## 10. Final verification cross-project

Post-A8 audit:

- [ ] `grep` emojis en .ts/.html = 0 (excluyendo strings de copy donde semánticamente OK).
- [ ] `grep` voseo strings = 0.
- [ ] `grep 'href="#"'` = 0.
- [ ] `grep 'console.error\|console.warn'` = 0 (reemplazadas o eliminadas).
- [ ] `grep '!important'` ≤ baseline pre-refactor.
- [ ] Bundle size delta documented (debería bajar por A4 cleanup + Lucide tree-shaking).
- [ ] Lighthouse a11y score ≥ 90 en 5 surfaces clave: home + picks + groups + login + comodines.
- [ ] Visual audit final: branding consistent + logo size consistent + modales consistent + tone consistent.

---

## 11. Memory updates a aplicar (post-approval)

Después de approval del spec, actualizar memoria con decisiones de producto:

- `project_decisions.md` (nuevo): branding=Golgana, tone=tú, stats=real backend, news=hardcoded for now, mobile nav=bottom 5+sheet.

Esto asegura que conversaciones futuras referencian las decisiones sin necesidad de re-derivarlas.

---

## 12. Next step

Post-approval de este spec por el user, **invocar writing-plans skill** para crear implementation plan detallado por sub-proyecto (A1-A8) con tasks granulares, file paths específicos, y dispatch sequence opus 4.7 sub-agentes.

**NO se implementa nada todavía** — este spec define QUÉ y CÓMO. El plan define el ORDEN granular de tasks + dispatch.
