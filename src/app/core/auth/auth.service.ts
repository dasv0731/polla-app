import { Injectable, inject, signal } from '@angular/core';
import {
  signIn, signOut, signUp, confirmSignUp,
  resendSignUpCode, resetPassword, confirmResetPassword,
  fetchAuthSession, fetchUserAttributes, getCurrentUser,
} from 'aws-amplify/auth';
import { UserModesService } from '../user/user-modes.service';

export interface AuthUser {
  sub: string;
  email: string;
  handle: string;
  isAdmin: boolean;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private userModes = inject(UserModesService);

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
      };
      this.user.set(u);
      // Cargamos modos disponibles (basados en memberships) en background.
      // No bloqueamos la sesión: si falla, los componentes que necesitan
      // modos volverán a intentar cargarlos.
      void this.userModes.load(u.sub);
      return u;
    } catch {
      this.user.set(null);
      this.userModes.reset();
      return null;
    }
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
