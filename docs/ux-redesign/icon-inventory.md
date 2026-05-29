# Icon Inventory Matrix

> Mapping de emojis usados como icons cross-app (anti-pattern documentado en walkthrough) a sus reemplazos Lucide. Sub-proyecto A1 implementa la fundación; A2-A8 reemplazan progresivamente cada emoji por `<app-icon name="X">`.

## Conventions

- Nombre Lucide: kebab-case minúsculas. Mapea 1:1 al `IconName` enum en `src/app/shared/ui/icon/icon-map.ts`.
- Si un emoji aparece en múltiples surfaces, se documenta cada surface.
- Si Lucide no tiene equivalente directo, propose alternativa.

## Inventory

| Emoji | Surface(s) | Doc(s) | Lucide name | Notas |
|---|---|---|---|---|
| 🏠 | sidebar, mobile bottom-nav, profile | 30, 14 | `home` | |
| ⚽ | sidebar, onboarding hero, picks page nav | 30, 21, 02 | `dice` o ilustración brand (sin equivalente fútbol directo Lucide) | Considerar SVG custom para ⚽. |
| 👥 | sidebar | 30 | `users` | |
| 🏆 | sidebar, ranking, home KPI | 30, 07, 01 | `trophy` | |
| 🌎 | sidebar | 30 | `globe` | |
| 🛠 | sidebar (admin) | 30 | `wrench` | |
| 🔔 | sidebar, nav topbar mobile | 30, 31 | `bell` | |
| ⏻ | nav user dropdown | 31 | `logout` (Lucide `LogOut`) | |
| ✕ | TODOS los modales close button | 22-29, 34 | `close` (Lucide `X`) | Sweep ubiquitous |
| 👁 / 👁️‍🗨️ | login, register password toggle | 17, 18 | `eye` / `eye-off` | |
| ＋ | onboarding CTA, comodines | 21, 13 | `plus` | |
| → | múltiple CTAs | 17, 18, 21, ... | `arrow-right` | |
| ← | back links | 19, 20, 21 | `arrow-left` | |
| ‹ | auth back link | 17 | `chevron-left` | |
| › | sidebar/nav | 31 | `chevron-right` | |
| ✓ | varios estados success | 22, 25, 27 | `check` | |
| ⚠ | error states, warnings | 22, 25, 32 | `alert` (Lucide `CircleAlert`) | |
| ⏱ / 🕐 | timer, kickoff countdown | 23, 27, 32 | `clock` | |
| ★ | group-join (kicker) | 20 | `star` | |
| ⚡ | trivia FAB + modal | 23 | `zap` | |
| 🎲 | randomizer modal + button | 24 | `dice` | |
| 🃏 | comodines | 13, 25 | `gift` | Alternativa: SVG custom comodín card. |
| 🎁 | comodines CTA "Canjear" | 13, 25 | `gift` | |
| 👑 | transfer admin | 28 | `crown` | |
| 🗑 | delete actions | 09 | `trash` | |
| ✏ | edit actions | 09, 31 | `pencil` | |
| 📋 | clipboard / copy code | 09 | `clipboard` | |
| ✉ | invite by email | 12 | `mail` | |
| 🔒 | profile cuenta | 14 | `lock` | |
| ⚙ | profile settings | 14 | `settings` | |
| ↩ | profile back | 14 | `undo` | |
| 💡 | trivia tip + redeem tip | 18, 19, 25 | `alert` o sin icon | Tip text puede no necesitar icono. |
| 📅 | picks day kicker | 02 | (typography only) | Reemplazar con tipografía clara, no icon. |
| 🔮 | bracket projection banner | 05 | (sin reemplazo directo) | Considerar custom SVG o ilustración. |
| 🏳️ | flag fallback right-rail | 32 | (sin reemplazo) | Eliminar fallback — usar `?` o team initials. |
| 🥇🥈🥉 | ranking podium, premios | 07, 09 | (typography only) | Reemplazar con "1º 2º 3º" o medals SVG si existen en Lucide. |
| 🥤👟 | picks page ads hardcoded | 02 | (eliminar — son ads hardcoded a borrar en A4) | N/A |

## Totals (Sprint 1 implementation)

- Unique Lucide icons registered: **32** (ver `ICON_NAMES` en icon-map.ts y `provideLucideIcons(...)` en app.config.ts)
- Surfaces consumiendo: ~36 (todos los end-user surfaces)
- Sprint en que se reemplazan:
  - Sidebar 7 icons → A8a (sidebar mobile)
  - Modal closes ✕ × 8 → A2 (modal unification)
  - Auth password eye → A7 (auth family)
  - Resto progresivo en A8b/A8c/A8d

## Custom SVG candidates (no Lucide)

- ⚽ (fútbol): considerar custom SVG soccer ball OR ilustración brand Golgana
- 🃏 (comodín card): considerar custom SVG playing card
- 🔮 (crystal ball / proyección): considerar ilustración bracket
- 🏳️ (flag fallback): eliminar fallback completamente, usar text initials

Decisiones documentar en commit messages de los sub-proyectos que las apliquen.

---

**Cross-reference**: spec `docs/superpowers/specs/2026-05-28-ux-redesign-master-plan-design.md` sección A1.
