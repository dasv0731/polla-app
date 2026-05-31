import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { GroupEditComponent } from './group-edit.component';
import { ApiService } from '../../core/api/api.service';
import { AuthService } from '../../core/auth/auth.service';
import { ToastService } from '../../core/notifications/toast.service';

function groupRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'g1', name: 'Polla', description: null, imageKey: null,
    adminUserId: 'admin-sub', mode: 'COMPLETE', comodinesEnabled: true,
    entryFeeEnabled: false, entryFeeInstructions: null,
    ...overrides,
  };
}

describe('GroupEditComponent — entry fee', () => {
  let fixture: ComponentFixture<GroupEditComponent>;
  let component: GroupEditComponent;
  let apiMock: {
    updateGroup: jest.Mock;
    updateCompanyGroup: jest.Mock;
    markEntryFeePaid: jest.Mock;
    getGroup: jest.Mock;
  };

  function build(initial: Record<string, unknown> = {}) {
    apiMock = {
      getGroup: jest.fn().mockResolvedValue({ data: groupRow(initial), errors: undefined }),
      updateGroup: jest.fn().mockResolvedValue({ data: {}, errors: undefined }),
      updateCompanyGroup: jest.fn().mockResolvedValue({ data: {}, errors: undefined }),
      markEntryFeePaid: jest.fn().mockResolvedValue({ data: { ok: true, message: 'ok', paidAt: '2026-05-29T00:00:00Z' }, errors: undefined }),
    };
    TestBed.configureTestingModule({
      imports: [GroupEditComponent],
      providers: [
        provideRouter([]),
        { provide: ApiService, useValue: apiMock },
        { provide: AuthService, useValue: { user: () => ({ sub: 'admin-sub' }) } },
        { provide: ToastService, useValue: { success: jest.fn(), error: jest.fn() } },
      ],
    });
    fixture = TestBed.createComponent(GroupEditComponent);
    component = fixture.componentInstance;
    component.id = 'g1';
  }

  it('loads existing group with entry fee off: toggle stays off', async () => {
    build();
    await component.ngOnInit();
    expect(component.entryFeeEnabled()).toBe(false);
    expect(component.entryFeeInstructions).toBe('');
  });

  it('loads existing group with entry fee on: toggle on, textarea populated', async () => {
    build({ entryFeeEnabled: true, entryFeeInstructions: 'Depositar a XXX' });
    await component.ngOnInit();
    expect(component.entryFeeEnabled()).toBe(true);
    expect(component.entryFeeInstructions).toBe('Depositar a XXX');
  });

  it('transition OFF → ON: calls updateGroup then markEntryFeePaid for self', async () => {
    build();
    await component.ngOnInit();
    component.entryFeeEnabled.set(true);
    component.entryFeeInstructions = 'Depositar a XXX';
    await component.save();

    expect(apiMock.updateGroup).toHaveBeenCalledTimes(1);
    const updatePayload = apiMock.updateGroup.mock.calls[0][0] as Record<string, unknown>;
    expect(updatePayload['entryFeeEnabled']).toBe(true);
    expect(updatePayload['entryFeeInstructions']).toBe('Depositar a XXX');

    expect(apiMock.markEntryFeePaid).toHaveBeenCalledTimes(1);
    expect(apiMock.markEntryFeePaid).toHaveBeenCalledWith({
      groupId: 'g1', userId: 'admin-sub', paid: true,
    });
  });

  it('transition ON → OFF: only updateGroup, no markEntryFeePaid', async () => {
    build({ entryFeeEnabled: true, entryFeeInstructions: 'Depositar a XXX' });
    await component.ngOnInit();
    component.entryFeeEnabled.set(false);
    await component.save();

    expect(apiMock.updateGroup).toHaveBeenCalledTimes(1);
    const updatePayload = apiMock.updateGroup.mock.calls[0][0] as Record<string, unknown>;
    expect(updatePayload['entryFeeEnabled']).toBe(false);
    expect(apiMock.markEntryFeePaid).not.toHaveBeenCalled();
  });

  it('transition ON → ON (instructions changed): only updateGroup', async () => {
    build({ entryFeeEnabled: true, entryFeeInstructions: 'Old text' });
    await component.ngOnInit();
    component.entryFeeInstructions = 'New text';
    await component.save();

    expect(apiMock.updateGroup).toHaveBeenCalledTimes(1);
    const updatePayload = apiMock.updateGroup.mock.calls[0][0] as Record<string, unknown>;
    expect(updatePayload['entryFeeInstructions']).toBe('New text');
    expect(apiMock.markEntryFeePaid).not.toHaveBeenCalled();
  });

  it('save with toggle on but empty instructions: inline error, no API call', async () => {
    build();
    await component.ngOnInit();
    component.entryFeeEnabled.set(true);
    component.entryFeeInstructions = '   ';
    await component.save();

    expect(apiMock.updateGroup).not.toHaveBeenCalled();
    expect(component.entryFeeError()).toBe('Las instrucciones son obligatorias si activas la cuota.');
  });

  it('dirty: returns true when entryFeeEnabled changes', async () => {
    build();
    await component.ngOnInit();
    expect(component.dirty()).toBe(false);
    component.entryFeeEnabled.set(true);
    expect(component.dirty()).toBe(true);
  });

  it('dirty: returns true when entryFeeInstructions changes', async () => {
    build({ entryFeeEnabled: true, entryFeeInstructions: 'Old' });
    await component.ngOnInit();
    component.entryFeeInstructions = 'New';
    expect(component.dirty()).toBe(true);
  });
});

describe('GroupEditComponent — Empresas Sub-1 (companyId routing)', () => {
  let fixture: ComponentFixture<GroupEditComponent>;
  let component: GroupEditComponent;
  let apiMock: {
    updateGroup: jest.Mock;
    updateCompanyGroup: jest.Mock;
    markEntryFeePaid: jest.Mock;
    getGroup: jest.Mock;
  };

  function build(initial: Record<string, unknown> = {}) {
    apiMock = {
      getGroup: jest.fn().mockResolvedValue({ data: groupRow(initial), errors: undefined }),
      updateGroup: jest.fn().mockResolvedValue({ data: {}, errors: undefined }),
      updateCompanyGroup: jest.fn().mockResolvedValue({ data: {}, errors: undefined }),
      markEntryFeePaid: jest.fn().mockResolvedValue({ data: { ok: true, message: 'ok', paidAt: '2026-05-29T00:00:00Z' }, errors: undefined }),
    };
    TestBed.configureTestingModule({
      imports: [GroupEditComponent],
      providers: [
        provideRouter([]),
        { provide: ApiService, useValue: apiMock },
        { provide: AuthService, useValue: { user: () => ({ sub: 'admin-sub' }) } },
        { provide: ToastService, useValue: { success: jest.fn(), error: jest.fn() } },
      ],
    });
    fixture = TestBed.createComponent(GroupEditComponent);
    component = fixture.componentInstance;
    component.id = 'g1';
  }

  it('isCompanyOwned() reflects loaded group — null companyId → false', async () => {
    build({ companyId: null });
    await component.ngOnInit();
    expect(component.isCompanyOwned()).toBe(false);
  });

  it('isCompanyOwned() reflects loaded group — set companyId → true', async () => {
    build({ companyId: 'c1' });
    await component.ngOnInit();
    expect(component.isCompanyOwned()).toBe(true);
  });

  it('legacy group (companyId null): save calls updateGroup, not updateCompanyGroup', async () => {
    build({ companyId: null });
    await component.ngOnInit();
    component.name = 'New name';
    await component.save();
    expect(apiMock.updateGroup).toHaveBeenCalledTimes(1);
    expect(apiMock.updateCompanyGroup).not.toHaveBeenCalled();
  });

  it('company-owned group: save calls updateCompanyGroup, not updateGroup', async () => {
    build({ companyId: 'c1' });
    await component.ngOnInit();
    component.name = 'New name';
    await component.save();
    expect(apiMock.updateCompanyGroup).toHaveBeenCalledTimes(1);
    expect(apiMock.updateGroup).not.toHaveBeenCalled();
    // Sparse payload — solo `id` y `name` cambiaron respecto al snapshot.
    const payload = apiMock.updateCompanyGroup.mock.calls[0][0] as Record<string, unknown>;
    expect(payload['id']).toBe('g1');
    expect(payload['name']).toBe('New name');
  });

  it('template: hint absent when companyId is null', async () => {
    build({ companyId: null });
    await component.ngOnInit();
    fixture.detectChanges();
    const hint = fixture.nativeElement.querySelector('[data-testid="ge-company-hint"]');
    expect(hint).toBeNull();
  });

  it('template: hint "Editando grupo de empresa" visible when companyId is set', async () => {
    build({ companyId: 'c1' });
    await component.ngOnInit();
    fixture.detectChanges();
    const hint = fixture.nativeElement.querySelector('[data-testid="ge-company-hint"]');
    expect(hint).not.toBeNull();
    expect(hint?.textContent?.trim()).toBe('Editando grupo de empresa');
  });
});
