# A4 Cleanup Pre-Delete Audit

Date: 2026-05-28
Branch: feature/ux-redesign-sprint-1

## auth-shell.component.ts references

```
src/app/shared/layout/auth-shell.component.ts:6:  selector: 'app-auth-shell',
src/app/shared/layout/auth-shell.component.ts:29:export class AuthShellComponent {}
```

Conclusion: ZERO consumers outside the file itself. **Safe to delete.**

## bracketReady consumers

```
src/app/shared/layout/sidebar.component.ts:232:  bracketReady = signal(false);
src/app/shared/layout/sidebar.component.ts:235:    void this.checkBracketReady();
src/app/shared/layout/sidebar.component.ts:238:  private async checkBracketReady();
src/app/shared/layout/sidebar.component.ts:251:      this.bracketReady.set(hasKO);
```

Conclusion: All 4 hits are in `sidebar.component.ts` (declaration + initializer + private method + setter). NO external consumers query `bracketReady`. **Safe to delete.**

## admin-articles references

```
(none in src/app/features/admin/)
```

The `listPublishedArticles` API still has 1 consumer:

```
src/app/shared/layout/right-rail.component.ts:579:      const res = await this.api.listPublishedArticles(4);
src/app/core/api/api.service.ts:687:  listPublishedArticles(limit = 4) {
```

Conclusion: admin-articles UI was **already removed in a prior sprint**. No files remaining (`admin-articles*` glob returns empty). No routes referenced in `admin.routes.ts`. The `listPublishedArticles` backend call is preserved for right-rail seed integration (per project memory: backend Article model retained until polla-public integration). **Safe — already deleted.**

## /groups/new references

```
src/app/app.routes.ts:68:        path: 'groups/new',
src/app/features/ranking/ranking.component.ts:170:            <a class="btn-wf btn-wf--primary" routerLink="/groups/new">Crear un grupo →</a>
src/app/features/profile/special-picks.component.ts:72:            <a class="link-green" routerLink="/groups/new">Crear un grupo →</a>
src/app/features/picks/group-stage-picks.component.ts:47:          <a class="link-green" routerLink="/groups/new">Crea uno →</a>
src/app/features/picks/bracket-picks.component.ts:155:          <a class="btn-wf btn-wf--primary" routerLink="/groups/new">Crear un grupo →</a>
src/app/features/picks/picks-list.component.ts:166:              <a routerLink="/groups/new" class="link-green">Crear grupo →</a>
```

Plus `GroupCreateComponent` exists at `src/app/features/groups/group-create.component.ts` (only consumed by the route entry above).

Conclusion: 1 route entry + 5 surfaces + 1 standalone component. **Safe to delete after refactoring 5 surfaces to modal triggers.**

## Material Symbols references

```
src/styles/tokens.css:33:  --font-icons:     "Material Symbols Outlined";
```

No component uses `--font-icons`, `material-symbols`, or `ms-outlined` classes. `index.html` does NOT include a `<link>` for Material Symbols font.

Conclusion: Dead token only. **Safe to delete.**

## app-topnav / app-tabbar references

```
src/styles/app.css: .app-tabbar*, .app-topnav (display:none rule)
src/app/shared/layout/nav.component.ts: all internal to component
```

Conclusion: Only consumed by `nav.component.ts` itself. **Safe to delete markup + CSS together.**

## Conclusion

- **Safe to delete immediately**: auth-shell.component.ts, checkBracketReady, Material Symbols token, app-topnav markup, app-tabbar markup, /groups/new route + GroupCreateComponent.
- **Already deleted in prior sprint**: admin-articles UI (no files exist).
- **Requires recovery (Task 4-5)**: bell badge subscription logic + user dropdown (currently buried in zombie nav.component).
- **Requires decision (Task 6)**: per-group ranking dropdown — recommendation is to NOT recover (enhance /ranking page tab instead).
- **Requires refactoring (Task 10)**: 5 surfaces using `routerLink="/groups/new"` must switch to `openCreate()` modal trigger.
