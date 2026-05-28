import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideLucideIcons, LucideBell } from '@lucide/angular';
import { IconComponent } from './icon.component';

describe('IconComponent', () => {
  let fixture: ComponentFixture<IconComponent>;
  let component: IconComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [IconComponent],
      providers: [
        provideLucideIcons({ ...LucideBell.icon, name: 'bell' }),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(IconComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('renders an svg element for valid icon name', () => {
    fixture.componentRef.setInput('name', 'bell');
    fixture.detectChanges();
    const svg = fixture.nativeElement.querySelector('svg');
    expect(svg).toBeTruthy();
  });

  it('applies correct pixel size for each variant', () => {
    fixture.componentRef.setInput('name', 'bell');

    fixture.componentRef.setInput('size', 'sm');
    fixture.detectChanges();
    let svg = fixture.nativeElement.querySelector('svg');
    expect(svg.getAttribute('width')).toBe('16');

    fixture.componentRef.setInput('size', 'md');
    fixture.detectChanges();
    svg = fixture.nativeElement.querySelector('svg');
    expect(svg.getAttribute('width')).toBe('20');

    fixture.componentRef.setInput('size', 'lg');
    fixture.detectChanges();
    svg = fixture.nativeElement.querySelector('svg');
    expect(svg.getAttribute('width')).toBe('24');

    fixture.componentRef.setInput('size', 'xl');
    fixture.detectChanges();
    svg = fixture.nativeElement.querySelector('svg');
    expect(svg.getAttribute('width')).toBe('32');
  });
});
