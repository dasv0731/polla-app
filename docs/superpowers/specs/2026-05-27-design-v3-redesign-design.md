# Design v3 — Re-skin completo (sidebar negro, KPI strip, right-rail, FAB)

**Fecha:** 2026-05-27
**Alcance:** `polla-app` exclusivamente. Sin cambios de backend.
**Design source:** `polla-app/design-input/prueba-gg/project/polla-v3.html` (handoff de Claude Design / claude.ai/design).

## Problema

La home implementada en la sesión previa cumple la funcionalidad pero el look quedó suave: paleta verde clara, sin profundidad visual, sin contexto contextual del Mundial siempre a la vista. El user prototipó un design v3 con identidad visual fuerte (sidebar negro, hero compacto, KPI strip, right-rail sticky con próximo partido + siguientes picks + news) y pide implementarlo pixel-perfect.

## Solución (resumen)

Re-skin completo de la app respetando el design v3:

1. **Tokens globales nuevos**: paleta primaria verde `#02cc74` (similar al actual, slight shift), negros `#0a0a0a`, fondo cream `#f5f4f0`. Display font **Bebas Neue**, primary **Montserrat**.
2. **Shell**: sidebar izquierdo negro (64px → 200px hover), toast global (trivia), FAB global (trivia), right-rail reintroducido.
3. **Home**: hero compacto · KPI strip 5-up · picks pendientes block dark · mis grupos · row (especiales | ranking card) · comodines · right-rail (next match + upcoming + news).
4. **Modales**: crear grupo / unirme con código / trivia — diseño v3.

## No-objetivos

- **No** tocar backend (sin cambios de schema, lambdas, scoring).
- **No** romper rutas existentes (picks, groups, ranking, profile, admin). Cambia el look pero los flujos y datos siguen iguales.
- **No** mantener el bottom-nav del flow anterior. El sidebar negro se convierte en bottom-nav iconos en mobile (consistente con v3).
- **No** rehacer pantallas internas (admin, group-detail, etc.) más allá de adaptar tokens/colores. Solo la home y el shell cambian estructuralmente.

## Diseño técnico

### 1. Tokens globales (`polla-app/src/styles/`)

**Nuevo `polla-app/src/styles/tokens.css`** (o el archivo existente que define `--wf-*`). Reemplazar/agregar:

```css
:root {
  /* Paleta primaria */
  --color-primary-green: #02CC74;
  --color-primary-black: #0A0A0A;
  --color-primary-white: #FFFFFF;
  --color-bg-cream:      #F5F4F0;

  /* Overlays */
  --color-green-soft:    rgba(2, 204, 116, 0.18);
  --color-green-ink:     #016b3d;
  --color-text-muted:    rgba(0, 0, 0, 0.5);
  --color-on-dark-muted: rgba(255, 255, 255, 0.7);
  --color-line:          rgba(0, 0, 0, 0.08);

  /* Resultados */
  --color-win:  #02CC74;
  --color-draw: #F4D03F;
  --color-lost: #E74C3C;
  --color-warn: #F59E0B;
  --color-danger: #DC2626;

  /* Tipografía */
  --font-display: "Bebas Neue", system-ui, sans-serif;
  --font-primary: "Montserrat", system-ui, sans-serif;

  /* Compat aliases (fade-out gradual) — mapean los nombres antiguos a los nuevos
     para que componentes no migrados sigan funcionando. */
  --wf-green:       var(--color-primary-green);
  --wf-green-ink:   var(--color-green-ink);
  --wf-green-soft:  var(--color-green-soft);
  --wf-paper:       var(--color-primary-white);
  --wf-fill:        var(--color-bg-cream);
  --wf-line:        var(--color-line);
  --wf-ink:         var(--color-primary-black);
  --wf-ink-2:       rgba(0, 0, 0, 0.7);
  --wf-ink-3:       var(--color-text-muted);
  --wf-display:     var(--font-display);
  --wf-danger:      var(--color-danger);
  --wf-warn:        var(--color-warn);
}
```

**Importar Google Fonts** en `polla-app/src/index.html`:

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Montserrat:wght@300;400;500;600;700&display=swap" rel="stylesheet">
```

**Body base** en `polla-app/src/styles.css`:

```css
body {
  background: var(--color-bg-cream);
  font-family: var(--font-primary);
  color: var(--color-primary-black);
}
```

### 2. Shell layout (`shared/layout/shell.component.ts`)

Estructura final:

```
<app-shell>
  <app-sidebar />               (fixed left 64px, expand 200px on hover, ≥768px; bottom-nav <768px)
  <app-trivia-toast />          (above main if trivia available)
  <div class="shell">           (grid: 1fr 320px; margin-left 64px on desktop)
    <main>...</main>
    <app-right-rail />          (sticky 320px on desktop ≥1100px; stacks below main otherwise)
  </div>
  <app-fab />                   (fixed bottom-right, opens trivia modal)
  <app-toast-host />
  <app-trivia-popup />
  <app-group-actions-modals />
  <app-redeem-modal />
</app-shell>
```

Reemplaza la implementación actual. `app-bottom-nav` actual queda fusionado dentro de `app-sidebar` (CSS responsive: cambia de rail vertical a bottom-nav horizontal en <768px).

### 3. `sidebar.component.ts` (re-skin completo)

Mantiene la lógica actual (collapse persist, sections según rol) pero cambia:

- **Fondo**: `#0a0a0a` (era light paper).
- **Default**: 64px collapsed (era 56px).
- **Hover**: 200px expand (sin click toggle, solo hover — el design v3 no tiene botón toggle).
- **Layout vertical desktop ≥768px**; en mobile **<768px** colapsa a **bottom-nav horizontal** de 60px alto con 5 iconos+labels chicos.
- **Items para usuarios**: 🏠 Inicio (/home) / ⚽ Mis picks (/picks) / 👥 Grupos (/groups) / 🏆 Ranking (/ranking) / 🌎 Mundial 2026 (/picks/group-stage/predict — entry al flow de predicciones).
- **Items para admin** (cuando `isAdmin === true`): los anteriores + 🛠 Admin (/admin) como sexto item. Las sub-páginas de admin se navegan desde `/admin` (el admin dashboard ya tiene sus links).
- **Bottom**: 🔔 Notificaciones (con badge si hay no leídas) + avatar usuario con handle (en hover/expand muestra el handle, en mobile el avatar queda en topbar — ver punto 4).

Detalles visuales clave (extraídos del HTML):
- Active state: `background: rgba(2,204,116,0.18); color: #fff;`.
- Default link color: `rgba(255,255,255,0.7)`.
- Iconos emoji (consistente con app actual).
- Notification badge: círculo verde primary con count.

### 4. `top-bar` mobile (componente nuevo si no existe)

En el design v3, **el mobile no tiene top-bar visible** porque la navegación inferior toma su rol. Pero los user actions (bell, profile) viven en el sidebar (que en mobile es bottom). Decisión: en mobile, agregar avatar + bell en el top-bar mobile que ya existe (`nav.component.ts` tiene un `.app-topbar`).

### 5. Toast banner global (`trivia-toast.component.ts` — NUEVO)

```typescript
@Component({
  standalone: true,
  selector: 'app-trivia-toast',
  template: `
    @if (hasActiveTrivia()) {
      <div class="trivia-toast">
        <span class="trivia-toast__dot"></span>
        <span>Nueva trivia disponible · {{ pendingCount() }} preguntas para ganar comodín ·</span>
        <a (click)="openTrivia()">Responder →</a>
      </div>
    }
  `,
  // ...
})
```

Reusa el state existente de trivia (probablemente en `trivia-popup.component.ts` o un servicio). Si no existe un signal expuesto de "hay trivia pendiente", agregar a `core/trivia/` un service liviano que lo derive de `listMyOpenTrivia(...)`.

Inline styles del HTML:
```css
margin-left: 64px;
background: #0a0a0a;
color: #fff;
border-bottom: 1px solid rgba(2,204,116,0.4);
padding: 8px 24px;
text-align: center;
font-size: 12px;
```

Dismissible? El design v3 no lo muestra como dismissible — solo desaparece si no hay trivia. Mantenemos eso (no botón close).

### 6. FAB global (`trivia-fab.component.ts` — NUEVO)

```typescript
@Component({
  standalone: true,
  selector: 'app-trivia-fab',
  template: `
    @if (hasActiveTrivia()) {
      <button class="fab" (click)="openTrivia()">
        <span class="fab__i">⚡</span>
        <span class="fab-text">Trivia · Comodín</span>
      </button>
    }
  `,
})
```

`position: fixed; bottom: 20px; right: 20px; z-index: 60;` con gradient + pulse animation. En mobile sube a `bottom: 74px` para no chocar con bottom-nav.

### 7. Right-rail reintroducido (`right-rail.component.ts`)

Reusar el archivo que dejamos sin uso. Ahora contiene **3 secciones distintas** (el contenido de v3, no el viejo):

1. **Next match card** (`.np`) — gradient dark con countdown 4-tile, equipos con flag + ranking FIFA, meta info (cierre, en juego, polla %), tu pick (si tienes), CTA "Ver previa completa".
2. **Siguientes picks** (`.up`) — lista de 4 partidos con time + match name + estado (✓ Pick X-X o ⚠ Pendiente Xh).
3. **News** — hero card con cover image grande + 3 rows compactas (title + relative time).

Visibilidad: solo desktop ≥1100px. En tablet/mobile el right-rail stackea debajo del main.

Datos:
- Next match: `listMatches` ordenado por kickoff, primero futuro.
- Siguientes picks: matches con kickoff < 7 días, con/sin pick del user (`myPicks`).
- News: ya tenemos `listPublishedArticles(4)` desde la home actual; aquí cambia a 1 hero + 3 rows compactas.

### 8. Home content (`home.component.ts`)

Re-escrito **otra vez** con el orden v3:

```
1. HERO compacto (gradient dark green) — avatar, greeting "Hola @handle", "Quedan N días · estás en #X", stats line, alert "Cierra el primer pick en Xh", CTA "Hacer picks".

2. KPI STRIP (5 cards):
   - Ranking global #N (verde gradient, primer card)
   - Puntos 128/350 + delta "Top X%"
   - Aciertos 68% (17/25) + delta "Sobre promedio"
   - Grupos 3 (1° en Prueba1)
   - Comodines 2/3

3. PICKS PENDIENTES (dark card) — gran número verde + texto + CTA.

4. MIS GRUPOS section — 3 grupos lista + 2 botones "Crear grupo" / "Unirme".

5. ROW 2-cols: PICKS ESPECIALES (3 chips horizontales) | RANKING CARD (gradient verde grande).

6. COMODINES — chips compactos.
```

Mobile: stackea todo a 1-col. KPIs pasan a 2-col en pantallas <780px.

**Cálculos de KPIs** — algunos son aproximaciones porque la app no tiene todos los datos:
- "Ranking global #N" — usamos `UserTournamentTotal` y `listLeaderboard`. ✓ existe.
- "Puntos N/M" — N = puntos actuales; M = "objetivo personal" no existe en data → mostrar solo N sin "/M" o usar "/total posible mundial" (~hard to compute).
- **Decisión**: mostrar puntos sin denominador (`128 pts` solo) o usar máx puntos posibles fijos del torneo si lo sabemos.
- "Aciertos %" — calcular client-side: `myPicks` con `pointsEarned > 0` / total picks de partidos FINAL. Approximación válida.
- "Grupos N (1° en X)" — N = `userModes.groups().length`; mejor posición computable iterando `groupLeaderboard` para cada grupo (costoso pero acotado a ≤5 grupos típicos).
- "Comodines N/M" — `Comodin.list` filtered by user, status active. N=active, M=cap (5).
- "Delta semanal" — no tenemos data histórica. Mostrar "—" o ocultar el delta.

Para v1: mostrar lo que se puede; placeholders graceful para el resto (e.g., "—" en delta).

### 9. Modales (3 nuevos / re-skins)

- **`create-group` modal**: ya existe (`group-actions-modals.component.ts`). Re-skin a la estética v3.
- **`join-group` modal**: igual, ya existe.
- **`trivia` modal**: ya hay `trivia-popup.component.ts`. Re-skin si difiere visualmente, pero el FAB y el toast usan el mismo flow.

Estilos comunes del v3 design para modales:
- `background: rgba(10,10,10,0.75); backdrop-filter: blur(6px);`
- Card: `background: #fff; border-radius: 16px; padding: 28px; max-width: 480px;`
- Title: `font-family: var(--font-display); font-size: 28px;`
- Buttons primary: `background: var(--color-primary-green); color: #fff;` con uppercase + letter-spacing.

### 10. Asset: hero placeholder

El design usa `./assets/hero-placeholder.svg` para las news. Cuando no hay imagen real, mostrar un placeholder SVG cream/green abstract. Crear `polla-app/public/assets/news-placeholder.svg` (10 KB SVG simple) y usarlo como fallback.

### Componentes Angular nuevos

- `polla-app/src/app/shared/layout/trivia-toast.component.ts`
- `polla-app/src/app/shared/layout/trivia-fab.component.ts`
- `polla-app/src/app/core/trivia/active-trivia.service.ts` (si no existe — derivar de listMyOpenTrivia)

### Componentes a modificar

- `polla-app/src/app/shared/layout/sidebar.component.ts` — re-skin negro + simplificar items + hover-expand sin botón toggle.
- `polla-app/src/app/shared/layout/bottom-nav.component.ts` — borrar (su rol lo absorbe sidebar.component responsive).
- `polla-app/src/app/shared/layout/shell.component.ts` — agregar toast, fab, right-rail.
- `polla-app/src/app/shared/layout/right-rail.component.ts` — rewrite con los 3 bloques (next match, upcoming, news).
- `polla-app/src/app/features/home/home.component.ts` — rewrite con la estructura v3.
- `polla-app/src/app/shared/layout/nav.component.ts` — adaptar topbar mobile para mostrar bell + avatar (porque mobile no tiene los del sidebar).
- `polla-app/src/styles/tokens.css` + `styles.css` — nuevos tokens + body base.
- `polla-app/src/index.html` — Google Fonts links.

## Testing

**Frontend manual QA**:
- Desktop ≥1100px: sidebar negro 64px, hover → 200px; toast en top si trivia activa; main central; right-rail 320px sticky con next match + upcoming + news; FAB bottom-right si trivia activa.
- Desktop 768-1099px: sidebar visible, right-rail stackeado debajo del main.
- Mobile <768px: bottom-nav horizontal (5 iconos + labels), main full-width, right-rail stackea, FAB sube por encima del bottom-nav.
- Trivia: toast aparece al haber trivia abierta; click "Responder" abre modal trivia; FAB también lo abre.
- KPIs muestran data real (ranking, points), placeholders graceful donde no se puede calcular.

**Jest**:
- `home.component.spec.ts` rewrite — mockear data y verificar render de KPIs, picks pendientes count, sections present.
- `trivia-toast.component.spec.ts` — visible only if hasActiveTrivia signal is true.
- `sidebar.component.spec.ts` — items list + active state.

## Migración

- **Tokens globales**: el alias compat (`--wf-green` → `var(--color-primary-green)`) preserva todos los componentes existentes sin tocarlos. Visualmente: como el nuevo `#02CC74` es muy cercano al verde anterior, el cambio es sutil.
- **Fonts**: Bebas Neue + Montserrat son fonts de Google Fonts. Carga inicial añade ~50KB. Acceptable.
- **Right-rail**: pre-existing service `RightRailService` se reactiva. Algunos features podrían querer ocultarlo (admin?). En v3 default: visible siempre en home; en otras rutas, decisión local.
- **Mobile bottom-nav** del flow anterior se reemplaza por la versión sidebar-responsive del v3. Mismo rol pero diferente CSS.

## Riesgos

- **Re-skin masivo**: cambios de tokens afectan TODA la app. Riesgo de pequeñas regresiones visuales en pantallas internas. Mitigación: smoke test rápido en cada pantalla post-deploy.
- **Bebas Neue para numbers/headings**: tiene letterforms muy estilizadas. Verificar legibilidad en `kpi__v` (24px) y `np__cd__n` (26px).
- **Cálculos KPI**: aproximaciones graceful con "—" donde no hay data. Documentado.
- **Right-rail siempre visible en home** sin trivia/news puede sentirse vacío. Mitigación: empty states elegantes (ya documentados).

## Plan de implementación

1. **Tokens + fonts** — actualizar `tokens.css`, importar Google Fonts en `index.html`, body base. Confirm look se mantiene en pantallas existentes (compat aliases).
2. **Sidebar re-skin** — negro, hover-expand, items v3, responsive bottom-nav.
3. **Trivia state service** — derivar `hasActiveTrivia` + `pendingCount` desde data existente; expose como signal.
4. **Trivia toast + FAB** — componentes nuevos consumiendo el service.
5. **Right-rail rewrite** — 3 bloques (next match, upcoming, news).
6. **Shell integration** — wire toast, fab, right-rail; remove old bottom-nav.
7. **Home rewrite** — hero compacto, KPI strip, picks pendientes, grupos, especiales+ranking, comodines.
8. **Modales re-skin** — create-group, join-group, trivia.
9. **Asset** — news-placeholder.svg.
10. **QA visual smoke test + adjustments**.
