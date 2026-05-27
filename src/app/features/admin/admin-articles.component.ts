import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
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
  imports: [FormsModule, DatePipe],
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
