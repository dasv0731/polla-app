import { Component, Input, OnChanges, OnInit, SimpleChanges, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../../core/api/api.service';
import { AuthService } from '../../core/auth/auth.service';
import { ToastService } from '../../core/notifications/toast.service';
import { humanizeError } from '../../core/notifications/domain-errors';
import { UserAvatarComponent } from '../../shared/user-avatar/user-avatar.component';
import { getUrl } from 'aws-amplify/storage';

interface GroupHeader {
  id: string;
  name: string;
  joinCode: string;
  adminUserId: string;
  createdAt: string;
  mode: 'SIMPLE' | 'COMPLETE';
  /** Storage key del logo/avatar del grupo. null si no se subió.
   *  Resuelve a signed URL en `groupImageUrl` signal. */
  imageKey: string | null;
  prize1st: string | null;
  prize2nd: string | null;
  prize3rd: string | null;
}

interface RankRow {
  userId: string;
  handle: string;
  avatarKey?: string | null;
  points: number;
  exactCount: number;
  resultCount: number;
}

@Component({
  standalone: true,
  selector: 'app-group-detail',
  imports: [RouterLink, UserAvatarComponent],
  template: `
    <section class="page">

      @if (loading()) {
        <p class="loading-msg">Cargando grupo…</p>
      } @else if (group() === null) {
        <p class="loading-msg">Grupo no encontrado.</p>
      }
      @if (!loading() && group(); as g) {

        <a routerLink="/groups" class="back-link">‹ Mis grupos</a>

        <!-- Hero verde -->
        <header class="group-hero">
          <div class="group-hero__top">
            <div style="display:flex;align-items:center;gap:14px;flex:1;min-width:0;">
              @if (groupImageUrl()) {
                <img [src]="groupImageUrl()!" alt="Logo del grupo"
                     style="width:64px;height:64px;border-radius:12px;object-fit:cover;flex-shrink:0;border:2px solid rgba(255,255,255,.4);">
              }
              <div style="min-width:0;">
                <div class="group-hero__meta">
                  {{ g.mode === 'COMPLETE' ? 'MODO COMPLETO' : 'MODO SIMPLE' }}
                  · {{ rows().length }} {{ rows().length === 1 ? 'MIEMBRO' : 'MIEMBROS' }}
                  @if (isAdminOfGroup()) { · TÚ ERES ADMIN }
                </div>
                <h1 class="group-hero__name">{{ g.name }}</h1>
              </div>
            </div>
            @if (isAdminOfGroup()) {
              <button class="group-hero__menu" type="button"
                      aria-label="Más opciones"
                      (click)="scrollToAdmin()">⋯</button>
            }
          </div>
          <div class="group-hero__stats">
            <div class="group-stat">
              <div class="num">{{ myPos() ? myPos() + '°' : '—' }}</div>
              <div class="lbl">Tu pos.</div>
            </div>
            <div class="group-stat">
              <div class="num">{{ myPoints() }}</div>
              <div class="lbl">Tus pts</div>
            </div>
            <div class="group-stat">
              <div class="num">{{ rows().length }}</div>
              <div class="lbl">Miembros</div>
            </div>
          </div>
        </header>

        <!-- Pareja invitar + premios (en mobile invitar primero; desktop reordena) -->
        <div class="group-pair">

          <aside class="group-invitar">
            <div class="kicker">CÓDIGO DE INVITACIÓN</div>
            <div class="group-invitar__code">{{ g.joinCode }}</div>
            <div class="group-invitar__actions">
              <button class="btn-wf btn-wf--sm" type="button" (click)="copyLink()">
                {{ copied() ? '✓ Copiado' : '📋 Copiar link' }}
              </button>
              @if (isAdminOfGroup()) {
                <a class="btn-wf btn-wf--sm btn-wf--primary"
                   [routerLink]="['/groups', g.id, 'invite']">✉ Invitar por email</a>
              }
            </div>
          </aside>

          <aside class="group-premios">
            <header class="group-premios__head">
              <div class="left">
                <span class="group-premios__icon">🏆</span>
                <div>
                  <div class="kicker" style="color:#7a5d00;">EN JUEGO</div>
                  <div class="group-premios__total">{{ prizesTotalLabel() }}</div>
                </div>
              </div>
              @if (isAdminOfGroup()) {
                <a class="group-premios__edit" [routerLink]="['/groups', g.id, 'prizes']">
                  Editar →
                </a>
              }
            </header>
            @if (hasPrizes()) {
              @if (g.prize1st) {
                <div class="group-premios__row">
                  <div class="medal">🥇</div>
                  <div class="info">
                    <div class="ptitle">1° lugar</div>
                    <div class="psub">Premio mayor</div>
                  </div>
                  <div class="amount">{{ g.prize1st }}</div>
                </div>
              }
              @if (g.prize2nd) {
                <div class="group-premios__row">
                  <div class="medal">🥈</div>
                  <div class="info"><div class="ptitle">2° lugar</div></div>
                  <div class="amount">{{ g.prize2nd }}</div>
                </div>
              }
              @if (g.prize3rd) {
                <div class="group-premios__row">
                  <div class="medal">🥉</div>
                  <div class="info"><div class="ptitle">3° lugar</div></div>
                  <div class="amount">{{ g.prize3rd }}</div>
                </div>
              }
            } @else {
              <div class="group-premios__row">
                <div class="medal">·</div>
                <div class="info">
                  <div class="ptitle">Sin premios definidos</div>
                  @if (isAdminOfGroup()) {
                    <div class="psub">Define los premios para motivar al grupo</div>
                  }
                </div>
              </div>
            }
          </aside>

        </div>

        <!-- Ranking interno -->
        <section class="group-section">
          <header class="group-section__head">
            <h2 class="group-section__title">
              Ranking interno · {{ rows().length }} {{ rows().length === 1 ? 'miembro' : 'miembros' }}
            </h2>
            <div class="seg" aria-label="Vista del ranking">
              <button type="button" class="seg__item is-active">General</button>
              <button type="button" class="seg__item" disabled
                      title="Próximamente">Por jornada</button>
            </div>
          </header>

          <div class="rank-table-wrap">
            <table class="rank-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Jugador</th>
                  <th>Pts</th>
                  <th class="rank-table__desk">Exactos</th>
                  <th class="rank-table__desk">Result.</th>
                </tr>
              </thead>
              <tbody>
                @for (r of rows(); track r.userId; let i = $index) {
                  <tr [class.is-me]="r.userId === currentUserId">
                    <td class="rank-table__pos">{{ i + 1 }}</td>
                    <td class="text-bold">
                      <span style="display:inline-flex;align-items:center;gap:8px;">
                        <app-user-avatar
                          [sub]="r.userId"
                          [handle]="r.handle"
                          [avatarKey]="r.avatarKey"
                          size="sm" />
                        {{ '@' + r.handle }}@if (r.userId === currentUserId) { <span class="text-mute"> (tú)</span> }
                      </span>
                    </td>
                    <td class="rank-table__pts">{{ r.points }}</td>
                    <td class="rank-table__desk">{{ r.exactCount }}</td>
                    <td class="rank-table__desk">{{ r.resultCount }}</td>
                  </tr>
                } @empty {
                  <tr>
                    <td colspan="5" style="text-align:center; padding: 22px; color: var(--wf-ink-3);">
                      Aún no hay puntajes. Espera al primer partido.
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>

          <p class="rank-foot">
            La tabla se actualiza automáticamente cuando se publican los resultados.
          </p>
        </section>

        <!-- Acciones admin -->
        @if (isAdminOfGroup()) {
          <section class="group-section" #adminAnchor>
            <h2 class="group-section__title" style="margin-bottom:10px;">Acciones de admin</h2>
            <div class="group-admin-actions">
              <a class="btn-wf btn-wf--block" [routerLink]="['/groups', g.id, 'edit']">
                ✏ Editar grupo (nombre · descripción · imagen)
              </a>
              <a class="btn-wf btn-wf--block" [routerLink]="['/groups', g.id, 'prizes']">
                ⚙ Editar premios
              </a>
              <a class="btn-wf btn-wf--block" [routerLink]="['/groups', g.id, 'invite']">
                ✉ Invitar por email
              </a>
              <button class="btn-wf btn-wf--block btn-wf--danger" type="button" (click)="del()">
                🗑 Eliminar grupo
              </button>
            </div>
          </section>
        }

      }
    </section>
  `,
  styles: [`
    :host { display: block; }

    .loading-msg {
      padding: 48px 16px;
      text-align: center;
      color: var(--wf-ink-3);
      font-size: 14px;
    }

    .rank-foot {
      margin-top: 12px;
      font-size: 11px;
      color: var(--wf-ink-3);
      line-height: 1.4;
    }
  `],
})
export class GroupDetailComponent implements OnInit, OnChanges {
  @Input() id!: string;

  private api = inject(ApiService);
  private auth = inject(AuthService);
  private toast = inject(ToastService);
  private router = inject(Router);

  /** Cuando el user navega de /groups/A → /groups/B, Angular reutiliza
   *  esta misma component instance y solo cambia el @Input id. ngOnInit
   *  no vuelve a correr — sin un OnChanges nos quedaríamos mostrando los
   *  datos del grupo A para siempre. */
  ngOnChanges(changes: SimpleChanges) {
    if (changes['id'] && !changes['id'].firstChange) {
      void this.load();
    }
  }

  group = signal<GroupHeader | null>(null);
  /** Signed URL del logo del grupo (vence en 1h, se re-resuelve en cada
   *  load del componente). */
  groupImageUrl = signal<string | null>(null);
  rows = signal<RankRow[]>([]);
  loading = signal(true);
  copied = signal(false);
  currentUserId = '';

  isAdminOfGroup = computed(() => this.group()?.adminUserId === this.currentUserId);

  hasPrizes = computed(() => {
    const g = this.group();
    return !!(g?.prize1st || g?.prize2nd || g?.prize3rd);
  });

  /** Suma los $X de los 3 premios. Si todos parsean a número, devuelve "$N";
   *  si hay alguno no numérico (ej. "Cena"), cae a contar premios. */
  prizesTotalLabel = computed(() => {
    const g = this.group();
    if (!g) return '—';
    const raws = [g.prize1st, g.prize2nd, g.prize3rd].filter((v): v is string => !!v);
    if (raws.length === 0) return 'Sin definir';
    const numbers = raws.map((s) => {
      const m = s.match(/\$\s*(\d[\d.,]*)/);
      return m ? parseFloat(m[1].replace(/,/g, '')) : null;
    });
    const allParsed = numbers.every((n) => n !== null);
    if (allParsed) {
      const sum = (numbers as number[]).reduce((a, n) => a + n, 0);
      return `$${Math.round(sum)}`;
    }
    return `${raws.length} ${raws.length === 1 ? 'premio' : 'premios'}`;
  });

  inviteUrl = computed(() => {
    const g = this.group();
    return g ? `${location.origin}/groups/join/${g.joinCode}` : '';
  });

  myPos = computed(() => {
    const i = this.rows().findIndex((r) => r.userId === this.currentUserId);
    return i >= 0 ? i + 1 : null;
  });
  myPoints = computed(() =>
    this.rows().find((r) => r.userId === this.currentUserId)?.points ?? 0,
  );

  async ngOnInit() {
    this.currentUserId = this.auth.user()?.sub ?? '';
    await this.load();
  }

  /** Carga datos del grupo. Extraído de ngOnInit para que ngOnChanges
   *  pueda re-llamarlo cuando el @Input id cambia (navegación de
   *  /groups/A → /groups/B reusa el mismo component instance). */
  private async load() {
    this.loading.set(true);
    this.group.set(null);
    this.groupImageUrl.set(null);
    this.rows.set([]);
    try {
      const [grp, totals, members] = await Promise.all([
        this.api.getGroup(this.id),
        this.api.groupLeaderboard(this.id),
        this.api.groupMembers(this.id),
      ]);
      if (grp.data) {
        const imageKey = (grp.data as { imageKey?: string | null }).imageKey ?? null;
        this.group.set({
          id: grp.data.id,
          name: grp.data.name,
          joinCode: grp.data.joinCode,
          adminUserId: grp.data.adminUserId,
          createdAt: grp.data.createdAt,
          mode: (grp.data.mode ?? 'COMPLETE') as 'SIMPLE' | 'COMPLETE',
          imageKey,
          prize1st: grp.data.prize1st ?? null,
          prize2nd: grp.data.prize2nd ?? null,
          prize3rd: grp.data.prize3rd ?? null,
        });
        // Resolver signed URL para el logo en background. Si falla (cert
        // expirado, key fantasma), groupImageUrl queda null y el header
        // muestra solo el nombre.
        if (imageKey) {
          (async () => {
            try {
              const out = await getUrl({ path: imageKey, options: { expiresIn: 3600 } });
              this.groupImageUrl.set(out.url.toString());
            } catch {
              /* silencioso — sin imagen, fallback texto */
            }
          })();
        }
      }

      const userMetaByUser = new Map<string, { handle: string; avatarKey: string | null }>();
      await Promise.all(
        (members.data ?? []).map(async (m) => {
          const u = await this.api.getUser(m.userId);
          const data = u.data as { handle?: string; avatarKey?: string | null } | undefined;
          userMetaByUser.set(m.userId, {
            handle: data?.handle ?? m.userId.slice(0, 6),
            avatarKey: data?.avatarKey ?? null,
          });
        }),
      );

      const sorted = (totals.data ?? []).sort(
        (a, b) => (b.points ?? 0) - (a.points ?? 0),
      );
      this.rows.set(
        sorted.map((t) => ({
          userId: t.userId,
          handle: userMetaByUser.get(t.userId)?.handle ?? t.userId.slice(0, 6),
          avatarKey: userMetaByUser.get(t.userId)?.avatarKey ?? null,
          points: t.points ?? 0,
          exactCount: t.exactCount ?? 0,
          resultCount: t.resultCount ?? 0,
        })),
      );
    } finally {
      this.loading.set(false);
    }
  }

  async copyLink() {
    try {
      await navigator.clipboard.writeText(this.inviteUrl());
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    } catch {
      this.toast.error('No se pudo copiar el link');
    }
  }

  scrollToAdmin() {
    const el = document.querySelector('section.group-section:last-of-type');
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async del() {
    if (!confirm(
      '¿Eliminar el grupo? Todos los miembros perderán el acceso. Esta acción no se puede deshacer.',
    )) return;
    try {
      await this.api.deleteGroup(this.id);
      this.toast.success('Grupo eliminado');
      void this.router.navigate(['/groups']);
    } catch (e) {
      this.toast.error(humanizeError(e));
    }
  }
}
