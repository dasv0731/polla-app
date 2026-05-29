import { ComponentFixture, TestBed } from '@angular/core/testing';
import { EmptyBlockComponent } from './empty-block.component';
import { provideLucideIcons, LucideUsers, LucideTrophy } from '@lucide/angular';

describe('EmptyBlockComponent', () => {
  let fixture: ComponentFixture<EmptyBlockComponent>;
  let component: EmptyBlockComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EmptyBlockComponent],
      providers: [
        provideLucideIcons(
          { ...LucideUsers.icon, name: 'users' },
          { ...LucideTrophy.icon, name: 'trophy' },
        ),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(EmptyBlockComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('renders title and sub when provided', () => {
    fixture.componentRef.setInput('title', 'Sin grupos');
    fixture.componentRef.setInput('sub', 'Crea uno para empezar');
    fixture.detectChanges();

    const h3 = fixture.nativeElement.querySelector('.empty-block__title');
    expect(h3.textContent.trim()).toBe('Sin grupos');

    const p = fixture.nativeElement.querySelector('.empty-block__sub');
    expect(p.textContent.trim()).toBe('Crea uno para empezar');
  });

  it('renders icon when iconName provided', () => {
    fixture.componentRef.setInput('title', 'Sin grupos');
    fixture.componentRef.setInput('iconName', 'users');
    fixture.detectChanges();

    const icon = fixture.nativeElement.querySelector('app-icon');
    expect(icon).toBeTruthy();
  });
});
