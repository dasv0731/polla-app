# A5 Pre-Sweep Baseline Audit

Date: 2026-05-28
Branch: feature/ux-redesign-sprint-1
Last commit before sweep: `ea2a802 chore(a4): physical deletion of auth-shell + group-create placeholders`

## Scope

Documenta strings encontradas antes del sweep cross-app A5 (tone + branding + logo + legal).
Útil para verificación post-sweep que todos los counts cierran a 0 (con excepciones documentadas).

## 1. Voseo strings (target: 0 after sweep)

### Pattern: `creá` (verb imperativo)

```
src\app\features\groups\group-join.component.ts:77: Pedile al admin que elimine a alguien inactivo o creá un grupo nuevo.
src\app\features\onboarding\onboarding.component.ts:41: El Mundial 2026 está a la vuelta. Para empezar, creá un grupo con tus
```

Note: `crea` (presente indicativo "crea uno para ver tu ranking") and `creación`/`crear` stay.

### Pattern: `unite`

```
src\app\features\onboarding\onboarding.component.ts:42: panas o unite con un código que te compartieron.
```

### Pattern: `Tenés` / `tenés`

```
src\app\shared\util\dirty-form.guard.ts:29: 'Tenés cambios sin guardar. Si salís ahora se pierden.',
src\app\features\comodines\comodines-list.component.ts:361: Los 9 tipos de comodines que existen y qué hace cada uno. Los que ya tenés
src\app\features\comodines\comodines-list.component.ts:754: Elegí uno de los 9 tipos. Los que ya tenés activos están deshabilitados.
src\app\features\comodines\comodines-list.component.ts:768: <small>Ya tenés este tipo</small>
```

### Pattern: `Vos`

```
src\app\features\groups\group-detail.component.ts:324: El nuevo admin podrá editar, invitar y eliminar el grupo. Vos pasás a ser miembro normal.
```

### Pattern: `Querés` / `querés`

```
src\app\shared\layout\footer.component.ts:63: '¿Querés cerrar sesión? Vas a salir de tu cuenta y regresarás al login.',
```

(`querés` en comentario de código `src\app\features\profile\profile.component.ts:172` no afecta UX.)

### Pattern: `Pickeá`

```
src\app\features\auth\register.component.ts:164: ya está en uso por otra persona. Pickeá uno distinto y
```

### Pattern: `Pedile`

```
src\app\core\api\api.service.ts:413: 'Pedile al admin del torneo que te elimine.',
src\app\features\groups\group-join.component.ts:77: Pedile al admin que elimine a alguien inactivo o creá un grupo nuevo.
```

### Pattern: `Pegá`

```
src\app\shared\layout\group-actions-modals.component.ts:149: Pegá el código de 6 caracteres que te compartieron
```

### Pattern: `Podés` / `podés`

```
src\app\features\onboarding\onboarding.component.ts:61: Podés crear o unirte a un grupo desde la sidebar en cualquier momento.
src\app\features\picks\picks-list.component.ts:165: Podés ver el calendario, pero los marcadores que predigás
src\app\features\groups\group-edit.component.ts:88: Imagen cargada · podés cambiarla
```

### Pattern: `Empezá` — 0 matches (not present)

### Pattern: `apagás`

```
src\app\features\profile\preferences-modal.component.ts:66: Si lo apagás, se usa la hora del estadio.
```

### Pattern: `Usá`

```
src\app\features\onboarding\tour-overlay.component.ts:206: 'Usá los botones del menú lateral o la pantalla de Mis grupos.',
```

### Pattern: `encontrás`

```
src\app\features\onboarding\tour-overlay.component.ts:215: 'Aquí encontrás "Clasificados" y "Llaves".',
```

### Pattern: `arrastrá` — 0 matches

### Pattern: `acertás` — 0 matches

### Pattern: `aplicá` — 0 matches

### Otros verbos voseo encontrados (ampliando el sweep)

#### Pattern: `salís` / `predigás`

```
src\app\shared\util\dirty-form.guard.ts:29: Si salís ahora se pierden
src\app\features\picks\picks-list.component.ts:165: los marcadores que predigás
```

#### Pattern: `abandonás` / `fallás` / `recibís` / `cambiás` / `Reordenás` / `Reescribís` / `Elegí` / `pasás`

```
src\app\features\groups\group-detail.component.ts:305: Si abandonás, tu score acumulado en este grupo se borra.
src\app\features\groups\group-detail.component.ts:324: Vos pasás a ser miembro normal.
src\app\features\picks\sponsor-redeem.component.ts:49: GROUP_SAFE_PICK: '50% si fallás 1 posición de un grupo (en vez de 0).',
src\app\features\picks\sponsor-redeem.component.ts:51: REASSIGN_CHAMP_RUNNER: 'Cambiás campeón/subcampeón post-grupos. Paga 50%.',
src\app\features\picks\sponsor-redeem.component.ts:53: BRACKET_RESET: 'Reescribís todos los picks de una fase. Paga 60%.',
src\app\features\picks\sponsor-redeem.component.ts:54: GROUP_RESET: 'Reordenás un grupo post-J1. Paga 50%.',
src\app\features\comodines\comodines-list.component.ts:84: 'Si fallás 1 posición específica, recibís 50% de los puntos.',
src\app\features\comodines\comodines-list.component.ts:89: 'Si fallás 1 equipo en una fase, recibís 50% de los puntos.',
src\app\features\comodines\comodines-list.component.ts:114: ': 100% en vez de 50% si fallás.',
src\app\features\comodines\comodines-list.component.ts:754: Elegí uno de los 9 tipos.
src\app\features\groups\group-detail.component.ts:705: no podrás editar el grupo (KEEP — `podrás` futuro neutral)
```

## 2. `Vas a` (KEEP — futuro neutral, NO cambiar)

```
src\app\shared\layout\sidebar.component.ts:381: Vas a salir de tu cuenta
src\app\shared\layout\footer.component.ts:63: Vas a salir de tu cuenta
src\app\features\groups\group-detail.component.ts:656: Vas a abandonar "${g.name}"
src\app\features\groups\group-detail.component.ts:704: Vas a transferir el rol de admin
src\app\features\groups\group-detail.component.ts:705: Vas a perder los privilegios de admin
src\app\features\admin\admin-results.component.ts:375: Vas a calcular los puntos
src\app\features\admin\admin-sponsors.component.ts:133: Vas a borrar "${s.name}"
src\app\features\admin\admin-teams.component.ts:178: Vas a borrar el equipo
src\app\features\admin\admin-sponsor-edit.component.ts:552: Vas a borrar el código
src\app\features\admin\admin-trivia.component.ts:501: Vas a borrar la pregunta
src\app\features\admin\admin-users.component.ts:247: Vas a enviar un email
src\app\features\admin\admin-users.component.ts:258: Vas a suspender a @${u.handle}
```

## 3. `tipeas` + `tus panas` (KEEP — regionales compatibles con tú)

```
src\app\dev\dev-components.component.ts:49: Crea uno para empezar a competir con tus panas.
src\app\features\auth\forgot-password.component.ts:27: Gana contra tus panas.
src\app\features\auth\login.component.ts:22: Gana contra tus panas.
src\app\features\auth\register.component.ts:30: Gana contra tus panas.
src\app\features\auth\register.component.ts:89: Así te verán tus panas en el ranking.
src\app\features\groups\groups-list.component.ts:63: empezar a competir con tus panas.
src\app\features\onboarding\tour-overlay.component.ts:205: Tu polla vive dentro de un grupo (panas, oficina, familia).
src\app\features\onboarding\tour-overlay.component.ts:222: Auto-guarda mientras tipeas.
```

## 4. `href="#"` placeholders (target: 0 after sweep)

```
src\app\features\groups\group-join.component.ts:110: © 2026 Golgana — <a href="#">Reglas</a> · <a href="#">Privacidad</a>
src\app\features\auth\register.component.ts:135: Acepto los <a href="#">Términos</a> y la <a href="#">Privacidad</a>
src\app\features\picks\picks-list.component.ts:214: <a href="#" class="ad-feed__cta" (click)="$event.preventDefault()">Ver promo</a>
src\app\features\picks\picks-list.component.ts:225: <a href="#" class="ad-feed__cta" (click)="$event.preventDefault()">Ver colección</a>
```

Note: `picks-list.component.ts` ad-feed CTAs son demo/mock ads — placeholder OK (no son legal links). Keep as-is or also resolve.

## 5. Logo size variants (target: 1 token after sweep)

```
src\app\features\auth\forgot-password.component.ts:21: style="height:32px;width:auto;"
src\app\features\auth\login.component.ts:15: style="height:32px;width:auto;"
src\app\features\auth\register.component.ts:25: style="height:40px;width:auto;"
src\app\features\onboarding\onboarding.component.ts:31: style="height:28px;width:auto;"
```

(group-join, sidebar, footer logos verificar en archivos individualmente.)

## 6. Branding string variants (target: unified after sweep)

### `POLLA` standalone

```
src\app\shared\layout\sidebar.component.ts:26: <strong>POLLA</strong>
```

### `GOLGANA · MUNDIAL 2026`

```
src\app\features\auth\login.component.ts:16: <span class="auth-brand__title">GOLGANA · MUNDIAL 2026</span>
src\app\features\auth\forgot-password.component.ts:22: <span class="auth-brand__title">GOLGANA · MUNDIAL 2026</span>
```

### `Polla Mundial 2026`

```
src\app\features\groups\group-invite-email.component.ts:103: <strong>Polla Mundial 2026</strong>
src\app\features\groups\group-join.component.ts:25: aria-label="Polla Mundial 2026"
```

### `Polla Mundialista` (sin "2026" — pre-sweep)

```
src\app\shared\layout\footer.component.ts:22: Polla Mundialista — sub-módulo de
src\app\shared\layout\footer.component.ts:49: © {{ year }} Golgana — Polla Mundialista
src\app\features\auth\register.component.ts:43: © 2026 Polla Mundialista · Términos · Privacidad
src\app\features\auth\login.component.ts:46: © 2026 Polla Mundialista · Términos · Privacidad
src\app\features\auth\login.component.ts:57: <h1 class="auth-mobile-head__title">Polla Mundialista</h1>
src\app\features\auth\forgot-password.component.ts:40: © 2026 Polla Mundialista · Términos · Privacidad
src\app\features\auth\forgot-password.component.ts:52: <h1 class="auth-mobile-head__title">Polla Mundialista</h1>
src\app\features\groups\group-invite-email.component.ts:94: <strong>Polla Mundialista</strong>
```

## Summary

- **Voseo strings**: ~28 user-visible (excluyendo comentarios de código y excepciones `tus panas` / `tipeas` / `Vas a` / `panas`)
- **`href="#"` legal placeholders**: 3 legal (group-join × 2, register × 2) + 2 demo ad CTAs (picks-list)
- **Logo inline styles**: 4 archivos con height inline (login, register, forgot, onboarding)
- **Branding variantes**: 4 distintas (`POLLA`, `GOLGANA · MUNDIAL 2026`, `Polla Mundial 2026`, `Polla Mundialista`)

Plan target: unificar todo a canonical (`Golgana` brand + `Polla Mundialista 2026` sub-title).
