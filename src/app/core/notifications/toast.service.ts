import { Injectable, signal } from '@angular/core';

export interface Toast {
  id: number;
  level: 'info' | 'success' | 'error';
  message: string;
}

// Minimal toast stub — picks/groups consume info()/success()/error() now.
// Visual toast UI (T30) will replace the console fallback once wired.
@Injectable({ providedIn: 'root' })
export class ToastService {
  private nextId = 1;
  toasts = signal<Toast[]>([]);

  info(message: string) { this.push('info', message); }
  success(message: string) { this.push('success', message); }
  error(message: string) { this.push('error', message); }

  dismiss(id: number) {
    this.toasts.update((arr) => arr.filter((t) => t.id !== id));
  }

  private push(level: Toast['level'], message: string) {
    const id = this.nextId++;
    this.toasts.update((arr) => [...arr, { id, level, message }]);
    // eslint-disable-next-line no-console
    console[level === 'error' ? 'error' : 'log'](`[toast:${level}] ${message}`);
    setTimeout(() => this.dismiss(id), 5000);
  }
}
