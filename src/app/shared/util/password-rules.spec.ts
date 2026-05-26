import { checkPasswordRules, passwordPassesAllRules } from './password-rules';

describe('checkPasswordRules', () => {
  it('returns all rules with ok=false for empty password', () => {
    const rules = checkPasswordRules('');
    expect(rules.map((r) => r.key)).toEqual(['minLength', 'uppercase', 'lowercase', 'number', 'symbol']);
    expect(rules.every((r) => r.ok === false)).toBe(true);
  });

  it('detects each rule individually', () => {
    // 8 letras mayúsculas y minúsculas, sin número ni símbolo
    const r1 = checkPasswordRules('Abcdefgh');
    expect(r1.find((r) => r.key === 'minLength')!.ok).toBe(true);
    expect(r1.find((r) => r.key === 'uppercase')!.ok).toBe(true);
    expect(r1.find((r) => r.key === 'lowercase')!.ok).toBe(true);
    expect(r1.find((r) => r.key === 'number')!.ok).toBe(false);
    expect(r1.find((r) => r.key === 'symbol')!.ok).toBe(false);
  });

  it('valid password (Abcd123!) satisfies all rules', () => {
    const rules = checkPasswordRules('Abcd123!');
    expect(rules.every((r) => r.ok === true)).toBe(true);
  });

  it('detects missing uppercase', () => {
    const rules = checkPasswordRules('abcd123!');
    expect(rules.find((r) => r.key === 'uppercase')!.ok).toBe(false);
    expect(rules.find((r) => r.key === 'lowercase')!.ok).toBe(true);
  });

  it('detects missing lowercase', () => {
    const rules = checkPasswordRules('ABCD123!');
    expect(rules.find((r) => r.key === 'uppercase')!.ok).toBe(true);
    expect(rules.find((r) => r.key === 'lowercase')!.ok).toBe(false);
  });

  it('symbol rule accepts any non-alphanumeric', () => {
    // Reglas excluye [a-zA-Z0-9] — un espacio cuenta como símbolo.
    // Si en el futuro Cognito restringe el set, ajustar regex en RULES.
    expect(checkPasswordRules('Abcd1234 ').find((r) => r.key === 'symbol')!.ok).toBe(true);
    expect(checkPasswordRules('Abcd1234@').find((r) => r.key === 'symbol')!.ok).toBe(true);
    expect(checkPasswordRules('Abcd1234#').find((r) => r.key === 'symbol')!.ok).toBe(true);
  });

  it('minLength is strictly >= 8', () => {
    expect(checkPasswordRules('Abc12!').find((r) => r.key === 'minLength')!.ok).toBe(false);
    expect(checkPasswordRules('Abcd12!').find((r) => r.key === 'minLength')!.ok).toBe(false);  // 7 chars
    expect(checkPasswordRules('Abcde12!').find((r) => r.key === 'minLength')!.ok).toBe(true);  // 8 chars
  });
});

describe('passwordPassesAllRules', () => {
  it('false for empty', () => {
    expect(passwordPassesAllRules('')).toBe(false);
  });

  it('false when any rule fails', () => {
    expect(passwordPassesAllRules('Abcd1234')).toBe(false);  // no symbol
    expect(passwordPassesAllRules('abcd123!')).toBe(false);  // no uppercase
    expect(passwordPassesAllRules('ABCD123!')).toBe(false);  // no lowercase
    expect(passwordPassesAllRules('Abcdefg!')).toBe(false);  // no number
    expect(passwordPassesAllRules('Abc12!')).toBe(false);    // too short
  });

  it('true for password that satisfies all rules', () => {
    expect(passwordPassesAllRules('Abcd123!')).toBe(true);
    expect(passwordPassesAllRules('Pollas2026#')).toBe(true);
  });
});
