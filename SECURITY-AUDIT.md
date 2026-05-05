# Auditoría de Seguridad — polla-app + polla-backend

**Fecha:** 2026-05-05
**Alcance:** Auth (AppSync + Cognito), validación de inputs en Lambdas, secretos hardcodeados, dependencias npm, S3 storage, frontend XSS.
**Repos auditados:**
- `polla-app` (frontend Angular 18, commit `944281d`)
- `polla-backend` (Amplify Gen 2, commit `dbf33c2`)

**Estado de remediación post-audit (2026-05-05 18:25):**
- ✅ **H-01 RESUELTO**: InviteCode ya no es listable. Mutation custom `previewJoinCode` reemplaza el chain de queries del frontend.
- ⚠️ **H-02 PENDIENTE**: requiere refactor de Group (split en GroupPublic + GroupSecrets). Bloqueado por limitación de Amplify Gen 2 — `mode: a.ref()` no soporta field-level auth, lo que impide aplicar `.authorization()` a `joinCode`.
- ⚠️ **H-03 PENDIENTE**: requiere refactor de User (split en UserPublicProfile + User). `a.email()` no soporta field-level auth.

---

## Severidades

| Símbolo | Significado |
|---|---|
| 🔴 Critical | Bug explotable que da acceso a datos / acciones de otros usuarios sin autenticación o con privilegios mínimos |
| 🟠 High | Bug que rompe el modelo de control de acceso entre usuarios autenticados |
| 🟡 Medium | Debilidad que requiere condiciones específicas o reduce defensa en profundidad |
| 🔵 Low | Mejora recomendable pero sin riesgo inmediato |
| ⚪ Info | Observación, no es vulnerabilidad |

---

## Resumen ejecutivo

| Categoría | Critical | High | Medium | Low | Info |
|---|---|---|---|---|---|
| AppSync auth | 0 | 2 | 1 | 0 | 1 |
| Lambda inputs | 0 | 0 | 2 | 1 | 0 |
| Secretos | 0 | 0 | 0 | 0 | 1 |
| Dependencias | 0 | 1 | 1 | 0 | 0 |
| Storage S3 | 0 | 0 | 0 | 0 | 1 |
| Frontend | 0 | 0 | 0 | 0 | 1 |
| **Total** | **0** | **3** | **4** | **1** | **4** |

**Veredicto general:** ✅ La app no tiene vulnerabilidades críticas. Hay **3 hallazgos High** que conviene resolver antes de invitar usuarios públicos, principalmente relacionados con la exposición del invite code y de los emails en el leaderboard.

---

## ✅ H-01 — InviteCode publicly listable por cualquier authenticated user — RESUELTO

**Archivo:** `polla-backend/amplify/data/resource.ts` líneas 333-336

```ts
InviteCode: a
  .model({ code: a.id().required(), groupId: a.id().required() })
  .authorization((allow) => [
    allow.authenticated().to(['read']),     // ← expone listInviteCodes
    allow.group('admins'),
  ]),
```

**Riesgo:** El permiso `allow.authenticated().to(['read'])` habilita tanto `getInviteCode` como `listInviteCodes` en el schema GraphQL generado. Cualquier usuario logged-in puede ejecutar:

```graphql
query { listInviteCodes { items { code groupId } } }
```

Y obtener todos los códigos de invitación → joinear cualquier grupo.

**Fix aplicado:**
1. InviteCode auth → solo admins por GraphQL.
2. Nueva mutation custom `previewJoinCode(code)` que devuelve info mínima del grupo (groupId, groupName, ownerHandle, memberCount, alreadyMember). Lambda hace lookup server-side.
3. Frontend `getInviteCode` reemplazado por `previewJoinCode` en `group-join.component.ts`.
4. Deployado en `dbf33c2`+ (sandbox commit pendiente de push).

```ts
// Antes
allow.authenticated().to(['read']),    // ← listInviteCodes habilitado

// Después
.authorization((allow) => [
  allow.group('admins'),                // solo admins (QA/inspección)
])
```

---

## 🟠 H-02 — Group.joinCode visible en `listGroups` para todos los authenticated — PENDIENTE

**Archivo:** `polla-backend/amplify/data/resource.ts` líneas 274-307

```ts
Group: a.model({
  ...
  joinCode: a.string().required(),    // duplicado para "fast UI display"
}).authorization((allow) => [
  allow.authenticated().to(['read']),    // ← expone joinCode
  allow.ownerDefinedIn('adminUserId').to(['update', 'delete']),
  allow.group('admins'),
]),
```

**Riesgo:** Mismo problema que H-01 vía un vector distinto. El campo `joinCode` está duplicado en `Group` (per comment "for fast UI display"). Cualquier user puede listar grupos y obtener el `joinCode` → joinearlos.

**Limitación encontrada:** En Amplify Gen 2, agregar `.authorization()` a un field requiere que TODOS los required fields del modelo lo tengan. Sin embargo `mode: a.ref('GameMode')` **no soporta field-level auth** (lanza `InvalidDirectiveError` al synth). Lo mismo para `a.enum()` y `a.email()`. Por eso no se puede gatear `joinCode` con field-level auth sin refactor.

**Fix programado (post-launch):**
1. **Splitear Group en dos modelos:**
   - `GroupPublic` — id, name, tournamentId, mode, prizes, etc. Lectura pública via authenticated.
   - `Group` (privado) — id (FK a GroupPublic), joinCode, adminUserId. Solo lectura por admin.
2. **O:** custom resolver `getGroupJoinCode(groupId)` que checkea Membership y devuelve el código solo a members.

**Mitigación interim:** dado que la app aún no tiene usuarios públicos (sandbox dev), el riesgo es bajo. Cuando se invite a usuarios reales, hacer el refactor antes.

---

## 🟠 H-03 — User.email expuesto a todos los authenticated (PII leak) — PENDIENTE

**Archivo:** `polla-backend/amplify/data/resource.ts` líneas 108-125

```ts
User: a.model({
  sub, handle, email, emailStatus, createdAt
}).authorization((allow) => [
  allow.ownerDefinedIn('sub').to(['create', 'read', 'update']),
  allow.group('admins'),
  allow.authenticated().to(['read']),    // ← expone email
])
```

**Riesgo:** El comentario dice "public profile data on leaderboard" — pero NO hay field-level auth. Cualquier user logged-in puede ejecutar `listUsers` y obtener todos los emails registrados. **PII exposure**.

**Limitación encontrada:** Misma que H-02 — `a.email()` y `a.enum()` no soportan `.authorization()` en Amplify Gen 2. No se puede aplicar field-level auth a `email` sin migrar el field a `a.string()` (perdiendo validation), Y aun así Amplify exige rules en TODOS los required fields, lo que tampoco es viable porque el modelo tiene fields tipo `a.enum`.

**Fix programado (post-launch):**
1. **Splitear User en dos modelos:**
   - `UserPublicProfile` — sub, handle, createdAt. Lectura authenticated (leaderboard).
   - `User` (privado) — sub (FK a UserPublicProfile), email, emailStatus. Solo lectura owner.
2. Migrar data: split rows existentes en 2 tablas.
3. Update frontend para resolver el handle via UserPublicProfile en leaderboards.

**Mitigación interim:** dado que la app aún no está expuesta públicamente, el riesgo es contenido. Pre-launch es mandatorio cerrarlo.

---

## 🟡 M-01 — Pick.create permitido a SIMPLE-mode users

**Archivo:** `polla-backend/amplify/functions/upsert-pick/handler.ts`

**Issue:** El handler valida ownership (identity.sub) y rango de scores, pero NO valida que el user esté en un grupo de modo COMPLETE. Spec dice que solo COMPLETE escribe Pick. Un SIMPLE user puede escribir picks que no se scorean — pollución de data.

**Fix:** Verificar que el user tenga al menos una `Membership` en un `Group` con `mode='COMPLETE'` antes de aceptar el upsert.

```ts
const memberships = await ddb.send(new QueryCommand({
  TableName: MEMBERSHIP,
  IndexName: 'groupsByUser',
  KeyConditionExpression: 'userId = :u',
  ExpressionAttributeValues: { ':u': userId },
}));
const groupIds = (memberships.Items ?? []).map((m) => m.groupId);
const groupModes = await Promise.all(groupIds.map((gid) =>
  ddb.send(new GetCommand({ TableName: GROUP, Key: { id: gid } }))
));
const isComplete = groupModes.some((g) => g.Item?.mode === 'COMPLETE');
if (!isComplete) throw new DomainError('NOT_COMPLETE_MODE');
```

---

## 🟡 M-02 — `create-group` no valida `name` length ni `tournamentId` existence

**Archivo:** `polla-backend/amplify/functions/create-group/handler.ts` líneas 26-33

**Issue:**
- `name` puede ser vacío `""` o un MB de caracteres (Lambda limit 6MB pero igual mal UX)
- `tournamentId` no se valida que exista en la tabla Tournament
- `description` sin límite de longitud
- `imageKey` no se valida que esté bajo un prefix permitido (e.g. `groups/` o `sponsors/`) — un user podría apuntar a un objeto S3 fuera de su scope

**Fix:**
```ts
if (!name || name.trim().length < 2 || name.length > 80) {
  throw new DomainError('VALIDATION_ERROR', 'name length 2-80');
}
if (description && description.length > 500) {
  throw new DomainError('VALIDATION_ERROR', 'description max 500');
}
if (imageKey && !imageKey.startsWith('groups/')) {
  throw new DomainError('VALIDATION_ERROR', 'imageKey must be in groups/ path');
}
const t = await ddb.send(new GetCommand({ TableName: TOURNAMENT, Key: { slug: tournamentId } }));
if (!t.Item) throw new DomainError('TOURNAMENT_NOT_FOUND');
```

---

## 🟡 M-03 — `UserTournamentTotal` expuesto via `publicApiKey().to(['read'])`

**Archivo:** `polla-backend/amplify/data/resource.ts` (busqueda automática)

**Issue:** El leaderboard global está expuesto via API key sin autenticación. Esto fue intencional (leaderboard público en sitio web), pero conviene confirmar que NO hay PII en este modelo. Verifiqué los fields: `userId, tournamentId, points, exactCount, resultCount, ...` — userId es Cognito sub (opaco). OK siempre que el sub no se use como username público.

**Fix:** Confirmar (no es bug, es decisión de diseño). Si en el futuro se agregan campos sensibles a este modelo, gatear con `allow.authenticated()`.

---

## 🟡 M-04 — Dependencies con CVEs en polla-app y polla-backend

**Output `npm audit`:**
- polla-app: 93 vulnerabilities (15 low, 12 moderate, 46 high, 20 critical)
- polla-backend: 44 vulnerabilities (12 low, 1 moderate, 30 high, 1 critical)

**Análisis rápido:** La mayoría de criticals están en dev/build tooling (`@angular-devkit/build-angular`, `@angular-builders/jest`, webpack chains). Estas NO impactan runtime de producción — solo el entorno de desarrollo.

Las que deberían revisarse con prioridad:
- `uuid` (en backend, transitivo via Amplify): bug de buffer bounds en v3/v5/v6
- Cualquier vulnerable en `@angular/animations`, `@angular/core`, runtime libs

**Fix sugerido:**
```bash
# polla-backend
cd polla-backend && npm audit fix      # non-breaking solamente
# Revisar manualmente las que requieran --force

# polla-app
cd polla-app && npm audit fix
# Para criticals en dev tooling, considerar bump major de @angular-devkit
```

---

## 🔵 L-01 — `redeem-sponsor-code` y otros lambdas no validan rate limiting

**Issue:** Las mutations no tienen throttling per-user. Un attacker autenticado podría:
- Brute-force sponsor codes
- DoS de Lambda invocations
- Exhausting limits de DynamoDB

**Fix:** Implementar throttle via:
- AppSync resolver-level: `@aws_throttle` (requires custom config)
- DynamoDB: implementar contador de invocaciones por user/min con `UpdateExpression: ADD count :one`
- WAF rules (más caro, pero global)

Prioridad baja porque la app aún no está expuesta públicamente.

---

## ⚪ I-01 — `amplify_outputs.json` con API key commiteado en polla-app

**Archivo:** `polla-app/amplify_outputs.json` (en repo)

**Observación:** El archivo contiene la API key `da2-y4inls5vozaf7n2pjaiow4omf4`. Este es el patrón **estándar** de Amplify Gen 2: el frontend necesita la API key en build time para inicializar el cliente. La API key solo permite reads en modelos explícitamente marcados con `allow.publicApiKey()`.

**Mitigación existente:**
- Backend `amplify_outputs.json` está gitignored (✓ correcto)
- Frontend root está intencionalmente committeado (✓ documentado en .gitignore)
- Solo expone reads de Tournament/Phase/Team/Match/Sponsor/TriviaQuestion/SpecialResult/UserTournamentTotal

**Acción:** None. Si en el futuro el repo es público en GitHub, considerar:
- Rotar la API key periódicamente (Amplify la regenera al deploy)
- Usar Identity Pool unauth-role en lugar de API key para reads públicos

---

## ⚪ I-02 — `S3 storage` policy correcta

**Archivo:** `polla-backend/amplify/storage/resource.ts`

```ts
'sponsors/banners/*': [
  allow.authenticated.to(['read']),
  allow.groups(['admins']).to(['read', 'write', 'delete']),
],
```

✓ No hay `allow.guest`
✓ Solo authenticated puede leer (vía signed URLs)
✓ Solo admin puede write/delete
✓ Path-restricted (sponsors/banners/*)

Sin observaciones.

---

## ⚪ I-03 — Frontend Angular: sin patrones inseguros detectados

**Búsquedas realizadas:** `innerHTML`, `[innerHTML]`, `bypassSecurityTrust*`, `eval(`, `document.write`, `dangerouslySetInnerHTML`.

**Resultado:** 0 matches. Angular maneja el escaping automáticamente en bindings (`{{ }}` y `[attr]`). Confiamos en eso.

---

## ⚪ I-04 — IDOR check: handlers usan `identity.sub`, no `args.userId`

**Búsquedas realizadas:**
- `event.arguments.userId` → 0 matches
- `args.userId` → 0 matches
- `event.identity.sub` → 17 matches (todos los handlers user-facing)

✓ No hay vector IDOR via mutations. Todos los handlers que modifican recursos del user los identifican vía Cognito identity, no por argumento.

---

## Acción recomendada (prioridad)

1. **Antes de invitar usuarios públicos:**
   - 🟠 H-01 + H-02: tapar la fuga de invite codes (mover lookup a lambda only)
   - 🟠 H-03: field-level auth en `User.email`
   - 🟡 M-04: correr `npm audit fix` en ambos repos

2. **Pre-launch hardening:**
   - 🟡 M-01: validar mode COMPLETE en `upsert-pick`
   - 🟡 M-02: validaciones de length/range en `create-group`
   - 🔵 L-01: rate limiting

3. **Continuous:**
   - npm audit semanal
   - Rotar API key cada 6 meses (al re-deploy)
   - Code review de cualquier nueva mutation que reciba `userId` como argumento

---

## Apéndice: comandos de verificación

```bash
# Re-correr la auditoría npm
cd polla-app && npm audit
cd polla-backend && npm audit

# Verificar que ningún handler usa args.userId
grep -rn "event\.arguments\.userId\|args\.userId" polla-backend/amplify/functions

# Verificar que ningún componente usa innerHTML
grep -rn "innerHTML\|bypassSecurityTrust" polla-app/src

# Listar modelos con publicApiKey (para review periódico)
awk '/^\s+[A-Z][A-Za-z]+: a$/{model=$1} /publicApiKey/{print model}' \
  polla-backend/amplify/data/resource.ts | sort -u
```
