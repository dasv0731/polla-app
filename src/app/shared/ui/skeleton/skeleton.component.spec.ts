import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SkeletonComponent } from './skeleton.component';

describe('SkeletonComponent', () => {
  let fixture: ComponentFixture<SkeletonComponent>;
  let component: SkeletonComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SkeletonComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(SkeletonComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('renders N skeleton items for count input', () => {
    fixture.componentRef.setInput('count', 3);
    fixture.detectChanges();
    const items = fixture.nativeElement.querySelectorAll('.skeleton__item');
    expect(items.length).toBe(3);
  });

  it('applies correct variant class', () => {
    fixture.componentRef.setInput('variant', 'card');
    fixture.detectChanges();
    const item = fixture.nativeElement.querySelector('.skeleton__item');
    expect(item.classList.contains('skeleton__item--card')).toBe(true);
  });

  it('has aria-busy true for screen readers', () => {
    fixture.detectChanges();
    const container = fixture.nativeElement.querySelector('.skeleton');
    expect(container.getAttribute('aria-busy')).toBe('true');
  });
});
