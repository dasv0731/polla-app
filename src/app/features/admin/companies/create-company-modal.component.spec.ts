import { TestBed } from '@angular/core/testing';
import { CreateCompanyModalComponent } from './create-company-modal.component';
import { ApiService } from '../../../core/api/api.service';

describe('CreateCompanyModalComponent', () => {
  let component: CreateCompanyModalComponent;
  let apiMock: { createCompany: jest.Mock };

  beforeEach(() => {
    apiMock = {
      createCompany: jest.fn().mockResolvedValue({ data: { id: 'c1', message: 'Empresa creada' } }),
    };
    TestBed.configureTestingModule({
      imports: [CreateCompanyModalComponent],
      providers: [{ provide: ApiService, useValue: apiMock }],
    });
    const fixture = TestBed.createComponent(CreateCompanyModalComponent);
    component = fixture.componentInstance;
  });

  it('canSubmit is false when name is empty', () => {
    component.name.set('');
    component.firstAdmin.set({ sub: 'u1', handle: 'juan', email: 'a@b.com', avatarKey: null });
    expect(component.canSubmit()).toBe(false);
  });

  it('canSubmit is false when name is shorter than 3 chars', () => {
    component.name.set('Ab');
    component.firstAdmin.set({ sub: 'u1', handle: 'juan', email: 'a@b.com', avatarKey: null });
    expect(component.canSubmit()).toBe(false);
  });

  it('canSubmit is false when name exceeds 80 chars', () => {
    component.name.set('x'.repeat(81));
    component.firstAdmin.set({ sub: 'u1', handle: 'juan', email: 'a@b.com', avatarKey: null });
    expect(component.canSubmit()).toBe(false);
  });

  it('canSubmit is false when firstAdmin is null', () => {
    component.name.set('Coca-Cola');
    component.firstAdmin.set(null);
    expect(component.canSubmit()).toBe(false);
  });

  it('canSubmit is true when name 3-80 + firstAdmin set', () => {
    component.name.set('Coca-Cola');
    component.firstAdmin.set({ sub: 'u1', handle: 'juan', email: 'a@b.com', avatarKey: null });
    expect(component.canSubmit()).toBe(true);
  });

  it('submit() with valid form calls api.createCompany + emits created + close', async () => {
    component.name.set('Coca-Cola');
    component.contactEmail.set('rrhh@coca-cola.com');
    component.description.set('Marketing y RRHH');
    component.firstAdmin.set({ sub: 'admin-target', handle: 'juan', email: 'a@b.com', avatarKey: null });

    const createdEmitted: string[] = [];
    const closeEmitted: void[] = [];
    component.created.subscribe((id: string) => createdEmitted.push(id));
    component.close.subscribe(() => closeEmitted.push(undefined));

    await component.submit();

    expect(apiMock.createCompany).toHaveBeenCalledWith({
      name: 'Coca-Cola',
      contactEmail: 'rrhh@coca-cola.com',
      description: 'Marketing y RRHH',
      firstAdminUserId: 'admin-target',
    });
    expect(createdEmitted).toEqual(['c1']);
    expect(closeEmitted.length).toBe(1);
  });

  it('submit() with empty name sets error and does not call API', async () => {
    component.name.set('');
    component.firstAdmin.set({ sub: 'u1', handle: 'juan', email: 'a@b.com', avatarKey: null });
    await component.submit();
    expect(apiMock.createCompany).not.toHaveBeenCalled();
    expect(component.error()).toBeTruthy();
  });

  it('submit() API error sets error message', async () => {
    apiMock.createCompany.mockRejectedValueOnce(new Error('Network down'));
    component.name.set('Coca-Cola');
    component.firstAdmin.set({ sub: 'admin-target', handle: 'juan', email: 'a@b.com', avatarKey: null });

    await component.submit();

    expect(apiMock.createCompany).toHaveBeenCalled();
    expect(component.error()).toBeTruthy();
    expect(component.loading()).toBe(false);
  });

  it('submit() omits contactEmail/description from payload when empty', async () => {
    component.name.set('Coca-Cola');
    component.firstAdmin.set({ sub: 'admin-target', handle: 'juan', email: 'a@b.com', avatarKey: null });

    await component.submit();

    expect(apiMock.createCompany).toHaveBeenCalledWith({
      name: 'Coca-Cola',
      firstAdminUserId: 'admin-target',
    });
  });
});
