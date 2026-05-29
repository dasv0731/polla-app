import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { GroupActionsModalsComponent } from './group-actions-modals.component';
import { GroupActionsService } from '../../core/groups/group-actions.service';
import { ApiService } from '../../core/api/api.service';
import { AuthService } from '../../core/auth/auth.service';
import { ToastService } from '../../core/notifications/toast.service';
import { UserModesService } from '../../core/user/user-modes.service';

describe('GroupActionsModalsComponent — create with entry fee', () => {
  let component: GroupActionsModalsComponent;
  let apiMock: { createGroup: jest.Mock; joinGroup: jest.Mock };
  let toastMock: { success: jest.Mock; error: jest.Mock };

  beforeEach(() => {
    apiMock = {
      createGroup: jest.fn().mockResolvedValue({ data: { id: 'g1', joinCode: 'ABC123' } }),
      joinGroup: jest.fn().mockResolvedValue({ data: { id: 'g1' } }),
    };
    toastMock = { success: jest.fn(), error: jest.fn() };
    TestBed.configureTestingModule({
      imports: [GroupActionsModalsComponent],
      providers: [
        provideRouter([]),
        { provide: GroupActionsService, useValue: { closeAll: jest.fn(), createOpen: () => true, joinOpen: () => false } },
        { provide: ApiService, useValue: apiMock },
        { provide: AuthService, useValue: { user: () => ({ sub: 'admin-sub' }) } },
        { provide: ToastService, useValue: toastMock },
        { provide: UserModesService, useValue: { load: jest.fn().mockResolvedValue(undefined) } },
      ],
    });
    const fixture = TestBed.createComponent(GroupActionsModalsComponent);
    component = fixture.componentInstance;
  });

  it('entry-fee toggle defaults to off', () => {
    expect(component.entryFeeEnabled()).toBe(false);
  });

  it('submit with toggle off does not include entryFee args in payload', async () => {
    component.name = 'Polla';
    component.mode.set('COMPLETE');
    component.entryFeeEnabled.set(false);
    await component.submitCreate();
    expect(apiMock.createGroup).toHaveBeenCalledTimes(1);
    const payload = apiMock.createGroup.mock.calls[0][0] as Record<string, unknown>;
    expect(payload['entryFeeEnabled']).toBeUndefined();
    expect(payload['entryFeeInstructions']).toBeUndefined();
  });

  it('submit with toggle on + empty instructions: sets inline error, does not call API', async () => {
    component.name = 'Polla';
    component.mode.set('COMPLETE');
    component.entryFeeEnabled.set(true);
    component.entryFeeInstructions = '   ';
    await component.submitCreate();
    expect(apiMock.createGroup).not.toHaveBeenCalled();
    expect(component.entryFeeError()).toBe('Las instrucciones son obligatorias si activás la cuota.');
  });

  it('submit with toggle on + valid instructions: payload includes both fields, trimmed', async () => {
    component.name = 'Polla';
    component.mode.set('COMPLETE');
    component.entryFeeEnabled.set(true);
    component.entryFeeInstructions = '  Depositar a XXX  ';
    await component.submitCreate();
    expect(apiMock.createGroup).toHaveBeenCalledTimes(1);
    const payload = apiMock.createGroup.mock.calls[0][0] as Record<string, unknown>;
    expect(payload['entryFeeEnabled']).toBe(true);
    expect(payload['entryFeeInstructions']).toBe('Depositar a XXX');
  });

  it('reset clears entry-fee state after successful create', async () => {
    component.name = 'Polla';
    component.mode.set('COMPLETE');
    component.entryFeeEnabled.set(true);
    component.entryFeeInstructions = 'Depositar a XXX';
    await component.submitCreate();
    expect(component.entryFeeEnabled()).toBe(false);
    expect(component.entryFeeInstructions).toBe('');
  });
});
