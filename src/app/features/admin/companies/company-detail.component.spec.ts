import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { CompanyDetailComponent } from './company-detail.component';
import { ApiService } from '../../../core/api/api.service';
import { ConfirmDialogService } from '../../../shared/ui/confirm-dialog.service';
import { ToastService } from '../../../core/notifications/toast.service';

const baseCompany = {
  id: 'c1', name: 'Coca-Cola', status: 'ACTIVE',
  contactEmail: 'rrhh@coca-cola.com', description: 'desc',
  logoKey: null, brandPrimary: null, brandPrimaryDark: null, brandAccent: null,
  createdAt: '2026-01-15T00:00:00Z',
};

describe('CompanyDetailComponent — shell + Tab General', () => {
  let fixture: ComponentFixture<CompanyDetailComponent>;
  let component: CompanyDetailComponent;
  let apiMock: {
    getCompany: jest.Mock;
    updateCompany: jest.Mock;
    setCompanyStatus: jest.Mock;
  };
  let confirmMock: { ask: jest.Mock };
  let toastMock: { success: jest.Mock; error: jest.Mock };

  function setup(opts: { company?: Record<string, unknown> | null } = {}) {
    const initialCompany = opts.company === undefined ? baseCompany : opts.company;
    apiMock = {
      getCompany: jest.fn().mockResolvedValue({ data: initialCompany }),
      updateCompany: jest.fn().mockResolvedValue({ data: { ok: true, message: 'Cambios guardados' } }),
      setCompanyStatus: jest.fn().mockResolvedValue({ data: { ok: true } }),
    };
    confirmMock = { ask: jest.fn().mockResolvedValue(true) };
    toastMock = { success: jest.fn(), error: jest.fn() };
    TestBed.configureTestingModule({
      imports: [CompanyDetailComponent],
      providers: [
        provideRouter([]),
        { provide: ApiService, useValue: apiMock },
        { provide: ConfirmDialogService, useValue: confirmMock },
        { provide: ToastService, useValue: toastMock },
      ],
    });
    fixture = TestBed.createComponent(CompanyDetailComponent);
    component = fixture.componentInstance;
    component.id = 'c1';
  }

  it('ngOnInit loads company and populates form fields', async () => {
    setup();
    await component.ngOnInit();
    expect(apiMock.getCompany).toHaveBeenCalledWith('c1');
    expect(component.company()?.name).toBe('Coca-Cola');
    expect(component.name).toBe('Coca-Cola');
    expect(component.contactEmail).toBe('rrhh@coca-cola.com');
    expect(component.description).toBe('desc');
  });

  it('ngOnInit sets loading false when complete', async () => {
    setup();
    await component.ngOnInit();
    expect(component.loading()).toBe(false);
  });

  it('dirty() is false after load', async () => {
    setup();
    await component.ngOnInit();
    expect(component.dirty()).toBe(false);
  });

  it('dirty() becomes true when name changes', async () => {
    setup();
    await component.ngOnInit();
    component.name = 'New Name';
    expect(component.dirty()).toBe(true);
  });

  it('save() with no changes does not call api', async () => {
    setup();
    await component.ngOnInit();
    await component.save();
    expect(apiMock.updateCompany).not.toHaveBeenCalled();
  });

  it('save() with changed name calls updateCompany sparse', async () => {
    setup();
    await component.ngOnInit();
    component.name = 'New Name';
    await component.save();
    expect(apiMock.updateCompany).toHaveBeenCalledWith({ id: 'c1', name: 'New Name' });
  });

  it('save() with changed contactEmail calls updateCompany sparse', async () => {
    setup();
    await component.ngOnInit();
    component.contactEmail = 'new@email.com';
    await component.save();
    expect(apiMock.updateCompany).toHaveBeenCalledWith({ id: 'c1', contactEmail: 'new@email.com' });
  });

  it('save() refreshes snapshot so dirty() returns false after', async () => {
    setup();
    await component.ngOnInit();
    component.name = 'New Name';
    await component.save();
    expect(component.dirty()).toBe(false);
  });

  it('toggleStatus() with ACTIVE company asks confirmation and calls setCompanyStatus DISABLED', async () => {
    setup();
    await component.ngOnInit();
    await component.toggleStatus();
    expect(confirmMock.ask).toHaveBeenCalled();
    expect(apiMock.setCompanyStatus).toHaveBeenCalledWith({ id: 'c1', status: 'DISABLED' });
  });

  it('toggleStatus() cancels if confirm rejected', async () => {
    setup();
    confirmMock.ask.mockResolvedValueOnce(false);
    await component.ngOnInit();
    await component.toggleStatus();
    expect(apiMock.setCompanyStatus).not.toHaveBeenCalled();
  });

  it('tab() defaults to general and switches on setter', async () => {
    setup();
    await component.ngOnInit();
    expect(component.tab()).toBe('general');
    component.tab.set('admins');
    expect(component.tab()).toBe('admins');
  });
});
