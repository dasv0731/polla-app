import { APP_INITIALIZER, ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { Amplify } from 'aws-amplify';
import outputs from '../amplify_outputs.json';

import { routes } from './app.routes';
import { AuthService } from './core/auth/auth.service';

Amplify.configure(outputs);

// Preload current Cognito user before guards evaluate so a hard refresh on
// an auth-only route doesn't bounce to /login while the session is restoring.
function loadAuthUserFactory(auth: AuthService) {
  return () => auth.loadUser();
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes, withComponentInputBinding()),
    {
      provide: APP_INITIALIZER,
      useFactory: loadAuthUserFactory,
      deps: [AuthService],
      multi: true,
    },
  ],
};
