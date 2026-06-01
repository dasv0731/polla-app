import { Component, OnInit, inject, signal } from '@angular/core';
import { ApiService } from '../../core/api/api.service';
import { AuthService } from '../../core/auth/auth.service';
import { ToastService } from '../../core/notifications/toast.service';
import { humanizeError } from '../../core/notifications/domain-errors';

interface Row { userId: string; handle: string; points: number; department: string }
interface Dept { groupId: string; name: string; points: number; members: number }
interface Reto {
  id: string;
  prompt: string;
  optionA: string; optionB: string; optionC: string; optionD: string;
  points: number;
  answered: boolean;
}

@Component({
  standalone: true,
  selector: 'app-mi-empresa',
  template: `
    <section class="page" [style.--pa-brand]="brand()">
      <header class="page__header">
        <div>
          <div class="kicker" style="color: var(--pa-brand)">MI EMPRESA</div>
          <h1 class="page__title">Mi empresa</h1>
        </div>
      </header>

      @if (loading()) {
        <p class="text-mute">Cargando…</p>
      } @else if (!companyId()) {
        <div class="me-empty">
          <strong>No perteneces a ninguna empresa todavía</strong>
          <p class="text-mute">Cuando te unas a un departamento, verás aquí los rankings.</p>
        </div>
      } @else {
        <div class="me-card">
          <h2 class="me-card__title">🏆 Ranking de la empresa</h2>
          @if (individual().length === 0) {
            <p class="text-mute">Sin datos todavía.</p>
          } @else {
            <table class="me-table">
              <thead>
                <tr><th>#</th><th>Empleado</th><th>Departamento</th><th class="me-table__num">Pts</th></tr>
              </thead>
              <tbody>
                @for (r of individual(); track r.userId; let i = $index) {
                  <tr>
                    <td><span class="me-rank" [class.me-rank--top]="i < 3">{{ i + 1 }}</span></td>
                    <td>{{ r.handle }}</td>
                    <td class="text-mute">{{ r.department }}</td>
                    <td class="me-table__num"><strong>{{ r.points }}</strong></td>
                  </tr>
                }
              </tbody>
            </table>
          }
        </div>

        <div class="me-card">
          <h2 class="me-card__title">🏟️ Por departamento</h2>
          @if (departments().length === 0) {
            <p class="text-mute">Sin datos todavía.</p>
          } @else {
            <table class="me-table">
              <thead>
                <tr><th>#</th><th>Departamento</th><th class="me-table__num">Pts</th><th class="me-table__num">Miembros</th></tr>
              </thead>
              <tbody>
                @for (d of departments(); track d.groupId; let i = $index) {
                  <tr>
                    <td><span class="me-rank" [class.me-rank--top]="i < 3">{{ i + 1 }}</span></td>
                    <td>{{ d.name }}</td>
                    <td class="me-table__num"><strong>{{ d.points }}</strong></td>
                    <td class="me-table__num text-mute">{{ d.members }}</td>
                  </tr>
                }
              </tbody>
            </table>
          }
        </div>

        <div class="me-card">
          <h2 class="me-card__title">🎯 Retos</h2>
          @if (retos().length === 0) {
            <p class="text-mute">No hay retos abiertos.</p>
          } @else {
            <ul class="me-retos" role="list">
              @for (q of retos(); track q.id) {
                <li class="me-reto">
                  <div class="me-reto__head">
                    <strong class="me-reto__prompt">{{ q.prompt }}</strong>
                    <span class="pill pill--green">{{ q.points }} pts</span>
                  </div>
                  <div class="me-reto__opts">
                    <button type="button" class="btn-wf me-reto__opt" [disabled]="answering() === q.id"
                            (click)="answer(q.id, 'A')"><b>A.</b> {{ q.optionA }}</button>
                    <button type="button" class="btn-wf me-reto__opt" [disabled]="answering() === q.id"
                            (click)="answer(q.id, 'B')"><b>B.</b> {{ q.optionB }}</button>
                    <button type="button" class="btn-wf me-reto__opt" [disabled]="answering() === q.id"
                            (click)="answer(q.id, 'C')"><b>C.</b> {{ q.optionC }}</button>
                    <button type="button" class="btn-wf me-reto__opt" [disabled]="answering() === q.id"
                            (click)="answer(q.id, 'D')"><b>D.</b> {{ q.optionD }}</button>
                  </div>
                </li>
              }
            </ul>
          }
        </div>
      }
    </section>
  `,
  styles: [`
    :host { display: block; }
    .me-card {
      background: var(--color-primary-white);
      border: 1px solid var(--wf-line); border-radius: 12px;
      padding: 18px; margin-bottom: 16px;
    }
    .me-card__title { font-size: 16px; margin: 0 0 12px; }
    .me-table { width: 100%; border-collapse: collapse; font-size: 14px; }
    .me-table th {
      text-align: left; font-size: 11px; font-weight: 600;
      text-transform: uppercase; letter-spacing: .06em; color: var(--wf-ink-3);
      padding: 0 10px 8px; border-bottom: 1px solid var(--wf-line-2);
    }
    .me-table td { padding: 10px; border-bottom: 1px solid var(--wf-line-2); }
    .me-table tbody tr:last-child td { border-bottom: 0; }
    .me-table__num { text-align: right; }
    .me-rank {
      display: inline-flex; align-items: center; justify-content: center;
      width: 24px; height: 24px; border-radius: 999px;
      background: var(--wf-fill); color: var(--wf-ink-2); font-size: 12px; font-weight: 700;
    }
    .me-rank--top { background: var(--pa-brand, var(--wf-green)); color: #fff; }
    .me-empty {
      background: var(--color-primary-white); border: 1px dashed var(--wf-line);
      border-radius: 12px; padding: 28px; text-align: center;
    }
    .me-empty > strong { display: block; margin-bottom: 6px; font-size: 15px; }
    .me-empty > p { margin: 0; }
    .me-retos { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 12px; }
    .me-reto { border: 1px solid var(--wf-line-2); border-radius: 12px; padding: 14px 16px; }
    .me-reto__head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 10px; }
    .me-reto__prompt { font-size: 15px; }
    .me-reto__opts { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 8px; }
    .me-reto__opt { justify-content: flex-start; text-align: left; }
    .me-reto__opt b { color: var(--wf-ink-3); margin-right: 6px; }
    .me-reto__opt:not(:disabled):hover { border-color: var(--pa-brand, var(--wf-green)); }
  `],
})
export class MiEmpresaComponent implements OnInit {
  private api = inject(ApiService);
  private auth = inject(AuthService);
  private toast = inject(ToastService);

  companyId = signal<string | null>(null);
  individual = signal<Row[]>([]);
  departments = signal<Dept[]>([]);
  retos = signal<Reto[]>([]);
  answering = signal<string | null>(null);
  brand = signal<string>('#e23744');
  loading = signal(true);

  async ngOnInit() {
    const u = this.auth.user();
    if (!u) { this.loading.set(false); return; }
    const cid = await this.api.findMyCompanyId(u.sub);
    this.companyId.set(cid);
    if (cid) {
      const c = (await this.api.getCompany(cid)).data as { brandPrimary?: string | null } | null;
      if (c?.brandPrimary) this.brand.set(c.brandPrimary);
      await this.loadRanking(cid);
      await this.loadRetos(cid);
    }
    this.loading.set(false);
  }

  private async loadRanking(cid: string) {
    const res = await this.api.companyRanking(cid);
    this.individual.set(res.data?.individual ?? []);
    this.departments.set(res.data?.departments ?? []);
  }

  private async loadRetos(cid: string) {
    const res = await this.api.listOpenCompanyTrivia(cid);
    const open = (res.data ?? []).filter((q) => q.answered === false);
    this.retos.set(open as Reto[]);
  }

  async answer(questionId: string, selectedOption: 'A' | 'B' | 'C' | 'D') {
    if (this.answering()) return;
    this.answering.set(questionId);
    try {
      const res = await this.api.answerCompanyTrivia({ questionId, selectedOption });
      const r = res.data;
      if (r?.isCorrect) {
        this.toast.success(`¡Correcto! +${r.pointsEarned} pts`);
      } else {
        this.toast.info('Incorrecto');
      }
      const cid = this.companyId();
      if (cid) {
        await this.loadRetos(cid);
        await this.loadRanking(cid);
      }
    } catch (e) {
      this.toast.error(humanizeError(e));
    } finally {
      this.answering.set(null);
    }
  }
}
