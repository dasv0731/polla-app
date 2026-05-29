# A4 · Migration Debt Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **All sub-agent dispatches MUST use opus 4.7** per project memory.

**Goal:** Eliminar el código zombie acumulado en el transition design v2 → v3 (200+ líneas en nav.component, auth-shell unused, checkBracketReady dead code, admin-articles UI tras Fase D, ruta /groups/new standalone redundante, Material Symbols dead dependency). Recuperar features valiosos que quedaron enterrados en el zombie nav (bell badge en sidebar, user dropdown, per-group ranking — los 2 últimos como evolución, no copia literal).

**Architecture:** Cleanup mecánico precedido por grep verifications cross-app para confirmar que el código a eliminar no se usa silenciosamente. Cada deletion es 1 commit. Cada recovery es 1 feature commit. Bundle size delta documentado al final como métrica de impacto.

**Tech Stack:** Angular 18 standalone + signals. Sin nuevas dependencias. Cambios isolated a componentes específicos + routes config + import statements.

---

## Cleanup inventory

| # | Item | Type | Scope | Risk |
|---|---|---|---|---|
| 1 | nav.component.ts topnav desktop (130 líneas) | Delete markup + CSS | High volume | Low — `display:none !important` confirmado |
| 2 | nav.component.ts tabbar mobile (30 líneas) | Delete markup + CSS | Medium volume | Low — mismo |
| 3 | nav.component.ts dropdown logic (myGroups, topGroups, ranking dropdown signals) | Delete unused logic | Medium | Low — solo consumido por zombie markup |
| 4 | Sidebar bell badge unread | Recover/Add feature | New feature | Low — subscription exists en nav.component |
| 5 | Sidebar user dropdown (notif/perfil/logout) | Recover/Add feature | New feature | Medium — visual design |
| 6 | Per-group ranking dropdown | Recover/Reimagine | New feature | Medium — decisión: sidebar accordion vs /ranking landing |
| 7 | auth-shell.component.ts | Delete file + verify no usage | Low | Low |
| 8 | checkBracketReady dead code | Delete method + signal + ngOnInit call | Low | Low |
| 9 | admin-articles UI completo | Delete files + routes + sidebar entry | Medium | Medium — Fase D decision |
| 10 | `/groups/new` standalone route | Delete route + 5 link references | Medium | Low — modal openCreate() replaces |
| 11 | Material Symbols font import | Delete from tokens.css + index.html | Low | Low — no component uses |

---

## File Structure

**Delete entirely**:
- `src/app/shared/layout/auth-shell.component.ts` (no usado)
- `src/app/features/admin/admin-articles*.component.ts` (Fase D)
- `src/app/features/groups/group-create.component.ts` (si la ruta `/groups/new` se elimina — verificar antes)

**Modify** (significantly reduce):
- `src/app/shared/layout/nav.component.ts` — keep solo topbar mobile + auth subscription hooks; delete topnav desktop + tabbar mobile (~250 líneas de las 393)
- `src/app/shared/layout/sidebar.component.ts` — add bell badge + user dropdown + remove checkBracketReady; consume `myGroups`/`isAdmin` signals that previously lived in nav

**Modify** (small):
- `src/app/app.routes.ts` — delete `/groups/new` route + admin-articles routes
- `src/styles/tokens.css` — remove `--font-icons: "Material Symbols Outlined"`
- `src/index.html` — remove Material Symbols `<link>` si existe
- `src/app/features/picks/picks-list.component.ts`, `bracket-picks.component.ts`, `group-stage-picks.component.ts`, `ranking.component.ts`, `special-picks.component.ts` — 5 surfaces con links `routerLink="/groups/new"` → cambiar a botones `(click)="openCreate()"`

---

## Tasks

### Task 1: Audit references before deletion (safety scan)

**Files:** Ninguno modificado. Solo verificación.

- [ ] **Step 1: Grep all references to deletion targets**

Run multiple greps:

```bash
# auth-shell usage
grep -rln 'AuthShellComponent\|app-auth-shell' src/app/

# checkBracketReady usage outside sidebar
grep -rln 'checkBracketReady\|bracketReady' src/app/

# admin-articles references
grep -rln 'admin-articles\|AdminArticles\|listPublishedArticles' src/app/

# /groups/new route references
grep -rln "groups/new\|/groups\\\\new" src/app/

# Material Symbols usage
grep -rln 'Material Symbols\|ms-outlined\|material-symbols\|font-icons' src/app/ src/

# topnav desktop / tabbar mobile usage
grep -rln 'app-topnav\|app-tabbar' src/app/
```

**Expected results para safe deletion**:
- auth-shell: 0 component imports (only its own file).
- bracketReady: 0 consumers fuera de sidebar.component.ts.
- admin-articles: route + component + sidebar entry only.
- /groups/new: ~5 links in features + 1 route + 1 component (group-create).
- Material Symbols: 0 component uses (only tokens.css declaration).
- app-topnav/app-tabbar: 0 outside nav.component.ts.

- [ ] **Step 2: Document findings**

Crear un audit log temporal:

```bash
mkdir -p docs/superpowers/audits
cat > docs/superpowers/audits/2026-05-28-a4-cleanup-audit.md << 'EOF'
# A4 Cleanup Pre-Delete Audit

Date: 2026-05-28

## auth-shell.component.ts references
[paste grep output here]

## bracketReady consumers
[paste grep output here]

## admin-articles references
[paste grep output here]

## /groups/new references
[paste grep output here]

## Material Symbols references
[paste grep output here]

## app-topnav / app-tabbar references
[paste grep output here]

## Conclusion
- Safe to delete: [list]
- Requires recovery: [list]
- Needs decision: [list]
EOF
```

Llenar el audit log con grep outputs reales. Si encuentras consumers inesperados (e.g. auth-shell usado en un surface no documentado), FLAG y NO procedas con esa deletion sin discutir.

- [ ] **Step 3: Commit audit**

```bash
git add docs/superpowers/audits/2026-05-28-a4-cleanup-audit.md
git commit -m "docs(audit): pre-A4 cleanup grep audit

Verify safety of zombie code deletion before applying."
```

---

### Task 2: Delete topnav desktop markup + CSS from nav.component.ts

**Files:**
- Modify: `src/app/shared/layout/nav.component.ts`

- [ ] **Step 1: Read nav.component.ts líneas 17-145 (topnav desktop)**

Read `src/app/shared/layout/nav.component.ts`. Verify range 17-145 contiene el bloque `<!-- ============ DESKTOP TOPNAV (≥992px) ============ -->` con todo el markup hasta el cierre `</header>`.

- [ ] **Step 2: Delete the block**

Remove el bloque completo desde `<header class="app-topnav">` hasta su `</header>` cierre. Delete also las relacionadas CSS rules `.app-topnav*` en el styles block.

Verify usings:
- `myGroups`, `topGroups` computed → eliminar si solo se usaban en el topnav.
- `open` signal con type `DropdownKey` → eliminar si solo se usaba para topnav dropdowns.
- `toggle()`, `closeAll()` methods → eliminar si solo topnav los llamaba.
- `HostListener('document:click')` + `HostListener('document:keydown.escape')` → eliminar si solo eran para topnav dropdowns. Mobile topbar NO los necesita (no tiene dropdowns).

**Importante**: el mobile topbar sí usa `unreadCount` signal + `sync` service. **PRESERVAR** esos signals + subscription.

- [ ] **Step 3: Verify build still passes**

```bash
npx ng build --configuration=development
```

Expected: success. Si fail por TS errors de `myGroups`/`topGroups` consumed elsewhere, restaurar y re-check Step 1 audit.

- [ ] **Step 4: Verify no runtime errors**

```bash
npx ng serve
```

Open browser, navigate `/home`. Expected: topbar mobile visible en window <992px. Sidebar visible en desktop. NO white page o JS errors en console.

- [ ] **Step 5: Commit**

```bash
git add src/app/shared/layout/nav.component.ts
git commit -m "refactor(nav): delete topnav desktop zombie (130 lines markup + CSS)

A4 cleanup. Topnav desktop was display:none !important since
design v3 transition (sidebar absorbs primary nav). Markup +
logic were dead code consuming bundle + maintenance.

Refs: docs/ux-redesign/31-shell-nav.md"
```

---

### Task 3: Delete tabbar mobile markup + CSS from nav.component.ts

**Files:**
- Modify: `src/app/shared/layout/nav.component.ts`

- [ ] **Step 1: Read remaining tabbar mobile block**

Read `src/app/shared/layout/nav.component.ts` y find el bloque `<!-- ============ MOBILE TABBAR (<992px) ============ -->` con su markup.

- [ ] **Step 2: Delete the block + CSS**

Remove `<nav class="app-tabbar">` hasta su cierre `</nav>`. Delete CSS `.app-tabbar*` rules.

- [ ] **Step 3: Verify nav.component now mucho más corto**

```bash
wc -l src/app/shared/layout/nav.component.ts
```

Expected: < 200 líneas (de 393 originales).

- [ ] **Step 4: Build + smoke**

```bash
npx ng build --configuration=development
npx ng serve
```

Navigate mobile viewport. Expected: topbar mobile visible. Bottom-nav (sidebar mobile) visible. No tabbar zombie rendered.

- [ ] **Step 5: Commit**

```bash
git add src/app/shared/layout/nav.component.ts
git commit -m "refactor(nav): delete tabbar mobile zombie (30 lines markup + CSS)

A4 cleanup. Tabbar mobile was display:none !important since v3
(sidebar bottom-nav absorbs the role). Markup + styles dead.

Refs: docs/ux-redesign/31-shell-nav.md"
```

---

### Task 4: Add bell badge unread count to sidebar bottom area

**Files:**
- Modify: `src/app/shared/layout/sidebar.component.ts` — agregar badge a `.lsb__bell`

- [ ] **Step 1: Read sidebar.component.ts bottom area**

Read líneas 51-59 donde está `.lsb__bottom` con el `.lsb__bell` link.

- [ ] **Step 2: Add unreadCount signal to sidebar + subscription**

Sidebar component currently NO tiene la subscription a notifications. Necesita agregarla — copiar desde lo que fue nav.component:

```typescript
import { OnInit, OnDestroy } from '@angular/core';

// ... agregar a SidebarComponent class:
unreadCount = signal(0);
private notifSub: { unsubscribe: () => void } | undefined;

async ngOnInit() {
  // ... existing checkBracketReady call (será eliminado en Task 8) ...
  const userId = this.auth.user()?.sub;
  if (userId) {
    this.notifSub = this.api.observeMyNotifications(userId).subscribe({
      next: (snap) => {
        const items = snap.items as Array<{ readAt: string | null }>;
        const unread = items.filter((n) => !n.readAt).length;
        this.unreadCount.set(unread);
      },
      error: (err: unknown) => {
        // TODO telemetry post-A4
      },
    });
  }
}

ngOnDestroy() {
  if (this.notifSub) this.notifSub.unsubscribe();
}
```

- [ ] **Step 3: Add badge markup in template**

Modificar el `.lsb__bell` link para incluir badge:

```html
<a routerLink="/notificaciones" routerLinkActive="active" class="lsb__bell">
  <span class="lsb__i" aria-hidden="true">🔔</span>
  <span class="lsb__t">Notificaciones</span>
  @if (unreadCount() > 0) {
    <span class="lsb__bell-badge"
          [attr.aria-label]="unreadCount() + ' notificaciones sin leer'">
      {{ unreadCount() > 99 ? '99+' : unreadCount() }}
    </span>
  }
</a>
```

- [ ] **Step 4: Add badge CSS**

Agregar al styles array de sidebar.component.ts:

```css
.lsb__bell { position: relative; }
.lsb__bell-badge {
  position: absolute;
  top: 4px;
  right: 4px;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  background: var(--color-lost);
  color: #fff;
  border-radius: 9px;
  font-size: 10px;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
}

/* En mobile bottom-nav, badge moves to top corner of icon */
@media (max-width: 767px) {
  .lsb__bell-badge {
    top: 2px;
    right: calc(50% - 18px);
  }
}
```

**Nota**: En mobile la sidebar es bottom-nav y `.lsb__bottom { display: none }`. El bell badge NO se ve en mobile via sidebar — el nav.component.ts topbar mobile ya tiene su propio bell badge (NO eliminar ese).

- [ ] **Step 5: Manual smoke**

Manual: create un par de notifications (admin action o manual via backend). Login as test user. Expected: sidebar bell shows badge con count.

- [ ] **Step 6: Commit**

```bash
git add src/app/shared/layout/sidebar.component.ts
git commit -m "feat(sidebar): add unread bell badge to bottom area (recovered from zombie nav)

A4 recovery. Bell badge was implemented in zombie nav.component
desktop topnav but invisible due to display:none. Recovered the
subscription logic + badge UI into sidebar bottom area where it
fits the new design v3 architecture.

Refs: docs/ux-redesign/30-sidebar.md, 31-shell-nav.md"
```

---

### Task 5: Add user dropdown to sidebar bottom area (notif/perfil/logout)

**Files:**
- Modify: `src/app/shared/layout/sidebar.component.ts` — add expandable user section

- [ ] **Step 1: Design decision — expand on hover OR click**

**Recomendación**: el sidebar desktop ya hace hover-expand (64 → 200 px). El user area (`.lsb__usr`) actualmente muestra avatar + handle on hover. Agregar dropdown:

- **Default colapsado**: solo avatar visible.
- **Hover sidebar**: handle visible.
- **Click avatar**: opens small popover hacia la derecha con (notif / perfil / cerrar sesión).

Para mobile, `.lsb__bottom` is hidden — esto NO afecta mobile (topbar mobile maneja avatar).

- [ ] **Step 2: Add open signal + click handler**

En SidebarComponent:

```typescript
userMenuOpen = signal(false);

toggleUserMenu(event: Event) {
  event.stopPropagation();
  this.userMenuOpen.update((v) => !v);
}

@HostListener('document:click')
onDocumentClick() {
  if (this.userMenuOpen()) this.userMenuOpen.set(false);
}

@HostListener('document:keydown.escape')
onEscape() {
  if (this.userMenuOpen()) this.userMenuOpen.set(false);
}

async logout() {
  this.userMenuOpen.set(false);
  const ok = await this.confirmDialog.ask({
    title: 'Cerrar sesión',
    message: '¿Quieres cerrar sesión? Vas a salir de tu cuenta y volverás al login.',
    confirmLabel: 'Cerrar sesión',
    cancelLabel: 'Cancelar',
    danger: true,
  });
  if (!ok) return;
  await this.auth.logout();
  void this.router.navigate(['/login']);
}
```

Import `Router`, `ConfirmDialogService`, etc.

**Nota copy**: usar "tú" (decisión producto A5), no "vos". Y `danger: true` (resuelve gap doc 31 + 34).

- [ ] **Step 3: Replace `.lsb__usr` link con button + dropdown**

Cambiar el `.lsb__usr` actual de `<a routerLink="/profile">` a un button que abre dropdown:

```html
<div class="lsb__usr-wrap" (click)="$event.stopPropagation()">
  <button type="button" class="lsb__usr"
          (click)="toggleUserMenu($event)"
          [attr.aria-expanded]="userMenuOpen()"
          aria-haspopup="true">
    <div class="lsb__av">{{ avatarInitials() }}</div>
    <span class="lsb__t" translate="no">{{ '@' + (handle() ?? 'jugador') }}</span>
  </button>
  @if (userMenuOpen()) {
    <div class="lsb__user-panel" role="menu">
      <a class="lsb__user-panel-item" role="menuitem"
         routerLink="/notificaciones"
         (click)="userMenuOpen.set(false)">
        Notificaciones
        @if (unreadCount() > 0) {
          <span class="lsb__panel-badge">{{ unreadCount() }}</span>
        }
      </a>
      <a class="lsb__user-panel-item" role="menuitem"
         routerLink="/profile"
         (click)="userMenuOpen.set(false)">
        Mi perfil
      </a>
      <hr class="lsb__user-panel-sep">
      <button type="button" class="lsb__user-panel-item lsb__user-panel-item--danger"
              role="menuitem" (click)="logout()">
        Cerrar sesión
      </button>
    </div>
  }
</div>
```

- [ ] **Step 4: Add panel CSS**

```css
.lsb__usr-wrap {
  position: relative;
  width: 100%;
}
.lsb__usr {
  background: transparent;
  border: 0;
  cursor: pointer;
  font: inherit;
  color: inherit;
}
.lsb__user-panel {
  position: absolute;
  left: calc(100% + 8px);
  bottom: 0;
  min-width: 200px;
  background: var(--color-primary-white);
  border: 1px solid var(--color-line);
  border-radius: 10px;
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.18);
  padding: 6px;
  z-index: var(--z-dropdown);
}
.lsb__user-panel-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 9px 10px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  color: var(--color-primary-black);
  text-decoration: none;
  background: transparent;
  border: 0;
  cursor: pointer;
  font-family: inherit;
  text-align: left;
}
.lsb__user-panel-item:hover {
  background: var(--color-green-5);
}
.lsb__user-panel-item--danger {
  color: var(--color-lost);
}
.lsb__user-panel-sep {
  border: 0;
  border-top: 1px solid var(--color-line);
  margin: 4px 0;
}
.lsb__panel-badge {
  background: var(--color-lost);
  color: #fff;
  border-radius: 9px;
  padding: 2px 7px;
  font-size: 10px;
  font-weight: 700;
}
```

- [ ] **Step 5: Manual smoke test**

Navigate `/home`. Hover sidebar to expand. Click avatar. Expected: dropdown opens to the right. Click outside → closes. Esc → closes. Click "Mi perfil" → navigates. Click "Cerrar sesión" → ConfirmDialog opens with danger=true.

- [ ] **Step 6: Commit**

```bash
git add src/app/shared/layout/sidebar.component.ts
git commit -m "feat(sidebar): add user dropdown bottom area (recovered from zombie nav)

A4 recovery. User dropdown (notif / perfil / logout) was implemented
in zombie nav.component but invisible. Recovered with sidebar-specific
visual treatment (popover to right of bottom area), logout uses
danger: true confirmDialog (fixes doc 34 gap), 'tú' wording (A5).

Refs: docs/ux-redesign/30-sidebar.md, 31-shell-nav.md, 34-confirm-dialog.md"
```

---

### Task 6: Decide per-group ranking dropdown — sidebar accordion OR /ranking landing

**Files:** Decisión + implementación choice (1 of 2 options).

- [ ] **Step 1: Decide approach**

**Original zombie pattern**: Topnav desktop tenía `Ranking ▾` dropdown con (Global + per-group + Ver todos).

**Recommendation**: NO recovery to sidebar. Sidebar is space-constrained. Instead, **enhance `/ranking` page**:
- Page already has tabs Global / Mis grupos.
- Make "Mis grupos" tab show LIST of groups con click-to-rank.
- Plus: in `/groups/:id`, ranking section already exists per group.

**Alternative**: small dropdown in sidebar Ranking item.

**Decision**: enhance `/ranking` page tabs (option A). Skip sidebar dropdown — feature lives natively in `/ranking`.

- [ ] **Step 2: Verify `/ranking` Mis grupos tab functionality**

Read `src/app/features/ranking/ranking.component.ts`. Verify tab "Mis grupos" shows current user's groups y permite navegar a `/groups/:id` for per-group ranking.

If NOT implemented or incomplete, implement:

```html
<div class="rank-groups-list" *ngIf="scope() === 'mis-grupos'">
  @for (g of myGroups(); track g.id) {
    <a [routerLink]="['/groups', g.id]" class="rank-group-card">
      <div class="rank-group-card__name">{{ g.name }}</div>
      <div class="rank-group-card__meta">
        Pos #{{ g.myRank }} de {{ g.memberCount }} · {{ g.mode === 'COMPLETE' ? 'Completo' : 'Simple' }}
      </div>
    </a>
  }
</div>
```

Si ya está implementado, skip this task con un commit "verified" no-op.

- [ ] **Step 3: Document decision**

Update `docs/superpowers/specs/2026-05-28-ux-redesign-master-plan-design.md` agregando nota inline al item A4 sobre per-group ranking:

```markdown
**Per-group ranking dropdown decision (A4 implementation)**: NO recovery to sidebar (space-constrained). Lives natively in /ranking page "Mis grupos" tab + /groups/:id rank section. Sidebar stays simple.
```

Add this note al sub-proyecto A4 section.

- [ ] **Step 4: Commit (if changes were needed)**

```bash
git add src/app/features/ranking/ranking.component.ts docs/superpowers/specs/2026-05-28-ux-redesign-master-plan-design.md
git commit -m "feat(ranking): enhance Mis grupos tab with per-group click-to-rank (A4 recovery decision)

A4 decision: per-group ranking dropdown from zombie nav.component
is NOT recovered to sidebar (space-constrained). Instead, /ranking
page Mis grupos tab handles the use case natively.

Refs: docs/ux-redesign/31-shell-nav.md"
```

---

### Task 7: Delete auth-shell.component.ts

**Files:**
- Delete: `src/app/shared/layout/auth-shell.component.ts`

**Prerequisite**: Task 1 audit confirmed 0 imports of `AuthShellComponent`.

- [ ] **Step 1: Verify no last-minute references**

```bash
grep -rln 'AuthShellComponent\|app-auth-shell' src/app/
```

Expected output: **only** `src/app/shared/layout/auth-shell.component.ts` itself.

- [ ] **Step 2: Delete file**

```bash
rm src/app/shared/layout/auth-shell.component.ts
```

- [ ] **Step 3: Verify build**

```bash
npx ng build --configuration=development
```

Expected: success.

- [ ] **Step 4: Commit**

```bash
git add -A src/app/shared/layout/
git commit -m "refactor(layout): delete auth-shell.component.ts unused

A4 cleanup. AuthShellComponent was a leftover from design v2 transition.
Login/register/forgot implement their own brand-panel layout inline.
0 consumers verified in pre-delete audit.

Refs: docs/ux-redesign/36-footer-auth-shell.md"
```

---

### Task 8: Delete checkBracketReady dead code

**Files:**
- Modify: `src/app/shared/layout/sidebar.component.ts` — remove method + signal + ngOnInit call

- [ ] **Step 1: Read sidebar.component.ts líneas 213-236**

Read y confirm:
- `bracketReady = signal(false);` declaration.
- `ngOnInit() { void this.checkBracketReady(); }` call.
- `private async checkBracketReady() { ... }` method (~25 líneas).

Verify (from Task 1 audit) que NO hay otros consumers.

- [ ] **Step 2: Remove the signal + method + ngOnInit call**

Delete:
- `bracketReady = signal(false);` line.
- The `checkBracketReady()` method body.
- The `void this.checkBracketReady();` line in ngOnInit (mantener ngOnInit si tiene otras cosas — like notification subscription added en Task 4).

Verify no leftover imports unused (e.g. `TOURNAMENT_ID` constant if only used here).

- [ ] **Step 3: Build + smoke**

```bash
npx ng build --configuration=development
npx ng serve
```

Navigate `/home`. Expected: NO 2 API calls a `listMatches + listPhases` cuando sidebar mounts (verify via Network tab DevTools). Sidebar render normal.

- [ ] **Step 4: Commit**

```bash
git add src/app/shared/layout/sidebar.component.ts
git commit -m "refactor(sidebar): delete checkBracketReady dead code (2 API calls saved per mount)

A4 cleanup. checkBracketReady was marked 'Kept for parity with previous
sidebar' in comments but NO consumer used the bracketReady signal (audit
confirmed 0 references). Made 2 API calls (listMatches + listPhases)
unnecessarily on every sidebar mount.

Refs: docs/ux-redesign/30-sidebar.md"
```

---

### Task 9: Delete admin-articles UI completely

**Files:**
- Delete: `src/app/features/admin/admin-articles*.component.ts` (verify file names from Task 1 audit)
- Modify: `src/app/app.routes.ts` — remove admin-articles routes
- Modify: `src/app/features/admin/admin-dashboard.component.ts` — remove sidebar/menu entry if any

- [ ] **Step 1: List admin-articles files**

```bash
ls src/app/features/admin/admin-articles* 2>/dev/null
ls src/app/features/admin/*article* 2>/dev/null
```

Expected: any admin-articles files. Si NONE encontrados, admin-articles ya fue eliminado en Fase D — skip a Step 5.

- [ ] **Step 2: Delete files**

```bash
rm src/app/features/admin/admin-articles*
# or specific files identified
```

- [ ] **Step 3: Remove route entries**

Read `src/app/app.routes.ts`. Find routes para `/admin/articles` o similar. Delete.

- [ ] **Step 4: Remove sidebar/menu entries**

Read `src/app/features/admin/admin-dashboard.component.ts`. Find link to admin-articles. Delete.

- [ ] **Step 5: Verify Article model usage**

```bash
grep -rln 'listPublishedArticles\|Article\b' src/app/
```

Expected: right-rail.component.ts uses listPublishedArticles. Verify if backend Article model also needs deletion (separate concern — A6 backend cleanup).

**Decisión inline**: right-rail seed data hardcoded per producto decision (memory). Backend Article model puede mantenerse hasta polla-public integration. NO delete backend in A4.

- [ ] **Step 6: Build + commit**

```bash
npx ng build --configuration=development
git add -A src/app/features/admin/ src/app/app.routes.ts
git commit -m "refactor(admin): delete admin-articles UI (Fase D, A4 cleanup)

A4 cleanup, Fase D decision. Admin-articles UI completely removed.
Article model backend retained for right-rail seed integration with
polla-public (eventual).

Refs: docs/ux-redesign/32-right-rail.md"
```

---

### Task 10: Delete `/groups/new` standalone route + replace links with modal triggers

**Files:**
- Modify: `src/app/app.routes.ts` — remove `/groups/new` route
- Delete: `src/app/features/groups/group-create.component.ts` (after verifying nothing else uses it)
- Modify: 5 surfaces with `routerLink="/groups/new"` → switch to `(click)="openCreateGroup()"`

**Prerequisite**: A1 mergeado (provides EmptyBlockComponent), so empty states con `/groups/new` link refactor cleanly.

- [ ] **Step 1: Identify 5 surfaces with `/groups/new` links**

From Task 1 audit, expected 5 surfaces:
- picks-list.component.ts (banner)
- bracket-picks.component.ts (empty state)
- group-stage-picks.component.ts (empty state)
- ranking.component.ts (empty state global)
- special-picks.component.ts (empty state)

Confirm:

```bash
grep -rln 'routerLink="/groups/new"' src/app/
```

- [ ] **Step 2: Refactor each surface to use modal trigger**

For each of the 5 surfaces:

Replace:
```html
<a routerLink="/groups/new" class="btn btn--primary">Crear grupo</a>
```

With:
```typescript
// In component:
import { GroupActionsService } from '../../core/groups/group-actions.service';
private groupActions = inject(GroupActionsService);
openCreate() { this.groupActions.openCreate(); }
openJoin() { this.groupActions.openJoin(); }
```

```html
<button type="button" class="btn btn--primary" (click)="openCreate()">Crear grupo</button>
<button type="button" class="btn btn--ghost" (click)="openJoin()">Unirme con código</button>
```

**Nota**: agregar también "Unirme con código" cuando estaba ausente (synthesis G5).

- [ ] **Step 3: Verify build + smoke**

```bash
npx ng build --configuration=development
```

Navigate each surface in dev server, verify buttons open the modal correctly.

- [ ] **Step 4: Delete standalone route + component**

Read `src/app/app.routes.ts`. Find:
```typescript
{
  path: 'groups/new',
  loadComponent: () => import('./features/groups/group-create.component').then(m => m.GroupCreateComponent),
}
```

Delete this route entry.

```bash
grep -rln 'GroupCreateComponent' src/app/
```

If only the deleted route file referenced it, safe to delete component:

```bash
rm src/app/features/groups/group-create.component.ts
```

- [ ] **Step 5: Build + commit**

```bash
npx ng build --configuration=production
git add -A src/app/
git commit -m "refactor(groups): delete /groups/new standalone route, use openCreate() modal everywhere

A4 cleanup, synthesis G4. Post-Fase A modal-based create was the
intended UX but 5 surfaces still linked to standalone /groups/new
page. Unified all to GroupActionsService.openCreate() modal trigger.
Also added 'Unirme con código' CTA where missing (G5).

Refs: docs/ux-redesign/02, 05, 06, 07, 15 (cross-cutting G4+G5)"
```

---

### Task 11: Remove Material Symbols dead dependency

**Files:**
- Modify: `src/styles/tokens.css` — remove `--font-icons` declaration
- Modify: `src/index.html` — remove Material Symbols `<link>` if exists

- [ ] **Step 1: Verify no component uses Material Symbols class**

```bash
grep -rln 'material-symbols\|ms-outlined\|font-icons' src/app/
```

Expected: 0 matches in components (only tokens.css declaration).

- [ ] **Step 2: Remove --font-icons from tokens.css**

Read `src/styles/tokens.css`. Find line `--font-icons: "Material Symbols Outlined";`. Delete it.

- [ ] **Step 3: Remove Material Symbols link from index.html if present**

```bash
grep -i 'material' src/index.html
```

If found a `<link>` element loading the font, remove it.

- [ ] **Step 4: Verify build**

```bash
npx ng build --configuration=production
```

Expected: success. Bundle size delta should show slight reduction.

- [ ] **Step 5: Commit**

```bash
git add src/styles/tokens.css src/index.html
git commit -m "refactor: remove Material Symbols dead dependency

A4 cleanup. --font-icons: 'Material Symbols Outlined' was declared
in tokens.css but NO component used it (audit verified 0 references).
All actual icons in app were emojis (now being replaced by Lucide
in A1). Removed dead font declaration + index.html link if present.

Refs: docs/ux-redesign/30-sidebar.md, 31-shell-nav.md (icon system context)"
```

---

### Task 12: Final verification + bundle size delta

**Files:** Ninguno modificado.

- [ ] **Step 1: Run all tests**

```bash
npx jest
```

Expected: all pass, no new failures.

- [ ] **Step 2: Verify grep deletions**

```bash
# auth-shell gone
grep -rln 'AuthShellComponent\|app-auth-shell' src/app/ | wc -l
# Expected: 0

# checkBracketReady gone
grep -rln 'checkBracketReady\|bracketReady' src/app/ | wc -l
# Expected: 0

# admin-articles gone
grep -rln 'admin-articles\|AdminArticles' src/app/features/admin/ | wc -l
# Expected: 0

# /groups/new no longer linked
grep -rln 'routerLink="/groups/new"' src/app/ | wc -l
# Expected: 0

# Material Symbols not declared
grep -c 'Material Symbols' src/styles/tokens.css
# Expected: 0

# nav.component significantly smaller
wc -l src/app/shared/layout/nav.component.ts
# Expected: < 200 (vs 393 baseline)

# nav.component zombie classes gone
grep -E 'app-topnav\|app-tabbar' src/app/shared/layout/nav.component.ts | wc -l
# Expected: 0
```

All zeros (or appropriate threshold for nav.component lines).

- [ ] **Step 2: Bundle size delta**

```bash
# Build production
npx ng build --configuration=production

# Show main bundle size
ls -lh dist/*/main*.js
```

Document the size. Compare with pre-A4 baseline (recorded in commit message of last pre-A4 commit).

- [ ] **Step 3: Final smoke test**

Manual smoke through critical surfaces:
- Sidebar: bell badge visible + user dropdown opens + per-group ranking accessible via /ranking.
- /home: render OK.
- /groups (empty): CTAs visible + open modal.
- /picks/bracket (empty): CTAs use modal (no link to /groups/new).
- /admin: no admin-articles entry.
- Network tab: sidebar mount doesn't trigger checkBracketReady calls.

- [ ] **Step 4: Acceptance gate checklist**

Verificar contra spec A4:
- [x] `nav.component.ts` < 200 líneas (vs 393 actual).
- [x] Sidebar bottom area incluye bell con badge unread + user dropdown.
- [x] Per-group ranking accessible (en /ranking landing).
- [x] `grep "auth-shell\|checkBracketReady"` = 0 matches.
- [x] admin-articles UI completamente eliminada.
- [x] `/groups/new` standalone route eliminada + 5 surfaces refactorizadas.
- [x] Material Symbols dead dependency removed.
- [x] Bundle size delta documented.
- [x] Tests existentes verdes.

- [ ] **Step 5: Optional summary commit**

```bash
git log --oneline -20
git commit --allow-empty -m "chore(a4): A4 migration debt cleanup complete

Summary:
- nav.component.ts: 393 → ~XXX lines (zombie deleted)
- Sidebar gained: bell badge unread + user dropdown (notif/perfil/logout)
- Deleted: auth-shell.component.ts, checkBracketReady, admin-articles UI,
  /groups/new standalone route + GroupCreateComponent, Material Symbols
  font declaration
- 5 surfaces refactored: /groups/new link → openCreate() modal + 'Unirme con código' added (G5)

Bundle size delta: [insert MB] (smaller).
Spec: docs/superpowers/specs/2026-05-28-ux-redesign-master-plan-design.md A4"
```

---

## Summary

A4 produce 6 deletions + 3 feature recoveries documentadas en ~12 commits independientes.

**Dependency**: Task 4-5 (bell badge + user dropdown) require A1 mergeado (tokens for badge styling). Task 10 requires A1 (EmptyBlockComponent). Otros tasks son independientes.

**Sub-proyectos downstream que se benefician**:
- A8a (sidebar mobile): bell badge pattern + user menu pattern para mobile drawer
- A8b (groups list): empty state ya usa modal triggers correctos
- A8c (ranking): "Mis grupos" tab enriquecido para per-group rank

**Estimación**: ~5 días (12 tasks de 30 min cada una + integration testing). Sprint 1 spec dijo 3 días — synthesis añadió scope.

**Dispatch strategy**: 1 sub-agente opus 4.7 coordinador. Tasks ordenados por safety:
1. Audit primero (Task 1).
2. Markup deletions (Task 2-3) seguidas.
3. Feature recoveries (Task 4-6) — riesgo mayor.
4. File deletions (Task 7-11) — independientes.
5. Final verification (Task 12).

**Next**: A4 mergeable independiente. No bloquea otros sub-proyectos.
