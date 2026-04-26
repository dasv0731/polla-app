import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../../core/api/api.service';
import { AuthService } from '../../core/auth/auth.service';

const TOURNAMENT_ID = 'mundial-2026';

interface Totals {
  points: number;
  exactCount: number;
  resultCount: number;
}

@Component({
  standalone: true,
  selector: 'app-profile',
  imports: [RouterLink],
  template: `
    <section class="container">
      @let u = user();
      @if (u !== null) {
        <header class="profile__header">
          <h1>{{ '@' + u.handle }}</h1>
          <p class="profile__email">{{ u.email }}</p>
        </header>

        <article class="profile__totals">
          <div class="profile__stat">
            <span class="profile__stat-value">{{ totals()?.points ?? 0 }}</span>
            <span class="profile__stat-label">puntos</span>
          </div>
          <div class="profile__stat">
            <span class="profile__stat-value">{{ totals()?.exactCount ?? 0 }}</span>
            <span class="profile__stat-label">marcadores exactos</span>
          </div>
          <div class="profile__stat">
            <span class="profile__stat-value">{{ totals()?.resultCount ?? 0 }}</span>
            <span class="profile__stat-label">resultados acertados</span>
          </div>
        </article>

        <nav class="profile__actions">
          <a class="btn btn--ghost" routerLink="/profile/special-picks">Picks especiales</a>
          <button class="btn btn--danger" (click)="logout()">Cerrar sesión</button>
        </nav>
      }
    </section>
  `,
})
export class ProfileComponent implements OnInit {
  private auth = inject(AuthService);
  private api = inject(ApiService);
  private router = inject(Router);

  user = computed(() => this.auth.user());
  totals = signal<Totals | null>(null);

  async ngOnInit() {
    const u = this.user();
    if (!u) return;
    try {
      const t = await this.api.myTotal(u.sub, TOURNAMENT_ID);
      const row = (t.data ?? [])[0];
      if (row) {
        this.totals.set({
          points: row.points ?? 0,
          exactCount: row.exactCount ?? 0,
          resultCount: row.resultCount ?? 0,
        });
      }
    } catch {
      // silent — totals is optional
    }
  }

  async logout() {
    await this.auth.logout();
    void this.router.navigate(['/login']);
  }
}
