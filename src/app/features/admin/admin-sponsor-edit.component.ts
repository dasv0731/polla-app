import { Component, Input, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../../core/api/api.service';
import { ToastService } from '../../core/notifications/toast.service';
import { humanizeError } from '../../core/notifications/domain-errors';

const TOURNAMENT_ID = 'mundial-2026';

interface CodeRow {
  id: string | null;        // null si es nuevo (no commiteado a DB)
  code: string;
  startLocal: string;       // datetime-local string
  endLocal: string;
  maxUses: number;
  pointsValue: number;
  currentUses: number;      // read-only
  // marca de cambio para minimizar updates
  dirty: boolean;
  deleted: boolean;
}

@Component({
  standalone: true,
  selector: 'app-admin-sponsor-edit',
  imports: [FormsModule, RouterLink],
  template: `
    <header class="page-header" style="padding: 0 0 var(--space-md);">
      <small><a routerLink="/admin/sponsors" style="color: var(--color-primary-green);">← Sponsors</a></small>
      <h1 style="font-family: var(--font-display); font-size: 56px; line-height: 1; text-transform: uppercase;">
        {{ isNew() ? 'Nuevo sponsor' : 'Editar sponsor' }}
      </h1>
    </header>

    @if (loading()) {
      <p>Cargando…</p>
    } @else {
      <form class="form-card" (ngSubmit)="saveAll()" style="max-width: 100%;">
        <h2 class="form-card__title">Marca</h2>

        <div class="form-card__field">
          <label class="form-card__label" for="name">Nombre del sponsor</label>
          <input class="form-card__input" id="name" name="name" type="text"
                 [(ngModel)]="name" required maxlength="80"
                 placeholder="Pepsi · Nike · Movistar">
        </div>

        <!-- Banners (S3 keys) -->
        <div class="form-card__field">
          <label class="form-card__label">Banners</label>
          @if (bannerKeys().length === 0) {
            <p class="form-card__hint">Sin banners cargados.</p>
          } @else {
            <ul style="list-style: none; padding: 0; margin: 0; display: grid; gap: 6px;">
              @for (k of bannerKeys(); track k; let i = $index) {
                <li style="display: grid; grid-template-columns: 1fr auto; gap: 8px; padding: 8px 12px; background: var(--color-primary-grey, #f4f4f4); border-radius: var(--radius-sm); align-items: center;">
                  <code style="font-size: var(--fs-sm);">{{ k }}</code>
                  <a class="link-green" style="color: var(--color-lost); cursor: pointer;" (click)="removeBanner(i, $event)">×</a>
                </li>
              }
            </ul>
          }
          <div style="display: flex; gap: var(--space-sm); margin-top: var(--space-sm);">
            <input class="form-card__input" type="text" #newBanner
                   placeholder="path/al/banner.png (S3 key)"
                   style="flex: 1;">
            <button class="btn btn--ghost btn--sm" type="button"
                    (click)="addBanner(newBanner.value); newBanner.value=''">+ Agregar banner</button>
          </div>
          <span class="form-card__hint" style="margin-top: 4px;">
            Por ahora se guarda el path/key del banner. Upload via Amplify Storage viene en una iteración siguiente — mientras, podes apuntar a un asset de la app o de un CDN externo.
          </span>
        </div>

        <hr style="margin: var(--space-lg) 0;">

        <h2 class="form-card__title">Códigos de canje</h2>
        <p class="form-card__lead">
          Cada código suma <code>pointsValue</code> puntos al ranking del usuario que lo canjee
          (UserTournamentTotal + cada UserGroupTotal del user). Una vez canjeado, el mismo user no
          puede volver a usarlo. Cuando se alcanza el límite de usos, ningún user más puede canjearlo.
        </p>

        @for (c of activeCodes(); track c; let i = $index) {
          <article style="background: var(--color-primary-grey, #f4f4f4); padding: var(--space-md); border-radius: var(--radius-sm); margin-bottom: var(--space-sm);">
            <header style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: var(--space-sm);">
              <strong>Código #{{ i + 1 }}</strong>
              <a class="link-green" style="color: var(--color-lost); cursor: pointer;" (click)="markDelete(c, $event)">Borrar</a>
            </header>
            <div style="display: grid; grid-template-columns: 1fr 100px 100px; gap: var(--space-sm); align-items: end;">
              <div class="form-card__field" style="margin: 0;">
                <label class="form-card__label">Code (alfanumérico)</label>
                <input class="form-card__input" type="text" [(ngModel)]="c.code"
                       [name]="'code-' + i" required maxlength="40"
                       (input)="c.dirty = true; c.code = c.code.toUpperCase()"
                       placeholder="PEPSI100">
              </div>
              <div class="form-card__field" style="margin: 0;">
                <label class="form-card__label">Max usos</label>
                <input class="form-card__input" type="number" min="1" max="100000"
                       [(ngModel)]="c.maxUses" [name]="'max-' + i" required
                       (input)="c.dirty = true">
              </div>
              <div class="form-card__field" style="margin: 0;">
                <label class="form-card__label">Pts</label>
                <input class="form-card__input" type="number" min="0" max="500"
                       [(ngModel)]="c.pointsValue" [name]="'pts-' + i" required
                       (input)="c.dirty = true">
              </div>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-sm); margin-top: var(--space-sm);">
              <div class="form-card__field" style="margin: 0;">
                <label class="form-card__label">Inicio (Quito)</label>
                <input class="form-card__input" type="datetime-local" [(ngModel)]="c.startLocal"
                       [name]="'start-' + i" required
                       (input)="c.dirty = true">
              </div>
              <div class="form-card__field" style="margin: 0;">
                <label class="form-card__label">Expira (Quito)</label>
                <input class="form-card__input" type="datetime-local" [(ngModel)]="c.endLocal"
                       [name]="'end-' + i" required
                       (input)="c.dirty = true">
              </div>
            </div>
            @if (c.id) {
              <p class="form-card__hint" style="margin-top: var(--space-sm);">
                Usados: <strong>{{ c.currentUses }} / {{ c.maxUses }}</strong>
              </p>
            }
          </article>
        }

        <button class="btn btn--ghost" type="button" (click)="addCode()">+ Agregar código</button>

        <hr style="margin: var(--space-lg) 0;">

        @if (error()) {
          <p class="form-card__hint" style="color: var(--color-lost);">{{ error() }}</p>
        }

        <button class="btn btn--primary" type="submit" [disabled]="saving()" style="margin-top: var(--space-md);">
          {{ saving() ? 'Guardando…' : 'Guardar todo' }}
        </button>
      </form>
    }
  `,
})
export class AdminSponsorEditComponent implements OnInit {
  @Input() id?: string;

  private api = inject(ApiService);
  private toast = inject(ToastService);
  private router = inject(Router);

  loading = signal(true);
  saving = signal(false);
  error = signal<string | null>(null);

  name = '';
  bannerKeys = signal<string[]>([]);
  codes = signal<CodeRow[]>([]);

  activeCodes = computed(() => this.codes().filter((c) => !c.deleted));

  isNew = computed(() => !this.id);

  async ngOnInit() {
    if (!this.id) {
      this.loading.set(false);
      return;
    }
    try {
      const [sRes, cRes] = await Promise.all([
        this.api.getSponsor(this.id),
        this.api.listSponsorCodes(this.id),
      ]);
      if (sRes.data) {
        this.name = sRes.data.name;
        this.bannerKeys.set(((sRes.data.bannerKeys ?? []) as (string | null)[]).filter((k): k is string => !!k));
      }
      const codes: CodeRow[] = ((cRes.data ?? []) as Array<{
        id: string; code: string; startDate: string; endDate: string;
        maxUses: number; pointsValue: number; currentUses?: number;
      }>).map((c) => ({
        id: c.id,
        code: c.code,
        startLocal: isoToLocal(c.startDate),
        endLocal: isoToLocal(c.endDate),
        maxUses: c.maxUses,
        pointsValue: c.pointsValue,
        currentUses: c.currentUses ?? 0,
        dirty: false,
        deleted: false,
      }));
      codes.sort((a, b) => a.code.localeCompare(b.code));
      this.codes.set(codes);
    } finally {
      this.loading.set(false);
    }
  }

  addBanner(k: string) {
    const v = (k ?? '').trim();
    if (!v) return;
    if (this.bannerKeys().includes(v)) return;
    this.bannerKeys.update((arr) => [...arr, v]);
  }
  removeBanner(idx: number, ev: Event) {
    ev.preventDefault();
    this.bannerKeys.update((arr) => arr.filter((_, i) => i !== idx));
  }

  addCode() {
    // Default start = now, end = +30 days, maxUses = 100, pts = 10
    const now = new Date();
    const end = new Date(now.getTime() + 30 * 86_400_000);
    this.codes.update((arr) => [...arr, {
      id: null,
      code: '',
      startLocal: dateToLocalInput(now),
      endLocal: dateToLocalInput(end),
      maxUses: 100,
      pointsValue: 10,
      currentUses: 0,
      dirty: true,
      deleted: false,
    }]);
  }
  markDelete(c: CodeRow, ev: Event) {
    ev.preventDefault();
    if (!c.id) {
      // todavía no committeado — quitar del array sin más
      this.codes.update((arr) => arr.filter((x) => x !== c));
      return;
    }
    if (!confirm(`¿Borrar el código "${c.code}"? El audit trail de canjes anteriores se mantiene.`)) return;
    this.codes.update((arr) => arr.map((x) => (x === c ? { ...x, deleted: true } : x)));
  }

  async saveAll() {
    if (!this.name.trim()) {
      this.error.set('Falta el nombre del sponsor');
      return;
    }
    this.error.set(null);
    this.saving.set(true);
    try {
      // 1) Sponsor: create o update
      let sponsorId = this.id;
      if (!sponsorId) {
        const res = await this.api.createSponsor({
          name: this.name.trim(),
          bannerKeys: this.bannerKeys(),
        });
        if (res?.errors && res.errors.length > 0) {
          this.error.set(res.errors[0]!.message ?? 'No se pudo crear');
          return;
        }
        sponsorId = res?.data?.id;
        if (!sponsorId) {
          this.error.set('Sponsor creado sin id devuelto');
          return;
        }
      } else {
        const res = await this.api.updateSponsor({
          id: sponsorId,
          name: this.name.trim(),
          bannerKeys: this.bannerKeys(),
        });
        if (res?.errors && res.errors.length > 0) {
          this.error.set(res.errors[0]!.message ?? 'No se pudo actualizar');
          return;
        }
      }

      // 2) Codes: create / update / delete según marcas
      for (const c of this.codes()) {
        if (c.deleted && c.id) {
          await this.api.deleteSponsorCode(c.id);
          continue;
        }
        if (c.deleted) continue;        // todavía no en DB, ya filtrado
        if (!c.code.trim()) continue;   // skip vacíos
        if (!c.id) {
          const res = await this.api.createSponsorCode({
            sponsorId,
            tournamentId: TOURNAMENT_ID,
            code: c.code.trim().toUpperCase(),
            startDate: localInputToIso(c.startLocal),
            endDate: localInputToIso(c.endLocal),
            maxUses: c.maxUses,
            pointsValue: c.pointsValue,
          });
          if (res?.errors && res.errors.length > 0) {
            this.error.set(res.errors[0]!.message ?? 'No se pudo crear código');
            return;
          }
        } else if (c.dirty) {
          const res = await this.api.updateSponsorCode({
            id: c.id,
            code: c.code.trim().toUpperCase(),
            startDate: localInputToIso(c.startLocal),
            endDate: localInputToIso(c.endLocal),
            maxUses: c.maxUses,
            pointsValue: c.pointsValue,
          });
          if (res?.errors && res.errors.length > 0) {
            this.error.set(res.errors[0]!.message ?? 'No se pudo actualizar código');
            return;
          }
        }
      }

      this.toast.success('Sponsor guardado');
      void this.router.navigate(['/admin/sponsors']);
    } catch (e) {
      this.error.set(humanizeError(e));
    } finally {
      this.saving.set(false);
    }
  }
}

function isoToLocal(iso: string): string {
  return dateToLocalInput(new Date(iso));
}
function dateToLocalInput(d: Date): string {
  const local = new Date(d.getTime() - 5 * 3600_000);     // Quito UTC-5
  const yyyy = local.getUTCFullYear();
  const mm = String(local.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(local.getUTCDate()).padStart(2, '0');
  const hh = String(local.getUTCHours()).padStart(2, '0');
  const mi = String(local.getUTCMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}
function localInputToIso(local: string): string {
  const [date, time] = local.split('T');
  const [y, m, d] = (date ?? '').split('-').map(Number);
  const [hh, mm] = (time ?? '').split(':').map(Number);
  const utc = new Date(Date.UTC(y!, m! - 1, d!, hh! + 5, mm!));
  return utc.toISOString();
}
