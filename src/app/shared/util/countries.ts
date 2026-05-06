/**
 * Lista curada de países para el dropdown del perfil.
 * Prioriza los 48 clasificados al Mundial 2026 + países latinoamericanos
 * (audiencia principal de la polla) + selección popular global.
 *
 * El código guardado en User.country es ISO 3166-1 alpha-2 (ej "AR", "EC").
 * `flagFromCountryCode` lo convierte al emoji de bandera regional.
 */

export interface CountryOption {
  code: string;       // ISO 3166-1 alpha-2
  name: string;       // nombre en español
}

/** Países latinoamericanos al inicio (audiencia core), después resto. */
export const COUNTRY_OPTIONS: readonly CountryOption[] = [
  // Latinoamérica
  { code: 'AR', name: 'Argentina' },
  { code: 'BO', name: 'Bolivia' },
  { code: 'BR', name: 'Brasil' },
  { code: 'CL', name: 'Chile' },
  { code: 'CO', name: 'Colombia' },
  { code: 'CR', name: 'Costa Rica' },
  { code: 'CU', name: 'Cuba' },
  { code: 'DO', name: 'República Dominicana' },
  { code: 'EC', name: 'Ecuador' },
  { code: 'SV', name: 'El Salvador' },
  { code: 'GT', name: 'Guatemala' },
  { code: 'HN', name: 'Honduras' },
  { code: 'MX', name: 'México' },
  { code: 'NI', name: 'Nicaragua' },
  { code: 'PA', name: 'Panamá' },
  { code: 'PY', name: 'Paraguay' },
  { code: 'PE', name: 'Perú' },
  { code: 'PR', name: 'Puerto Rico' },
  { code: 'UY', name: 'Uruguay' },
  { code: 'VE', name: 'Venezuela' },
  // Norte América / participantes Mundial 2026
  { code: 'US', name: 'Estados Unidos' },
  { code: 'CA', name: 'Canadá' },
  // Europa popular
  { code: 'ES', name: 'España' },
  { code: 'IT', name: 'Italia' },
  { code: 'FR', name: 'Francia' },
  { code: 'DE', name: 'Alemania' },
  { code: 'PT', name: 'Portugal' },
  { code: 'GB', name: 'Reino Unido' },
  { code: 'NL', name: 'Países Bajos' },
  { code: 'BE', name: 'Bélgica' },
  { code: 'CH', name: 'Suiza' },
  { code: 'AT', name: 'Austria' },
  { code: 'SE', name: 'Suecia' },
  { code: 'NO', name: 'Noruega' },
  { code: 'HR', name: 'Croacia' },
  { code: 'CZ', name: 'República Checa' },
  // África / Medio Oriente / resto Mundial 2026
  { code: 'MA', name: 'Marruecos' },
  { code: 'SN', name: 'Senegal' },
  { code: 'CI', name: 'Costa de Marfil' },
  { code: 'GH', name: 'Ghana' },
  { code: 'EG', name: 'Egipto' },
  { code: 'TN', name: 'Túnez' },
  { code: 'DZ', name: 'Argelia' },
  { code: 'ZA', name: 'Sudáfrica' },
  { code: 'CV', name: 'Cabo Verde' },
  { code: 'CG', name: 'República del Congo' },
  { code: 'SA', name: 'Arabia Saudita' },
  { code: 'IR', name: 'Irán' },
  { code: 'IQ', name: 'Irak' },
  { code: 'JO', name: 'Jordania' },
  { code: 'QA', name: 'Catar' },
  { code: 'TR', name: 'Turquía' },
  // Asia / Oceanía
  { code: 'JP', name: 'Japón' },
  { code: 'KR', name: 'Corea del Sur' },
  { code: 'AU', name: 'Australia' },
  { code: 'NZ', name: 'Nueva Zelanda' },
  { code: 'UZ', name: 'Uzbekistán' },
  // Caribe Mundial 2026
  { code: 'CW', name: 'Curazao' },
  { code: 'HT', name: 'Haití' },
];

/** Convierte código ISO 2-letras a emoji de bandera regional.
 *  Ej "AR" → "🇦🇷". Devuelve string vacío si el código es inválido.
 *  Trabaja sobre Regional Indicator Symbol Letter (U+1F1E6 + offset).
 *
 *  Limitación: Windows (10/11) NO renderiza flag emojis en sus fuentes
 *  default — el browser muestra los regional indicators como texto ("AR"
 *  en vez de la bandera). Para UI visible al user usar `flagImageUrl`
 *  (PNG de CDN). El emoji sirve para casos donde no se puede meter <img>
 *  (e.g. dentro de <option> del select). */
export function flagFromCountryCode(code: string | null | undefined): string {
  if (!code || code.length !== 2) return '';
  const A = 0x1F1E6;
  const a = code.toUpperCase().charCodeAt(0);
  const b = code.toUpperCase().charCodeAt(1);
  if (Number.isNaN(a) || Number.isNaN(b) || a < 65 || a > 90 || b < 65 || b > 90) return '';
  return String.fromCodePoint(A + (a - 65), A + (b - 65));
}

/** URL de imagen PNG de la bandera, vía flagcdn.com (gratis, sin auth).
 *  Devuelve null si el código es inválido. Tamaño en píxeles del ancho. */
export function flagImageUrl(
  code: string | null | undefined,
  widthPx: 20 | 40 | 80 | 160 | 320 = 40,
): string | null {
  if (!code || code.length !== 2) return null;
  const lower = code.toLowerCase();
  if (!/^[a-z]{2}$/.test(lower)) return null;
  return `https://flagcdn.com/w${widthPx}/${lower}.png`;
}

/** Nombre legible para un código. Fallback al código si no está en la lista. */
export function countryNameFromCode(code: string | null | undefined): string {
  if (!code) return '';
  const found = COUNTRY_OPTIONS.find((c) => c.code === code.toUpperCase());
  return found?.name ?? code.toUpperCase();
}
