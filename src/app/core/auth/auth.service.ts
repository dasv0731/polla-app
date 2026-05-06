import { Injectable, inject, signal } from '@angular/core';
import {
  signIn, signOut, signUp, confirmSignUp,
  resendSignUpCode, resetPassword, confirmResetPassword,
  fetchAuthSession, fetchUserAttributes, getCurrentUser,
  updatePassword,
} from 'aws-amplify/auth';
import { UserModesService } from '../user/user-modes.service';
import { ApiService } from '../api/api.service';

export interface AuthUser {
  sub: string;
  email: string;
  handle: string;
  isAdmin: boolean;
  /** Storage key del avatar. null si nunca subió uno. Se hidrata desde
   *  el modelo User después del login (best-effort). */
  avatarKey: string | null;
  /** Código ISO 3166-1 alpha-2 del país (ej "AR", "EC"). null si no setó. */
  country: string | null;
  /** Bio corta. null si no setó. */
  bio: string | null;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private userModes = inject(UserModesService);
  private api = inject(ApiService);

  user = signal<AuthUser | null>(null);

  async loadUser(): Promise<AuthUser | null> {
    try {
      const cu = await getCurrentUser();
      const attrs = await fetchUserAttributes();
      const session = await fetchAuthSession();
      const groups = (session.tokens?.accessToken.payload['cognito:groups'] as string[] | undefined) ?? [];
      const u: AuthUser = {
        sub: cu.userId,
        email: attrs['email']!,
        handle: attrs['preferred_username']!,
        isAdmin: groups.includes('admins'),
        avatarKey: null,    // se hidrata abajo desde el User model (best-effort)
        country: null,
        bio: null,
      };
      this.user.set(u);
      // Cargamos modos disponibles (basados en memberships) en background.
      // No bloqueamos la sesión: si falla, los componentes que necesitan
      // modos volverán a intentar cargarlos.
      void this.userModes.load(u.sub);
      // Hidrata avatarKey desde el modelo User. Best-effort: si falla
      // (latencia, schema desincronizado, etc.) el avatar fallback sigue
      // funcionando con la inicial del handle.
      void this.hydrateProfileFields(u.sub);
      return u;
    } catch {
      this.user.set(null);
      this.userModes.reset();
      return null;
    }
  }

  /** Carga campos del modelo User (avatarKey, country, bio, etc.) que no
   *  vienen de Cognito attrs. Best-effort: errores se silencian. */
  private async hydrateProfileFields(sub: string) {
    try {
      const res = await this.api.getUser(sub);
      const data = res?.data as {
        avatarKey?: string | null;
        country?: string | null;
        bio?: string | null;
      } | undefined;
      if (!data) return;
      const cur = this.user();
      if (!cur || cur.sub !== sub) return;
      this.user.set({
        ...cur,
        avatarKey: data.avatarKey ?? null,
        country: data.country ?? null,
        bio: data.bio ?? null,
      });
    } catch {
      /* silencioso — fallback de avatar usa inicial */
    }
  }

  /** Refresh de los profile fields del user logged-in (post-update). */
  async refreshProfileFields() {
    const cur = this.user();
    if (!cur) return;
    await this.hydrateProfileFields(cur.sub);
  }

  /** Alias backwards-compat — apenas se cambió `refreshAvatarKey` a un
   *  nombre genérico. Llamadores existentes siguen funcionando. */
  async refreshAvatarKey() {
    await this.refreshProfileFields();
  }

  /** Cambio de contraseña Cognito (modal de editar perfil). */
  async changePassword(oldPassword: string, newPassword: string) {
    await updatePassword({ oldPassword, newPassword });
  }

  async login(email: string, password: string) {
    await signIn({ username: email, password });
    await this.loadUser();
  }

  async register(email: string, password: string, handle: string, name?: string) {
    const userAttributes: Record<string, string> = {
      email,
      preferred_username: handle,
    };
    if (name) userAttributes['given_name'] = name;
    await signUp({
      username: email,
      password,
      options: { userAttributes },
    });
  }

  async confirm(email: string, code: string) {
    await confirmSignUp({ username: email, confirmationCode: code });
  }

  async resend(email: string) {
    await resendSignUpCode({ username: email });
  }

  async forgotPassword(email: string) {
    await resetPassword({ username: email });
  }

  async confirmForgot(email: string, code: string, newPassword: string) {
    await confirmResetPassword({ username: email, confirmationCode: code, newPassword });
  }

  async logout() {
    await signOut();
    this.user.set(null);
    this.userModes.reset();
  }
}
