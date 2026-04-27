import { generateClient } from 'aws-amplify/api';
import type { Schema } from './schema';

// Cast a `any` para bypass de tipos en CI: el Schema se importaba via path
// relativo del repo hermano polla-backend, que en Amplify Hosting no existe.
// Hasta publicar Schema como package npm interno, perdemos type safety
// estática (los wrappers de api.service.ts y casts en componentes
// preservan correctness).
export const apiClient: any = generateClient<Schema>();
