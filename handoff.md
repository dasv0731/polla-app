# Handoff — Empresas (Polla Mundialista)

**Fecha:** 2026-05-30
**Sesión cierra:** push completo, listo para clonar y seguir en otra máquina.

---

## Meta del proyecto

Implementar la **feature "Empresas"** para Polla Mundialista. Empresas pueden crear grupos privados con branding propio (logo + colores), invitaciones masivas, actividades (reemplazo de sponsors), y un panel de admin separado del super-admin. Diseño descompuesto en **5 sub-proyectos**:

1. **Sub-1 — Companies Foundation** ✅ **SHIPPED** (esta sesión)
2. Sub-2 — White-label theming (logo + colores)
3. Sub-3 — Bulk invitations + approval workflow
4. Sub-4 — Activities system (reemplaza comodines/sponsor)
5. Sub-5 — Company-admin panel UI completo

Sub-1 entrega: data model + super-admin CRUD + integración con Group editor existente.

---

## Estado del código

### Branches (ambos pusheados)

| Repo | Branch | HEAD | Estado |
|---|---|---|---|
| `polla-backend` | `feature/empresas-sub1` | `d010f6a` | pushed a `origin/feature/empresas-sub1` |
| `polla-app` | `feature/empresas-sub1` | `a3721a6` | pushed a `origin/feature/empresas-sub1` |

### URLs para abrir PR

- Backend: https://github.com/dasv0731/polla-backend/pull/new/feature/empresas-sub1
- Frontend: https://github.com/dasv0731/polla-app/pull/new/feature/empresas-sub1

### Tests

- **Backend:** 142/142 unit tests passing (`npx jest --maxWorkers=2` desde `polla-backend/`)
- **Frontend:** 178/178 tests passing (`npm test -- --watch=false` desde `polla-app/`)

### Sandbox Amplify

- Deploy ejecutado y verificado (248s)
- `polla-backend/amplify_outputs.json` regenerado
- `polla-app/amplify_outputs.json` copiado (raíz del frontend)
- ⚠ `polla-app/src/amplify_outputs.json` está **gitignored** — hay que copiarlo desde la raíz antes del primer `ng serve` en otra máquina:
  ```
  cp polla-app/amplify_outputs.json polla-app/src/amplify_outputs.json
  ```

---

## Archivos editados / creados

### `polla-backend/`

**Schema + errors**
- `src/lib/errors.ts` — 4 nuevos códigos: `COMPANY_NOT_FOUND`, `COMPANY_DISABLED`, `NOT_COMPANY_ADMIN`, `LAST_COMPANY_ADMIN`
- `src/lib/auth.ts` **(NEW)** — helpers `isCompanyAdmin` y `isGroupAdminOrAbove`
- `amplify/data/resource.ts` — añade enums `CompanyStatus` + `CompanyMemberRole`; modelos `Company` y `CompanyMember` (ambos con `.disableOperations(['create','update','delete'])` — **CRÍTICO**, sin esto el deploy falla con colisión de mutaciones); extiende `Group` con `companyId` + `category` + GSI `groupsByCompany`; registra 7 custom mutations

**7 Lambdas nuevas** (cada una con `handler.ts` + `resource.ts` + test):
- `amplify/functions/create-company/` — super-admin only, TransactWrite Company + CompanyMember
- `amplify/functions/update-company/` — sparse UpdateCommand + permission gate
- `amplify/functions/set-company-status/` — toggle ACTIVE/DISABLED (super-admin only)
- `amplify/functions/add-company-admin/` — idempotente
- `amplify/functions/remove-company-admin/` — con safeguard `LAST_COMPANY_ADMIN`
- `amplify/functions/create-company-group/` — reusa createGroup + adminUserId override + bloquea si `COMPANY_DISABLED`
- `amplify/functions/update-company-group/` — usa `isGroupAdminOrAbove`

**Wiring**
- `amplify/backend.ts` — registra las 7 lambdas con env vars (table names + GSI names) + `addEnvironment` + grants + `grantIndexQuery`

**Tests** (`tests/unit/`)
- `auth.test.ts`, `create-company.test.ts`, `update-company.test.ts`, `set-company-status.test.ts`, `add-company-admin.test.ts`, `remove-company-admin.test.ts`, `create-company-group.test.ts`, `update-company-group.test.ts`

### `polla-app/`

**Core**
- `src/app/core/notifications/domain-errors.ts` — 4 mappings con tono tú
- `src/app/core/api/api.service.ts` — 12 métodos nuevos (createCompany, updateCompany, setCompanyStatus, addCompanyAdmin, removeCompanyAdmin, createCompanyGroup, updateCompanyGroup, listCompanies, getCompany, listCompanyMembers, listCompanyGroups, searchUsers)
- `src/setup-jest.ts` — vaciado a `export {};` (Task 13 pre-fix — `@angular-builders/jest@18` ya hace `initTestEnvironment`, segundo call rompía)

**Feature `admin/companies/`** (NEW)
- `admin-picker.component.ts` + spec — picker debounced 300ms con token de cancelación, exporta `PickerUser` interface
- `create-company-modal.component.ts` + spec — modal standalone (`<app-modal>`) con name + contactEmail + description + AdminPicker
- `create-company-group-modal.component.ts` + spec — modal con name + tournamentId (`mundial-2026` fijo) + mode (SIMPLE/COMPLETE) + category + description + adminUserId optional
- `companies-list.component.ts` + spec — surface en `/admin/companies` con search filter
- `company-detail.component.ts` + spec — shell 4-tabs (General, Admins, Grupos, Branding read-only)

**Routes + nav**
- `src/app/features/admin/admin.routes.ts` — añade `companies` + `companies/:id` (guard heredado de `adminGuard` en parent)
- `src/app/features/admin/admin-shell.component.ts` — añade `{ path: '/admin/companies', label: 'Empresas' }` en grupo "Cuentas"

**Group editor extension**
- `src/app/features/groups/group-edit.component.ts` + spec — añade `isCompanyOwned` computed; en `save()` ramifica entre `api.updateCompanyGroup` y `api.updateGroup`; muestra hint "Editando grupo de empresa"

**Amplify outputs**
- `amplify_outputs.json` (raíz) — regenerado tras deploy

### Specs / plans (commiteados)

- `polla-app/docs/superpowers/specs/2026-05-30-empresas-master-design.md` — diseño master de los 5 sub-proyectos
- `polla-app/docs/superpowers/plans/2026-05-30-empresas-sub1-foundation.md` — Tasks 1-11 backend
- `polla-app/docs/superpowers/plans/2026-05-30-empresas-sub1-frontend.md` — Tasks 12-23 frontend

---

## Cosas que se intentaron y fallaron (con su fix)

### Backend

1. **`.default('ACTIVE')` en enum ref** — Amplify Gen 2 no lo soporta en enum refs.
   **Fix:** removido del schema; el handler hace `status: 'ACTIVE'` explícito en insert.

2. **Sandbox deploy falló con colisión de mutaciones** (`Object type extension 'Mutation' cannot redeclare field createCompany`)
   **Causa:** Amplify auto-genera `createX/updateX/deleteX` por cada `a.model()`. Las custom mutations chocaban.
   **Fix:** `.disableOperations(['create', 'update', 'delete'])` en `Company` y `CompanyMember`. Commit `d010f6a`.

### Frontend

3. **TestBed compilation rota en TODO el proyecto** después del Task 12 base
   **Síntoma:** `Cannot set base providers because it has already been called` en cada spec.
   **Causa:** `src/setup-jest.ts` importaba `jest-preset-angular/setup-jest` que llama `initTestEnvironment`, pero `@angular-builders/jest@18` ya lo hace via el wrapper. Doble inicialización.
   **Fix:** vaciar `setup-jest.ts` a `export {};` (commit `8230178` durante Task 13).

4. **`iconName="building"` no registrado** en `icon-map.ts`
   **Fix:** usar `iconName="users"` (consistente con `/admin/users`).

5. **Task 18 implementer omitió `tournamentId` + `mode`** del payload del create-group modal (interpretó "sparse" mal — esos campos son required, no optional)
   **Síntoma:** habría reventado en AppSync con validation error en producción.
   **Fix:** añadidos selects fijos en el modal, name capped a 40 chars (límite del handler), removido el `as unknown as Parameters<...>` cast. Commit `26a6302`.

6. **Voseo leak en Task 17** (`agregá` en tooltip) y **`.sec` global class collision** con `polla-doc.css`
   **Fix:** `agrega` + clase renombrada a `.cd-admins__head`. Commit `b2b1363`.

7. **Reviewer + fix subagent usaron `npx jest` directo** y reportaron 36 tests fallando con `ngModule null` error
   **Causa:** `npx jest` bypasea el wrapper de `@angular-builders/jest` que hace `initTestEnvironment`.
   **Verdad:** los tests pasaban — `npm test` los corre bien.
   **Memory guardada:** `feedback_test_runner.md` (siempre usar `npm test` o `npx ng test`, nunca `npx jest`).

8. **Plan decía añadir `canActivate` explícito** a cada nueva ruta en Task 20
   **Realidad:** todos los `/admin/*` heredan `adminGuard` del parent route, ninguno lo repite.
   **Fix:** no añadir guard duplicado; herencia es suficiente.

### Operacionales

9. **`npx jest` backend con default workers crasheó con OOM** en la verificación final
   **Fix:** `--maxWorkers=2`. 142/142 pasaron en 66s.

---

## Convenciones críticas (NO violar en próximas sesiones)

- **Tono:** tú (no voseo) — `agrega`, `crea`, `puedes`, `intenta`. NO `agregá`, `creá`, `podés`, `intentá`.
- **Emojis:** ninguno en strings user-facing.
- **Branding:** Golgana global (Sub-2 introduce white-label per-empresa).
- **CSS:** clases prefijadas (`.cd-*`, `.ccgm__*`, `.adm-*`, `.ge-company__*`) — el `polla-doc.css` global tiene `.sec`, `.row`, `.head`, `.list`, etc. y rompen sin avisar.
- **Tests:** `npm test`, nunca `npx jest` directo.
- **Sparse payloads:** omitir optionals vacíos; campos required (tournamentId, mode) siempre van.
- **Amplify models con custom mutations:** `.disableOperations(['create','update','delete'])` obligatorio.
- **Modelo de subagentes:** opus (no sonnet) — memory `feedback_agent_model`.
- **`amplify_outputs.json` en `src/` está gitignored** — copiar desde raíz antes de `ng serve`.

---

## Siguientes pasos

### Inmediato (para la próxima sesión)

1. **Clonar/pull en la otra máquina:**
   ```
   cd polla-backend && git fetch && git checkout feature/empresas-sub1 && git pull
   cd polla-app && git fetch && git checkout feature/empresas-sub1 && git pull
   ```

2. **Copiar amplify outputs y arrancar:**
   ```
   cd polla-app
   cp amplify_outputs.json src/amplify_outputs.json
   npm install
   npm start
   ```

3. **Smoke test del flow completo** (9 pasos en orden):
   1. Login como super-admin
   2. Admin shell → sub-nav "Empresas" debe estar visible
   3. **Crear empresa** (modal: name + contactEmail + admin picker → submit)
   4. **Tab General**: editar name → Guardar → recargar → verificar que persistió
   5. **Tab Admins**: agregar segundo admin · remover uno · botón "Remover" debe deshabilitarse cuando queda solo uno (con tooltip "Es el último admin")
   6. **Tab Grupos**: crear grupo (Mundial 2026 / SIMPLE) · clic "Editar" → debe ir a `/admin/groups/edit/:id` y mostrar hint "Editando grupo de empresa"
   7. **Tab Branding**: verificar banner azul read-only + 3 swatches grises (sin colores configurados) + "Sin logo configurado"
   8. **Toggle status** ACTIVE ↔ DISABLED desde el header (super-admin only)
   9. **Editar grupo de empresa**: cambiar name → Guardar → confirmar que llama `updateCompanyGroup` (no `updateGroup`) revisando network tab

4. **Si todo verde:** abrir 2 PRs (URLs arriba) y mergear a main.

5. **Si algo se rompe:** fix en `feature/empresas-sub1`, push, repetir smoke.

### Después del merge (cuándo arrancar Sub-2)

**Sub-2 — White-label theming** reemplaza el Tab Branding read-only por:
- Uploader de logo (S3 → `companies/{id}/logo.png`)
- Color pickers (primary / primary-dark / accent)
- Mutation `updateBranding` nueva (backend)
- Aplicación dinámica de los colores cuando el usuario está dentro de un grupo de empresa (cambia el CSS variables runtime)
- Logo de Golgana se reemplaza por logo de la empresa en grupos de empresa solamente

Empezar con `/superpowers:brainstorming` para el spec de Sub-2.

### Backlog identificado durante Sub-1 (TODO opcional)

- **N+1 fetch en `loadAdmins`** — `getUser` por cada admin. Batchear con `getUsers(subs[])` o expandir `user` en el resolver de `CompanyMember`.
- **`groupsByCompany` GSI** — `loadGroups` actualmente filtra con scan; necesita índice cuando crezca. (Sub-2 backend task.)
- **Category filter chips** en Tab Grupos — mencionado en plan línea 789, deferido.
- **Compartir `categoryLabel` const** entre modal y detail tab (DRY).
- **Token-cancellation en `loadAdmins`** — consistencia con admin-picker.
- **Surfacear `joinCode`** retornado por createCompanyGroup (lo discarda hoy).
- **Tipar `ApiService.getUser`** para eliminar el cast `as { data?: ... }` en company-detail.

---

## Memorias persistidas durante esta sesión

(Disponibles en futuras conversaciones de Claude Code via `MEMORY.md`)

- `feedback_test_runner.md` — usar `npm test`, no `npx jest`
- `project_empresas_sub1_done.md` — resumen del shipping
- (Pre-existentes relevantes: `feedback_css_gotchas`, `feedback_agent_model`, `project_ux_redesign_decisions`, `running_locally`)

---

## Comandos rápidos de referencia

```bash
# Estado de branches
cd polla-backend && git log --oneline origin/main..feature/empresas-sub1
cd polla-app && git log --oneline origin/main..feature/empresas-sub1

# Tests
cd polla-backend && npx jest --maxWorkers=2 --silent
cd polla-app && npm test -- --watch=false

# Sandbox deploy si hay que reanudar
cd polla-backend && npx ampx sandbox

# Build frontend
cd polla-app && npm run build

# Copia de outputs después de cada deploy
cp polla-app/amplify_outputs.json polla-app/src/amplify_outputs.json
```

---

**FIN HANDOFF**
