export const DOMAIN_ERROR_COPY: Record<string, string> = {
  PICK_WINDOW_CLOSED: 'La ventana de predicciones ya se cerró.',
  INVITE_CODE_INVALID: 'El código no es válido o expiró.',
  ALREADY_MEMBER: 'Ya eres miembro de este grupo.',
  HANDLE_TAKEN: 'Ese handle ya está en uso.',
  MATCH_VERSION_CONFLICT: 'Otro admin actualizó este partido. Refresca y vuelve a intentar.',
  INVALID_SCORE_RANGE: 'Marcador inválido. Usa números entre 0 y 20.',
  SPECIALS_LOCKED: 'Las picks especiales ya están bloqueadas (el torneo empezó).',
  CODE_GENERATION_FAILED: 'No se pudo generar un código único, intenta de nuevo.',
  GROUP_NOT_FOUND: 'No encontramos el grupo.',
  ADMIN_REQUIRED: 'Solo el admin del grupo puede hacer esto.',
  VALIDATION_ERROR: 'Datos inválidos. Revisa los campos.',
};

export function humanizeError(e: unknown): string {
  if (e instanceof Error) {
    const code = e.message.toUpperCase();
    return DOMAIN_ERROR_COPY[code] ?? e.message;
  }
  return 'Ocurrió un error inesperado.';
}
