# A5 · Tone + Branding + Legal Sweep Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **All sub-agent dispatches MUST use opus 4.7** per project memory.

**Goal:** Sweep cross-app de las decisiones de producto consolidadas: (1) tono **tú** consistent (~50 strings voseo→tú), (2) branding **Golgana global** + **"Polla Mundialista 2026" como sub-title** (no 4 variantes), (3) **logo size unificado** (single token `--logo-size-md: 32px` aplicado), (4) **links Términos/Privacidad reales** (no `href="#"` placeholders).

**Architecture:** Sweep mecánico ejecutado en orden: tone → branding → logo size → legal links. Cada surface afectada → 1 file change. Commit por categoría (4-5 commits totales). Validación final via grep checks que documentan 0 residuales.

**Tech Stack:** Angular 18 standalone templates + TypeScript strings + CSS variables. Sin nuevas dependencias.

---

## Decisiones de producto (load-bearing — verificar antes de empezar)

Antes de cualquier cambio, **leer memoria**: `C:\Users\Marke\.claude\projects\C--Users-Marke-Documents-Respaldo-polla-mundialista\memory\project_ux_redesign_decisions.md` para confirmar:
- **Branding**: Golgana brand global. "Polla Mundialista 2026" sub-feature/título de producto dentro de Golgana.
- **Tone**: tú consistente cross-app.
- **"tus panas"** y **"tipeas"** son OK (regional pero compatibles con tú).

---

## File Structure

**Modify** (cross-cutting sweep — afecta ~25-35 archivos):
- Auth surfaces: login, register, forgot-password (4 archivos)
- Modales: trivia-popup, randomizer, redeem, edit-profile, preferences, transfer-admin section in group-detail, group-actions, tour-overlay (~8 archivos)
- Shell: sidebar, nav, shell, trivia-toast, footer (~5 archivos)
- Features: groups (5 archivos), comodines, profile, ranking, notifications, picks-list, picks-pending-banner, special-picks (~10 archivos)
- CSS: tokens.css (logo-size unificado), styles/auth-shell.css si tiene branding

**No new files**.

---

## Pre-sweep grep audit (Task 1)

Documentar strings encontradas antes de cambiar — útil para verificación final.

---

## Tasks

### Task 1: Audit baseline (grep snapshot pre-sweep)

**Files:** Ninguno modificado. Solo grep documentation.

- [ ] **Step 1: Grep voseo strings**

```bash
mkdir -p docs/superpowers/audits

cat > docs/superpowers/audits/2026-05-28-a5-sweep-baseline.md << 'EOF'
# A5 Pre-Sweep Baseline Audit

Date: 2026-05-28
Branch: feature/ux-redesign-sprint-1

## Voseo strings (target: 0 after sweep)

EOF

# Run greps and append output
for pattern in 'cre[áa]( |\)|$)' 'unite' 'Ten[ée]s' '\bVos\b' 'Querés' 'Pickeá' 'Pedile' 'Pegá' 'Vas a' 'Podés' 'Empezá' 'apagás' 'Usá' 'encontrás'; do
  echo "### Pattern: ${pattern}" >> docs/superpowers/audits/2026-05-28-a5-sweep-baseline.md
  echo '```' >> docs/superpowers/audits/2026-05-28-a5-sweep-baseline.md
  grep -rn "$pattern" src/app/ --include="*.ts" --include="*.html" 2>/dev/null | head -20 >> docs/superpowers/audits/2026-05-28-a5-sweep-baseline.md
  echo '```' >> docs/superpowers/audits/2026-05-28-a5-sweep-baseline.md
  echo '' >> docs/superpowers/audits/2026-05-28-a5-sweep-baseline.md
done
```

- [ ] **Step 2: Grep href="#" placeholders**

```bash
echo "## href=\"#\" placeholders (target: 0 after sweep)" >> docs/superpowers/audits/2026-05-28-a5-sweep-baseline.md
echo '```' >> docs/superpowers/audits/2026-05-28-a5-sweep-baseline.md
grep -rn 'href="#"' src/app/ --include="*.ts" --include="*.html" >> docs/superpowers/audits/2026-05-28-a5-sweep-baseline.md
echo '```' >> docs/superpowers/audits/2026-05-28-a5-sweep-baseline.md
```

- [ ] **Step 3: Grep logo size variations**

```bash
echo "## Logo size variants (target: 1 token after sweep)" >> docs/superpowers/audits/2026-05-28-a5-sweep-baseline.md
echo '```' >> docs/superpowers/audits/2026-05-28-a5-sweep-baseline.md
grep -rn 'height:.*28px\|height:.*32px\|height:.*40px' src/app/ src/styles/ --include="*.ts" --include="*.html" --include="*.css" 2>/dev/null | grep -i 'logo' >> docs/superpowers/audits/2026-05-28-a5-sweep-baseline.md
echo '```' >> docs/superpowers/audits/2026-05-28-a5-sweep-baseline.md
```

- [ ] **Step 4: Grep branding variants**

```bash
echo "## Branding string variants (target: unified after sweep)" >> docs/superpowers/audits/2026-05-28-a5-sweep-baseline.md
echo '```' >> docs/superpowers/audits/2026-05-28-a5-sweep-baseline.md
grep -rn 'POLLA\b\|Polla Mundialista\|GOLGANA · MUNDIAL 2026\|Polla Mundial 2026' src/app/ --include="*.ts" --include="*.html" 2>/dev/null >> docs/superpowers/audits/2026-05-28-a5-sweep-baseline.md
echo '```' >> docs/superpowers/audits/2026-05-28-a5-sweep-baseline.md
```

- [ ] **Step 5: Commit audit**

```bash
git add docs/superpowers/audits/2026-05-28-a5-sweep-baseline.md
git commit -m "docs(audit): A5 pre-sweep baseline (tone+branding+logo+legal)

Documenta voseo strings, href=\"#\" placeholders, logo size variants,
branding variants ANTES del sweep. Útil para verificación post-sweep.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Tone sweep voseo → tú

**Files:** ~20-30 surfaces afectadas (auth + modales + features). Identificadas en Task 1 grep.

**Mappings** (string contextual — NO blind search/replace):

| Voseo | Tú |
|---|---|
| `creá` (verb imperativo) | `crea` |
| `unite` | `únete` |
| `Tenés` / `tenés` | `Tienes` / `tienes` |
| `Vos pasás` | `Tú pasas` |
| `Querés` | `Quieres` |
| `Pickeá` | `Elige` |
| `Pedile` | `Pídele` |
| `Pegá` | `Pega` |
| `Vas a` | (mantener — futuro neutral) |
| `Podés` | `Puedes` |
| `Empezá` | `Empieza` |
| `apagás` | `apagas` |
| `Usá` | `Usa` |
| `encontrás` | `encuentras` |
| `arrastrá` | `arrastra` |
| `acertás` | `aciertas` |
| `aplicá` | `aplica` |
| `tipeas` | (mantener — regional ok) |
| `tus panas` | (mantener — regional ok) |

- [ ] **Step 1: Iterate each surface from Task 1 audit**

Read each file with voseo strings. Apply targeted Edit per match. Verify context (e.g. "creá" → "crea" in imperative, but "creación" stays).

- [ ] **Step 2: Verify build + tests**

```bash
npx ng build --configuration=development
npx jest
```

- [ ] **Step 3: Verify grep clean**

```bash
for pattern in 'cre[áa]( |\)|$)' 'unite' 'Ten[ée]s' 'Querés' 'Pickeá' 'Pedile' 'Pegá' 'Podés' 'Empezá' 'apagás' 'Usá' 'encontrás'; do
  count=$(grep -rc "$pattern" src/app/ --include="*.ts" --include="*.html" 2>/dev/null | awk -F: '{sum+=$2} END {print sum}')
  echo "$pattern: $count"
done
```

Expected: each count = 0 (or accepted exception with documentation).

- [ ] **Step 4: Commit**

```bash
git add -A src/app/
git commit -m "refactor(tone): sweep voseo → tú cross-app (~50 strings)

A5 product decision: tú consistente. Affected surfaces:
- Auth: login (errors), register (handle-conflict, OTP tip), forgot-password
- Modales: trivia, randomizer, redeem, edit-profile, preferences,
  transfer-admin (group-detail), group-actions, tour-overlay
- Shell: sidebar, nav, footer logout, trivia-toast
- Features: groups (detail, edit, prizes, invite), comodines,
  profile, ranking, notifications, picks variants
Excepciones mantenidas (regional pero compatibles con tú):
- 'tus panas' (community vocative)
- 'tipeas' (verb form acceptable in both)

Refs: docs/superpowers/specs/2026-05-28-ux-redesign-master-plan-design.md A5.1
docs/ux-redesign/* (cross-cutting tone fragmentation 12+ instancias)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Branding sweep — unificar a "Golgana" + "Polla Mundialista 2026" sub-title

**Files:**
- `src/app/shared/layout/sidebar.component.ts` — brand text "POLLA" → estructura unificada
- `src/app/features/auth/login.component.ts` — brand panel desktop "GOLGANA · MUNDIAL 2026"
- `src/app/features/auth/register.component.ts` — same
- `src/app/features/auth/forgot-password.component.ts` — same + mobile-head
- `src/app/features/groups/group-join.component.ts` — header brand + footer
- `src/app/features/onboarding/onboarding.component.ts` — sin brand title actualmente, agregar consistente
- `src/app/shared/layout/footer.component.ts` — texto del footer (verificar consistencia)

**Branding canonical pattern** (post-sweep):

```html
<!-- Desktop brand panel (auth surfaces) -->
<div class="brand-panel__top">
  <img src="assets/logo-golgana.png" alt="Golgana" class="brand-logo">
  <div class="brand-panel__sub">Polla Mundialista 2026</div>
</div>

<!-- Sidebar logo expanded -->
<a routerLink="/home">
  <img src="assets/logo-golgana.png" alt="Golgana" class="brand-logo">
  <strong class="lsb__brand-sub">Polla Mundialista 2026</strong>
</a>

<!-- Mobile head -->
<div class="auth-mobile-head">
  <img src="assets/logo-golgana.png" alt="Golgana" class="brand-logo--sm">
  <h1>Golgana</h1>
  <div class="kicker">Polla Mundialista 2026</div>
</div>
```

- [ ] **Step 1: Sidebar — replace "POLLA" with sub-title**

Read `src/app/shared/layout/sidebar.component.ts`. Find `<strong>POLLA</strong>` line. Replace with:

```html
<strong class="lsb__brand-sub">Polla Mundialista 2026</strong>
```

Add CSS for `.lsb__brand-sub`:
```css
.lsb__brand-sub {
  display: none;
  color: #fff;
  font-family: var(--font-primary);
  font-size: 13px;
  letter-spacing: 0.04em;
  font-weight: 600;
  white-space: nowrap;
}
.lsb:hover .lsb__brand-sub { display: block; }
```

- [ ] **Step 2: Auth panels — login + register + forgot brand panel**

For each of 3 auth surfaces, find brand panel desktop top section. Replace:

```html
<!-- BEFORE -->
<img ... alt="Golgana">
<span class="auth-brand__title">GOLGANA · MUNDIAL 2026</span>

<!-- AFTER -->
<img ... alt="Golgana">
<span class="auth-brand__title">Polla Mundialista 2026</span>
```

Note: the brand visible is GOLGANA logo image + "Polla Mundialista 2026" sub-text.

- [ ] **Step 3: Mobile heads — login + register + forgot**

Find mobile-head sections (typically with ⚽ emoji). Already replaced by SVG icon in A1/future, but copy:

```html
<!-- BEFORE -->
<div class="auth-mobile-head__logo">⚽</div>
<h1 class="auth-mobile-head__title">Polla Mundialista</h1>
<div class="auth-mobile-head__kicker">Mundial 2026</div>

<!-- AFTER -->
<img src="assets/logo-golgana.png" alt="" class="auth-mobile-head__logo">
<h1 class="auth-mobile-head__title">Golgana</h1>
<div class="auth-mobile-head__kicker">Polla Mundialista 2026</div>
```

(Logo image opacity may need adjustment via CSS for mobile head — verify visual.)

- [ ] **Step 4: group-join header alt vs aria-label fix**

Read `src/app/features/groups/group-join.component.ts` header. Currently:
```html
<a routerLink="/picks" class="auth-header__logo" aria-label="Polla Mundial 2026">
  <img src="assets/logo-golgana.png" alt="Golgana" ...>
</a>
```

Fix:
- Change `aria-label="Polla Mundial 2026"` → `aria-label="Golgana"` (match alt).
- Change routerLink from `/picks` to `/home`.

- [ ] **Step 5: Footer text consistency**

Read `src/app/shared/layout/footer.component.ts`. Brand text currently says "Polla Mundialista — sub-módulo de Golgana para la FIFA World Cup 2026". Acceptable per pattern (mention Golgana explicitly). Verify no changes needed.

- [ ] **Step 6: Verify grep**

```bash
grep -rn 'POLLA\b' src/app/ --include="*.ts" --include="*.html"
# Expected: 0 (or only in code comments / branding-final strings if any)

grep -rn 'GOLGANA · MUNDIAL 2026' src/app/ --include="*.ts" --include="*.html"
# Expected: 0

grep -rn 'Polla Mundial 2026' src/app/ --include="*.ts" --include="*.html"
# Expected: 0 (only "Polla Mundialista 2026" canonical)
```

- [ ] **Step 7: Commit**

```bash
git add -A src/app/
git commit -m "refactor(branding): unify to 'Golgana' brand + 'Polla Mundialista 2026' sub-title

A5 product decision: Golgana brand global, Polla Mundialista 2026 como
sub-feature/título dentro de Golgana. Affected:
- Sidebar: 'POLLA' → 'Polla Mundialista 2026' sub-title
- Auth panels desktop: 'GOLGANA · MUNDIAL 2026' → 'Polla Mundialista 2026'
- Mobile heads: brand image + 'Golgana' + 'Polla Mundialista 2026' kicker
- Group-join: aria-label fix to match alt, link to /home

Refs: docs/superpowers/specs/2026-05-28-ux-redesign-master-plan-design.md A5.2
4 variantes branding consolidadas a 1.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Logo size unification

**Files:**
- Auth surfaces (login, register, forgot, group-join, onboarding) — inline `style="height:Xpx"` removal
- Sidebar — verify uses var(--logo-size-md) or inline matches
- Footer — same

**Strategy**: replace inline `style="height:28px"`, `style="height:32px"`, `style="height:40px"` with `class="brand-logo"` referencing `--logo-size-md` from A1 tokens.

- [ ] **Step 1: Add `.brand-logo` utility class**

Add to `src/styles/components.css` (or appropriate global stylesheet):

```css
.brand-logo {
  height: var(--logo-size-md, 32px);
  width: auto;
}
.brand-logo--sm { height: var(--logo-size-sm, 24px); width: auto; }
.brand-logo--lg { height: var(--logo-size-lg, 48px); width: auto; }
```

- [ ] **Step 2: Replace inline styles in 5 auth surfaces**

For each of login, register, forgot, group-join, onboarding:
- Find `<img src="assets/logo-golgana.png" ... style="height:Xpx;width:auto;">`
- Replace style attribute with `class="brand-logo"`.

Sidebar: similar (logo image inside `.lsb__logo`).

Footer: same approach.

- [ ] **Step 3: Verify grep**

```bash
grep -rE 'style="height:(28|32|40)px' src/app/ --include="*.ts" --include="*.html" | grep -i logo
# Expected: 0
```

- [ ] **Step 4: Commit**

```bash
git add -A src/app/ src/styles/
git commit -m "refactor(logo): unify logo size via .brand-logo utility class

A5 logo size unification: 5 variantes (28/32/40/sin valor) → 1 token
--logo-size-md (32px) via .brand-logo class. Replaced inline styles
in login, register, forgot-password, group-join, onboarding, sidebar,
footer.

Refs: docs/superpowers/specs/2026-05-28-ux-redesign-master-plan-design.md A5.3

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Legal links — replace `href="#"` placeholders

**Files:** Surfaces con `href="#"` identified in Task 1 audit. Typical locations:
- `src/app/features/auth/register.component.ts` — terms checkbox (Términos / Privacidad)
- `src/app/features/groups/group-join.component.ts` — footer Reglas / Privacidad
- `src/app/features/auth/login.component.ts` — terms checkbox (si tiene)
- Other surfaces if any

**Real URLs**:
- Términos: `https://polla.golgana.net/terminos`
- Privacidad: `https://polla.golgana.net/privacidad`
- Reglas: `https://polla.golgana.net/reglas` (verify if differs)

**Pattern**: external links → `target="_blank" rel="noopener noreferrer"`.

- [ ] **Step 1: Find all `href="#"` in templates**

```bash
grep -rn 'href="#"' src/app/ --include="*.ts" --include="*.html"
```

- [ ] **Step 2: Replace each with real URL + rel="noopener noreferrer"**

For each match:

```html
<!-- BEFORE -->
<a href="#">Términos</a>

<!-- AFTER -->
<a href="https://polla.golgana.net/terminos" target="_blank" rel="noopener noreferrer">Términos</a>
```

Same for Privacidad, Reglas.

- [ ] **Step 3: Footer external "Reglas" verify rel="noopener"**

Check `src/app/shared/layout/footer.component.ts` for external "Reglas" link (was missing `rel="noopener"` per walkthrough doc 36). Add if missing.

- [ ] **Step 4: Verify grep clean**

```bash
grep -rn 'href="#"' src/app/ --include="*.ts" --include="*.html"
# Expected: 0
```

- [ ] **Step 5: Commit**

```bash
git add -A src/app/
git commit -m "refactor(legal): replace href=\"#\" placeholders with real Términos/Privacidad URLs

A5 legal links: Términos, Privacidad, Reglas → polla.golgana.net real URLs
con rel=\"noopener noreferrer\" para external links.

Resuelve placeholders identificados en docs/ux-redesign/17-login.md,
18-register.md, 19-forgot-password.md, 20-group-join.md, 36-footer-auth-shell.md.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Final verification + grep audit

**Files:** Ninguno modificado.

- [ ] **Step 1: Run all tests**

```bash
npx jest
```

Expected: same count as pre-A5 (no regression).

- [ ] **Step 2: Production build**

```bash
npx ng build --configuration=production
```

Expected: success.

- [ ] **Step 3: Final grep audit**

```bash
echo "=== Voseo residual ==="
for pattern in 'cre[áa]( |\)|$)' 'unite' 'Ten[ée]s' 'Querés' 'Pickeá' 'Pedile' 'Pegá' 'Podés' 'Empezá' 'apagás' 'Usá' 'encontrás'; do
  count=$(grep -rE "$pattern" src/app/ --include="*.ts" --include="*.html" 2>/dev/null | wc -l)
  echo "$pattern: $count"
done

echo ""
echo "=== Branding variantes residual ==="
echo "POLLA\\b: $(grep -rE 'POLLA\b' src/app/ --include='*.ts' --include='*.html' 2>/dev/null | wc -l)"
echo "GOLGANA · MUNDIAL 2026: $(grep -rn 'GOLGANA · MUNDIAL 2026' src/app/ --include='*.ts' --include='*.html' 2>/dev/null | wc -l)"

echo ""
echo "=== href=# placeholders residual ==="
grep -rn 'href="#"' src/app/ --include="*.ts" --include="*.html" 2>/dev/null | wc -l

echo ""
echo "=== Logo size inline residual ==="
grep -rE 'style="height:(28|32|40)px' src/app/ --include="*.ts" --include="*.html" 2>/dev/null | grep -ic logo
```

All expected outputs: 0 (or documented exceptions).

- [ ] **Step 4: Acceptance gate checklist**

- [x] `grep` voseo strings: 0 (or accepted exceptions documented).
- [x] `grep 'href="#"' src/app` = 0.
- [x] Logo size: 1 token usado consistente.
- [x] Branding visible audit: sidebar + auth + footer + group-join consistent.
- [x] Links Términos/Privacidad: rel="noopener" verified.
- [x] Tests existentes verdes.

- [ ] **Step 5: Optional summary commit**

```bash
git commit --allow-empty -m "chore(a5): A5 tone+branding+legal sweep complete

Summary:
- Tone: ~50 strings voseo → tú cross-app
- Branding: 4 variantes (POLLA, Polla Mundialista, GOLGANA · MUNDIAL 2026,
  Polla Mundial 2026) → 1 canonical 'Golgana' + 'Polla Mundialista 2026' sub-title
- Logo size: 5 variantes (28/32/40/sin valor) → 1 token --logo-size-md via .brand-logo class
- Legal links: href=\"#\" placeholders → real polla.golgana.net URLs con rel=\"noopener\"

Refs: docs/superpowers/specs/2026-05-28-ux-redesign-master-plan-design.md A5
docs/superpowers/audits/2026-05-28-a5-sweep-baseline.md
docs/ux-redesign/* (all 36 surfaces affected by some aspect of the sweep)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Summary

A5 produce ~5-6 commits — audit baseline + 4 sweep categories + final verification.

**Dependency**: Foundation A1 helpful (`.brand-logo` class uses `--logo-size-md` token) but NOT strict. Can run independently.

**Sub-proyectos downstream que se benefician**:
- A7 auth family — brand panel cross-surface consistente
- A8 surfaces — copy consistente cross-app

**Estimación**: ~3-5 días (sweep mecánico + verification).

**Dispatch strategy**: 1 sub-agente opus 4.7 coordinador. Tasks 2-5 son paralelizables si se split por categoría, pero secuencial es más simple.

**Note**: Manual smoke recommended después de A5 ya que cambios visuales en branding pueden necesitar QA visual. Sub-agente no puede ejecutar.
