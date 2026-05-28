# Análisis UX: Right Rail — RightRailComponent

> Surface #32 del walkthrough. Sidebar derecho 320px sticky, visible solo en desktop ≥1100px.
> **3 bloques verticales**: dark card "Próximo partido" + "Siguientes picks" + "Noticias".
> Backend: matches + picks + Article model (probable + admin-articles que decidimos eliminar).
> Seed data fallback cuando no hay fixtures cargados.

---

## 1. Identidad

- **Propósito**: contexto contextual del torneo y de los picks del user — countdown live, próximos picks pendientes, y noticias del Mundial.
- **Audiencia**: cualquier user autenticado en desktop ≥1100px.
- **Frecuencia**: visible en TODAS las pantallas autenticadas desktop ≥1100px (excepto admin?).
- **Visibilidad**: 0% en mobile + tablet hasta 1100px.

---

## 2. Estructura — 3 bloques

```
┌───────────────────────────────────────┐
│ NEXT MATCH CARD (dark, glow green)   │
│ ┌─────────────────────────────────┐  │
│ │ ● EN VIVO        Mundial 2026   │  │
│ │ El próximo partido               │  │
│ │ Estadio Azteca · CDMX            │  │
│ │                                  │  │
│ │ [03] [12] [45] [22]              │  │
│ │ Días  Hrs   Min  Seg             │  │
│ │                                  │  │
│ │   🇲🇽    VS    🇦🇷              │  │
│ │  MÉXICO       ARGENTINA          │  │
│ │                                  │  │
│ │ ┌─────────────────────────────┐  │  │
│ │ │ Tu pick                     │  │  │
│ │ │ 2 – 1  MÉXICO        [Edit] │  │  │
│ │ └─────────────────────────────┘  │  │
│ │                                  │  │
│ │ [Ver previa completa →]          │  │
│ └─────────────────────────────────┘  │
├───────────────────────────────────────┤
│ SIGUIENTES PICKS                Ver todos │
│ ─────────────────────────────────────  │
│ 4 jun · BRA vs ESP    ✓ Pick           │
│ 2-1 BRASIL                             │
│ ─────────────────────────────────────  │
│ 5 jun · FRA vs ENG    ⚠ en 2 días     │
│ Pendiente                              │
│ ─────────────────────────────────────  │
│ ...                                    │
├───────────────────────────────────────┤
│ NOTICIA DESTACADA (hero card 5:3)    │
│ [image cover + overlay]               │
│ DESTACADA · hace 4 horas              │
│ Sorteo confirmado: México estrena...  │
├───────────────────────────────────────┤
│ MÁS NOTICIAS                          │
│ [img] hace 14h                        │
│       Mbappé llega tocado...          │
│ ─────────────                          │
│ [img] hace 28h                        │
│       Argentina anuncia lista...      │
│ Ver todas →                            │
└───────────────────────────────────────┘
```

**Sticky + scroll interno** cuando contenido excede viewport.

---

## 3. Componentes desglosados

### 3.1 Container sticky

**CSS**:
```css
.side {
  position: sticky;
  top: 24px;
  max-height: calc(100vh - 48px);
  overflow-y: auto;
}
.side > * { flex-shrink: 0; }   /* anti-flatten */
.side::-webkit-scrollbar { width: 4px; }
```

**Análisis**:
- ✓ **Sticky correcto** con top:24px clearance.
- ✓ **Scroll interno** si contenido excede.
- ✓ **`flex-shrink: 0`** comentado correctamente (sin esto, dark card aplastable a 1px).
- ✓ **Scrollbar 4px slim**.
- ✓ Static + overflow:visible en mobile/tablet (≤1099px).
- 🟡 `-webkit-scrollbar` solo en Webkit/Chromium. Firefox usa `scrollbar-width: thin;` (no presente).

### 3.2 Bloque 1 — Next Match Card

#### a) Dark card visual

**CSS**:
```css
background: #0a0a0a;
border-radius: 18px;
border: 1px solid rgba(2,204,116,0.3);
box-shadow: 0 12px 40px rgba(0,0,0,0.18);
```

**Background gradient**:
```css
linear-gradient(160deg, #0a0a0a 0%, #0a3d20 55%, #067a4a 120%)
+ radial-gradients
```

**Análisis**:
- ✓ **Visual fuerte**: dark + green glow + radial gradients.
- ✓ Border verde sutil 30% opacity.
- ✓ Shadow generoso 12px 40px.
- ✓ Consistente con brand identity (sidebar también #0a0a0a).
- 🟢 **Polish visual top-tier** — uno de los visuales más cuidados de la app.

#### b) Top row

**Render**:
```
● EN VIVO         Mundial 2026
```

o:
```
Próximo           Mundial 2026
```

**Análisis**:
- ✓ Pill verde "● EN VIVO" cuando isLive.
- ✓ Tag derecha con phaseLabel.
- 🟠 **`phaseLabel` hardcoded "Mundial 2026"** (línea 491) — no usa el phase real del backend. Si hay matches en R16, Cuartos, etc., **siempre dice "Mundial 2026"**.
- 🟠 **`isLive` check**: `status === 'IN_PROGRESS' || status === 'LIVE'` — inconsistencia backend?

#### c) Headline

```
El próximo partido
Estadio Azteca · CDMX
```

**Análisis**:
- ✓ `<em>próximo</em>` highlighted en verde.
- ✓ Sub con venue.
- 🟠 **"El próximo partido" hardcoded** wording — no cambia si isLive ("EN VIVO ahora" sería mejor).
- 🟡 Sub "Sede por confirmar" si venue null.

#### d) Countdown (solo si !isLive)

**Render**:
```
[03]  [12]  [45]  [22]
Días  Hrs   Min   Seg
```

**Behavior**:
- `setInterval` 1s actualiza countdown
- `computeCountdown(targetMs, nowMs)` → { d, h, m, s }
- Pad-zero para horas/min/seg

**Análisis**:
- ✓ **Real-time tick** 1s.
- ✓ Grid 4-col equal.
- ✓ Pad-zero hace visual consistente.
- ✓ refreshCountdown solo write si !isLive y > 0 diff.
- ✓ Cleanup setInterval en ngOnDestroy.
- 🟠 **`d` sin pad-zero** — visualmente desigual si días es 1 dígito (`3` vs `12`).
- 🟠 **Sin estado "Empieza ya"** cuando todo a 0 — el componente queda en `00:00:00:00`.
- 🟠 **`role="timer"` faltante** (vs trivia-popup que sí lo tiene).
- 🟠 **Sin aria-live** para countdown updates (probable correcto — anuncio cada segundo sería spam).

#### e) Teams flex

**Render**:
```
   ┌──────┐         ┌──────┐
   │ 🇲🇽   │   VS    │ 🇦🇷   │
   └──────┘         └──────┘
   MÉXICO         ARGENTINA
```

**Behavior**:
- 3 columnas: home / VS / away
- Flag con `.fi fi-{code}` (flag-icons CSS library)
- Fallback emoji 🏳️ si no flag

**Análisis**:
- ✓ **flag-icons CSS** library (correcto vs emoji flags del edit-profile-modal). Hereda el problema documentado en memoria.
- ✓ home tiene glow verde diferenciado del away.
- ✓ Fallback emoji 🏳️ defensivo.
- 🟠 **Fallback emoji 🏳️** — anti-pattern + render inconsistente cross-platform.
- 🟠 **`m.homeFlag.toLowerCase()` en template** — debería ser computed (pequeño perf hit, idem CD).
- 🟡 Sin tap/hover en flag para ver historial team.

#### f) Tu pick / Sin pick

**Render con pick**:
```
┌──────────────────────────────────────┐
│ TU PICK                              │
│ 2 – 1   MÉXICO              [Editar]  │
└──────────────────────────────────────┘
```

**Render sin pick (CTA)**:
```
┌──────────────────────────────────────┐
│ SIN PICK                              │
│ Hacer pick →                          │
└──────────────────────────────────────┘
```

**Análisis**:
- ✓ Pattern visual consistente para ambos estados.
- ✓ "Editar" button claramente clickeable.
- ✓ winnerName computed (home si > away, etc.).
- ✓ Empate detection: si home === away, winnerName=null → solo muestra "2 – 2" sin equipo.
- 🟠 **`<em>` para winnerName** con `font-style: normal` — pattern uppercase pill verde. Funciona pero `<em>` semánticamente es énfasis (lo cual ok).
- 🟠 **Sin indicador "live updating"** — si match está in progress, los user puede ver score real vs pick suyo en tiempo real (UX gap).

#### g) CTA Ver previa

```
[Ver previa completa →]
```

✓ Action clara hacia pick-detail.
🟠 **Arrow →** unicode.

### 3.3 Bloque 2 — Siguientes picks

#### Header
```
SIGUIENTES PICKS         Ver todos →
```

#### Row con pick
```
4 jun · BRA vs ESP    ✓ Pick
2-1 BRASIL
```

#### Row sin pick
```
5 jun · FRA vs ENG    ⚠ en 2 días
Pendiente
```

**Análisis**:
- ✓ Mostrar dateLabel + matchLabel (shortcode `BRA vs ESP`).
- ✓ Diferenciación visual hasPick (✓ verde) vs sin pick (⚠ rojo + countdown).
- ✓ Countdown relativo "en 2 días" Intl.RelativeTimeFormat.
- ✓ Link a `/picks/match/:id`.
- 🟠 **`shortCode(name).slice(0,3)`** — `Brasil` → `BRA` ✓, pero `Países Bajos` → `PAÍ` (con tilde + corte raro). **Edge case con nombres compuestos**.
- 🟠 **`✓ Pick` + `⚠`** emoji anti-patterns.
- 🟠 **"Pendiente" wording** — vs claro "Predice ahora" CTA-friendly.
- 🟠 **Limit a 4 rows** (slice 1,5) — sin pagination ni opción "Ver más" inline.
- 🟡 **Date format `DD/MM`** abreviado — pierde year (probable OK porque es torneo único).

### 3.4 Bloque 3 — Noticias

#### a) Hero card 5:3

**Render**:
```
┌──────────────────────────────────┐
│ [image cover opacity 0.55]       │
│                                  │
│                                  │
│ DESTACADA · hace 4 horas         │
│ Sorteo confirmado: México        │
│ estrena el Mundial en Estadio    │
│ Azteca                           │
└──────────────────────────────────┘
```

**CSS**:
- aspect-ratio: 5/3
- imagen `object-fit: cover` + opacity 0.55
- gradient overlay bottom 95% → transparent 60%
- text al fondo del card

**Análisis**:
- ✓ **Visual hero card** moderno con overlay gradient.
- ✓ aspect-ratio CSS modern.
- ✓ Image fallback `news-placeholder.svg` si no resolvedImageUrl.
- ✓ external link con `rel="noopener noreferrer"` (security).
- ✓ relativeTime "hace 4 horas" Intl.
- 🔴 **Article model + admin-articles**: hablamos en Fase D de **ELIMINAR admin-articles**. Pero el right-rail **depende de `listPublishedArticles`**. Si se elimina la UI admin, **el feature deja de tener fuente de contenido**.
- 🟠 **Seed news fallback**: si listPublishedArticles retorna vacío, muestra **4 noticias mock hardcoded** ("Sorteo confirmado: México estrena el Mundial..."). En producción si el admin no publica, **el user ve datos fake**.
- 🟠 **External link → newsHubUrl** `https://golgana.net/news` — link CTA "Ver todas" externo. Pierde user a otro dominio.
- 🟠 **Image lazy loading no especificado** — los `<img>` sin `loading="lazy"`.

#### b) News list (3 rows + Ver todas)

**Render**:
```
[img 46×46]  hace 14h
              Mbappé llega tocado...
─────────────
[img 46×46]  hace 28h
              Argentina anuncia lista...
─────────────
[img 46×46]  hace 50h
              Análisis: el grupo de la muerte...
─────────────
Ver todas →
```

**Análisis**:
- ✓ Thumbnail 46×46 + content.
- ✓ background-image fallback gradient verde si no image.
- ✓ Border-bottom delineation.
- 🟠 **`backgroundImage` inline style** en template — XSS risk si `resolvedImageUrl` es user-controlled. Probable OK porque viene de getUrl(Amplify) pero worth noting.
- 🟠 **Sin event tracking** (telemetry) al click.

### 3.5 Seed data fallback

**Seed activo cuando**:
- API listMatches retorna vacío (sandbox) → seed `México vs Argentina + 4 upcoming`
- API listPublishedArticles retorna vacío → seed `4 noticias mock`

**Análisis**:
- ✓ **Pragmatic** para development y demo.
- 🔴 **Si producción tiene un día con API down o admin no publicó, user ve datos fake** que no son del torneo real.
- 🔴 **Sin indicator "Datos de muestra"** o "Cargando…" — user no sabe que es seed.
- 🟠 **Seed news con titulares fake**: "Mbappé llega tocado", "Argentina anuncia lista" — si user busca real y no la encuentra, **frustración**.
- 🟠 **Seed pierde valor** si Article model se elimina (Fase D decisión).
- 🟡 Comentario código admite: "Remover cuando haya feed productivo".

### 3.6 Data loading

**Behavior**:
- `loadNextAndUpcoming`: 3 Promise.all (matches + teams + picks)
- `loadNews`: listPublishedArticles + getUrl(imageKey) por item
- setInterval(1000) ticker countdown

**Análisis**:
- ✓ Promise.all para paralelizar.
- ✓ teamMap + pickMap para O(1) lookup.
- ✓ Filter matches: kickoff > now - 2h (incluye recently started).
- ✓ Sort ascending por kickoff.
- 🔴 **`listMatches` + `listTeams` + `myPicks` cargan en TODOS los renders del right-rail**. Visible en TODAS las pantallas desktop ≥1100px. **Cache cross-route faltante** — cada navegación = re-fetch.
- 🔴 **`listPublishedArticles` + N×getUrl** N+1 patrón.
- 🟠 **`console.warn` errors** (líneas 518, 600) en prod sin telemetry.
- 🟠 **2 calls separados** (next/upcoming + news) sin orquestación — posible race conditions visuales.
- 🟠 **`getUrl({ expiresIn: 3600 })`**: URLs expiran en 1h. Si user mantiene tab abierta >1h, imágenes rotas.
- 🟡 Sin loading skeleton states.

### 3.7 Mobile/tablet collapse

**CSS**:
```css
@media (max-width: 1099px) {
  .side { position: static; max-height: none; overflow: visible; }
}
```

**Análisis**:
- ✓ Collapse a normal block.
- 🟠 **Visible debajo del main en mobile** — agrega content abajo de la pantalla. Aunque commented en shell, sigue mountado. **Si usuario solo ve home en mobile, scroll hasta el fondo para ver next-match card que también está en /home top card?**

---

## 4. Cross-cutting · hallazgos UX (priorizados)

🔴 **Seed data en prod**: si API falla o admin no publica, user ve datos fake sin indicator.

🔴 **Article model dependency**: Fase D eliminó admin-articles UI. Right-rail depende del model.

🔴 **N+1 imagen getUrl** loadNews.

🔴 **Cache cross-route**: re-fetch en cada pantalla desktop.

🔴 **`phaseLabel` hardcoded** "Mundial 2026" (no usa phase real).

🟠 **flag-icons CSS** usado correctamente (positivo, hereda flag-icons issue documentado).

🟠 **Fallback flag emoji 🏳️** anti-pattern.

🟠 **Países Bajos → "PAÍ"** shortCode awkward.

🟠 **Countdown sin pad-zero days**.

🟠 **Sin "Empieza ya"** state.

🟠 **`✓ Pick` + `⚠`** emoji.

🟠 **"Pendiente" wording** vs CTA-friendly.

🟠 **Limit 4 rows upcoming** sin "Ver más".

🟠 **Hero image sin lazy loading**.

🟠 **`backgroundImage` inline** style.

🟠 **getUrl expires 1h** — imagen rota tab larga.

🟠 **External link a golgana.net** pierde user.

🟠 **`console.warn` prod**.

🟠 **2 calls sin orquestación** loading.

🟠 **Sin loading skeleton states**.

🟠 **`role="timer"` faltante**.

🟠 **Sin live score updating** match in progress.

🟠 **Sin event tracking** news clicks.

🟠 **`-webkit-scrollbar` solo** (Firefox falta).

🟠 **Wording "El próximo partido"** no cambia si isLive.

🟠 **Sin indicator "Datos de muestra"** seed.

🟡 **`<em>` semantic vs visual**.

🟡 **Date format pierde year**.

🟡 **Sin tap/hover flag** historial team.

🟢 **Visual dark card top-tier**.

🟢 **Brand identity consistency** #0a0a0a.

🟢 **Real-time tick countdown 1s**.

🟢 **Sticky scroll interno**.

🟢 **`flex-shrink: 0` anti-flatten** comentado.

🟢 **Seed pragmatic** para sandbox.

🟢 **Empate detection** winnerName.

🟢 **External links security** (rel noopener).

🟢 **Intl Relative + Date** correctos.

🟢 **TZ explícita** America/Guayaquil.

🟢 **teamMap + pickMap** O(1) lookup.

🟢 **Promise.all** paralelización.

🟢 **Cleanup setInterval** destroy.

🟢 **Skeleton card hero** placeholder svg.

🟢 **Collapse mobile** static layout.

🟢 **Aspect-ratio CSS** modern.

🟢 **shortCode hack** funcional aunque awkward.

🟢 **Mobile/tablet hide** intencional (no zombie).

---

## 5. Antipatrones detectados

| Regla | Violación |
|---|---|
| **Seed data sin indicator** | Mock visible en prod silencioso |
| **Dependency to-be-removed** | Article model post Fase D |
| **N+1 image URLs** | getUrl per item |
| **Cache cross-route** | Re-fetch cada nav |
| **Hardcoded phase** | "Mundial 2026" siempre |
| **no-emoji-icons** | 🏳️ ✓ ⚠ → + |
| **shortCode encoding** | Países Bajos → PAÍ |
| **External URL exit** | golgana.net pierde user |
| **Image lazy loading** | Sin loading="lazy" |
| **Inline styles dynamic** | backgroundImage style |
| **expires 1h** | getUrl URL rota tab larga |
| **Scrollbar cross-browser** | Solo Webkit |
| **`role="timer"` faltante** | Countdown a11y gap |
| **console.warn prod** | Telemetry gap |
| **No loading skeleton** | UX standard violado |

---

## 6. Anclas para el redesign

### Core

1. **3 bloques verticales sticky** (next + upcoming + news)
2. **Dark card visual top-tier**
3. **Real-time countdown** tick 1s
4. **flag-icons CSS** library
5. **Empate detection** + winnerName logic
6. **Seed fallback** pragmatic
7. **External news links** con security
8. **Intl relative/date** consistent
9. **Cleanup setInterval**
10. **Mobile/tablet collapse**

### Quitar

- 🏳️ ✓ ⚠ → emojis → SVG icons
- Seed data sin indicator (o agregar "Datos de muestra" tag)
- `phaseLabel` hardcoded → backend phase
- Article dependency → considerar feed externo (RSS)
- shortCode encoding awkward → mejorar
- `console.warn` → telemetry

### Agregar

- 🔴 **"Datos de muestra" indicator** cuando seed activo
- 🔴 **Cache cross-route** (signal global o service) — evitar re-fetch
- 🔴 **Backend RPC consolidada**: `getMyRightRail()` que retorne todo en 1 call (next + upcoming + news pre-resolved con urls)
- 🔴 **Image URL persistence**: store en backend (long-lived URL) vs getUrl 1h
- 🔴 **Phase label real** del backend
- **`role="timer"`** + aria-label countdown
- **Pad-zero days** countdown
- **"Empieza ya" state** countdown a 0
- **Loading skeleton states** durante fetch
- **lazy loading** imágenes
- **shortCode mejorado**: countries compound names ("Países Bajos" → "NED" via ISO code)
- **Live score updating** match in progress
- **Wording "EN VIVO ahora"** cuando isLive
- **Event tracking** news clicks
- **Scrollbar cross-browser** (Firefox compat)
- **Mobile/tablet visibility** decisión: ¿mostrar en mobile o no? Hoy `static` block ocupa espacio considerable.

### Considerar

- **Pull-to-refresh** mobile
- **Quick actions** en next-match card (random pick, sticky note)
- **Compare picks** con amigos directamente desde upcoming row
- **Notification banner** post-pick guardado
- **News dismissable** (X close para ocultar noticia leída)
- **News filter** por team favorito

---

## 7. Resumen ejecutivo

**Surface con polish visual top-tier** — dark card con gradients + glow verde, countdown real-time, flag-icons, hero news con overlay gradient. Lo que falla:

1. 🔴 **Seed data fake en producción**: si API listMatches o listPublishedArticles retornan vacío, el user ve mock data ("México vs Argentina", "Mbappé llega tocado…") **sin warning**. En sandbox OK, en prod = engaño.

2. 🔴 **Dependency a Article model + admin-articles**: en Fase D decidimos eliminar admin-articles UI. Pero el right-rail depende de `listPublishedArticles`. **Si eliminamos admin pero no migramos a fuente externa, este bloque queda solo con seed para siempre**.

3. 🔴 **Cache cross-route missing**: el right-rail se monta en TODAS las pantallas desktop ≥1100px. Cada navegación → re-fetch matches + teams + picks + news + N×getUrl. **Performance hit notable**.

4. 🔴 **N+1 getUrl en news**: por cada noticia, 1 call extra. Si listPublishedArticles retorna 10, son 10 calls de getUrl + 1 del list.

### 3 decisiones de diseño que cambian todo

1. **Backend RPC consolidada `getMyRightRail()`**: 1 endpoint que retorne next-match + upcoming-picks + news (con imageUrls pre-resolved). Reduce de 5+ calls a 1. **Cache global signal** en service cross-route que invalida solo en interaction relevante (pick guardado, navegación a match-detail).

2. **News strategy decision**: si admin-articles se elimina (Fase D), opciones:
   - **A**: Integrar feed externo (RSS golgana.net, news API FIFA, etc.)
   - **B**: Eliminar bloque news del right-rail (reducir a 2 bloques: next + upcoming)
   - **C**: Mantener Article model + admin minimal (solo CRUD básico)
   - Sin esto, el bloque news es zombie permanente con seed.

3. **Seed data transparency**: si seed activo en cualquier momento, banner pequeño "Datos de ejemplo · Esperando fixtures" para user transparency.

### Cambios secundarios

- SVG icon system (🏳️ ✓ ⚠ →)
- Phase label real backend
- role="timer" + aria-label
- Loading skeleton states
- Pad-zero days countdown
- "Empieza ya" state
- shortCode encoding fix
- lazy loading images
- Live score updating in progress
- Event tracking news
- Scrollbar Firefox compat
- Wording "EN VIVO ahora"
- Image URL long-lived
- console.warn → telemetry
- Mobile/tablet visibility decisión

### Considerar features

- Pull-to-refresh mobile
- Quick actions next-match
- Compare picks amigos
- News dismissable
- News filter por team

**Nota retrospectiva**: este es **el surface con MÁS polish visual del walkthrough** (dark card + countdown + flag-icons + hero gradient). Pero el polish técnico (cache, N+1, seed transparency) NO acompaña. Es el ejemplo perfecto del trade-off: el frontend dedica polish enorme al visual, mientras la data layer trabaja con N+1 + seed silenciosa. **Refactor backend-side mantendría el visual y eliminaría los gaps**.
