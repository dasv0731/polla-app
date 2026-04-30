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
  // Si el code otorgó un comodín, su tipo + descripción breve.
  comodinType: string | null;
  comodinName: string | null;
  comodinImpact: string | null;
}

const ERROR_LABELS: Record<string, string> = {
  SPONSOR_CODE_NOT_FOUND: 'Ese código no existe.',
  SPONSOR_CODE_NOT_ACTIVE: 'Este código todavía no está activo.',
  SPONSOR_CODE_EXPIRED: 'Este código ya expiró.',
  SPONSOR_CODE_LIMIT_REACHED: 'Este código ya alcanzó el límite de canjes.',
  SPONSOR_CODE_ALREADY_USED: 'Ya canjeaste este código antes.',
  COMODINES_REQUIRES_COMPLETE_MODE:
    'Los comodines solo aplican a Modo Completo. Únete a un grupo en modo completo.',
  COMODIN_CAP_REACHED:
    'Ya tienes 5 comodines (el techo). Usa o deja caducar uno antes de canjear más.',
  COMODIN_SPONSOR_LIMIT_REACHED:
    'Ya canjeaste 2 códigos de sponsor (el máximo por esa vía).',
};

const COMODIN_NAMES: Record<string, string> = {
  MULTIPLIER_X2: 'Multiplicador x2',
  PHASE_BOOST: 'Boost de fase',
  GROUP_SAFE_PICK: 'Pick seguro de grupos',
  BRACKET_SAFE_PICK: 'Pick seguro de llaves',
  REASSIGN_CHAMP_RUNNER: 'Reasignación campeón/subcampeón',
  LATE_EDIT: 'Edición tardía',
  BRACKET_RESET: 'Reseteo de fase eliminatoria',
  GROUP_RESET: 'Reseteo de grupo',
  ANTI_PENALTY: 'Anti-penalización',
};

const COMODIN_IMPACT: Record<string, string> = {
  MULTIPLIER_X2: 'Duplica los puntos en 1 partido (grupos / R32 / R16).',
  PHASE_BOOST: 'x1.5 a marcadores de toda una fase (octavos o cuartos).',
  GROUP_SAFE_PICK: '50% si fallás 1 posición de un grupo (en vez de 0).',
  BRACKET_SAFE_PICK: '50% si tu equipo no llega a la fase predicha.',
  REASSIGN_CHAMP_RUNNER: 'Cambiás campeón/subcampeón post-grupos. Paga 50%.',
  LATE_EDIT: 'Editar marcador hasta 15 min post-kickoff. Paga 50%.',
  BRACKET_RESET: 'Reescribís todos los picks de una fase. Paga 60%.',
  GROUP_RESET: 'Reordenás un grupo post-J1. Paga 50%.',
  ANTI_PENALTY: 'Anula el descuento del Pick seguro de llaves: paga 100%.',
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
              <div style="flex: 1;">
                <strong>{{ r.codeText }}</strong>
                @if (r.comodinName) {
                  <small style="display: block; color: var(--color-primary-green); font-weight: var(--fw-semibold); margin-top: 2px;">
                    🃏 {{ r.comodinName }}
                  </small>
                  @if (r.comodinImpact) {
                    <small style="display: block; color: var(--color-text-muted); line-height: 1.3; margin-top: 2px;">
                      {{ r.comodinImpact }}
                    </small>
                  }
                } @else if (r.pointsAwarded > 0) {
                  <small style="display: block; color: var(--color-primary-green); font-weight: var(--fw-semibold);">
                    +{{ r.pointsAwarded }} pts
                  </small>
                }
                <small style="display: block; color: var(--color-text-muted); margin-top: 2px;">
                  {{ r.sponsorName }} · {{ formatDate(r.redeemedAt) }}
                </small>
              </div>
            </li>
          }
        </ul>
      } @else if (!loadingHistory()) {
        <p class="form-card__hint" style="margin-top: var(--space-md);">
          Aún no has canjeado ningún código.
        </p>
      }
    </section>
  `,
  styles: [`
    .sr {
      background: linear-gradient(135deg, #fff8d6, #fff3a0);
      border: 1px solid rgba(212, 165, 0, 0.4);
      border-radius: 12px;
      padding: var(--space-lg);
    }
    .sr__head { margin-bottom: var(--space-md); }
    .sr__kicker {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: #7a5d00;
      font-weight: 700;
    }
    .sr h2 {
      font-family: 'Bebas Neue', var(--font-display, sans-serif);
      font-size: 24px;
      letter-spacing: 0.04em;
      line-height: 1.05;
      margin-top: 4px;
      color: #3a2c00;
    }
    .sr__lead {
      color: #7a5d00;
      margin-top: var(--space-xs);
      font-size: 13px;
      line-height: 1.5;
    }
    .sr__form {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: var(--space-sm);
      margin-bottom: var(--space-md);
    }
    .sr__input {
      padding: 10px 12px;
      border: 1.5px solid var(--wf-line);
      border-radius: 8px;
      font: inherit;
      font-size: 13px;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      font-weight: 600;
      background: var(--wf-paper);
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
      // Resolver code text + sponsor name + tipo de comodín otorgado.
      // Cacheamos lookups por id para evitar pegarle al backend N veces.
      const sponsorCache = new Map<string, string>();
      const codeCache = new Map<string, { text: string; comodinType: string | null }>();
      const rows: RedemptionRow[] = await Promise.all(
        raw.map(async (r): Promise<RedemptionRow> => {
          const [sponsorName, codeMeta] = await Promise.all([
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
                const meta = {
                  text: c.data?.code ?? '—',
                  comodinType: (c.data?.comodinType as string | null | undefined) ?? null,
                };
                codeCache.set(r.codeId, meta);
                return meta;
              } catch { return { text: '—', comodinType: null }; }
            })(),
          ]);
          const ctype = codeMeta.comodinType;
          return {
            id: r.id, redeemedAt: r.redeemedAt, pointsAwarded: r.pointsAwarded,
            sponsorName, codeText: codeMeta.text,
            comodinType: ctype,
            comodinName: ctype ? (COMODIN_NAMES[ctype] ?? ctype) : null,
            comodinImpact: ctype ? (COMODIN_IMPACT[ctype] ?? null) : null,
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
        // Tres flavors de éxito según el response:
        //   1. Comodín nuevo otorgado    → comodinType set, alreadyOwned=false
        //   2. Code consumido sin comodín (ya tenía el tipo) → alreadyOwned=true
        //   3. Legacy points              → comodinType=null, points>0
        let msg = data.message ?? '';
        let toastMsg = 'Código canjeado';
        if (data.comodinType && !data.alreadyOwned) {
          const niceName = COMODIN_NAMES[data.comodinType] ?? data.comodinType;
          msg = `¡Ganaste un comodín tipo "${niceName}"! Está en tu cartera, listo para asignar.`;
          toastMsg = `Comodín ${niceName} acreditado`;
        } else if (data.alreadyOwned) {
          // El sponsor canjeó pero el tipo ya lo tenía — dejamos el msg
          // del backend que ya lo explica claramente.
          toastMsg = 'Código canjeado (sin comodín extra)';
        } else if (data.points > 0) {
          msg = msg || `+${data.points} puntos sumados`;
          toastMsg = `+${data.points} puntos`;
        }
        this.lastResult.set({ ok: true, message: msg });
        this.toast.success(toastMsg);
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
