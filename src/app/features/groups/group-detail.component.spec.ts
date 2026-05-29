import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { GroupDetailComponent } from './group-detail.component';
import { ApiService } from '../../core/api/api.service';
import { AuthService } from '../../core/auth/auth.service';
import { ToastService } from '../../core/notifications/toast.service';

function loadGroupAdminWithFee() {
  return { data: {
    id: 'g1', name: 'Polla', adminUserId: 'admin-sub', mode: 'COMPLETE',
    description: null, imageKey: null, comodinesEnabled: true,
    entryFeeEnabled: true, entryFeeInstructions: 'Depositar a XXX',
    joinCode: 'ABC123', createdAt: '2026-01-01',
    prize1st: null, prize2nd: null, prize3rd: null,
  } };
}

describe('GroupDetailComponent — entry fee column (admin)', () => {
  let fixture: ComponentFixture<GroupDetailComponent>;
  let component: GroupDetailComponent;
  let apiMock: {
    getGroup: jest.Mock;
    groupMembers: jest.Mock;
    groupLeaderboard: jest.Mock;
    getUser: jest.Mock;
    markEntryFeePaid: jest.Mock;
  };

  function build(callerSub: string, feeEnabled = true) {
    apiMock = {
      getGroup: jest.fn().mockResolvedValue({ data: {
        ...loadGroupAdminWithFee().data,
        entryFeeEnabled: feeEnabled,
        entryFeeInstructions: feeEnabled ? 'Depositar a XXX' : null,
      } }),
      groupMembers: jest.fn().mockResolvedValue({ data: [
        { id: 'm-admin', userId: 'admin-sub', isAdmin: true, joinedAt: '2026-01-01', entryFeePaidAt: feeEnabled ? '2026-01-01T00:00:00Z' : null },
        { id: 'm-other', userId: 'other-sub', isAdmin: false, joinedAt: '2026-01-02', entryFeePaidAt: null },
      ] }),
      groupLeaderboard: jest.fn().mockResolvedValue({ data: [
        { userId: 'admin-sub', points: 10, exactCount: 1, resultCount: 1 },
        { userId: 'other-sub', points: 5, exactCount: 0, resultCount: 1 },
      ] }),
      getUser: jest.fn().mockImplementation((sub: string) => Promise.resolve({ data: { handle: sub, avatarKey: null } })),
      markEntryFeePaid: jest.fn().mockResolvedValue({ data: { ok: true, message: 'ok', paidAt: '2026-05-29T00:00:00Z' }, errors: undefined }),
    };
    TestBed.configureTestingModule({
      imports: [GroupDetailComponent],
      providers: [
        provideRouter([]),
        { provide: ApiService, useValue: apiMock },
        { provide: AuthService, useValue: { user: () => ({ sub: callerSub }) } },
        { provide: ToastService, useValue: { success: jest.fn(), error: jest.fn() } },
      ],
    });
    fixture = TestBed.createComponent(GroupDetailComponent);
    component = fixture.componentInstance;
    component.id = 'g1';
  }

  // Helper: TestBed's first `detectChanges()` re-fires `ngOnInit`, so we
  // run detectChanges() before our manual ngOnInit() and then await
  // stability so the load() promise chain settles before assertions.
  async function initAndSettle() {
    fixture.detectChanges(); // triggers Angular's auto-ngOnInit (load #1)
    await component.ngOnInit(); // manual ngOnInit (load #2, awaited)
    await fixture.whenStable(); // drain any pending microtasks
    fixture.detectChanges();
  }

  it('admin viewer: Cuota column header is rendered', async () => {
    build('admin-sub');
    await initAndSettle();
    const header = fixture.nativeElement.querySelector('th.cuota-col');
    expect(header).not.toBeNull();
  });

  it('non-admin viewer: Cuota column header is NOT rendered', async () => {
    build('other-sub');
    await initAndSettle();
    const header = fixture.nativeElement.querySelector('th.cuota-col');
    expect(header).toBeNull();
  });

  it('group with entryFeeEnabled=false: column not rendered even for admin', async () => {
    build('admin-sub', false);
    await initAndSettle();
    const header = fixture.nativeElement.querySelector('th.cuota-col');
    expect(header).toBeNull();
  });

  it('admin clicks checkbox for unpaid member: markEntryFeePaid called with paid=true', async () => {
    build('admin-sub');
    await initAndSettle();

    await component.toggleEntryFeePaid('other-sub', false);

    expect(apiMock.markEntryFeePaid).toHaveBeenCalledWith({
      groupId: 'g1', userId: 'other-sub', paid: true,
    });
  });

  it('admin clicks checkbox for paid member: markEntryFeePaid called with paid=false', async () => {
    build('admin-sub');
    await initAndSettle();

    await component.toggleEntryFeePaid('other-sub', true);

    expect(apiMock.markEntryFeePaid).toHaveBeenCalledWith({
      groupId: 'g1', userId: 'other-sub', paid: false,
    });
  });

  it('admin own row: toggleEntryFeePaid is a no-op (does not call API)', async () => {
    build('admin-sub');
    await initAndSettle();

    await component.toggleEntryFeePaid('admin-sub', true);

    expect(apiMock.markEntryFeePaid).not.toHaveBeenCalled();
  });

  it('mutation fails: optimistic update reverts, row entryFeePaidAt restored', async () => {
    build('admin-sub');
    apiMock.markEntryFeePaid.mockRejectedValueOnce(new Error('network'));
    await initAndSettle();

    const memberBefore = component.rows().find((m) => m.userId === 'other-sub');
    const paidBefore = memberBefore?.entryFeePaidAt;

    await component.toggleEntryFeePaid('other-sub', false);

    const memberAfter = component.rows().find((m) => m.userId === 'other-sub');
    expect(memberAfter?.entryFeePaidAt).toBe(paidBefore);
  });
});
