import { Component, computed, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { QuickPickModalService } from '../../core/picks/quick-pick-modal.service';
import { PicksSyncService } from '../../core/sync/picks-sync.service';
import { ToastService } from '../../core/notifications/toast.service';
import { ModalComponent } from '../ui/modal/modal.component';
import { IconComponent } from '../ui/icon/icon.component';

interface PickPayload extends Record<string, unknown> {
  home: number;
  away: number;
  homeTouched: boolean;
  awayTouched: boolean;
}

/**
 * Modal de "pick rápido" montado en el shell. Permite ingresar el marcador
 * de un partido sin navegar a la página de detalle (lo abre el rail derecho).
 * Guarda por el mismo camino que picks-list: PicksSyncService.enqueue('pick'…),
 * local-first + sync en background.
 */
@Component({
  standalone: true,
  selector: 'app-quick-pick-modal',
  imports: [ModalComponent, IconComponent, RouterLink],
  template: `
    @if (svc.target(); as t) {
      <app-modal
        [open]="true"
        title="Tu pick"
        description="Predice el marcador"
        size="sm"
        (close)="svc.close()">
        <div slot="body">
          <div class="qp">
            <div class="qp__team">
              <div class="qp__fl">
                @if (t.homeFlag) {
                  <span class="fi fi-{{ t.homeFlag.toLowerCase() }}"></span>
                } @else {
                  <span class="qp__ini">{{ t.homeInitials }}</span>
                }
              </div>
              <div class="qp__nm">{{ t.homeName }}</div>
            </div>

            <div class="qp__scores">
              <input type="text" inputmode="numeric" maxlength="2"
                     class="qp__input"
                     autocomplete="off" spellcheck="false"
                     [value]="home() ?? ''"
                     placeholder="0"
                     [attr.aria-label]="'Goles ' + t.homeName"
                     (input)="onInput('home', $event)">
              <span class="qp__dash">—</span>
              <input type="text" inputmode="numeric" maxlength="2"
                     class="qp__input"
                     autocomplete="off" spellcheck="false"
                     [value]="away() ?? ''"
                     placeholder="0"
                     [attr.aria-label]="'Goles ' + t.awayName"
                     (input)="onInput('away', $event)">
            </div>

            <div class="qp__team">
              <div class="qp__fl">
                @if (t.awayFlag) {
                  <span class="fi fi-{{ t.awayFlag.toLowerCase() }}"></span>
                } @else {
                  <span class="qp__ini">{{ t.awayInitials }}</span>
                }
              </div>
              <div class="qp__nm">{{ t.awayName }}</div>
            </div>
          </div>

          <a class="qp__more" [routerLink]="['/picks/match', t.matchId]" (click)="svc.close()">
            Ver previa completa
            <app-icon name="arrow-right" size="sm" />
          </a>
        </div>
        <div slot="footer">
          <button type="button" class="btn-wf" (click)="svc.close()">Cancelar</button>
          <button type="button" class="btn-wf btn-wf--primary" (click)="save()">
            {{ hasExistingPick() ? 'Actualizar pick' : 'Guardar pick' }}
          </button>
        </div>
      </app-modal>
    }
  `,
  styles: [`
    :host { display: contents; }
    .qp {
      display: grid;
      grid-template-columns: 1fr auto 1fr;
      gap: 12px;
      align-items: start;
      padding: 6px 0 4px;
    }
    .qp__team { display: flex; flex-direction: column; align-items: center; gap: 8px; text-align: center; }
    .qp__fl {
      width: 52px; height: 52px;
      border-radius: 50%;
      overflow: hidden;
      display: grid; place-items: center;
      background: var(--wf-fill, rgba(0,0,0,0.06));
      border: 2px solid var(--wf-line, var(--color-line));
    }
    .qp__fl .fi { width: 100%; height: 100%; background-size: cover; background-position: center; }
    .qp__ini { font-family: var(--font-display); font-size: 16px; letter-spacing: 0.04em; text-transform: uppercase; color: var(--color-text-muted); }
    .qp__nm { font-family: var(--font-display); font-size: 14px; line-height: 1.1; }
    .qp__scores { display: flex; align-items: center; gap: 8px; padding-top: 8px; }
    .qp__input {
      width: 48px; height: 56px;
      text-align: center;
      font-family: var(--font-display);
      font-size: 28px;
      border: 1px solid var(--wf-line, var(--color-line));
      border-radius: 10px;
      background: var(--color-primary-white, #fff);
    }
    .qp__input:focus-visible { outline: 2px solid var(--color-primary-green); outline-offset: 1px; }
    .qp__dash { font-size: 20px; color: var(--color-text-muted); }
    .qp__more {
      display: inline-flex; align-items: center; gap: 5px;
      margin-top: 16px;
      font-size: 12px; font-weight: 600;
      color: var(--color-primary-green);
      text-decoration: none;
    }
    .qp__more:hover { text-decoration: underline; }
  `],
})
export class QuickPickModalComponent {
  svc = inject(QuickPickModalService);
  private sync = inject(PicksSyncService);
  private toast = inject(ToastService);

  home = signal<number | null>(null);
  away = signal<number | null>(null);
  hasExistingPick = signal(false);

  constructor() {
    // Prefill al abrir: pending del sync (lo más reciente) o el pick que
    // venga en el target.
    effect(() => {
      const t = this.svc.target();
      if (!t) return;
      const pending = this.sync.getPending<PickPayload>('pick', t.matchId);
      if (pending) {
        this.home.set(pending.homeTouched ? pending.home : null);
        this.away.set(pending.awayTouched ? pending.away : null);
        this.hasExistingPick.set(true);
      } else if (t.pick) {
        this.home.set(t.pick.home);
        this.away.set(t.pick.away);
        this.hasExistingPick.set(true);
      } else {
        this.home.set(null);
        this.away.set(null);
        this.hasExistingPick.set(false);
      }
    });
  }

  onInput(side: 'home' | 'away', event: Event) {
    const input = event.target as HTMLInputElement;
    const raw = input.value.replace(/[^0-9]/g, '').slice(-2);
    if (raw !== input.value) input.value = raw;
    const v = raw === '' ? null : Math.max(0, Math.min(99, parseInt(raw, 10)));
    if (side === 'home') this.home.set(v);
    else this.away.set(v);
  }

  save() {
    const t = this.svc.target();
    if (!t) return;
    const home = this.home() ?? 0;
    const away = this.away() ?? 0;
    this.sync.enqueue('pick', t.matchId, {
      home, away, homeTouched: true, awayTouched: true,
    });
    this.toast.success('Pick guardado');
    this.svc.close();
  }
}
