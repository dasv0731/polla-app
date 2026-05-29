import { Component, Input, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../../core/api/api.service';
import { AuthService } from '../../core/auth/auth.service';
import { ToastService } from '../../core/notifications/toast.service';
import { humanizeError } from '../../core/notifications/domain-errors';
import { IconComponent } from '../../shared/ui/icon/icon.component';
import { DirtyAware } from '../../shared/util/dirty-form.guard';

@Component({
  standalone: true,
  selector: 'app-group-invite-email',
  imports: [FormsModule, RouterLink, IconComponent],
  template: `
    @let g = group();

    <header class="page-header">
      <div class="page-header__title">
        <small>
          <a [routerLink]="['/groups', id]" style="color: var(--color-primary-green);">
            ← {{ g?.name ?? 'Volver al grupo' }}
          </a>
        </small>
        <h1>Invitar por email</h1>
      </div>
    </header>

    <main class="container-app" style="max-width: var(--container-narrow); display: grid; gap: var(--space-xl);">
      @if (g !== null) {
        <!-- Form -->
        <form class="form-card" style="max-width: 100%;" (ngSubmit)="send()">
          <h2 class="form-card__title">¿A quiénes invitas?</h2>
          <p class="form-card__lead">
            Pega los emails de tus amigos. Pueden estar separados por coma, espacio o enter.
            Te avisamos cuando alguien se una.
          </p>

          <div class="form-card__field">
            <label class="form-card__label" for="emails-input">Emails</label>
            <div class="email-chips-wrap">
              @for (email of emails(); track email) {
                <span class="email-chip">
                  {{ email }}
                  <button type="button" class="email-chip__remove"
                          (click)="removeEmail(email)"
                          [attr.aria-label]="'Quitar ' + email">
                    <app-icon name="close" size="sm" [decorative]="true" />
                  </button>
                </span>
              }
              <input id="emails-input" type="email"
                     [value]="draft()"
                     (input)="onInput($any($event.target).value)"
                     (keydown.enter)="onSubmitChip($event)"
                     (keydown.,)="onSubmitChip($event)"
                     (keydown.space)="onSubmitChip($event)"
                     (blur)="commitDraft()"
                     placeholder="agregar otro email…">
            </div>
            <div class="form-card__hint-row">
              <span class="form-card__hint">Máx. 20 emails por invitación.</span>
              <span class="form-card__counter"
                    [class.is-near-limit]="emails().length >= 18">
                {{ emails().length }} / 20
              </span>
            </div>
          </div>

          <div class="form-card__field">
            <label class="form-card__label" for="message">Mensaje opcional</label>
            <textarea class="form-card__textarea" id="message" name="message"
                      rows="3" placeholder="Hey, armé un grupo para la polla del Mundial…"
                      [(ngModel)]="message" maxlength="500"
                      style="min-height: 80px; padding: 12px 14px; resize: vertical;"></textarea>
            <div class="form-card__hint-row">
              <span class="form-card__hint">Aparece debajo del CTA en el email.</span>
              <span class="form-card__counter"
                    [class.is-near-limit]="message.length >= 450">
                {{ message.length }} / 500
              </span>
            </div>
          </div>

          <button class="btn btn--primary form-card__submit" type="submit"
                  [disabled]="sending() || emails().length === 0 || groupIsFull()">
            {{ groupIsFull() ? 'Grupo lleno' : (sending() ? 'Enviando…' : sendLabel()) }}
          </button>

          @if (groupIsFull()) {
            <p class="text-mute" role="alert" style="font-size:12px;margin-top:8px;">
              El grupo ya tiene 30 miembros. No se pueden enviar más invitaciones hasta
              que el admin elimine a alguien.
            </p>
          }

          <p class="form-card__alt">
            Invitas al grupo <strong>"{{ g.name }}"</strong> con código <strong>{{ g.joinCode }}</strong>.
          </p>
        </form>

        <!-- Email preview -->
        <section>
          <p style="font-size: var(--fs-xs); text-transform: uppercase; letter-spacing: 0.08em; color: var(--color-text-muted); font-weight: var(--fw-bold); margin-bottom: var(--space-sm);">
            Preview · así se verá el email
          </p>

          <div class="email-preview">
            <header class="email-preview__subject">
              <strong>Asunto:</strong> {{ g.name }} te invita a Polla Mundialista 2026
            </header>
            <div class="email-preview__head">
              <!-- TODO(A6): valores hardcoded (logo, sender, copyright) deberían
                   venir del template del email server-side cuando se conecte el
                   lambda real de invitaciones. -->
              <img src="assets/logo-golgana.png" alt="Golgana" width="199" height="98">
              <div class="email-preview__head-info">
                <strong>Polla Mundialista 2026</strong>
                <small>polla&#64;golgana.net · Para: {{ emails().length ? emails()[0] : 'amigo@ejemplo.com' }}</small>
              </div>
            </div>
            <div class="email-preview__body">
              <p style="color: var(--color-primary-green); font-size: var(--fs-xs); text-transform: uppercase; letter-spacing: 0.12em; font-weight: var(--fw-bold); margin-bottom: var(--space-sm);">
                {{ '@' + (currentHandle() ?? 'tu') }} te invitó
              </p>
              <h2>Te invitan a "{{ g.name }}"</h2>
              <p>{{ '@' + (currentHandle() ?? 'tu') }} armó un grupo en la <strong>Polla Mundialista 2026</strong> y quiere que estés. Es gratis y solo pide email + password.</p>
              @if (message.trim()) {
                <p style="font-style: italic; padding: var(--space-sm) var(--space-md); border-left: 3px solid var(--color-primary-green); background: var(--color-green-5);">
                  "{{ message }}"
                </p>
              }
              <p>Únete con un click:</p>
              <a class="email-preview__cta">Unirme al grupo</a>
              <p>O ingresa este código en <strong>app.polla.golgana.net</strong>:</p>
              <span class="email-preview__code-mini">{{ g.joinCode }}</span>
              <p class="email-preview__signature">
                Recibiste este correo porque {{ '@' + (currentHandle() ?? 'tu') }} te invitó al grupo.
                Si no lo conoces, ignora este email — no se enviarán más mensajes a tu dirección.<br>
                © 2026 Golgana · polla&#64;golgana.net
              </p>
            </div>
          </div>
        </section>
      } @else if (loading()) {
        <p>Cargando grupo…</p>
      } @else {
        <p>Grupo no encontrado.</p>
      }
    </main>
  `,
  styles: [`
    .email-chip__remove {
      border: none;
      padding: 0;
      cursor: pointer;
      color: var(--color-primary-white);
      background: var(--color-text-muted);
    }
    .email-chip__remove:focus-visible {
      outline: 2px solid var(--color-primary-green);
      outline-offset: 2px;
    }
    .email-preview__subject {
      padding: var(--space-sm) var(--space-md);
      border-bottom: 1px solid var(--color-border);
      font-size: var(--fs-sm);
      color: var(--color-text-muted);
      background: var(--color-bg-subtle, #fafafa);
    }
    .email-preview__subject strong { color: var(--color-primary-black); }
    .form-card__hint-row {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: var(--space-sm);
      margin-top: 4px;
    }
    .form-card__counter {
      font-size: var(--fs-xs);
      color: var(--color-text-muted);
      font-variant-numeric: tabular-nums;
    }
    .form-card__counter.is-near-limit {
      color: var(--color-warn, #c97a00);
      font-weight: 600;
    }
  `],
})
export class GroupInviteEmailComponent implements OnInit, DirtyAware {
  @Input() id!: string;

  private api = inject(ApiService);
  private auth = inject(AuthService);
  private toast = inject(ToastService);
  private router = inject(Router);

  group = signal<{ id: string; name: string; joinCode: string } | null>(null);
  loading = signal(true);
  emails = signal<string[]>([]);
  draft = signal('');
  message = '';
  sending = signal(false);
  memberCount = signal<number | null>(null);

  currentHandle = computed(() => this.auth.user()?.handle);
  sendLabel = computed(() => {
    const n = this.emails().length;
    if (n === 0) return 'Agrega al menos un email';
    return `Enviar ${n} invitación${n === 1 ? '' : 'es'}`;
  });
  groupIsFull = computed(() => (this.memberCount() ?? 0) >= 30);

  /** True si el user empezó a redactar algo (chips o mensaje). Usado por
   *  `dirtyFormGuard` para confirmar abandono. */
  isDirty(): boolean {
    return this.emails().length > 0 || this.message.trim().length > 0 || this.draft().trim().length > 0;
  }

  async ngOnInit() {
    try {
      const [grp, members] = await Promise.all([
        this.api.getGroup(this.id),
        this.api.groupMembers(this.id),
      ]);
      if (grp.data) {
        this.group.set({ id: grp.data.id, name: grp.data.name, joinCode: grp.data.joinCode });
      }
      this.memberCount.set((members.data ?? []).length);
    } finally {
      this.loading.set(false);
    }
  }

  /** Re-cuenta members antes de mandar, para evitar race con otro admin que
   *  acaba de llenar el grupo. */
  private async refreshGroupInfo() {
    try {
      const members = await this.api.groupMembers(this.id);
      this.memberCount.set((members.data ?? []).length);
    } catch {
      // Si falla, mantenemos el conteo previo; el lambda hará el check final.
    }
  }

  onInput(value: string) {
    this.draft.set(value);
  }

  onSubmitChip(event: Event) {
    event.preventDefault();
    this.commitDraft();
  }

  commitDraft() {
    const v = this.draft().trim().replace(/,$/, '');
    if (!v) return;
    if (!this.isValidEmail(v)) {
      this.toast.error(`"${v}" no es un email válido`);
      return;
    }
    if (this.emails().length >= 20) {
      this.toast.error('Máx 20 emails por invitación');
      return;
    }
    if (this.emails().includes(v)) {
      this.draft.set('');
      return;
    }
    this.emails.update((arr) => [...arr, v]);
    this.draft.set('');
  }

  removeEmail(email: string) {
    this.emails.update((arr) => arr.filter((e) => e !== email));
  }

  private isValidEmail(value: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  async send() {
    this.commitDraft();
    const list = this.emails();
    if (list.length === 0) return;

    // Re-check memberCount para que un grupo que se llenó en otra sesión no
    // dispare un POST que el backend igualmente va a rechazar.
    await this.refreshGroupInfo();
    if (this.groupIsFull()) {
      this.toast.error('Grupo lleno. No se puede invitar.');
      return;
    }

    this.sending.set(true);
    try {
      const res = await this.api.emailGroupInvite(this.id, list);
      const sent = res.data?.sent ?? list.length;
      this.toast.success(
        `${sent} invitación${sent === 1 ? '' : 'es'} enviada${sent === 1 ? '' : 's'}`,
      );
      // Reset state ANTES de navegar para que el guard no dispare.
      this.emails.set([]);
      this.message = '';
      this.draft.set('');
      void this.router.navigate(['/groups', this.id]);
    } catch (e) {
      this.toast.error(humanizeError(e));
    } finally {
      this.sending.set(false);
    }
  }
}
