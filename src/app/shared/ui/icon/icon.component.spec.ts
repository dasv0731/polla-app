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
});
