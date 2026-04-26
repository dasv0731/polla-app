// Schema type re-exported from the sibling polla-backend repo.
// This is a TYPE-ONLY import — TS erases it at build time, no runtime
// coupling. Both repos must live as siblings on the filesystem
// (Personales/polla-app and Personales/polla-backend) for this to resolve.
//
// To replace with a published-package strategy: have polla-backend export
// `Schema` from a small `@polla/schema` package and `npm install` it here.
export type { Schema } from '../../../../../polla-backend/amplify/data/resource';
