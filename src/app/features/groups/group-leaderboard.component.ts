import { Component, Input } from '@angular/core';

export interface LeaderboardRow {
  userId: string;
  handle: string;
  points: number;
  exactCount: number;
  resultCount: number;
}

@Component({
  standalone: true,
  selector: 'app-group-leaderboard',
  template: `
    <table class="standings standings--group">
      <thead>
        <tr>
          <th>#</th>
          <th>Jugador</th>
          <th class="numeric">Pts</th>
          <th class="numeric">Exactos</th>
          <th class="numeric">Resultados</th>
        </tr>
      </thead>
      <tbody>
        @for (row of rows; track row.userId; let i = $index) {
          <tr [class.is-me]="row.userId === currentUserId">
            <td>{{ i + 1 }}</td>
            <td>{{ '@' + row.handle }}</td>
            <td class="numeric">{{ row.points }}</td>
            <td class="numeric">{{ row.exactCount }}</td>
            <td class="numeric">{{ row.resultCount }}</td>
          </tr>
        }
      </tbody>
    </table>
  `,
})
export class GroupLeaderboardComponent {
  @Input({ required: true }) rows: LeaderboardRow[] = [];
  @Input() currentUserId = '';
}
