import { Component, Input, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { uploadData, getUrl, remove } from 'aws-amplify/storage';
import { ApiService } from '../../core/api/api.service';
import { ToastService } from '../../core/notifications/toast.service';
import { humanizeError } from '../../core/notifications/domain-errors';

const TOURNAMENT_ID = 'mundial-2026';
const MAX_BANNER_BYTES = 2 * 1024 * 1024;     // 2 MB
const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml'];

type SlotKey = 'banner1' | 'banner2' | 'banner3';

interface SlotDef { key: SlotKey; label: string; hint: string; }

// Las dimensiones se definen cuando llegue el diseño — el hint es un
// placeholder neutral. Cambiar acá cuando se establezcan ratios.
const SLOTS: SlotDef[] = [
  { key: 'banner1', label: 'Slot 1', hint: 'Dimensiones por definir' },
  { key: 'banner2', label: 'Slot 2', hint: 'Dimensiones por definir' },
  { key: 'banner3', label: 'Slot 3', hint: 'Dimensiones por definir' },
];

type ComodinType =
  | 'MULTIPLIER_X2' | 'PHASE_BOOST' | 'GROUP_SAFE_PICK' | 'BRACKET_SAFE_PICK'
  | 'REASSIGN_CHAMP_RUNNER' | 'LATE_EDIT' | 'BRACKET_RESET' | 'GROUP_RESET'
  | 'ANTI_PENALTY';

const COMODIN_OPTIONS: Array<{ value: ComodinType; label: string }> = [
  { value: 'MULTIPLIER_X2',         label: 'Multiplicador x2' },
  { value: 'PHASE_BOOST',           label: 'Boost de fase' },
  { value: 'GROUP_SAFE_PICK',       label: 'Pick seguro de grupos' },
  { value: 'BRACKET_SAFE_PICK',     label: 'Pick seguro de llaves' },
  { value: 'REASSIGN_CHAMP_RUNNER', label: 'Reasignación campeón/subcampeón' },
  { value: 'LATE_EDIT',             label: 'Edición tardía' },
  { value: 'BRACKET_RESET',         label: 'Reseteo de fase eliminatoria' },
  { value: 'GROUP_RESET',           label: 'Reseteo de grupo' },
  { value: 'ANTI_PENALTY',          label: 'Anti-penalización' },
];

interface CodeRow {
  id: string | null;        // null si es nuevo (no commiteado a DB)
  code: string;
  startLocal: string;       // datetime-local string
  endLocal: string;
  maxUses: number;
  // Reward: si comodinType está set, el code otorga 1 comodín de ese tipo.
  // Si no, suma pointsValue (legacy). UI fuerza uno o el otro.
  pointsValue: number;
  comodinType: ComodinType | '';   // '' = vacío, usar pointsValue legacy
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

        <!-- Banners: 3 slots independientes. Cada slot acepta una sola
             imagen; las dimensiones por slot se definen cuando llegue
             el diseño. Se persisten en banner1/banner2/banner3. -->
        <div class="form-card__field">
          <label class="form-card__label">Banners (3 slots)</label>
          <span class="form-card__hint">
            Tres alternativas de banner para distintas superficies (cabecera,
            tile lateral, inline, etc — definimos dimensiones cuando esté
            el diseño). Imágenes hasta 2 MB · PNG / JPG / WebP / GIF / SVG.
          </span>

          <div class="banner-slot-grid">
            @for (slot of SLOTS; track slot.key) {
              @let key = slotKey(slot.key);
              <article class="banner-slot">
                <header class="banner-slot__head">
                  <strong>{{ slot.label }}</strong>
                  <small>{{ slot.hint }}</small>
                </header>
                <div class="banner-slot__preview">
                  @if (key) {
                    @let url = previewUrls().get(key);
                    @if (url) {
                      <img [src]="url" [alt]="slot.label" loading="lazy">
                    } @else {
                      <div class="banner-slot__placeholder">cargando…</div>
                    }
                  } @else {
                    <div class="banner-slot__placeholder">vacío</div>
                  }
                </div>
                <div class="banner-slot__actions">
                  <input [id]="'upload-' + slot.key" type="file" accept="image/*"
                         [disabled]="uploadingSlot() === slot.key"
                         (change)="onFilePick($event, slot.key)"
                         style="display: none;">
                  <label [for]="'upload-' + slot.key"
                         class="btn btn--ghost btn--sm"
                         [class.is-disabled]="uploadingSlot() === slot.key"
                         style="cursor: pointer;">
                    {{ uploadingSlot() === slot.key
                        ? ('Subiendo… ' + uploadPct() + '%')
                        : (key ? 'Reemplazar' : '+ Subir') }}
                  </label>
                  @if (key) {
                    <button type="button" class="btn btn--ghost btn--sm"
                            [disabled]="busyKey() === key"
                            (click)="removeBannerSlot(slot.key)"
                            style="color: var(--color-lost, #c33);">
                      Borrar
                    </button>
                  }
                </div>
                @if (uploadErrorBySlot()[slot.key]) {
                  <p class="form-card__hint" style="color: var(--color-lost); margin-top: var(--space-xs);">
                    {{ uploadErrorBySlot()[slot.key] }}
                  </p>
                }
              </article>
            }
          </div>
        </div>

        <hr style="margin: var(--space-lg) 0;">

        <h2 class="form-card__title">Códigos de canje</h2>
        <p class="form-card__lead">
          Cada código entrega un <strong>comodín de tipo predefinido</strong> al usuario que lo
          canjee (sistema reglamento §comodines). Si dejas el dropdown vacío, el código sumará
          <code>pointsValue</code> puntos directos al ranking (modo legacy, en migración).
          Una vez canjeado, el mismo user no puede volver a usarlo.
        </p>

        @for (c of activeCodes(); track c; let i = $index) {
          <article style="background: var(--color-primary-grey, #f4f4f4); padding: var(--space-md); border-radius: var(--radius-sm); margin-bottom: var(--space-sm);">
            <header style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: var(--space-sm);">
              <strong>Código #{{ i + 1 }}</strong>
              <a class="link-green" style="color: var(--color-lost); cursor: pointer;" (click)="markDelete(c, $event)">Borrar</a>
            </header>
            <div style="display: grid; grid-template-columns: 1fr 100px; gap: var(--space-sm); align-items: end;">
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
            </div>
            <div style="display: grid; grid-template-columns: 1fr 110px; gap: var(--space-sm); margin-top: var(--space-sm); align-items: end;">
              <div class="form-card__field" style="margin: 0;">
                <label class="form-card__label">Tipo de comodín que otorga</label>
                <select class="form-card__input" [(ngModel)]="c.comodinType"
                        [name]="'ctype-' + i"
                        (change)="c.dirty = true">
                  <option value="">— ninguno (legacy: solo puntos) —</option>
                  @for (opt of COMODIN_OPTIONS; track opt.value) {
                    <option [value]="opt.value">{{ opt.label }}</option>
                  }
                </select>
              </div>
              <div class="form-card__field" style="margin: 0;">
                <label class="form-card__label">Pts (legacy)</label>
                <input class="form-card__input" type="number" min="0" max="500"
                       [(ngModel)]="c.pointsValue" [name]="'pts-' + i"
                       [disabled]="!!c.comodinType"
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
  styles: [`
    .banner-slot-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: var(--space-md);
      margin-top: var(--space-md);
    }
    .banner-slot {
      background: var(--color-primary-grey, #f4f4f4);
      border-radius: var(--radius-sm);
      padding: var(--space-md);
      display: grid;
      gap: var(--space-sm);
    }
    .banner-slot__head strong {
      display: block;
      font-family: var(--font-display);
      font-size: var(--fs-lg);
      text-transform: uppercase;
      letter-spacing: 0.04em;
      line-height: 1;
    }
    .banner-slot__head small {
      display: block;
      font-size: var(--fs-xs);
      color: var(--color-text-muted);
      margin-top: 2px;
    }
    .banner-slot__preview {
      aspect-ratio: 16 / 9;
      background: var(--color-primary-white);
      border-radius: var(--radius-sm);
      overflow: hidden;
      border: 1px dashed rgba(0,0,0,0.15);
    }
    .banner-slot__preview img {
      width: 100%;
      height: 100%;
      object-fit: contain;
      display: block;
    }
    .banner-slot__placeholder {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--color-text-muted);
      font-size: var(--fs-xs);
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }
    .banner-slot__actions {
      display: flex;
      gap: var(--space-xs);
      flex-wrap: wrap;
    }
    .is-disabled { opacity: 0.6; pointer-events: none; }
  `],
})
export class AdminSponsorEditComponent implements OnInit {
  @Input() id?: string;

  private api = inject(ApiService);
  private toast = inject(ToastService);
  private router = inject(Router);

  SLOTS = SLOTS;
  COMODIN_OPTIONS = COMODIN_OPTIONS;

  loading = signal(true);
  saving = signal(false);
  error = signal<string | null>(null);

  // Upload state — mode-aware por slot, así dos slots no compiten por
  // el mismo flag global y la barra de progreso muestra cuál está activo.
  uploadingSlot = signal<SlotKey | null>(null);
  uploadPct = signal(0);
  uploadErrorBySlot = signal<Partial<Record<SlotKey, string>>>({});
  busyKey = signal<string | null>(null);     // S3 key currently being deleted

  // Cache de URLs firmadas para preview de banners.
  previewUrls = signal<Map<string, string>>(new Map());

  name = '';
  // Tres signals independientes — uno por slot. Nullable cuando vacío.
  banner1 = signal<string | null>(null);
  banner2 = signal<string | null>(null);
  banner3 = signal<string | null>(null);
  codes = signal<CodeRow[]>([]);

  activeCodes = computed(() => this.codes().filter((c) => !c.deleted));

  isNew = computed(() => !this.id);

  slotKey(slot: SlotKey): string | null {
    if (slot === 'banner1') return this.banner1();
    if (slot === 'banner2') return this.banner2();
    return this.banner3();
  }

  private setSlot(slot: SlotKey, value: string | null) {
    if (slot === 'banner1') this.banner1.set(value);
    else if (slot === 'banner2') this.banner2.set(value);
    else this.banner3.set(value);
  }

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
        // Backcompat: si el sponsor todavía tiene bannerKeys legacy y los
        // slots están vacíos, prefill slot1/2/3 con los primeros 3.
        const legacy = ((sRes.data.bannerKeys ?? []) as (string | null)[]).filter((k): k is string => !!k);
        this.banner1.set((sRes.data.banner1 as string | null) ?? legacy[0] ?? null);
        this.banner2.set((sRes.data.banner2 as string | null) ?? legacy[1] ?? null);
        this.banner3.set((sRes.data.banner3 as string | null) ?? legacy[2] ?? null);
      }
      const codes: CodeRow[] = ((cRes.data ?? []) as Array<{
        id: string; code: string; startDate: string; endDate: string;
        maxUses: number; pointsValue: number; currentUses?: number;
        comodinType?: ComodinType | null;
      }>).map((c) => ({
        id: c.id,
        code: c.code,
        startLocal: isoToLocal(c.startDate),
        endLocal: isoToLocal(c.endDate),
        maxUses: c.maxUses,
        pointsValue: c.pointsValue ?? 0,
        comodinType: c.comodinType ?? '',
        currentUses: c.currentUses ?? 0,
        dirty: false,
        deleted: false,
      }));
      codes.sort((a, b) => a.code.localeCompare(b.code));
      this.codes.set(codes);

      // Resolver URLs de preview en paralelo
      void this.resolveAllPreviews();
    } finally {
      this.loading.set(false);
    }
  }

  private async resolveAllPreviews(): Promise<void> {
    const keys = [this.banner1(), this.banner2(), this.banner3()]
      .filter((k): k is string => !!k);
    await Promise.all(keys.map((k) => this.resolvePreview(k)));
  }

  private async resolvePreview(key: string): Promise<void> {
    if (this.previewUrls().has(key)) return;
    try {
      const res = await getUrl({ path: key, options: { expiresIn: 3600 } });
      this.previewUrls.update((m) => {
        const next = new Map(m);
        next.set(key, res.url.toString());
        return next;
      });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[banner getUrl] failed for', key, e);
    }
  }

  async onFilePick(ev: Event, slot: SlotKey) {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';                                  // reset para permitir re-pick mismo archivo
    if (!file) return;

    const setSlotErr = (msg: string | null) => {
      this.uploadErrorBySlot.update((m) => ({ ...m, [slot]: msg ?? undefined }));
    };

    if (!ACCEPTED_TYPES.includes(file.type)) {
      setSlotErr('Tipo de archivo no soportado. Usa PNG, JPG, WebP, GIF o SVG.');
      return;
    }
    if (file.size > MAX_BANNER_BYTES) {
      setSlotErr(`Archivo muy grande (${Math.round(file.size / 1024 / 1024)} MB). Máx 2 MB.`);
      return;
    }
    setSlotErr(null);
    this.uploadingSlot.set(slot);
    this.uploadPct.set(0);

    // path: sponsors/banners/{slot}/{ts-rand-filename}. Prefijo por slot
    // ayuda a debug en S3 console.
    const ts = Date.now().toString(36);
    const rand = Math.random().toString(36).slice(2, 8);
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').toLowerCase();
    const path = `sponsors/banners/${slot}/${ts}-${rand}-${safeName}`;

    try {
      const op = uploadData({
        path,
        data: file,
        options: {
          contentType: file.type,
          onProgress: (e: { transferredBytes: number; totalBytes?: number }) => {
            if (e.totalBytes) {
              this.uploadPct.set(Math.round((e.transferredBytes / e.totalBytes) * 100));
            }
          },
        },
      });
      const result = await op.result;
      const finalKey = result.path ?? path;
      // Si el slot ya tenía banner, intentamos borrar el viejo (best-effort).
      const old = this.slotKey(slot);
      if (old && old !== finalKey) {
        try { await remove({ path: old }); }
        catch (e) {
          // eslint-disable-next-line no-console
          console.warn('[remove old slot S3] failed:', e);
        }
        this.previewUrls.update((m) => { const n = new Map(m); n.delete(old); return n; });
      }
      this.setSlot(slot, finalKey);
      void this.resolvePreview(finalKey);
      this.toast.success(`Banner subido (${slot})`);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[uploadData] failed', e);
      setSlotErr(humanizeError(e));
    } finally {
      this.uploadingSlot.set(null);
      this.uploadPct.set(0);
    }
  }

  async removeBannerSlot(slot: SlotKey) {
    const key = this.slotKey(slot);
    if (!key) return;
    if (!confirm('¿Borrar este banner del bucket? Esta acción no se puede deshacer.')) return;
    this.busyKey.set(key);
    try {
      try { await remove({ path: key }); }
      catch (e) {
        // eslint-disable-next-line no-console
        console.warn('[remove S3] failed (continuing anyway):', e);
      }
      this.setSlot(slot, null);
      this.previewUrls.update((m) => {
        const next = new Map(m);
        next.delete(key);
        return next;
      });
    } finally {
      this.busyKey.set(null);
    }
  }

  addCode() {
    // Default: comodín MULTIPLIER_X2, ventana 30d, máx 100 usos. Admin
    // ajusta según campaña. pointsValue queda en 0 a menos que se elija
    // dropdown vacío (legacy mode).
    const now = new Date();
    const end = new Date(now.getTime() + 30 * 86_400_000);
    this.codes.update((arr) => [...arr, {
      id: null,
      code: '',
      startLocal: dateToLocalInput(now),
      endLocal: dateToLocalInput(end),
      maxUses: 100,
      pointsValue: 0,
      comodinType: 'MULTIPLIER_X2',
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
      // 1) Sponsor: create o update. Persistimos en banner1/2/3 (los
      // slots nuevos). bannerKeys legacy se deja como está para que
      // los reads viejos no se rompan.
      const slots = {
        banner1: this.banner1(),
        banner2: this.banner2(),
        banner3: this.banner3(),
      };
      let sponsorId = this.id;
      if (!sponsorId) {
        const res = await this.api.createSponsor({
          name: this.name.trim(),
          ...slots,
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
          ...slots,
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
        // Si el admin eligió un comodinType, ese gana (pointsValue → 0).
        // Si no eligió, el code es legacy (suma pointsValue al canjear).
        const ctype = c.comodinType || null;
        const pts = ctype ? 0 : c.pointsValue;

        if (!c.id) {
          const res = await this.api.createSponsorCode({
            sponsorId,
            tournamentId: TOURNAMENT_ID,
            code: c.code.trim().toUpperCase(),
            startDate: localInputToIso(c.startLocal),
            endDate: localInputToIso(c.endLocal),
            maxUses: c.maxUses,
            pointsValue: pts,
            comodinType: ctype,
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
            pointsValue: pts,
            comodinType: ctype,
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
