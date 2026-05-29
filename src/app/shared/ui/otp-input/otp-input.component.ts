import {
  Component, ElementRef, EventEmitter, Output, QueryList, ViewChildren,
  computed, signal,
} from '@angular/core';

/**
 * `<app-otp-input (complete)="onComplete($event)">` — Input de 6 dígitos
 * para OTP (Cognito confirmation + forgot-password reset).
 *
 * Extrae la lógica duplicada que vivía idéntica en register + forgot:
 *  - 6 inputs single-char con autocomplete="one-time-code"
 *  - Auto-focus al siguiente cuando se escribe un dígito
 *  - Backspace retrocede focus si el dígito actual está vacío
 *  - Paste de 6 dígitos los reparte y enfoca el último
 *
 * Emite `(complete)` cuando los 6 dígitos están llenos. El padre puede
 * usar esto para auto-submit del flow.
 *
 * El estado del código es interno (`digits` signal). El padre lee via
 * el `complete` event — no necesita two-way binding.
 */
@Component({
  standalone: true,
  selector: 'app-otp-input',
  template: `
    <div class="otp">
      @for (i of indices; track i) {
        <input
          #otpInput
          class="otp__d"
          maxlength="1"
          inputmode="numeric"
          autocomplete="one-time-code"
          [attr.name]="'otp-' + (i + 1)"
          placeholder="—"
          [attr.aria-label]="'Dígito ' + (i + 1)"
          [value]="digits()[i]"
          (input)="onInput($event, i)"
          (keydown)="onKey($event, i)"
          (paste)="onPaste($event)">
      }
    </div>
  `,
})
export class OtpInputComponent {
  readonly indices = [0, 1, 2, 3, 4, 5];
  digits = signal<string[]>(['', '', '', '', '', '']);
  code = computed(() => this.digits().join(''));

  /** Se emite cuando los 6 dígitos están llenos. El padre típicamente
   *  auto-dispara el submit en este event. */
  @Output() complete = new EventEmitter<string>();

  @ViewChildren('otpInput') refs?: QueryList<ElementRef<HTMLInputElement>>;

  /** Resetea visualmente todos los inputs. Útil tras error de OTP para
   *  que el user vuelva a tipear desde 0 sin tener que borrar manual. */
  reset(): void {
    this.digits.set(['', '', '', '', '', '']);
    setTimeout(() => this.refs?.toArray()[0]?.nativeElement.focus(), 0);
  }

  onInput(event: Event, idx: number) {
    const input = event.target as HTMLInputElement;
    const v = input.value.replace(/\D/g, '').slice(0, 1);
    const arr = [...this.digits()];
    arr[idx] = v;
    this.digits.set(arr);
    input.value = v;
    if (v && idx < 5) {
      this.refs?.toArray()[idx + 1]?.nativeElement.focus();
    }
    this.checkComplete();
  }

  onKey(event: KeyboardEvent, idx: number) {
    if (event.key === 'Backspace' && !this.digits()[idx] && idx > 0) {
      this.refs?.toArray()[idx - 1]?.nativeElement.focus();
    }
  }

  onPaste(event: ClipboardEvent) {
    event.preventDefault();
    const text = event.clipboardData?.getData('text') ?? '';
    const digits = text.replace(/\D/g, '').slice(0, 6).split('');
    if (digits.length === 0) return;
    const arr = ['', '', '', '', '', ''];
    digits.forEach((d, i) => arr[i] = d);
    this.digits.set(arr);
    const lastIdx = Math.min(digits.length, 5);
    setTimeout(() => this.refs?.toArray()[lastIdx]?.nativeElement.focus(), 0);
    this.checkComplete();
  }

  private checkComplete() {
    if (this.code().length === 6) {
      this.complete.emit(this.code());
    }
  }
}
