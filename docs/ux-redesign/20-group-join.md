# Análisis UX: `/groups/join/:code` — GroupJoinComponent

> Surface #20 del walkthrough. Deep-link entry point para invitaciones a grupos.
> El surface que dispara el chain: deep-link → authGuard → login (+ returnUrl) → register (opcional) → onboarding → /groups/join/:code → /groups/:id.
> Backend lambda `previewJoinCode` server-side (post fix de data leak).

---

## 1. Identidad

- **Propósito**: mostrar al user (autenticado) un preview del grupo al que fue invitado, y CTA "Unirme al grupo".
- **Audiencia**: users autenticados que clicked un link de invitación (vía email, WhatsApp, etc.).
- **Frecuencia**: variable; los users activos pueden recibir múltiples invitaciones.
- **Entry points**:
  - Link compartido externamente (URL directa)
  - Redirect post-auth via returnUrl (login/register → onboarding → aquí)
  - Manual paste en address bar

---

## 2. Estructura — state machine

```
   /groups/join/:code
        │
        │ ngOnInit
        ▼
   ┌──────────────────────┐
   │  No user autenticado │ ────► /login?returnUrl=/groups/join/:code
   │  (fallback paranoico)│
   └──────────────────────┘
        │ (normalmente authGuard ya hizo esto)
        │
   ┌──────────────────────┐
   │  loading: true       │
   │  "Validando código…" │
   └──────────┬───────────┘
              │ previewJoinCode(code)
              │
   ┌──────────┴────────────────────────────────────┐
   │                                                │
   ▼                                                ▼
ok:false / error                              ok:true
   │                                                │
   ▼                                                ├─► alreadyMember=true
┌──────────────┐                                    │      → "Ya eres miembro"
│ Código       │                                    │
│ inválido     │                                    ├─► group=full
│              │                                    │      → "Grupo lleno"
│ CTA: Volver  │                                    │
└──────────────┘                                    ├─► group=ok
                                                    │      → Preview + CTA "Unirme"
                                                    │
                                                    └─► confirm() OK
                                                           → /groups/:id
```

**4 estados visuales finales**: loading / alreadyMember / preview-ok / preview-error.

---

## 3. Componentes desglosados

### 3.1 Header

**Render**:
```
[logo Golgana]                   ← Mis grupos
```

**Análisis**:
- ✓ Logo image real (no emoji).
- ✓ Link de retorno "← Mis grupos" (escape route).
- ✓ aria-label "Polla Mundial 2026" en logo.
- 🟠 **Logo aria-label dice "Polla Mundial 2026"** vs alt text "Golgana" — inconsistencia.
- 🟠 Logo link va a `/picks` (no a `/home`) — diverge de patrón de header global.
- 🟠 **No es el mismo brand panel** que login/register/forgot. Aquí es un header horizontal. **Inconsistencia visual entre los 4 surfaces tipo "auth-shell"**.
- 🟠 Sin estado mobile diferenciado.

### 3.2 Estado: loading

**Render**:
```
┌──────────────────────────────┐
│ Validando código…            │
└──────────────────────────────┘
```

**Análisis**:
- ✓ Estado de carga explícito.
- 🟠 **Sin spinner visual** — solo texto. UX standard sería skeleton o spinner.
- 🟡 Sin timing expectation ("Esto debería tomar 1-2s").

### 3.3 Estado: alreadyMember

**Render**:
```
Invitación a un grupo

┌──────────────────────────────┐
│ Ya eres miembro              │
│ Ya estás dentro de "X". No   │
│ necesitas volver a unirte.   │
└──────────────────────────────┘

Si no recuerdas haberte unido, este link puede ser de hace meses.

[Ir al grupo]  [Ver mis grupos]
```

**Análisis**:
- ✓ Tone tranquilizante ("No necesitas").
- ✓ 2 CTAs claros: principal (ir al grupo) + secundario.
- ✓ Mention "link de hace meses" anticipa confusión.
- ✓ Kicker "Invitación a un grupo" mantiene contexto.
- 🟠 **El nombre del grupo aparece entre comillas inglesas** (`"{{ group()?.name }}"`) — quotes inconsistente con tipografía pro (debería ser `«»` o tipográficas `""`).
- 🟡 Sin mención de cuándo se unió ("Te uniste hace X").

### 3.4 Estado: preview ok

**Render**:
```
Invitación a un grupo

       ★
   {nombreDelGrupo}

Invitado por @owner · Código ABC123

┌────────┬─────────┬────────┐
│   17   │ 12 may  │ WC26   │
│Miembros│ Creado  │ Torneo │
└────────┴─────────┴────────┘

Al unirte verás el ranking interno del grupo, podrás
compararte con los otros miembros y compartir bullying
sano. Tus picks aparecen anónimos hasta el cierre del partido.

[Unirme al grupo]  [Más tarde]
```

#### Componentes:

##### Kicker "Invitación a un grupo"
- ✓ Contexto inmediato.

##### Icon ★
- 🟠 **Emoji ★ unicode** — anti-pattern. Debería ser SVG icon (lucide-star o similar).
- 🟡 Sin variation por estado (locked si full, etc.).

##### Nombre del grupo (h1)
- ✓ Visualmente prominente.
- 🟡 Sin truncation strategy si nombre es muy largo.

##### Owner attribution
```
Invitado por @owner · Código ABC123
```
- ✓ Personaliza con @handle (social proof).
- ✓ Muestra código (transparencia, debug).
- 🟠 **Código mostrado pero sin botón "Copiar"** — útil para compartir con otros.
- 🟡 ownerHandle puede ser "—" si no se resolvió (fallback). User ve "Invitado por @—" raro.

##### Stats 3-up
```
17 Miembros | 12 may Creado | WC26 Torneo
```

**Análisis**:
- ✓ Stats útiles (tamaño, antigüedad, torneo).
- 🔴 **`createdAt` está hardcoded a string vacío** (línea 176: `createdAt: ''`). El backend NO lo expone en el preview. Por lo tanto `formatDate('')` retorna `"—"` o "Invalid Date" en muchos browsers.
- 🔴 **Por lo tanto la stat "Creado" siempre muestra `—`**. Visible pero misleading.
- 🟠 **"WC26" hardcoded** — la app es Polla Mundialista 2026, pero si en el futuro hay otros torneos, este label es estático.
- 🟠 Members count puede ser 0 inicial pero típicamente ≥1 (owner).
- 🟡 Sin breakdown demográfico (¿gente que conozco?).

##### Lead text
```
Al unirte verás el ranking interno del grupo, podrás compararte
con los otros miembros y compartir bullying sano. Tus picks
aparecen anónimos hasta el cierre del partido.
```

**Análisis**:
- ✓ **Valor claro** del producto.
- ✓ Promesa de privacidad ("picks anónimos hasta cierre") — importante para confianza.
- 🟠 **"bullying sano"** — tone que puede no resonar con todo el mundo. Casual + posiblemente alienante.
- 🟡 Sin onboarding hint ("Después de unirte podrás hacer picks").

##### Estado: grupo lleno (sub-estado)
```
┌────────────────────────────────────┐
│ Grupo lleno                        │
│ Este grupo ya alcanzó su límite    │
│ de 30 miembros. Pedile al admin    │
│ que elimine a alguien inactivo o   │
│ creá un grupo nuevo.               │
└────────────────────────────────────┘
```

**Análisis**:
- ✓ Explica QUÉ pasó.
- ✓ Sugiere acción concreta (pedir admin OR crear nuevo).
- 🟠 **"Pedile" + "creá" voseo argentino** — inconsistencia tone (mismo issue que register).
- 🔴 **MAX_MEMBERS=30 hardcoded en frontend** (línea 121) — si backend lo cambia, frontend miente. Comentario admite el problema.
- 🟠 Sin link CTA inline "Crear grupo nuevo" — texto plain.

##### CTA principal "Unirme al grupo"
- ✓ Verb específico ("Unirme" vs "Continuar").
- ✓ Loading state "Uniendo…".
- ✓ Disabled si joining || isGroupFull.

##### CTA secundario "Más tarde"
- ✓ Escape route.
- 🟠 Link va a `/groups` (lista) — útil pero asume que user quiere ver otros grupos. Quizás `/home` o "Recordármelo después" sería mejor.

### 3.5 Estado: código inválido

**Render**:
```
┌──────────────────────────────────────┐
│ Código inválido                      │
│ No encontramos el grupo. El código   │
│ puede ser incorrecto o haber         │
│ expirado.                            │
└──────────────────────────────────────┘

[Volver a mis grupos]
```

**Análisis**:
- ✓ Mensaje claro de qué falló.
- ✓ 2 hipótesis (incorrecto o expirado).
- 🟠 **Sin opción "Pedir nuevo código al owner"** — el flow termina en dead-end.
- 🟠 Sin opción "Crear cuenta nueva" o similar — único CTA es volver.
- 🟡 Sin info de contacto soporte.

### 3.6 Footer

```
© 2026 Golgana — Reglas · Privacidad
```

**Análisis**:
- ✓ Links Reglas / Privacidad presentes (vs login/register/forgot que tienen text-only).
- 🔴 **`href="#"` placeholders** — links existen pero no apuntan a nada (mismo bug que checkbox terms en register).
- 🟠 **Branding "Golgana"** — vs "Polla Mundialista" en otros surfaces. **Tercera variante de branding documentada** en el walkthrough: Golgana (here + brand panel desktop), Polla Mundialista (mobile-head), GOLGANA · MUNDIAL 2026 (auth-brand title).

### 3.7 Backend integration

**previewJoinCode lambda**:
- ✓ Server-side lookup + permisos
- ✓ Resuelve data leak previa (InviteCode listable expuso códigos)
- ✓ Retorna: ok, groupId, groupName, ownerHandle, memberCount, alreadyMember
- ❌ NO retorna createdAt → frontend muestra `—`

**joinGroup mutation**:
- ✓ Maneja GraphQL errors via `res.errors[]` (Amplify Gen 2 quirk)
- ✓ Detecta `ALREADY_MEMBER` y bifurca a alreadyMember branch
- ✓ Cache refresh (`userModes.load`) post-join para sincronizar dropdown
- ✓ Navigate a /groups/:id post-success
- 🟠 console.error logs para debug pero también van a prod.

### 3.8 Auth flow integration

**Fallback paranoico ngOnInit**:
- ✓ Si user no autenticado, redirect a login con returnUrl correcto.
- ✓ Authgu​ard normalmente atrapa esto antes.
- 🟢 Defensa en profundidad correcta.

---

## 4. Cross-cutting · hallazgos UX (priorizados)

🔴 **`createdAt` vacío** muestra "—" siempre en la stat "Creado".

🔴 **`href="#"` placeholders** en Reglas / Privacidad footer.

🔴 **MAX_MEMBERS=30 hardcoded** en frontend.

🟠 **Branding triple**: Golgana (footer + brand panel) vs Polla Mundialista (mobile-head) vs GOLGANA · MUNDIAL 2026 (auth-brand title).

🟠 **Logo aria-label "Polla Mundial 2026"** vs alt "Golgana".

🟠 **Logo link `/picks`** vs patrón global `/home`.

🟠 **No es brand panel** sino header — inconsistencia con login/register/forgot.

🟠 **Loading sin spinner** visual.

🟠 **Icon ★ unicode** anti-pattern.

🟠 **Código sin "Copiar"** button.

🟠 **"WC26" hardcoded** torneo.

🟠 **"bullying sano"** tone debatible.

🟠 **"Pedile" + "creá"** voseo inconsistente con tono general.

🟠 **Quotes inglesas** en nombre de grupo.

🟠 **Dead-end código inválido** — sin "Pedir nuevo" o contacto.

🟠 **"Más tarde" va a `/groups`** vs `/home`.

🟡 **Sin truncation** nombre largo.

🟡 **Sin onboarding hint** post-join.

🟡 **Sin "Te uniste hace X"** en alreadyMember.

🟡 **ownerHandle fallback "—"** raro visualmente.

🟡 **console.error** logs en prod.

🟡 **Header sin mobile state** diferenciado.

🟡 **Sin timing expectation** loading.

🟡 **Sin "Crear grupo nuevo"** CTA inline cuando grupo full.

🟢 **Defensa en profundidad** authGuard fallback (positivo).

🟢 **previewJoinCode lambda** server-side post fix (positivo).

🟢 **Cache refresh post-join** correcto.

---

## 5. Antipatrones detectados

| Regla | Violación |
|---|---|
| **Hardcoded data leak** | createdAt='', MAX_MEMBERS=30, "WC26" |
| **Broken links** | href="#" Reglas / Privacidad |
| **Branding chaos** | 3 variantes en mismo surface family |
| **no-emoji-icons** | ★ icon |
| **A11y label consistency** | aria-label "Polla Mundial 2026" vs alt "Golgana" |
| **Loading feedback** | Sin spinner visual |
| **i18n consistency** | "Pedile" / "creá" voseo |
| **Tone consistency** | "bullying sano" debatible |
| **Typography** | Quotes inglesas vs tipográficas |
| **Dead-end UX** | Código inválido sin recovery |
| **Component family consistency** | Header vs brand panel auth-shell |

---

## 6. Anclas para el redesign

### Core

1. **4-state UI** (loading / alreadyMember / preview-ok / preview-error)
2. **Preview con stats** (Miembros, Creado, Torneo)
3. **Owner attribution** "@handle"
4. **Group full sub-state**
5. **authGuard fallback** + returnUrl
6. **previewJoinCode** server-side lambda
7. **alreadyMember branch** con CTA "Ir al grupo"

### Quitar

- Stat "Creado" si backend no la expone (o exponerla)
- "WC26" hardcoded → desde backend
- MAX_MEMBERS hardcoded → desde preview lambda
- ★ unicode → SVG icon
- href="#" placeholders → links reales
- console.error en prod
- "bullying sano" tone
- "Pedile" / "creá" voseo

### Agregar

- **Backend expose createdAt** en previewJoinCode O quitar la stat
- **Backend expose maxMembers** en preview lambda
- **Backend expose tournament** en preview lambda (en lugar de "WC26" hardcoded)
- **Spinner loading** (no solo texto)
- **Skeleton state** mientras preview cargando
- **Copy code button** "Código ABC123 [copy]"
- **Truncation strategy** para nombres largos
- **alreadyMember "Te uniste hace X"** info
- **Group full → CTA inline** "Crear grupo nuevo"
- **Código inválido → CTA "Pedir nuevo código al owner"** + soporte
- **Tone unificado** ("tú" everywhere)
- **Branding unificado** (resolver Golgana vs Polla Mundialista)
- **Logo aria-label** consistente con alt
- **Logo link `/home`** (no /picks)
- **Mobile header diferenciado**
- **Onboarding hint** post-join

---

## 7. Resumen ejecutivo

**Surface bien construido en términos de flow** (4 estados claros + fallback + alreadyMember + group-full). Los gaps son **data accuracy** y **inconsistencia visual con el resto del auth family**.

1. 🔴 **Data accuracy issues**: createdAt vacío muestra "—" siempre, MAX_MEMBERS hardcoded en 30, "WC26" hardcoded. Si el backend cambia, la UI mente.

2. 🔴 **`href="#"` placeholders** en footer Reglas / Privacidad — links que no van a ningún lado.

3. 🟠 **Branding chaos**: este surface introduce la **TERCERA variante** del branding (Golgana). Auth-family ahora tiene: Golgana, Polla Mundialista, GOLGANA · MUNDIAL 2026. Imposible saber cuál es la marca real.

### 3 decisiones de diseño que cambian todo

1. **Backend completar el preview**: `previewJoinCode` debería retornar `createdAt`, `maxMembers`, y `tournamentCode` (en lugar de hardcoded "WC26"). Esto sería un cambio backend + frontend trivial pero elimina 3 mentiras visuales.

2. **Unificar visual con auth family**: este surface usa header horizontal mientras login/register/forgot usan brand panel desktop. Decidir UN layout para los 5 surfaces tipo "auth-shell" (login, register, forgot, join, onboarding) → consistencia visual end-to-end del flow.

3. **Recovery UX para código inválido**: hoy es dead-end. Las opciones inteligentes serían:
   - Si pareciera typo (off-by-one): "¿Quisiste decir XYZ12?"
   - "Pedirle al owner que regenere el código"
   - Link a soporte
   - "Buscar otro grupo público" (si existe el concepto)

### Cambios secundarios

- Spinner loading
- ★ → SVG icon
- "Copiar código" button
- Tone consistente ("tú" everywhere)
- "Más tarde" → `/home` (no /groups)
- Logo link `/home` + aria-label consistente
- Truncation nombres largos
- "Te uniste hace X" en alreadyMember
- "Crear grupo nuevo" CTA inline en group-full
- console.error → telemetry real
- Quotes tipográficas (« » o " ")
- "bullying sano" → reescribir tone
- Mobile header diferenciado

**Nota retrospectiva**: este surface es el **eslabón crítico del growth loop**: invitaciones compartidas externamente que aterrizan aquí. Su calidad de UX impacta directamente la conversión de invitados a users activos. Cada gap aquí (especialmente data accuracy + recovery UX) cuesta retention. Es el surface donde MÁS importa invertir en polish.
