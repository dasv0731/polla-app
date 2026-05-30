import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { CompanyDetailComponent } from './company-detail.component';
import { ApiService } from '../../../core/api/api.service';
import { ConfirmDialogService } from '../../../shared/ui/confirm-dialog.service';
import { ToastService } from '../../../core/notifications/toast.service';
import { AuthService } from '../../../core/auth/auth.service';

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
    listCompanyMembers: jest.Mock;
    getUser: jest.Mock;
    listCompanyGroups: jest.Mock;
  };
  let confirmMock: { ask: jest.Mock };
  let toastMock: { success: jest.Mock; error: jest.Mock };
  let authMock: { user: () => { sub: string } | null };

  function setup(opts: { company?: Record<string, unknown> | null } = {}) {
    const initialCompany = opts.company === undefined ? baseCompany : opts.company;
    apiMock = {
      getCompany: jest.fn().mockResolvedValue({ data: initialCompany }),
      updateCompany: jest.fn().mockResolvedValue({ data: { ok: true, message: 'Cambios guardados' } }),
      setCompanyStatus: jest.fn().mockResolvedValue({ data: { ok: true } }),
      listCompanyMembers: jest.fn().mockResolvedValue({ data: [] }),
      getUser: jest.fn().mockResolvedValue({ data: null }),
      listCompanyGroups: jest.fn().mockResolvedValue({ data: [] }),
    };
    confirmMock = { ask: jest.fn().mockResolvedValue(true) };
    toastMock = { success: jest.fn(), error: jest.fn() };
    authMock = { user: () => ({ sub: 'u-caller' }) };
    TestBed.configureTestingModule({
      imports: [CompanyDetailComponent],
      providers: [
        provideRouter([]),
        { provide: ApiService, useValue: apiMock },
        { provide: ConfirmDialogService, useValue: confirmMock },
        { provide: ToastService, useValue: toastMock },
        { provide: AuthService, useValue: authMock },
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

const baseAdmin = {
  id: 'm1', companyId: 'c1', userId: 'u-bob', role: 'ADMIN',
  invitedAt: '2026-02-10T00:00:00Z',
};

describe('CompanyDetailComponent — Tab Admins', () => {
  let fixture: ComponentFixture<CompanyDetailComponent>;
  let component: CompanyDetailComponent;
  let apiMock: {
    getCompany: jest.Mock;
    listCompanyMembers: jest.Mock;
    getUser: jest.Mock;
    addCompanyAdmin: jest.Mock;
    removeCompanyAdmin: jest.Mock;
    listCompanyGroups: jest.Mock;
  };
  let confirmMock: { ask: jest.Mock };
  let toastMock: { success: jest.Mock; error: jest.Mock };
  let authMock: { user: () => { sub: string } | null };

  const baseCompany = {
    id: 'c1', name: 'Coca-Cola', status: 'ACTIVE',
    contactEmail: null, description: null,
    logoKey: null, brandPrimary: null, brandPrimaryDark: null, brandAccent: null,
    createdAt: '2026-01-15T00:00:00Z',
  };

  function setup(admins: Array<Record<string, unknown>>, opts: { callerSub?: string } = {}) {
    apiMock = {
      getCompany: jest.fn().mockResolvedValue({ data: baseCompany }),
      listCompanyMembers: jest.fn().mockResolvedValue({ data: admins }),
      getUser: jest.fn().mockImplementation((sub: string) => Promise.resolve({
        data: { sub, handle: sub.replace('u-', ''), email: sub + '@x.com', avatarKey: null },
      })),
      addCompanyAdmin: jest.fn().mockResolvedValue({ data: { ok: true, message: 'Admin agregado' } }),
      removeCompanyAdmin: jest.fn().mockResolvedValue({ data: { ok: true, message: 'Admin removido' } }),
      listCompanyGroups: jest.fn().mockResolvedValue({ data: [] }),
    };
    confirmMock = { ask: jest.fn().mockResolvedValue(true) };
    toastMock = { success: jest.fn(), error: jest.fn() };
    authMock = { user: () => ({ sub: opts.callerSub ?? 'u-caller' }) };

    TestBed.configureTestingModule({
      imports: [CompanyDetailComponent],
      providers: [
        provideRouter([]),
        { provide: ApiService, useValue: apiMock },
        { provide: ConfirmDialogService, useValue: confirmMock },
        { provide: ToastService, useValue: toastMock },
        { provide: AuthService, useValue: authMock },
      ],
    });
    fixture = TestBed.createComponent(CompanyDetailComponent);
    component = fixture.componentInstance;
    component.id = 'c1';
  }

  it('ngOnInit loads admins and populates admins() signal', async () => {
    setup([{ ...baseAdmin, userId: 'u-alice' }, { ...baseAdmin, id: 'm2', userId: 'u-bob' }]);
    await component.ngOnInit();
    expect(apiMock.listCompanyMembers).toHaveBeenCalledWith('c1');
    expect(component.admins().length).toBe(2);
    expect(component.admins().map(a => a.userId).sort()).toEqual(['u-alice', 'u-bob']);
  });

  it('filters out MEMBER rows, keeps only ADMIN', async () => {
    setup([
      { ...baseAdmin, userId: 'u-alice', role: 'ADMIN' },
      { ...baseAdmin, id: 'm2', userId: 'u-member', role: 'MEMBER' },
    ]);
    await component.ngOnInit();
    expect(component.admins().length).toBe(1);
    expect(component.admins()[0].userId).toBe('u-alice');
  });

  it('onPickAdmin with null is a no-op (just closes picker)', async () => {
    setup([{ ...baseAdmin, userId: 'u-alice' }]);
    await component.ngOnInit();
    component.showPicker.set(true);
    await component.onPickAdmin(null);
    expect(apiMock.addCompanyAdmin).not.toHaveBeenCalled();
    expect(component.showPicker()).toBe(false);
  });

  it('onPickAdmin calls addCompanyAdmin + reloads + closes picker', async () => {
    setup([{ ...baseAdmin, userId: 'u-alice' }]);
    await component.ngOnInit();
    component.showPicker.set(true);
    await component.onPickAdmin({ sub: 'u-new', handle: 'new', email: 'new@x.com', avatarKey: null });
    expect(apiMock.addCompanyAdmin).toHaveBeenCalledWith({ companyId: 'c1', userId: 'u-new' });
    expect(apiMock.listCompanyMembers).toHaveBeenCalledTimes(2);
    expect(component.showPicker()).toBe(false);
  });

  it('removeAdmin with self shows special confirm copy', async () => {
    setup(
      [
        { ...baseAdmin, userId: 'u-caller' },
        { ...baseAdmin, id: 'm2', userId: 'u-bob' },
      ],
      { callerSub: 'u-caller' },
    );
    await component.ngOnInit();
    const self = component.admins().find(a => a.userId === 'u-caller')!;
    await component.removeAdmin(self);
    expect(confirmMock.ask).toHaveBeenCalled();
    const askArg = confirmMock.ask.mock.calls[0][0];
    expect(askArg.message.toLowerCase()).toContain('vas a perder acceso');
  });

  it('removeAdmin calls removeCompanyAdmin + reloads', async () => {
    setup([
      { ...baseAdmin, userId: 'u-alice' },
      { ...baseAdmin, id: 'm2', userId: 'u-bob' },
    ]);
    await component.ngOnInit();
    const bob = component.admins().find(a => a.userId === 'u-bob')!;
    await component.removeAdmin(bob);
    expect(apiMock.removeCompanyAdmin).toHaveBeenCalledWith({ companyId: 'c1', userId: 'u-bob' });
    expect(apiMock.listCompanyMembers).toHaveBeenCalledTimes(2);
  });

  it('removeAdmin cancels when confirm rejected', async () => {
    setup([
      { ...baseAdmin, userId: 'u-alice' },
      { ...baseAdmin, id: 'm2', userId: 'u-bob' },
    ]);
    confirmMock.ask.mockResolvedValueOnce(false);
    await component.ngOnInit();
    const bob = component.admins().find(a => a.userId === 'u-bob')!;
    await component.removeAdmin(bob);
    expect(apiMock.removeCompanyAdmin).not.toHaveBeenCalled();
  });

  it('removeAdmin handles LAST_COMPANY_ADMIN error via toast', async () => {
    setup([
      { ...baseAdmin, userId: 'u-alice' },
      { ...baseAdmin, id: 'm2', userId: 'u-bob' },
    ]);
    apiMock.removeCompanyAdmin.mockRejectedValueOnce(new Error('LAST_COMPANY_ADMIN'));
    await component.ngOnInit();
    const bob = component.admins().find(a => a.userId === 'u-bob')!;
    await component.removeAdmin(bob);
    expect(toastMock.error).toHaveBeenCalled();
  });
});

describe('CompanyDetailComponent — Tab Grupos', () => {
  let fixture: ComponentFixture<CompanyDetailComponent>;
  let component: CompanyDetailComponent;
  let apiMock: {
    getCompany: jest.Mock;
    listCompanyMembers: jest.Mock;
    getUser: jest.Mock;
    listCompanyGroups: jest.Mock;
  };
  let routerMock: { navigate: jest.Mock };
  let toastMock: { success: jest.Mock; error: jest.Mock };
  let confirmMock: { ask: jest.Mock };
  let authMock: { user: () => { sub: string } | null };

  const baseCompany = {
    id: 'c1', name: 'Coca-Cola', status: 'ACTIVE',
    contactEmail: null, description: null, logoKey: null,
    brandPrimary: null, brandPrimaryDark: null, brandAccent: null,
    createdAt: '2026-01-15T00:00:00Z',
  };

  function setup(groups: Array<Record<string, unknown>>) {
    apiMock = {
      getCompany: jest.fn().mockResolvedValue({ data: baseCompany }),
      listCompanyMembers: jest.fn().mockResolvedValue({ data: [] }),
      getUser: jest.fn().mockResolvedValue({ data: { sub: 'x', handle: 'x', email: 'x@x.com', avatarKey: null } }),
      listCompanyGroups: jest.fn().mockResolvedValue({ data: groups }),
    };
    routerMock = { navigate: jest.fn() };
    toastMock = { success: jest.fn(), error: jest.fn() };
    confirmMock = { ask: jest.fn().mockResolvedValue(true) };
    authMock = { user: () => ({ sub: 'u-caller' }) };

    TestBed.configureTestingModule({
      imports: [CompanyDetailComponent],
      providers: [
        provideRouter([]),
        { provide: ApiService, useValue: apiMock },
        { provide: ConfirmDialogService, useValue: confirmMock },
        { provide: ToastService, useValue: toastMock },
        { provide: AuthService, useValue: authMock },
      ],
    });
    const realRouter = TestBed.inject(Router);
    jest.spyOn(realRouter, 'navigate').mockImplementation(routerMock.navigate);
    fixture = TestBed.createComponent(CompanyDetailComponent);
    component = fixture.componentInstance;
    component.id = 'c1';
  }

  it('ngOnInit loads groups and populates groups() signal', async () => {
    setup([
      { id: 'g1', name: 'Mundialista', category: 'futbol', memberCount: 12 },
      { id: 'g2', name: 'NBA', category: 'baloncesto', memberCount: null },
    ]);
    await component.ngOnInit();
    expect(apiMock.listCompanyGroups).toHaveBeenCalledWith('c1');
    expect(component.groups().length).toBe(2);
    expect(component.groups()[0].name).toBe('Mundialista');
  });

  it('editGroup navigates to /admin/groups/edit/:id', async () => {
    setup([{ id: 'g1', name: 'Mundialista', category: 'futbol', memberCount: 10 }]);
    await component.ngOnInit();
    component.editGroup(component.groups()[0]);
    expect(routerMock.navigate).toHaveBeenCalledWith(['/admin/groups/edit', 'g1']);
  });

  it('onGroupCreated reloads groups and closes modal', async () => {
    setup([{ id: 'g1', name: 'Mundialista', category: 'futbol', memberCount: 10 }]);
    await component.ngOnInit();
    component.showCreateGroup.set(true);
    await component.onGroupCreated({ id: 'g2' });
    expect(apiMock.listCompanyGroups).toHaveBeenCalledTimes(2);
    expect(component.showCreateGroup()).toBe(false);
  });

  it('empty state shown when no groups', async () => {
    setup([]);
    await component.ngOnInit();
    expect(component.groups().length).toBe(0);
  });
});
