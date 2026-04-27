// Critical: this side-effect import MUST stay first. It calls
// Amplify.configure() before any module that touches Amplify
// (api/client.ts → generateClient) gets a chance to evaluate.
import './amplify-bootstrap';

import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';

bootstrapApplication(AppComponent, appConfig)
  .catch((err) => console.error(err));
