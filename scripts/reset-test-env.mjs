#!/usr/bin/env node
/**
 * reset-test-env.mjs
 *
 * Reset full del entorno de pruebas:
 *   1) Borra todas las filas de los modelos de usuario (User, Pick,
 *      Group, Membership, etc.) via GraphQL — autenticado como admin.
 *   2) Reschedule todos los Match: status=SCHEDULED, kickoffAt=2026-06-11
 *      (preservando la hora-del-día original), homeScore/awayScore=null.
 *   3) Borra todos los Cognito users del pool excepto KEEP_EMAILS.
 *
 * Pre-requisitos:
 *   - Node 18+ (fetch nativo + AWS SDK v3).
 *   - AWS credentials con permisos:
 *       cognito-idp:ListUsers
 *       cognito-idp:AdminDeleteUser
 *       cognito-idp:AdminInitiateAuth (o InitiateAuth si auth flow no-admin)
 *   - Password del admin que autoriza el wipe (default: smoketest@polla.local).
 *
 * Uso:
 *   cd scripts
 *   npm install
 *   export ADMIN_PASSWORD=<password de smoketest>
 *   node reset-test-env.mjs                 # dry-run · te muestra los counts
 *   node reset-test-env.mjs --confirm       # ejecuta el wipe
 */

import {
  CognitoIdentityProviderClient,
  ListUsersCommand,
  AdminDeleteUserCommand,
  AdminInitiateAuthCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// ---------- Config ----------
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const outputs = JSON.parse(readFileSync(resolve(__dirname, '..', 'amplify_outputs.json'), 'utf8'));
const USER_POOL_ID = outputs.auth.user_pool_id;
const CLIENT_ID    = outputs.auth.user_pool_client_id;
const REGION       = outputs.auth.aws_region;
const GRAPHQL_URL  = outputs.data.url;

const KEEP_EMAILS = new Set(['smoketest@polla.local']);
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'smoketest@polla.local';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

const CONFIRM = process.argv.includes('--confirm');
const RESCHEDULE_DATE = '2026-06-11';

const cognito = new CognitoIdentityProviderClient({ region: REGION });

// ---------- Cognito auth ----------
async function adminAuth() {
  if (!ADMIN_PASSWORD) {
    throw new Error('Falta env ADMIN_PASSWORD (password de smoketest)');
  }
  // Usamos AdminInitiateAuth (requiere AWS creds con cognito-idp:AdminInitiateAuth).
  // El client tiene ALLOW_ADMIN_USER_PASSWORD_AUTH habilitado, no USER_PASSWORD_AUTH.
  const res = await cognito.send(new AdminInitiateAuthCommand({
    UserPoolId: USER_POOL_ID,
    ClientId: CLIENT_ID,
    AuthFlow: 'ADMIN_USER_PASSWORD_AUTH',
    AuthParameters: {
      USERNAME: ADMIN_EMAIL,
      PASSWORD: ADMIN_PASSWORD,
    },
  }));
  const idToken = res.AuthenticationResult?.IdToken;
  if (!idToken) {
    throw new Error('No id-token devuelto. ¿Hay challenge pendiente en el user (NEW_PASSWORD_REQUIRED, MFA, etc.)?');
  }
  return idToken;
}

// ---------- GraphQL ----------
let idToken = '';
async function gql(query, variables = {}) {
  const res = await fetch(GRAPHQL_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': idToken,
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors) {
    throw new Error('GraphQL: ' + JSON.stringify(json.errors));
  }
  return json.data;
}

async function listAll(queryName, idFields) {
  const fields = idFields.join(' ');
  const items = [];
  let nextToken = null;
  do {
    const data = await gql(`
      query L($t: String) {
        ${queryName}(limit: 200, nextToken: $t) {
          items { ${fields} }
          nextToken
        }
      }
    `, { t: nextToken });
    items.push(...(data[queryName]?.items ?? []));
    nextToken = data[queryName]?.nextToken;
  } while (nextToken);
  return items;
}

async function deleteRows(typeName, mutationName, items, idFields) {
  let ok = 0, failed = 0;
  for (const item of items) {
    const input = {};
    for (const f of idFields) input[f] = item[f];
    try {
      await gql(`
        mutation D($input: Delete${typeName}Input!) {
          ${mutationName}(input: $input) { __typename }
        }
      `, { input });
      ok++;
      process.stdout.write('.');
    } catch (e) {
      failed++;
      console.error(`\n  ! ${typeName} ${JSON.stringify(input)}: ${e.message}`);
    }
  }
  console.log(`\n${typeName}: borradas ${ok}, fallaron ${failed}`);
}

// ---------- Tasks ----------
const MODEL_TASKS = [
  // Hojas primero (dependientes de otras)
  { type: 'Notification',         q: 'listNotifications',          del: 'deleteNotification',          idFields: ['id'] },
  { type: 'TriviaAnswer',         q: 'listTriviaAnswers',          del: 'deleteTriviaAnswer',          idFields: ['id'] },
  { type: 'SponsorRedemption',    q: 'listSponsorRedemptions',     del: 'deleteSponsorRedemption',     idFields: ['id'] },
  { type: 'Comodin',              q: 'listComodins',               del: 'deleteComodin',               idFields: ['id'] },
  { type: 'Pick',                 q: 'listPicks',                  del: 'deletePick',                  idFields: ['id'] },
  { type: 'GroupStandingPick',    q: 'listGroupStandingPicks',     del: 'deleteGroupStandingPick',     idFields: ['id'] },
  { type: 'BracketPick',          q: 'listBracketPicks',           del: 'deleteBracketPick',           idFields: ['id'] },
  { type: 'SpecialPick',          q: 'listSpecialPicks',           del: 'deleteSpecialPick',           idFields: ['id'] },
  { type: 'BestThirdsPick',       q: 'listBestThirdsPicks',        del: 'deleteBestThirdsPick',        idFields: ['id'] },
  { type: 'UserGroupTotal',       q: 'listUserGroupTotals',        del: 'deleteUserGroupTotal',        idFields: ['groupId', 'userId'] },
  { type: 'UserTournamentTotal',  q: 'listUserTournamentTotals',   del: 'deleteUserTournamentTotal',   idFields: ['userId', 'tournamentId'] },
  // Joins / dependientes intermedios
  { type: 'Membership',           q: 'listMemberships',            del: 'deleteMembership',            idFields: ['id'] },
  { type: 'InviteCode',           q: 'listInviteCodes',            del: 'deleteInviteCode',            idFields: ['code'] },
  // Raíces
  { type: 'Group',                q: 'listGroups',                 del: 'deleteGroup',                 idFields: ['id'] },
  { type: 'User',                 q: 'listUsers',                  del: 'deleteUser',                  idFields: ['sub'] },
];

async function wipeAllUserData() {
  for (const t of MODEL_TASKS) {
    let items;
    try {
      items = await listAll(t.q, t.idFields);
    } catch (e) {
      console.error(`! No pude listar ${t.type} (${t.q}): ${e.message} — saltando`);
      continue;
    }
    console.log(`${t.type}: encontradas ${items.length}`);
    if (items.length === 0) continue;
    if (!CONFIRM) {
      console.log(`  [dry-run] saltando borrado`);
      continue;
    }
    await deleteRows(t.type, t.del, items, t.idFields);
  }
}

async function rescheduleAllMatches() {
  let matches;
  try {
    matches = await listAll('listMatches', ['id', 'kickoffAt']);
  } catch (e) {
    console.error('! No pude listar Match:', e.message);
    return;
  }
  console.log(`Match: encontrados ${matches.length}`);
  if (matches.length === 0) return;
  if (!CONFIRM) {
    console.log('  [dry-run] saltando reschedule');
    return;
  }
  let ok = 0, failed = 0;
  for (const m of matches) {
    try {
      // Preservar la hora-del-día original. Si no parsea, default 19:00 UTC.
      let timePart = '19:00:00.000Z';
      try {
        const orig = new Date(m.kickoffAt);
        if (!isNaN(orig.getTime())) {
          timePart = orig.toISOString().slice(11);
        }
      } catch { /* keep default */ }
      const newKickoff = `${RESCHEDULE_DATE}T${timePart}`;
      await gql(`
        mutation U($input: UpdateMatchInput!) {
          updateMatch(input: $input) { id }
        }
      `, {
        input: {
          id: m.id,
          status: 'SCHEDULED',
          kickoffAt: newKickoff,
          homeScore: null,
          awayScore: null,
          pointsCalculated: false,
        },
      });
      ok++;
      process.stdout.write('.');
    } catch (e) {
      failed++;
      console.error(`\n  ! reschedule ${m.id}: ${e.message}`);
    }
  }
  console.log(`\nMatch reschedule: ok ${ok}, failed ${failed}`);
}

async function deleteCognitoUsers() {
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

  const getEmail = (u) => (u.Attributes ?? []).find((a) => a.Name === 'email')?.Value ?? null;

  const toDelete = all.filter((u) => {
    const email = getEmail(u);
    return email && !KEEP_EMAILS.has(email);
  });

  console.log(`Cognito: ${all.length} usuarios totales, borrar ${toDelete.length}`);
  if (!CONFIRM) {
    console.log('  [dry-run] saltando borrado Cognito');
    return;
  }
  let ok = 0, failed = 0;
  for (const u of toDelete) {
    try {
      await cognito.send(new AdminDeleteUserCommand({
        UserPoolId: USER_POOL_ID,
        Username: u.Username,
      }));
      ok++;
      process.stdout.write('.');
    } catch (e) {
      failed++;
      console.error(`\n  ! ${u.Username}: ${e.message}`);
    }
  }
  console.log(`\nCognito: deleted ${ok}, failed ${failed}`);
}

// ---------- Main ----------
async function main() {
  console.log(`User pool:      ${USER_POOL_ID}`);
  console.log(`Region:         ${REGION}`);
  console.log(`GraphQL URL:    ${GRAPHQL_URL}`);
  console.log(`Admin auth:     ${ADMIN_EMAIL}`);
  console.log(`Reschedule a:   ${RESCHEDULE_DATE} (preservando hora-del-día)`);
  console.log(`Mode:           ${CONFIRM ? 'CONFIRM (will execute)' : 'DRY-RUN'}`);
  console.log('---');

  if (CONFIRM) {
    if (!ADMIN_PASSWORD) {
      console.error('Falta env var ADMIN_PASSWORD (password de smoketest@polla.local).');
      console.error('Ejecutá:  export ADMIN_PASSWORD=<password>  &&  node reset-test-env.mjs --confirm');
      process.exit(1);
    }
    console.log('Autenticando como admin…');
    idToken = await adminAuth();
    console.log('OK · id-token obtenido\n');
  }

  console.log('=== 1. Wipe filas de modelos (User, Pick, Group, etc.) ===');
  await wipeAllUserData();

  console.log('\n=== 2. Reschedule de Match a 2026-06-11 ===');
  await rescheduleAllMatches();

  console.log('\n=== 3. Borrado de Cognito users ===');
  await deleteCognitoUsers();

  console.log('\nListo.');
  if (CONFIRM) {
    console.log('Notas:');
    console.log(' - El admin smoketest sigue en Cognito (login funciona).');
    console.log(' - Su fila User fue borrada · al loguearse de nuevo, registrate o ');
    console.log('   creá la fila a mano si querés que aparezca en /admin/users.');
    console.log(' - Match.status=SCHEDULED en todos · podés re-deploy si necesitás ');
    console.log('   regenerar IDs o resetear pointsCalculated por GSI.');
  }
}

main().catch((e) => { console.error('\nError fatal:', e); process.exit(1); });
