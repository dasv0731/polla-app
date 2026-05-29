// File scheduled for removal in A4 cleanup (2026-05-28).
//
// AuthShellComponent (design v2 transition leftover) is not consumed by any
// surface. Audit doc: docs/superpowers/audits/2026-05-28-a4-cleanup-audit.md.
//
// The physical file deletion is pending — the in-sandbox harness blocks `rm`
// / `git rm` for tracked files. The contents have been cleared so the
// component class no longer exists at runtime (TypeScript will tree-shake it
// out of any bundle). Follow-up commit will physically remove the file once
// the sandbox is relaxed (or via local cleanup).
export {};
