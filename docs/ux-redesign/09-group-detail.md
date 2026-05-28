# Análisis UX: `/groups/:id` — GroupDetailComponent

> Surface #9 del walkthrough. Vista detallada de un grupo específico.
> Es la pantalla más rica de groups family — contiene hero, invitación, premios, ranking interno, sección admin, transfer modal.
> Renderiza diferente según `isAdminOfGroup()` (admin vs miembro).

---

## 1. Identidad

- **Propósito**: hub completo de un grupo individual. Hero motivacional + acciones contextuales (admin o miembro) + ranking interno.
- **Audiencia**: miembro o admin del grupo. UI cambia según rol.
- **Frecuencia**: alta para grupos activos. Pico post-match cuando resultados se publican.
- **Entry points**: tap en cualquier `group-card` desde `/groups`, home "Mis grupos" cards, group-join success, group-create success, transfer-admin success, deep-link.

---

## 2. Estructura — mapa general

```
┌──────────────────────────────────────────────────────────┐
│ ESTADOS DEL CUERPO · 3 mutuamente excluyentes             │
├──────────────────────────────────────────────────────────┤
│  ├── loading: "Cargando grupo…"                           │
│  ├── not-found: "Grupo no encontrado."                    │
│  └── filled: (todo lo siguiente)                          │
└──────────────────────────────────────────────────────────┘

CUANDO FILLED:

┌──────────────────────────────────────────────────────────┐
│ [back-link] "‹ Mis grupos"                                │
│                                                           │
│ [group-hero · gradient verde]                             │
│  ├── top row:                                             │
│  │   ├── img logo (si custom)                             │
│  │   ├── meta line: "MODO X · N MIEMBROS · TÚ ERES ADMIN" │
│  │   ├── h1 group name                                    │
│  │   └── comodines badge (COMPLETE only)                  │
│  │       └── "🃏 Comodines activos" / "🃏 Sin comodines"  │
│  ├── btn admin "⋯" (admin only) → scrollToAdmin()         │
│  └── stats 3-up: Tu pos · Tus pts · Miembros              │
│                                                           │
│ [group-pair] · grid 2-col desktop, stack mobile           │
│  ├── [group-invitar]                                      │
│  │   ├── kicker "CÓDIGO DE INVITACIÓN"                    │
│  │   ├── code BIG ("ABCD23")                              │
│  │   └── actions:                                         │
│  │       ├── "📋 Copiar link" / "✓ Copiado"               │
│  │       └── "✉ Invitar por email" (admin only)           │
│  └── [group-premios]                                      │
│      ├── head: 🏆 "EN JUEGO" + total + "Editar →" (admin) │
│      └── rows: 🥇 1° + 🥈 2° + 🥉 3°                      │
│         OR  empty state "Sin premios definidos"           │
│                                                           │
│ [group-section · ranking interno]                         │
│  ├── header: h2 "Ranking interno · N miembros" +          │
│  │   sub-seg [General] [Por jornada (disabled)]           │
│  ├── info-banner mute (COMPLETE + comodines disabled)     │
│  │   "ℹ Los puntos de este grupo se computan sin          │
│  │    efectos de comodines…"                              │
│  ├── member count row "Miembros · N / 30"                 │
│  ├── rank-table:                                          │
│  │   ├── # · Jugador · Pts · Exactos · Result. · Acción*  │
│  │   ├── row × N (avatar + handle + me indicator)         │
│  │   └── empty: "Aún no hay puntajes…"                    │
│  │   *Exactos/Result hidden en mobile                     │
│  │   *Acción solo si admin (🗑 botón delete)              │
│  └── rank-foot: "La tabla se actualiza automáticamente…"  │
│                                                           │
│ ESTADO ADMIN ────────── ESTADO MIEMBRO (no-admin)         │
│ [group-section]         [group-section]                   │
│  Acciones de admin       Tu membresía                     │
│  ├── ✏ Editar grupo      └── 🚪 Abandonar grupo (danger) │
│  ├── 👑 Transferir admin                                  │
│  └── 🗑 Eliminar grupo                                    │
│                                                           │
│ MODAL INTERNO (lanzado desde "Transferir admin")          │
│ [picks-modal] "Transferir admin"                          │
│  ├── meta: "El nuevo admin podrá editar, invitar…"        │
│  ├── body: lista de radio buttons con nonAdminMembers     │
│  └── footer: Cancelar + "Transferir"                      │
└──────────────────────────────────────────────────────────┘
```

**No tiene tabs user-switchable.** El sub-seg de ranking ("General" / "Por jornada") tiene **una opción disabled** ("Próximamente") — UI placeholder, no funciona.

---

## 3. Componentes page-level

### 3.1 Back link "‹ Mis grupos"

**Render**: link discreto arriba del hero.

**Análisis**:
- ✓ Buena affordance para volver a la lista.
- 🟡 Solo back navigation. Si user llegó desde home, también podría volver ahí (en este caso no hay forma).

### 3.2 Hero verde

**Render**:
```
[IMG]  MODO COMPLETO · 12 MIEMBROS · TÚ ERES ADMIN          ⋯
       Oficina Q1 2026
       🃏 Comodines activos

┌──────────┬──────────┬──────────┐
│ 3°       │ 38       │ 12       │
│ Tu pos.  │ Tus pts  │ Miembros │
└──────────┴──────────┴──────────┘
```

**Datos**:
- img logo (signed URL si admin subió)
- meta line con mode + count + admin badge
- h1 name
- comodines badge (verde activos / mute inactivos) — COMPLETE only
- "⋯" admin button → `scrollToAdmin()`
- 3 stats: myPos, myPoints, rows().length

**Análisis**:
- ✓ **Hero rico y motivacional** — el dato más importante del grupo bien destacado.
- ✓ Mode + member count + admin status en meta line es escaneable.
- ✓ Comodines badge condicional aporta info crítica.
- ⚠ **Información redundante**:
  - "12 MIEMBROS" en meta line + "12 Miembros" en stats row (tercera columna). Doble.
  - "TÚ ERES ADMIN" en meta + "⋯" admin button (el ⋯ ya implica que sos admin). Doble.
- ⚠ Stats columna "Miembros" no aporta vs el primer dato del meta line.
- 🟠 **Description del grupo no se muestra acá**. B2 agregó description al modal de crear pero **el detail page no la renderiza**. El user que añadió "Reglas extra · USD 200 + trofeo" en description nunca la ve de vuelta. Bug latente.
- 🟠 **"⋯" admin button** scrolls to admin section. Pattern poco discoverable — sin tooltip más allá del `aria-label="Más opciones"`. Usuario nuevo puede no entender qué hace.
- 🟡 Emoji 🃏 en comodines badge (anti-pattern).
- 🟡 Logo image **sin skeleton** durante carga — pop-in.
- 🟡 Stat "Tu pos." con "—" cuando no hay puntajes (pre-torneo). Sin estado especial.

### 3.3 Group pair (invitar + premios)

#### a) Group invitar (aside)

**Render**:
```
CÓDIGO DE INVITACIÓN
ABCD23

[📋 Copiar link]  [✉ Invitar por email]  ← admin
[📋 Copiar link]                          ← miembro
```

**Análisis**:
- ✓ Joincode prominente — fácil compartir verbal.
- ✓ "Copiar link" copia la URL completa de join (mejor que solo el código).
- ✓ Toggle state "✓ Copiado" feedback claro.
- 🟠 Joincode en texto **no es seleccionable visualmente** (asumido — no testeado). Si user quiere copiar solo el código, debe esperar el botón.
- 🟡 Emojis 📋 ✓ ✉ anti-pattern.
- 🟡 "Copiar link" no especifica qué link (URL completa? código solo?). Tooltip ayudaría.
- 🟡 No hay opción "Mostrar QR" — útil para sharing in-person.

#### b) Group premios (aside)

**Render** (con premios):
```
🏆  EN JUEGO              Editar →   ← admin only
    USD 350 + trofeo

🥇  1° lugar               USD 200
    Premio mayor

🥈  2° lugar               USD 100

🥉  3° lugar               USD 50
```

**Render** (sin premios, admin):
```
🏆  EN JUEGO              Editar →
    Sin premios

·   Sin premios definidos
    Define los premios para motivar al grupo
```

**Render** (sin premios, miembro):
```
🏆  EN JUEGO
    Sin premios

·   Sin premios definidos
```

**Datos**:
- `prizesTotalLabel()` — suma de los 3 si numéricos, fallback "N premios"
- `hasPrizes()` — flag
- g.prize1st/2nd/3rd como strings libres

**Análisis**:
- ✓ Visual rico con medals.
- ✓ Empty state motivacional para admin ("Define los premios…").
- ⚠ Diferente subtitle: "Premio mayor" en 1°, vacío en 2° y 3°. Inconsistente.
- 🟠 Premios solo 3 lugares fijos. **Premios extras** (revelación, autogol más cómico, etc.) mencionados en bucket 3 review — no implementados.
- 🟡 Emojis 🏆🥇🥈🥉 anti-pattern.
- 🟡 `prizesTotalLabel()` parsea montos si numéricos. Texto libre tipo "iPhone 15" no se suma.

### 3.4 Ranking interno section

#### a) Header con sub-seg

**Render**:
```
Ranking interno · 12 miembros          [General][Por jornada]
                                                  disabled
```

**Análisis**:
- 🔴 **"Por jornada" tab disabled** con tooltip "Próximamente". **Feature placeholder dead UI** — el user ve un tab que no funciona. Confusing affordance.
- Decision: o implementar la feature, o quitar el tab hasta que esté lista.
- 🟡 "General" como única opción activa — sin agregar valor el sub-seg.

#### b) Info-banner mute

**Render** (solo si COMPLETE + comodines disabled):
```
ℹ Los puntos de este grupo se computan sin efectos de comodines.
Tu posición global (ranking del torneo) sigue incluyéndolos.
```

**Análisis**:
- ✓ Info crítica para users de COMPLETE sin comodines.
- ✓ Aclara la separación entre ranking del grupo vs global.
- 🟡 Solo aparece en este caso muy específico. Si user llegó al grupo SIMPLE, no ve info similar sobre "este grupo no cuenta para ranking global" — mismo gap que el hint-banner de /picks.

#### c) Member count display

**Render**:
```
Miembros                    11 / 30
                            (warn si >= 30)
```

**Análisis**:
- ✓ Comunica el cap del grupo.
- 🟠 Si cap reached (30), no hay info de **qué hacer**. ¿"Eliminá inactivos para liberar slots"? ¿"Considerá crear un segundo grupo"?
- 🟡 Inconsistencia con `rows().length` del hero — ambos muestran member count.

#### d) Rank table

**Render**:
```
#   Jugador                     Pts    Exactos*    Result.*    Acción**
1   AV @user1                   38       12          8                 
2   AV @user2 (tú)              35       11          7                
3   AV @user3                   30       10          6        [🗑]
...
```

*Mobile: hide Exactos/Result.
**Solo admin: column Acción con botón delete (no para self)

**Análisis**:
- ✓ Tabla densa pero responsive (hide stats en mobile).
- ✓ `is-me` highlight para el current user.
- ✓ Avatar real (`app-user-avatar` component) — mejor que initials.
- ✓ Admin no puede eliminarse a sí mismo (check `r.userId !== g.adminUserId`).
- 🟠 **🗑 emoji como icon** del delete button (con aria-label sí). Anti-pattern visual.
- 🟠 Delete sin confirmación visible en la card (usa `confirmRemoveMember` que abre ConfirmDialog — bien) pero el botón puede tocarse accidentalmente. Hit target 4×8px es chico — debería ser ≥44×44.
- 🟠 **Sort fijo por Pts desc**. Sin opciones para ordenar por exactos, por results, por fecha de unión.
- 🟡 Empty state row "Aún no hay puntajes. Espera al primer partido." — bueno pre-torneo.
- 🟡 Sin paginación. Grupos cerca de 30 miembros caben pero no hay infrastructure para >30 (que admin puede haber escalado).
- 🟡 Sin **delta** de cambio (este surface es candidato perfecto para deltas semanales internos al grupo).
- 🟡 Sin info de **última actividad** por miembro ("hizo pick hace 2h").

#### e) Rank foot

**Render**:
```
La tabla se actualiza automáticamente cuando se publican los resultados.
```

**Análisis**:
- ✓ Comunica el behavior de update — calma la ansiedad.
- 🟡 Genérico — podría incluir "Última actualización: hace 3 min".

### 3.5 Acciones admin (solo admin)

**Render**:
```
Acciones de admin
┌─────────────────────────────────────────────────────┐
│ ✏ Editar grupo (nombre · descripción · imagen)      │
├─────────────────────────────────────────────────────┤
│ 👑 Transferir admin                                 │
├─────────────────────────────────────────────────────┤
│ 🗑 Eliminar grupo                          (danger) │
└─────────────────────────────────────────────────────┘
```

**Análisis**:
- ✓ **Acciones admin consolidadas** (post Fase D2: invitar + premios no están duplicados acá, viven en group-pair contextual).
- ✓ Transfer admin disabled si solo 1 miembro (no hay nadie a quien transferir).
- ✓ Eliminar con variant danger.
- 🟠 **"Editar grupo (nombre · descripción · imagen)"** — label largo. Más conciso: "Editar grupo".
- 🟡 Emojis ✏👑🗑 anti-pattern (ya con aria-hidden tras P4).
- 🟡 Sin separación visual entre acciones destructivas y no-destructivas — sería bueno spacing más amplio antes de "Eliminar grupo".

### 3.6 Tu membresía (solo no-admin)

**Render**:
```
Tu membresía

🚪 Abandonar grupo                                 (danger)

Si abandonás, tu score acumulado en este grupo se borra.
Tus picks del torneo no se ven afectados.
```

**Análisis**:
- ✓ Acción clara para miembro non-admin (post Fase C feature).
- ✓ Disclaimer útil sobre qué se pierde.
- 🟡 Emoji 🚪 anti-pattern.
- 🟡 Sin opción "Silenciar notificaciones de este grupo" — si user quiere quedarse pero sin spam, no hay middle ground.

### 3.7 Modal Transfer admin (interno)

Ya analizado en doc anterior (modales globales). Vive dentro de este surface.

**Render**:
```
Transferir admin
El nuevo admin podrá editar, invitar y eliminar el grupo. Vos pasás a ser miembro normal.

○ @user1
○ @user2
○ @user3
...

[Cancelar]    [Transferir]
```

**Análisis**:
- ✓ a11y wired (cdkTrapFocus + escape).
- ✓ ConfirmDialog encadenado (Fase C feature).
- 🟠 Lista de members **sin contexto** (no muestra el pts/rank de cada candidato). Si el user quiere elegir el admin "más activo" o "más experimentado", sin data.
- 🟡 Empty state "No hay otros miembros en el grupo" — bueno fallback.

---

## 4. Cross-cutting · hallazgos UX (priorizados)

🔴 **Description del grupo no se muestra en el detail page** — bug latente desde B2 (modal create lo agregó pero detail no lo renderiza).

🔴 **Sub-seg "Por jornada" disabled con tooltip "Próximamente"** — dead UI feature placeholder.

🔴 **"⋯" admin button** poco discoverable — scrolls a admin section sin tooltip claro.

🟠 **Información duplicada en hero**: member count en meta line + stats column "Miembros".

🟠 **"TÚ ERES ADMIN" en meta + admin button ⋯** — implicit + explicit duplican el signal.

🟠 **Delete member button hit target chico** (4×8px aprox) — accidental clicks risk.

🟠 **Sort fijo por Pts** sin opciones (exactos, results, fecha unión).

🟠 **Premios fixed 3 lugares** sin extras (revelación, premios especiales).

🟠 **Hint banner sobre comodines disabled** solo aparece en caso muy específico (COMPLETE + comodines off) — usuario SIMPLE no ve nada parecido.

🟠 **Logo image sin skeleton**.

🟠 **Member count cap (30) sin guidance** cuando se alcanza.

🟡 **Stats columna "Miembros"** duplica meta line del hero.

🟡 **Emojis** 🃏🏆🥇🥈🥉📋✉ ✏ 👑🗑🚪 (todos con aria-hidden ya tras P4 pero visualmente siguen siendo emojis).

🟡 **Joincode no seleccionable visualmente** (asumido).

🟡 **Sin QR option** para sharing in-person.

🟡 **Premios subtitles inconsistentes** ("Premio mayor" en 1°, vacío en 2°/3°).

🟡 **prizesTotalLabel** parsea montos numéricos — texto libre tipo "iPhone 15" no suma.

🟡 **Sub-seg "General/Por jornada"** sin agregar valor cuando solo General está activo.

🟡 **Rank table sin delta** internal al grupo.

🟡 **Sin "última actividad" por miembro**.

🟡 **"Tu pos. —"** sin estado especial pre-torneo.

🟡 **Editar grupo label muy largo** "(nombre · descripción · imagen)".

🟡 **Sin separación visual** entre admin actions destructivas y no-destructivas.

🟢 **Transfer admin lista sin contexto** (pts/rank de cada candidato).

🟢 **Sin "Silenciar notif del grupo"** middle ground.

---

## 5. Antipatrones detectados

| Regla | Violación |
|---|---|
| **Dead UI** | "Por jornada" sub-seg disabled "Próximamente" |
| **Avoid duplicate data** | Member count en hero meta + stats column |
| **Touch target size** | Delete button 4×8px |
| **Discoverability** | "⋯" admin button sin tooltip claro |
| **CTA label concision** | "Editar grupo (nombre · descripción · imagen)" |
| **no-emoji-icons** | 🃏🏆🥇🥈🥉📋✉ ✏ 👑🗑🚪 |
| **Sort affordance** | No hay ordenamiento por columna |
| **Capacity guidance** | 30/30 sin "qué hacer" |
| **Empty state polish** | "Tu pos. —" sin estado especial |
| **Latent bug** | Description input sin render |

---

## 6. Anclas para el redesign

### Core

1. **Hero motivacional** con identity + tu pos + tus pts (la pregunta "cómo voy en este grupo")
2. **Joincode + Copiar/Invitar** (acciones primarias compartir)
3. **Premios** (motivación)
4. **Ranking interno** (comparar con compañeros)
5. **Acciones según rol** (admin / miembro)

### Contextual

- Pre-torneo: empty rank con CTA "Hacer picks →"
- Durante: rank dinámico + last activity
- Post-torneo: final standings + winners highlight

### Quitar

- Stats "Miembros" en hero (duplica meta line)
- "TÚ ERES ADMIN" en meta (si admin button visible)
- Sub-seg "Por jornada" disabled (feature placeholder)
- Emojis estructurales → SVG
- Hint banner comodines redundante con badge del hero

### Agregar

- **Description del grupo en detail page** (bug fix B2)
- **Skeleton logo** image
- **Tooltip "⋯"** o reemplazar por label visible "Acciones admin →"
- **Group QR code** sharing option
- **Sort options** en rank table
- **Delta semanal** internal al grupo (cuando RankSnapshot listo)
- **Última actividad** por miembro
- **Cap guidance** (30/30 + "Eliminá inactivos →")
- **Premios extras** (más allá de 3 lugares)
- **Premios subtitles** consistentes
- **Silenciar notif del grupo** option
- **Transfer admin candidates** con pts/rank info
- **Acciones admin separadas** spacing visual entre destructivas/no
- **Delete member button** padding aumentado (44×44 min)
- **Tu membresía** con "Silenciar" además de "Abandonar"

### Bug fix

- **Description render en detail page** (B2 added input, detail doesn't show)
- **Por jornada tab** → quitar o implementar
- **prizesTotalLabel** parsing texto libre

---

## 7. Resumen ejecutivo

**Surface rica y bien estructurada con 3 problemas:**

1. 🔴 **Bug B2 latente**: description del grupo se ingresa al crear pero **no se muestra acá**. Field invisible para el user.
2. 🔴 **Dead UI**: sub-seg "Por jornada" disabled "Próximamente" — affordance falsa.
3. 🔴 **Duplicación de información** (member count en 2 lugares; admin signal en 2 lugares).

### 3 decisiones de diseño que cambian todo

1. **Mostrar description en detail page** y consolidar info duplicada:
   - Hero compacto: identity + 1 stats line (Tu pos + Tus pts solo)
   - Member count solo una vez (en meta line del hero o en ranking section)
   - Description rendered (bug fix)

2. **Quitar "Por jornada" sub-seg disabled** o implementar la feature:
   - Si feature en roadmap a < 1 mes: dejar pero con badge "Próximamente"
   - Si feature lejos: quitar el sub-seg hasta que esté lista.

3. **Enriquecer ranking interno**:
   - Sort options (click headers)
   - Delta semanal (cuando RankSnapshot listo)
   - Última actividad por miembro
   - Cap guidance cuando 30/30

### Cambios secundarios

- Logo skeleton durante carga
- Tooltip "⋯" o label visible
- Group QR sharing
- Premios extras (más allá de 3 lugares)
- Premios subtitles consistentes
- Transfer modal con pts/rank por candidate
- "Silenciar notif" en tu membresía
- Delete button hit target 44×44 mín
- SVG icons en lugar de emojis
- Separation entre admin actions destructivas/no
