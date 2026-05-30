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
  COMODINES_REQUIRES_COMPLETE_MODE: 'Los comodines solo aplican a Modo Completo. Únete a un grupo en modo completo para participar.',
  COMODIN_CAP_REACHED: 'Ya tienes 5 comodines (el techo). Usa o deja caducar uno antes de canjear más.',
  COMODIN_SPONSOR_LIMIT_REACHED: 'Ya canjeaste 2 códigos de sponsor (el máximo por esa vía). El comodín no se acreditó.',
  ENTRY_FEE_INSTRUCTIONS_REQUIRED: 'Las instrucciones son obligatorias si activás la cuota.',
  ENTRY_FEE_INSTRUCTIONS_TOO_LONG: 'Las instrucciones no pueden superar los 500 caracteres.',
  ENTRY_FEE_NOT_GROUP_ADMIN: 'Solo el admin del grupo puede marcar cuotas.',
  COMPANY_NOT_FOUND: 'Esta empresa no existe.',
  COMPANY_DISABLED: 'La empresa está desactivada. Reactivala antes de hacer cambios.',
  NOT_COMPANY_ADMIN: 'No tenés permisos para gestionar esta empresa.',
  LAST_COMPANY_ADMIN: 'No podés remover al último admin. Agregá otro admin antes.',
};

export function humanizeError(e: unknown): string {
  if (e instanceof Error) {
    const code = e.message.toUpperCase();
    return DOMAIN_ERROR_COPY[code] ?? e.message;
  }
  return 'Ocurrió un error inesperado.';
}
