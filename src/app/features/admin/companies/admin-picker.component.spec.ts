import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { AdminPickerComponent, PickerUser } from './admin-picker.component';
import { ApiService } from '../../../core/api/api.service';

describe('AdminPickerComponent', () => {
  let component: AdminPickerComponent;
  let apiMock: { searchUsers: jest.Mock };

  beforeEach(() => {
    apiMock = {
      searchUsers: jest.fn().mockResolvedValue({ data: [
        { sub: 'u1', handle: 'juan', email: 'juan@example.com', avatarKey: null },
        { sub: 'u2', handle: 'juana', email: 'juana@example.com', avatarKey: null },
      ] }),
    };
    TestBed.configureTestingModule({
      imports: [AdminPickerComponent],
      providers: [{ provide: ApiService, useValue: apiMock }],
    });
    const fixture = TestBed.createComponent(AdminPickerComponent);
    component = fixture.componentInstance;
  });

  it('does not search for queries shorter than 2 characters', fakeAsync(() => {
    component.onInput('j');
    tick(400);
    expect(apiMock.searchUsers).not.toHaveBeenCalled();
  }));

  it('debounces searches with 300ms', fakeAsync(() => {
    component.onInput('juan');
    tick(100);
    expect(apiMock.searchUsers).not.toHaveBeenCalled();
    tick(300);
    expect(apiMock.searchUsers).toHaveBeenCalledTimes(1);
    expect(apiMock.searchUsers).toHaveBeenCalledWith('juan');
  }));

  it('cancels in-flight search when a new query arrives within debounce window', fakeAsync(() => {
    component.onInput('jua');
    tick(100);
    component.onInput('juan');
    tick(400);
    expect(apiMock.searchUsers).toHaveBeenCalledTimes(1);
    expect(apiMock.searchUsers).toHaveBeenCalledWith('juan');
  }));

  it('select(user) emits userSelected with the chosen row + clears input', () => {
    const user: PickerUser = { sub: 'u1', handle: 'juan', email: 'juan@example.com', avatarKey: null };
    const emitted: Array<PickerUser | null> = [];
    component.userSelected.subscribe((u: PickerUser | null) => emitted.push(u));
    component.select(user);
    expect(emitted).toEqual([user]);
    expect(component.query()).toBe('');
    expect(component.results().length).toBe(0);
  });

  it('clear() emits userSelected(null) + resets state', () => {
    component.query.set('juan');
    component.results.set([{ sub: 'u1', handle: 'juan', email: 'juan@example.com', avatarKey: null }]);
    const emitted: Array<PickerUser | null> = [];
    component.userSelected.subscribe((u: PickerUser | null) => emitted.push(u));
    component.clear();
    expect(emitted).toEqual([null]);
    expect(component.query()).toBe('');
    expect(component.results().length).toBe(0);
  });
});
