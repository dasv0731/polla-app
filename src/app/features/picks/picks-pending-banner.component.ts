import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api/api.service';
import { AuthService } from '../../core/auth/auth.service';
import { IconComponent } from '../../shared/ui/icon/icon.component';
import { SkeletonComponent } from '../../shared/ui/skeleton/skeleton.component';

const STORAGE_KEY = 'picks-banner-dismissed-on';
const TOURNAMENT_ID = 'mundial-2026';
const BROADCAST_CHANNEL = 'picks-pending-banner';

/**
 * Banner pendiente de picks. Aparece cuando user tiene matches sin pick
 * que cierran en las próximas 12h.
 *
 * A8d polish:
 * - `<app-icon>` para close button (vs `×` unicode)
 * - `visible` is computed signal (consistencia pattern Angular signals)
 * - CTA contextual: count===1 → link directo al match. count>1 → /picks.
 * - Timezone-aware dismiss usando Intl.DateTimeFormat con TZ America/Guayaquil
 *   (vs `toISOString().slice(0,10)` que es UTC y rompe en zonas negativas).
 * - Cross-tab sync vía BroadcastChannel: dismiss en una pestaña se replica.
 * - Skeleton durante fetch inicial.
 * - aria-label "Cerrar" capitalizado.
 */
@Component({
  standalone: true,
  selector: 'app-picks-pending-banner',
  imports: [RouterLink, IconComponent, SkeletonComponent],
  template: `
    @if (loading()) {
      <aside class="app-pending-banner app-pending-banner--loading" role="status" aria-busy="true">
        <app-skeleton variant="list" />
      </aside>
    } @else if (visible()) {
      <aside class="app-pending-banner" role="status">
        <span class="app-pending-banner__icon">{{ count() }}</span>
        <div class="app-pending-banner__body">
          <p class="app-pending-banner__title">Picks pendientes</p>
          <p class="app-pending-banner__lead">
            Tienes {{ count() }} partido{{ count() === 1 ? '' : 's' }} sin pick que cierra{{ count() === 1 ? '' : 'n' }} en las próximas 12h.
          </p>
        </div>
        <div class="app-pending-banner__actions">
          @if (count() === 1 && singleMatchId()) {
            <a class="btn btn--primary btn--sm" [routerLink]="['/picks/match', singleMatchId()]">Hacer mi pick</a>
          } @else {
            <a class="btn btn--primary btn--sm" routerLink="/picks">Hacer mis picks</a>
          }
        </div>
        <button
          type="button"
          class="app-pending-banner__close"
          (click)="dismiss()"
          aria-label="Cerrar">
          <app-icon name="close" size="sm" />
        </button>
      </aside>
    }
  `,
})
export class PicksPendingBannerComponent implements OnInit, OnDestroy {
  private api = inject(ApiService);
  private auth = inject(AuthService);

  count = signal(0);
  singleMatchId = signal<string | null>(null);
  dismissedToday = signal(false);
  loading = signal(false);

  /** Computed signal — consistent con otros components A8d. */
  visible = computed(() => this.count() > 0 && !this.dismissedToday());

  private channel: BroadcastChannel | null = null;

  /**
   * Local date key in America/Guayaquil (UTC-5). UTC-based slice rompe a
   * primeras horas de la madrugada local (banner reaparecía mismo día).
   */
  private todayLocal(): string {
    try {
      const parts = new Intl.DateTimeFormat('es-EC', {
        timeZone: 'America/Guayaquil',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).formatToParts(new Date());
      const y = parts.find((p) => p.type === 'year')?.value ?? '0000';
      const m = parts.find((p) => p.type === 'month')?.value ?? '00';
      const d = parts.find((p) => p.type === 'day')?.value ?? '00';
      return `${y}-${m}-${d}`;
    } catch {
      return new Date().toISOString().slice(0, 10);
    }
  }

  async ngOnInit() {
    if (!this.auth.user()) return;

    const today = this.todayLocal();
    if (localStorage.getItem(STORAGE_KEY) === today) {
      this.dismissedToday.set(true);
      return;
    }

    // Cross-tab sync — dismiss en una pestaña se aplica a las demás.
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        this.channel = new BroadcastChannel(BROADCAST_CHANNEL);
        this.channel.onmessage = (ev) => {
          if (ev.data?.type === 'dismiss' && ev.data?.date === today) {
            this.dismissedToday.set(true);
          }
        };
      } catch {
        // BroadcastChannel no soportado — sigue funcionando sin cross-tab.
      }
    }

    this.loading.set(true);
    try {
      const res = await this.api.pendingMatches(TOURNAMENT_ID, 12);
      const matches = (res.data ?? []) as Array<{ id: string }>;
      this.count.set(matches.length);
      this.singleMatchId.set(matches.length === 1 ? matches[0].id : null);
    } catch {
      // silently — banner just stays hidden
    } finally {
      this.loading.set(false);
    }
  }

  ngOnDestroy() {
    this.channel?.close();
    this.channel = null;
  }

  dismiss() {
    const today = this.todayLocal();
    localStorage.setItem(STORAGE_KEY, today);
    this.dismissedToday.set(true);
    // Notify other tabs.
    try {
      this.channel?.postMessage({ type: 'dismiss', date: today });
    } catch {
      // ignore
    }
  }
}
