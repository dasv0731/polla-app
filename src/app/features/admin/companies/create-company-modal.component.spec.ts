import { TestBed } from '@angular/core/testing';
import { CreateCompanyModalComponent } from './create-company-modal.component';
import { ApiService } from '../../../core/api/api.service';
import { ToastService } from '../../../core/notifications/toast.service';

describe('CreateCompanyModalComponent', () => {
  let component: CreateCompanyModalComponent;
  let apiMock: { createCompany: jest.Mock; inviteCompanyAdmin: jest.Mock };
  let toastMock: { success: jest.Mock; error: jest.Mock; info: jest.Mock };

  beforeEach(() => {
    apiMock = {
      createCompany: jest.fn().mockResolvedValue({ data: { id: 'c1', message: 'Empresa creada' } }),
      inviteCompanyAdmin: jest.fn().mockResolvedValue({ data: { added: true, code: '' } }),
    };
    toastMock = { success: jest.fn(), error: jest.fn(), info: jest.fn() };
    TestBed.configureTestingModule({
      imports: [CreateCompanyModalComponent],
      providers: [
        { provide: ApiService, useValue: apiMock },
        { provide: ToastService, useValue: toastMock },
      ],
    });
    const fixture = TestBed.createComponent(CreateCompanyModalComponent);
    component = fixture.componentInstance;
  });

  it('canSubmit is false when name is empty', () => {
    component.name.set('');
    component.adminEmail.set('rrhh@coca-cola.com');
    expect(component.canSubmit()).toBe(false);
  });

  it('canSubmit is false when name is shorter than 3 chars', () => {
    component.name.set('Ab');
    component.adminEmail.set('rrhh@coca-cola.com');
    expect(component.canSubmit()).toBe(false);
  });

  it('canSubmit is false when name exceeds 80 chars', () => {
    component.name.set('x'.repeat(81));
    component.adminEmail.set('rrhh@coca-cola.com');
    expect(component.canSubmit()).toBe(false);
  });

  it('canSubmit is false when admin email is empty', () => {
    component.name.set('Coca-Cola');
    component.adminEmail.set('');
    expect(component.canSubmit()).toBe(false);
  });

  it('canSubmit is false when admin email is invalid', () => {
    component.name.set('Coca-Cola');
    component.adminEmail.set('not-an-email');
    expect(component.canSubmit()).toBe(false);
  });

  it('canSubmit is true when name 3-80 + valid admin email', () => {
    component.name.set('Coca-Cola');
    component.adminEmail.set('rrhh@coca-cola.com');
    expect(component.canSubmit()).toBe(true);
  });

  it('submit() added=true: creates company, invites admin, emits created + close', async () => {
    apiMock.inviteCompanyAdmin.mockResolvedValueOnce({ data: { added: true, code: '' } });
    component.name.set('Coca-Cola');
    component.adminEmail.set('rrhh@coca-cola.com');
    component.contactEmail.set('contacto@coca-cola.com');
    component.description.set('Marketing y RRHH');

    const createdEmitted: string[] = [];
    const closeEmitted: void[] = [];
    component.created.subscribe((id: string) => createdEmitted.push(id));
    component.close.subscribe(() => closeEmitted.push(undefined));

    await component.submit();

    expect(apiMock.createCompany).toHaveBeenCalledWith({
      name: 'Coca-Cola',
      contactEmail: 'contacto@coca-cola.com',
      description: 'Marketing y RRHH',
    });
    expect(apiMock.inviteCompanyAdmin).toHaveBeenCalledWith({
      companyId: 'c1',
      email: 'rrhh@coca-cola.com',
    });
    expect(createdEmitted).toEqual(['c1']);
    expect(closeEmitted.length).toBe(1);
    expect(component.inviteCode()).toBeNull();
    expect(toastMock.success).toHaveBeenCalled();
  });

  it('submit() added=false: shows invite code chip and does NOT emit created/close', async () => {
    apiMock.inviteCompanyAdmin.mockResolvedValueOnce({ data: { added: false, code: 'ABC123' } });
    component.name.set('Coca-Cola');
    component.adminEmail.set('nuevo@coca-cola.com');

    const createdEmitted: string[] = [];
    const closeEmitted: void[] = [];
    component.created.subscribe((id: string) => createdEmitted.push(id));
    component.close.subscribe(() => closeEmitted.push(undefined));

    await component.submit();

    expect(apiMock.createCompany).toHaveBeenCalled();
    expect(apiMock.inviteCompanyAdmin).toHaveBeenCalledWith({
      companyId: 'c1',
      email: 'nuevo@coca-cola.com',
    });
    expect(component.inviteCode()).toBe('ABC123');
    expect(component.invitedEmail()).toBe('nuevo@coca-cola.com');
    expect(createdEmitted).toEqual([]);
    expect(closeEmitted.length).toBe(0);
    expect(toastMock.success).toHaveBeenCalled();
  });

  it('submit() with empty name sets error and does not call API', async () => {
    component.name.set('');
    component.adminEmail.set('rrhh@coca-cola.com');
    await component.submit();
    expect(apiMock.createCompany).not.toHaveBeenCalled();
    expect(component.error()).toBeTruthy();
  });

  it('submit() API error sets error message', async () => {
    apiMock.createCompany.mockRejectedValueOnce(new Error('Network down'));
    component.name.set('Coca-Cola');
    component.adminEmail.set('rrhh@coca-cola.com');

    await component.submit();

    expect(apiMock.createCompany).toHaveBeenCalled();
    expect(component.error()).toBeTruthy();
    expect(component.loading()).toBe(false);
  });

  it('submit() omits contactEmail/description from payload when empty', async () => {
    component.name.set('Coca-Cola');
    component.adminEmail.set('rrhh@coca-cola.com');

    await component.submit();

    expect(apiMock.createCompany).toHaveBeenCalledWith({ name: 'Coca-Cola' });
  });
});
