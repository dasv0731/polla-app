import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AuthBrandPanelComponent } from './auth-brand-panel.component';

describe('AuthBrandPanelComponent', () => {
  let fixture: ComponentFixture<AuthBrandPanelComponent>;
  let component: AuthBrandPanelComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AuthBrandPanelComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(AuthBrandPanelComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('renders brand headline + sub copy', () => {
    fixture.detectChanges();
    const headline = fixture.nativeElement.querySelector('.auth-brand__h1');
    const sub = fixture.nativeElement.querySelector('.auth-brand__sub');
    expect(headline.textContent).toContain('Predice cada partido');
    expect(sub.textContent).toContain('Crea grupos privados');
  });

  it('renders "Polla Mundialista 2026" sub-title', () => {
    fixture.detectChanges();
    const title = fixture.nativeElement.querySelector('.auth-brand__title');
    expect(title.textContent.trim()).toBe('Polla Mundialista 2026');
  });

  it('uses brand-logo class on logo image', () => {
    fixture.detectChanges();
    const img = fixture.nativeElement.querySelector('img');
    expect(img.classList.contains('brand-logo')).toBe(true);
    expect(img.getAttribute('alt')).toBe('Golgana');
  });

  it('renders skeleton when stats undefined', () => {
    fixture.detectChanges();
    const skeleton = fixture.nativeElement.querySelector('app-skeleton');
    const statsBlock = fixture.nativeElement.querySelector('.auth-brand__stats');
    expect(skeleton).toBeTruthy();
    expect(statsBlock).toBeFalsy();
  });

  it('renders stats when provided', () => {
    fixture.componentRef.setInput('stats', {
      totalUsers: 2400,
      totalGroups: 180,
      totalPrizesAccrued: 15000,
    });
    fixture.detectChanges();
    const statsBlock = fixture.nativeElement.querySelector('.auth-brand__stats');
    expect(statsBlock).toBeTruthy();
    const nums = statsBlock.querySelectorAll('.num');
    expect(nums[0].textContent.trim()).toBe('2.4k');
    expect(nums[1].textContent.trim()).toBe('180');
    expect(nums[2].textContent.trim()).toBe('$15.0k');
  });

  it('renders footer with legal links having rel="noopener noreferrer"', () => {
    fixture.detectChanges();
    const links = fixture.nativeElement.querySelectorAll('.auth-brand__foot a');
    expect(links.length).toBe(2);
    links.forEach((a: HTMLAnchorElement) => {
      expect(a.getAttribute('rel')).toBe('noopener noreferrer');
      expect(a.getAttribute('target')).toBe('_blank');
    });
    expect(links[0].getAttribute('href')).toContain('terminos');
    expect(links[1].getAttribute('href')).toContain('privacidad');
  });

  it('formatK helper: 2400 → "2.4k", 850 → "850"', () => {
    expect(component.formatK(2400)).toBe('2.4k');
    expect(component.formatK(850)).toBe('850');
    expect(component.formatK(1000)).toBe('1.0k');
  });

  it('formatMoney helper: 15000 → "$15.0k", 0 → "—"', () => {
    expect(component.formatMoney(15000)).toBe('$15.0k');
    expect(component.formatMoney(0)).toBe('—');
  });
});
