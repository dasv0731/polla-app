import { Component, Input } from '@angular/core';
import { UserAvatarComponent } from '../../shared/user-avatar/user-avatar.component';

export interface LeaderboardRow {
  userId: string;
  handle: string;
  /** Storage key del avatar. Optional — fallback a iniciales si null. */
  avatarKey?: string | null;
  points: number;
  exactCount: number;
  resultCount: number;
}

@Component({
  standalone: true,
  selector: 'app-group-leaderboard',
  imports: [UserAvatarComponent],
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
            <td>
              <span style="display:inline-flex;align-items:center;gap:8px;">
                <app-user-avatar
                  [sub]="row.userId"
                  [handle]="row.handle"
                  [avatarKey]="row.avatarKey"
                  size="sm" />
                {{ '@' + row.handle }}
              </span>
            </td>
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
