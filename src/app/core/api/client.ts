import { generateClient } from 'aws-amplify/api';
import type { Schema } from './schema';

export const apiClient = generateClient<Schema>();
