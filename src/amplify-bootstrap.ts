// Side-effect-only module: configures Amplify the moment it's imported.
//
// ES modules evaluate imports depth-first, top-to-bottom. If main.ts puts
// `import './amplify-bootstrap'` as its very first statement, this whole
// file runs before any other import in main.ts begins resolving. Crucially,
// before `app.config` and the api `client.ts` modules evaluate — and
// `client.ts` calls `generateClient<Schema>()` at module level, which
// internally reads `Amplify.getConfig()`. Without this bootstrap, that read
// happens before configure() and Amplify warns "not configured" + every
// AppSync mutation silently 401s.
//
// Don't move this back into main.ts's body or app.config.ts — the warning
// reappears the moment the configure call shifts after any Amplify-touching
// import.
import { Amplify } from 'aws-amplify';
import outputs from './amplify_outputs.json';

Amplify.configure(outputs);
