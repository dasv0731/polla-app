# Análisis UX: `/onboarding` — OnboardingComponent

> Surface #21 del walkthrough. Cierra el auth chain.
> Post Fase C: simplificado a 1 step (eliminado el step "Nombre" del registro).
> Post Fase B: deep-link skip via `?returnUrl=` permite saltarse el onboarding completo cuando el user tiene intención clara.

---

## 1. Identidad

- **Propósito**: post-registro, dirigir al user nuevo a una de 3 acciones (crear, unirse, explorar) para que no aterrice en /home vacío sin contexto.
- **Audiencia**: users recién registrados (sin grupos).
- **Frecuencia**: una vez por user en su lifetime (típicamente).
- **Entry points**:
  - Post-confirm en register.component (`submitConfirm` → `/onboarding`)
  - Post-retry handle en register (`retryHandle` → `/onboarding`)
  - Manual: muy raro, no hay link visible desde shell

---

## 2. Estructura — UI única (post Fase C)

```
   /onboarding
        │
        │ ngOnInit
        ▼
   ┌────────────────────────────┐
   │  ¿returnUrl en queryParam? │
   └──────────┬─────────────────┘
              │
        ┌─────┴─────┐
        │           │
       sí           no
        │           │
        ▼           ▼
   navigateByUrl   render onboarding card
   (skip card)
                    │
                    ├─► [+ Crear un grupo]
                    │      → openCreate() + /home
                    │
                    ├─► [→ Unirme con código]
                    │      → openJoin() + /home
                    │
                    └─► [Explorar primero]
                           → /home
```

**1 step + 1 skip-branch**. Simplísimo post Fase C.

---

## 3. Componentes desglosados

### 3.1 Header / brand

**Render**:
```
[logo Golgana]
```

**Análisis**:
- ✓ Logo Golgana image real (no emoji).
- 🟠 **Logo link va a `/picks`** — mismo issue que group-join. Diverge de patrón global `/home`.
- 🟠 **Inline styles** masivos en el `<a>` (`text-decoration:none;color:inherit;display:flex;align-items:center;gap:8px`). Debería ser una clase.
- 🟠 **Inline style `height:28px`** — y aquí es 28px vs login (32px), register (40px), forgot (32px), join (sin inline). **Cuarta variante de logo size** documentada.
- 🟠 **Sin mobile head** diferenciado.
- 🟠 **Sin brand title** — solo logo. Vs login que tiene "GOLGANA · MUNDIAL 2026".

### 3.2 Hero ⚽

**Render**:
```
       ⚽       (grande)
```

**Análisis**:
- 🔴 **Emoji ⚽ como hero visual** — anti-pattern grave. Es el ELEMENTO visual más prominente de la pantalla, y es un emoji. Inconsistente con el branding profesional Golgana.
- ✓ `aria-hidden="true"` correcto (es decorativo).
- 🟡 Sin animation / motion para vivacidad.

### 3.3 Kicker + h1 + sub

**Render**:
```
Bienvenido

Hola,
@handle
```

**Análisis**:
- ✓ Personalización con @handle (forte UX).
- ✓ `translate="no"` previene Google Translate corrompa el handle.
- ✓ Fallback "@jugador" si handle es null.
- ✓ Kicker "Bienvenido" da contexto.
- 🟠 **El handle tiene line-break `<br>` antes** ("Hola,\n@handle") — visual jerárquico OK pero raro tipográficamente. Para handles largos puede crear layout awkward.
- 🟡 Sin mention del Mundial cerca del welcome ("Bienvenido al Mundial 2026").

#### Sub-text
```
El Mundial 2026 está a la vuelta. Para empezar, creá un grupo con tus
panas o unite con un código que te compartieron.
```

**Análisis**:
- ✓ Sets temporal context ("a la vuelta").
- ✓ Menciona los 2 paths principales (crear, unirse).
- 🟠 **"creá" + "unite" voseo argentino** — inconsistente. Pattern repetido en register ("Pickeá"), group-join ("Pedile"). **Cuarta instancia voseo en el walkthrough**.
- 🟠 "tus panas" — colombian/regional. OK para target pero limita.
- 🟡 No menciona "Explorar primero" — solo 2 de los 3 CTAs. User puede no notar la 3ª opción.

### 3.4 CTAs (3 botones)

#### a) Crear un grupo

**Render**:
```
[＋ Crear un grupo]   (primary)
```

**Behavior**:
- `openCreate()` setea signal en GroupActionsService
- Navigate `/home`
- Shell post-auth detecta el signal y abre el modal

**Análisis**:
- ✓ Verb específico ("Crear").
- ✓ Color primary (verde Polla).
- ✓ `aria-hidden="true"` en el ＋ correcto.
- 🟠 **Cross-route signal pattern** — el modal NO se abre aquí, se "comunica" via GroupActionsService que persiste cross-navigation. Funciona pero es **inferencia compleja para el user**: clickea "Crear" y se va a /home, no a un step de creación. La página cambia.
- 🟠 **＋ unicode** — anti-pattern (debería ser SVG icon).
- 🟡 Sin loading state — el click es síncrono pero la navigation no se previene.

#### b) Unirme con código

**Render**:
```
[→ Unirme con código]  (secundario "ink")
```

**Behavior**:
- `openJoin()` setea signal
- Navigate `/home`
- Shell abre el modal join

**Análisis**:
- ✓ Verb específico.
- ✓ Variante visual `btn-wf--ink` da menos peso visual que primary.
- 🟠 **→ unicode** — anti-pattern.
- 🟠 **Mismo pattern cross-route** que crear.
- 🟡 Sin hint "Si te invitaron por WhatsApp/email" para contextualizar.

#### c) Explorar primero

**Render**:
```
[Explorar primero]  (transparente, border solo)
```

**Behavior**:
- Navigate directo a `/home`

**Análisis**:
- ✓ Verb específico ("Explorar").
- ✓ Variante visual `.onb-secondary` con border ghost.
- ✓ Focus-visible outline correcto (P4 done).
- 🟠 **Visual "Explorar primero" vs CTA 1 ("Crear")**: el primary es grande/colorido, secondary también block + width-full, tertiary también block. **3 botones full-width consecutivos** — visualmente cansados. Material recomienda jerarquía visual entre primary/secondary/tertiary.
- 🟠 **"Explorar primero" sin icon** — los otros 2 tienen ＋/→. Inconsistencia.
- 🟠 **Wording "primero"** sugiere que después tendrá que hacer X — sin claridad de qué hacer después.

### 3.5 Helper text

**Render**:
```
Podés crear o unirte a un grupo desde la sidebar en cualquier momento.
```

**Análisis**:
- ✓ Reassurance pattern: "esta decisión no es final".
- 🟠 **"Podés" voseo** — quinta instancia documentada en este surface.
- 🟠 **"desde la sidebar"** — si user está en mobile, NO HAY sidebar visible (es drawer). Wording confuso en mobile.
- 🟡 Sin link directo "Ver más opciones" o similar.

### 3.6 Deep-link skip (Fase B)

**Behavior**:
- ngOnInit lee `?returnUrl=` del queryParam
- Si presente y safe (`/` no `//`), `navigateByUrl(ret)` y salta el render
- Comentario explica: "el user tiene intención clara, mostrarle un tutorial sería ruido"

**Análisis**:
- ✓ **UX inteligente**: deep-link entries no merecen onboarding intermedio.
- ✓ safeReturnUrl validation (no open-redirect).
- ✓ Sintáctico simple.
- 🟢 **Pattern correcto end-to-end auth**: login propaga, register propaga, onboarding consume.
- 🟡 Sin flash de la card antes del redirect (depende de SSR / Angular hydration timing).
- 🟡 Sin loading state "Validando…" durante el skip.

### 3.7 GroupActionsService pattern

**Cross-route modal trigger**:
1. Click "Crear" → `openCreate()` setea signal en service `providedIn:'root'`
2. Navigate `/home`
3. Home (o el shell) tiene un effect que detecta el signal y abre el modal correspondiente

**Análisis**:
- 🟠 **Pattern poco intuitivo** — separation funcional vs visual rota. El click no es atómico ("Crear y mostrarme el form"); es ("ir a home, allá quizás se abre el modal").
- 🟠 **Si /home redirige antes de mostrar el modal** (ej. por auth race condition), el signal se pierde.
- 🟡 **Test E2E nervioso**: cualquier intermitencia en el shell setup rompe el flow.

---

## 4. Cross-cutting · hallazgos UX (priorizados)

🔴 **Hero ⚽ emoji** como elemento visual más prominente.

🟠 **Logo link `/picks`** vs patrón global `/home`.

🟠 **Logo height 28px** — cuarta variante documentada (login 32px, register 40px, forgot 32px, join sin inline).

🟠 **Inline styles masivos** en logo container.

🟠 **Sin brand title** desktop ni mobile head.

🟠 **CTAs ＋ y → unicode** anti-pattern.

🟠 **3 botones full-width consecutivos** sin jerarquía visual fuerte.

🟠 **CTA 3 sin icon** (inconsistente con 1 y 2).

🟠 **Voseo argentino** ("creá", "unite", "Podés") inconsistente.

🟠 **Cross-route modal pattern** poco intuitivo.

🟠 **"desde la sidebar" confuso en mobile** (no hay sidebar).

🟠 **Sub-text omite el 3º CTA** (explorar).

🟠 **Handle con `<br>` previo** awkward en handles largos.

🟡 **Sin loading state** durante skip a returnUrl.

🟡 **Sin hint contextual** para "Unirme con código".

🟡 **Sin link "Ver más opciones"**.

🟡 **Sin animation** en hero (vivacidad).

🟡 **Wording "primero"** sin claridad de qué viene después.

🟢 **`translate="no"` en handle** correcto.

🟢 **`aria-hidden` en decorativos** correcto.

🟢 **Deep-link skip pattern** brillante.

🟢 **safeReturnUrl validation** consistente con login/register.

🟢 **Fallback "@jugador"** si null.

---

## 5. Antipatrones detectados

| Regla | Violación |
|---|---|
| **no-emoji-icons** | ⚽ hero, ＋ + → en CTAs |
| **Visual hierarchy** | 3 botones block consecutivos sin diferencia |
| **Pattern inconsistency** | CTA icons (1, 2 sí, 3 no) |
| **i18n consistency** | "creá", "unite", "Podés" voseo |
| **Cross-platform wording** | "sidebar" no aplica en mobile |
| **Inline styles** | Logo container + height |
| **Cross-route side effects** | Click no es atómico (signal + nav) |
| **Logo size variance** | 4ª variante (28/32/40px) |

---

## 6. Anclas para el redesign

### Core

1. **3 CTAs** (crear, unirse, explorar)
2. **Personalización @handle**
3. **Deep-link skip** via `?returnUrl=`
4. **safeReturnUrl validation**
5. **Cross-route modal pattern** (mantenible)

### Quitar

- Hero ⚽ emoji → ilustración SVG o brand graphic
- ＋ + → unicode → SVG icons
- Inline styles → tokens/clases
- "creá", "unite", "Podés" → "crea", "únete", "puedes"

### Agregar

- **Brand title** consistente con resto del auth family
- **Logo size unificado** (decidir 32px o 40px y aplicar globalmente)
- **Logo link `/home`** (no /picks)
- **Mobile head diferenciado** si auth family lo conserva
- **Icon SVG** consistente en los 3 CTAs (o ninguno)
- **Jerarquía visual entre CTAs**:
  - Primary "Crear" (block, full color)
  - Secondary "Unirse" (block, outline)
  - Tertiary "Explorar" (text-link, no block)
- **Contextual hint** "Unirme con código" para invitados
- **Animation hero** (suave, no llamativa)
- **Loading state durante skip** (chip "Llevándote a {path}…")
- **Wording cross-platform**: "desde el menú" (no sidebar) o "desde el ícono ➕"
- **Sub-text incluye 3 CTAs** o redactar genérico
- **Handle wrap-safe**: usar text-wrap balanced o limit length
- **Reassurance helper más amigable**

### Considerar

- **¿Onboarding 1-step suficiente o 2 steps?**
  - Step 1: bienvenida + valor
  - Step 2: 3 CTAs
  - Actualmente combinado en 1 — discutible
- **¿Skip a /home si returnUrl null o sí mostrar?**
  - Ahora: siempre muestra si no hay returnUrl
  - Alternativa: si user ya tiene grupos (return user), skip directo a /home

---

## 7. Resumen ejecutivo

**Surface muy simplificado post Fase A/C** — perdió el step "Nombre" (Fase A) y el detalle de modos (movido al modal de crear). Lo que queda es **muy bueno en concepto** pero **arrastra inconsistencias visuales del resto del auth family**:

1. 🔴 **Hero ⚽ emoji**: el elemento visual MÁS prominente es un emoji. Si Golgana es una marca seria, esto la contradice. **Reemplazar con SVG ilustración o brand graphic** sería el cambio más impactful.

2. 🟠 **Voseo "creá"/"unite"/"Podés"**: quinta instancia de inconsistencia tone documentada. **Necesidad de una guía de redacción consistente** ("tú" o voseo, pero uno solo).

3. 🟠 **Cross-route signal pattern para modales**: clickear "Crear" no muestra el form de creación; manda a /home y allá quizás se abre el modal. **Pattern frágil + poco intuitivo**. Alternativa: abrir el modal aquí mismo (no navigate hasta confirmar) y luego navigate post-creación.

### 3 decisiones de diseño que cambian todo

1. **Hero visual**: ⚽ emoji → SVG ilustración o brand graphic. Es el elemento más visible de la pantalla post-registro. Define la primera impresión del producto.

2. **Tone guide**: decidir voseo vs "tú" UN solo modo y aplicar a TODA la app. Esto afecta auth family + group-join + register handle-conflict + onboarding + cualquier copy futuro.

3. **Modal trigger pattern**: ¿abrir el modal en /onboarding directamente, o mantener el navigate-then-trigger pattern? Lo segundo es robusto contra navegación pero confuso UX-wise. Lo primero requiere que /onboarding cargue el modal logic (más peso).

### Cambios secundarios

- ＋ + → unicode → SVG icons
- Jerarquía visual CTAs (primary/secondary/tertiary)
- Logo size unificado auth family
- Logo link `/home`
- Brand title + mobile head consistente
- "desde la sidebar" → wording cross-platform
- Sub-text incluye 3 CTAs
- Animation hero suave
- Loading state skip a returnUrl
- Handle wrap-safe en h1
- Inline styles → tokens

**Nota retrospectiva**: este es el **último surface del growth funnel** antes de que el user vea contenido real. Su calidad determina si el user "engancha" o se va. El simplificado post-Fase A/C es positivo (menos fricción) pero el polish visual no acompañó la simplificación.
