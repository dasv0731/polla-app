# Polla Empresas (B2B) — Diseño maestro

**Fecha:** 2026-05-31
**Estado:** Aprobado (brainstorming) — pendiente de planes de implementación por sub-proyecto.

## Objetivo

Convertir la feature de "empresas" de un andamiaje admin-céntrico a un **producto vendible a empresas**: una empresa contrata el sistema y obtiene un **portal para RRHH**, **departamentos** gestionados por **jefes** (sub-admins), un **ranking corporativo de 3 niveles con premios**, y **branding propio** aplicado a sus empleados. Reaprovecha el motor de grupos/scoring existente; solo agrega la **capa de empresa** por encima.

---

## 1. Estado actual y gaps

Lo que YA existe (verificado en código + E2E 32/32 contra el stack en vivo):
- Modelo `Company` (con campos de branding `brandPrimary/Dark/Accent`, `logoKey`) y `CompanyMember` (roles `ADMIN`/`MEMBER`).
- `Group` con `companyId` + `category` → un grupo puede pertenecer a una empresa ("departamento").
- Permisos de 3 niveles en backend: super-admin → company-admin → group-admin (`src/lib/auth.ts`: `isCompanyAdmin`, `isGroupAdminOrAbove`).
- Lambdas: `createCompany`, `updateCompany`, `setCompanyStatus`, `addCompanyAdmin`, `removeCompanyAdmin`, `createCompanyGroup`, `updateCompanyGroup`. Cada grupo-departamento ya tiene su `joinCode`, `adminUserId` (=jefe), premios `prize1st/2nd/3rd`, y su propio ranking (`UserGroupTotal`).
- Scoring compartido: un usuario predice una vez por partido; sus puntos del torneo (`UserTournamentTotal`) se reflejan en todos sus grupos (`UserGroupTotal`).

Gaps que cierra este diseño:
- **No hay portal para el company-admin (RRHH):** toda la UI de empresas vive en `/admin/companies` detrás de `adminGuard` = **solo super-admin**. Los company-admins tienen permisos en backend pero **ninguna pantalla**.
- **No existe ranking a nivel empresa** (ni inter-departamento). Cada departamento tiene su ranking aislado.
- **El branding no se aplica** en ningún lado (campos existen, tab de branding es solo-lectura, nada tematiza la app del jugador).
- **No hay flujo de "invitar jefe"** ni constraint "1 empleado = 1 departamento por empresa".

---

## 2. Modelo de producto

### Roles y áreas
| Rol | Área | Qué hace |
|-----|------|----------|
| 👑 **Super-admin** (operador) | `/admin/*` (existe) | Crea y activa empresas; asigna el primer company-admin. |
| 🏢 **Company-admin** (RRHH) | **`/empresa` (NUEVO portal)** | Único con área nueva. Configura empresa: branding, **premios de empresa**, **premios inter-departamento**, invita **jefes**, ve el ranking corporativo. |
| 👔 **Jefe de departamento** (sub-admin) | UI de admin de grupo (existe) | Crea y gestiona su departamento **como un grupo normal**: premios del depto, miembros, editar. **No tiene portal nuevo.** |
| 👤 **Empleado** | App normal + sección **"Mi empresa"** | Predice como siempre; ve los 3 rankings + premios de su empresa. |

### Estructura y rankings (3 niveles, cada uno con premios)
1. 🏆 **Ranking global de la empresa** — todos los empleados (de todos los departamentos) rankeados por sus puntos. Premios definidos por RRHH.
2. 🏅 **Ranking del departamento** — individual dentro de cada departamento. Premios definidos por el jefe (= premios de grupo, ya existen).
3. 🏟️ **Competencia inter-departamento** — los departamentos compiten por puntos acumulados (suma de sus miembros). Premios definidos por RRHH al departamento ganador.

### Reglas del modelo (confirmadas)
- **1 empleado = 1 departamento por empresa** (no puede estar en dos departamentos de la misma empresa).
- Un empleado **también puede tener grupos fuera de la empresa** (con amigos) — coexisten.
- **Puntos compartidos:** un set de predicciones por usuario alimenta su departamento, el ranking de empresa y sus grupos personales, **simultáneamente**. (No se duplica el scoring.)
- **Onboarding (modelo A — venta asistida):** la empresa compra → el super-admin crea la empresa + el primer company-admin → RRHH configura su portal → invita jefes → los jefes crean departamentos y comparten su código → empleados se unen.
- **Creación de departamentos (modelo B):** RRHH **invita jefes**; cada jefe crea su departamento desde un acceso que **estampa `companyId` automáticamente**.
- **Branding contextual:** en "Mi empresa" la app toma los colores/logo de la empresa; en "Mis grupos" vuelve al tema general. No reskinea toda la app.

---

## 3. Decisión de arquitectura: ranking on-read

El ranking corporativo se calcula con un **resolver server-side on-read** (`companyRanking(companyId)`) que **lee los totales que ya existen** — sin tocar el camino de scoring. Justificación: como los puntos son compartidos, el total del torneo de cada empleado ya está calculado; agregar por empresa/departamento es una lectura barata a escala de empresa (decenas a cientos de empleados). Alternativas descartadas para el MVP: tablas materializadas (`UserCompanyTotal`/`DepartmentTotal`, agregan camino de escritura y re-sincronización al mover empleados) y snapshots periódicos (útiles para histórico, overkill como base).

---

## 4. Descomposición en sub-proyectos

```
MVP:   SP-1  →  SP-2  →  SP-3
Fase2: SP-4 (branding config) ,  SP-5 (sponsors por empresa)   [dependen de SP-1]
```

Cada sub-proyecto tendrá su propio spec→plan→implementación. El MVP (SP-1+2+3) es el mecanismo vendible mínimo; SP-4 y SP-5 son diferenciadores posteriores.

---

## 5. SP-1 · Portal de RRHH + roles *(nuevo)*

**Objetivo:** dar al company-admin su propia área y el mecanismo de invitar jefes.

**Frontend:**
- Nueva área **`/empresa`** (fuera de `/admin`, que sigue siendo solo super-admin). Guard nuevo `companyAdminGuard`: el usuario debe ser company-admin de al menos una empresa; si lo es de varias, un selector.
- Pantallas: **Resumen de la empresa** (datos + estado), **Departamentos** (lista, con su jefe y nº de miembros), **Jefes** (invitar/gestionar), **Premios** (premios de empresa 1º/2º/3º + premios inter-departamento), **Ranking** (consume SP-3).
- El company-admin **no** ve `/admin/companies` (eso es del super-admin); ve su `/empresa`.

**Backend:**
- Nueva mutation **`inviteDepartmentHead({ companyId, email })`**: crea una invitación de jefe (ver modelo `DepartmentInvite` en §9) en estado `PENDING`; opcionalmente envía email (reusa el patrón de `emailGroupInvite`). Auth: super-admin o company-admin de `companyId` (empresa ACTIVE).
- Nueva mutation **`revokeDepartmentInvite({ inviteId })`** (gestión).
- Extender el modelo `Company` con premios (ver §9) y exponerlos vía `updateCompany`.

**Reglas:** todas las operaciones de company-admin exigen empresa `ACTIVE` (consistente con las lambdas actuales).

**Reusa:** `isCompanyAdmin`, el shell de la app, componentes de formulario/modal.

---

## 6. SP-2 · Departamentos + empleados *(reusa grupos)*

**Objetivo:** que el jefe invitado cree su departamento ligado a la empresa y los empleados se unan, con el constraint de 1-depto-por-empresa.

**Backend:**
- Mecanismo "jefe crea su departamento": un jefe con una `DepartmentInvite` `PENDING` para `companyId` puede crear **un** departamento. Implementación recomendada: nueva mutation **`acceptDepartmentInvite({ inviteId, name, mode, category? })`** que valida la invitación, crea el `Group` con `companyId` estampado + `adminUserId` = el jefe (reusa la lógica de `createCompanyGroup`: TransactWrite Group + InviteCode + Membership + UserGroupTotal), y marca la invitación `ACCEPTED` con el `groupId` resultante. Auth: el invitado (sub == invite.userId/email match) o super-admin.
- **Constraint 1-depto-por-empresa** en el join: extender `join-group` para rechazar (`ALREADY_IN_COMPANY_DEPARTMENT`) si el `Group` destino tiene `companyId` y el usuario ya es miembro de otro grupo con el mismo `companyId`. (Query por `groupsByUser` + filtro por `companyId` de cada grupo.)

**Frontend:**
- Pantalla de **aceptar invitación de jefe** (desde el email/enlace): el jefe pone nombre/modo/categoría del departamento → llama `acceptDepartmentInvite`.
- El jefe luego usa la **UI de admin de grupo existente** para premios/miembros/editar. Comparte el `joinCode` con su equipo.

**Reusa:** `createCompanyGroup`/`updateCompanyGroup`, `join-group`, membership, ranking de grupo, toda la UI de admin de grupo.

---

## 7. SP-3 · Ranking 3 niveles + "Mi empresa" *(nuevo, reusa scoring)*

**Backend — resolver `companyRanking(companyId)` (on-read):**
- Reúne todos los departamentos de la empresa (`Group` por GSI `groupsByCompany`).
- Reúne las membresías de cada departamento → conjunto de empleados (únicos).
- Devuelve:
  - **`companyIndividual`**: empleados rankeados por sus puntos de torneo (`UserTournamentTotal`, o suma de su `UserGroupTotal` de su depto — son equivalentes por el scoring compartido), con su departamento.
  - **`departments`**: por departamento `{ groupId, name, totalPoints (suma de miembros), memberCount }`, rankeados (competencia inter-departamento).
  - **`departmentIndividual`** (opcional, ya disponible vía el ranking de grupo existente).
- Auth: super-admin, company-admins de la empresa, y **empleados miembros** de la empresa (para ver su propio ranking corporativo).

**Frontend — vista "Mi empresa":**
- Nueva sección en la app del empleado con un switch **🏢 Mi empresa ⇄ ⚽ Mis grupos**.
- "Mi empresa" muestra los 3 rankings (🏆 global, 🏅 su departamento, 🏟️ inter-departamento) + los premios de cada nivel.
- **Branding contextual:** al entrar a "Mi empresa", se aplican `Company.brandPrimary/Dark/Accent` + `logoKey` como variables CSS del tema; al volver a "Mis grupos", se restaura el tema general. Los valores vienen del registro `Company` (los campos ya existen; la UI para editarlos es SP-4 — para el MVP pueden setearse vía super-admin/seed).

**Reusa:** scoring, `UserTournamentTotal`/`UserGroupTotal`, el ranking de grupo, el patrón de resolver de `groupChampionDistribution`.

---

## 8. Fase 2 (después del MVP)

- **SP-4 · Branding (config UI):** pantalla en el portal RRHH para subir logo (S3 vía Amplify Storage, `logoKey`) y elegir los 3 colores; valida hex. Los valores ya se consumen en SP-3.
- **SP-5 · Sponsors / actividades extra por empresa:** scopear `Sponsor`/`SponsorCode`/trivia a una empresa (hoy son globales). Define un `companyId` opcional en esos modelos + filtros por empresa en la redención y en el admin.

---

## 9. Modelo de datos consolidado (deltas)

**`Company`** (extender):
- `prize1st`, `prize2nd`, `prize3rd` — premios del **ranking global de empresa**.
- `deptPrize1st`, `deptPrize2nd`, `deptPrize3rd` — premios de la **competencia inter-departamento**.
- (branding ya existe: `brandPrimary`, `brandPrimaryDark`, `brandAccent`, `logoKey`.)

**`DepartmentInvite`** (nuevo modelo):
- `id`, `companyId` (req), `invitedEmail` (req), `userId` (opcional, al aceptar), `code` (para enlace), `status` (`PENDING`/`ACCEPTED`/`REVOKED`), `groupId` (al aceptar), `createdBy`, `createdAt`.
- GSI: `invitesByCompany(companyId)`, `inviteByCode(code)`.
- Auth: read por company-admin de `companyId` + super-admin; escritura server-side (mutations).

**`Group` (departamento):** sin campos nuevos (`companyId`, `category`, `adminUserId`, premios ya existen). El "ser departamento" = tener `companyId`.

**Constraint:** 1 empleado = 1 grupo con un `companyId` dado (validado en `join-group` y en `acceptDepartmentInvite`).

---

## 10. Autorización y multi-tenencia

- **`companyAdminGuard` (front):** acceso a `/empresa` solo si `isCompanyAdmin` de ≥1 empresa.
- **`companyRanking`:** legible por super-admin, company-admins de la empresa, y miembros (empleados) de cualquier departamento de la empresa. Implementación: el resolver valida que el caller pertenezca a la empresa (es miembro de algún departamento) o sea company-admin/super-admin.
- **Empresa DISABLED:** bloquea operaciones de configuración para no-super-admin (consistente con las lambdas actuales).
- **PII:** el ranking de empresa expone handles + puntos (no emails). Mantener emails fuera del payload del ranking.

---

## 11. Testing

- **Backend (jest + invoke E2E contra stack):** `inviteDepartmentHead`/`revokeDepartmentInvite`/`acceptDepartmentInvite` (happy + auth + empresa DISABLED); constraint 1-depto-por-empresa en `join-group`; `companyRanking` arma los 3 rankings correctamente (incluye empleado en depto + suma inter-departamento + orden). Extender el patrón del script E2E de empresas (ya validado 32/32).
- **Front (jest):** `companyAdminGuard`, portal RRHH (invitar jefe, premios), vista "Mi empresa" (3 rankings, branding contextual aplica/restaura tema), pantalla aceptar-invitación.

---

## 12. Riesgos / decisiones diferidas al plan

- **Almacenamiento de la invitación de jefe:** modelo `DepartmentInvite` dedicado (recomendado) vs extender `CompanyMember`. Se decide en el plan de SP-1/SP-2; el spec recomienda el modelo dedicado por claridad.
- **"Empleados de la empresa" = unión de membresías de sus departamentos** (no hay un `CompanyMember` por empleado; `CompanyMember` es solo para admins). El `companyRanking` deriva el universo de empleados de las membresías de los departamentos.
- **Branding contextual:** definir el set mínimo de variables CSS a swapear (primario, primario-oscuro, acento, logo) y el alcance de pantallas afectadas dentro de "Mi empresa".
- **Invitación de empleados (no jefes):** en el MVP los empleados entran por el `joinCode` del departamento (lo comparte el jefe). Alta masiva por RRHH = posible mejora posterior.

---

## Resumen

Reusa el motor de grupos/scoring; agrega: (1) portal RRHH + invitar jefes, (2) jefes crean departamentos ligados a la empresa + constraint 1-depto, (3) ranking corporativo de 3 niveles on-read + vista "Mi empresa" con branding contextual. MVP = SP-1+2+3. Fase 2 = branding config + sponsors por empresa.
