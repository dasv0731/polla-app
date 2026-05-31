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
    listPhases: jest.Mock;
    listMatches: jest.Mock;
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
      listPhases: jest.fn().mockResolvedValue({ data: [] }),
      listMatches: jest.fn().mockResolvedValue({ data: [] }),
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

describe('GroupDetailComponent — floating reminder', () => {
  let fixture: ComponentFixture<GroupDetailComponent>;
  let component: GroupDetailComponent;
  let apiMock: {
    getGroup: jest.Mock;
    groupMembers: jest.Mock;
    groupLeaderboard: jest.Mock;
    getUser: jest.Mock;
    listPhases: jest.Mock;
    listMatches: jest.Mock;
    markEntryFeePaid: jest.Mock;
  };

  function build(callerSub: string, callerPaid: boolean, feeEnabled: boolean) {
    apiMock = {
      getGroup: jest.fn().mockResolvedValue({ data: {
        id: 'g1', name: 'Polla', adminUserId: 'admin-sub', mode: 'COMPLETE',
        description: null, imageKey: null, comodinesEnabled: true,
        entryFeeEnabled: feeEnabled,
        entryFeeInstructions: feeEnabled ? 'Depositar $20\nA cuenta XXX' : null,
        joinCode: 'ABC123', createdAt: '2026-01-01',
        prize1st: null, prize2nd: null, prize3rd: null,
      } }),
      groupMembers: jest.fn().mockResolvedValue({ data: [
        { id: 'm-admin', userId: 'admin-sub', isAdmin: true, joinedAt: '2026-01-01', entryFeePaidAt: feeEnabled ? '2026-01-01T00:00:00Z' : null },
        { id: 'm-other', userId: 'other-sub', isAdmin: false, joinedAt: '2026-01-02', entryFeePaidAt: callerPaid ? '2026-01-03T00:00:00Z' : null },
      ] }),
      groupLeaderboard: jest.fn().mockResolvedValue({ data: [
        { userId: 'admin-sub', points: 10, exactCount: 1, resultCount: 1 },
        { userId: 'other-sub', points: 5, exactCount: 0, resultCount: 1 },
      ] }),
      getUser: jest.fn().mockImplementation((sub: string) => Promise.resolve({ data: { handle: sub, avatarKey: null } })),
      listPhases: jest.fn().mockResolvedValue({ data: [] }),
      listMatches: jest.fn().mockResolvedValue({ data: [] }),
      markEntryFeePaid: jest.fn(),
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

  async function initAndSettle() {
    fixture.detectChanges();
    await component.ngOnInit();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('member is unpaid + fee enabled: showEntryFeeReminder() === true', async () => {
    build('other-sub', false, true);
    await initAndSettle();
    expect(component.showEntryFeeReminder()).toBe(true);
  });

  it('member is paid: showEntryFeeReminder() === false', async () => {
    build('other-sub', true, true);
    await initAndSettle();
    expect(component.showEntryFeeReminder()).toBe(false);
  });

  it('fee disabled at group level: showEntryFeeReminder() === false', async () => {
    build('other-sub', false, false);
    await initAndSettle();
    expect(component.showEntryFeeReminder()).toBe(false);
  });

  it('admin (own row paid): showEntryFeeReminder() === false', async () => {
    build('admin-sub', true, true);
    await initAndSettle();
    expect(component.showEntryFeeReminder()).toBe(false);
  });

  it('reminder renders in DOM when showEntryFeeReminder() is true', async () => {
    build('other-sub', false, true);
    await initAndSettle();
    const reminder = fixture.nativeElement.querySelector('[data-testid="entry-fee-reminder"]');
    expect(reminder).not.toBeNull();
    expect(reminder.getAttribute('aria-label')).toContain('Cuota');
  });

  it('clicking openEntryFeeModal renders modal with instructions text', async () => {
    build('other-sub', false, true);
    await initAndSettle();
    component.openEntryFeeModal();
    fixture.detectChanges();
    const modal = fixture.nativeElement.querySelector('[data-testid="entry-fee-modal"]');
    expect(modal).not.toBeNull();
    expect(modal.textContent).toContain('Depositar $20');
    expect(modal.textContent).toContain('A cuenta XXX');
  });

  it('modal body has class entry-fee-modal-body (pre-line styling)', async () => {
    build('other-sub', false, true);
    await initAndSettle();
    component.openEntryFeeModal();
    fixture.detectChanges();
    const body = fixture.nativeElement.querySelector('.entry-fee-modal-body');
    expect(body).not.toBeNull();
  });

  it('window focus triggers refreshMemberships → groupMembers called again', async () => {
    build('other-sub', false, true);
    await initAndSettle();
    apiMock.groupMembers.mockClear();
    window.dispatchEvent(new Event('focus'));
    await Promise.resolve();
    await Promise.resolve();
    expect(apiMock.groupMembers).toHaveBeenCalledTimes(1);
  });
});

describe('GroupDetailComponent — jornada actual (Sub-1)', () => {
  function buildWith(phases: unknown[], matches: unknown[]) {
    const apiMock = {
      getGroup: jest.fn().mockResolvedValue({ data: {
        id: 'g1', name: 'G', adminUserId: 'me', mode: 'COMPLETE',
        joinCode: 'ABC123', createdAt: '2026-01-01',
        prize1st: null, prize2nd: null, prize3rd: null,
        entryFeeEnabled: false, entryFeeInstructions: null,
      } }),
      groupLeaderboard: jest.fn().mockResolvedValue({ data: [] }),
      groupMembers: jest.fn().mockResolvedValue({ data: [] }),
      getUser: jest.fn().mockResolvedValue({ data: { handle: 'me', avatarKey: null } }),
      listPhases: jest.fn().mockResolvedValue({ data: phases }),
      listMatches: jest.fn().mockResolvedValue({ data: matches }),
      markEntryFeePaid: jest.fn(),
    };
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [GroupDetailComponent],
      providers: [
        provideRouter([]),
        { provide: ApiService, useValue: apiMock },
        { provide: AuthService, useValue: { user: () => ({ sub: 'me' }) } },
        { provide: ToastService, useValue: { success: jest.fn(), error: jest.fn() } },
      ],
    });
    const fixture = TestBed.createComponent(GroupDetailComponent);
    fixture.componentInstance.id = 'g1';
    return fixture;
  }

  it('jornada actual = primera phase (por order) con match no-FINAL', async () => {
    const fixture = buildWith(
      [{ id: 'p1', order: 1, name: 'Fecha 1' }, { id: 'p2', order: 2, name: 'Fecha 2' }],
      [
        { id: 'm1', phaseId: 'p1', status: 'FINAL', kickoffAt: '2026-06-11T19:00:00Z' },
        { id: 'm2', phaseId: 'p2', status: 'SCHEDULED', kickoffAt: '2026-06-15T19:00:00Z' },
      ],
    );
    fixture.detectChanges();
    await fixture.componentInstance.ngOnInit();
    await fixture.whenStable();
    const j = fixture.componentInstance.currentJornada();
    expect(j?.order).toBe(2);
    expect(j?.label).toBe('J2');
    expect(j?.totalJornadas).toBe(2);
  });

  it('acierto% = (exact+result)/partidosFINAL', async () => {
    const fixture = buildWith(
      [{ id: 'p1', order: 1, name: 'Fecha 1' }],
      [
        { id: 'm1', phaseId: 'p1', status: 'FINAL', kickoffAt: '2026-06-11T19:00:00Z' },
        { id: 'm2', phaseId: 'p1', status: 'FINAL', kickoffAt: '2026-06-12T19:00:00Z' },
        { id: 'm3', phaseId: 'p1', status: 'FINAL', kickoffAt: '2026-06-13T19:00:00Z' },
        { id: 'm4', phaseId: 'p1', status: 'SCHEDULED', kickoffAt: '2026-06-14T19:00:00Z' },
      ],
    );
    fixture.detectChanges();
    await fixture.componentInstance.ngOnInit();
    await fixture.whenStable();
    // 2 aciertos (1 exacto + 1 resultado) sobre 3 FINAL = 67%
    expect(fixture.componentInstance.acierto({ exactCount: 1, resultCount: 1 } as never)).toBe('67%');

    const none = buildWith([{ id: 'p1', order: 1, name: 'F1' }], [{ id: 'm1', phaseId: 'p1', status: 'SCHEDULED', kickoffAt: '2026-06-14T19:00:00Z' }]);
    none.detectChanges(); await none.componentInstance.ngOnInit(); await none.whenStable();
    expect(none.componentInstance.acierto({ exactCount: 0, resultCount: 0 } as never)).toBe('—');
  });

  it('sin matches → currentJornada null', async () => {
    const fixture = buildWith([], []);
    fixture.detectChanges();
    await fixture.componentInstance.ngOnInit();
    await fixture.whenStable();
    expect(fixture.componentInstance.currentJornada()).toBeNull();
  });
});
