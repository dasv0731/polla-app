/**
 * Reglas de password que match exactamente la policy del Cognito User Pool
 * (configurado en polla-backend/amplify/auth/resource.ts):
 *   min_length: 8, require_lowercase, require_uppercase, require_numbers,
 *   require_symbols.
 *
 * Si la policy del User Pool cambia, este archivo es el único punto de
 * actualización del lado FE.
 */

export type PasswordRuleKey =
  | 'minLength'
  | 'uppercase'
  | 'lowercase'
  | 'number'
  | 'symbol';

export interface PasswordRule {
  key: PasswordRuleKey;
  label: string;
  ok: boolean;
}

interface RuleDef {
  key: PasswordRuleKey;
  label: string;
  test: (password: string) => boolean;
}

const RULES: ReadonlyArray<RuleDef> = [
  { key: 'minLength', label: 'Mínimo 8 caracteres',     test: (p) => p.length >= 8 },
  { key: 'uppercase', label: 'Una letra mayúscula',     test: (p) => /[A-Z]/.test(p) },
  { key: 'lowercase', label: 'Una letra minúscula',     test: (p) => /[a-z]/.test(p) },
  { key: 'number',    label: 'Un número',               test: (p) => /[0-9]/.test(p) },
  { key: 'symbol',    label: 'Un símbolo (!@#$…)',      test: (p) => /[^a-zA-Z0-9]/.test(p) },
];

export function checkPasswordRules(password: string): PasswordRule[] {
  return RULES.map(({ key, label, test }) => ({ key, label, ok: test(password) }));
}

export function passwordPassesAllRules(password: string): boolean {
  return RULES.every(({ test }) => test(password));
}
