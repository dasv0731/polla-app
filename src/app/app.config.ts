import { APP_INITIALIZER, ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import {
  provideLucideIcons,
  LucideHome, LucideTrophy, LucideUsers, LucideGlobe, LucideWrench, LucideBell,
  LucideX, LucideEye, LucideEyeOff, LucidePlus,
  LucideArrowRight, LucideArrowLeft, LucideChevronRight, LucideChevronLeft,
  LucideCheck, LucideCircleAlert,
  LucideClock, LucideStar, LucideZap, LucideDice5, LucideGift, LucideCrown,
  LucideTrash2, LucideLogOut, LucidePencil, LucideClipboardList,
  LucideMail, LucideLock, LucideSettings, LucideRotateCcw, LucideSearch, LucideFilter,
} from '@lucide/angular';

import { routes } from './app.routes';
import { AuthService } from './core/auth/auth.service';

// Amplify.configure(outputs) lives in main.ts so it runs before any module
// that might call Amplify APIs at evaluation time (api.service / client.ts).

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
    // Register Lucide icons under custom kebab-case names matching ICON_NAMES
    // in shared/ui/icon/icon-map.ts. We wrap each component's static .icon
    // (LucideIconData) and override the `name` so templates reference the
    // canonical name from our icon-map (e.g. 'close' instead of 'x',
    // 'home' instead of 'house', 'dice' instead of 'dice-5').
    provideLucideIcons(
      { ...LucideHome.icon, name: 'home' },
      { ...LucideTrophy.icon, name: 'trophy' },
      { ...LucideUsers.icon, name: 'users' },
      { ...LucideGlobe.icon, name: 'globe' },
      { ...LucideWrench.icon, name: 'wrench' },
      { ...LucideBell.icon, name: 'bell' },
      { ...LucideX.icon, name: 'close' },
      { ...LucideEye.icon, name: 'eye' },
      { ...LucideEyeOff.icon, name: 'eye-off' },
      { ...LucidePlus.icon, name: 'plus' },
      { ...LucideArrowRight.icon, name: 'arrow-right' },
      { ...LucideArrowLeft.icon, name: 'arrow-left' },
      { ...LucideChevronRight.icon, name: 'chevron-right' },
      { ...LucideChevronLeft.icon, name: 'chevron-left' },
      { ...LucideCheck.icon, name: 'check' },
      { ...LucideCircleAlert.icon, name: 'alert' },
      { ...LucideClock.icon, name: 'clock' },
      { ...LucideStar.icon, name: 'star' },
      { ...LucideZap.icon, name: 'zap' },
      { ...LucideDice5.icon, name: 'dice' },
      { ...LucideGift.icon, name: 'gift' },
      { ...LucideCrown.icon, name: 'crown' },
      { ...LucideTrash2.icon, name: 'trash' },
      { ...LucideLogOut.icon, name: 'logout' },
      { ...LucidePencil.icon, name: 'pencil' },
      { ...LucideClipboardList.icon, name: 'clipboard' },
      { ...LucideMail.icon, name: 'mail' },
      { ...LucideLock.icon, name: 'lock' },
      { ...LucideSettings.icon, name: 'settings' },
      { ...LucideRotateCcw.icon, name: 'undo' },
      { ...LucideSearch.icon, name: 'search' },
      { ...LucideFilter.icon, name: 'filter' },
    ),
  ],
};
