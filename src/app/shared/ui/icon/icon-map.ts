/**
 * Icon Map — TypeScript types para los iconos disponibles en <app-icon>.
 *
 * Single source of truth de qué nombres son válidos. Los icons en sí
 * se registran en app.config.ts via provideLucideIcons() y se
 * referencian por nombre en templates.
 *
 * Para agregar un icono:
 * 1. Importar el componente Lucide en app.config.ts (e.g. LucideBell).
 * 2. Agregarlo al provideLucideIcons({ ... }) con el nombre kebab-case.
 * 3. Agregar el nombre a ICON_NAMES aquí (TypeScript strict valida).
 */

export const ICON_NAMES = [
  // Navigation
  'home', 'trophy', 'users', 'globe', 'wrench', 'bell',
  // Actions
  'close', 'eye', 'eye-off', 'plus', 'arrow-right', 'arrow-left',
  'chevron-right', 'chevron-left', 'check', 'alert',
  // Domain
  'clock', 'star', 'zap', 'dice', 'gift', 'crown', 'trash',
  'logout', 'pencil', 'clipboard', 'mail', 'lock', 'settings',
  'undo', 'search', 'filter',
] as const;

export type IconName = typeof ICON_NAMES[number];

/** Size variants → pixel value. */
export const ICON_SIZE_PX = {
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
} as const;

export type IconSize = keyof typeof ICON_SIZE_PX;
