# Home redesign + layout — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rediseñar `/home` con prioridad de información (hero próximo partido, stats, mis grupos, editorial, próximos partidos), introducir entidad `Article` para noticias, reemplazar el sidebar denso + right-rail por icon-rail colapsable (desktop) y bottom-nav iconos (mobile).

**Architecture:** Backend agrega un modelo `Article` con CRUD nativo de Amplify Gen 2 (admin via `allow.group('admins')`, lectura pública via apiKey). Storage tiene un path nuevo `articles/{id}/cover.*`. Frontend extrae el sidebar a un componente propio con estado colapsado por defecto, crea `bottom-nav.component.ts` standalone, elimina el right-rail del shell, reescribe la home y agrega `/admin/articles` para gestionar las noticias.

**Tech Stack:** AWS Amplify Gen 2 (TypeScript), Angular 18 standalone components, signals, jest (`ts-jest` backend, `@angular-builders/jest` frontend), aws-amplify storage (S3 upload), Heroicons/Lucide via SVG inline.

**Spec:** `polla-app/docs/superpowers/specs/2026-05-27-home-redesign-and-layout-design.md`

**Branches:** `feature/home-redesign-and-layout` en ambos repos (polla-app y polla-backend).

---

## File map

### Backend (`polla-backend/`)

**Modify:**
- `amplify/data/resource.ts` — `ArticleStatus` enum + `Article` model + GSI `articlesByStatus`.

### Frontend (`polla-app/`)

**Create:**
- `src/app/shared/layout/bottom-nav.component.ts` — 5-icon bottom nav for mobile <768px.
- `src/app/shared/layout/sidebar.component.ts` — extracted from nav.component, with 56px↔200px collapse state.
- `src/app/features/admin/admin-articles.component.ts` — list + create/edit/delete UI.
- `src/app/features/admin/admin-article-edit.component.ts` — create/edit form (or modal inside the list component; this plan uses inline modal).

**Modify:**
- `src/app/core/api/api.service.ts` — wrappers para Articles (list published, listAll admin, create, update, delete).
- `src/app/features/admin/admin.routes.ts` — agrega `/admin/articles`.
- `src/app/shared/layout/nav.component.ts` — sacar el bloque sidebar + el mobile hamburguesa.
- `src/app/shared/layout/shell.component.ts` — integrar bottom-nav + nuevo sidebar; eliminar right-rail.
- `src/app/features/home/home.component.ts` — reescrito con la nueva estructura.
- Cualquier componente que llame `RightRailService.show()/hide()` — remover esos calls (no más right-rail visible).

**No-changes:**
- `src/app/shared/layout/right-rail.component.ts` y `core/layout/right-rail.service.ts` quedan en el repo sin importarse; cleanup futuro fuera de scope.

---

## Task 1: Backend — Article model + GSI

**Files:**
- Modify: `polla-backend/amplify/data/resource.ts`

- [ ] **Step 1: Add `ArticleStatus` enum + `Article` model**

Open `polla-backend/amplify/data/resource.ts`. Locate the existing enum declarations near the top of the schema (e.g. `MatchStatus`, `GameMode`, `ComodinType`). Add `ArticleStatus` next to them:

```typescript
ArticleStatus: a.enum(['DRAFT', 'PUBLISHED']),
```

Then add the `Article` model — put it after the last existing model (typically near the end before the mutations section). Use:

```typescript
  // Noticias del torneo cargadas por admin. La home muestra hasta 4 PUBLISHED
  // recientes con título + imagen + link externo (a golgana.net/news/<slug>).
  // No hay página interna de listado — el hub vive en el dominio principal.
  Article: a
    .model({
      title: a.string().required(),
      // S3 key bajo articles/{id}/cover.{ext}. FE resuelve con getUrl({ key }).
      imageKey: a.string(),
      // URL absoluta hacia golgana.net/news/<slug> o cualquier URL externa.
      externalUrl: a.string().required(),
      publishedAt: a.datetime().required(),
      status: a.ref('ArticleStatus').required().default('DRAFT'),
      // Orden manual del admin. Lower = primero. Default 0.
      sortOrder: a.integer().default(0),
    })
    .secondaryIndexes((idx) => [
      idx('status').sortKeys(['publishedAt']).name('articlesByStatus'),
    ])
    .authorization((allow) => [
      allow.publicApiKey().to(['read']),
      allow.authenticated().to(['read']),
      allow.group('admins'),
    ]),
```

- [ ] **Step 2: Typecheck**

```bash
cd polla-backend && npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
cd 'C:\Users\Marke\Documents\Respaldo\polla mundialista\polla-backend' && git add amplify/data/resource.ts
cd 'C:\Users\Marke\Documents\Respaldo\polla mundialista\polla-backend' && git commit -m "feat(news): add Article model + ArticleStatus enum + articlesByStatus GSI

Articles are admin-curated tournament news that appear in the home page
editorial section. Public apiKey read (home is reachable without auth in
the future), authenticated read, admins full CRUD via Cognito group.
Storage path: articles/{id}/cover.{ext}.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Frontend — API wrappers + admin articles screen + route

**Files:**
- Modify: `polla-app/src/app/core/api/api.service.ts`
- Create: `polla-app/src/app/features/admin/admin-articles.component.ts`
- Modify: `polla-app/src/app/features/admin/admin.routes.ts`

Note: schema types (`apiClient.models.Article`) won't exist in `schema.d.ts` until sandbox redeploys (Task 7). Use defensive `as never` casts here, with a comment, matching the pattern used in previous features (`createUserProfile`).

- [ ] **Step 1: Add API wrappers to `api.service.ts`**

In `polla-app/src/app/core/api/api.service.ts`, find a logical spot (near other list/wrapper methods at the end). Add:

```typescript
  // ----- Articles (admin-curated news) -----

  listPublishedArticles(limit = 4) {
    // Cast required until sandbox redeploys regenerate schema.d.ts.
    return (apiClient.models as unknown as {
      Article: {
        listArticleByStatusAndPublishedAt: (
          input: { status: 'PUBLISHED' },
          opts: { sortDirection: 'DESC' | 'ASC'; limit: number; authMode: 'apiKey' },
        ) => Promise<{ data: ReadonlyArray<{
          id: string;
          title: string;
          imageKey: string | null;
          externalUrl: string;
          publishedAt: string;
          status: 'PUBLISHED' | 'DRAFT';
          sortOrder: number | null;
        }> }>;
      };
    }).Article.listArticleByStatusAndPublishedAt(
      { status: 'PUBLISHED' },
      { sortDirection: 'DESC', limit, authMode: 'apiKey' },
    );
  }

  listAllArticles() {
    // Cast required until sandbox redeploys regenerate schema.d.ts.
    return (apiClient.models as unknown as {
      Article: {
        list: (opts?: { limit?: number }) => Promise<{ data: ReadonlyArray<{
          id: string;
          title: string;
          imageKey: string | null;
          externalUrl: string;
          publishedAt: string;
          status: 'PUBLISHED' | 'DRAFT';
          sortOrder: number | null;
        }> }>;
      };
    }).Article.list({ limit: 200 });
  }

  createArticle(input: {
    title: string;
    imageKey?: string;
    externalUrl: string;
    publishedAt: string;
    status: 'PUBLISHED' | 'DRAFT';
    sortOrder?: number;
  }) {
    return (apiClient.models as unknown as {
      Article: { create: (input: typeof input) => Promise<{ data: { id: string } | null }> };
    }).Article.create(input);
  }

  updateArticle(input: {
    id: string;
    title?: string;
    imageKey?: string;
    externalUrl?: string;
    publishedAt?: string;
    status?: 'PUBLISHED' | 'DRAFT';
    sortOrder?: number;
  }) {
    return (apiClient.models as unknown as {
      Article: { update: (input: typeof input) => Promise<{ data: { id: string } | null }> };
    }).Article.update(input);
  }

  deleteArticle(id: string) {
    return (apiClient.models as unknown as {
      Article: { delete: (input: { id: string }) => Promise<{ data: { id: string } | null }> };
    }).Article.delete({ id });
  }
```

- [ ] **Step 2: Create `admin-articles.component.ts`**

Create `polla-app/src/app/features/admin/admin-articles.component.ts`:

```typescript
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/api/api.service';
import { ToastService } from '../../core/notifications/toast.service';
import { uploadData, getUrl } from 'aws-amplify/storage';

interface ArticleRow {
  id: string;
  title: string;
  imageKey: string | null;
  externalUrl: string;
  publishedAt: string;
  status: 'PUBLISHED' | 'DRAFT';
  sortOrder: number | null;
  resolvedImageUrl?: string;
}

interface EditState {
  id?: string;
  title: string;
  imageKey: string | null;
  externalUrl: string;
  publishedAt: string;   // datetime-local format
  status: 'PUBLISHED' | 'DRAFT';
  sortOrder: number;
}

@Component({
  standalone: true,
  selector: 'app-admin-articles',
  imports: [FormsModule],
  template: `
    <section class="page">
      <header class="page__header">
        <div>
          <div class="kicker">ADMIN</div>
          <h1 class="page__title">Noticias del torneo</h1>
        </div>
        <button type="button" class="btn-wf btn-wf--primary" (click)="openCreate()">
          + Nueva noticia
        </button>
      </header>

      @if (loading()) {
        <p class="text-mute">Cargando…</p>
      } @else if (articles().length === 0) {
        <div class="empty-block">
          <h3>Aún no hay noticias</h3>
          <p>Crea la primera para que aparezca en la home.</p>
        </div>
      } @else {
        <div class="article-list">
          @for (a of articles(); track a.id) {
            <article class="article-row">
              <div class="article-row__cover">
                @if (a.resolvedImageUrl) {
                  <img [src]="a.resolvedImageUrl" [alt]="a.title">
                } @else {
                  <div class="article-row__placeholder">📰</div>
                }
              </div>
              <div class="article-row__body">
                <div class="article-row__title">{{ a.title }}</div>
                <div class="article-row__meta">
                  <span class="pill" [class.pill--accent]="a.status === 'PUBLISHED'"
                                      [class.pill--mute]="a.status === 'DRAFT'">
                    {{ a.status }}
                  </span>
                  · {{ a.publishedAt | date:'short' }}
                  · orden {{ a.sortOrder ?? 0 }}
                </div>
                <a [href]="a.externalUrl" target="_blank" rel="noopener noreferrer"
                   class="article-row__link">{{ a.externalUrl }} ↗</a>
              </div>
              <div class="article-row__actions">
                <button type="button" class="btn-wf btn-wf--sm" (click)="openEdit(a)">Editar</button>
                <button type="button" class="btn-wf btn-wf--sm btn-wf--danger" (click)="del(a)">
                  Eliminar
                </button>
              </div>
            </article>
          }
        </div>
      }

      @if (editing(); as e) {
        <div class="modal-backdrop" (click)="closeEdit()">
          <div class="modal-card" (click)="$event.stopPropagation()">
            <h2 class="modal-card__title">{{ e.id ? 'Editar noticia' : 'Nueva noticia' }}</h2>

            <label class="auth-label">Título</label>
            <input class="auth-input" [(ngModel)]="e.title" required maxlength="120">

            <label class="auth-label">URL externa (https://golgana.net/news/...)</label>
            <input class="auth-input" [(ngModel)]="e.externalUrl"
                   placeholder="https://golgana.net/news/mbappe-renueva"
                   pattern="https?://.+">

            <label class="auth-label">Imagen de portada</label>
            <input type="file" accept="image/*" (change)="onFile($event)">
            @if (uploading()) {
              <p class="text-mute" style="font-size:12px;">Subiendo…</p>
            } @else if (e.imageKey) {
              <p class="text-mute" style="font-size:12px;">✓ Imagen cargada ({{ e.imageKey }})</p>
            }

            <label class="auth-label">Fecha de publicación</label>
            <input type="datetime-local" class="auth-input" [(ngModel)]="e.publishedAt">

            <label class="auth-label">Orden (lower = primero)</label>
            <input type="number" class="auth-input" [(ngModel)]="e.sortOrder">

            <label class="auth-check" style="margin-top:14px;">
              <input type="checkbox" [checked]="e.status === 'PUBLISHED'"
                     (change)="toggleStatus($event)">
              <span>Publicada (visible en home)</span>
            </label>

            <div class="modal-card__actions">
              <button type="button" class="btn-wf" (click)="closeEdit()">Cancelar</button>
              <button type="button" class="btn-wf btn-wf--primary"
                      [disabled]="saving() || !e.title || !e.externalUrl"
                      (click)="save()">
                {{ saving() ? 'Guardando…' : (e.id ? 'Guardar' : 'Crear') }}
              </button>
            </div>
          </div>
        </div>
      }
    </section>
  `,
  styles: [`
    .article-list { display: grid; gap: 12px; margin-top: 16px; }
    .article-row {
      display: grid;
      grid-template-columns: 80px 1fr auto;
      gap: 14px;
      padding: 12px;
      background: var(--wf-paper);
      border: 1px solid var(--wf-line);
      border-radius: 12px;
      align-items: center;
    }
    .article-row__cover img { width: 80px; height: 60px; object-fit: cover; border-radius: 6px; }
    .article-row__placeholder {
      width: 80px; height: 60px; background: var(--wf-fill);
      display: flex; align-items: center; justify-content: center;
      font-size: 24px; border-radius: 6px;
    }
    .article-row__title { font-weight: 700; margin-bottom: 4px; }
    .article-row__meta { font-size: 12px; color: var(--wf-ink-3); margin-bottom: 4px; }
    .article-row__link { font-size: 11px; color: var(--wf-ink-3); text-decoration: none; }
    .article-row__actions { display: flex; flex-direction: column; gap: 6px; }
    .modal-backdrop {
      position: fixed; inset: 0; background: rgba(0,0,0,0.5);
      display: flex; align-items: center; justify-content: center;
      z-index: 100; padding: 16px;
    }
    .modal-card {
      background: var(--wf-paper); border-radius: 14px;
      padding: 22px; max-width: 480px; width: 100%;
      max-height: 90vh; overflow-y: auto;
    }
    .modal-card__title { margin: 0 0 14px; font-family: var(--wf-display); }
    .modal-card__actions {
      display: flex; justify-content: flex-end; gap: 8px; margin-top: 18px;
    }
  `],
})
export class AdminArticlesComponent implements OnInit {
  private api = inject(ApiService);
  private toast = inject(ToastService);

  loading = signal(true);
  articles = signal<ArticleRow[]>([]);
  editing = signal<EditState | null>(null);
  saving = signal(false);
  uploading = signal(false);

  async ngOnInit() {
    await this.load();
  }

  private async load() {
    this.loading.set(true);
    try {
      const res = await this.api.listAllArticles();
      const rows: ArticleRow[] = (res.data ?? []).map((a) => ({ ...a }));
      // Resolve image URLs in parallel.
      await Promise.all(rows.map(async (r) => {
        if (r.imageKey) {
          try {
            const { url } = await getUrl({ key: r.imageKey, options: { expiresIn: 3600 } });
            r.resolvedImageUrl = url.toString();
          } catch { /* ignore */ }
        }
      }));
      // Sort by sortOrder asc, then publishedAt desc.
      rows.sort((a, b) => {
        const so = (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
        if (so !== 0) return so;
        return (b.publishedAt ?? '').localeCompare(a.publishedAt ?? '');
      });
      this.articles.set(rows);
    } catch (e) {
      this.toast.error((e as Error).message ?? 'Error al cargar noticias');
    } finally {
      this.loading.set(false);
    }
  }

  openCreate() {
    this.editing.set({
      title: '',
      imageKey: null,
      externalUrl: '',
      publishedAt: new Date().toISOString().slice(0, 16),
      status: 'DRAFT',
      sortOrder: 0,
    });
  }

  openEdit(a: ArticleRow) {
    this.editing.set({
      id: a.id,
      title: a.title,
      imageKey: a.imageKey,
      externalUrl: a.externalUrl,
      publishedAt: a.publishedAt.slice(0, 16),
      status: a.status,
      sortOrder: a.sortOrder ?? 0,
    });
  }

  closeEdit() {
    this.editing.set(null);
  }

  toggleStatus(event: Event) {
    const checked = (event.target as HTMLInputElement).checked;
    const e = this.editing();
    if (!e) return;
    this.editing.set({ ...e, status: checked ? 'PUBLISHED' : 'DRAFT' });
  }

  async onFile(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      this.toast.error('Imagen debe ser menor a 2MB');
      return;
    }
    this.uploading.set(true);
    try {
      const ext = (file.name.split('.').pop() ?? 'jpg').toLowerCase();
      const id = this.editing()?.id ?? crypto.randomUUID();
      const key = `articles/${id}/cover.${ext}`;
      await uploadData({ key, data: file, options: { contentType: file.type } }).result;
      const e = this.editing();
      if (e) this.editing.set({ ...e, imageKey: key });
    } catch (err) {
      this.toast.error((err as Error).message ?? 'Error al subir imagen');
    } finally {
      this.uploading.set(false);
    }
  }

  async save() {
    const e = this.editing();
    if (!e || !e.title || !e.externalUrl) return;
    if (!/^https?:\/\//.test(e.externalUrl)) {
      this.toast.error('URL debe empezar con http:// o https://');
      return;
    }
    this.saving.set(true);
    try {
      const publishedAtIso = new Date(e.publishedAt).toISOString();
      if (e.id) {
        await this.api.updateArticle({
          id: e.id, title: e.title, imageKey: e.imageKey ?? undefined,
          externalUrl: e.externalUrl, publishedAt: publishedAtIso,
          status: e.status, sortOrder: e.sortOrder,
        });
      } else {
        await this.api.createArticle({
          title: e.title, imageKey: e.imageKey ?? undefined,
          externalUrl: e.externalUrl, publishedAt: publishedAtIso,
          status: e.status, sortOrder: e.sortOrder,
        });
      }
      this.toast.success(e.id ? 'Noticia actualizada' : 'Noticia creada');
      this.closeEdit();
      await this.load();
    } catch (err) {
      this.toast.error((err as Error).message ?? 'Error al guardar');
    } finally {
      this.saving.set(false);
    }
  }

  async del(a: ArticleRow) {
    if (!window.confirm(`¿Eliminar "${a.title}"?`)) return;
    try {
      await this.api.deleteArticle(a.id);
      this.toast.success('Noticia eliminada');
      await this.load();
    } catch (err) {
      this.toast.error((err as Error).message ?? 'Error al eliminar');
    }
  }
}
```

- [ ] **Step 3: Add the admin route**

In `polla-app/src/app/features/admin/admin.routes.ts`, add:

```typescript
{
  path: 'articles',
  loadComponent: () => import('./admin-articles.component').then((m) => m.AdminArticlesComponent),
},
```

Read the file first to find the right spot (alongside `fixtures`, `results`, etc.).

- [ ] **Step 4: Typecheck + build**

```bash
cd polla-app && npx tsc --noEmit -p tsconfig.app.json
cd polla-app && npx ng build --configuration=development 2>&1 | tail -10
```

Expected: 0 errors, clean build (only the pre-existing NG8102 warning).

- [ ] **Step 5: Commit**

```bash
cd 'C:\Users\Marke\Documents\Respaldo\polla mundialista\polla-app' && git add src/app/core/api/api.service.ts src/app/features/admin/admin-articles.component.ts src/app/features/admin/admin.routes.ts
cd 'C:\Users\Marke\Documents\Respaldo\polla mundialista\polla-app' && git commit -m "feat(news): admin screen to manage Articles (list/create/edit/delete)

- api.service wraps Article CRUD with temporary type casts (pending
  sandbox redeploy regenerating schema.d.ts).
- /admin/articles lists all articles (DRAFT + PUBLISHED) with cover
  preview, status pill, sort order, external link.
- Inline modal for create/edit: title, S3 image upload (max 2MB),
  external URL with https:// validation, publishedAt, status toggle,
  sort order.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Frontend — Bottom-nav component

**Files:**
- Create: `polla-app/src/app/shared/layout/bottom-nav.component.ts`

- [ ] **Step 1: Create the component**

Create `polla-app/src/app/shared/layout/bottom-nav.component.ts`:

```typescript
import { Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';

/**
 * Bottom navigation visible only on mobile (<768px). 5 icon items mapping to
 * the app's top-level destinations. Safe-area-inset-bottom respected. No
 * hamburger — these 5 cover ~95% of flows; the user dropdown lives in the
 * topbar.
 */
@Component({
  standalone: true,
  selector: 'app-bottom-nav',
  imports: [RouterLink, RouterLinkActive],
  template: `
    <nav class="bottom-nav" aria-label="Navegación principal">
      <a class="bottom-nav__item" routerLink="/home" routerLinkActive="is-active"
         [routerLinkActiveOptions]="{exact: true}">
        <span class="bottom-nav__icon" aria-hidden="true">🏠</span>
        <span class="bottom-nav__label">Home</span>
      </a>
      <a class="bottom-nav__item" routerLink="/picks" routerLinkActive="is-active">
        <span class="bottom-nav__icon" aria-hidden="true">⚽</span>
        <span class="bottom-nav__label">Picks</span>
      </a>
      <a class="bottom-nav__item" routerLink="/groups" routerLinkActive="is-active">
        <span class="bottom-nav__icon" aria-hidden="true">👥</span>
        <span class="bottom-nav__label">Grupos</span>
      </a>
      <a class="bottom-nav__item" routerLink="/ranking" routerLinkActive="is-active">
        <span class="bottom-nav__icon" aria-hidden="true">🏆</span>
        <span class="bottom-nav__label">Ranking</span>
      </a>
      <a class="bottom-nav__item" routerLink="/profile" routerLinkActive="is-active">
        <span class="bottom-nav__icon" aria-hidden="true">👤</span>
        <span class="bottom-nav__label">Perfil</span>
      </a>
    </nav>
  `,
  styles: [`
    :host { display: contents; }

    .bottom-nav {
      position: fixed;
      bottom: 0; left: 0; right: 0;
      display: none;
      grid-template-columns: repeat(5, 1fr);
      background: var(--wf-paper);
      border-top: 1px solid var(--wf-line);
      padding: 6px 0 calc(6px + env(safe-area-inset-bottom));
      z-index: 50;
    }
    @media (max-width: 767px) {
      .bottom-nav { display: grid; }
    }
    .bottom-nav__item {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 2px;
      padding: 6px 4px;
      color: var(--wf-ink-3);
      text-decoration: none;
      min-height: 48px;
      transition: color 150ms;
    }
    .bottom-nav__item.is-active {
      color: var(--wf-green-ink);
    }
    .bottom-nav__item.is-active .bottom-nav__label {
      font-weight: 700;
    }
    .bottom-nav__icon { font-size: 22px; line-height: 1; }
    .bottom-nav__label {
      font-size: 10px;
      letter-spacing: .03em;
    }
  `],
})
export class BottomNavComponent {
  private auth = inject(AuthService);
  // Inject reserved for future role-based filtering of nav items.
  readonly hasAuth = computed(() => this.auth.user() != null);
}
```

- [ ] **Step 2: Typecheck**

```bash
cd polla-app && npx tsc --noEmit -p tsconfig.app.json
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
cd 'C:\Users\Marke\Documents\Respaldo\polla mundialista\polla-app' && git add src/app/shared/layout/bottom-nav.component.ts
cd 'C:\Users\Marke\Documents\Respaldo\polla mundialista\polla-app' && git commit -m "feat(layout): mobile bottom-nav with 5 icons (no hamburger)

Visible only on <768px. Items: Home, Picks, Grupos, Ranking, Perfil.
Safe-area-inset-bottom respected. Active state via routerLinkActive.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Frontend — Sidebar component extracted with collapse state

**Files:**
- Create: `polla-app/src/app/shared/layout/sidebar.component.ts`
- Modify: `polla-app/src/app/shared/layout/nav.component.ts` (remove the `<aside class="app-sidebar">` block and the mobile hamburger menu)

- [ ] **Step 1: Read `nav.component.ts` to identify the sidebar block**

Read `polla-app/src/app/shared/layout/nav.component.ts` carefully. Identify:
- Lines around 208-300 with `<aside class="app-sidebar">` block (admin items, "Mis grupos", "Polla Mundialista", "Mis predicciones").
- The mobile hamburger menu block (search for `mobile-menu`).
- All signals used by the sidebar: `isAdmin()`, `topGroups()`, `myGroups()`, `bracketReady()`, methods `goToGroupsNew()`, `goToGroupsJoin()`.

- [ ] **Step 2: Create `sidebar.component.ts` with the extracted content**

Create `polla-app/src/app/shared/layout/sidebar.component.ts`. Copy the entire `<aside class="app-sidebar">` block + its supporting signals + methods + auth/data service injections from `nav.component.ts`. The component must:

- Standalone, with `RouterLink`, `RouterLinkActive` imports.
- Default `collapsed = signal(true)` (icons only, 56px).
- Read initial state from `localStorage.getItem('polla-sidebar-collapsed')` (default `'true'` if absent).
- Toggle on a button click (button rendered inside the sidebar header).
- Optional expand on `:hover` (pure CSS, expands temporarily without persisting).
- Persist `collapsed` to localStorage on each toggle.
- Visible only on `≥1024px` (CSS `@media`).

```typescript
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { UserModesService, type UserGroup } from '../../core/user/user-modes.service';
import { GroupActionsService } from '../../core/groups/group-actions.service';

const STORAGE_KEY = 'polla-sidebar-collapsed';

/**
 * Sidebar fijo izquierdo, solo visible en ≥1024px. Por defecto colapsado
 * a 56px (sólo iconos). Click en el botón ☰ del top o hover sobre el rail
 * expande a 200px con labels. Estado collapsed persiste en localStorage.
 *
 * Reemplaza al sidebar embebido que vivía dentro de nav.component.ts.
 */
@Component({
  standalone: true,
  selector: 'app-sidebar',
  imports: [RouterLink, RouterLinkActive],
  template: `
    <aside class="app-sidebar" [class.is-collapsed]="collapsed()">
      <button type="button" class="app-sidebar__toggle" (click)="toggle()"
              [attr.aria-label]="collapsed() ? 'Expandir sidebar' : 'Colapsar sidebar'">
        ☰
      </button>

      @if (isAdmin()) {
        <div class="app-sidebar__section">
          <div class="app-sidebar__kicker">Admin</div>
          <a class="sidebar-row" routerLink="/admin" routerLinkActive="is-active" [routerLinkActiveOptions]="{exact: true}">
            <span class="sidebar-row__icon">📊</span><span class="sidebar-row__label">Dashboard</span>
          </a>
          <a class="sidebar-row" routerLink="/admin/fixtures" routerLinkActive="is-active">
            <span class="sidebar-row__icon">⚽</span><span class="sidebar-row__label">Partidos</span>
          </a>
          <a class="sidebar-row" routerLink="/admin/bracket" routerLinkActive="is-active">
            <span class="sidebar-row__icon">🌳</span><span class="sidebar-row__label">Llaves</span>
          </a>
          <a class="sidebar-row" routerLink="/admin/results" routerLinkActive="is-active">
            <span class="sidebar-row__icon">🏆</span><span class="sidebar-row__label">Resultados</span>
          </a>
          <a class="sidebar-row" routerLink="/admin/teams" routerLinkActive="is-active">
            <span class="sidebar-row__icon">🏳️</span><span class="sidebar-row__label">Equipos</span>
          </a>
          <a class="sidebar-row" routerLink="/admin/special-results" routerLinkActive="is-active">
            <span class="sidebar-row__icon">⭐</span><span class="sidebar-row__label">Especiales</span>
          </a>
          <a class="sidebar-row" routerLink="/admin/sponsors" routerLinkActive="is-active">
            <span class="sidebar-row__icon">🎁</span><span class="sidebar-row__label">Sponsors</span>
          </a>
          <a class="sidebar-row" routerLink="/admin/articles" routerLinkActive="is-active">
            <span class="sidebar-row__icon">📰</span><span class="sidebar-row__label">Noticias</span>
          </a>
          <a class="sidebar-row" routerLink="/admin/groups-overview" routerLinkActive="is-active">
            <span class="sidebar-row__icon">📋</span><span class="sidebar-row__label">Grupos overview</span>
          </a>
          <a class="sidebar-row" routerLink="/admin/rankings-overview" routerLinkActive="is-active">
            <span class="sidebar-row__icon">🥇</span><span class="sidebar-row__label">Rankings</span>
          </a>
          <a class="sidebar-row" routerLink="/admin/users" routerLinkActive="is-active">
            <span class="sidebar-row__icon">👥</span><span class="sidebar-row__label">Users</span>
          </a>
        </div>
      } @else {
        <div class="app-sidebar__section">
          <div class="app-sidebar__kicker">Mis grupos</div>
          @for (g of topGroups(); track g.id) {
            <a class="sidebar-row" [routerLink]="['/groups', g.id]" routerLinkActive="is-active">
              <span class="sidebar-row__icon">{{ g.mode === 'COMPLETE' ? '🟢' : '🟡' }}</span>
              <span class="sidebar-row__label">{{ g.name }}</span>
            </a>
          }
          @if (myGroups().length > topGroups().length) {
            <a class="sidebar-row sidebar-row--more" routerLink="/groups">
              <span class="sidebar-row__icon">↗</span>
              <span class="sidebar-row__label">Ver todos ({{ myGroups().length }})</span>
            </a>
          }
          @if (myGroups().length === 0) {
            <p class="sidebar-empty">Aún no estás en ningún grupo.</p>
          }
          <button class="sidebar-row sidebar-row--btn" type="button" (click)="goCreate()">
            <span class="sidebar-row__icon">＋</span>
            <span class="sidebar-row__label">Crear grupo</span>
          </button>
          <button class="sidebar-row sidebar-row--btn" type="button" (click)="goJoin()">
            <span class="sidebar-row__icon">→</span>
            <span class="sidebar-row__label">Unirme</span>
          </button>
        </div>

        <div class="app-sidebar__section">
          <div class="app-sidebar__kicker">Polla Mundialista</div>
          <a class="sidebar-row" routerLink="/profile/special-picks" routerLinkActive="is-active">
            <span class="sidebar-row__icon">🏆</span>
            <span class="sidebar-row__label">Camp/Sub/Reve</span>
          </a>
        </div>

        <div class="app-sidebar__section">
          <div class="app-sidebar__kicker">Mis predicciones</div>
          <a class="sidebar-row" routerLink="/picks/group-stage/predict" routerLinkActive="is-active">
            <span class="sidebar-row__icon">📋</span>
            <span class="sidebar-row__label">Clasificados</span>
          </a>
          @if (bracketReady()) {
            <a class="sidebar-row" routerLink="/picks/bracket" routerLinkActive="is-active">
              <span class="sidebar-row__icon">🌳</span>
              <span class="sidebar-row__label">Llaves</span>
            </a>
          }
        </div>
      }
    </aside>
  `,
  styles: [`
    :host { display: contents; }

    .app-sidebar {
      position: sticky; top: 64px;
      width: 200px;
      max-height: calc(100vh - 64px);
      overflow-y: auto;
      padding: 12px 8px;
      background: var(--wf-paper);
      border-right: 1px solid var(--wf-line);
      transition: width 200ms;
      display: none;
    }
    @media (min-width: 1024px) {
      .app-sidebar { display: block; }
    }
    .app-sidebar.is-collapsed { width: 56px; }
    .app-sidebar.is-collapsed:hover { width: 200px; }

    .app-sidebar__toggle {
      background: transparent; border: 0; cursor: pointer;
      padding: 6px 8px; font-size: 18px; color: var(--wf-ink-2);
      margin-bottom: 12px;
    }

    .app-sidebar__section { margin-bottom: 18px; }
    .app-sidebar__kicker {
      font-size: 10px; letter-spacing: .12em;
      color: var(--wf-ink-3); text-transform: uppercase;
      padding: 0 8px; margin-bottom: 6px;
      transition: opacity 150ms;
    }
    .app-sidebar.is-collapsed:not(:hover) .app-sidebar__kicker { opacity: 0; }
    .app-sidebar.is-collapsed:not(:hover) .sidebar-row__label { opacity: 0; }

    .sidebar-row {
      display: flex; align-items: center; gap: 10px;
      padding: 8px;
      border-radius: 8px;
      text-decoration: none;
      color: var(--wf-ink);
      font-size: 13px;
      cursor: pointer;
      white-space: nowrap;
      overflow: hidden;
      transition: background 150ms;
    }
    .sidebar-row:hover { background: var(--wf-fill); }
    .sidebar-row.is-active { background: var(--wf-green-soft); color: var(--wf-green-ink); font-weight: 600; }
    .sidebar-row__icon { width: 24px; text-align: center; flex-shrink: 0; }
    .sidebar-row__label { transition: opacity 150ms; }

    .sidebar-row--btn { background: transparent; border: 0; width: 100%; text-align: left; }
    .sidebar-empty { font-size: 12px; color: var(--wf-ink-3); padding: 0 8px; margin: 4px 0; }
  `],
})
export class SidebarComponent implements OnInit {
  private auth = inject(AuthService);
  private userModes = inject(UserModesService);
  private groupActions = inject(GroupActionsService);
  private router = inject(Router);

  collapsed = signal<boolean>(this.readInitialState());

  isAdmin = computed(() => this.auth.user()?.isAdmin === true);
  myGroups = computed(() => this.userModes.groups());
  topGroups = computed<UserGroup[]>(() => this.myGroups().slice(0, 5));
  bracketReady = computed(() => this.userModes.bracketReady());

  ngOnInit() {
    // Reactive persistence — write whenever collapsed changes.
    // Simple effect-free approach: read in toggle().
  }

  toggle() {
    const next = !this.collapsed();
    this.collapsed.set(next);
    try { localStorage.setItem(STORAGE_KEY, String(next)); } catch { /* no-op */ }
  }

  private readInitialState(): boolean {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw === null) return true;   // default collapsed
      return raw === 'true';
    } catch { return true; }
  }

  goCreate() { this.groupActions.openCreate(); }
  goJoin() { this.groupActions.openJoin(); }
}
```

Important: `userModes.bracketReady()` might not exist as a method on `UserModesService`. Inspect the service first; the original `nav.component.ts` had a `bracketReady()` signal — either reproduce that logic here or import the same source. If the service has a method, use it. If not, the original `nav.component.ts` may compute it from `userModes.matches()` or similar; copy the same compute.

If `UserModesService` doesn't expose what's needed, replace `bracketReady()` with `userModes.hasComplete()` as a fallback (means the user has at least one COMPLETE group, which is the same gate as Bracket access for v1). Document in a comment.

- [ ] **Step 3: Remove sidebar + hamburger from `nav.component.ts`**

In `polla-app/src/app/shared/layout/nav.component.ts`:

1. Find the comment around line 205 starting with `Wrapper con position:relative...` and the `<div class="app-sidebar-wrap">...<aside class="app-sidebar">...</aside></div>` block. **Delete the entire block** (the wrapper div + the aside).

2. Find the mobile-menu block (look for `class="mobile-menu"`). **Delete that block too** — bottom-nav replaces it.

3. Remove now-unused imports / signals from the class body. Likely candidates:
   - `topGroups`, `myGroups`, `bracketReady` (now in sidebar.component.ts)
   - `goToGroupsNew`, `goToGroupsJoin` (now in sidebar.component.ts)
   - `mobileMenuOpen` signal and toggle method (if any).

If unsure whether something is still used in the topnav portion, search the template for the symbol before removing.

- [ ] **Step 4: Typecheck + build**

```bash
cd polla-app && npx tsc --noEmit -p tsconfig.app.json
cd polla-app && npx ng build --configuration=development 2>&1 | tail -10
```

Expected: 0 errors. If the build complains about unused symbols, the cleanup in Step 3 is incomplete.

- [ ] **Step 5: Commit**

```bash
cd 'C:\Users\Marke\Documents\Respaldo\polla mundialista\polla-app' && git add src/app/shared/layout/sidebar.component.ts src/app/shared/layout/nav.component.ts
cd 'C:\Users\Marke\Documents\Respaldo\polla mundialista\polla-app' && git commit -m "feat(layout): extract sidebar into its own component with collapse state

Default 56px (icons only); hover expands; click ☰ toggles persistent
expanded state via localStorage. Visible only on ≥1024px. Includes new
'Noticias' admin link. Removed the sidebar + mobile hamburger blocks
from nav.component.ts; bottom-nav covers mobile.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Frontend — Shell integration + right-rail removal

**Files:**
- Modify: `polla-app/src/app/shared/layout/shell.component.ts`
- Modify: any component that calls `RightRailService.show()` / `hide()` (likely: picks-list, picks-tabla-grupos, picks-bracket, groups-list, group-detail; grep to confirm).

- [ ] **Step 1: Update `shell.component.ts`**

Replace the contents of `polla-app/src/app/shared/layout/shell.component.ts` with:

```typescript
import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { NavComponent } from './nav.component';
import { SidebarComponent } from './sidebar.component';
import { BottomNavComponent } from './bottom-nav.component';
import { FooterComponent } from './footer.component';
import { PicksPendingBannerComponent } from '../../features/picks/picks-pending-banner.component';
import { ToastHostComponent } from '../../core/notifications/toast-host.component';
import { TriviaPopupComponent } from '../../features/trivia/trivia-popup.component';
import { GroupActionsModalsComponent } from './group-actions-modals.component';
import { RedeemModalComponent } from './redeem-modal.component';

@Component({
  standalone: true,
  selector: 'app-shell',
  imports: [
    RouterOutlet, NavComponent, SidebarComponent, BottomNavComponent, FooterComponent,
    PicksPendingBannerComponent, ToastHostComponent, TriviaPopupComponent,
    GroupActionsModalsComponent, RedeemModalComponent,
  ],
  template: `
    <div class="app-shell">
      <app-nav />
      <div class="app-shell__body">
        <app-sidebar />
        <main class="app-main">
          <app-picks-pending-banner />
          <router-outlet />
        </main>
      </div>
      <app-footer />
    </div>
    <app-bottom-nav />
    <app-toast-host />
    <app-trivia-popup />
    <app-group-actions-modals />
    <app-redeem-modal />
  `,
  styles: [`
    :host { display: block; }
    .app-shell { display: flex; flex-direction: column; min-height: 100dvh; }
    .app-shell__body { display: flex; flex: 1; }
    .app-main { flex: 1; min-width: 0; padding: 18px 22px 80px; }
    @media (max-width: 767px) {
      .app-main { padding-bottom: 88px; }   /* clearance for bottom-nav */
    }
  `],
})
export class ShellComponent {}
```

Notes:
- Removed `RightRailService` injection + `app-rail-wrap` wrapper + `[class.has-rail]` binding.
- New layout uses `app-shell__body` with flex: sidebar on the left, main fills remaining width.
- Bottom padding on `.app-main` reserves space for bottom-nav on mobile.

- [ ] **Step 2: Find and remove `RightRailService` callers**

Find all uses:

```bash
cd polla-app && grep -rn "RightRailService\|rail\.show\|rail\.hide" src/app/features/ 2>&1 | head -30
```

Expected callers: `picks-list.component.ts`, `picks-tabla-grupos.component.ts`, `bracket-picks.component.ts`, `groups-list.component.ts`, `group-detail.component.ts`. For each:

1. Remove the import `import { RightRailService } from '...';`.
2. Remove the inject `rail = inject(RightRailService);` (or `private rail = inject(...)`).
3. Remove any `this.rail.show()` / `this.rail.hide()` calls (typically in `ngOnInit` and `ngOnDestroy`).
4. If the component injects `rail` only for that purpose, remove the entire property.

**Do NOT delete** `right-rail.component.ts` or `right-rail.service.ts` themselves — keep them in the repo for potential future use (mark this as YAGNI cleanup deferred).

- [ ] **Step 3: Typecheck + build**

```bash
cd polla-app && npx tsc --noEmit -p tsconfig.app.json
cd polla-app && npx ng build --configuration=development 2>&1 | tail -10
```

Expected: 0 errors.

- [ ] **Step 4: Jest**

```bash
cd polla-app && npx jest --no-coverage
```

Expected: 40/40 pass (no new tests added; UI refactor doesn't add specs).

- [ ] **Step 5: Commit**

```bash
cd 'C:\Users\Marke\Documents\Respaldo\polla mundialista\polla-app' && git add src/app/shared/layout/shell.component.ts src/app/features/
cd 'C:\Users\Marke\Documents\Respaldo\polla mundialista\polla-app' && git commit -m "refactor(layout): wire new shell with sidebar + bottom-nav; remove right-rail

Shell now lays out: topnav (full width) → [sidebar | main] → footer.
Bottom-nav floats over the bottom on mobile. Right-rail removed from
all routes; its callers in picks/groups components stripped. The
right-rail component file and service stay in the repo (deferred
cleanup) but are no longer imported anywhere in the runtime tree.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Frontend — Home rewrite with sports/vibrant styling

**Files:**
- Modify: `polla-app/src/app/features/home/home.component.ts` (full rewrite)

- [ ] **Step 1: Rewrite `home.component.ts`**

Replace the contents of `polla-app/src/app/features/home/home.component.ts` with the structure below. The component imports the existing `ApiService`, `AuthService`, `UserModesService` plus `getUrl` for article images.

```typescript
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api/api.service';
import { AuthService } from '../../core/auth/auth.service';
import { UserModesService } from '../../core/user/user-modes.service';
import { getUrl } from 'aws-amplify/storage';

const TOURNAMENT_ID = 'mundial-2026';
const NEWS_HUB_URL = 'https://golgana.net/news';

interface UpcomingMatch {
  id: string;
  phaseOrder: number;
  homeName: string;
  awayName: string;
  homeFlag: string;
  awayFlag: string;
  kickoffAt: string;
  kickoffLabel: string;
  countdown: string;
  isLive: boolean;
  hasPick: boolean;
}

interface ArticleCard {
  id: string;
  title: string;
  externalUrl: string;
  publishedAt: string;
  resolvedImageUrl: string | null;
  relativeTime: string;
}

interface GroupRow {
  id: string;
  name: string;
  mode: 'SIMPLE' | 'COMPLETE';
  position: number | null;
  totalMembers: number;
}

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [RouterLink],
  template: `
    <section class="page home">

      <!-- Greeting -->
      <header class="home-greet">
        <div class="kicker">MUNDIAL 2026 · GOLGANA</div>
        <h1>Hola, {{ '@' + (handle() ?? 'jugador') }}</h1>
      </header>

      <!-- 1. HERO: próximo partido -->
      @if (heroMatch(); as m) {
        <a [routerLink]="['/picks/match', m.id]" class="hero-match">
          <div class="hero-match__time">
            @if (m.isLive) {
              <span class="hero-match__live">● EN VIVO</span>
            } @else {
              <span>{{ m.kickoffLabel }} · faltan {{ m.countdown }}</span>
            }
          </div>
          <div class="hero-match__teams">
            <div class="hero-match__team">
              @if (m.homeFlag) {
                <span class="fi fi-{{ m.homeFlag.toLowerCase() }} hero-match__flag"></span>
              }
              <span class="hero-match__name">{{ m.homeName }}</span>
            </div>
            <span class="hero-match__vs">VS</span>
            <div class="hero-match__team hero-match__team--right">
              <span class="hero-match__name">{{ m.awayName }}</span>
              @if (m.awayFlag) {
                <span class="fi fi-{{ m.awayFlag.toLowerCase() }} hero-match__flag"></span>
              }
            </div>
          </div>
          <div class="hero-match__cta">
            {{ m.hasPick ? 'Editar mi pick' : 'Hacer mi pick' }} →
          </div>
        </a>
      } @else if (loading()) {
        <div class="hero-match hero-match--skel">
          <div class="hero-match__time">Cargando…</div>
        </div>
      } @else {
        <div class="hero-match hero-match--empty">
          <div class="hero-match__time">Mundial 2026</div>
          <p class="text-mute">Próximamente — el torneo arranca pronto.</p>
        </div>
      }

      <!-- 2. STATS ROW -->
      <div class="home-stats">
        <div class="home-stat">
          <div class="home-stat__num">{{ totals().points }}</div>
          <div class="home-stat__lbl">Mi puntaje</div>
        </div>
        <div class="home-stat">
          <div class="home-stat__num">
            {{ totals().globalRank ? '#' + totals().globalRank : '—' }}
          </div>
          <div class="home-stat__lbl">Ranking global</div>
        </div>
        <div class="home-stat">
          <div class="home-stat__num">{{ pendingPicksCount() }}</div>
          <div class="home-stat__lbl">Picks pendientes</div>
        </div>
      </div>

      <!-- 3. DOS COLUMNAS: mis grupos + editorial -->
      <div class="home-two-col">

        <!-- Mis grupos -->
        <section class="home-block">
          <header class="home-block__head">
            <h2>Mis grupos</h2>
            <a routerLink="/groups" class="home-block__more">Ver todos →</a>
          </header>
          @if (myGroupsList().length === 0) {
            <p class="home-block__empty">Aún no estás en ningún grupo.</p>
            <button type="button" class="btn-wf btn-wf--primary" (click)="onCreateGroup()">
              Crear grupo
            </button>
          } @else {
            <ul class="group-mini-list">
              @for (g of myGroupsList(); track g.id) {
                <li>
                  <a [routerLink]="['/groups', g.id]" class="group-mini">
                    <span class="group-mini__name">{{ g.name }}</span>
                    <span class="group-mini__pos">
                      @if (g.position) {
                        #{{ g.position }} / {{ g.totalMembers }}
                      } @else {
                        — / {{ g.totalMembers }}
                      }
                    </span>
                  </a>
                </li>
              }
            </ul>
          }
        </section>

        <!-- Editorial -->
        <section class="home-block">
          <header class="home-block__head">
            <h2>📰 Noticias del torneo</h2>
          </header>
          @if (articlesLoading()) {
            <p class="text-mute">Cargando…</p>
          } @else if (articles().length === 0) {
            <p class="home-block__empty">Próximamente noticias del Mundial.</p>
          } @else {
            <ul class="article-list">
              @for (a of articles(); track a.id) {
                <li>
                  <a [href]="a.externalUrl" target="_blank" rel="noopener noreferrer"
                     class="article-card">
                    @if (a.resolvedImageUrl) {
                      <img [src]="a.resolvedImageUrl" [alt]="a.title" class="article-card__img">
                    } @else {
                      <div class="article-card__img article-card__img--placeholder">📰</div>
                    }
                    <div class="article-card__body">
                      <div class="article-card__title">{{ a.title }}</div>
                      <div class="article-card__meta">{{ a.relativeTime }} · ↗</div>
                    </div>
                  </a>
                </li>
              }
            </ul>
            <a [href]="newsHubUrl" target="_blank" rel="noopener noreferrer"
               class="home-block__more">Ver todas en golgana.net →</a>
          }
        </section>
      </div>

      <!-- 4. PRÓXIMOS PARTIDOS (4) -->
      <section class="home-block">
        <header class="home-block__head">
          <h2>Próximos partidos</h2>
          <a routerLink="/picks" class="home-block__more">Ver lista completa →</a>
        </header>
        @if (upcoming().length === 0) {
          <p class="home-block__empty">No hay partidos programados próximamente.</p>
        } @else {
          <ul class="upcoming-list">
            @for (m of upcoming(); track m.id) {
              <li>
                <a [routerLink]="['/picks/match', m.id]" class="upcoming-row">
                  <span class="upcoming-row__time">{{ m.kickoffLabel }}</span>
                  <span class="upcoming-row__teams">
                    {{ m.homeName }} vs {{ m.awayName }}
                  </span>
                  <span class="upcoming-row__status"
                        [class.is-picked]="m.hasPick"
                        [class.is-pending]="!m.hasPick">
                    {{ m.hasPick ? '✓ pick' : 'pendiente' }}
                  </span>
                </a>
              </li>
            }
          </ul>
        }
      </section>

    </section>
  `,
  styles: [`
    :host { display: block; }

    .home-greet { margin-bottom: 24px; }
    .home-greet h1 { margin: 4px 0 0; font-family: var(--wf-display); font-size: clamp(24px, 4vw, 36px); }

    .hero-match {
      display: block;
      background: linear-gradient(135deg, var(--wf-green-soft) 0%, var(--wf-paper) 100%);
      border: 2px solid var(--wf-green);
      border-radius: 14px;
      padding: 22px;
      margin-bottom: 32px;
      text-decoration: none; color: inherit;
      transition: transform 200ms, box-shadow 200ms;
    }
    .hero-match:hover { transform: translateY(-2px); box-shadow: 0 12px 32px rgba(0,200,100,0.16); }
    .hero-match--skel, .hero-match--empty { background: var(--wf-fill); border-color: var(--wf-line); }
    .hero-match__time { font-size: 12px; letter-spacing: .12em; color: var(--wf-ink-3); text-transform: uppercase; margin-bottom: 14px; }
    .hero-match__live { color: var(--wf-danger); font-weight: 700; animation: pulse 1.2s infinite; }
    @keyframes pulse { 50% { opacity: .55; } }
    .hero-match__teams { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 14px; margin-bottom: 18px; }
    .hero-match__team { display: flex; align-items: center; gap: 10px; }
    .hero-match__team--right { justify-content: flex-end; }
    .hero-match__flag { font-size: 32px; }
    .hero-match__name { font-family: var(--wf-display); font-size: clamp(18px, 3vw, 28px); font-weight: 700; }
    .hero-match__vs { font-family: var(--wf-display); font-size: 14px; color: var(--wf-ink-3); letter-spacing: .12em; }
    .hero-match__cta { font-weight: 700; color: var(--wf-green-ink); }

    .home-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 32px; }
    .home-stat { background: var(--wf-paper); border: 1px solid var(--wf-line); border-radius: 12px; padding: 18px; text-align: center; }
    .home-stat__num { font-family: var(--wf-display); font-size: clamp(28px, 5vw, 48px); font-weight: 800; line-height: 1; font-variant-numeric: tabular-nums; }
    .home-stat__lbl { font-size: 11px; letter-spacing: .08em; color: var(--wf-ink-3); text-transform: uppercase; margin-top: 8px; }

    .home-two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 32px; }
    @media (max-width: 768px) { .home-two-col { grid-template-columns: 1fr; } }

    .home-block { background: var(--wf-paper); border: 1px solid var(--wf-line); border-radius: 12px; padding: 18px; }
    .home-block__head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
    .home-block__head h2 { font-family: var(--wf-display); font-size: 16px; letter-spacing: .06em; margin: 0; }
    .home-block__more { font-size: 12px; color: var(--wf-green-ink); text-decoration: none; }
    .home-block__empty { font-size: 13px; color: var(--wf-ink-3); margin: 0; }

    .group-mini-list { list-style: none; padding: 0; margin: 0; display: grid; gap: 6px; }
    .group-mini { display: flex; justify-content: space-between; padding: 10px; border-radius: 8px; background: var(--wf-fill); text-decoration: none; color: inherit; transition: background 150ms; }
    .group-mini:hover { background: var(--wf-green-soft); }
    .group-mini__name { font-weight: 600; }
    .group-mini__pos { font-size: 12px; color: var(--wf-ink-3); font-variant-numeric: tabular-nums; }

    .article-list { list-style: none; padding: 0; margin: 0 0 10px; display: grid; gap: 10px; }
    .article-card { display: grid; grid-template-columns: 80px 1fr; gap: 12px; padding: 8px; border-radius: 8px; text-decoration: none; color: inherit; transition: background 150ms; }
    .article-card:hover { background: var(--wf-fill); }
    .article-card__img { width: 80px; height: 60px; object-fit: cover; border-radius: 6px; }
    .article-card__img--placeholder { display: flex; align-items: center; justify-content: center; background: var(--wf-fill); font-size: 24px; }
    .article-card__title { font-weight: 600; font-size: 14px; line-height: 1.3; }
    .article-card__meta { font-size: 11px; color: var(--wf-ink-3); margin-top: 4px; }

    .upcoming-list { list-style: none; padding: 0; margin: 0; display: grid; gap: 6px; }
    .upcoming-row { display: grid; grid-template-columns: 110px 1fr auto; gap: 10px; padding: 8px 10px; border-radius: 8px; text-decoration: none; color: inherit; align-items: center; transition: background 150ms; }
    .upcoming-row:hover { background: var(--wf-fill); }
    .upcoming-row__time { font-size: 11px; letter-spacing: .06em; color: var(--wf-ink-3); text-transform: uppercase; }
    .upcoming-row__status { font-size: 11px; font-weight: 600; }
    .upcoming-row__status.is-picked { color: var(--wf-green-ink); }
    .upcoming-row__status.is-pending { color: var(--wf-warn); }
  `],
})
export class HomeComponent implements OnInit {
  private auth = inject(AuthService);
  private api = inject(ApiService);
  private userModes = inject(UserModesService);

  readonly newsHubUrl = NEWS_HUB_URL;

  handle = computed(() => this.auth.user()?.handle ?? null);

  loading = signal(true);
  articlesLoading = signal(true);
  upcoming = signal<UpcomingMatch[]>([]);
  heroMatch = computed<UpcomingMatch | null>(() => this.upcoming()[0] ?? null);
  articles = signal<ArticleCard[]>([]);
  myGroupsList = signal<GroupRow[]>([]);
  totals = signal<{ points: number; globalRank: number | null }>({ points: 0, globalRank: null });
  pendingPicksCount = signal(0);

  async ngOnInit() {
    void this.loadMatchesAndStats();
    void this.loadArticles();
    void this.loadGroups();
  }

  onCreateGroup() {
    // Reuse same flow as the sidebar shortcut. Imported via GroupActionsService
    // if needed in a future iteration. For now, leave the empty-state button
    // navigating to /groups/new via routerLink in template alternative — but
    // since we're using a button (no routerLink), we'd need GroupActionsService.
    // Simpler v1: replace button with a routerLink to /groups/new.
    // (Note: if the empty state must use a button per a11y reasons, inject
    // GroupActionsService and call openCreate.)
  }

  private async loadMatchesAndStats() {
    this.loading.set(true);
    try {
      const userId = this.auth.user()?.sub ?? '';
      const [matchesRes, teamsRes, totalRes, leaderboardRes, picksRes] = await Promise.all([
        this.api.listMatches(TOURNAMENT_ID),
        this.api.listTeams(TOURNAMENT_ID),
        userId ? this.api.myTotal(userId, TOURNAMENT_ID) : Promise.resolve({ data: [] as readonly unknown[] }),
        this.api.listLeaderboard(TOURNAMENT_ID, 200),
        userId ? this.api.listPicks(userId) : Promise.resolve({ data: [] as readonly unknown[] }),
      ]);

      const teamMap = new Map<string, { name: string; flag: string }>(
        (teamsRes.data ?? [])
          .filter((t): t is NonNullable<typeof t> => !!t && !!t.slug)
          .map((t) => [t.slug, { name: t.name ?? t.slug, flag: t.flagCode ?? '' }]),
      );

      const userPicks = new Set<string>(
        ((picksRes.data ?? []) as ReadonlyArray<{ matchId: string }>).map((p) => p.matchId),
      );

      const now = Date.now();
      const all = (matchesRes.data ?? [])
        .filter((m): m is NonNullable<typeof m> => !!m && !!m.kickoffAt && !!m.id);

      const upcomingList: UpcomingMatch[] = all
        .filter((m) => new Date(m.kickoffAt!).getTime() > now - 2 * 3600 * 1000)
        .sort((a, b) => new Date(a.kickoffAt!).getTime() - new Date(b.kickoffAt!).getTime())
        .slice(0, 5)
        .map((m) => {
          const ko = new Date(m.kickoffAt!);
          const home = teamMap.get(m.homeTeamId) ?? { name: m.homeTeamId, flag: '' };
          const away = teamMap.get(m.awayTeamId) ?? { name: m.awayTeamId, flag: '' };
          const isLive = m.status === 'IN_PROGRESS' || m.status === 'LIVE';
          return {
            id: m.id,
            phaseOrder: (m as { phaseOrder?: number }).phaseOrder ?? 0,
            homeName: home.name, awayName: away.name,
            homeFlag: home.flag, awayFlag: away.flag,
            kickoffAt: m.kickoffAt!,
            kickoffLabel: this.formatKickoff(ko),
            countdown: this.formatCountdown(ko, now),
            isLive,
            hasPick: userPicks.has(m.id),
          };
        });

      this.upcoming.set(upcomingList);

      const totalRow = ((totalRes.data ?? []) as ReadonlyArray<{ points?: number }>)[0];
      const sorted = ((leaderboardRes.data ?? []) as ReadonlyArray<{ userId: string; points?: number }>)
        .slice().sort((a, b) => (b.points ?? 0) - (a.points ?? 0));
      const rankIdx = sorted.findIndex((t) => t.userId === userId);

      this.totals.set({
        points: totalRow?.points ?? 0,
        globalRank: rankIdx >= 0 ? rankIdx + 1 : null,
      });

      // Pending picks: matches in next 48h that the user hasn't picked.
      const cutoff = now + 48 * 3600 * 1000;
      const pending = all.filter((m) => {
        const ko = new Date(m.kickoffAt!).getTime();
        return ko > now && ko < cutoff && !userPicks.has(m.id);
      });
      this.pendingPicksCount.set(pending.length);
    } catch (e) {
      // Silent fail — home should never block.
      console.warn('[home] load matches/stats failed', e);
    } finally {
      this.loading.set(false);
    }
  }

  private async loadArticles() {
    this.articlesLoading.set(true);
    try {
      const res = await this.api.listPublishedArticles(4);
      const rows = (res.data ?? []).slice();
      // Resolve image URLs in parallel.
      const enriched: ArticleCard[] = await Promise.all(rows.map(async (a) => {
        let resolvedImageUrl: string | null = null;
        if (a.imageKey) {
          try {
            const { url } = await getUrl({ key: a.imageKey, options: { expiresIn: 3600 } });
            resolvedImageUrl = url.toString();
          } catch { /* ignore */ }
        }
        return {
          id: a.id, title: a.title, externalUrl: a.externalUrl, publishedAt: a.publishedAt,
          resolvedImageUrl, relativeTime: this.formatRelative(a.publishedAt),
        };
      }));
      this.articles.set(enriched);
    } catch (e) {
      console.warn('[home] load articles failed', e);
    } finally {
      this.articlesLoading.set(false);
    }
  }

  private async loadGroups() {
    const userId = this.auth.user()?.sub ?? '';
    if (!userId) return;
    try {
      const groups = this.userModes.groups();
      // Limit to top 5 for the home; click to /groups gets full list.
      const top = groups.slice(0, 5);
      // For each group, count members + find user's position. Best effort —
      // failure to load one group doesn't block the others.
      const rows = await Promise.all(top.map(async (g): Promise<GroupRow> => {
        try {
          const lbRes = await this.api.groupLeaderboard(g.id);
          const sorted = ((lbRes.data ?? []) as ReadonlyArray<{ userId: string; points?: number }>)
            .slice().sort((a, b) => (b.points ?? 0) - (a.points ?? 0));
          const idx = sorted.findIndex((m) => m.userId === userId);
          return {
            id: g.id, name: g.name, mode: g.mode,
            position: idx >= 0 ? idx + 1 : null,
            totalMembers: sorted.length,
          };
        } catch {
          return { id: g.id, name: g.name, mode: g.mode, position: null, totalMembers: 0 };
        }
      }));
      this.myGroupsList.set(rows);
    } catch (e) {
      console.warn('[home] load groups failed', e);
    }
  }

  private formatKickoff(d: Date): string {
    const today = new Date();
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    if (d.toDateString() === today.toDateString()) return `HOY ${time}`;
    if (d.toDateString() === tomorrow.toDateString()) return `MAÑANA ${time}`;
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    return `${day}/${month} ${time}`;
  }

  private formatCountdown(target: Date, nowMs: number): string {
    const diff = target.getTime() - nowMs;
    if (diff < 0) return 'EN VIVO';
    const h = Math.round(diff / 3600_000);
    if (h < 1) {
      const mins = Math.max(1, Math.round(diff / 60_000));
      return `${mins} min`;
    }
    if (h < 24) return `${h}h`;
    const d = Math.round(h / 24);
    return d === 1 ? '1 día' : `${d} días`;
  }

  private formatRelative(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime();
    const h = Math.round(diff / 3600_000);
    if (h < 1) return 'hace minutos';
    if (h < 24) return `hace ${h}h`;
    const d = Math.round(h / 24);
    if (d < 7) return d === 1 ? 'hace 1 día' : `hace ${d} días`;
    return new Date(iso).toLocaleDateString();
  }
}
```

**Important caveats** for the implementer:
- The component uses `api.listPicks(userId)` — verify that method exists in `api.service.ts`. If the actual method name differs (e.g. `listUserPicks`, `listPicksByUser`), use the existing one. If it doesn't exist, derive the user's picks by filtering `userModes` or skipping the `hasPick` flag (`hasPick: false` for all).
- The component uses `api.groupLeaderboard(groupId)` — verify the method name; if not present, use whatever the `group-detail.component.ts` uses to load member rankings.
- The `onCreateGroup()` placeholder is intentionally minimal; the simpler v1 is to replace the button with `<a routerLink="/groups/new">Crear grupo</a>` styled as `btn-wf--primary`. Use that if you don't want to inject `GroupActionsService`.

- [ ] **Step 2: Typecheck + build**

```bash
cd polla-app && npx tsc --noEmit -p tsconfig.app.json
cd polla-app && npx ng build --configuration=development 2>&1 | tail -10
```

Expected: 0 errors. If TS complains about `listPicks` / `groupLeaderboard`, adapt to the actual method names.

- [ ] **Step 3: Jest**

```bash
cd polla-app && npx jest --no-coverage
```

Expected: 40/40 pass.

- [ ] **Step 4: Commit**

```bash
cd 'C:\Users\Marke\Documents\Respaldo\polla mundialista\polla-app' && git add src/app/features/home/home.component.ts
cd 'C:\Users\Marke\Documents\Respaldo\polla mundialista\polla-app' && git commit -m "feat(home): redesign with hero match, stats row, groups+news, upcoming list

Replaces the generic hub-grid with priority-ordered content:
1. Hero card for the next/live match with big countdown and CTA.
2. Three big-number stats: points, global rank, pending picks.
3. Two-column block: top 5 of my groups (with position) + latest 4 articles
   linking out to golgana.net/news.
4. Compact list of the next 4 upcoming matches with picked/pending status.

Applies sports/vibrant techniques (large numbers, tabular figures, bold
gradients on the hero, hover lift) without changing the brand palette
(green primary kept).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Deploy sandbox + QA + cleanup casts

**Files:** none beyond optional cleanup.

- [ ] **Step 1: Deploy backend changes**

```bash
cd polla-backend && npm run sandbox
```

Wait for "✔ Watching for file changes". This deploys the new `Article` table, GSI, and storage permissions. `amplify_outputs.json` regenerates with the new model in introspection.

- [ ] **Step 2: Copy regenerated outputs to polla-app**

```bash
cp 'C:\Users\Marke\Documents\Respaldo\polla mundialista\polla-backend\amplify_outputs.json' 'C:\Users\Marke\Documents\Respaldo\polla mundialista\polla-app\amplify_outputs.json'
cp 'C:\Users\Marke\Documents\Respaldo\polla mundialista\polla-backend\amplify_outputs.json' 'C:\Users\Marke\Documents\Respaldo\polla mundialista\polla-app\src\amplify_outputs.json'
```

Confirm Article is present:

```bash
grep -c '"Article"' 'C:\Users\Marke\Documents\Respaldo\polla mundialista\polla-app\src\amplify_outputs.json'
```

Expected: count ≥ 1.

- [ ] **Step 3: Drop the temporary casts in api.service.ts**

Open `polla-app/src/app/core/api/api.service.ts` and replace each of the 5 Article-related casts:

For `listPublishedArticles`:

```typescript
listPublishedArticles(limit = 4) {
  return apiClient.models.Article.listArticleByStatusAndPublishedAt(
    { status: 'PUBLISHED' },
    { sortDirection: 'DESC', limit, authMode: 'apiKey' },
  );
}
```

For `listAllArticles`:

```typescript
listAllArticles() {
  return apiClient.models.Article.list({ limit: 200 });
}
```

For `createArticle`, `updateArticle`, `deleteArticle`:

```typescript
createArticle(input: {
  title: string; imageKey?: string; externalUrl: string;
  publishedAt: string; status: 'PUBLISHED' | 'DRAFT'; sortOrder?: number;
}) {
  return apiClient.models.Article.create(input);
}

updateArticle(input: {
  id: string;
  title?: string; imageKey?: string; externalUrl?: string;
  publishedAt?: string; status?: 'PUBLISHED' | 'DRAFT'; sortOrder?: number;
}) {
  return apiClient.models.Article.update(input);
}

deleteArticle(id: string) {
  return apiClient.models.Article.delete({ id });
}
```

Run typecheck + build:

```bash
cd polla-app && npx tsc --noEmit -p tsconfig.app.json
cd polla-app && npx ng build --configuration=development 2>&1 | tail -10
```

Expected: clean.

Commit:

```bash
cd 'C:\Users\Marke\Documents\Respaldo\polla mundialista\polla-app' && git add src/app/core/api/api.service.ts amplify_outputs.json
cd 'C:\Users\Marke\Documents\Respaldo\polla mundialista\polla-app' && git commit -m "chore: drop temporary Article casts + regenerated amplify_outputs.json

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 4: QA scenarios**

In a browser at `http://localhost:4200` (hard refresh to pick up the new amplify_outputs):

1. **Desktop ≥1024px**:
   - Sidebar visible on left at 56px wide (icons only).
   - Click ☰ → expands to 200px, persists after refresh.
   - Hover over collapsed sidebar → expands temporarily, collapses on mouseleave.
   - Right-rail NOT visible on any route.
   - Home: hero match, 3 big stats, 2-column (groups + news), upcoming list.

2. **Tablet 768-1023px**:
   - Sidebar hidden. Top-nav still visible.
   - Bottom-nav hidden. Content fills full width with the top-nav.
   - Home looks readable; 2-column may collapse depending on internal breakpoint (verify).

3. **Mobile <768px**:
   - Bottom-nav visible with 5 icons.
   - Active route highlighted in green.
   - Hamburger menu gone.
   - Home stacks vertically; hero match readable.
   - Safe-area-inset-bottom respected (no content cut by home indicator).

4. **Admin Articles**:
   - Sidebar (or topnav admin item) has a "Noticias" link.
   - `/admin/articles` shows the empty state.
   - "+ Nueva noticia" → modal opens with all fields.
   - Upload a < 2MB JPG → cover renders.
   - Save as DRAFT → row appears with DRAFT pill; home does NOT show it.
   - Edit, switch to PUBLISHED → home now shows it.
   - Click in home → opens externalUrl in new tab.
   - Delete → confirms and removes.

5. **Stats row**:
   - "Mi puntaje" shows current UserTournamentTotal (default 0 pre-tournament).
   - "Ranking global" shows # or — if not ranked.
   - "Picks pendientes" shows 0 or the actual count of matches in next 48h without a pick.

6. **News hub link**:
   - "Ver todas en golgana.net →" opens `https://golgana.net/news` in a new tab.

- [ ] **Step 5: Report any regressions and final commit if needed**

If QA finds a copy issue / mis-aligned UI / wrong condition, fix and commit with `fix(<area>): ...` message.
