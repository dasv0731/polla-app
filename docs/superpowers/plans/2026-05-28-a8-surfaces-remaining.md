# A8 · Surfaces Remaining Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **All sub-agent dispatches MUST use opus 4.7** per project memory.

**Goal:** Refactorizar los ~30 surfaces restantes (no auth, no admin) consumiendo toda la nueva infra de Sprints 1-3. Surfaces split en 4 sub-fases por complejidad + criticidad. Cada sub-fase es independientemente mergeable.

**Architecture:** Sub-fases ordenadas por leverage:
- **A8a** (Sprint 4): sidebar mobile drawer + sheet "Más" — surface más visto, alta prioridad
- **A8b** (Sprint 5): core features (home + picks + groups) — funcionalidad principal
- **A8c** (Sprint 6): sub-features (ranking + comodines + profile + special-picks + notifications)
- **A8d** (Sprint 7): micro-surfaces (picks-pending-banner + trivia-toast + footer + right-rail)

Cada surface refactor sigue mismo pattern: tokens A1 + icons SVG + tone+branding A5 + sweep cleanup + tests existentes pasan. Final cross-cutting audit garantiza 0 emojis, 0 voseo, 0 href="#", branding consistent.

**Tech Stack:** Angular 18 standalone + signals. Tests existentes (Jest) deben seguir verdes; nuevos tests donde aplique.

---

## Dependencies

**Required mergeado**:
- A1: Tokens + `<app-icon>` + `<app-empty-block>` + `<app-skeleton>`
- A2: `<app-modal>` (para modales internos en surfaces)
- A3: bug fixes globales aplicados
- A4: navegación recovered (bell badge, user dropdown)
- A5: tone+branding+legal sweep
- A6: backend RPCs (right-rail consume getMyRightRail)

---

## Sub-fase A8a · Sidebar mobile (drawer + sheet "Más")

**Goal**: implement decision producto: bottom-nav 5 items + "Más" sheet.

**Files**:
- Modify: `src/app/shared/layout/sidebar.component.ts` — mobile bottom-nav 5 items
- Create: `src/app/shared/layout/more-sheet.component.ts` — slide-up sheet con items extra
- Possibly: `src/app/shared/layout/nav.component.ts` — topbar mobile hamburger trigger

### Tasks

1. **Sidebar mobile bottom-nav**: 5 items fijos (Inicio + Picks + Grupos + Ranking + **Más**). Mantener safe-area-inset.
2. **`<app-more-sheet>` component**: slide-up sheet from bottom. Slots para items (Mundial 2026 + Comodines + Notificaciones + Perfil + Admin si aplica). A11y completo (focus trap + Escape).
3. **Topbar mobile**: agregar trigger button to open sheet (hamburger or "Más" mini-button).
4. **A8a Final audit**: E2E mobile navigation funcional + manual smoke pending.

**Acceptance**:
- [x] 5 items en bottom-nav.
- [x] Sheet abre/cierra con animación.
- [x] Admin solo visible en sheet si isAdmin.
- [x] safe-area-inset respetado.

**Commits**: ~4-5.

---

## Sub-fase A8b · Core features (home + picks + groups)

**Goal**: refactorizar surfaces principales del producto.

**Surfaces (12)**:
1. home (home.component.ts) — eliminate triple stats redundancy, 1 contextual CTA, estados condicionales pre/durante/post torneo
2. picks (picks-list.component.ts) — 2-template strategy (próximos editor vs jugados compact), eliminate page stats, sub-seg persist
3. pick-detail (pick-detail.component.ts) — eliminate dead match-info section, agregar forma reciente + H2H + picks distribution
4. picks-group-stage (picks-tabla-grupos.component.ts) — toggle Tabla real/predicción tabs primary, drag&drop fix mobile
5. picks-bracket (bracket-picks.component.ts) — mobile layout overhaul, slot states legend
6. picks-group-stage-predict (group-stage-picks.component.ts) — consolidate standalone → embed only
7. groups-list (groups-list.component.ts) — skeleton, sort options, search if N > 5
8. group-detail (group-detail.component.ts) — render B2 description (A3 fix verified), compactar hero, eliminar "Por jornada" disabled
9. group-edit (group-edit.component.ts) — rich image upload (drag&drop, crop, progress, eliminar)
10. group-prizes (group-prizes-edit.component.ts) — wire CanDeactivate (A8 mecánico), dirty check Guardar button
11. group-invite-email (group-invite-email.component.ts) — `<span (click)>` close → `<button>`, subject line email preview, memberCount refresh
12. transfer-admin (inline en group-detail.component.ts) — A2 modal refactor + member info enriquecida (avatar + score + tenure)

### Per-surface pattern

Each refactor task:
- Apply A1 tokens (`--sidebar-w`, modal tokens, etc.).
- Replace emojis con `<app-icon>` per inventory matrix.
- Apply A5 tone+branding (already done via sweep).
- Apply specific bug fixes from walkthrough not yet covered.
- Use shared components: `<app-empty-block>`, `<app-skeleton>`, `<app-modal>` where applicable.
- Run tests existentes (Jest) — should pass.

**Acceptance per surface**:
- [x] No emojis residuales en `*.ts/*.html` excepto strings de copy semántico.
- [x] Walkthrough bug fixes verificados.
- [x] Tests existentes verdes.
- [x] Build success.

**Commits**: 12 surfaces × ~1-2 commits each = 12-24 commits.

---

## Sub-fase A8c · Sub-features (ranking + comodines + profile + special-picks + notifications)

**Surfaces (5)**:

1. **ranking** (ranking.component.ts):
   - Consolidate quintuple visibility top user.
   - Sort options en tabla desktop (click headers).
   - `Intl.RelativeTimeFormat` para "actualizado hace…".
   - Empty states con CTAs (post A4 — "Crear" + "Unirme con código").
   - Skeleton loading.

2. **comodines-list** (comodines-list.component.ts):
   - Wrap catálogo + cómo funcionan en `<details>` colapsable.
   - Eliminar card-canjear inline form (use RedeemModal global only).
   - Stats header reducir a 3 (quitar Total).
   - aria-pressed en filter "Expirados".
   - Empty states consistentes con A1 `<app-empty-block>`.
   - 9 tipos comodín SVG icons (per type — design decisión: agregar custom SVGs O usar Lucide aproximados).
   - Fix fragment mismatch (A3 verified).

3. **profile** (profile.component.ts):
   - Compactar hero (quitar email + memberSince → mover a edit-profile modal).
   - aria-hidden Cuenta icons (A3 fix verified).
   - Canjear → RedeemModal directo (no via /mis-comodines).
   - Inline styles → design tokens.
   - flag-icons consistency (vs emoji).
   - Profile-list-item button vs anchor consistency.

4. **special-picks** (special-picks.component.ts):
   - Search/filter teams (96 buttons).
   - Validation visible (CHAMPION≠RUNNER_UP feedback inline).
   - Hint DARK_HORSE puede coincidir.
   - Spinner per pick saving (use `saving[type]` signal).
   - Mode switch unificado + warning al cambiar.
   - Empty state con "Unirme con código".

5. **notifications-list** (notifications-list.component.ts):
   - `<li (click)>` → `<a routerLink>` (A3 verified).
   - Filter pills (Todos / Comodines / Reminders / etc.).
   - Grouping por fecha (Hoy / Ayer / Esta semana / Más viejas).
   - Date format relativo.
   - Badge con icon + color (no color-only).
   - Inline styles → design tokens.

**Commits**: 5 surfaces × ~2 commits cada = ~10 commits.

---

## Sub-fase A8d · Micro-surfaces (banner + toast + footer + right-rail)

**Surfaces (4)**:

1. **picks-pending-banner** (picks-pending-banner.component.ts):
   - × close → `<app-icon name="close"/>`.
   - CTA contextual al match más urgente (vs general /picks).
   - Computed signal vs arrow function (pattern fix).
   - Timezone-aware dismiss + cross-tab sync via BroadcastChannel.
   - Loading skeleton para evitar layout shift.
   - aria-label "Cerrar" capital.

2. **trivia-toast** (trivia-toast.component.ts):
   - SVG icon dot + → close.
   - `prefers-reduced-motion` respect (pulse animation).
   - `<a>` sin href → `<button>` keyboard accessible.
   - Dismiss button + cooldown (localStorage).
   - CSS variable `--sidebar-w` (already fixed A3).
   - Wording dinámico según tipo (comodín vs +10 pts).

3. **footer** (footer.component.ts):
   - SVG icons.
   - External "Reglas" con `rel="noopener noreferrer"` (A5 verified).
   - Logout `danger: true` (consolidar con sidebar/nav logout — single AuthService.logoutWithConfirm).
   - "Editar perfil" link decisión: o abrir modal directo o cambiar wording a "Mi perfil".
   - Tone + branding (A5 verified).

4. **right-rail** (right-rail.component.ts):
   - Consume `getMyRightRail` consolidated (A6) — 5+ calls → 1.
   - Cache cross-route via signal global service.
   - SVG icons (🏳️ → text initials, ✓ → SVG, ⚠ → SVG, → → SVG).
   - Pad-zero days countdown.
   - role="timer" en countdown.
   - "Empieza ya" state cuando timer = 0.
   - Skeleton loading states.
   - lazy loading images.
   - Backend imageUrl long-lived (consume A6 avatarUrl pattern).

**Commits**: 4 surfaces × ~2 commits cada = ~8 commits.

---

## A8 Final Cross-cutting Audit

Después de A8d, ejecutar audit comprehensive:

```bash
# Emojis residuales
grep -rE '\\xe2\\x9a' src/app/ --include="*.ts" --include="*.html" 2>/dev/null | wc -l
# Expected: 0 (excepto strings de copy semántico documentados)

# Voseo residual
for pattern in 'creá' 'unite' 'Tenés' 'Querés' 'Pickeá' 'Pedile' 'Pegá' 'Podés'; do
  count=$(grep -rE "$pattern" src/app/ --include="*.ts" --include="*.html" 2>/dev/null | wc -l)
  echo "$pattern: $count"
done

# href="#" placeholders
grep -rn 'href="#"' src/app/ --include="*.ts" --include="*.html" | wc -l
# Expected: 0

# console.error/warn en prod
grep -rE 'console\.(error|warn)' src/app/ --include="*.ts" 2>/dev/null | wc -l
# Expected: ≤ baseline (or replaced with telemetry placeholder)

# !important CSS
grep -rE '!important' src/app/ --include="*.ts" --include="*.html" --include="*.css" 2>/dev/null | wc -l
# Expected: ≤ baseline pre-refactor

# Bundle size delta
ls -lh dist/*/main*.js

# Lighthouse a11y score ≥ 90 (manual)
# - home + picks + groups + login + comodines
```

---

## Estimación

- A8a: 4-5 días
- A8b: 2-3 semanas (12 surfaces, varying complexity)
- A8c: 1-2 semanas (5 surfaces)
- A8d: 1 semana (4 surfaces)

**Total A8**: 4-6 semanas.

---

## Dispatch strategy

Cada sub-fase = 1 coordinator subagent opus 4.7. Coordinador trabaja surface-by-surface. Si sub-fase muy grande (A8b), split en 2 sub-coordinators para grupos lógicos:
- A8b.1: home + picks + pick-detail + 3 picks sub-surfaces (7 surfaces)
- A8b.2: groups (5 surfaces) + transfer-admin

---

## Note for orchestrator

A8 plan es high-level por scope amplio. Each sub-fase puede requerir su propio detailed plan with task-by-task breakdown cuando llegue su turno. Use this plan as roadmap + create dedicated A8a / A8b / A8c / A8d plans on demand during execution.

---

## Acceptance gate (per sub-fase)

A8a: [x] Mobile nav functional + sheet animation + admin gated.
A8b: [x] 12 surfaces refactored + bug fixes verified + tests verdes.
A8c: [x] 5 surfaces refactored + comodines colapsable + flag-icons + filter pills notif.
A8d: [x] 4 surfaces refactored + right-rail single-call (A6) + sidebar-w consistency.

**Final A8**: cross-cutting audit grep results all 0 (or documented exceptions). Production build success. Lighthouse a11y ≥ 90 en 5 surfaces clave.
