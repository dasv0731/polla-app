# Análisis UX: Trivia Popup — TriviaPopupComponent

> Surface #23 del walkthrough. Modal global de trivia + FAB pill.
> Único surface con mecánica de game loop (timer + select + reveal + explain).
> Solo visible si `userModes.hasComplete()` (al menos 1 grupo en modo COMPLETE).
> Variantes: trivia sin sponsor (sinad) y trivia patrocinada (marca).

---

## 1. Identidad

- **Propósito**: hook de retención + monetización. Preguntas time-boxed con +10 pts si aciertas + opción sponsored ("acierta y gana un comodín").
- **Audiencia**: users con al menos 1 grupo COMPLETE (gate `hasComplete()`).
- **Frecuencia**: alta durante matches live. FAB pill aparece cuando hay preguntas activas.
- **Entry points**:
  - **FAB pill** (global, visible cuando hay preguntas live)
  - **Inline "Jugar"** en picks-list para un match específico (`openForMatch(matchId)`)
  - **Toast trivia** redirect (separado component)

---

## 2. Estructura — game loop

```
   ┌─────────────────────────┐
   │ FAB Pill global         │
   │ "⚡ Trivia · +10 pts"    │
   │ Visible si:             │
   │  - hasComplete()        │
   │  - modal closed         │
   │  - hay live questions   │
   │  - !dismissed           │
   └──────────┬──────────────┘
              │ click
              ▼
   ┌──────────────────────────────────────┐
   │ Modal trivia-modal                   │
   │                                      │
   │ Header:                              │
   │  - Sponsor block (si patrocinada)    │
   │  - "TRIVIA · home vs away"           │
   │  - "+10 pts si aciertas"             │
   │  - Timer ⏱ countdown                  │
   │  - Close ✕                            │
   │                                      │
   │ Body:                                │
   │  - "PREGUNTA N DE M"                 │
   │  - Question prompt                   │
   │  - 4 options A/B/C/D                 │
   │                                      │
   │ ANSWERING STATE                      │
   │  ┌─────────────────────────────────┐ │
   │  │ [Saltar ↶]    [Responder]       │ │
   │  └─────────────────────────────────┘ │
   │                                      │
   │ REVEALED STATE (post-submit o timer) │
   │  ✓ ¡Acertaste! +10 pts               │
   │  o                                   │
   │  ✕ Respuesta correcta: B             │
   │  o                                   │
   │  ⏱ Tiempo agotado · correcta: B      │
   │                                      │
   │  Por qué: {explanation}              │
   │                                      │
   │  ┌─────────────────────────────────┐ │
   │  │              [Siguiente → / Cerrar] │
   │  └─────────────────────────────────┘ │
   │                                      │
   │ Footer (si sponsor):                 │
   │  "Trivia patrocinada · gana comodín" │
   └──────────────────────────────────────┘
```

**Queue management**: cola global (`allQueue`) + cola scoped por match (`scopedQueue`). Filter por dismissed + publishedAt ≤ now. Tick reactivo cada 1s para timer.

---

## 3. Componentes desglosados

### 3.1 FAB Pill

**Render**:
```
[⚡ Trivia · +10 pts]     // 1 pregunta
[⚡ Trivia · +10 pts (3)]  // 3 preguntas
```

**Análisis**:
- ✓ **Affordance clara** — pill con CTA verbal.
- ✓ **Contador "3"** solo cuando hay más de 1.
- ✓ aria-label "Jugar trivia".
- 🟠 **Emoji ⚡** anti-pattern (SVG icon mejor).
- 🟠 **Posición fija** — depende de CSS `.trivia-fab` (no visible aquí). Probable bottom-right, debería ajustarse a safe-area-inset en mobile.
- 🟠 **Sin estado "loading"** — si la cola está cargando, el FAB puede aparecer/desaparecer.
- 🟡 Sin hint de qué match es ("Trivia · Brasil vs Croacia").
- 🟡 Sin pulse/notification animation cuando aparece nueva pregunta.

### 3.2 Modal header

**Render** (variant sinad):
```
   ⚡  TRIVIA · Brasil vs Croacia                  ⏱ 01:42  [✕]
       +10 pts si aciertas
```

**Render** (variant marca):
```
   ┌─────────────────────────────────────────────────────────┐
   │ 🥤  PRESENTADA POR              PUBLICIDAD              │
   │     Coca-Cola                                            │
   └─────────────────────────────────────────────────────────┘
       ⚡  TRIVIA · Brasil vs Croacia              ⏱ 01:42  [✕]
           +10 pts si aciertas
```

**Análisis**:
- ✓ **Distinción visual clara** entre sponsored / no.
- ✓ Label "PUBLICIDAD" transparente al user (compliance ad disclosure).
- ✓ `translate="no"` en sponsor name (brand preservation).
- ✓ Title con id `trivia-modal-title` + aria-labelledby.
- ✓ Timer con `role="timer" aria-live="off"` (no spam SR cada segundo).
- ✓ Timer aria-label dinámico "Tiempo restante: 01:42".
- ✓ Timer cambia color cuando ≤ 15s (`trivia-timer--low`).
- 🟠 **Sponsor logo es texto del campo `icon`** — si el admin pone emoji (🥤), se renderiza grande pero sin control de tamaño. **Riesgo de render inconsistente** entre browsers.
- 🟠 **Icon ⚡ + ⏱ + ✕** unicode — anti-pattern triple en mismo header.
- 🟠 **Title "TRIVIA · home vs away"** — uppercase forzado por CSS, pero los nombres team también vendrán uppercased. Tipográficamente cargado.
- 🟡 **Sin mostrar comodín reward** si sponsor — el footer lo dice ("gana un comodín") pero el header no.
- 🟡 Timer sin animation cuando llega a 0.

### 3.3 Body - step indicator

**Render**:
```
PREGUNTA 1 DE 3
```
o
```
PREGUNTA
```

**Análisis**:
- ✓ Progress indicator cuando hay múltiples.
- ✓ Hide "DE M" cuando solo hay 1.
- 🟡 Sin barra de progreso visual (solo texto).

### 3.4 Body - pregunta

**Render**:
```
¿Cuántos goles ha marcado Brasil en su historial mundialista?
```

**Análisis**:
- ✓ h2 con styling display font.
- 🟡 Sin word wrap test — preguntas muy largas pueden romper layout.
- 🟡 Sin support de markdown / line breaks en prompt.
- 🟡 Sin imagen / media de soporte (visual content para preguntas).

### 3.5 Opciones A/B/C/D

**Render**:
```
[A]  Brasil ganaría
[B]  Argentina ganaría
[C]  Empate
[D]  No sé
```

**Estados visuales** por opción:
- Default: neutro
- Selected (pre-reveal): `.is-selected` — azul/border
- Revealed + correct: `.trivia-option--correct` + badge ✓ verde
- Revealed + user-wrong: `.trivia-option--wrong` + badge ✕ rojo

**Análisis**:
- ✓ Letra A/B/C/D visual + text option (visual hierarchy).
- ✓ Estados distintos por color + badge (no solo color → wcag color-not-only).
- ✓ Disabled durante submitting y revealed (anti double-click).
- ✓ **Comentario en código** detalla la regla: pre-reveal el seleccionado es azul, NO verde (verde reservado para "correcto").
- 🟠 **Badge ✓ y ✕ unicode** — anti-pattern.
- 🟠 **"Selected" pre-reveal usa estilo `.is-selected`** — pero no hay indicador de teclado para users que usan keyboard. ¿Hay arrow keys para nav A/B/C/D? Probable no, dependiendo de focus tab.
- 🟠 **No hay opción "No sé"** explícita — el user puede dismissar con Skip pero no marcar incertidumbre.
- 🟡 Sin animation cuando se selecciona.
- 🟡 Sin shortcut numérico (1/2/3/4 o A/B/C/D keyboard).

### 3.6 Estado revealed - feedback

**3 variantes**:

#### Acertó
```
✓ ¡Acertaste! +10 pts
```

#### Falló
```
✕ Respuesta correcta: B
```

#### Tiempo agotado (sin pick)
```
⏱ Tiempo agotado · Respuesta correcta: B
```

#### Explicación
```
Por qué: Brasil tiene 6 mundiales y más de 230 goles...
```

**Análisis**:
- ✓ 3 estados claros + visuales distintos.
- ✓ Explicación post-reveal educa (valor pedagógico).
- ✓ `cleanExplanation` viene del backend post-parsing del sponsor prefix.
- 🟠 **✓ + ✕ + ⏱ unicode** anti-pattern.
- 🟠 **"Respuesta correcta: B"** muestra la LETRA, no el TEXTO. User tiene que mirar arriba a la opción B para entender. UX mejor sería "Respuesta correcta: Brasil ganaría".
- 🟠 **Estado "Tiempo agotado"** — pero si el user ya cliqueó una respuesta antes del timer pero NO submitteó, ¿qué pasa? El timer le hace force-reveal y pierde la opción. Edge case.
- 🟡 Sin "Por qué" si `cleanExplanation` está vacío — sin fallback de educational content.
- 🟡 Sin share buttons post-acierto ("Compartí con tus panas que acertaste").

### 3.7 Estado revealed - actions

**Render**:
```
                          [Siguiente →]   (si quedan más)
                          [Cerrar]        (última)
```

**Análisis**:
- ✓ Wording dinámico: "Siguiente →" vs "Cerrar".
- ✓ `<span></span>` placeholder a la izquierda para mantener layout flex.
- 🟠 **`<span></span>` empty** es anti-pattern semántico — debería ser un real Skip/Back link o usar justify-content para alignment.

### 3.8 Estado answering - actions

**Render**:
```
[↶ Saltar]                              [Responder]
```

**Análisis**:
- ✓ Skip button presente.
- ✓ Submit "Responder" disabled hasta picked.
- ✓ Loading state "Enviando…".
- 🟠 **↶ unicode icon** anti-pattern.
- 🟠 **Skip wording "Saltar"** — implica que vuelvo después, pero `dismissed` la elimina de la sesión. UX engaña.
- 🟠 **No hay confirmación de skip** — si user clickea por error, pierde la pregunta sin recovery.

### 3.9 Sponsor footer

**Render** (solo si sponsor):
```
Trivia patrocinada · acierta y gana un comodín
```

**Análisis**:
- ✓ **Reward específico** ("comodín") fuera del genérico "+10 pts".
- 🟡 Sin info de qué tipo de comodín (random, choose, ...).
- 🟡 Sin link "Términos del sponsor" (compliance gap si jurisdiction requiere).

### 3.10 Queue management

**Lógica**:
1. `allQueue` carga global de live matches con triv no contestada
2. `scopedQueue` carga match específico cuando user click "Jugar"
3. `visibleQueue` = source.filter(no dismissed && publishedAt <= now)
4. `dismissed` Set local (sesión) para no re-mostrar
5. `nowMs` tick 1s para timer + publishedAt re-eval
6. `pollTimer` cada 60s para refresh allQueue

**Análisis**:
- ✓ **Reactivo y cache-aware**: scopedQueue hit no re-fetch.
- ✓ Server source-of-truth + local dismissed para sesión.
- ✓ Tick 1s para timer real-time.
- ✓ Poll 60s para nuevas preguntas.
- ✓ Effect blocks complejos pero bien comentados.
- 🟠 **`dismissed` no persiste cross-session** — si user cierra modal y refresh, las que respondió ya estarán en backend pero las que SKIP volverán. Diseño deliberado? Comentario sugiere que sí ("server ya tiene la respuesta").
- 🟠 **Sin sync entre tabs** — si user abre 2 tabs, ambas pueden mostrar la misma pregunta. Sin lock.
- 🟡 **`console.warn` errors** en prod — debería ir a telemetry.

### 3.11 A11y review

- ✓ role="dialog" + aria-modal + aria-labelledby
- ✓ cdkTrapFocus + autoCapture
- ✓ Escape close
- ✓ Backdrop click close
- ✓ aria-label en close button
- ✓ role="timer" + aria-live="off" en timer
- ✓ aria-hidden en decorative emojis
- 🟠 **Sin role="alert"** en mensaje de error msg() — solo es `<p class="trivia-msg">`.
- 🟠 **Sin shortcut keyboard** para opciones A/B/C/D.
- 🟠 **Sin live region** para announcement de timer expiration o correct/wrong.

---

## 4. Cross-cutting · hallazgos UX (priorizados)

🔴 **Emojis everywhere** como UI critical: ⚡ FAB + ⏱ timer + ✕ close + ↶ skip + ✓ correct + ✕ wrong + sponsor icon — todos anti-patterns en componente con tan alto profile (game loop + monetización).

🟠 **"Respuesta correcta: B"** muestra letra no texto.

🟠 **Skip wording "Saltar"** engañoso (no vuelve).

🟠 **Sponsor icon es texto del backend** — sin control visual (emoji, char, ...).

🟠 **No hay opción "No sé"** explícita.

🟠 **No keyboard shortcuts** A/B/C/D.

🟠 **No confirmación de skip**.

🟠 **`<span></span>` empty** layout hack.

🟠 **`console.warn` errors** en prod.

🟠 **No sync cross-tab**.

🟠 **No role="alert"** en error msg.

🟠 **Sin live region** para timer expire / correct.

🟠 **Sin hint match name** en FAB.

🟠 **Sin barra progreso** "1 de 3" (solo texto).

🟠 **Sin shortcut keyboard** opciones.

🟠 **Title del modal uppercase** + nombres team — visualmente cargado.

🟡 **Sin animation timer** al 0.

🟡 **Sin pulse animation FAB** notification.

🟡 **Sin word wrap test** preguntas largas.

🟡 **Sin imagen/media** soporte en preguntas.

🟡 **Sin "Por qué" fallback** si vacío.

🟡 **Sin share buttons** post-acierto.

🟡 **Sin info tipo de comodín** del sponsor reward.

🟡 **Sin "Términos del sponsor"** link.

🟡 **FAB safe-area-inset** no garantizado.

🟡 **Edge case: pick sin submit + timer expire** — pierde la pick.

🟢 **A11y core** completo (focus trap, aria, Escape).

🟢 **`translate="no"`** en sponsor name.

🟢 **Estados visuales distintos** color + badge (no wcag violation).

🟢 **Queue management** reactivo y cache-aware.

🟢 **Compliance ad disclosure** "PUBLICIDAD" label.

🟢 **Comments en código** detallan reglas visuales.

🟢 **Timer aria-live="off"** evita spam SR.

🟢 **Reward específico** sponsor footer.

---

## 5. Antipatrones detectados

| Regla | Violación |
|---|---|
| **no-emoji-icons** | ⚡ ⏱ ✕ ↶ ✓ + sponsor icon backend |
| **Show value not key** | "Respuesta correcta: B" en lugar de "Brasil ganaría" |
| **Wording deceptivo** | "Saltar" no significa "vuelve después" |
| **No undo destructive** | Skip sin confirmation |
| **Layout hacks** | `<span></span>` empty |
| **console.warn en prod** | Telemetry gap |
| **No multi-tab sync** | Race conditions posibles |
| **No keyboard shortcuts** | A/B/C/D sin nav rápida |
| **Live region gaps** | Sin announcement timer expire / correct |
| **Backend HTML/text leak** | Sponsor icon raw render |

---

## 6. Anclas para el redesign

### Core

1. **FAB pill global** con contador
2. **Modal con timer + select + reveal + explain**
3. **2 variantes**: sponsored / sinad
4. **3 estados feedback**: acertó / falló / timeout
5. **Queue management** reactiva con scoped + global
6. **dismissed Set** para deduplicación sesión
7. **Sponsor parsing** `[BRAND:name:icon]` prefix
8. **Tick 1s** + poll 60s

### Quitar

- Emojis críticos (⚡⏱✕↶✓) → SVG icons
- Sponsor icon raw text → image URL o ID enum
- `<span></span>` empty hack
- `console.warn` → telemetry

### Agregar

- **Show text not letter**: "Respuesta correcta: Brasil ganaría"
- **Keyboard shortcuts** A/B/C/D (key 1/2/3/4 o letras)
- **Live region** para announcement timer expire + correct/wrong
- **role="alert"** en error msg
- **Animation timer** cuando llega a 0 (shake o flash)
- **Pulse animation FAB** cuando aparece nueva pregunta
- **Hint match** en FAB ("Trivia · BRA vs CRO")
- **Confirmation skip** "¿Saltar? Esta pregunta no volverá."
- **Barra progreso** visual (no solo texto "1 de 3")
- **Share button** post-acierto ("Compartí con tus panas")
- **Word wrap test** preguntas largas
- **Imagen/media support** en preguntas (logos teams, frames historic)
- **"Por qué" fallback** si no hay explanation ("Datos del Mundial 2022")
- **Sponsor logo image URL** en lugar de texto/emoji
- **Tipo comodín** específico del sponsor
- **Link "Términos del sponsor"** si jurisdiction requiere
- **FAB safe-area-inset** mobile
- **Sync cross-tab** via BroadcastChannel
- **"No sé" opción** explícita o pick-and-skip flow
- **Pick auto-save** antes del timer expire (preservar elección sin submit)

### Considerar

- **Streak counter**: "3 aciertos seguidos! +30 pts bonus"
- **Comparative stats**: "65% de users acertaron"
- **Hint progressive**: gastar pts para revelar 1 opción incorrecta
- **Animation entrada modal**: scale + fade
- **Background match info**: thumbnail del match en header
- **Confetti animation** al acertar (UX celebration)

---

## 7. Resumen ejecutivo

**Surface técnicamente sofisticado** — game loop completo, queue management reactivo, timer real-time, sponsor parsing, 2 variantes visuales. Pero **arrastra el patrón anti-emoji** de toda la app, con MÁS impacto aquí porque es un componente con alto visual profile y propósito de retención + monetización.

1. 🔴 **Emoji critical UI**: ⚡⏱✕↶✓ son los íconos más visibles del componente. Para un surface con propósito de game + ads, anti-pattern grave.

2. 🟠 **"Respuesta correcta: B"** UX confuso — show value not key.

3. 🟠 **Skip "Saltar" engañoso** — implica reversibilidad que no existe.

4. 🟠 **Keyboard shortcuts faltantes** — game loop es ideal para tecladistas.

### 3 decisiones de diseño que cambian todo

1. **SVG icon system para el game loop**: ⚡⏱✕↶✓ son los íconos más vistos del componente. Reemplazarlos por SVG (Heroicons o Lucide) + un sistema de icon size = polish dramático sin cambiar la lógica.

2. **Show text + letter**: "Respuesta correcta: B - Brasil ganaría" + en mobile "Brasil ganaría" en línea aparte. User no tiene que volver a leer la opción.

3. **Keyboard layer**: A/B/C/D + 1/2/3/4 + Enter para submit + Esc para close + ←→ para nav entre preguntas multi. Convierte el componente en un mini game tipo Kahoot.

### Cambios secundarios

- Confirmation skip
- Live region timer + correct/wrong
- role="alert" error msg
- Hint match en FAB
- Pulse FAB notification
- Barra progreso visual
- Share post-acierto
- Imagen/media en preguntas
- Sponsor icon image URL
- Tipo comodín específico
- Animation timer at 0
- FAB safe-area-inset
- Sync cross-tab
- Pick preservation con timer expire
- console.warn → telemetry
- Word wrap test prompts largos

### Considerar features

- Streak counter
- Comparative stats ("65% acertaron")
- Hint progressive (gastar pts)
- Animation entrada modal
- Confetti acierto

**Nota retrospectiva**: este surface es el **mejor diseñado en términos de game mechanics** de la app — timer real-time, queue management, sponsor variant, estados feedback claros. Pero el polish visual (icons, share, animations) no acompaña la sofisticación técnica. Es el surface con MÁS upside post-redesign: cada mejora visual aquí impacta directamente la retención del game loop más fuerte de la app.
