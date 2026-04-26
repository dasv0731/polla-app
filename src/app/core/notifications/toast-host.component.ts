import { Component, inject } from '@angular/core';
import { ToastService } from './toast.service';

@Component({
  standalone: true,
  selector: 'app-toast-host',
  template: `
    <div class="toast-host" role="region" aria-live="polite">
      @for (t of toast.toasts(); track t.id) {
        <div class="toast" [attr.data-level]="t.level">
          <span class="toast__msg">{{ t.message }}</span>
          <button class="toast__close" (click)="toast.dismiss(t.id)" aria-label="cerrar">×</button>
        </div>
      }
    </div>
  `,
})
export class ToastHostComponent {
  toast = inject(ToastService);
}
