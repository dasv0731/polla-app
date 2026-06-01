# Empresas SP-6 — Super-admin crea empresa + invita al RRHH por email — Plan

> REQUIRED SUB-SKILL: superpowers:subagent-driven-development.

**Goal:** El super-admin crea una empresa e **invita al company-admin (RRHH) por email** (sin requerir que exista de antes). Clon del patrón `DepartmentInvite`/`acceptDepartmentInvite`, pero para el rol company-admin (`CompanyMember ADMIN`).

**Architecture:** Nuevo modelo `CompanyAdminInvite` + `inviteCompanyAdmin` (existing user → admin directo; nuevo → invite PENDING + code) + `acceptCompanyAdminInvite` (email coincide → CompanyMember ADMIN). `createCompany.firstAdminUserId` pasa a opcional. UI super-admin: crear empresa por email; UI RRHH: aceptar con código.

**Tests:** backend `npx jest --maxWorkers=2`; front `npm test -- --no-watch`.

---

## TASK 1 — Modelo `CompanyAdminInvite`
`amplify/data/resource.ts`, cerca de `DepartmentInvite` (reusa el enum `DepartmentInviteStatus`):
```typescript
  CompanyAdminInvite: a
    .model({
      companyId: a.id().required(),
      invitedEmail: a.email().required(),
      code: a.string().required(),
      status: a.ref('DepartmentInviteStatus').required(),  // PENDING/ACCEPTED/REVOKED
      userId: a.id(),
      createdBy: a.id().required(),
      createdAt: a.datetime().required(),
    })
    .secondaryIndexes((idx) => [idx('companyId').name('adminInvitesByCompany'), idx('code').name('adminInviteByCode')])
    .disableOperations(['create', 'update', 'delete'])
    .authorization((allow) => [allow.authenticated().to(['read']), allow.group('admins')]),
```
Commit: `feat(schema): modelo CompanyAdminInvite`.

## TASK 2 — `createCompany.firstAdminUserId` opcional
- `resource.ts`: en la mutation `createCompany`, cambiar `firstAdminUserId: a.id().required()` → `firstAdminUserId: a.id()`.
- `amplify/functions/create-company/handler.ts`: hacer `firstAdminUserId` opcional en la interface; solo validar que existe + incluir el Put de `CompanyMember` **cuando viene**; si no viene, el TransactWrite solo crea la `Company`. Test: crear sin firstAdminUserId → solo Company, sin CompanyMember.
- Commit: `feat(create-company): firstAdminUserId opcional (empresa sin admin)`.

## TASK 3 — Lambda `invite-company-admin` (TDD)
`amplify/functions/invite-company-admin/{resource.ts,handler.ts}` + test. Auth: super-admin o company-admin de companyId (empresa ACTIVE para no-super). Lógica:
- Query `userByEmail(email)` (GSI del modelo User). Si hay usuario → idempotente como `add-company-admin` (crea `CompanyMember ADMIN` si no lo es) → devuelve `{ added: true, code: '' }`.
- Si no hay usuario → crea `CompanyAdminInvite` PENDING (code = generateJoinCode()) → devuelve `{ added: false, code }`.
Env: COMPANY_TABLE, COMPANY_MEMBER_TABLE, COMPANY_MEMBER_INDEX='companiesByUser', USER_TABLE, USER_EMAIL_INDEX='userByEmail', COMPANY_ADMIN_INVITE_TABLE. Tests: email existente→added true + CompanyMember Put; email nuevo→added false + CompanyAdminInvite Put PENDING; no-admin→NOT_COMPANY_ADMIN; email inválido→VALIDATION_ERROR.
Commit: `feat(invite-company-admin): invitar RRHH por email`.

## TASK 4 — Lambda `accept-company-admin-invite` (TDD)
`amplify/functions/accept-company-admin-invite/{resource.ts,handler.ts}` + test. Args `{ code }`. Lógica (clon de accept-department-invite, pero crea CompanyMember ADMIN en vez de Group):
- Query `adminInviteByCode(code)` → invite; si no → DEPARTMENT_INVITE_NOT_FOUND (reusar); si status != PENDING → VALIDATION_ERROR.
- Get User(caller).email == invite.invitedEmail (case-insensitive) else NOT_INVITED.
- TransactWrite: Put `CompanyMember` (id ulid, companyId, userId=caller, role ADMIN, invitedAt/joinedAt now) + Update `CompanyAdminInvite` (status ACCEPTED, userId, cond status=PENDING).
- Devuelve `{ companyId }`.
Env: COMPANY_MEMBER_TABLE, COMPANY_ADMIN_INVITE_TABLE, COMPANY_ADMIN_INVITE_CODE_INDEX='adminInviteByCode', USER_TABLE. Tests: acepta → CompanyMember ADMIN + invite ACCEPTED; código inexistente → NOT_FOUND; email distinto → NOT_INVITED; ya ACCEPTED → VALIDATION_ERROR.
Commit: `feat(accept-company-admin-invite): RRHH acepta y queda como company-admin`.

## TASK 5 — Mutations + wiring
`resource.ts`: mutations `inviteCompanyAdmin` (returns `{ added: boolean!, code: string! }`) y `acceptCompanyAdminInvite` (returns `{ companyId: string! }`), ambas `allow.authenticated()`. `backend.ts`: imports + defineBackend + consts (`companyAdminInviteTable = tables['CompanyAdminInvite']!`) + wiring (invite: Company read, CM read+index, User read + `grantIndexQuery` userByEmail, CompanyAdminInvite write, CompanyMember write; accept: CM write, CompanyAdminInvite readWrite + index, User read). `npx tsc --noEmit` + jest verde. Commit: `feat(schema): mutations invite/acceptCompanyAdmin + wiring`.

## TASK 6 — Front api.service
```typescript
inviteCompanyAdmin(input: { companyId: string; email: string }) // cast → { added, code }
acceptCompanyAdminInvite(code: string) // cast → { companyId }
```
+ cambiar `createCompany` para que `firstAdminUserId` sea opcional en el input. Commit.

## TASK 7 — Front super-admin: crear empresa por email
En `companies-list.component.ts` / `create-company-modal.component.ts`: el form de crear empresa pasa de "elegir usuario (AdminPicker)" a **nombre + email del RRHH** (+ contactEmail/descr opcionales). Al crear: `createCompany({name, contactEmail, description})` (sin admin) → `inviteCompanyAdmin({companyId, email})` → si `added` mostrar "X ya es admin"; si no, mostrar el **código/link** a compartir (toast + un campo copiable). Commit.

## TASK 8 — Front RRHH: aceptar invitación de admin
Nueva ruta `/empresa/admin-invitacion` (sin companyAdminGuard — el RRHH aún no es admin; protegida por authGuard del shell) + componente: input código → `acceptCompanyAdminInvite(code)` → toast + navega a `/empresa/:companyId`. Commit.

## Notas
- Reusa `DepartmentInviteStatus`, `generateJoinCode`, `isCompanyAdmin`, el patrón de invite. Email real (envío) = follow-up; por ahora se comparte el código.
- Deploy humano tras implementar.
