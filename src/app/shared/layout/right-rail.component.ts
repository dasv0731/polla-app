import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { Subscription, filter } from 'rxjs';
import { ApiService } from '../../core/api/api.service';
import { AuthService } from '../../core/auth/auth.service';
import { QuickPickModalService } from '../../core/picks/quick-pick-modal.service';
import { GolganaEditorialService } from '../../core/editorial/golgana-editorial.service';
import { IconComponent } from '../ui/icon/icon.component';
import type { IconName } from '../ui/icon/icon-map';
import { SkeletonComponent } from '../ui/skeleton/skeleton.component';

const TOURNAMENT_ID = 'mundial-2026';
const NEWS_HUB_URL = 'https://golgana.net/news';

interface NextMatchVm {
  id: string;
  homeName: string;
  awayName: string;
  homeFlag: string;
  awayFlag: string;
  homeInitials: string;
  awayInitials: string;
  kickoffAt: string;
  venue: string | null;
  phaseLabel: string;
  countdown: { d: string; h: string; m: string; s: string } | null;
  isLive: boolean;
  isStartingNow: boolean;
  myPick: { home: number; away: number; winnerName: string | null } | null;
}

interface UpcomingPickRow {
  id: string;
  dateLabel: string;
  matchLabel: string;
  hasPick: boolean;
  pickLabel: string | null;
  countdownLabel: string | null;
  // Datos para abrir el modal de pick rápido sin navegar al partido.
  homeName: string;
  awayName: string;
  homeFlag: string;
  awayFlag: string;
  homeInitials: string;
  awayInitials: string;
  kickoffAt: string;
  pick: { home: number; away: number } | null;
}

interface NewsItemVm {
  id: string;
  title: string;
  externalUrl: string;
  resolvedImageUrl: string | null;
  relativeTime: string;
}

/**
 * Aside derecho design-v3, sticky a 320px en desktop ≥1100px. Tres bloques
 * verticales: próximo partido (dark card con countdown + flags + mi pick),
 * siguientes picks (4 filas hacia /picks/match/:id) y noticias (hero card +
 * 3 rows desde Article.listPublishedArticles). Se colapsa a bloque normal
 * debajo del main en tablet/mobile.
 *
 * A8d polish:
 * - SVG icons via <app-icon> reemplazan emojis (🏳️ ✓ ⚠ →).
 * - Initials fallback (2 letras team name) cuando no hay flag code.
 * - Skeleton loading states durante fetch inicial (3 blocks).
 * - Countdown: `role="timer"`, pad-zero días, "Empieza ya" cuando llega 0,
 *   "EN VIVO" cuando match ya empezó.
 * - News images con `loading="lazy" decoding="async"`.
 * - Intl.RelativeTimeFormat para news dates (ya en uso).
 * - TODO(A6): consolidar las 5+ calls (listMatches + listTeams + myPicks +
 *   listPublishedArticles + N×getUrl) a un único `getMyRightRail()` cuando
 *   la lambda backend esté deployed.
 */
@Component({
  standalone: true,
  selector: 'app-right-rail',
  imports: [RouterLink, IconComponent, SkeletonComponent],
  template: `
    <aside class="side">

      <!-- Rail del grupo (/groups/:id): reemplaza el rail global. ¿A quién le
           va? + actividad son datos de EJEMPLO (sin fuente real client-side);
           el próximo partido de abajo sí es real. -->
      @if (onGroupDetail()) {
        @if (champDist().length > 0) {
        <div class="rr-card">
          <div class="rr-card__h">
            <h2>¿A quién le va el grupo?</h2>
          </div>
          <div class="rr-card__sub">Picks de campeón</div>
          @for (c of champDist(); track c.flag) {
            <div class="rr-champ">
              <span class="rr-champ__f"><span class="fi fi-{{ c.flag }}"></span></span>
              <div class="rr-champ__b">
                <div class="rr-champ__n">{{ c.name }}</div>
                <div class="rr-champ__bar"><i [style.width.%]="c.pct"></i></div>
              </div>
              <span class="rr-champ__v">{{ c.count }} · {{ c.pct }}%</span>
            </div>
          }
        </div>
        }

        <div class="rr-card">
          <div class="rr-card__h">
            <h2>Actividad reciente</h2>
            <span class="rr-demo">Ejemplo</span>
          </div>
          @for (a of demoActivity; track a.text) {
            <div class="rr-act">
              <span class="rr-act__i"><app-icon [name]="a.icon" size="sm" [decorative]="true" /></span>
              <div class="rr-act__t">
                {{ a.text }}
                <div class="rr-act__time">{{ a.time }}</div>
              </div>
            </div>
          }
        </div>
      }

      <!-- Solo en la tab Cronológico (/picks) el próximo partido y los
           siguientes picks ya viven en el componente principal (.nm + lista).
           Ahí se ocultan para no duplicar y el bloque editorial sube al tope.
           En las demás tabs/pantallas ambos bloques se conservan. -->
      @if (!onPicksPage()) {
      @if (loadingNext()) {
        <div class="np np--skeleton"><app-skeleton variant="card" /></div>
      } @else {
        @if (nextMatch(); as m) {
        <div class="np">
          <div class="np__bg"></div>
          <div class="np__in">
            <div class="np__top">
              @if (m.isLive) {
                <span class="np__live">EN VIVO</span>
              } @else if (m.isStartingNow) {
                <span class="np__live">Empieza ya</span>
              } @else {
                <span class="np__live">Próximo</span>
              }
              <span class="np__tag">{{ m.phaseLabel }}</span>
            </div>
            <div class="np__hl">El <em>próximo</em> partido</div>
            <div class="np__sub">{{ m.venue ?? 'Sede por confirmar' }}</div>

            @if (m.countdown; as cd) {
              <div class="np__cd" role="timer" aria-label="Tiempo hasta kickoff">
                <div class="np__cd__c"><div class="np__cd__n">{{ cd.d }}</div><div class="np__cd__l">Días</div></div>
                <div class="np__cd__c"><div class="np__cd__n">{{ cd.h }}</div><div class="np__cd__l">Hrs</div></div>
                <div class="np__cd__c"><div class="np__cd__n">{{ cd.m }}</div><div class="np__cd__l">Min</div></div>
                <div class="np__cd__c"><div class="np__cd__n">{{ cd.s }}</div><div class="np__cd__l">Seg</div></div>
              </div>
            }

            <div class="np__t">
              <div class="np__tm np__tm--home">
                <div class="np__fl">
                  @if (m.homeFlag) {
                    <span class="fi fi-{{ m.homeFlag.toLowerCase() }}"></span>
                  } @else {
                    <span class="np__fl__ini" aria-hidden="true">{{ m.homeInitials }}</span>
                  }
                </div>
                <div class="np__n">{{ m.homeName }}</div>
              </div>
              <div class="np__vs"><div class="np__vs__l">VS</div></div>
              <div class="np__tm">
                <div class="np__fl">
                  @if (m.awayFlag) {
                    <span class="fi fi-{{ m.awayFlag.toLowerCase() }}"></span>
                  } @else {
                    <span class="np__fl__ini" aria-hidden="true">{{ m.awayInitials }}</span>
                  }
                </div>
                <div class="np__n">{{ m.awayName }}</div>
              </div>
            </div>

            @if (m.myPick) {
              <div class="np__pk">
                <div>
                  <span class="np__pk__l">Tu pick</span>
                  <strong>{{ m.myPick.home }} – {{ m.myPick.away }}
                    @if (m.myPick.winnerName) { <em>{{ m.myPick.winnerName }}</em> }
                  </strong>
                </div>
                <button type="button" class="np__pk__e" (click)="openQuickPickNext()">Editar</button>
              </div>
            } @else {
              <button type="button" class="np__pk np__pk--cta" (click)="openQuickPickNext()">
                <div>
                  <span class="np__pk__l">Sin pick</span>
                  <strong>
                    Hacer pick
                    <app-icon name="arrow-right" size="sm" />
                  </strong>
                </div>
              </button>
            }

            <a class="np__cta" [routerLink]="['/picks/match', m.id]">
              <span>Ver previa completa</span>
              <app-icon name="arrow-right" size="sm" />
            </a>
          </div>
        </div>
        }
      }

      @if (!onGroupDetail() && loadingUpcoming()) {
        <div class="up up--skeleton"><app-skeleton variant="list" [count]="4" /></div>
      } @else if (!onGroupDetail() && upcoming().length > 0) {
        <div class="up">
          <div class="up__h">
            <span>Siguientes picks</span>
            <a class="up__h__more" routerLink="/picks">
              <span>Ver todos</span>
              <app-icon name="arrow-right" size="sm" />
            </a>
          </div>
          @for (r of upcoming(); track r.id) {
            <button type="button" class="up__r" (click)="openQuickPickRow(r)">
              <div class="up__r__h">
                <span>{{ r.dateLabel }} · {{ r.matchLabel }}</span>
                @if (r.hasPick) {
                  <span class="ok">
                    <app-icon name="check" size="sm" />
                    <span>Pick</span>
                  </span>
                } @else {
                  <span class="pe">
                    <app-icon name="alert" size="sm" />
                    <span>{{ r.countdownLabel }}</span>
                  </span>
                }
              </div>
              <div class="up__r__t" [class.m]="!r.hasPick">
                {{ r.hasPick ? r.pickLabel : 'Pendiente' }}
              </div>
            </button>
          }
        </div>
      }
      }

      @if (!onGroupDetail()) {
      @if (loadingNews()) {
        <div class="news news--skeleton"><app-skeleton variant="card" /></div>
      } @else {
        @if (newsHero(); as hero) {
        <div class="news">
          <a [href]="hero.externalUrl" target="_blank" rel="noopener noreferrer" class="news__hero">
            @if (hero.resolvedImageUrl) {
              <img [src]="hero.resolvedImageUrl" [alt]="hero.title" loading="lazy" decoding="async">
            } @else {
              <img src="assets/news-placeholder.svg" [alt]="hero.title" loading="lazy" decoding="async">
            }
            <div class="news__hero__b">
              <div class="news__hero__k">Destacada · {{ hero.relativeTime }}</div>
              <div class="news__hero__t">{{ hero.title }}</div>
            </div>
          </a>
          @if (newsList().length > 0) {
            <div class="news__list">
              @for (a of newsList(); track a.id) {
                <a [href]="a.externalUrl" target="_blank" rel="noopener noreferrer" class="news__row">
                  <div class="news__row__img"
                       [style.backgroundImage]="a.resolvedImageUrl ? 'url(' + a.resolvedImageUrl + ')' : null"></div>
                  <div class="news__row__b">
                    <div class="news__row__k">{{ a.relativeTime }}</div>
                    <div class="news__row__t">{{ a.title }}</div>
                  </div>
                </a>
              }
              <a [href]="newsHubUrl" target="_blank" rel="noopener noreferrer" class="news__more">
                <span>Ver todas</span>
                <app-icon name="arrow-right" size="sm" />
              </a>
            </div>
          }
        </div>
        }
      }
      }
    </aside>
  `,
  styles: [`
    :host { display: contents; }

    .side {
      position: sticky;
      top: 24px;
      align-self: start;
      display: flex;
      flex-direction: column;
      gap: 14px;
      max-height: calc(100vh - 48px);
      overflow-y: auto;
    }
    /* Sin esto los hijos heredan flex-shrink:1 y la dark card .np se
       aplasta a 1px de alto cuando todos los bloques juntos exceden
       max-height. Con shrink:0 mantienen su alto natural y .side
       scrollea internamente. */
    .side > * { flex-shrink: 0; }
    .side::-webkit-scrollbar { width: 4px; }
    .side::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.15); border-radius: 99px; }

    @media (max-width: 1099px) {
      .side { position: static; max-height: none; overflow: visible; }
    }

    /* Next match — see polla-v3.html .np */
    .np {
      background: #0a0a0a;
      color: #fff;
      border-radius: 18px;
      position: relative;
      overflow: hidden;
      border: 1px solid rgba(2,204,116,0.3);
      box-shadow: 0 12px 40px rgba(0,0,0,0.18);
    }
    .np__bg {
      position: absolute; inset: 0; z-index: 0;
      background: linear-gradient(160deg, #0a0a0a 0%, #0a3d20 55%, #067a4a 120%);
    }
    .np__bg::before {
      content: ""; position: absolute; inset: 0;
      background:
        radial-gradient(80% 50% at 50% 0%, rgba(2,204,116,0.5), transparent 65%),
        radial-gradient(60% 60% at 100% 100%, rgba(2,204,116,0.2), transparent 60%);
    }
    .np__in { position: relative; z-index: 1; padding: 22px; }
    .np__top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }
    .np__live {
      display: inline-flex; align-items: center; gap: 8px;
      background: rgba(2,204,116,0.18);
      border: 1px solid rgba(2,204,116,0.4);
      border-radius: 999px;
      padding: 5px 12px;
      font-size: 10px; letter-spacing: 0.14em; text-transform: uppercase;
      font-weight: 700;
      color: var(--color-primary-green);
    }
    .np__tag { font-size: 10px; color: rgba(255,255,255,0.55); letter-spacing: 0.08em; }
    .np__hl { font-family: var(--font-display); font-size: 20px; line-height: 1.1; color: #fff; margin-bottom: 4px; }
    .np__hl em { font-style: normal; color: var(--color-primary-green); }
    .np__sub { font-size: 11px; color: rgba(255,255,255,0.55); margin-bottom: 16px; }

    .np__cd { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin-bottom: 18px; }
    .np__cd__c {
      background: rgba(255,255,255,0.05);
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 10px;
      padding: 10px 0 8px;
      text-align: center;
    }
    .np__cd__n { font-family: var(--font-display); font-size: 26px; line-height: 1; color: #fff; }
    .np__cd__l { font-size: 9px; letter-spacing: 0.14em; text-transform: uppercase; color: rgba(255,255,255,0.5); margin-top: 4px; font-weight: 600; }

    .np__t {
      display: grid; grid-template-columns: 1fr auto 1fr; gap: 14px;
      align-items: center; padding: 18px 4px;
      border-top: 1px solid rgba(255,255,255,0.08);
      border-bottom: 1px solid rgba(255,255,255,0.08);
      margin-bottom: 14px;
      background: rgba(255,255,255,0.02);
    }
    .np__tm { text-align: center; display: flex; flex-direction: column; gap: 8px; align-items: center; }
    .np__fl {
      width: 54px; height: 54px;
      border-radius: 50%;
      background: rgba(255,255,255,0.08);
      display: grid; place-items: center;
      font-size: 32px;
      border: 2px solid rgba(255,255,255,0.18);
    }
    .np__tm--home .np__fl { border-color: rgba(2,204,116,0.5); box-shadow: 0 0 0 4px rgba(2,204,116,0.12); }
    .np__fl__ini {
      font-family: var(--font-display);
      font-size: 18px;
      letter-spacing: 0.04em;
      color: rgba(255,255,255,0.75);
      text-transform: uppercase;
    }
    .np__n { font-family: var(--font-display); font-size: 17px; line-height: 1; color: #fff; }
    .np__vs { display: flex; flex-direction: column; align-items: center; gap: 3px; }
    .np__vs__l { font-family: var(--font-display); font-size: 20px; color: var(--color-primary-green); line-height: 1; }

    .np__pk {
      display: flex; justify-content: space-between; align-items: center;
      padding: 12px 14px;
      background: linear-gradient(90deg, rgba(2,204,116,0.22), rgba(2,204,116,0.08));
      border: 1px solid rgba(2,204,116,0.45);
      border-radius: 10px;
      margin-bottom: 8px;
      text-decoration: none;
      color: inherit;
    }
    .np__pk__l { font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase; color: rgba(255,255,255,0.7); font-weight: 600; display: block; margin-bottom: 2px; }
    .np__pk strong { font-family: var(--font-display); font-size: 22px; color: #fff; display: flex; align-items: center; gap: 6px; }
    .np__pk strong em { font-style: normal; font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase; font-family: var(--font-primary); font-weight: 700; background: rgba(2,204,116,0.35); padding: 3px 8px; border-radius: 5px; }
    .np__pk__e {
      color: var(--color-primary-green);
      font-size: 11px; text-decoration: none; font-weight: 700;
      letter-spacing: 0.08em; text-transform: uppercase;
      padding: 6px 10px;
      background: rgba(2,204,116,0.15);
      border: 1px solid rgba(2,204,116,0.3);
      border-radius: 6px;
      transition: background 0.15s ease, border-color 0.15s ease;
    }
    .np__pk__e:hover { background: rgba(2,204,116,0.25); border-color: rgba(2,204,116,0.5); }
    .np__pk__e:focus-visible {
      outline: 2px solid var(--color-primary-green);
      outline-offset: 2px;
      background: rgba(2,204,116,0.25);
    }
    /* Resets para los CTAs que ahora son <button> (abren el modal de pick). */
    button.np__pk { width: 100%; box-sizing: border-box; font: inherit; cursor: pointer; text-align: left; }
    button.np__pk__e { font: inherit; cursor: pointer; }
    .np__cta {
      display: flex; align-items: center; justify-content: center; gap: 6px;
      width: 100%; padding: 10px;
      background: transparent;
      border: 1px solid rgba(255,255,255,0.15);
      border-radius: 8px;
      color: rgba(255,255,255,0.8);
      text-decoration: none;
      font-size: 11px;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      font-weight: 600;
      box-sizing: border-box;
      transition: border-color 0.15s ease, background 0.15s ease, color 0.15s ease;
    }
    .np__cta:hover { border-color: rgba(255,255,255,0.35); background: rgba(255,255,255,0.05); color: #fff; }
    .np__cta:focus-visible {
      outline: 2px solid var(--color-primary-green);
      outline-offset: 2px;
      color: #fff;
    }

    /* Upcoming picks */
    .up {
      background: #fff;
      border: 1px solid var(--color-line);
      border-radius: 14px;
      padding: 16px;
    }
    .up__h {
      font-size: 11px; letter-spacing: 0.16em; text-transform: uppercase;
      color: var(--color-text-muted);
      margin-bottom: 10px;
      display: flex; justify-content: space-between;
    }
    .up__h a { color: var(--color-primary-green); font-weight: 600; text-decoration: none; }
    .up__h__more { display: inline-flex; align-items: center; gap: 4px; }
    .up__r {
      padding: 8px 0;
      border-bottom: 1px solid rgba(0,0,0,0.06);
      text-decoration: none;
      color: inherit;
      display: flex; flex-direction: column; gap: 3px;
    }
    .up__r:last-child { border-bottom: 0; }
    /* La fila ahora es <button> (abre el modal de pick rápido). */
    button.up__r {
      background: none;
      border: 0;
      border-bottom: 1px solid rgba(0,0,0,0.06);
      width: 100%;
      box-sizing: border-box;
      font: inherit;
      cursor: pointer;
      text-align: left;
    }
    .up__r__h { display: flex; justify-content: space-between; font-size: 10px; color: var(--color-text-muted); }
    .up__r__h .ok,
    .up__r__h .pe { display: inline-flex; align-items: center; gap: 4px; font-weight: 700; }
    .up__r__h .ok { color: var(--color-primary-green); }
    .up__r__h .pe { color: #dc2626; }
    .up__r__t { font-family: var(--font-display); font-size: 13px; }
    .up__r__t.m { color: var(--color-text-muted); }

    /* News */
    .news { display: flex; flex-direction: column; gap: 10px; }
    .news__hero {
      background: #0a0a0a;
      border-radius: 12px;
      overflow: hidden;
      text-decoration: none;
      color: #fff;
      position: relative;
      aspect-ratio: 5 / 3;
      display: flex;
      align-items: end;
    }
    .news__hero img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; opacity: 0.55; }
    .news__hero::before {
      content: ""; position: absolute; inset: 0;
      background: linear-gradient(to top, rgba(0,0,0,0.95) 0%, transparent 60%);
      z-index: 1;
    }
    .news__hero__b { position: relative; z-index: 2; padding: 14px; }
    .news__hero__k { font-size: 10px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--color-primary-green); font-weight: 700; margin-bottom: 5px; }
    .news__hero__t { font-family: var(--font-display); font-size: 16px; line-height: 1.1; }
    .news__list {
      background: #fff;
      border: 1px solid var(--color-line);
      border-radius: 12px;
      padding: 4px 14px;
    }
    .news__row {
      display: flex; gap: 10px;
      padding: 11px 0;
      border-bottom: 1px solid rgba(0,0,0,0.05);
      text-decoration: none;
      color: inherit;
    }
    .news__row:last-of-type { border-bottom: 0; }
    .news__row__img {
      width: 46px; height: 46px;
      border-radius: 7px;
      background: linear-gradient(135deg, #0a3d20, #067a4a) center/cover no-repeat;
      flex-shrink: 0;
    }
    .news__row__b { flex: 1; min-width: 0; }
    .news__row__k { font-size: 9px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--color-primary-green); font-weight: 700; margin-bottom: 3px; }
    .news__row__t { font-family: var(--font-display); font-size: 13px; line-height: 1.15; }
    .news__more {
      display: flex; align-items: center; justify-content: center; gap: 6px;
      padding: 11px 0;
      text-align: center;
      font-size: 11px;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--color-primary-green);
      text-decoration: none;
      font-weight: 600;
    }

    /* ---- Rail de grupo (/groups/:id) ---- */
    .rr-card { background: var(--color-primary-white, #fff); border: 1px solid var(--color-line); border-radius: 14px; padding: 16px; }
    .rr-card__h { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 6px; }
    .rr-card__h h2 { font-size: 15px; margin: 0; }
    .rr-card__sub { font-size: 11px; color: var(--color-text-muted); letter-spacing: .06em; text-transform: uppercase; margin-bottom: 4px; }
    .rr-demo { font-size: 9px; letter-spacing: .1em; text-transform: uppercase; font-weight: 700; color: var(--color-text-muted); background: rgba(0,0,0,0.06); padding: 2px 7px; border-radius: 999px; flex-shrink: 0; }
    .rr-champ { display: flex; align-items: center; gap: 10px; padding: 7px 0; font-size: 13px; }
    .rr-champ__f { width: 26px; text-align: center; flex-shrink: 0; }
    .rr-champ__f .fi { width: 20px; height: 14px; border-radius: 2px; display: inline-block; background-size: cover; background-position: center; }
    .rr-champ__b { flex: 1; min-width: 0; }
    .rr-champ__n { font-weight: 600; }
    .rr-champ__bar { height: 8px; background: #f0efe9; border-radius: 999px; overflow: hidden; margin-top: 3px; }
    .rr-champ__bar i { display: block; height: 100%; background: var(--color-primary-green); border-radius: 999px; }
    .rr-champ__v { font-size: 12px; color: var(--color-text-muted); width: 54px; text-align: right; font-variant-numeric: tabular-nums; flex-shrink: 0; }
    .rr-act { display: flex; gap: 11px; padding: 11px 0; border-bottom: 1px solid var(--color-line); font-size: 13px; align-items: flex-start; }
    .rr-act:last-child { border-bottom: 0; }
    .rr-act__i { width: 30px; height: 30px; border-radius: 8px; background: rgba(2,204,116,0.12); color: var(--color-primary-green); display: grid; place-items: center; flex-shrink: 0; }
    .rr-act__t { line-height: 1.35; }
    .rr-act__time { font-size: 11px; color: var(--color-text-muted); margin-top: 2px; }
  `],
})
export class RightRailComponent implements OnInit, OnDestroy {
  private api = inject(ApiService);
  private auth = inject(AuthService);
  private router = inject(Router);
  private quickPick = inject(QuickPickModalService);
  private golganaEditorial = inject(GolganaEditorialService);

  readonly newsHubUrl = NEWS_HUB_URL;

  /** Abre el modal de pick rápido para el próximo partido (card del rail). */
  openQuickPickNext() {
    const m = this.nextMatch();
    if (!m) return;
    this.quickPick.open({
      matchId: m.id,
      homeName: m.homeName,
      awayName: m.awayName,
      homeFlag: m.homeFlag,
      awayFlag: m.awayFlag,
      homeInitials: m.homeInitials,
      awayInitials: m.awayInitials,
      kickoffAt: m.kickoffAt,
      pick: m.myPick ? { home: m.myPick.home, away: m.myPick.away } : null,
    });
  }

  /** Abre el modal de pick rápido para una fila de "Siguientes picks". */
  openQuickPickRow(r: UpcomingPickRow) {
    this.quickPick.open({
      matchId: r.id,
      homeName: r.homeName,
      awayName: r.awayName,
      homeFlag: r.homeFlag,
      awayFlag: r.awayFlag,
      homeInitials: r.homeInitials,
      awayInitials: r.awayInitials,
      kickoffAt: r.kickoffAt,
      pick: r.pick,
    });
  }

  /** True SOLO en la tab Cronológico (URL exacta /picks). Ahí el próximo
   *  partido y los siguientes picks viven en el componente principal, así que
   *  el rail los oculta y deja sólo el bloque editorial. */
  onPicksPage = signal(false);
  /** True en el detalle de un grupo (/groups/:id). Ahí el rail global se
   *  reemplaza por el rail del grupo: ¿a quién le va? + actividad + próximo
   *  partido (oculta upcoming picks y noticias). */
  onGroupDetail = signal(false);
  private routerSub?: Subscription;

  /** Distribución real de picks de campeón del grupo, desde el resolver
   *  server-side groupChampionDistribution(groupId). Se carga al entrar a
   *  /groups/:id y se limpia al salir. La card se oculta si queda vacía. */
  champDist = signal<Array<{ flag: string; name: string; count: number; pct: number }>>([]);

  /** Datos de EJEMPLO para la card de actividad del rail de grupo. El feed de
   *  actividad no existe en backend, así que se muestra como demo hasta que
   *  haya un agregado server-side. Marcado con el badge "Ejemplo". */
  readonly demoActivity: ReadonlyArray<{ icon: IconName; text: string; time: string }> = [
    { icon: 'check', text: '@andrea_m acertó un marcador exacto', time: 'hace 2 h' },
    { icon: 'zap', text: '@carlos23 usó un comodín ×2', time: 'hace 5 h' },
    { icon: 'users', text: '@juancho se unió al grupo', time: 'ayer' },
    { icon: 'trophy', text: 'Tomaste el 1° lugar del grupo', time: 'ayer' },
  ];

  nextMatch = signal<NextMatchVm | null>(null);
  upcoming = signal<UpcomingPickRow[]>([]);
  newsHero = signal<NewsItemVm | null>(null);
  newsList = signal<NewsItemVm[]>([]);

  loadingNext = signal(true);
  loadingUpcoming = signal(true);
  loadingNews = signal(true);

  private tickerId?: ReturnType<typeof setInterval>;
  private rawNext: { kickoffAt: string } | null = null;

  async ngOnInit() {
    this.applyRoute(this.router.url);
    this.routerSub = this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe((e) => this.applyRoute(e.urlAfterRedirects));

    // TODO(A6): replace these parallel calls (listMatches + listTeams +
    // myPicks + listPublishedArticles + N×getUrl) with single
    // getMyRightRail() call when polla-backend lambda deployed.
    void this.loadNextAndUpcoming();
    void this.loadNews();
    this.tickerId = setInterval(() => this.refreshCountdown(), 1000);
  }

  ngOnDestroy(): void {
    if (this.tickerId) clearInterval(this.tickerId);
    this.routerSub?.unsubscribe();
  }

  /** SOLO la tab Cronológico (URL exacta /picks): ahí el componente principal
   *  ya muestra el .nm próximo-partido + la lista, así que el rail los oculta.
   *  En group-stage, bracket, match/:id y el resto de pantallas el rail
   *  conserva ambos bloques. */
  private isPicksUrl(url: string): boolean {
    const path = url.split('?')[0]?.split('#')[0] ?? '';
    return path === '/picks';
  }

  /** /groups/:id exacto (detalle). Excluye /groups y subrutas como
   *  /groups/:id/edit · invite · prizes. */
  private isGroupDetailUrl(url: string): boolean {
    const path = url.split('?')[0]?.split('#')[0] ?? '';
    return /^\/groups\/[^/]+$/.test(path);
  }

  private applyRoute(url: string): void {
    this.onPicksPage.set(this.isPicksUrl(url));
    const onGroup = this.isGroupDetailUrl(url);
    this.onGroupDetail.set(onGroup);
    if (onGroup) {
      const id = (url.split('?')[0].split('#')[0].split('/')[2] ?? '');
      if (id) void this.loadChampDist(id);
    } else {
      this.champDist.set([]);
    }
  }

  private async loadChampDist(groupId: string) {
    try {
      const res = await this.api.groupChampionDistribution(groupId);
      this.champDist.set(((res.data ?? []) as Array<{ teamName: string; flagCode: string; count: number; pct: number }>)
        .map((r) => ({ flag: (r.flagCode || '').toLowerCase(), name: r.teamName, count: r.count, pct: r.pct })));
    } catch (e) { console.warn('[right-rail] champ dist failed', e); this.champDist.set([]); }
  }

  private async loadNextAndUpcoming() {
    const userId = this.auth.user()?.sub ?? '';
    try {
      // Matches + teams son lecturas públicas (apiKey). myPicks es Cognito y
      // puede fallar/estar vacío; va aparte para que un fallo suyo NO borre
      // los partidos reales del rail.
      const [matchesRes, teamsRes] = await Promise.all([
        this.api.listMatches(TOURNAMENT_ID),
        this.api.listTeams(TOURNAMENT_ID),
      ]);
      let picksRes: { data: ReadonlyArray<{ matchId: string; homeScorePred: number; awayScorePred: number }> } = { data: [] };
      if (userId) {
        try {
          picksRes = await this.api.myPicks(userId) as typeof picksRes;
        } catch (e) {
          console.warn('[right-rail] myPicks failed (rail still shows matches)', e);
        }
      }

      const teamMap = new Map<string, { name: string; flag: string }>();
      for (const t of (teamsRes.data ?? [])) {
        if (t?.slug) teamMap.set(t.slug, { name: t.name ?? t.slug, flag: t.flagCode ?? '' });
      }
      const pickMap = new Map<string, { home: number; away: number }>();
      for (const p of ((picksRes.data ?? []) as ReadonlyArray<{ matchId: string; homeScorePred: number; awayScorePred: number } | null>)) {
        // Amplify puede devolver items null (filas que fallan auth a nivel de
        // campo vienen como null + error). Sin este guard, p.matchId revienta
        // y tumba toda la carga del rail.
        if (!p?.matchId) continue;
        pickMap.set(p.matchId, { home: p.homeScorePred, away: p.awayScorePred });
      }

      const now = Date.now();
      type MRow = {
        id: string;
        kickoffAt: string;
        homeTeamId: string;
        awayTeamId: string;
        status?: string | null;
        venue?: string | null;
      };
      const all = ((matchesRes.data ?? []) as ReadonlyArray<MRow>)
        .filter((m): m is MRow => !!m?.id && !!m?.kickoffAt)
        .filter((m) => new Date(m.kickoffAt).getTime() > now - 2 * 3600 * 1000)
        .sort((a, b) => new Date(a.kickoffAt).getTime() - new Date(b.kickoffAt).getTime());

      const first = all[0];
      if (first) {
        const ko = new Date(first.kickoffAt);
        const home = teamMap.get(first.homeTeamId) ?? { name: first.homeTeamId, flag: '' };
        const away = teamMap.get(first.awayTeamId) ?? { name: first.awayTeamId, flag: '' };
        const myPick = pickMap.get(first.id);
        const koMs = ko.getTime();
        const diff = koMs - now;
        const statusLive = first.status === 'IN_PROGRESS' || first.status === 'LIVE';
        // EN VIVO if backend status says so OR kickoff pasó (< 2h grace ya
        // filtró ese arriba, así que diff<0 indica match in-progress).
        const isLive = statusLive || diff < 0;
        const isStartingNow = !isLive && diff <= 0;
        let winnerName: string | null = null;
        if (myPick) {
          if (myPick.home > myPick.away) winnerName = home.name;
          else if (myPick.away > myPick.home) winnerName = away.name;
        }
        this.rawNext = { kickoffAt: first.kickoffAt };
        this.nextMatch.set({
          id: first.id,
          homeName: home.name,
          awayName: away.name,
          homeFlag: home.flag,
          awayFlag: away.flag,
          homeInitials: this.initials(home.name),
          awayInitials: this.initials(away.name),
          kickoffAt: first.kickoffAt,
          venue: first.venue ?? null,
          phaseLabel: 'Mundial 2026',
          countdown: isLive || isStartingNow ? null : this.computeCountdown(koMs, now),
          isLive,
          isStartingNow,
          myPick: myPick ? { home: myPick.home, away: myPick.away, winnerName } : null,
        });
      }

      const upcomingRows: UpcomingPickRow[] = all.slice(1, 5).map((m) => {
        const ko = new Date(m.kickoffAt);
        const home = teamMap.get(m.homeTeamId) ?? { name: m.homeTeamId, flag: '' };
        const away = teamMap.get(m.awayTeamId) ?? { name: m.awayTeamId, flag: '' };
        const myPick = pickMap.get(m.id);
        return {
          id: m.id,
          dateLabel: this.formatShortDate(ko),
          matchLabel: `${this.shortCode(home.name)} vs ${this.shortCode(away.name)}`,
          hasPick: !!myPick,
          pickLabel: myPick
            ? `${myPick.home}-${myPick.away} ${myPick.home >= myPick.away ? home.name : away.name}`
            : null,
          countdownLabel: !myPick ? this.formatCountdownLabel(ko.getTime() - Date.now()) : null,
          homeName: home.name,
          awayName: away.name,
          homeFlag: home.flag,
          awayFlag: away.flag,
          homeInitials: this.initials(home.name),
          awayInitials: this.initials(away.name),
          kickoffAt: m.kickoffAt,
          pick: myPick ? { home: myPick.home, away: myPick.away } : null,
        };
      });
      this.upcoming.set(upcomingRows);
    } catch (e) {
      console.warn('[right-rail] load next/upcoming failed', e);
    }
    // Sin partidos cargados → nextMatch/upcoming quedan vacíos y los bloques
    // se ocultan (ver @if del template). Ya no sembramos mocks: el rail
    // refleja exactamente los partidos reales del torneo.
    this.loadingNext.set(false);
    this.loadingUpcoming.set(false);
  }

  /** Noticias desde golgana (fuente canónica del contenido editorial). */
  private async loadNews() {
    let enriched: NewsItemVm[] = [];
    try {
      const noticias = await this.golganaEditorial.listNoticias(4);
      enriched = noticias.map((n) => ({
        id: n.slug,
        title: n.title,
        externalUrl: n.url,
        resolvedImageUrl: n.imageUrl,
        relativeTime: this.formatRelative(n.publishedAt),
      }));
    } catch (e) {
      // Si golgana no responde, el bloque editorial queda oculto (sin mock).
      console.warn('[right-rail] golgana editorial failed', e);
    }
    this.newsHero.set(enriched[0] ?? null);
    this.newsList.set(enriched.slice(1));
    this.loadingNews.set(false);
  }

  private refreshCountdown() {
    if (!this.rawNext) return;
    const ko = new Date(this.rawNext.kickoffAt).getTime();
    const now = Date.now();
    const cur = this.nextMatch();
    if (!cur) return;
    if (cur.isLive) return;
    const diff = ko - now;
    // Transition states cuando el ticker cruza el kickoff:
    // diff <= 0  → "Empieza ya" (sin countdown numérico)
    // diff < -60s → asumimos kickoff hace rato → "EN VIVO"
    if (diff <= 0) {
      const isLive = diff < -60_000;
      const isStartingNow = !isLive;
      if (cur.isLive !== isLive || cur.isStartingNow !== isStartingNow || cur.countdown !== null) {
        this.nextMatch.set({ ...cur, countdown: null, isLive, isStartingNow });
      }
      return;
    }
    this.nextMatch.set({ ...cur, countdown: this.computeCountdown(ko, now) });
  }

  private computeCountdown(targetMs: number, nowMs: number) {
    const diff = Math.max(0, targetMs - nowMs);
    const d = Math.floor(diff / 86_400_000);
    const h = Math.floor((diff % 86_400_000) / 3_600_000);
    const m = Math.floor((diff % 3_600_000) / 60_000);
    const s = Math.floor((diff % 60_000) / 1000);
    const p2 = (n: number) => (n < 10 ? '0' : '') + n;
    return { d: p2(d), h: p2(h), m: p2(m), s: p2(s) };
  }

  /** 2-letter uppercase initials para flag fallback. Strips non-letters,
   *  toma primera letra de las primeras dos palabras o las primeras dos
   *  letras si es una sola palabra. */
  private initials(name: string): string {
    const clean = (name ?? '').trim();
    if (!clean) return '??';
    const parts = clean.split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return clean.slice(0, 2).toUpperCase();
  }

  private static readonly shortDateFmt = new Intl.DateTimeFormat('es-EC', {
    timeZone: 'America/Guayaquil',
    day: '2-digit',
    month: '2-digit',
  });
  private static readonly fallbackDateFmt = new Intl.DateTimeFormat('es-EC', {
    timeZone: 'America/Guayaquil',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
  private static readonly relativeFmt = new Intl.RelativeTimeFormat('es-EC', {
    numeric: 'auto',
    style: 'long',
  });

  private formatShortDate(d: Date): string {
    return RightRailComponent.shortDateFmt.format(d);
  }

  /** 3-letter uppercase shortcode (used in "ARG vs BRA" labels). */
  private shortCode(name: string): string {
    return name.slice(0, 3).toUpperCase();
  }

  private formatCountdownLabel(diffMs: number): string {
    if (diffMs < 0) return 'cerrado';
    const minutes = Math.round(diffMs / 60_000);
    if (minutes < 60) return RightRailComponent.relativeFmt.format(minutes, 'minute');
    const hours = Math.round(diffMs / 3_600_000);
    if (hours < 24) return RightRailComponent.relativeFmt.format(hours, 'hour');
    return RightRailComponent.relativeFmt.format(Math.round(hours / 24), 'day');
  }

  private formatRelative(iso: string): string {
    const diff = new Date(iso).getTime() - Date.now();
    const minutes = Math.round(diff / 60_000);
    if (Math.abs(minutes) < 60) return RightRailComponent.relativeFmt.format(minutes, 'minute');
    const hours = Math.round(diff / 3_600_000);
    if (Math.abs(hours) < 24) return RightRailComponent.relativeFmt.format(hours, 'hour');
    const days = Math.round(hours / 24);
    if (Math.abs(days) < 7) return RightRailComponent.relativeFmt.format(days, 'day');
    return RightRailComponent.fallbackDateFmt.format(new Date(iso));
  }
}
