import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api/api.service';
import { AuthService } from '../../core/auth/auth.service';

const STORAGE_KEY = 'picks-banner-dismissed-on';
const TOURNAMENT_ID = 'mundial-2026';

@Component({
  standalone: true,
  selector: 'app-picks-pending-banner',
  imports: [RouterLink],
  template: `
    @if (visible()) {
      <aside class="pending-banner" role="status">
        <p class="pending-banner__copy">
          Tienes <strong>{{ count() }}</strong> partido{{ count() === 1 ? '' : 's' }} sin pick que cierra{{ count() === 1 ? '' : 'n' }} en las próximas 12h.
        </p>
        <a class="btn btn--primary btn--sm" routerLink="/picks">Hacer mis picks</a>
        <button class="pending-banner__close" (click)="dismiss()" aria-label="cerrar">×</button>
      </aside>
    }
  `,
})
export class PicksPendingBannerComponent implements OnInit {
  private api = inject(ApiService);
  private auth = inject(AuthService);

  count = signal(0);
  dismissedToday = signal(false);
  visible = () => this.count() > 0 && !this.dismissedToday();

  async ngOnInit() {
    if (!this.auth.user()) return;

    const today = new Date().toISOString().slice(0, 10);
    if (localStorage.getItem(STORAGE_KEY) === today) {
      this.dismissedToday.set(true);
      return;
    }
    try {
      const res = await this.api.pendingMatches(TOURNAMENT_ID, 12);
      this.count.set((res.data ?? []).length);
    } catch {
      // silently — banner just stays hidden
    }
  }

  dismiss() {
    localStorage.setItem(STORAGE_KEY, new Date().toISOString().slice(0, 10));
    this.dismissedToday.set(true);
  }
}
