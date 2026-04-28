import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/api/api.service';
import { AuthService } from '../../core/auth/auth.service';
import { ToastService } from '../../core/notifications/toast.service';
import { humanizeError } from '../../core/notifications/domain-errors';

interface RedemptionRow {
  id: string;
  redeemedAt: string;
  pointsAwarded: number;
  sponsorName: string;
  codeText: string;
}

const ERROR_LABELS: Record<string, string> = {
  SPONSOR_CODE_NOT_FOUND: 'Ese código no existe.',
  SPONSOR_CODE_NOT_ACTIVE: 'Este código todavía no está activo.',
  SPONSOR_CODE_EXPIRED: 'Este código ya expiró.',
  SPONSOR_CODE_LIMIT_REACHED: 'Este código ya alcanzó el límite de canjes.',
  SPONSOR_CODE_ALREADY_USED: 'Ya canjeaste este código antes.',
};

@Component({
  standalone: true,
  selector: 'app-sponsor-redeem',
  imports: [FormsModule],
  template: `
    <section class="sr">
      <header class="sr__head">
        <span class="sr__kicker">Sponsors</span>
        <h2>Canjear código</h2>
        <p class="sr__lead">
          Tienes un código de un sponsor? Ingrésalo para sumar puntos extra.
          Cada código se puede canjear una sola vez por usuario.
        </p>
      </header>

      <form (ngSubmit)="redeem(); $event.preventDefault()" class="sr__form">
        <input class="sr__input" type="text" name="code"
               [(ngModel)]="code" maxlength="40"
               placeholder="Ej. PEPSI100" autocomplete="off"
               [disabled]="busy()">
        <button class="btn btn--primary" type="submit"
                [disabled]="busy() || !code.trim()">
          {{ busy() ? 'Canjeando…' : 'Canjear' }}
        </button>
      </form>

      @if (lastResult()) {
        @let r = lastResult()!;
        <div class="sr__banner" [class.sr__banner--ok]="r.ok" [class.sr__banner--err]="!r.ok">
          <strong>{{ r.ok ? '✓' : '!' }}</strong>
          <span>{{ r.message }}</span>
        </div>
      }

      <!-- Lista de canjes previos -->
      @if (redemptions().length > 0) {
        <h3 class="sr__history-head">Tus canjes anteriores</h3>
        <ul class="sr__history">
          @for (r of redemptions(); track r.id) {
            <li class="sr__history-item">
              <div>
                <strong>{{ r.codeText }}</strong>
                <small style="display: block; color: var(--color-text-muted);">
                  {{ r.sponsorName }} · {{ formatDate(r.redeemedAt) }}
                </small>
              </div>
              <span class="sr__history-pts">+{{ r.pointsAwarded }} pts</span>
            </li>
          }
        </ul>
        <p class="form-card__hint" style="margin-top: var(--space-sm);">
          Total ganado: <strong style="color: var(--color-primary-green);">+{{ totalRedeemedPts() }} pts</strong> en {{ redemptions().length }} {{ redemptions().length === 1 ? 'canje' : 'canjes' }}.
        </p>
      } @else if (!loadingHistory()) {
        <p class="form-card__hint" style="margin-top: var(--space-md);">
          Aún no has canjeado ningún código.
        </p>
      }
    </section>
  `,
  styles: [`
    .sr {
      background: var(--color-primary-white);
      border: var(--border-grey);
      border-radius: var(--radius-md);
      padding: var(--space-lg);
    }
    .sr__head { margin-bottom: var(--space-md); }
    .sr__kicker {
      font-size: var(--fs-xs);
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--color-text-muted);
      font-weight: var(--fw-semibold);
    }
    .sr h2 {
      font-family: 'Bebas Neue', var(--font-display, sans-serif);
      font-size: var(--fs-2xl);
      text-transform: uppercase;
      line-height: 1;
      margin-top: 4px;
    }
    .sr__lead {
      color: var(--color-text-muted);
      margin-top: var(--space-xs);
      font-size: var(--fs-sm);
      line-height: 1.5;
    }
    .sr__form {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: var(--space-sm);
      margin-bottom: var(--space-md);
    }
    .sr__input {
      padding: 12px 14px;
      border: 2px solid rgba(0,0,0,0.1);
      border-radius: var(--radius-sm);
      font: inherit;
      font-size: var(--fs-md);
      letter-spacing: 0.04em;
      text-transform: uppercase;
      font-weight: var(--fw-semibold);
    }
    .sr__input:focus {
      outline: none;
      border-color: var(--color-primary-green);
    }
    .sr__banner {
      display: grid;
      grid-template-columns: 32px 1fr;
      align-items: center;
      gap: var(--space-sm);
      padding: var(--space-md);
      border-radius: var(--radius-sm);
      font-size: var(--fs-sm);
      line-height: 1.4;
    }
    .sr__banner strong {
      width: 28px;
      height: 28px;
      border-radius: 50%;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      color: var(--color-primary-white);
      font-weight: var(--fw-bold);
    }
    .sr__banner--ok {
      background: rgba(0, 200, 100, 0.14);
      color: var(--color-primary-green);
      border: 1px solid var(--color-primary-green);
    }
    .sr__banner--ok strong { background: var(--color-primary-green); }
    .sr__banner--err {
      background: rgba(220, 50, 50, 0.10);
      color: var(--color-lost, #c33);
      border: 1px solid var(--color-lost, #c33);
    }
    .sr__banner--err strong { background: var(--color-lost, #c33); }

    .sr__history-head {
      font-family: 'Bebas Neue', var(--font-display, sans-serif);
      font-size: var(--fs-md);
      text-transform: uppercase;
      letter-spacing: 0.06em;
      margin: var(--space-lg) 0 var(--space-sm);
      color: var(--color-text-muted);
    }
    .sr__history {
      list-style: none;
      padding: 0;
      margin: 0;
      display: grid;
      gap: var(--space-xs);
    }
    .sr__history-item {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: var(--space-sm);
      align-items: center;
      padding: var(--space-sm) var(--space-md);
      border-radius: var(--radius-sm);
      background: var(--color-primary-grey, #f4f4f4);
    }
    .sr__history-item strong {
      font-family: ui-monospace, SFMono-Regular, monospace;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }
    .sr__history-pts {
      font-family: 'Bebas Neue', var(--font-display, sans-serif);
      font-size: var(--fs-lg);
      color: var(--color-primary-green);
      letter-spacing: 0.04em;
    }
  `],
})
export class SponsorRedeemComponent implements OnInit {
  private api = inject(ApiService);
  private auth = inject(AuthService);
  private toast = inject(ToastService);

  code = '';
  busy = signal(false);
  lastResult = signal<{ ok: boolean; message: string } | null>(null);
  loadingHistory = signal(true);
  redemptions = signal<RedemptionRow[]>([]);

  totalRedeemedPts = computed(() =>
    this.redemptions().reduce((s, r) => s + r.pointsAwarded, 0),
  );

  async ngOnInit() {
    await this.loadHistory();
  }

  formatDate(iso: string): string {
    try {
      return new Date(iso).toLocaleString('es-EC', {
        timeZone: 'America/Guayaquil',
        day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
      });
    } catch { return iso; }
  }

  private async loadHistory() {
    const userId = this.auth.user()?.sub;
    if (!userId) {
      this.loadingHistory.set(false);
      return;
    }
    this.loadingHistory.set(true);
    try {
      const res = await this.api.myRedemptions(userId);
      const raw = ((res.data ?? []) as Array<{
        id: string; codeId: string; sponsorId: string;
        redeemedAt: string; pointsAwarded: number;
      }>);
      // Resolver code text + sponsor name. Cacheamos lookups por id para
      // evitar pegarle al backend N veces si hay duplicados.
      const sponsorCache = new Map<string, string>();
      const codeCache = new Map<string, string>();
      const rows: RedemptionRow[] = await Promise.all(
        raw.map(async (r): Promise<RedemptionRow> => {
          const [sponsorName, codeText] = await Promise.all([
            (async () => {
              if (sponsorCache.has(r.sponsorId)) return sponsorCache.get(r.sponsorId)!;
              try {
                const s = await this.api.getSponsor(r.sponsorId);
                const name = s.data?.name ?? 'Sponsor';
                sponsorCache.set(r.sponsorId, name);
                return name;
              } catch { return 'Sponsor'; }
            })(),
            (async () => {
              if (codeCache.has(r.codeId)) return codeCache.get(r.codeId)!;
              try {
                const c = await this.api.getSponsorCode(r.codeId);
                const text = c.data?.code ?? '—';
                codeCache.set(r.codeId, text);
                return text;
              } catch { return '—'; }
            })(),
          ]);
          return {
            id: r.id, redeemedAt: r.redeemedAt, pointsAwarded: r.pointsAwarded,
            sponsorName, codeText,
          };
        }),
      );
      rows.sort((a, b) => b.redeemedAt.localeCompare(a.redeemedAt));
      this.redemptions.set(rows);
    } finally {
      this.loadingHistory.set(false);
    }
  }

  async redeem() {
    const c = this.code.trim().toUpperCase();
    if (!c) return;
    this.busy.set(true);
    this.lastResult.set(null);
    try {
      const res = await this.api.redeemSponsorCode(c);
      if (res?.errors && res.errors.length > 0) {
        const err = res.errors[0]!;
        // eslint-disable-next-line no-console
        console.error('[redeemSponsorCode] errors:', res.errors);
        // El humanizeError mira ErrorCodeKey en el message
        const msg = err.message ?? '';
        const code = Object.keys(ERROR_LABELS).find((k) => msg.includes(k));
        const friendly = code ? ERROR_LABELS[code]! : (humanizeError(new Error(msg)) || msg);
        this.lastResult.set({ ok: false, message: friendly });
        return;
      }
      const data = res?.data;
      if (data?.ok) {
        this.lastResult.set({ ok: true, message: data.message ?? `+${data.points} puntos sumados` });
        this.toast.success('Código canjeado');
        this.code = '';
        // Refrescar lista de canjes para incluir el nuevo
        void this.loadHistory();
      } else {
        this.lastResult.set({ ok: false, message: 'No se pudo canjear el código' });
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[redeemSponsorCode] threw:', e);
      this.lastResult.set({ ok: false, message: humanizeError(e) });
    } finally {
      this.busy.set(false);
    }
  }
}
