#!/usr/bin/env node
/**
 * delete-test-users.mjs
 *
 * Borra todos los users del Cognito User Pool excepto el(los) admin(s)
 * configurados en KEEP_EMAILS. Diseñado para limpiar el entorno de
 * pruebas antes de un round de smoke testing.
 *
 * Qué borra:
 *   - Usuarios en Cognito (admin-delete-user) → corta el login.
 *
 * Qué NO borra (data huérfana — no rompe nada, queda residual):
 *   - Filas del modelo `User` en GraphQL (el schema solo permite delete
 *     al grupo `admins`, no via API key, así que no podemos hacerlo
 *     desde un script externo sin un id-token de Cognito).
 *   - Picks, GroupStandingPick, BracketPick, SpecialPick
 *   - Memberships, UserGroupTotal, UserTournamentTotal
 *   - Comodin, SponsorRedemption, TriviaAnswer, Notification
 *   - Groups creados por estos users (adminUserId queda dangling)
 *
 *   Si querés un wipe completo de la base, lo más rápido es ir a la
 *   consola DynamoDB en us-east-1 y truncar las tablas que necesites
 *   (busca por prefijo del modelo: User-…, Pick-…, etc.).
 *
 * Pre-requisitos:
 *   - Node 18+ (usa fetch / @aws-sdk v3 nativos).
 *   - AWS credentials configuradas:
 *       export AWS_ACCESS_KEY_ID=…
 *       export AWS_SECRET_ACCESS_KEY=…
 *       export AWS_REGION=us-east-1   # opcional, ya viene en outputs
 *     o un perfil ya configurado con `aws configure`.
 *   - IAM permissions:
 *       cognito-idp:ListUsers
 *       cognito-idp:AdminDeleteUser
 *
 * Uso:
 *   cd scripts
 *   npm install
 *   node delete-test-users.mjs               # dry-run
 *   node delete-test-users.mjs --confirm     # realmente borra
 */

import {
  CognitoIdentityProviderClient,
  ListUsersCommand,
  AdminDeleteUserCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// ---------- Config ----------
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const outputsPath = resolve(__dirname, '..', 'amplify_outputs.json');
const outputs = JSON.parse(readFileSync(outputsPath, 'utf8'));

const USER_POOL_ID = outputs.auth.user_pool_id;
const REGION       = outputs.auth.aws_region;

/** Emails que NO se tocan. Agrega más si necesitás preservar otros admins. */
const KEEP_EMAILS = new Set([
  'smoketest@polla.local',
]);

// ---------- Args ----------
const CONFIRM = process.argv.includes('--confirm');

// ---------- Helpers ----------
function getEmail(user) {
  const attr = (user.Attributes ?? []).find((a) => a.Name === 'email');
  return attr?.Value ?? null;
}
function getHandle(user) {
  const attr = (user.Attributes ?? []).find((a) => a.Name === 'preferred_username');
  return attr?.Value ?? null;
}

async function listAllCognitoUsers(cognito) {
  const all = [];
  let token;
  do {
    const res = await cognito.send(new ListUsersCommand({
      UserPoolId: USER_POOL_ID,
      Limit: 60,
      PaginationToken: token,
    }));
    all.push(...(res.Users ?? []));
    token = res.PaginationToken;
  } while (token);
  return all;
}

async function deleteCognitoUser(cognito, username) {
  await cognito.send(new AdminDeleteUserCommand({
    UserPoolId: USER_POOL_ID,
    Username: username,
  }));
}

// ---------- Main ----------
async function main() {
  console.log(`User pool:      ${USER_POOL_ID}`);
  console.log(`Region:         ${REGION}`);
  console.log(`Keeping emails: ${[...KEEP_EMAILS].join(', ')}`);
  console.log(`Mode:           ${CONFIRM ? 'CONFIRM (will delete)' : 'DRY-RUN'}`);
  console.log('---');

  const cognito = new CognitoIdentityProviderClient({ region: REGION });

  const users = await listAllCognitoUsers(cognito);
  console.log(`Cognito users encontrados: ${users.length}`);

  const toDelete = users.filter((u) => {
    const email = getEmail(u);
    return email && !KEEP_EMAILS.has(email);
  });
  const keep = users.filter((u) => {
    const email = getEmail(u);
    return email && KEEP_EMAILS.has(email);
  });
  const noEmail = users.filter((u) => !getEmail(u));

  console.log(`\nMantener: ${keep.length}`);
  for (const u of keep) {
    console.log(`  ✓ KEEP   ${getEmail(u)}  ·  @${getHandle(u) ?? '?'}  ·  ${u.Username}`);
  }

  if (noEmail.length > 0) {
    console.log(`\nSin email (también se mantienen): ${noEmail.length}`);
    for (const u of noEmail) {
      console.log(`  ?  ${u.Username}`);
    }
  }

  console.log(`\nBorrar: ${toDelete.length}`);
  for (const u of toDelete) {
    console.log(`  ✗ DEL    ${getEmail(u)}  ·  @${getHandle(u) ?? '?'}  ·  ${u.Username}`);
  }

  if (!CONFIRM) {
    console.log('\n[dry-run] No se borró nada. Re-ejecuta con --confirm para borrar.');
    return;
  }

  if (toDelete.length === 0) {
    console.log('\nNada que borrar.');
    return;
  }

  console.log('\nBorrando…');
  let ok = 0;
  let failed = 0;
  for (const u of toDelete) {
    try {
      await deleteCognitoUser(cognito, u.Username);
      ok++;
      process.stdout.write('.');
    } catch (e) {
      failed++;
      console.error(`\n  ! Falló ${u.Username}: ${e.message}`);
    }
  }
  console.log(`\n\nResultado: borrados ${ok}, fallaron ${failed}.`);
  console.log('Listo. Las filas del modelo User en GraphQL quedan huérfanas y se ' +
              'recrearán cuando un nuevo user se registre.');
}

main().catch((err) => {
  console.error('Error fatal:', err);
  process.exit(1);
});
