import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class TimeService {
  private fmt = new Intl.DateTimeFormat('es-EC', {
    timeZone: 'America/Guayaquil',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  formatKickoff(iso: string): string {
    return this.fmt.format(new Date(iso));
  }

  timeUntil(iso: string): string {
    const ms = Date.parse(iso) - Date.now();
    if (ms <= 0) return 'Cerrado';
    const totalMin = Math.floor(ms / 60000);
    const hours = Math.floor(totalMin / 60);
    const mins = totalMin % 60;
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
  }

  isPast(iso: string): boolean {
    return Date.parse(iso) <= Date.now();
  }
}
