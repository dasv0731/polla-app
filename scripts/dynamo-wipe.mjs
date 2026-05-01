#!/usr/bin/env node
/**
 * dynamo-wipe.mjs
 *
 * Wipe directo de tablas DynamoDB (saltea las auth rules de GraphQL).
 * También resetea cada Match a status=SCHEDULED con kickoffAt en
 * 2026-06-11 (preservando la hora-del-día).
 *
 * Uso:
 *   AWS_PROFILE=polla node dynamo-wipe.mjs --confirm
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  ScanCommand,
  BatchWriteCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';

const REGION = 'us-east-1';
const TABLE_PREFIX = '5acqcywhfballl4qcn7753ofme-NONE';
const RESCHEDULE_DATE = '2026-06-11';
const CONFIRM = process.argv.includes('--confirm');

const client = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }), {
  marshallOptions: { removeUndefinedValues: true },
});

const tableName = (model) => `${model}-${TABLE_PREFIX}`;

// Wipe completo: borrar todas las filas
const WIPE_MODELS = [
  { model: 'Notification',         pk: 'id' },
  { model: 'TriviaAnswer',         pk: 'id' },
  { model: 'SponsorRedemption',    pk: 'id' },
  { model: 'Comodin',              pk: 'id' },
  { model: 'Pick',                 pk: 'id' },
  { model: 'GroupStandingPick',    pk: 'id' },
  { model: 'BracketPick',          pk: 'id' },
  { model: 'SpecialPick',          pk: 'id' },
  { model: 'BestThirdsPick',       pk: 'id' },
  { model: 'UserGroupTotal',       pk: 'groupId',  sk: 'userId' },
  { model: 'UserTournamentTotal',  pk: 'userId',   sk: 'tournamentId' },
  { model: 'Membership',           pk: 'id' },
  { model: 'InviteCode',           pk: 'code' },
  { model: 'Group',                pk: 'id' },
  { model: 'User',                 pk: 'sub' },
];

/**
 * Scan paginado. Aliasea cualquier nombre de atributo via #pk0/#pk1
 * para evitar reserved keyword conflicts (ej. "sub" en User, "status",
 * "name", etc.).
 */
async function scanAll(table, fields) {
  const names = {};
  const aliased = fields.map((f, i) => {
    const alias = `#pk${i}`;
    names[alias] = f;
    return alias;
  });
  const projection = aliased.join(', ');

  const items = [];
  let key;
  do {
    const res = await client.send(new ScanCommand({
      TableName: table,
      ProjectionExpression: projection,
      ExpressionAttributeNames: names,
      ExclusiveStartKey: key,
    }));
    items.push(...(res.Items ?? []));
    key = res.LastEvaluatedKey;
  } while (key);
  return items;
}

async function batchDelete(table, items, pk, sk) {
  // BatchWrite acepta hasta 25 items
  let ok = 0;
  for (let i = 0; i < items.length; i += 25) {
    const chunk = items.slice(i, i + 25);
    const requests = chunk.map((it) => {
      const Key = { [pk]: it[pk] };
      if (sk) Key[sk] = it[sk];
      return { DeleteRequest: { Key } };
    });
    try {
      await client.send(new BatchWriteCommand({
        RequestItems: { [table]: requests },
      }));
      ok += chunk.length;
      process.stdout.write('.');
    } catch (e) {
      console.error(`\n  ! batch ${i}-${i+chunk.length}: ${e.message}`);
    }
  }
  return ok;
}

async function wipeAll() {
  for (const t of WIPE_MODELS) {
    const table = tableName(t.model);
    const fields = t.sk ? [t.pk, t.sk] : [t.pk];
    let items;
    try {
      items = await scanAll(table, fields);
    } catch (e) {
      console.error(`! No pude scan ${t.model}: ${e.message}`);
      continue;
    }
    console.log(`${t.model}: ${items.length} items`);
    if (items.length === 0) continue;
    if (!CONFIRM) continue;
    const ok = await batchDelete(table, items, t.pk, t.sk);
    console.log(`\n  → borradas ${ok}/${items.length}`);
  }
}

async function rescheduleMatches() {
  const table = tableName('Match');
  let items;
  try {
    items = await scanAll(table, ['id', 'kickoffAt']);
  } catch (e) {
    console.error(`! No pude scan Match: ${e.message}`);
    return;
  }
  console.log(`Match: ${items.length} partidos`);
  if (items.length === 0) return;
  if (!CONFIRM) return;
  let ok = 0;
  for (const m of items) {
    let timePart = '19:00:00.000Z';
    try {
      const orig = new Date(m.kickoffAt);
      if (!isNaN(orig.getTime())) timePart = orig.toISOString().slice(11);
    } catch { /* keep default */ }
    const newKickoff = `${RESCHEDULE_DATE}T${timePart}`;
    try {
      await client.send(new UpdateCommand({
        TableName: table,
        Key: { id: m.id },
        UpdateExpression:
          'SET #status = :s, kickoffAt = :k REMOVE homeScore, awayScore SET pointsCalculated = :pc',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: {
          ':s': 'SCHEDULED',
          ':k': newKickoff,
          ':pc': false,
        },
      }));
      ok++;
      process.stdout.write('.');
    } catch (e) {
      // El UpdateExpression con SET y REMOVE en el mismo statement puede
      // fallar en algunos esquemas. Probemos el formato correcto.
      try {
        await client.send(new UpdateCommand({
          TableName: table,
          Key: { id: m.id },
          UpdateExpression: 'SET #status = :s, kickoffAt = :k, pointsCalculated = :pc REMOVE homeScore, awayScore',
          ExpressionAttributeNames: { '#status': 'status' },
          ExpressionAttributeValues: {
            ':s': 'SCHEDULED',
            ':k': newKickoff,
            ':pc': false,
          },
        }));
        ok++;
        process.stdout.write('.');
      } catch (e2) {
        console.error(`\n  ! update ${m.id}: ${e2.message}`);
      }
    }
  }
  console.log(`\n  → updated ${ok}/${items.length}`);
}

async function main() {
  console.log(`Region:        ${REGION}`);
  console.log(`Table prefix:  ${TABLE_PREFIX}`);
  console.log(`Reschedule a:  ${RESCHEDULE_DATE}`);
  console.log(`Mode:          ${CONFIRM ? 'CONFIRM' : 'DRY-RUN'}`);
  console.log('---\n=== Wipe modelos de usuario ===');
  await wipeAll();
  console.log('\n=== Reschedule de Match ===');
  await rescheduleMatches();
  console.log('\nListo.');
}

main().catch((e) => { console.error('\nError:', e); process.exit(1); });
