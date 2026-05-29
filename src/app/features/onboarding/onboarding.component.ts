import { Component, OnInit, computed, inject } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { GroupActionsService } from '../../core/groups/group-actions.service';

/**
 * Onboarding post-registro. Pantalla única con 3 CTAs:
 *  · Crear un grupo
 *  · Unirme con un código
 *  · Explorar primero (sin grupo)
 *
 * Si llegamos con `?returnUrl=/groups/join/:code` (deep-link compartido),
 * salteamos la pantalla y aterrizamos directamente en el deep-link — el
 * user ya tiene intención clara, mostrarle un tutorial sería ruido.
 *
 * El detalle de modos (SIMPLE / COMPLETE) ahora vive en el modal de crear
 * grupo, donde es contextual a la decisión. No lo repetimos acá.
 */
@Component({
  selector: 'app-onboarding',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="onb-shell">
      <div class="onb-card">

        <div class="onb-top">
          <a routerLink="/picks" class="topbar__brand"
             style="text-decoration:none;color:inherit;display:flex;align-items:center;gap:8px;">
            <img src="assets/logo-golgana.png" alt="Golgana" width="199" height="98"
                 class="brand-logo--sm">
          </a>
        </div>

        <div class="onb-hero onb-hero--ready" aria-hidden="true">⚽</div>
        <div class="kicker">Bienvenido</div>
        <h1 class="onb-title">
          Hola,<br><span translate="no">{{ '@' + (handle() ?? 'jugador') }}</span>
        </h1>
        <p class="onb-sub">
          El Mundial 2026 está a la vuelta. Para empezar, crea un grupo con tus
          panas o únete con un código que te compartieron.
        </p>

        <div class="onb-actions" style="display:flex;flex-direction:column;gap:10px;">
          <button class="btn-wf btn-wf--block btn-wf--primary" type="button"
                  (click)="onCreate()">
            <span aria-hidden="true">＋ </span>Crear un grupo
          </button>
          <button class="btn-wf btn-wf--block btn-wf--ink" type="button"
                  (click)="onJoin()">
            <span aria-hidden="true">→ </span>Unirme con código
          </button>
          <button class="btn-wf btn-wf--block onb-secondary" type="button"
                  (click)="onSkip()">
            Explorar primero
          </button>
        </div>

        <p class="onb-helper">
          Puedes crear o unirte a un grupo desde la sidebar en cualquier momento.
        </p>

      </div>
    </div>
  `,
  styles: [`
    :host { display: block; }

    .onb-secondary {
      background: transparent;
      color: var(--wf-ink-2);
      border: 1px solid var(--color-line);
    }
    .onb-secondary:hover { background: rgba(0,0,0,0.03); }
    .onb-secondary:focus-visible {
      outline: 2px solid var(--color-primary-green);
      outline-offset: 2px;
    }

    .onb-helper {
      margin-top: 18px;
      text-align: center;
      font-size: 12px;
      color: var(--color-text-muted);
      line-height: 1.4;
    }
  `],
})
export class OnboardingComponent implements OnInit {
  private auth = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private groupActions = inject(GroupActionsService);

  handle = computed(() => this.auth.user()?.handle ?? null);

  /** Path al que volver. Si el user llegó vía `?returnUrl=` (deep-link
   *  típicamente `/groups/join/:code`), saltamos onboarding completamente
   *  y aterrizamos en el deep-link. Solo paths internos para evitar
   *  open-redirect. */
  private safeReturnUrl(): string | null {
    const raw = this.route.snapshot.queryParamMap.get('returnUrl');
    if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return null;
    return raw;
  }

  ngOnInit() {
    const ret = this.safeReturnUrl();
    if (ret) {
      // Skip onboarding completo — el user tiene intención clara.
      void this.router.navigateByUrl(ret);
    }
  }

  onCreate() {
    // GroupActionsService es providedIn:'root', así que el signal sobrevive
    // a la navegación y el modal aparece al montar el shell post-auth.
    this.groupActions.openCreate();
    void this.router.navigate(['/home']);
  }

  onJoin() {
    this.groupActions.openJoin();
    void this.router.navigate(['/home']);
  }

  onSkip() {
    void this.router.navigate(['/home']);
  }
}
