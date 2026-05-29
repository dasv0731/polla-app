import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Component } from '@angular/core';
import { ModalComponent } from './modal.component';

@Component({
  standalone: true,
  imports: [ModalComponent],
  template: `
    <app-modal [open]="open" [title]="title" [description]="description" (close)="onClose()">
      <ng-container slot="body">Body content</ng-container>
      <ng-container slot="footer">
        <button>Cancel</button>
        <button>OK</button>
      </ng-container>
    </app-modal>
  `,
})
class HostComponent {
  open = true;
  title = 'Test Modal';
  description = 'Test description';
  closeCount = 0;
  onClose() { this.closeCount++; }
}

describe('ModalComponent', () => {
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

  it('renders when open=true', () => {
    const dialog = fixture.nativeElement.querySelector('[role="dialog"]');
    expect(dialog).toBeTruthy();
  });

  it('hides when open=false', () => {
    host.open = false;
    fixture.detectChanges();
    const dialog = fixture.nativeElement.querySelector('[role="dialog"]');
    expect(dialog).toBeFalsy();
  });

  it('has aria-labelledby pointing to title', () => {
    const dialog = fixture.nativeElement.querySelector('[role="dialog"]');
    const labelledby = dialog.getAttribute('aria-labelledby');
    const titleEl = fixture.nativeElement.querySelector(`#${labelledby}`);
    expect(titleEl.textContent.trim()).toBe('Test Modal');
  });

  it('has aria-describedby pointing to description', () => {
    const dialog = fixture.nativeElement.querySelector('[role="dialog"]');
    const describedby = dialog.getAttribute('aria-describedby');
    expect(describedby).toBeTruthy();
    const descEl = fixture.nativeElement.querySelector(`#${describedby}`);
    expect(descEl.textContent.trim()).toBe('Test description');
  });

  it('emits close on Escape key', () => {
    const dialog = fixture.nativeElement.querySelector('[role="dialog"]');
    const event = new KeyboardEvent('keydown', { key: 'Escape' });
    dialog.dispatchEvent(event);
    expect(host.closeCount).toBe(1);
  });

  it('emits close on backdrop click', () => {
    const backdrop = fixture.nativeElement.querySelector('.app-modal__backdrop');
    backdrop.click();
    expect(host.closeCount).toBe(1);
  });
});
