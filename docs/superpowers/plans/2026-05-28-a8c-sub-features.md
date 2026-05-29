# A8c · Sub-Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **All sub-agent dispatches MUST use opus 4.7** per project memory.

**Goal:** Refactorizar los 5 sub-feature surfaces de Sprint 6: ranking + comodines-list + profile + special-picks + notifications-list. Cada uno consume Sprint 1-3 infra + aplica bug fixes específicos documentados en walkthrough.

**Architecture:** Cada surface task discreta — tokens A1, `<app-icon>`, `<app-empty-block>`, `<app-skeleton>`, `<app-modal>` donde aplique. Tone+branding A5 ya swept (verificar). Surface-specific UX gaps documentados.

**Tech Stack:** Angular 18 standalone + signals.

---

## Dependencies

**Required mergeado**: A1 + A2 + A3 + A4 + A5 + (A6 partial).

## File Structure

**Modify**:
- `src/app/features/ranking/ranking.component.ts`
- `src/app/features/comodines/comodines-list.component.ts`
- `src/app/features/profile/profile.component.ts`
- `src/app/features/profile/special-picks.component.ts`
- `src/app/features/notifications/notifications-list.component.ts`

**No new files**.

---

## Tasks

### Task 1: Refactor ranking.component.ts

**File**: `src/app/features/ranking/ranking.component.ts`

**Walkthrough findings (doc 07)**:
- Quintuple visibility top user (badge + hero card + podium + top general + cerca-de-ti)
- Hardcoded "esta semana" without source-of-truth (delta system semi-mentira)
- `updatedAgo()` hardcoded Spanish (no Intl.RelativeTimeFormat)
- A3 fixes already applied: mobile-only class + prefers-reduced-motion scrollToTop

**Changes**:

1. **Consolidate top user visibility**: choose ONE primary per viewport
   - Mobile: hero-card (current)
   - Desktop: header badge "TU POSICIÓN"
   - Remove the duplicates from podium-section + top general medals + cerca-de-ti

2. **Sort options en tabla desktop** (click headers):
   ```typescript
   sortBy = signal<'rank' | 'totalPoints' | 'exactos' | 'aciertos' | 'delta'>('rank');
   sortDir = signal<'asc' | 'desc'>('asc');

   toggleSort(field: SortField) {
     if (this.sortBy() === field) {
       this.sortDir.update(d => d === 'asc' ? 'desc' : 'asc');
     } else {
       this.sortBy.set(field);
       this.sortDir.set('asc');
     }
   }
   ```

3. **Replace `updatedAgo()` hardcoded** with `Intl.RelativeTimeFormat('es-EC')`:
   ```typescript
   private static readonly relativeFmt = new Intl.RelativeTimeFormat('es-EC', { numeric: 'auto' });

   updatedAgoLabel(): string {
     const updatedAt = this.snapshot()?.updatedAt;
     if (!updatedAt) return '';
     const diffMs = Date.now() - new Date(updatedAt).getTime();
     const minutes = Math.round(diffMs / 60_000);
     if (Math.abs(minutes) < 60) return RankingComponent.relativeFmt.format(-minutes, 'minute');
     const hours = Math.round(diffMs / 3_600_000);
     if (Math.abs(hours) < 24) return RankingComponent.relativeFmt.format(-hours, 'hour');
     const days = Math.round(hours / 24);
     return RankingComponent.relativeFmt.format(-days, 'day');
   }
   ```

4. **Replace `<app-empty-block>` for empty states** (post A4 — modal triggers):
   - Global tab empty: "Hacé tus picks →" + "Unirme con código"
   - Mis grupos tab empty: "Crear grupo" + "Unirme con código"

5. **Skeleton loading**:
   - During initial fetch, show `<app-skeleton variant="list" [count]="10">` for ranking rows

6. **Emoji replacement**: 🏆🥇🥈🥉 — typography only ("1º 2º 3º") or SVG Lucide medals if available (currently `LucideMedal` exists — add to icon-map if not registered)

**Commit**: `refactor(ranking): consolidate top user visibility + sort options + Intl + skeleton`

---

### Task 2: Refactor comodines-list.component.ts (most complex in A8c)

**File**: `src/app/features/comodines/comodines-list.component.ts`

**Walkthrough findings (doc 13)**:
- Catálogo + Cómo funcionan SIEMPRE visibles → wrap en `<details>` colapsable
- Card-canjear inline form vs RedeemModal global → eliminar inline (post Fase A consolidation incompleta)
- Stats Total (derivable from Disponibles+Usados+Expirados+Pendientes)
- aria-pressed missing en filter "Expirados"
- Empty filter usa `.loading-msg` vs `.empty-block`
- 3 modales internos (Claim, Assign, Use) — refactor to use `<app-modal>` (A2)
- 9 tipos comodín emojis 🃏 (or visual representation)
- Fragment mismatch fixed in A3 (verify)

**Changes**:

1. **Wrap catálogo + cómo funcionan en `<details>`**:
   ```html
   <details class="comodines__catalog-details">
     <summary>Ver todos los tipos de comodín (9)</summary>
     <!-- existing catalog content -->
   </details>

   <details class="comodines__how-details">
     <summary>Cómo funcionan</summary>
     <!-- existing 3 steps -->
   </details>
   ```

2. **Eliminate card-canjear inline form** — open RedeemModal global instead:
   ```typescript
   private redeemModal = inject(RedeemModalService);

   openRedeem() {
     this.redeemModal.open();
   }
   ```

   Replace inline form button with: `<button (click)="openRedeem()">Canjear código</button>`

3. **Reduce stats header to 3** (eliminate "Total"):
   ```html
   <div class="comodines__stats">
     <div>{{ disponibles() }}</div>
     <div>{{ usados() }}</div>
     <div>{{ pendientes() }}</div>
   </div>
   ```

4. **Add aria-pressed to filter "Expirados"** (consistency with other 3 filters):
   ```html
   <button [attr.aria-pressed]="filter() === 'expirados'" (click)="filter.set('expirados')">
     Expirados
   </button>
   ```

5. **Replace `.loading-msg` empty filter state with `<app-empty-block>`**:
   ```html
   <app-empty-block iconName="filter" title="Sin {{ filterLabel() }}" sub="Cambia el filtro para ver otros comodines." />
   ```

6. **Refactor 3 internal modals to use `<app-modal>` (A2)**:
   - Claim modal (9 type radio list)
   - Assign modal (5 form layouts according to type)
   - Use modal (4 form layouts)

   Each gets its own `<app-modal>` with appropriate size and title. **BRACKET_RESET use modal complex** (8 selects) — candidate for separate page; A8c keeps as modal for now with TODO note.

7. **SVG icon for 9 comodín types**: each type currently emoji 🃏. Options:
   - Use Lucide `LucideGift` for all (acceptable v1)
   - Create custom SVGs per type (deferred — too much scope)
   - Use typography indicator (e.g. "2x", "+10")
   - **Recommendation**: Use `<app-icon name="gift">` uniform for v1, design custom SVGs later

**Commit**: `refactor(comodines-list): collapsible catalog + RedeemModal only + 3 modals A2 + empty-block`

---

### Task 3: Refactor profile.component.ts

**File**: `src/app/features/profile/profile.component.ts`

**Walkthrough findings (doc 14)**:
- aria-hidden inconsistent Cuenta vs Mi juego icons (A3 fix verified)
- Hero compactar: quitar email + memberSince (mover a edit-profile modal)
- Sponsors section dedicated con 1 entry — over-emphasis
- Canjear link va a /mis-comodines vs RedeemModal directo
- flag-icons consistency (vs emoji)
- Inline styles múltiples
- Profile-list-item element inconsistency (`<a>` vs `<button>`)

**Changes**:

1. **Hero compactación**:
   - Remove email from hero (already accessible via edit-profile modal)
   - Remove memberSince ("Miembro desde X") — low value
   - Keep: avatar + handle + country flag
   - Hero becomes more focused identity card

2. **Replace flag-icons emoji with CSS `<span class="fi fi-{code}">`** (already used in right-rail):
   ```html
   @if (user()?.country) {
     <span class="fi fi-{{ user()!.country.toLowerCase() }}"></span>
   }
   ```

3. **Canjear → RedeemModal directo**:
   ```typescript
   openRedeem() {
     this.redeemModal.open();
   }
   ```
   Replace `routerLink="/mis-comodines"` button with `(click)="openRedeem()"`

4. **Inline styles → design tokens**: identify and convert each inline style to use token variables

5. **Profile-list-item element consistency**:
   - Choose ONE: `<a>` for navigation, `<button>` for actions
   - Currently Mi juego mixes — make Mi juego all `<a>` (navigation), Cuenta all `<button>` (actions like logout, preferences open)

6. **Sponsors section**: keep but reduce visual weight (smaller heading, less padding)

7. **Reorganize columnas**: 4 columns evenly (Mi juego / Comunicaciones / Cuenta / Sponsors)
   - Move "Notificaciones" from Mi juego to Comunicaciones (better categorization)

**Commit**: `refactor(profile): hero compactación + flag-icons + RedeemModal + element consistency`

---

### Task 4: Refactor special-picks.component.ts

**File**: `src/app/features/profile/special-picks.component.ts`

**Walkthrough findings (doc 15)**:
- 96 buttons (32 teams × 3 categories) sin search/filter
- Validation CHAMPION≠RUNNER_UP invisible
- DARK_HORSE puede coincidir pero sin hint visible
- saving[type] signal exists pero no se renderea
- Mode switch sin warning al cambiar
- No deselect option
- App-team-flag size=28 (vs propuesta 32 tap-friendlier)

**Changes**:

1. **Add search/filter input** above each grid:
   ```html
   <input type="search"
          [placeholder]="'Buscar equipo en ' + categoryLabel(category)"
          [(ngModel)]="searchTerm[category]"
          (ngModelChange)="filterTeams(category, $event)">
   ```

   Filter logic: case-insensitive substring match against team name. Hidden teams get `display: none` or filter the rendered array.

2. **Visible validation CHAMPION≠RUNNER_UP**:
   ```typescript
   isValidPick(category: SpecialCategory, teamId: string): boolean {
     if (category === 'RUNNER_UP' && this.picks().CHAMPION === teamId) return false;
     if (category === 'CHAMPION' && this.picks().RUNNER_UP === teamId) return false;
     return true;
   }
   ```

   Disabled state for invalid picks:
   ```html
   <button [disabled]="!isValidPick(category, team.id)"
           [class.invalid]="!isValidPick(category, team.id)"
           [title]="isValidPick(category, team.id) ? '' : 'Ya elegido como ' + otherCategory(category)">
     <!-- team button content -->
   </button>
   ```

3. **DARK_HORSE coincide hint**:
   ```html
   @if (picks().DARK_HORSE === team.id && (picks().CHAMPION === team.id || picks().RUNNER_UP === team.id)) {
     <span class="pick-hint">Ya seleccionado como {{ otherCategory() }}</span>
   }
   ```

4. **Render saving[type] signal**:
   ```html
   @if (saving()[category]) {
     <app-icon name="clock" size="sm" /> Guardando…
   }
   ```

5. **Mode switch warning** when changing if any picks set:
   ```typescript
   async onModeChange(newMode: GameMode) {
     if (this.hasPicks() && newMode !== this.mode()) {
       const ok = await this.confirmDialog.ask({
         title: 'Cambiar modo',
         message: 'Tus selecciones actuales no se aplican al otro modo. Pueden recuperarse al volver.',
         confirmLabel: 'Cambiar modo',
       });
       if (!ok) return;
     }
     this.mode.set(newMode);
   }
   ```

6. **Deselect option** ("Quitar selección"):
   - Add deselect button next to current pick
   - On click: clear that category's pick

7. **App-team-flag size=32** (tap-friendlier):
   ```html
   <app-team-flag [code]="team.flagCode" size="32"></app-team-flag>
   ```

8. **Empty state with "Unirme con código"** (post A4):
   - In any empty state, use `<app-empty-block>` with both CTAs

**Commit**: `refactor(special-picks): search filter + visible validation + mode warning + deselect`

---

### Task 5: Refactor notifications-list.component.ts

**File**: `src/app/features/notifications/notifications-list.component.ts`

**Walkthrough findings (doc 16)**:
- A3 fix: `<li (click)>` → `<a routerLink>` (verified)
- Fragment mismatch (A3 fixed)
- Sin contador unread visible (badge in sidebar A4, but not in surface header)
- Sin paginación visible
- Badges con inline `[style.background]` from KIND_BADGE map (rgba hardcoded) — not design tokens
- Badge color-only differentiation (WCAG violation — should include icon/symbol)
- Sin filtros por kind

**Changes**:

1. **Add filter pills** by kind:
   ```html
   <div class="filter-pills" role="group" aria-label="Filtrar notificaciones">
     <button [attr.aria-pressed]="filter() === 'all'" (click)="filter.set('all')">Todas</button>
     <button [attr.aria-pressed]="filter() === 'comodines'" (click)="filter.set('comodines')">Comodines</button>
     <button [attr.aria-pressed]="filter() === 'recordatorios'" (click)="filter.set('recordatorios')">Recordatorios</button>
   </div>
   ```

   Filter logic: client-side group by kind into category buckets.

2. **Grouping by date**:
   - "Hoy", "Ayer", "Esta semana", "Más viejas"
   - Use `Intl.DateTimeFormat` + comparison logic
   - Render section headers between groups

3. **Date format relativo**:
   - "Hoy 18:30" / "Ayer 11:00" / "12 jun" using helper from right-rail pattern

4. **Add icon to badge** (color-only fix):
   - Each kind has its color AND an icon
   - Map: COMODIN_PENDING → "clock" yellow, COMODIN_EXPIRING → "alert" red, MATCH_LIVE → "play" green (use available Lucide icon), etc.

5. **Move inline styles to design tokens**:
   - KIND_BADGE map's rgba → CSS variables or semantic classes
   - Create `.notif-badge--comodin`, `.notif-badge--reminder` etc

6. **Unread contador** in surface header:
   ```html
   <header>
     <h1>Notificaciones</h1>
     @if (unreadCount() > 0) {
       <span class="unread-badge">{{ unreadCount() }} sin leer</span>
     }
   </header>
   ```

7. **Skeleton loading**:
   ```html
   @if (loading()) {
     <app-skeleton variant="list" [count]="5" />
   }
   ```

8. **Empty state**:
   ```html
   <app-empty-block iconName="bell" title="Sin notificaciones" sub="Cuando recibas notificaciones aparecerán aquí." />
   ```

**Commit**: `refactor(notifications-list): filter pills + date grouping + icon badges + unread counter + empty-block`

---

### Task 6: Final verification

```bash
# Tests
npx jest

# Production build
npx ng build --configuration=production

# Grep verifications
echo "Emojis residual en 5 surfaces:"
for surface in 'features/ranking' 'features/comodines' 'features/profile/profile.component.ts' 'features/profile/special-picks.component.ts' 'features/notifications'; do
  count=$(grep -E '🏆|🥇|🥈|🥉|🃏|🎁|🔒|⚙|↩|🔔|📋' src/app/$surface 2>/dev/null | wc -l)
  echo "$surface: $count"
done

# Verify <app-icon> usage
grep -rln 'app-icon' src/app/features/ranking/ src/app/features/comodines/ src/app/features/profile/ src/app/features/notifications/
# Expected: 5 files (one per surface)

# Verify <app-empty-block> usage
grep -rln 'app-empty-block' src/app/features/ranking/ src/app/features/comodines/ src/app/features/notifications/
# Expected: 3 files

# Verify <app-skeleton> usage
grep -rln 'app-skeleton' src/app/features/ranking/ src/app/features/notifications/
# Expected: 2 files
```

**Acceptance gate**:
- [x] 5 surfaces refactored using new infra.
- [x] No emojis residuales (or accepted exceptions).
- [x] Empty states unified (app-empty-block).
- [x] Skeleton loading where appropriate.
- [x] Specific UX gaps closed (sort options, search filter, validation, etc.).
- [x] Tests + production build OK.

**Manual smoke pending**:
- Ranking: sort by clicking headers
- Comodines: collapsible catalog + RedeemModal trigger
- Profile: hero compactación + flag-icons
- Special-picks: search input + validation feedback + deselect
- Notifications: filter pills + date grouping

Optional summary commit:
```
chore(a8c): A8c sub-features refactor complete

5 surfaces refactored:
- ranking: consolidate top user visibility, sort options, Intl, skeleton
- comodines: collapsible catalog, RedeemModal only, 3 modals via A2, empty-block
- profile: hero compactación, flag-icons, RedeemModal direct, element consistency
- special-picks: search filter, visible validation, mode warning, deselect, size=32
- notifications: filter pills, date grouping, icon badges, unread counter, skeleton

Tests passing. Production build OK.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

---

## Summary

A8c produce 6 commits (5 surface refactors + summary).

**Dependency**: A1 + A2 + A3 + A4 + A5 (+ A6 partial).

**Sub-proyectos downstream**: NONE — works towards final A8 audit.

**Estimación**: ~1.5 semanas (5 surfaces, comodines is the most complex).

**Dispatch strategy**: 1 sub-agente opus 4.7 coordinator. Surfaces in order shown.

**Risk**: Medium — comodines has 3 modals + business logic. Test thoroughly.
