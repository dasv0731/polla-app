import { TestBed } from '@angular/core/testing';
import { Router, UrlTree } from '@angular/router';
import { companyAdminGuard } from './company-admin.guard';
import { AuthService } from './auth.service';
import { ApiService } from '../api/api.service';

function build(user: { sub: string; isAdmin: boolean } | null, adminships: unknown[]) {
  const auth = { user: () => user, loadUser: async () => user } as unknown as AuthService;
  const api = { listMyCompanyAdminships: jest.fn().mockResolvedValue({ data: adminships }) } as unknown as ApiService;
  TestBed.configureTestingModule({
    providers: [{ provide: AuthService, useValue: auth }, { provide: ApiService, useValue: api }],
  });
}

describe('companyAdminGuard', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('permite si el usuario es company-admin de ≥1 empresa', async () => {
    build({ sub: 'u1', isAdmin: false }, [{ companyId: 'c1' }]);
    const r = await TestBed.runInInjectionContext(() => companyAdminGuard({} as never, {} as never));
    expect(r).toBe(true);
  });

  it('permite si es super-admin aunque no tenga adminships', async () => {
    build({ sub: 'u1', isAdmin: true }, []);
    const r = await TestBed.runInInjectionContext(() => companyAdminGuard({} as never, {} as never));
    expect(r).toBe(true);
  });

  it('redirige (UrlTree) si no es admin de ninguna empresa', async () => {
    build({ sub: 'u1', isAdmin: false }, []);
    const r = await TestBed.runInInjectionContext(() => companyAdminGuard({} as never, {} as never));
    expect(r instanceof UrlTree).toBe(true);
  });
});
