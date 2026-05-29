# A8b · Core Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **All sub-agent dispatches MUST use opus 4.7** per project memory.

**Goal:** Refactorizar los 12 core feature surfaces de Sprint 5: home + picks family (5 surfaces) + groups family (6 surfaces). Estos son los surfaces de mayor uso del producto. Cada surface aplica Sprint 1-3 infra + UX gaps específicos documentados en walkthrough.

**Architecture:** A8b es el sub-fase más grande de A8. Split internamente en 3 grupos lógicos:
- **A8b.1** Home + picks family (6 surfaces): home, picks-list, pick-detail, picks-group-stage, picks-bracket, picks-group-stage-predict
- **A8b.2** Groups family (5 surfaces): groups-list, group-detail, group-edit, group-prizes, group-invite-email
- **A8b.3** Transfer-admin verificación (1 surface — already refactored by A2, verify)

Cada surface task discreta. Tone+branding+legal links ya swept (A5). Bug fixes A3 ya aplicados. Verificar en cada surface que el work previo se preservó.

**Tech Stack:** Angular 18 standalone + signals.

---

## Dependencies

**Required mergeado**: A1 + A2 + A3 + A4 + A5 (+ A6 partial).

## File Structure

**Modify** (12 surfaces):
- `src/app/features/home/home.component.ts`
- `src/app/features/picks/picks-list.component.ts`
- `src/app/features/picks/pick-detail.component.ts`
- `src/app/features/picks/picks-tabla-grupos.component.ts` (group-stage)
- `src/app/features/picks/bracket-picks.component.ts`
- `src/app/features/picks/group-stage-picks.component.ts` (predict standalone)
- `src/app/features/groups/groups-list.component.ts`
- `src/app/features/groups/group-detail.component.ts`
- `src/app/features/groups/group-edit.component.ts`
- `src/app/features/groups/group-prizes-edit.component.ts`
- `src/app/features/groups/group-invite-email.component.ts`
- (transfer-admin already done by A2 — verify)

**No new files** generally. Possible new shared component for match-card if scope creep.

---

## Tasks — A8b.1 (Home + Picks family)

### Task 1: Refactor home.component.ts

**File**: `src/app/features/home/home.component.ts`

**Walkthrough findings (doc 01)**:
- Triple stats redundancy (hero + KPI strip + ranking card)
- 3 CTAs "Hacer picks →" (same target, multiple instances)
- Empty state pre-torneo + post final + during — 3 distinct states needed
- Comodines slots always rendered (should hide if count==0)
- Truncate missing en ranking card best-group-name
- Especiales header sin progress visible

**Changes**:

1. **Eliminate triple stats redundancy**:
   - Choose 1 location: hero stats are primary (closest to user identity)
   - Remove KPI strip duplicate
   - Remove ranking card stats duplicate
   - Result: hero shows X / Y / Z. Other cards focus on their unique value.

2. **1 contextual primary CTA** based on torneo state:
   - **Pre-torneo**: "Predecí clasificados →" (link to picks/group-stage/predict)
   - **Durante**: "Hacé pick del próximo partido →" (link to pick-detail of next match)
   - **Post-final**: "Ver mi ranking final →" (link to /ranking)
   - Secondary CTAs: keep but visually subordinate

3. **3 distinct empty states**:
   - Pre-torneo: countdown D/H/M/S to first match + "Predecí clasificados" CTA
   - Durante (no picks yet): "Pendientes en las próximas 24h" list with quick-pick
   - Post-final: standings summary + share

4. **Conditional comodines slots**:
   ```html
   @if (myComodines().length > 0) {
     <section class="comodines-strip">...</section>
   }
   ```

5. **Truncate ranking card best-group-name**:
   ```css
   .ranking-card__best-group {
     min-width: 0;
     overflow: hidden;
     text-overflow: ellipsis;
     white-space: nowrap;
   }
   ```

6. **Especiales header con progress visible**:
   ```html
   <header class="especiales__head">
     <h3>Picks especiales</h3>
     <span class="progress">{{ especialesProgress() }}/3</span>
   </header>
   ```

7. **Empty state CTAs** (`<app-empty-block>` from A1):
   - Empty "Mis grupos" card: `<app-empty-block iconName="users" title="Sin grupos" sub="...">` with Create + Join buttons

8. **Skeleton states for loading**

**Commit**: `refactor(home): consolidate stats + contextual CTA + 3 empty states + comodines conditional`

---

### Task 2: Refactor picks-list.component.ts (most complex)

**File**: `src/app/features/picks/picks-list.component.ts`

**Walkthrough findings (doc 02)**:
- 2-template strategy: Próximos (~180px editor) vs Jugados (compact-row ~60-72px)
- Page stats 4-up → eliminate (duplicates home)
- Sub-seg "Próximos/Jugados" persist en localStorage
- Filtros "Solo pendientes" + "Por grupo activo"
- Phase multiplier badge "x2 PTS · CUARTOS"
- Days-pager bottom only if ventana > viewport
- Trivia chips "Preg 1/Preg 2" → 1 CTA "Responder trivia"
- "Sin pick" pill activa "Predecí →"
- Score input maxlength="2" (already fixed A3)
- Page tabs con badges
- Empty state with CTAs
- Aggregations en Jugados
- Trivia/sponsor banners post Fase A consolidation

**Changes**:

1. **Split match-card template**: create 2 variants
   - `<match-card-editor>` for Próximos (full editor inline)
   - `<match-card-result>` for Jugados (compact row with verdict)
   - Use Angular template projection or 2 separate components

2. **Eliminate 4-stats page header**: remove duplicates with home

3. **Sub-seg persist en localStorage**:
   ```typescript
   private static readonly SUB_SEG_KEY = 'picks-sub-seg';

   constructor() {
     const stored = localStorage.getItem(PicksListComponent.SUB_SEG_KEY);
     if (stored === 'jugados' || stored === 'proximos') {
       this.subSeg.set(stored);
     }
   }

   onSubSegChange(value: 'proximos' | 'jugados') {
     this.subSeg.set(value);
     localStorage.setItem(PicksListComponent.SUB_SEG_KEY, value);
   }
   ```

4. **Filtros "Solo pendientes"** + **"Por grupo activo"** (if user has multiple groups):
   ```html
   <div class="filter-bar">
     <label>
       <input type="checkbox" [(ngModel)]="filterPending"> Solo pendientes
     </label>
     @if (myGroups().length > 1) {
       <select [(ngModel)]="filterGroup">
         <option value="">Todos los grupos</option>
         @for (g of myGroups(); track g.id) {
           <option [value]="g.id">{{ g.name }}</option>
         }
       </select>
     }
   </div>
   ```

5. **Phase multiplier badge**:
   ```html
   @if (match.phaseMultiplier > 1) {
     <span class="phase-multiplier-badge">
       x{{ match.phaseMultiplier }} PTS · {{ match.phaseLabel }}
     </span>
   }
   ```

6. **Days-pager** at bottom only if total days > visible:
   ```html
   @if (totalDays() > visibleDays()) {
     <nav class="days-pager">
       <button (click)="prevDay()">← {{ prevDayLabel() }}</button>
       <span>{{ currentDayLabel() }} ({{ currentIndex() + 1 }}/{{ totalDays() }})</span>
       <button (click)="nextDay()">{{ nextDayLabel() }} →</button>
     </nav>
   }
   ```

7. **Trivia chips → 1 CTA**:
   ```html
   @if (match.triviaCount > 0) {
     <button class="trivia-cta" (click)="openTrivia(match.id)">
       Responder trivia (+{{ match.triviaCount * 10 }} pts)
     </button>
   }
   ```

8. **"Sin pick" pill → active CTA**:
   ```html
   @if (!match.myPick) {
     <a class="pick-cta" [routerLink]="['/picks/match', match.id]">
       Predecí →
     </a>
   }
   ```

9. **Aggregations en Jugados** (`<header>` of jugados section):
   ```html
   <header class="jugados-summary">
     Esta fase: {{ exactos() }}/{{ jugadosTotal() }} exactos · {{ aciertos() }}/{{ jugadosTotal() }} aciertos
   </header>
   ```

10. **Empty state with CTAs** (`<app-empty-block>`)

11. **Auto-save status compact at page level** (vs per-card)

12. **SVG icons** for verdict + actions: `<app-icon name="check"/>`, `<app-icon name="close"/>`, etc.

**This is the largest task in A8b.** May require splitting into 2-3 commits:
- Commit 1a: Sub-seg persist + filters + page-level header
- Commit 1b: Match-card 2-template split
- Commit 1c: Trivia/sponsor/empty/aggregations polish

**Commit example**: `refactor(picks-list): 2-template strategy + filters + persisted sub-seg + page header cleanup`

---

### Task 3: Refactor pick-detail.component.ts

**File**: `src/app/features/picks/pick-detail.component.ts`

**Walkthrough findings (doc 03)**:
- Eliminate dead match-info section (50% placeholders + duplica hero)
- Forma reciente + H2H + picks distribution (requires backend data)
- Countdown contextual: "En 12 días" simple, detail D/H/M/S only if <24h
- Phase multiplier badge visual
- Aggregate stats en pre + post
- Breakdown visual (stepped progress bar) instead of table
- Trivia activa indicator
- Group ranking link post-match
- Compartir CTA post-match
- Skeleton para crest URLs
- Variant --hit ausente (fix CSS)
- Score input maxlength="2" (A3 verified)

**Changes**:

1. **Eliminate match-info dead section**:
   - Remove `<section class="match-info">` with 3 placeholders ("Por confirmar", "—", "Por confirmar")

2. **Replace with informative content** (post-A6 ideal):
   - Forma reciente: backend data (last 5 matches per team) — TODO(A6) if not available
   - Head-to-head: backend data
   - Picks distribution: backend data
   - For now, use seed/mock or hide section

3. **Countdown contextual**:
   ```typescript
   countdownLabel = computed(() => {
     const diffMs = this.kickoffMs() - Date.now();
     if (diffMs < 0) return null; // post-match
     const days = Math.floor(diffMs / 86_400_000);
     if (days > 1) return { type: 'simple', label: `En ${days} días` };
     if (days === 1) return { type: 'simple', label: 'Mañana' };
     // < 24h: full D/H/M/S
     return { type: 'detail', /* ... */ };
   });
   ```

4. **Add `--hit` variant CSS** (asymmetry fix):
   ```css
   .pick-verdict--hit {
     color: var(--color-win);
     background: rgba(2, 204, 116, 0.1);
   }
   ```

5. **Skeleton for crest URLs**:
   ```html
   <img [src]="homeCrest" [alt]="homeName" class="crest"
        loading="lazy"
        (load)="onCrestLoad('home')" (error)="onCrestError('home')">
   @if (!crestLoaded.home) {
     <app-skeleton variant="circle" />
   }
   ```

6. **Group ranking link post-match**:
   ```html
   @if (match.status === 'FINAL' && myActiveGroup()) {
     <a class="post-match-link" [routerLink]="['/groups', myActiveGroup().id]">
       Sos #{{ myRankInGroup() }} en {{ myActiveGroup().name }} →
     </a>
   }
   ```

7. **SVG icons**: verdict, share button, etc.

**Commit**: `refactor(pick-detail): eliminate dead match-info + countdown contextual + skeleton crests + --hit variant`

---

### Task 4: Refactor picks-tabla-grupos.component.ts (group-stage)

**File**: `src/app/features/picks/picks-tabla-grupos.component.ts`

**Walkthrough findings (doc 04)**:
- Toggle Tabla real/Mi predicción as primary tabs (more prominent than current toggle)
- Auto-fill shortcut for initial prediction
- Click-to-promote alternative to drag&drop on mobile
- Better 8 terceros indicator in Tabla real
- Warning at reorder affecting candidatos 3eros
- Sticky sidebar terceros desktop / bottom-sheet mobile
- Modal with trivia + detail link
- "Ver bracket basado en mi predicción" link
- Pre-torneo empty state in Tabla real
- gs-card uses CSS flag-icons directly (vs app-team-flag)
- Save state inconsistency (localStorage + manual) — should consolidate to auto-save
- Out-of-scope from A2: the internal "Hacer picks · Grupo X" modal uses `.picks-modal` legacy

**Changes**:

1. **Toggle as primary tabs**:
   ```html
   <nav class="page-tabs" role="tablist">
     <button role="tab" [attr.aria-selected]="view() === 'real'" (click)="view.set('real')">
       Tabla real
     </button>
     <button role="tab" [attr.aria-selected]="view() === 'pred'" (click)="view.set('pred')">
       Mi predicción
     </button>
   </nav>
   ```

2. **Auto-fill button**:
   ```html
   @if (view() === 'pred' && !hasPicks()) {
     <button (click)="autoFillFromRanking()">
       Auto-llenar con orden actual
     </button>
   }
   ```

3. **Click-to-promote** (mobile alternative to drag):
   - Add tap-and-hold detection → context menu with "Subir / Bajar / Mover a posición #X"
   - OR show explicit ↑ ↓ buttons per row on mobile

4. **8 terceros indicator on Tabla real** (currently only on Mi predicción):
   ```html
   @if (isThird(team) && qualifiesAsBest8(team)) {
     <span class="best-third-badge">3º mejor</span>
   }
   ```

5. **Warning on reorder**:
   ```typescript
   async onReorder(newOrder: Team[]) {
     if (this.affectsBestThirds(newOrder)) {
       const ok = await this.confirmDialog.ask({
         title: 'Reordenar afecta candidatos a mejor 3ero',
         message: 'Tu nuevo orden cambia quién clasifica como mejor 3ero.',
         confirmLabel: 'Reordenar',
       });
       if (!ok) return;
     }
     this.applyOrder(newOrder);
   }
   ```

6. **Refactor internal "Hacer picks Grupo X" modal to `<app-modal>` (A2 follow-up)**:
   - Out-of-scope from A2 plan but discovered. Apply here.

7. **Use `<app-team-flag>` consistently** (not CSS flag-icons directly):
   - Replace direct `<span class="fi fi-{code}">` with `<app-team-flag [code]="code">`

8. **Save state consolidation**: convert manual "Guardar en la base" to auto-save consistent with other surfaces

9. **Pre-torneo empty state on Tabla real**:
   - When all groups 0-0-0 (no matches played), show illustration + "El Mundial empieza el X"

10. **"Ver bracket basado en mi predicción" link** in pred view

**Commit**: `refactor(picks-tabla-grupos): toggle as tabs + auto-fill + click-to-promote mobile + warning + auto-save consolidation`

---

### Task 5: Refactor bracket-picks.component.ts

**File**: `src/app/features/picks/bracket-picks.component.ts`

**Walkthrough findings (doc 05)**:
- Mobile layout overhaul (9 columns scroll fragments lectura)
- 6 estados slot con legend completa + tooltips/iconos (hoy legend cubre 2)
- Scoring table visible (R32=+2, Oct=+4, etc.)
- Champion comparison post-final
- Discarded slot more prominent
- Default filter "Tu camino" for users with picks
- Counter "X/N" prominent
- Lock status as pill (no `<br>`)
- Empty state with "Unirme con código"
- Final card incentive "+25 pts si acertás"
- Placeholder "Esperando R32-1 →"
- Mode switch unified with other segmented controls
- Mode switch warning when changing
- Eliminate 4 stats page header
- A3 fix verified: link "Ir a mis terceros" → /picks/group-stage?view=pred
- A3 fix verified: role=tablist mode switch

**Changes**:

1. **Mobile layout options**:
   - **Recommended**: vertical stacked accordion per phase (R32 → Oct → CF → SF → Final)
   - Tap phase header to expand/collapse
   - Each phase shows its matches in a tall column

2. **6 estados slot legend**:
   ```html
   <legend class="slot-legend">
     <span class="slot--hit">✓ Acertado</span>
     <span class="slot--locked">🔒 Bloqueado</span>
     <span class="slot--editable">Editable</span>
     <span class="slot--projected">🔮 Proyectado</span>
     <span class="slot--discarded">~ Descartado</span>
     <span class="slot--awaiting">⏳ Esperando</span>
   </legend>
   ```

3. **Scoring table visible**:
   ```html
   <details class="scoring-table">
     <summary>Sistema de puntos por fase</summary>
     <table>
       <tr><td>R32 (Octavos)</td><td>+2 pts</td></tr>
       <tr><td>Cuartos</td><td>+4 pts</td></tr>
       <tr><td>Semifinal</td><td>+8 pts</td></tr>
       <tr><td>Final</td><td>+16 pts</td></tr>
       <tr><td>Champion</td><td>+25 pts</td></tr>
     </table>
   </details>
   ```

4. **Champion comparison post-final**:
   - When tournament has FINAL match completed, show side-by-side: "Predijiste X · real Y" + verdict

5. **Default filter "Tu camino"** if user has picks:
   ```typescript
   ngOnInit() {
     if (this.hasUserPicks()) {
       this.filter.set('myPath');
     }
   }
   ```

6. **Counter "X/N" prominent**:
   ```html
   <header class="bracket-counter">
     {{ filledSlots() }}/{{ totalSlots() }} predicciones hechas
   </header>
   ```

7. **Lock status as pill** (not `<br>`):
   ```html
   @if (locked()) {
     <span class="lock-pill">🔒 Bloqueado tras kickoff</span>
   }
   ```

8. **Empty state with "Unirme con código"** + `<app-empty-block>`

9. **Mode switch warning**:
   ```typescript
   async onModeChange(newMode) {
     if (this.hasUserPicks() && newMode !== this.mode()) {
       const ok = await this.confirmDialog.ask({...});
       if (!ok) return;
     }
     this.mode.set(newMode);
   }
   ```

10. **Eliminate 4 stats page header**

11. **Placeholder polish**: "Esperando R32-1 →" instead of "Pick fase anterior"

**Commit**: `refactor(bracket): mobile accordion + 6-state legend + scoring table + counter + mode warning`

---

### Task 6: Refactor group-stage-picks.component.ts (predict standalone)

**File**: `src/app/features/picks/group-stage-picks.component.ts`

**Walkthrough findings (doc 06)**:
- 2 paths con UI distinta (sidebar standalone vs page-tabs embed) → consolidate
- Doble h1 cuando se embebe
- Mode switch sin warning
- Texto contradictorio "se guardan automáticamente" + "Pulsa Guardar"
- Empty state `<p class="form-card__hint">` vs `.empty-block`
- Link `/groups/new` vs modal (A4 fix verified)
- 2 systems empty state (cross-cutting)

**Changes**:

1. **Add `[embedded]="true"` input** to suppress component-owned header:
   ```typescript
   embedded = input<boolean>(false);
   ```

   ```html
   @if (!embedded()) {
     <header class="page-header">...</header>
   }
   ```

2. **Standalone route consolidation**:
   - **Decision**: keep standalone route for direct deep-link OR remove and use `/picks/group-stage?view=pred` exclusively
   - If remove: update sidebar entry "Mundial 2026" link
   - Plan recommends consolidation but to minimize scope creep, keep standalone with `[embedded]="false"` default

3. **Mode switch with warning** (same pattern as bracket)

4. **Resolve contradictory text**: choose ONE message
   - If auto-save: "Tus picks se guardan automáticamente al modificar"
   - Remove "Pulsa Guardar en la base"

5. **Use `<app-empty-block>` for empty states** (replace `.form-card__hint`)

6. **Unified segmented control style** (consistent with bracket + special-picks post A8c)

**Commit**: `refactor(group-stage-picks): embedded input + mode warning + auto-save consistent + empty-block`

---

## Tasks — A8b.2 (Groups family)

### Task 7: Refactor groups-list.component.ts

**File**: `src/app/features/groups/groups-list.component.ts`

**Walkthrough findings (doc 08)**:
- A3 verified: empty state CTAs visible (uses `<app-empty-block>`)
- Skeleton cards for loading
- Inline styles in empty state (A3 fix superseded)
- N+1 calls (32 calls for 8 groups) — TODO(A6) for myGroupsWithStats endpoint
- Sort options (last activity, rank, members)
- Search input when N > 5 groups
- Filter by mode (SIMPLE/COMPLETE)
- Total pts in card
- Recent activity in card
- Prize snapshot
- Comodines badge for COMPLETE
- "Activo hace 2h" instead of "creado el {date}"
- "#?" placeholder during loading → skeleton

**Changes**:

1. **Skeleton cards** during loading:
   ```html
   @if (loading()) {
     <app-skeleton variant="card" [count]="3" />
   }
   ```

2. **Sort options**:
   ```html
   <select [(ngModel)]="sortBy">
     <option value="lastActive">Última actividad</option>
     <option value="myRank">Mi posición</option>
     <option value="memberCount">Miembros</option>
     <option value="created">Creación</option>
   </select>
   ```

3. **Search input** when N > 5:
   ```html
   @if (groups().length > 5) {
     <input type="search" [(ngModel)]="searchTerm" placeholder="Buscar grupo...">
   }
   ```

4. **Filter by mode** when user has both:
   ```html
   @if (hasComplete() && hasSimple()) {
     <div class="mode-filter">
       <button [attr.aria-pressed]="filterMode() === 'all'">Todos</button>
       <button [attr.aria-pressed]="filterMode() === 'COMPLETE'">Completo</button>
       <button [attr.aria-pressed]="filterMode() === 'SIMPLE'">Simple</button>
     </div>
   }
   ```

5. **Card enrichment**:
   - Total pts: `{{ g.myTotalPts }} pts`
   - Last activity: `"Activo " + relativeTime(g.lastActivity)`
   - Comodines badge if COMPLETE + comodinesEnabled

6. **TODO(A6) note**: comment about N+1 reduction via `myGroupsWithStats` endpoint

7. **"#?" → skeleton**:
   ```html
   @if (g.myRank === null) {
     <app-skeleton variant="text" />
   } @else {
     <span class="rank">#{{ g.myRank }}</span>
   }
   ```

**Commit**: `refactor(groups-list): skeleton cards + sort/search/filter + card enrichment`

---

### Task 8: Refactor group-detail.component.ts

**File**: `src/app/features/groups/group-detail.component.ts`

**Walkthrough findings (doc 09)**:
- A3 verified: description render in hero (B2 bug fix)
- A2 verified: transfer-admin modal uses `<app-modal>`
- Hero compactar: identity + 1 stats line
- "Por jornada" disabled — dead UI feature placeholder → remove
- Tooltip "⋯" admin button or visible label
- Group QR code sharing
- Delete member button padding aumentado (hit-target token from A1)
- Sort options rank table
- Premios subtitles consistent
- "Silenciar notif del grupo" además de "Abandonar"
- Logout-style "danger" en delete actions

**Changes**:

1. **Hero compactación** — single stats line
2. **Remove "Por jornada" disabled** segmented control option (dead UI)
3. **Tooltip on "⋯"** or visible "Acciones admin" label
4. **Delete member button hit-target**:
   ```css
   .delete-member-btn {
     min-width: var(--hit-target-min, 44px);
     min-height: var(--hit-target-min, 44px);
   }
   ```
5. **Sort options** for rank table (click headers)
6. **Group QR code** (use existing qr library or generate via `<canvas>`)
7. **"Silenciar notif"** action (requires backend support — TODO(A6) note)

**Commit**: `refactor(group-detail): hero compactación + remove dead UI + hit-target delete + sort table + QR sharing`

---

### Task 9: Refactor group-edit.component.ts

**File**: `src/app/features/groups/group-edit.component.ts`

**Walkthrough findings (doc 10)**:
- Rich image upload (drag&drop, crop, progress, eliminar)
- A3 verified: description renders in detail page
- A4 verified: CanDeactivate guard
- "Eliminar imagen" option missing
- File input native (UI inconsistent)
- Character counters X/40 + X/500
- Markdown support in description
- Reset form action

**Changes**:

1. **Drag & drop zone** for image upload:
   ```html
   <div class="image-dropzone"
        (dragover)="onDragOver($event)"
        (drop)="onDrop($event)"
        [class.dragging]="isDragging()">
     @if (imagePreview()) {
       <img [src]="imagePreview()" alt="Preview">
       <button type="button" (click)="removeImage()">Eliminar imagen</button>
     } @else {
       Arrastra imagen o <input type="file" accept="image/*">
     }
   </div>
   ```

2. **Progress bar** during upload:
   ```html
   @if (uploading()) {
     <progress [value]="uploadProgress()" max="100"></progress>
     <span>{{ uploadProgress() }}%</span>
   }
   ```

3. **Eliminar imagen** action (sets imageKey to null on submit)

4. **Character counters**:
   - Name: `{{ name.length }} / 40`
   - Description: `{{ description.length }} / 500`

5. **Markdown support** in description: use marked.js or simple regex for bold/italic/links. Defer to follow-up if scope creep — for v1, use `white-space: pre-line` to preserve line breaks.

**Commit**: `refactor(group-edit): rich image upload (drag/drop, progress, eliminar) + character counters`

---

### Task 10: Refactor group-prizes-edit.component.ts

**File**: `src/app/features/groups/group-prizes-edit.component.ts`

**Walkthrough findings (doc 11)**:
- CanDeactivate guard missing (vs group-edit which has it)
- Dirty check on Save button (disable if no changes)
- Confirm si user vacía premio guardado
- Empty input deletes premio sin warning
- Cancelar sin confirm if changes
- Error sin role="alert"

**Changes**:

1. **Wire CanDeactivate guard** (existing pattern from group-edit):
   ```typescript
   canDeactivate(): boolean | Promise<boolean> {
     if (!this.dirty()) return true;
     return this.confirmDialog.ask({
       title: 'Cambios sin guardar',
       message: 'Tus cambios se perderán si sales sin guardar.',
       confirmLabel: 'Salir sin guardar',
       danger: true,
     });
   }
   ```

   Add to route config: `canDeactivate: [dirtyFormGuard]`

2. **Add `dirty()` computed signal**:
   ```typescript
   private original = signal({prize1: '', prize2: '', prize3: ''});
   private current = signal({prize1: '', prize2: '', prize3: ''});
   dirty = computed(() => JSON.stringify(this.original()) !== JSON.stringify(this.current()));
   ```

3. **Save button disabled if !dirty()**:
   ```html
   <button [disabled]="!dirty() || saving()">Guardar</button>
   ```

4. **Confirm before saving empty** (deleting):
   ```typescript
   async onSave() {
     if (this.willDeletePremios()) {
       const ok = await this.confirmDialog.ask({...});
       if (!ok) return;
     }
     // save
   }
   ```

5. **role="alert"** in error block

6. **Character counters** for each premio (X/200)

**Commit**: `refactor(group-prizes-edit): wire CanDeactivate + dirty check + role=alert + delete warning`

---

### Task 11: Refactor group-invite-email.component.ts

**File**: `src/app/features/groups/group-invite-email.component.ts`

**Walkthrough findings (doc 12)**:
- `<span (click)>` close button on chip → `<button>` (semantic + a11y)
- memberCount cached without refresh — `groupIsFull` may be stale
- Hint message "debajo del CTA" but rendered before
- CanDeactivate guard
- Subject line missing in email preview
- Hardcoded "polla@golgana.net", URLs in template
- Promise breakage: "Te avisamos cuando alguien se una" needs notif kind JOIN (A6)
- Character counters

**Changes**:

1. **`<span (click)>` → `<button>` on chip close**:
   ```html
   <button type="button" class="chip-remove" (click)="removeEmail(email)"
           aria-label="Quitar {{ email }}">
     <app-icon name="close" size="sm" />
   </button>
   ```

2. **Refresh memberCount before send**:
   ```typescript
   async submit() {
     await this.refreshGroupInfo();
     if (this.groupIsFull()) {
       this.showError('Grupo lleno. No se puede invitar.');
       return;
     }
     // ... send
   }
   ```

3. **Wire CanDeactivate guard** (pattern from group-edit)

4. **Subject line in email preview**:
   ```html
   <div class="email-preview">
     <header>
       <strong>Asunto:</strong> {{ groupName }} te invita a Polla Mundialista 2026
     </header>
     <!-- existing body content -->
   </div>
   ```

5. **Templated email values** — replace hardcoded with config or backend response

6. **Character counters**: message (X/500), emails (X/20 live)

7. **"Enviame el preview a mí"** test button

**Commit**: `refactor(group-invite-email): semantic chip remove + memberCount refresh + CanDeactivate + email subject preview`

---

### Task 12: Verify transfer-admin (already A2 refactor)

**File**: `src/app/features/groups/group-detail.component.ts` (inline modal)

A2 already refactored this to use `<app-modal>`. Verify:
- Modal opens/closes correctly
- ConfirmDialog destructive second step intact
- Radio list of nonAdminMembers renders
- State machine null/'open'/'submitting' preserved

If issues found, fix. Otherwise no commit needed.

**Optional enhancement** (UX gap from doc 28):
- Enriched member info: avatar + score + tenure (currently only @handle)
- Search/filter members if list > 5
- Sort by score / tenure

**Commit (if enhancements applied)**: `refactor(transfer-admin): enriched member info + sort/search`

---

### Task 13: Final verification

```bash
# Tests
npx jest

# Production build
npx ng build --configuration=production

# Grep verifications for cleanup
echo "Page header 4-stats residual:"
grep -E 'class="kpi-strip|class="page-stats"' src/app/features/picks/ src/app/features/home/ 2>/dev/null | wc -l
# Expected: 0 in picks/* (only home retains 1 location)

echo "<app-empty-block> usage in core:"
grep -rln 'app-empty-block' src/app/features/home/ src/app/features/picks/ src/app/features/groups/
# Expected: many (multiple surfaces)

echo "<app-skeleton> usage in core:"
grep -rln 'app-skeleton' src/app/features/home/ src/app/features/picks/ src/app/features/groups/
# Expected: many

echo "CanDeactivate guards wired:"
grep -rln 'canDeactivate\|dirtyFormGuard' src/app/features/groups/
# Expected: at least 3 surfaces (edit, prizes, invite-email)
```

**Acceptance gate**:
- [x] 12 surfaces refactored.
- [x] No 4-stats page header duplicates in picks/*.
- [x] Empty states unified (app-empty-block).
- [x] Skeleton loading where appropriate.
- [x] CanDeactivate wired in 3+ group forms.
- [x] B2 description renders (A3 verified).
- [x] Transfer-admin modal works (A2 verified).
- [x] Tests + production build OK.

**Manual smoke pending** (12 surfaces × many flows):
- Home: each torneo state shows correct CTA
- Picks-list: sub-seg persists across reload + filters work + 2 templates render
- Pick-detail: countdown contextual + skeleton crests
- Picks-tabla-grupos: toggle as tabs + auto-fill + click-to-promote mobile
- Bracket: mobile accordion + scoring table + warning
- Group-stage-predict: embedded mode + auto-save
- Groups-list: skeleton + sort + search + filter
- Group-detail: hero compact + sort table + QR sharing
- Group-edit: drag&drop + progress + eliminar image
- Group-prizes: CanDeactivate + dirty check + role=alert
- Group-invite-email: chip remove + subject preview + CanDeactivate
- Transfer-admin: enriched member info (if applied)

Optional summary commit:
```
chore(a8b): A8b core features refactor complete

12 surfaces refactored:
- home: triple stats consolidated + contextual CTA + 3 empty states
- picks-list: 2-template strategy + filters + persisted sub-seg + page cleanup
- pick-detail: dead match-info eliminated + countdown contextual + skeleton crests
- picks-tabla-grupos: toggle as tabs + auto-fill + click-to-promote + warnings
- bracket: mobile accordion + 6-state legend + scoring table + counter
- group-stage-predict: embedded input + auto-save consolidation
- groups-list: skeleton + sort/search/filter + card enrichment
- group-detail: hero compactación + dead UI removed + QR + hit-target
- group-edit: drag&drop image + progress + eliminar + counters
- group-prizes: CanDeactivate + dirty check + role=alert
- group-invite-email: semantic chips + subject preview + CanDeactivate
- transfer-admin: verified A2 + enriched member info (optional)

Tests passing. Production build OK.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

---

## Summary

A8b produce ~13-15 commits (12 surfaces + final audit + optional summary). Picks-list may need 2-3 sub-commits.

**Dependency**: A1 + A2 + A3 + A4 + A5 (+ A6 partial).

**Sub-proyectos downstream**: NONE — works towards final A8 audit.

**Estimación**: ~2-3 semanas (12 surfaces, picks-list and group-detail are the most complex).

**Dispatch strategy**: 1 sub-agente opus 4.7 coordinator, OR split in 2 dispatches:
- A8b.1 (Tasks 1-6): home + picks family
- A8b.2 (Tasks 7-12): groups family + transfer-admin verify

**Risk**: Medium-high. These are the most-used surfaces of the product. Test thoroughly via manual smoke.
