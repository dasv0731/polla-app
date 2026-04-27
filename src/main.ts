import { bootstrapApplication } from '@angular/platform-browser';
import { Amplify } from 'aws-amplify';
import outputs from './amplify_outputs.json';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';

// Configure Amplify ANTES de bootstrap. Si dejamos esto en app.config.ts
// (a nivel de módulo), Vite puede reordenar los imports en el bundle de
// producción y que algún servicio (api.service / client.ts) llame a
// Amplify.getConfig() antes de que .configure() se ejecute, surfaceando
// "Amplify has not been configured" y dejando llamadas a AppSync sin auth.
Amplify.configure(outputs);

bootstrapApplication(AppComponent, appConfig)
  .catch((err) => console.error(err));
