import { ComponentFixture, TestBed } from '@angular/core/testing';
import { OtpInputComponent } from './otp-input.component';

describe('OtpInputComponent', () => {
  let fixture: ComponentFixture<OtpInputComponent>;
  let component: OtpInputComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [OtpInputComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(OtpInputComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('renders 6 digit inputs with one-time-code autocomplete + aria-labels', () => {
    const inputs = fixture.nativeElement.querySelectorAll('.otp__d');
    expect(inputs.length).toBe(6);
    inputs.forEach((input: HTMLInputElement, i: number) => {
      expect(input.getAttribute('autocomplete')).toBe('one-time-code');
      expect(input.getAttribute('inputmode')).toBe('numeric');
      expect(input.getAttribute('maxlength')).toBe('1');
      expect(input.getAttribute('aria-label')).toBe(`Dígito ${i + 1}`);
    });
  });

  it('input writes digit + advances focus', () => {
    const inputs = fixture.nativeElement.querySelectorAll('.otp__d') as NodeListOf<HTMLInputElement>;
    inputs[0].value = '1';
    inputs[0].dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(component.digits()[0]).toBe('1');
    expect(document.activeElement).toBe(inputs[1]);
  });

  it('backspace on empty digit retreats focus to previous', () => {
    const inputs = fixture.nativeElement.querySelectorAll('.otp__d') as NodeListOf<HTMLInputElement>;
    // simulate that idx 0 has a digit, idx 1 is empty and user backspaces
    inputs[0].value = '1';
    inputs[0].dispatchEvent(new Event('input'));
    fixture.detectChanges();
    // focus now on idx 1
    inputs[1].focus();
    const ev = new KeyboardEvent('keydown', { key: 'Backspace' });
    inputs[1].dispatchEvent(ev);
    fixture.detectChanges();
    expect(document.activeElement).toBe(inputs[0]);
  });

  it('emits complete with code when 6 digits filled via input', () => {
    let emitted: string | null = null;
    component.complete.subscribe((c) => (emitted = c));
    const inputs = fixture.nativeElement.querySelectorAll('.otp__d') as NodeListOf<HTMLInputElement>;
    ['1', '2', '3', '4', '5', '6'].forEach((d, i) => {
      inputs[i].value = d;
      inputs[i].dispatchEvent(new Event('input'));
    });
    fixture.detectChanges();
    expect(emitted).toBe('123456');
  });

  it('paste 6 digits fills all inputs + emits complete', () => {
    let emitted: string | null = null;
    component.complete.subscribe((c) => (emitted = c));
    const inputs = fixture.nativeElement.querySelectorAll('.otp__d') as NodeListOf<HTMLInputElement>;
    // jsdom doesn't implement DataTransfer; fake it on a plain Event
    const pasteEv = new Event('paste') as ClipboardEvent;
    Object.defineProperty(pasteEv, 'clipboardData', {
      value: { getData: (_: string) => '654321' },
    });
    inputs[0].dispatchEvent(pasteEv);
    fixture.detectChanges();
    expect(component.digits()).toEqual(['6', '5', '4', '3', '2', '1']);
    expect(emitted).toBe('654321');
  });

  it('paste with non-digit chars strips them', () => {
    const inputs = fixture.nativeElement.querySelectorAll('.otp__d') as NodeListOf<HTMLInputElement>;
    const pasteEv = new Event('paste') as ClipboardEvent;
    Object.defineProperty(pasteEv, 'clipboardData', {
      value: { getData: (_: string) => '12-34 56' },
    });
    inputs[0].dispatchEvent(pasteEv);
    fixture.detectChanges();
    expect(component.digits()).toEqual(['1', '2', '3', '4', '5', '6']);
  });

  it('reset() clears digits', () => {
    component.digits.set(['1', '2', '3', '4', '5', '6']);
    fixture.detectChanges();
    component.reset();
    expect(component.digits()).toEqual(['', '', '', '', '', '']);
  });
});
