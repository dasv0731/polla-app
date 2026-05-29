import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Component } from '@angular/core';
import { MoreSheetComponent } from './more-sheet.component';

@Component({
  standalone: true,
  imports: [MoreSheetComponent],
  template: `
    <app-more-sheet [open]="open" (close)="onClose()">
      <a class="sheet-item" href="/profile">Perfil</a>
      <a class="sheet-item" href="/notificaciones">Notificaciones</a>
    </app-more-sheet>
  `,
})
class HostComponent {
  open = false;
  closeCount = 0;
  onClose() { this.closeCount++; }
}

describe('MoreSheetComponent', () => {
  let fixture: ComponentFixture<HostComponent>;
  let host: HostComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HostComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(HostComponent);
    host = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('hides sheet when open=false (default)', () => {
    const sheet = fixture.nativeElement.querySelector('[role="dialog"]');
    expect(sheet).toBeFalsy();
  });

  it('renders sheet when open=true', () => {
    host.open = true;
    fixture.detectChanges();
    const sheet = fixture.nativeElement.querySelector('[role="dialog"]');
    expect(sheet).toBeTruthy();
  });

  it('emits close on Escape key', () => {
    host.open = true;
    fixture.detectChanges();
    const sheet = fixture.nativeElement.querySelector('[role="dialog"]');
    const event = new KeyboardEvent('keydown', { key: 'Escape' });
    sheet.dispatchEvent(event);
    expect(host.closeCount).toBe(1);
  });

  it('emits close on backdrop click', () => {
    host.open = true;
    fixture.detectChanges();
    const backdrop = fixture.nativeElement.querySelector('.more-sheet__backdrop');
    backdrop.click();
    expect(host.closeCount).toBe(1);
  });

  it('projects content into sheet body', () => {
    host.open = true;
    fixture.detectChanges();
    const items = fixture.nativeElement.querySelectorAll('.sheet-item');
    expect(items.length).toBe(2);
  });

  it('has aria-modal=true for proper modal semantics', () => {
    host.open = true;
    fixture.detectChanges();
    const sheet = fixture.nativeElement.querySelector('[role="dialog"]');
    expect(sheet.getAttribute('aria-modal')).toBe('true');
  });
});
