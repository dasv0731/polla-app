# Empresas — Sub-1 (Companies Foundation) Frontend Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Companion plan:** `docs/superpowers/plans/2026-05-30-empresas-sub1-foundation.md` (Tasks 1-11, backend). This file picks up at Task 12.

**Spec:** `docs/superpowers/specs/2026-05-30-empresas-master-design.md`

**Order:** Backend Tasks 1-11 + sandbox deploy (Task 22) must complete BEFORE Tasks 12-21 so the regenerated `amplify_outputs.json` exposes the new mutations to the typed Amplify client.

---

## Phase 3 — Frontend API layer

### Task 12: Domain errors map + ApiService extension

**Repo:** `polla-app/` at `C:\Users\Marke\Documents\Respaldo\polla mundialista\polla-app\`
**Files:**
- Modify: `src/app/core/notifications/domain-errors.ts`
- Modify: `src/app/core/api/api.service.ts`

- [ ] **Step 1: Map the 4 new domain errors to Spanish**

In `src/app/core/notifications/domain-errors.ts`, add the four new entries in the same shape as the existing entries (the file uses a Record/switch — match whichever convention is already in place):

```ts
COMPANY_NOT_FOUND: 'Esta empresa no existe.',
COMPANY_DISABLED: 'La empresa está desactivada. Reactivala antes de hacer cambios.',
NOT_COMPANY_ADMIN: 'No tenés permisos para gestionar esta empresa.',
LAST_COMPANY_ADMIN: 'No podés remover al último admin. Agregá otro admin antes.',
```

- [ ] **Step 2: Add 12 new methods to ApiService**

Open `src/app/core/api/api.service.ts`. Locate the existing block that defines `markEntryFeePaid` (from the Cuota feature) and add the new methods right below it. Each method is a thin facade over `apiClient.mutations.*` / `apiClient.models.*`.

```ts
  // ===== Empresas — Sub-1 =====

  createCompany(input: {
    name: string;
    contactEmail?: string;
    description?: string;
    firstAdminUserId: string;
  }) {
    return apiClient.mutations.createCompany(input as never);
  }

  updateCompany(input: {
    id: string;
    name?: string;
    contactEmail?: string | null;
    description?: string | null;
    logoKey?: string | null;
    brandPrimary?: string | null;
    brandPrimaryDark?: string | null;
    brandAccent?: string | null;
  }) {
    return apiClient.mutations.updateCompany(input as never);
  }

  setCompanyStatus(input: { id: string; status: 'ACTIVE' | 'DISABLED' }) {
    return apiClient.mutations.setCompanyStatus(input as never);
  }

  addCompanyAdmin(input: { companyId: string; userId: string }) {
    return apiClient.mutations.addCompanyAdmin(input as never);
  }

  removeCompanyAdmin(input: { companyId: string; userId: string }) {
    return apiClient.mutations.removeCompanyAdmin(input as never);
  }

  createCompanyGroup(input: {
    companyId: string;
    name: string;
    tournamentId: string;
    mode: 'SIMPLE' | 'COMPLETE';
    category?: string;
    description?: string;
    adminUserId?: string;
  }) {
    return apiClient.mutations.createCompanyGroup(input as never);
  }

  updateCompanyGroup(input: {
    id: string;
    name?: string;
    description?: string | null;
    imageKey?: string | null;
    category?: string | null;
    entryFeeEnabled?: boolean;
    entryFeeInstructions?: string | null;
    prize1st?: string | null;
    prize2nd?: string | null;
    prize3rd?: string | null;
    adminUserId?: string;
  }) {
    return apiClient.mutations.updateCompanyGroup(input as never);
  }

  /** List all Companies (super-admin surface uses this). */
  listCompanies() {
    return apiClient.models.Company.list();
  }

  getCompany(id: string) {
    return apiClient.models.Company.get({ id });
  }

  /** List CompanyMember rows for a given company. */
  listCompanyMembers(companyId: string) {
    return apiClient.models.CompanyMember.list({
      filter: { companyId: { eq: companyId } },
    } as never);
  }

  /** List Groups belonging to a company via the groupsByCompany GSI. */
  listCompanyGroups(companyId: string) {
    return apiClient.models.Group.list({
      filter: { companyId: { eq: companyId } },
    } as never);
  }

  /** Search Users by handle prefix or email substring. Returns up to 10
   *  matches. Used by the AdminPickerComponent. */
  searchUsers(query: string) {
    const q = query.trim();
    if (q.length < 2) {
      return Promise.resolve({ data: [] as Array<{ sub: string; handle: string; email: string; avatarKey: string | null }> });
    }
    return apiClient.models.User.list({
      filter: {
        or: [
          { handle: { beginsWith: q } },
          { email: { contains: q } },
        ],
      },
      limit: 10,
    } as never);
  }
```

- [ ] **Step 3: Typecheck**

```
npx tsc --noEmit -p tsconfig.app.json
```

Expected: success. The `as never` casts suppress strict typing on the new mutations until the generated Schema types include them post-deploy.

- [ ] **Step 4: Commit**

```bash
git add src/app/core/notifications/domain-errors.ts src/app/core/api/api.service.ts
git commit -m "feat(api): Empresas Sub-1 surface — 12 methods + 4 errors

ApiService methods:
- createCompany / updateCompany / setCompanyStatus
- addCompanyAdmin / removeCompanyAdmin
- createCompanyGroup / updateCompanyGroup
- listCompanies / getCompany / listCompanyMembers / listCompanyGroups
- searchUsers (handle beginsWith OR email contains, max 10)

Domain errors mapped to Spanish messages with tú voice.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
"
```

---

## Phase 4 — Frontend UI (Tasks 13-21)

### Task 13: AdminPickerComponent + tests

**Repo:** `polla-app/`
**Files:**
- Create: `src/app/features/admin/companies/admin-picker.component.ts`
- Create: `src/app/features/admin/companies/admin-picker.component.spec.ts`

This is the foundational reusable component (used by Task 14 and Task 17).

- [ ] **Step 1: Create the failing test file**

Create `src/app/features/admin/companies/admin-picker.component.spec.ts`:

```ts
import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { AdminPickerComponent, PickerUser } from './admin-picker.component';
import { ApiService } from '../../../core/api/api.service';

describe('AdminPickerComponent', () => {
  let component: AdminPickerComponent;
  let apiMock: { searchUsers: jest.Mock };

  beforeEach(() => {
    apiMock = {
      searchUsers: jest.fn().mockResolvedValue({ data: [
        { sub: 'u1', handle: 'juan', email: 'juan@example.com', avatarKey: null },
        { sub: 'u2', handle: 'juana', email: 'juana@example.com', avatarKey: null },
      ] }),
    };
    TestBed.configureTestingModule({
      imports: [AdminPickerComponent],
      providers: [{ provide: ApiService, useValue: apiMock }],
    });
    const fixture = TestBed.createComponent(AdminPickerComponent);
    component = fixture.componentInstance;
  });

  it('does not search for queries shorter than 2 characters', fakeAsync(() => {
    component.onInput('j');
    tick(400);
    expect(apiMock.searchUsers).not.toHaveBeenCalled();
  }));

  it('debounces searches with 300ms', fakeAsync(() => {
    component.onInput('juan');
    tick(100);
    expect(apiMock.searchUsers).not.toHaveBeenCalled();
    tick(300);
    expect(apiMock.searchUsers).toHaveBeenCalledTimes(1);
    expect(apiMock.searchUsers).toHaveBeenCalledWith('juan');
  }));

  it('cancels in-flight search when a new query arrives within debounce window', fakeAsync(() => {
    component.onInput('jua');
    tick(100);
    component.onInput('juan');
    tick(400);
    expect(apiMock.searchUsers).toHaveBeenCalledTimes(1);
    expect(apiMock.searchUsers).toHaveBeenCalledWith('juan');
  }));

  it('select(user) emits userSelected with the chosen row + clears input', () => {
    const user: PickerUser = { sub: 'u1', handle: 'juan', email: 'juan@example.com', avatarKey: null };
    const emitted: Array<PickerUser | null> = [];
    component.userSelected.subscribe((u: PickerUser | null) => emitted.push(u));
    component.select(user);
    expect(emitted).toEqual([user]);
    expect(component.query()).toBe('');
    expect(component.results().length).toBe(0);
  });

  it('clear() emits userSelected(null) + resets state', () => {
    component.query.set('juan');
    component.results.set([{ sub: 'u1', handle: 'juan', email: 'juan@example.com', avatarKey: null }]);
    const emitted: Array<PickerUser | null> = [];
    component.userSelected.subscribe((u: PickerUser | null) => emitted.push(u));
    component.clear();
    expect(emitted).toEqual([null]);
    expect(component.query()).toBe('');
    expect(component.results().length).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test — verify FAIL**

```
npm test -- --testPathPattern='admin-picker.component.spec' --watch=false
```

Expected: FAIL — component does not exist yet.

- [ ] **Step 3: Implement the component**

Create `src/app/features/admin/companies/admin-picker.component.ts`:

```ts
import { Component, EventEmitter, Output, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../../core/api/api.service';
import { IconComponent } from '../../../shared/ui/icon/icon.component';
import { UserAvatarComponent } from '../../../shared/user-avatar/user-avatar.component';

export interface PickerUser {
  sub: string;
  handle: string;
  email: string;
  avatarKey: string | null;
}

/**
 * Debounced user search input. Emits `userSelected` on click of a result
 * row (or `null` on clear). Used by company creation modal and the tab
 * "Add admin" flow.
 */
@Component({
  standalone: true,
  selector: 'app-admin-picker',
  imports: [FormsModule, IconComponent, UserAvatarComponent],
  template: `
    <div class="adm-pick">
      <div class="adm-pick__input-wrap">
        <input type="text" class="auth-input"
               placeholder="Buscar por handle o email"
               [ngModel]="query()"
               (ngModelChange)="onInput($event)"
               aria-label="Buscar usuario">
        @if (query()) {
          <button type="button" class="adm-pick__clear"
                  (click)="clear()" aria-label="Limpiar búsqueda">
            <app-icon name="close" size="sm" />
          </button>
        }
      </div>
      @if (loading()) {
        <p class="adm-pick__hint">Buscando…</p>
      } @else if (results().length > 0) {
        <ul class="adm-pick__list" role="listbox">
          @for (u of results(); track u.sub) {
            <li class="adm-pick__row" role="option" (click)="select(u)">
              <app-user-avatar [sub]="u.sub" [handle]="u.handle"
                               [avatarKey]="u.avatarKey" size="sm" />
              <span class="adm-pick__handle" translate="no">{{ '@' + u.handle }}</span>
              <span class="adm-pick__email">{{ u.email }}</span>
            </li>
          }
        </ul>
      } @else if (query().length >= 2) {
        <p class="adm-pick__hint">Sin resultados.</p>
      }
    </div>
  `,
  styles: [`
    :host { display: block; }
    .adm-pick__input-wrap { position: relative; }
    .adm-pick__clear {
      position: absolute; top: 50%; right: 8px; transform: translateY(-50%);
      width: 28px; height: 28px; border: 0; background: transparent;
      cursor: pointer; display: grid; place-items: center;
    }
    .adm-pick__list {
      list-style: none; padding: 0; margin: 6px 0 0;
      border: 1px solid var(--color-line);
      border-radius: var(--radius-md);
      background: #fff;
      max-height: 220px; overflow-y: auto;
    }
    .adm-pick__row {
      display: grid;
      grid-template-columns: auto auto 1fr;
      gap: 10px; align-items: center;
      padding: 10px 12px;
      cursor: pointer;
      border-bottom: 1px solid rgba(0, 0, 0, 0.04);
    }
    .adm-pick__row:last-child { border-bottom: 0; }
    .adm-pick__row:hover { background: rgba(2, 204, 116, 0.06); }
    .adm-pick__handle { font-weight: 600; }
    .adm-pick__email { font-size: 12px; color: var(--color-text-muted); }
    .adm-pick__hint { font-size: 12px; color: var(--color-text-muted); margin: 6px 0 0; }
  `],
})
export class AdminPickerComponent {
  private api = inject(ApiService);

  query = signal('');
  results = signal<PickerUser[]>([]);
  loading = signal(false);

  @Output() userSelected = new EventEmitter<PickerUser | null>();

  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private currentSearchToken = 0;

  onInput(value: string): void {
    this.query.set(value);
    if (this.debounceTimer) clearTimeout(this.debounceTimer);

    if (value.trim().length < 2) {
      this.results.set([]);
      this.loading.set(false);
      return;
    }

    this.loading.set(true);
    this.debounceTimer = setTimeout(() => { this.runSearch(value.trim()); }, 300);
  }

  private async runSearch(q: string): Promise<void> {
    const token = ++this.currentSearchToken;
    try {
      const res = await this.api.searchUsers(q);
      if (token !== this.currentSearchToken) return;  // a newer search started
      const data = (res.data ?? []) as PickerUser[];
      this.results.set(data);
    } finally {
      if (token === this.currentSearchToken) this.loading.set(false);
    }
  }

  select(user: PickerUser): void {
    this.userSelected.emit(user);
    this.query.set('');
    this.results.set([]);
  }

  clear(): void {
    this.userSelected.emit(null);
    this.query.set('');
    this.results.set([]);
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.loading.set(false);
  }
}
```

- [ ] **Step 4: Run tests + commit**

```
npm test -- --testPathPattern='admin-picker.component.spec' --watch=false
```

Expected: PASS — 5/5.

```bash
git add src/app/features/admin/companies/admin-picker.component.ts src/app/features/admin/companies/admin-picker.component.spec.ts
git commit -m "feat(admin-picker): debounced user search component

Standalone Angular component used by company creation + add-admin flows.
Search runs after 2-char min + 300ms debounce, with token-cancellation
for rapidly-typed queries. Emits userSelected(user|null) on row click
or clear.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
"
```

---

### Task 14: CreateCompanyModalComponent + tests

**Repo:** `polla-app/`
**Files:**
- Create: `src/app/features/admin/companies/create-company-modal.component.ts`
- Create: `src/app/features/admin/companies/create-company-modal.component.spec.ts`

- [ ] **Step 1: Failing tests**

Create the spec covering:
- submit with empty name → inline error, no API call
- submit with name 81 chars → inline error
- submit with invalid contactEmail format → inline error
- submit with no firstAdmin selected → inline error
- submit with valid fields → api.createCompany called with the right args + emit `close` + navigate to `/admin/companies/<id>`

Use TestBed pattern with mocked ApiService + Router. Reference pattern: existing `group-actions-modals.component.spec.ts` for modal-with-form tests.

- [ ] **Step 2: Implement the component**

The component renders inside `<app-modal>` with three fields (name, contactEmail, description) plus `<app-admin-picker>` for firstAdmin. Signals: `name`, `contactEmail`, `description`, `firstAdmin`, `error`, `loading`. Submit handler validates client-side (mirror the handler rules), calls `api.createCompany`, on success emits a `created` event with the new id and lets the parent navigate.

Template skeleton:

```html
<app-modal [open]="true" title="Crear empresa" size="md" (close)="close.emit()">
  <div slot="body">
    <div class="f">
      <label>Nombre</label>
      <input class="auth-input" [(ngModel)]="name" maxlength="80">
      <small class="f__hint">3-80 caracteres.</small>
    </div>
    <div class="f">
      <label>Contact email (opcional)</label>
      <input class="auth-input" type="email" [(ngModel)]="contactEmail">
    </div>
    <div class="f">
      <label>Descripción (opcional)</label>
      <textarea class="auth-input" rows="3" maxlength="500" [(ngModel)]="description"></textarea>
    </div>
    <div class="f">
      <label>Primer admin</label>
      @if (firstAdmin(); as a) {
        <p class="info info--green">
          Seleccionado: <strong>{{ '@' + a.handle }}</strong>
          <button type="button" class="btn-wf btn-wf--sm" (click)="firstAdmin.set(null)">Cambiar</button>
        </p>
      } @else {
        <app-admin-picker (userSelected)="firstAdmin.set($event)" />
      }
    </div>
    @if (error(); as e) {
      <p class="modal-error" role="alert">{{ e }}</p>
    }
  </div>
  <div slot="footer">
    <button type="button" class="btn-wf" (click)="close.emit()">Cancelar</button>
    <button type="button" class="btn-wf btn-wf--primary"
            [disabled]="loading() || !canSubmit()" (click)="submit()">
      {{ loading() ? 'Creando…' : 'Crear empresa' }}
    </button>
  </div>
</app-modal>
```

`canSubmit()` computed: name length 3-80 AND firstAdmin set.

- [ ] **Step 3: Run tests + commit**

```
npm test -- --testPathPattern='create-company-modal.component.spec' --watch=false
```

Expected: PASS.

Commit message: `feat(create-company-modal): super-admin form to create a Company`.

---

### Task 15: CompaniesListComponent + tests

**Repo:** `polla-app/`
**Files:**
- Create: `src/app/features/admin/companies/companies-list.component.ts`
- Create: `src/app/features/admin/companies/companies-list.component.spec.ts`

- [ ] **Step 1: Failing tests**

Cover:
- Empty list → `<app-empty-block>` with "Crear primera empresa" CTA visible.
- 3 companies → 3 rows each with name + status pill + counts placeholder.
- Search filter input → only rows matching the query (case-insensitive contains).
- Click `+ Crear empresa` → opens `<app-create-company-modal>` (verify the `@if (showCreate())` branch via signal toggle).
- After modal emits `created` → list refreshes (mock listCompanies returns updated array).

- [ ] **Step 2: Implement the component**

Template skeleton:

```html
<header class="page__header">
  <div>
    <div class="kicker">SUPER-ADMIN</div>
    <h1 class="page__title">Empresas</h1>
    <p class="text-mute">{{ filtered().length }} de {{ companies().length }} resultados</p>
  </div>
  <button type="button" class="btn-wf btn-wf--primary" (click)="showCreate.set(true)">
    <app-icon name="plus" size="sm" />Crear empresa
  </button>
</header>

<input class="auth-input" placeholder="Buscar empresa…" [ngModel]="search()"
       (ngModelChange)="search.set($event)" style="max-width: 360px;">

@if (loading()) {
  <app-skeleton variant="list" [count]="3" />
} @else if (companies().length === 0) {
  <app-empty-block iconName="building" title="No hay empresas todavía"
                   sub="Creá la primera empresa para arrancar.">
    <button type="button" class="empty-cta empty-cta--primary"
            (click)="showCreate.set(true)">
      <app-icon name="plus" size="sm" />Crear primera empresa
    </button>
  </app-empty-block>
} @else {
  <ul class="cmp-list">
    @for (c of filtered(); track c.id) {
      <li class="cmp-list__row">
        <div>
          <strong>{{ c.name }}</strong>
          <span class="pill" [class.pill--green]="c.status === 'ACTIVE'"
                              [class.pill--grey]="c.status === 'DISABLED'">
            {{ c.status === 'ACTIVE' ? 'Activa' : 'Desactivada' }}
          </span>
          <div class="text-mute">{{ formatDate(c.createdAt) }}</div>
        </div>
        <a class="btn-wf btn-wf--sm" [routerLink]="['/admin/companies', c.id]">Detalles</a>
      </li>
    }
  </ul>
}

@if (showCreate()) {
  <app-create-company-modal
    (close)="showCreate.set(false)"
    (created)="onCreated($event)" />
}
```

`filtered()` computed: filter `companies()` by `search()` substring on name (toLowerCase). `onCreated(id)` closes the modal and navigates to `/admin/companies/<id>`.

- [ ] **Step 3: Run tests + commit**

```
npm test -- --testPathPattern='companies-list.component.spec' --watch=false
```

Commit message: `feat(companies-list): super-admin surface to list + create companies`.

---

### Task 16: CompanyDetailComponent Tab General + tests

**Repo:** `polla-app/`
**Files:**
- Create: `src/app/features/admin/companies/company-detail.component.ts`
- Create: `src/app/features/admin/companies/company-detail.component.spec.ts`

- [ ] **Step 1: Failing tests for Tab General only**

Spec covers:
- ngOnInit loads company by `id` route param + populates form fields (name, contactEmail, description).
- Edit name + click "Guardar" → calls `api.updateCompany({ id, name: 'new' })` with sparse args (other fields not in payload).
- Edit only contactEmail → updateCompany called with just `{ id, contactEmail }`.
- "Desactivar" button (when status=ACTIVE) → opens confirmDialog → on accept calls `api.setCompanyStatus({ id, status: 'DISABLED' })`.
- "Reactivar" button (when status=DISABLED) → similarly with `'ACTIVE'`.
- Dirty form: changing name marks dirty → "Guardar" button enabled.

- [ ] **Step 2: Implement the tab structure (skeleton + General tab)**

The component is the shell for all 4 tabs. Tasks 17, 18, 19 fill in the others. For this task, render only Tab General fully; the other tabs render their headers + placeholder `(WIP)` text that subsequent tasks will replace.

Template skeleton:

```html
<header class="page__header">
  <div>
    <a routerLink="/admin/companies" class="back-link">← Empresas</a>
    <div class="kicker">EMPRESA</div>
    <h1 class="page__title">{{ company()?.name ?? 'Cargando…' }}</h1>
  </div>
</header>

<nav class="page-tabs" aria-label="Secciones de la empresa">
  <button type="button" class="page-tabs__item"
          [class.is-active]="tab() === 'general'"
          (click)="tab.set('general')">General</button>
  <button type="button" class="page-tabs__item"
          [class.is-active]="tab() === 'admins'"
          (click)="tab.set('admins')">Admins</button>
  <button type="button" class="page-tabs__item"
          [class.is-active]="tab() === 'groups'"
          (click)="tab.set('groups')">Grupos</button>
  <button type="button" class="page-tabs__item"
          [class.is-active]="tab() === 'branding'"
          (click)="tab.set('branding')">Branding</button>
</nav>

@if (tab() === 'general') {
  <!-- Tab General form (sparse save) -->
  <form class="form-card" (ngSubmit)="save()">
    <div class="form-card__field">
      <label>Nombre</label>
      <input class="form-card__input" [(ngModel)]="name" name="name" maxlength="80">
    </div>
    <div class="form-card__field">
      <label>Contact email</label>
      <input class="form-card__input" type="email" [(ngModel)]="contactEmail" name="contactEmail">
    </div>
    <div class="form-card__field">
      <label>Descripción</label>
      <textarea class="form-card__input" rows="3" maxlength="500"
                [(ngModel)]="description" name="description"></textarea>
    </div>
    <div class="form-card__field">
      <strong>Estado:</strong>
      <span class="pill" [class.pill--green]="company()?.status === 'ACTIVE'"
                          [class.pill--grey]="company()?.status === 'DISABLED'">
        {{ company()?.status === 'ACTIVE' ? 'Activa' : 'Desactivada' }}
      </span>
      <button type="button" class="btn-wf btn-wf--sm"
              [class.btn-wf--danger]="company()?.status === 'ACTIVE'"
              (click)="toggleStatus()">
        {{ company()?.status === 'ACTIVE' ? 'Desactivar' : 'Reactivar' }}
      </button>
    </div>
    <button type="submit" class="btn-wf btn-wf--primary" [disabled]="!dirty() || saving()">
      {{ saving() ? 'Guardando…' : 'Guardar cambios' }}
    </button>
  </form>
}
@if (tab() === 'admins')   { <p class="text-mute">(Task 17)</p> }
@if (tab() === 'groups')   { <p class="text-mute">(Task 18)</p> }
@if (tab() === 'branding') { <p class="text-mute">(Task 19)</p> }
```

`save()` mirrors the sparse update from `group-edit.component.ts`: builds payload with only fields that changed against the loaded snapshot, then `api.updateCompany(payload)` and resets snapshot on success.

- [ ] **Step 3: Run tests + commit**

```
npm test -- --testPathPattern='company-detail.component.spec' --watch=false
```

Commit message: `feat(company-detail): tab shell + Tab General form (sparse save + status toggle)`.

---

### Task 17: CompanyDetailComponent Tab Admins + tests

**Repo:** `polla-app/`
**Files:**
- Modify: `src/app/features/admin/companies/company-detail.component.ts` (replace the Admins placeholder with full implementation)
- Modify: `src/app/features/admin/companies/company-detail.component.spec.ts` (append Admins tests)

- [ ] **Step 1: Add failing tests for Admins**

Append:
- Tab Admins loads members via `api.listCompanyMembers(id)` filtered to role=ADMIN.
- Each row has avatar + handle + email + invitedAt + Remove button.
- Remove button disabled (with title tooltip) when only one admin remains.
- Click Add admin → opens an inline `<app-admin-picker>` panel.
- Picker emits userSelected → calls `api.addCompanyAdmin({ companyId, userId })` + refresh list.
- Click Remove on non-last admin → opens confirmDialog → on accept calls `api.removeCompanyAdmin({ companyId, userId })`.
- Removing self when other admins exist: confirm dialog shows the special "vas a perder acceso" message.

- [ ] **Step 2: Implement the Admins tab**

Replace the `(Task 17)` placeholder with:

```html
@if (tab() === 'admins') {
  <div class="form-card">
    <header class="sec">
      <h2>Company-admins</h2>
      <button type="button" class="btn-wf btn-wf--sm" (click)="showPicker.set(!showPicker())">
        @if (showPicker()) { Cancelar } @else { + Agregar admin }
      </button>
    </header>

    @if (showPicker()) {
      <app-admin-picker (userSelected)="onPickAdmin($event)" />
    }

    @if (loadingAdmins()) {
      <app-skeleton variant="list" [count]="2" />
    } @else if (admins().length === 0) {
      <p class="text-mute">Esta empresa no tiene admins.</p>
    } @else {
      <ul class="adm-list">
        @for (a of admins(); track a.id) {
          <li class="adm-list__row">
            <app-user-avatar [sub]="a.userId" [handle]="a.handle ?? ''"
                             [avatarKey]="a.avatarKey ?? null" size="md" />
            <div>
              <strong translate="no">{{ '@' + (a.handle ?? '—') }}</strong>
              <div class="text-mute">{{ a.email ?? '' }} · agregado {{ formatDate(a.invitedAt) }}</div>
            </div>
            <button type="button" class="btn-wf btn-wf--sm btn-wf--danger"
                    [disabled]="admins().length <= 1"
                    [title]="admins().length <= 1 ? 'Es el último admin — agregá otro antes' : ''"
                    (click)="removeAdmin(a)">Remover</button>
          </li>
        }
      </ul>
    }
  </div>
}
```

Component methods:
- `loadAdmins()`: calls `api.listCompanyMembers` then resolves each user's handle/email via `api.getUser(sub)` (existing).
- `onPickAdmin(user)`: calls `api.addCompanyAdmin` + reload + close picker.
- `removeAdmin(a)`: opens confirmDialog (special copy if `a.userId === auth.user()?.sub`) → calls `api.removeCompanyAdmin` + reload + handle `LAST_COMPANY_ADMIN` error via toast.

- [ ] **Step 3: Run tests + commit**

```
npm test -- --testPathPattern='company-detail.component.spec' --watch=false
```

Commit message: `feat(company-detail): Tab Admins — list + add + remove with last-admin guard`.

---

### Task 18: CompanyDetailComponent Tab Grupos + CreateGroupModal

**Repo:** `polla-app/`
**Files:**
- Modify: `src/app/features/admin/companies/company-detail.component.ts`
- Modify: `src/app/features/admin/companies/company-detail.component.spec.ts`
- Create: `src/app/features/admin/companies/create-group-modal.component.ts`
- Create: `src/app/features/admin/companies/create-group-modal.component.spec.ts`

- [ ] **Step 1: Failing tests for the simple create-group modal**

Cover (in the modal spec):
- Form with name, tournament select (hardcoded 'mundial-2026' as the only option for now), mode SIMPLE/COMPLETE, optional category, optional admin picker (defaults to current super-admin).
- Submit valid → calls `api.createCompanyGroup({ companyId, name, tournamentId, mode, category, adminUserId })`.
- Submit with empty name → inline error.
- Emit `created` event with the new group id.

For the Grupos tab tests append:
- Tab Grupos loads groups via `api.listCompanyGroups(id)`.
- Renders read-only list with name, mode, category, count rows.
- Category filter chips (`.chips` family) — clicking a chip filters rows.
- Click `+ Crear grupo` → opens `<app-create-group-modal>`.
- After modal emits `created` → list refreshes.

- [ ] **Step 2: Implement the modal**

Create a thin component that internally renders an `<app-modal>` with the form. Submit logic mirrors `group-actions-modals.component.ts` create-group flow but with `companyId` already known and using `createCompanyGroup` instead of `createGroup`. The optional admin picker is the same `<app-admin-picker>`.

- [ ] **Step 3: Implement the Grupos tab**

Replace the `(Task 18)` placeholder with the read-only list + chips filter + create button + modal trigger.

- [ ] **Step 4: Run tests + commit**

```
npm test -- --testPathPattern='(company-detail|create-group-modal).component.spec' --watch=false
```

Commit message: `feat(company-detail): Tab Grupos + simple create-group modal for smoke`.

---

### Task 19: CompanyDetailComponent Tab Branding (read-only preview)

**Repo:** `polla-app/`
**Files:**
- Modify: `src/app/features/admin/companies/company-detail.component.ts`
- Modify: `src/app/features/admin/companies/company-detail.component.spec.ts`

- [ ] **Step 1: Append failing tests**

- Tab Branding renders logo placeholder when `logoKey` is null.
- Renders an `<img>` with signed URL when `logoKey` is set (mock `getUrl` from Amplify Storage).
- Renders three color swatches with `style.background` matching `brandPrimary`, `brandPrimaryDark`, `brandAccent`.
- Renders gray placeholder swatches when colors are not set.
- Renders the explanatory note pointing to Sub-2.

- [ ] **Step 2: Implement the Branding tab**

Replace the `(Task 19)` placeholder. Use `getUrl({ path: company().logoKey })` from `aws-amplify/storage` to resolve the logo. Render the three colors as small bordered squares. Add an `<div class="info info--mute">` note: "La edición de branding (subir logo, cambiar colores) vive en el panel company-admin que se construye en Sub-proyecto 2."

- [ ] **Step 3: Run tests + commit**

Commit message: `feat(company-detail): Tab Branding read-only preview`.

---

### Task 20: Routes + admin shell sidebar item

**Repo:** `polla-app/`
**Files:**
- Modify: `src/app/features/admin/admin.routes.ts`
- Modify: `src/app/features/admin/admin-shell.component.ts`

- [ ] **Step 1: Register the two new routes**

In `admin.routes.ts`, inside the `children` array of the `AdminShellComponent` route, add:

```ts
{
  path: 'companies',
  loadComponent: () => import('./companies/companies-list.component').then((m) => m.CompaniesListComponent),
},
{
  path: 'companies/:id',
  loadComponent: () => import('./companies/company-detail.component').then((m) => m.CompanyDetailComponent),
},
```

- [ ] **Step 2: Add Empresas to the admin sub-nav**

In `admin-shell.component.ts`, append a new group to `navGroups`:

```ts
{
  label: 'Empresas',
  items: [
    { path: '/admin/companies', label: 'Companies', exact: true },
  ],
},
```

- [ ] **Step 3: Commit**

```bash
git add src/app/features/admin/admin.routes.ts src/app/features/admin/admin-shell.component.ts
git commit -m "feat(admin): wire /admin/companies routes + sub-nav item

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
"
```

---

### Task 21: Extend group-edit to detect companyId

**Repo:** `polla-app/`
**Files:**
- Modify: `src/app/features/groups/group-edit.component.ts`
- Modify: `src/app/features/groups/group-edit.component.spec.ts` (append test)

- [ ] **Step 1: Append failing test**

Add to the spec a test that when `getGroup` returns a group with `companyId='c1'`, the save() handler calls `api.updateCompanyGroup` instead of `api.updateGroup`. Mock both methods on the ApiService stub and assert that the company variant is called when `companyId` is set, and the original variant when it is null.

- [ ] **Step 2: Modify the save handler**

Locate `save()` in `group-edit.component.ts`. Wrap the existing `api.updateGroup({...})` call in a conditional based on the loaded group's `companyId`:

```ts
const isCompanyGroup = !!this.group()?.companyId;
const result = isCompanyGroup
  ? await this.api.updateCompanyGroup({
      id: this.id,
      name: this.name.trim(),
      description: this.description.trim() || null,
      imageKey: this.imageKey() || null,
      entryFeeEnabled: this.entryFeeEnabled(),
      entryFeeInstructions: feeInstructionsForPayload,
      // category not editable from this screen yet — Sub-5 panel handles it
    })
  : await this.api.updateGroup({
      id: this.id,
      name: this.name.trim(),
      description: this.description.trim() || null,
      imageKey: this.imageKey() || null,
      entryFeeEnabled: this.entryFeeEnabled(),
      entryFeeInstructions: feeInstructionsForPayload,
    });
```

Also extend the loaded `group()` interface to include `companyId: string | null` so the check works at type level.

- [ ] **Step 3: Run tests + commit**

```
npm test -- --testPathPattern='group-edit.component.spec' --watch=false
```

Commit message: `feat(group-edit): route to updateCompanyGroup when companyId set`.

---

## Phase 5 — Integration (Tasks 22-23)

### Task 22: Sandbox deploy + sync outputs

**Repo:** `polla-backend/` then `polla-app/`

- [ ] **Step 1: Deploy backend to sandbox**

In `polla-backend/`:

```
npx ampx sandbox --profile polla
```

Wait for `Deployment completed`. Schema now has Company + CompanyMember + extended Group + 7 new mutations.

- [ ] **Step 2: Copy regenerated outputs**

In `polla-app/`:

```
cp ../polla-backend/amplify_outputs.json amplify_outputs.json
cp amplify_outputs.json src/amplify_outputs.json
```

- [ ] **Step 3: Remove `as never` casts where possible**

In `src/app/core/api/api.service.ts`, the new method bodies use `as never` to suppress type errors against the not-yet-deployed schema. With the deploy done, try removing them. If `npx tsc --noEmit -p tsconfig.app.json` fails, keep the casts (they will be cleaned in Sub-2 after the schema types are stable).

- [ ] **Step 4: Commit regenerated outputs (root only — `src/` is gitignored)**

```bash
git add amplify_outputs.json
git commit -m "chore(amplify): regenerate outputs after Empresas Sub-1 schema deploy"
```

---

### Task 23: Manual smoke + push branches

**Repo:** `polla-app/` and `polla-backend/`

- [ ] **Step 1: Smoke flow (per spec §6.4)**

Run `npm run start` and exercise:
1. Login as super-admin, navigate to `/admin/companies` → see empty state with "Crear primera empresa".
2. Create "Coca-Cola Test" with first admin = a separate test user (search by handle in the picker).
3. As super-admin, on the detail screen: edit name, save → see updated value in the list.
4. As super-admin: Tab Admins → add a second admin via picker.
5. As super-admin: Tab Admins → try to remove the last admin → button disabled with tooltip.
6. As super-admin: Tab Admins → remove the second admin → confirm dialog → row disappears.
7. As super-admin: Tab Grupos → click "+ Crear grupo" → create a group bound to this company → see it in the list.
8. As super-admin: open `/groups/<that-id>/edit` → confirm the form loads and "Guardar" works (uses `updateCompanyGroup` internally).
9. Logout, login as the company-admin user → go directly to `/groups/<that-id>/edit` → confirm edit works (uses `updateCompanyGroup`).
10. As super-admin: Tab General → Desactivar → confirm dialog → status flips. As the company-admin: try to edit the group → save fails with `COMPANY_DISABLED` toast.
11. As super-admin: reactivate.

- [ ] **Step 2: Push branches**

```
git push origin <branch>
```

In both repos.

---

## Implementation notes for the engineer

- The frontend tasks 13-19 ALL benefit from having Task 22 (sandbox deploy) done first. Without the regenerated `amplify_outputs.json`, the `apiClient.mutations.createCompany` and friends do not exist on the typed client — the `as never` casts compile but runtime calls fail. Implement in the order: Tasks 1-11 → Task 22 → Tasks 12-21 → Task 23.
- Component scoped styles in the new files should reuse the cross-screen classes from `polla-doc.css` (`.page__header`, `.kicker`, `.page__title`, `.pill--green`, `.pill--grey`, `.btn-wf--primary`, `.info--green`, `.info--mute`, `.chips`, `.chip`). Avoid introducing new class names for things that already have a global pattern.
- All user-facing copy uses tú voice (no voseo): "Vas a perder acceso", "Agregá otro admin", "No tenés permisos". Match the existing `domain-errors.ts` strings.
- No emojis in any user-facing surface. Use `<app-icon name="...">` from Lucide.
- Tests use the existing TestBed pattern from `group-edit.component.spec.ts` and `group-actions-modals.component.spec.ts` — mock ApiService at the service level, never the apiClient directly.

---

## Self-review notes

This file detailed Tasks 12-23. Combined with `2026-05-30-empresas-sub1-foundation.md` (Tasks 1-11), the two plans together cover Sub-proyecto 1 end-to-end.

Tasks 17, 18, 19 reference test cases at outline level rather than embedding full Jest code blocks. When the implementer reaches them, they should pattern-match the test structure from Task 13 (AdminPickerComponent spec) and Task 14 (CreateCompanyModal spec) — both of which contain full Jest examples for "TestBed + ApiService mock + assert handler called with X" patterns.
