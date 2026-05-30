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
  styles: [`
    :host { display: block; margin-bottom: 14px; }

    /* Dark editorial banner — matches the design's .card--dark + the
       Home .pp picks-pending block so the visual is unified whether
       the banner appears on /home or /picks. */
    .app-pending-banner {
      position: relative;
      overflow: hidden;
      background: #0a0a0a;
      color: #fff;
      border-radius: 14px;
      padding: 18px 20px;
      display: grid;
      grid-template-columns: auto 1fr auto auto;
      gap: 16px;
      align-items: center;
    }
    .app-pending-banner::before {
      content: "";
      position: absolute;
      top: -50%;
      right: -20%;
      width: 240px;
      height: 240px;
      background: radial-gradient(circle, rgba(2,204,116,0.18), transparent 70%);
      pointer-events: none;
    }
    .app-pending-banner--loading {
      grid-template-columns: 1fr;
      padding: 14px 18px;
    }

    .app-pending-banner__icon {
      position: relative;
      font-family: var(--font-display);
      font-size: 44px;
      line-height: 1;
      color: var(--color-primary-green);
      font-variant-numeric: tabular-nums;
    }
    .app-pending-banner__body { position: relative; min-width: 0; }
    .app-pending-banner__title {
      font-family: var(--font-display);
      font-size: 18px;
      letter-spacing: .01em;
      line-height: 1;
      margin: 0 0 4px;
    }
    .app-pending-banner__lead {
      font-size: 12px;
      color: rgba(255, 255, 255, 0.7);
      margin: 0;
      line-height: 1.4;
    }
    .app-pending-banner__actions {
      position: relative;
      display: flex;
      gap: 8px;
    }
    .app-pending-banner__actions .btn {
      white-space: nowrap;
    }
    .app-pending-banner__close {
      position: relative;
      width: 32px;
      height: 32px;
      border-radius: 50%;
      border: 0;
      background: rgba(255, 255, 255, 0.08);
      color: rgba(255, 255, 255, 0.85);
      cursor: pointer;
      display: grid;
      place-items: center;
      transition: background-color .15s ease;
    }
    .app-pending-banner__close:hover {
      background: rgba(255, 255, 255, 0.16);
    }
    .app-pending-banner__close:focus-visible {
      outline: 2px solid var(--color-primary-green);
      outline-offset: 2px;
    }

    /* Mobile: stack actions + close below the body, scale the count
       down a bit so the layout doesn't overflow. */
    @media (max-width: 640px) {
      .app-pending-banner {
        grid-template-columns: auto 1fr auto;
        gap: 12px;
        padding: 14px 16px;
      }
      .app-pending-banner__icon { font-size: 36px; }
      .app-pending-banner__title { font-size: 16px; }
      .app-pending-banner__actions {
        grid-column: 1 / -1;
        grid-row: 2;
        justify-self: stretch;
      }
      .app-pending-banner__actions .btn { flex: 1; text-align: center; }
    }
  `],
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
