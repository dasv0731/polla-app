import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/api/api.service';
import { ToastService } from '../../core/notifications/toast.service';
import { humanizeError } from '../../core/notifications/domain-errors';

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
  `],
})
export class SponsorRedeemComponent {
  private api = inject(ApiService);
  private toast = inject(ToastService);

  code = '';
  busy = signal(false);
  lastResult = signal<{ ok: boolean; message: string } | null>(null);

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
