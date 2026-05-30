import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CreateCompanyGroupModalComponent } from './create-company-group-modal.component';
import { ApiService } from '../../../core/api/api.service';
import { ToastService } from '../../../core/notifications/toast.service';

describe('CreateCompanyGroupModalComponent', () => {
  let fixture: ComponentFixture<CreateCompanyGroupModalComponent>;
  let component: CreateCompanyGroupModalComponent;
  let apiMock: { createCompanyGroup: jest.Mock };
  let toastMock: { success: jest.Mock; error: jest.Mock };

  beforeEach(() => {
    apiMock = {
      createCompanyGroup: jest.fn().mockResolvedValue({ data: { id: 'g1', name: 'Mundialista 2026' } }),
    };
    toastMock = { success: jest.fn(), error: jest.fn() };

    TestBed.configureTestingModule({
      imports: [CreateCompanyGroupModalComponent],
      providers: [
        { provide: ApiService, useValue: apiMock },
        { provide: ToastService, useValue: toastMock },
      ],
    });
    fixture = TestBed.createComponent(CreateCompanyGroupModalComponent);
    component = fixture.componentInstance;
    component.companyId = 'c1';
    component.companyName = 'Coca-Cola';
    fixture.detectChanges();
  });

  it('initial state: name empty, save disabled', () => {
    expect(component.name).toBe('');
    expect(component.canSave()).toBe(false);
  });

  it('canSave true once name is provided', () => {
    component.name = 'Mundialista 2026';
    expect(component.canSave()).toBe(true);
  });

  it('canSave false when name only whitespace', () => {
    component.name = '   ';
    expect(component.canSave()).toBe(false);
  });

  it('save() builds sparse payload omitting empty optionals', async () => {
    component.name = 'Mundialista 2026';
    component.category = '';
    component.description = '';
    component.adminUserId = '';
    await component.save();
    expect(apiMock.createCompanyGroup).toHaveBeenCalledWith({
      companyId: 'c1',
      name: 'Mundialista 2026',
    });
  });

  it('save() includes optionals when provided', async () => {
    component.name = 'Mundialista 2026';
    component.category = 'futbol';
    component.description = 'Polla del torneo';
    component.adminUserId = 'u-bob';
    await component.save();
    expect(apiMock.createCompanyGroup).toHaveBeenCalledWith({
      companyId: 'c1',
      name: 'Mundialista 2026',
      category: 'futbol',
      description: 'Polla del torneo',
      adminUserId: 'u-bob',
    });
  });

  it('emits created event with returned id on success', async () => {
    component.name = 'Mundialista 2026';
    const spy = jest.fn();
    component.created.subscribe(spy);
    await component.save();
    expect(spy).toHaveBeenCalledWith({ id: 'g1' });
  });

  it('toast.success after successful create', async () => {
    component.name = 'Mundialista 2026';
    await component.save();
    expect(toastMock.success).toHaveBeenCalled();
  });

  it('toast.error and does not emit created on failure', async () => {
    apiMock.createCompanyGroup.mockRejectedValueOnce(new Error('SERVER_ERROR'));
    component.name = 'Mundialista 2026';
    const spy = jest.fn();
    component.created.subscribe(spy);
    await component.save();
    expect(toastMock.error).toHaveBeenCalled();
    expect(spy).not.toHaveBeenCalled();
  });

  it('save() is no-op when canSave is false', async () => {
    component.name = '';
    await component.save();
    expect(apiMock.createCompanyGroup).not.toHaveBeenCalled();
  });

  it('cancel emits cancel event', () => {
    const spy = jest.fn();
    component.cancel.subscribe(spy);
    component.onCancel();
    expect(spy).toHaveBeenCalled();
  });
});
