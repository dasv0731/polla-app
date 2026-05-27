# Home redesign + layout (icon sidebar / bottom-nav / editorial)

**Fecha:** 2026-05-27
**Alcance:** `polla-app` (Angular 18) y `polla-backend` (nueva entidad `Article` + mutations admin).

## Problema

Hoy la primera pantalla (`/home`) tiene:
- Greeting + 4-tile hub-grid + 2 próximos partidos. Genérico, sin foco en lo que motiva la acción del día.
- Layout con 3 niveles de nav simultáneos en desktop (topnav + sidebar denso + right-rail), que comen ancho de contenido y duplican destinos.
- Sin contexto competitivo (puntaje, ranking, deltas).
- Sin contenido editorial — la app es transaccional, no se siente como "casa del Mundial".

## Solución (resumen)

Tres cambios entrelazados:

1. **Layout**: topnav slim + collapsible icon sidebar (56px → 200px on hover/click) + bottom-nav iconos en mobile (5 items, no hamburguesa). Right-rail eliminado.
2. **Nueva entidad `Article`** en el backend: el admin sube título + imagen + URL externa (link a `golgana.net/news/<slug>`). No hay página de listado interna — el "Ver todas" enlaza al hub de noticias del dominio principal.
3. **Home rediseñada** con prioridad de información: hero del próximo partido + stats personales + mis grupos + editorial + próximos 4 partidos.

Las técnicas visuales "sports/vibrant" (números grandes, bold hover, gaps generous 48px+, bloques) se aplican respetando la paleta verde existente y la display font actual — no se cambia el branding.

## No-objetivos

- **No** cambiar la paleta primaria (`--wf-green`) ni la display font (logo Golgana, marketing).
- **No** crear página de listado de noticias en polla.golgana.net (vive en golgana.net/news).
- **No** alterar el flujo de scoring, picks, comodines, ni el resto de pantallas (`/picks`, `/groups/:id`, `/ranking`, etc.). Esta feature toca shell, home y agrega Article.
- **No** mover el right-rail a otra pantalla; los premios siguen en `/groups/:id` (ya están), comodines siguen en `/mis-comodines` (ya están).
- **No** implementar editor markdown para Article — sólo title/image/externalUrl/publishedAt/status.

## Diseño técnico

### Backend — nueva entidad `Article`

**Schema (`polla-backend/amplify/data/resource.ts`):**

```typescript
ArticleStatus: a.enum(['DRAFT', 'PUBLISHED']),

Article: a
  .model({
    title: a.string().required(),
    // S3 key (storage path bajo articles/{id}.{ext}). FE usa getUrl({ key })
    // para resolver a signed URL. Mismo patrón que Group.imageKey.
    imageKey: a.string(),
    // URL absoluta a la nota en golgana.net/news/<slug> (o cualquier URL
    // externa). Click abre en nueva pestaña.
    externalUrl: a.string().required(),
    publishedAt: a.datetime().required(),
    status: a.ref('ArticleStatus').required().default('DRAFT'),
    // Orden manual del admin para reordenar el carrusel sin tener que
    // modificar publishedAt. Lower = aparece primero. Default 0.
    sortOrder: a.integer().default(0),
  })
  .secondaryIndexes((idx) => [
    idx('status').sortKeys(['publishedAt']).name('articlesByStatus'),
  ])
  .authorization((allow) => [
    // Lectura pública con apiKey (la home se carga sin auth en SSR future-proof)
    // + authenticated también permite read.
    allow.publicApiKey().to(['read']),
    allow.authenticated().to(['read']),
    allow.group('admins'),  // create/read/update/delete
  ]),
```

**API service wrappers** (`polla-app/src/app/core/api/api.service.ts`):

```typescript
listPublishedArticles(limit = 4) {
  return apiClient.models.Article.listArticleByStatusAndPublishedAt(
    { status: 'PUBLISHED' },
    {
      sortDirection: 'DESC',  // publishedAt DESC
      limit,
      authMode: 'apiKey',
    },
  );
}

// Admin CRUD via existing Amplify Gen 2 owner permissions (admins group)
listAllArticles() { return apiClient.models.Article.list({ limit: 200 }); }
createArticle(input: {...}) { return apiClient.models.Article.create(input); }
updateArticle(input: {...}) { return apiClient.models.Article.update(input); }
deleteArticle(id: string) { return apiClient.models.Article.delete({ id }); }
```

**Storage**: ya hay bucket Amplify (`storage/resource.ts`). Path nuevo: `articles/{articleId}/cover.{ext}`. Admin upload permission para `articles/*`.

**Backend.ts wiring**: no hace falta lambda nueva — Article usa los CRUD nativos de Amplify Gen 2.

### Frontend — layout shell refactor

**Cambios en `polla-app/src/app/shared/layout/`:**

**1. `nav.component.ts` — topnav slim + bottom-nav mobile**
- Mantiene topnav desktop con: logo, links principales (Picks · Grupos · Ranking · Bracket si COMPLETE), bell, user dropdown.
- Quita el menú hamburguesa mobile actual.
- Agrega `<app-bottom-nav>` para mobile (componente nuevo).

**2. `bottom-nav.component.ts` — NUEVO componente**
- Fixed bottom, 5 iconos con label corto debajo:
  - 🏠 Home → `/home`
  - ⚽ Picks → `/picks`
  - 👥 Grupos → `/groups`
  - 🏆 Ranking → `/ranking`
  - 👤 Perfil → `/profile`
- Item activo: color primario + label bold; resto muted.
- Solo visible <768px. Safe-area-inset-bottom respetado.
- Min 44×44pt touch targets, 8px gap entre items.

**3. `sidebar.component.ts` — NUEVO componente (extraído de `nav.component.ts`)**
- Reemplaza el `<aside class="app-sidebar">` actual.
- Default colapsado a **56px** mostrando sólo iconos.
- Click en ☰ (en topnav) o hover sobre el rail → expande a **200px** con labels.
- Solo visible ≥1024px. En 768-1023 no hay sidebar (bottom-nav cubre); en ≥1024 hay rail + bottom-nav está oculto.
- Items: igual contenido que sidebar actual (Admin: Dashboard/Partidos/Llaves/...; non-admin: Mis grupos lista + acciones + Polla Mundialista + Mis predicciones).
- State persistido en localStorage (`polla-sidebar-collapsed`).

**4. `shell.component.ts`**
- Remueve `<app-right-rail>` y `RightRailService` (componente queda en el repo por si querés reactivarlo en otra pantalla, pero no se monta en el shell).
- Agrega `<app-bottom-nav>`.
- Layout grid:
  - Desktop ≥1024: `[sidebar 56-200px] [main 1fr]` + topnav arriba.
  - Tablet 768-1023: `[main 1fr]` + topnav arriba (no sidebar).
  - Mobile <768: `[main 1fr]` + topnav arriba + bottom-nav abajo.

**Sin cambios necesarios**:
- `right-rail.component.ts` queda en el repo (sin uso); el `RightRailService` puede borrarse en una iteración futura.
- `nav.component.ts` mantiene su topnav; sólo se le quita el bloque sidebar y el bloque mobile hamburguesa.

### Frontend — home rediseñada

`home.component.ts` se reescribe siguiendo el mockup aprobado. Estructura:

```
1. HERO próximo partido (full-width)
   - Equipos con banderas grandes, score placeholder o EN VIVO
   - Countdown "faltan 2h 14min"
   - CTA "Hacer mi pick →" (deshabilitado si ya pickeó o ya cerró)
   - Si no hay próximo partido: card "Mundial 2026 comienza el [fecha]"

2. STATS ROW (3 cards horizontales, mobile: stacked)
   - Mi puntaje (UserTournamentTotal.points)
   - Ranking global (#X + delta vs semana anterior si lo tenemos; sino sólo #)
   - Picks pendientes (count + "cierra en Xh" si hay alguno hoy)

3. DOS COLUMNAS desktop (mobile: stacked)
   Columna izq: Mis grupos
     - Lista (top 5) con nombre + posición/total
     - + Crear grupo / Unirme con código
   Columna der: 📰 Noticias del torneo (editorial)
     - 3-4 Article cards (image left, title + relative time + arrow)
     - Footer link "Ver todas en golgana.net →"
     - Empty state: "Próximamente noticias del Mundial"

4. PRÓXIMOS PARTIDOS (lista compacta, 4 items)
   - Fecha · equipos · status "pendiente / picked"
   - Click → /picks o detail según corresponda
```

**Mobile**: orden vertical idéntico, stacked. Hero ocupa todo el ancho. Stats horizontales (3 columnas chicas) o stacked en pantallas muy chicas (<375px).

**Datos:**
- API calls en `ngOnInit`: `listMatches(TOURNAMENT_ID)`, `listTeams(TOURNAMENT_ID)`, `myTotal(userId, TOURNAMENT_ID)`, `listLeaderboard(TOURNAMENT_ID, 200)`, `listPublishedArticles(4)`, `userModes.groups()` (signal existente).
- Compute en cliente: próximo partido = primero con `kickoffAt > now`; picks pendientes = count de matches sin Pick del user en próximas 48h.

### Frontend — admin de Articles

**Nueva ruta `/admin/articles`** (lazy-loaded, dentro de `admin.routes.ts`):

`admin-articles.component.ts` (NUEVO):
- Lista de todos los Articles (incluye DRAFT).
- Columnas: cover thumbnail · title · status pill · publishedAt · sortOrder · actions (edit/publish/unpublish/delete).
- Botón "+ Nueva noticia" arriba.
- Formulario inline o modal: title (required), image upload (S3), externalUrl (required, URL validator), publishedAt (datetime), sortOrder (number), status toggle DRAFT/PUBLISHED.
- Validación: externalUrl debe empezar con `https://`.
- Upload de imagen via `uploadData({ key: 'articles/<id>/cover.<ext>' })` de aws-amplify/storage (mismo patrón que Group.imageKey).

Sidebar admin agrega un item nuevo: `📰 Noticias → /admin/articles`.

### Aplicar "sports/vibrant" techniques sin romper branding

**Mantener**: `--wf-green` como primario, `--wf-display` font, logo Golgana, paleta dark/light actual.

**Aplicar**:
- **Números grandes**: stats con `font-size: clamp(32px, 5vw, 56px)`, font-weight 700, tabular figures.
- **Bold blocks**: cards con borders gruesos (2px), `border-radius: 12px`, no shadows soft — más "tarjeta de fútbol".
- **Gaps generosos**: secciones separadas por 32-48px en desktop, 24-32px mobile.
- **Hover color shift**: links/cards con `transition: background 200ms, transform 200ms`, hover `transform: translateY(-2px)` + background highlight.
- **Live indicator**: para partido EN VIVO, dot rojo pulsante (`@keyframes pulse`).
- **Match cards** con jerarquía clara: time-kicker pequeño arriba, equipos grandes en el centro, status pill abajo.

### Eliminar el right-rail (cleanup)

**Cambios**:
- `shell.component.ts`: remover `<app-right-rail>` y `<div class="app-rail-wrap">`.
- `shell.component.ts`: remover `RightRailService` inject + `[class.has-rail]`.
- Cualquier component que llama `rail.show()` / `rail.hide()` (probablemente `picks-list`, `picks-tabla-grupos`, `picks-bracket`, `groups-list`, `group-detail`): remover esos calls. Sus callsites usan el service para mostrar premios — pero los premios ya viven en `/groups/:id` directamente. No hay regresión funcional.
- `right-rail.component.ts` y `right-rail.service.ts`: quedan en el repo pero sin importarse. Se pueden borrar en una limpieza futura. (YAGNI: dejar para PR aparte.)

## Testing

**Backend**: Amplify Gen 2 CRUD nativo sobre Article no requiere lambda nueva. No hay handler custom para testear. Smoke test manual: crear article via AppSync console o admin UI; listAll via apiKey debe devolver sólo PUBLISHED.

**Frontend — jest:**
- `home.component.spec.ts`: renderiza hero con próximo partido mockeado, stats row con mocked totales, articles section con mocked Article list.
- `bottom-nav.component.spec.ts`: 5 items con activación correcta según ruta.
- `sidebar.component.spec.ts`: collapsed/expanded states, localStorage persist.
- `admin-articles.component.spec.ts`: list, create with form validation.

**Frontend — manual QA** (post-deploy):
- Mobile: bottom-nav siempre visible, item activo highlighted, safe-area respetada.
- Desktop ≥1024: sidebar 56px collapsed por default; click expand → 200px; persist tras refresh.
- Tablet 768-1023: sin sidebar, sin bottom-nav, sólo topnav (verificar no se rompa nada).
- Editorial: admin crea Article DRAFT → no aparece en home. Lo publica → aparece. Click → abre `externalUrl` en nueva pestaña.
- Right-rail: confirmar que NO aparece en ninguna ruta (`/picks`, `/groups`, etc.).

## Migración

- **Article**: tabla nueva, sin datos legacy. Admin la puebla manualmente post-deploy.
- **Right-rail removal**: cero impacto en datos. Pure UI cleanup.
- **Sidebar collapsed default**: nuevos usuarios ven 56px. Para usuarios existentes con localStorage previo (no había uno antes), también ven 56px (default).
- **Bottom-nav mobile**: reemplaza el menú hamburguesa actual. El cambio es visible inmediatamente post-deploy.

## Riesgos

- **Right-rail removal**: pierde info "always visible" sobre premios + comodines. Mitigación: premios ya viven en `/groups/:id` (más contexto), comodines en `/mis-comodines` y en notificaciones cuando se activan. Trade-off aceptable.
- **Sidebar collapse**: usuarios power que usaban el sidebar expandido pierden un layout familiar. Mitigación: estado persiste en localStorage; si lo expanden una vez queda expandido.
- **External link convention**: si admin sube una URL mal, no hay control. Mitigación: regex validation `https?://` + `target="_blank" rel="noopener noreferrer"`.
- **Image upload sin restricciones**: admin podría subir un archivo gigante. Mitigación: max 2MB validado client-side antes del upload (mismo patrón que Group avatar).

## Plan de implementación (alto nivel)

1. **Backend**: Article model + ArticleStatus enum + GSI + storage permission. Deploy sandbox.
2. **Backend**: no requiere lambdas custom; CRUD nativo Amplify Gen 2.
3. **Frontend - infra**: `bottom-nav.component.ts` standalone. `sidebar.component.ts` extraído de `nav.component.ts` con collapse state.
4. **Frontend - shell**: integrar bottom-nav + sidebar nuevo; quitar right-rail; remover callers de `RightRailService.show/hide`.
5. **Frontend - home**: reescribir `home.component.ts` con la estructura priorizada.
6. **Frontend - admin**: `/admin/articles` listado + create/edit/delete forms.
7. **Frontend - api**: agregar `listPublishedArticles` + CRUD wrappers.
8. **Testing**: jest specs + manual QA matrix.
9. **Deploy sandbox + QA end-to-end**.
