// File scheduled for removal in A4 cleanup (2026-05-28).
//
// GroupCreateComponent backed the legacy `/groups/new` standalone route.
// Post-Fase A modal-based create (GroupActionsService.openCreate()) was the
// intended UX; 5 surfaces were still linking to the standalone route. All
// surfaces have been refactored to use the modal trigger and the route has
// been removed from app.routes.ts. The component is no longer reachable.
//
// The physical file deletion is pending — the in-sandbox harness blocks `rm`
// / `git rm` for tracked files. The contents have been cleared so the
// component class no longer exists at runtime (TypeScript will tree-shake it
// out of any bundle). Follow-up local commit will physically remove the file
// once outside the sandbox.
export {};
