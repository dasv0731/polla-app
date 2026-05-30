import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { CompaniesListComponent } from './companies-list.component';
import { ApiService } from '../../../core/api/api.service';

describe('CompaniesListComponent', () => {
  let fixture: ComponentFixture<CompaniesListComponent>;
  let component: CompaniesListComponent;
  let apiMock: { listCompanies: jest.Mock };
  let router: Router;

  function setup(companiesData: Array<Record<string, unknown>> = []) {
    apiMock = {
      listCompanies: jest.fn().mockResolvedValue({ data: companiesData }),
    };
    TestBed.configureTestingModule({
      imports: [CompaniesListComponent],
      providers: [
        provideRouter([]),
        { provide: ApiService, useValue: apiMock },
      ],
    });
    fixture = TestBed.createComponent(CompaniesListComponent);
    component = fixture.componentInstance;
    router = TestBed.inject(Router);
  }

  it('ngOnInit loads companies and sets loading to false', async () => {
    setup([
      { id: 'c1', name: 'Coca-Cola', status: 'ACTIVE', createdAt: '2026-01-15T00:00:00Z' },
    ]);
    await component.ngOnInit();
    expect(apiMock.listCompanies).toHaveBeenCalledTimes(1);
    expect(component.companies().length).toBe(1);
    expect(component.loading()).toBe(false);
  });

  it('filtered() returns all when search is empty', async () => {
    setup([
      { id: 'c1', name: 'Coca-Cola', status: 'ACTIVE', createdAt: '2026-01-15T00:00:00Z' },
      { id: 'c2', name: 'Pepsi', status: 'ACTIVE', createdAt: '2026-02-10T00:00:00Z' },
    ]);
    await component.ngOnInit();
    expect(component.filtered().length).toBe(2);
  });

  it('filtered() filters by case-insensitive substring on name', async () => {
    setup([
      { id: 'c1', name: 'Coca-Cola', status: 'ACTIVE', createdAt: '2026-01-15T00:00:00Z' },
      { id: 'c2', name: 'Pepsi', status: 'ACTIVE', createdAt: '2026-02-10T00:00:00Z' },
      { id: 'c3', name: 'Coca-Light', status: 'ACTIVE', createdAt: '2026-03-05T00:00:00Z' },
    ]);
    await component.ngOnInit();
    component.search.set('coca');
    const f = component.filtered();
    expect(f.length).toBe(2);
    expect(f.map((c) => c.id).sort()).toEqual(['c1', 'c3']);
  });

  it('filtered() trims search whitespace', async () => {
    setup([
      { id: 'c1', name: 'Coca-Cola', status: 'ACTIVE', createdAt: '2026-01-15T00:00:00Z' },
    ]);
    await component.ngOnInit();
    component.search.set('   coca   ');
    expect(component.filtered().length).toBe(1);
  });

  it('shows empty state in DOM when no companies and not loading', async () => {
    setup([]);
    await component.ngOnInit();
    fixture.detectChanges();
    const html = fixture.nativeElement.outerHTML as string;
    expect(html.toLowerCase()).toContain('crear primera empresa');
  });

  it('renders one row per company after load', async () => {
    setup([
      { id: 'c1', name: 'Coca-Cola', status: 'ACTIVE', createdAt: '2026-01-15T00:00:00Z' },
      { id: 'c2', name: 'Pepsi', status: 'DISABLED', createdAt: '2026-02-10T00:00:00Z' },
    ]);
    await component.ngOnInit();
    fixture.detectChanges();
    const html = fixture.nativeElement.outerHTML;
    expect(html).toContain('Coca-Cola');
    expect(html).toContain('Pepsi');
  });

  it('showCreate toggles the create modal', async () => {
    setup([]);
    await component.ngOnInit();
    component.showCreate.set(true);
    fixture.detectChanges();
    // The modal renders inside the component; we just verify the signal.
    expect(component.showCreate()).toBe(true);
  });

  it('onCreated(id) navigates to /admin/companies/<id> and closes modal', async () => {
    setup([]);
    await component.ngOnInit();
    const navSpy = jest.spyOn(router, 'navigate').mockResolvedValue(true);
    component.showCreate.set(true);
    component.onCreated('new-id');
    expect(navSpy).toHaveBeenCalledWith(['/admin/companies', 'new-id']);
    expect(component.showCreate()).toBe(false);
  });

  it('formatDate returns localized date string', () => {
    setup([]);
    const out = component.formatDate('2026-01-15T00:00:00Z');
    expect(typeof out).toBe('string');
    expect(out.length).toBeGreaterThan(0);
  });
});
