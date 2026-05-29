# Análisis UX: `/groups/:id/prizes` — GroupPrizesEditComponent

> Surface #11 del walkthrough. Form de edición de premios del grupo (admin-only).
> 3 inputs texto libre fijos: 1° / 2° / 3° lugar.

---

## 1. Identidad

- **Propósito**: definir los premios del grupo. Texto libre por cada uno de los 3 lugares.
- **Audiencia**: solo admin del grupo. Non-admin redirigido a empty state.
- **Frecuencia**: muy baja. Setup inicial + ajustes ocasionales.
- **Entry points**: link "Editar →" en `group-premios` aside de `/groups/:id`.

---

## 2. Estructura — mapa general

```
┌──────────────────────────────────────────────────────────┐
│ [page-header]                                            │
│  ├── small "← {group.name}" o "Volver al grupo"          │
│  └── h1 "Premios del grupo"                              │
│                                                          │
│ [main container-app narrow]                              │
│                                                          │
│ [4 estados mutuamente excluyentes]                       │
│  ├── loading: "Cargando…"                                │
│  ├── group-not-found: "Grupo no encontrado."             │
│  ├── not-admin: "Solo el admin puede editar premios."    │
│  └── form (admin):                                       │
│      └── [form-card]                                     │
│          ├── h2 "Define los premios"                     │
│          ├── lead largo (~3 líneas)                      │
│          ├── 🥇 Primer lugar (input text, 200 max)       │
│          ├── 🥈 Segundo lugar (input text, 200 max)      │
│          ├── 🥉 Tercer lugar (input text, 200 max)       │
│          ├── error message (si error())                  │
│          └── actions: [Guardar premios] [Cancelar]       │
└──────────────────────────────────────────────────────────┘
```

**Sin tabs internos.** Form linear simple.

---

## 3. Componentes desglosados

### 3.1 Page header

**Render**:
```
← Oficina Q1 2026
Premios del grupo
```

**Análisis**:
- ✓ **Mejor que `/groups/:id/edit`**: back link incluye `group.name` con fallback. Da contexto.
- ✓ h1 claro.
- 🟡 Fallback "Volver al grupo" si group() null durante loading — texto cambia mientras carga (UX jitter).

### 3.2 Empty states

3 variants:
1. Grupo no encontrado
2. Solo admin puede editar
3. Loading

**Análisis**:
- ⚠ Todos usan `.empty-state` class — consistencia interna del componente.
- 🟡 Sin contexto del grupo en "Solo el admin puede editar los premios."
- 🟡 Sin CTA "← Volver" en non-admin (vs group-edit que lo tiene).

### 3.3 Form card

#### a) Header + lead

**Render**:
```
Define los premios

Texto libre — puede ser plata, un trofeo, un asado, una camiseta, lo que tu grupo
haya acordado. Los miembros verán los premios solo si llenas al menos uno; deja
vacíos los puestos sin premio.
```

**Análisis**:
- ✓ Lead es **informativo y conversacional** — dice qué se puede poner, da ejemplos, explica edge case (vacíos).
- ⚠ ~3 líneas largas — el user puede skip y no entender que "vacío = sin premio".
- 🟡 "los miembros verán los premios solo si llenas al menos uno" — semánticamente ambiguo. ¿No se ven si los 3 están vacíos? El detail page muestra "Sin premios definidos" si no hay ninguno. La lógica es OK pero la frase es ambigua.
- 🟡 Sin preview de cómo se ven los premios en `/groups/:id`.

#### b) 3 fields de premios

**Render** (cada uno):
```
🥇 Primer lugar
[Ej: USD 200 + trofeo                        ]

🥈 Segundo lugar
[Ej: USD 80                                  ]

🥉 Tercer lugar
[Ej: Asado pagado                            ]
```

**Datos**:
- 3 inputs texto libre, maxlength=200
- placeholder con ejemplos diferenciados por lugar

**Análisis**:
- ✓ A11y `for/id` wired (P3 done).
- ✓ Examples diferenciados (USD + trofeo / USD / asado) sugieren creatividad.
- ⚠ **Emojis 🥇🥈🥉 EN LOS LABELS** — visualmente parte del label, no envueltos en `aria-hidden`. Anti-pattern.
- ⚠ Sin character counters (X/200).
- 🟠 **Solo 3 lugares fixed**. Bucket 3 review mencionó "premios extras" (revelación, autogol más cómico, mejor predicción por jornada) — no implementados.
- 🟡 Sin validation visible más allá de maxlength.
- 🟡 Empty input ELIMINA el premio (`.trim() || null` en save) — sin warning si user tenía premio guardado y vacía.
- 🟡 Placeholders ejemplos en USD — implícito que la moneda es USD pero no se aclara. Group multi-moneda no soportado.

#### c) Error message

**Render**:
```
{error()} (color rojo)
```

**Análisis**:
- 🟡 Sin `role="alert"`.

#### d) Actions

**Render**:
```
[Guardar premios] [Cancelar]
```

**Análisis**:
- ✓ "Guardar premios" label específico (vs genérico "Guardar").
- ⚠ **Guardar button NO usa `dirty()` check** — está habilitado siempre que no esté saving. El user puede apretar sin haber cambiado nada y disparar save inútil.
- 🔴 **No tiene CanDeactivate guard**. Vs group-edit que sí lo tiene (Fase C wired). Si el user navega away con cambios sin guardar, **se pierden silenciosamente**.
- ⚠ "Cancelar" link a `/groups/:id` — sin confirm si hay cambios.

---

## 4. Cross-cutting · hallazgos UX (priorizados)

🔴 **Sin CanDeactivate guard** — cambios sin guardar se pierden si user navega.

🔴 **Sin `dirty()` check** en save button — disparado sin cambios.

🟠 **Solo 3 lugares fixed** — sin "premios extras" para casos especiales.

🟠 **Emojis 🥇🥈🥉 dentro del label** sin `aria-hidden`.

🟠 **Empty input borra premio existente sin warning**.

🟠 **Sin preview** de cómo se ven los premios en `/groups/:id`.

🟡 **Sin character counters** (200 chars max).

🟡 **Error sin `role="alert"`**.

🟡 **Lead text largo** (~3 líneas).

🟡 **"Solo si llenas al menos uno"** semánticamente ambiguo.

🟡 **Implícito USD** en ejemplos sin aclarar.

🟡 **Sin CTA "← Volver"** en non-admin empty state.

🟡 **No-admin empty sin contexto del grupo**.

🟡 **Cancelar sin confirm** si hay cambios.

🟡 **Page header fallback "Volver al grupo"** cambia a `{group.name}` cuando carga — UX jitter.

🟢 **`prizesTotalLabel`** parsing texto libre limitado a montos numéricos.

---

## 5. Antipatrones detectados

| Regla | Violación |
|---|---|
| **Missing CanDeactivate guard** (Web Guidelines) | Cambios sin guardar se pierden |
| **Form polish** | Save button sin dirty check |
| **Inconsistency** (con `/groups/:id/edit`) | group-edit tiene guard, prizes no |
| **Anti-pattern destructive** | Empty input borra sin warning |
| **no-emoji-icons** | 🥇🥈🥉 en labels sin aria-hidden |
| **Empty state polish** | Non-admin sin contexto |
| **A11y** | Error sin role="alert" |
| **Char counters** | 200 max sin visualización |

---

## 6. Anclas para el redesign

### Core

1. **3 inputs texto libre** (mantener simplicidad)
2. **Lead informativo** (qué pueden poner)
3. **Admin-only gate**

### Quitar

- Emojis 🥇🥈🥉 dentro de labels → SVG con `aria-hidden`
- Lead largo → comprimir
- Fallback "Volver al grupo" jitter → spinner o "..." skeleton

### Agregar

- **CanDeactivate guard** (consistencia con group-edit)
- **`dirty()` check** en save button
- **Character counters** (X/200)
- **Warning si user vacía un premio previamente guardado** (confirm dialog)
- **Preview live** de cómo se ven los premios (en sidebar o panel derecho)
- **Premios extras** opcionales:
  - Revelación
  - Autogol más cómico
  - Mejor predicción por jornada
  - U otros custom-defined por admin
- **Soporte multi-moneda** o aclarar USD
- **Sort by premio amount** opcional (auto-sort 1° > 2° > 3° por monto)
- **role="alert"** en error
- **Field "Aclaraciones" textarea** opcional para reglas de entrega
- **Empty state non-admin con contexto** + CTA "← Volver"
- **Confirm en Cancelar** si dirty

### Bug fix

- Wire CanDeactivate guard
- Add `dirty()` computed para Guardar button

---

## 7. Resumen ejecutivo

**Surface más simple que group-edit pero con regresión de polish:**

1. 🔴 **Falta CanDeactivate guard** — el group-edit lo tiene (Fase C wired) pero prizes no. Cambios sin guardar se pierden silenciosamente al navegar.

2. 🔴 **Save button sin dirty check** — el user puede disparar save sin cambios.

3. 🟠 **Modelo fijo 3 lugares** sin flexibilidad para premios extras (revelación, autogol, etc.) que serían valiosos para engagement.

### 3 decisiones de diseño que cambian todo

1. **Wire CanDeactivate guard + dirty check** (consistency con group-edit). Es mecánico — el patrón ya existe en la app.

2. **Modelo de premios extensible**:
   - Mantener 3 lugares principales fijos (1°, 2°, 3°)
   - Permitir agregar **premios extras** custom (max ~5 más):
     - Revelación
     - Autogol más cómico
     - Por jornada (best of week)
     - Otros admin-defined
   - Cada extra: label custom + texto libre
   - Backend requiere `prizes: [...]` array (no solo 3 fields fijos)

3. **Preview live**:
   - Panel derecho desktop mostrando cómo se ven los premios en `/groups/:id`
   - Actualización en tiempo real mientras admin tipea

### Cambios secundarios

- Character counters X/200
- Confirm si user vacía premio previamente guardado
- SVG icons en lugar de emojis
- Lead text más conciso
- Empty state non-admin con CTA
- role="alert" en error
- Aclarar moneda (USD por default) o soporte multi-moneda
- Field "Aclaraciones" textarea opcional para reglas de entrega
- Confirm en Cancelar si dirty
- Page header sin jitter del fallback

**Nota retrospectiva**: este surface es **buen candidato para convertirse en modal** dentro de `/groups/:id` en lugar de página dedicada. 3 campos texto + acciones cabe perfecto en modal. Bucket 3 review lo mencionó: "Prizes podría editarse modal o page". Mi recomendación: convertir a modal cuando se haga el refactor de routing — reduce 1 ruta del backlog y mantiene la edición contextual al grupo.
