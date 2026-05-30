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
      if (token !== this.currentSearchToken) return;
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
