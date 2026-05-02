#!/usr/bin/env node
/**
 * wipe-bracket.mjs
 *
 * Borra todos los partidos de las llaves (knockout: 16avos → Final).
 * Mantiene los partidos de fase de grupos (phaseOrder = 1) intactos.
 *
 * También limpia BracketPick rows (predicciones de bracket de los users)
 * para evitar referencias colgantes.
 *
 * Uso:
 *   AWS_PROFILE=polla node scripts/wipe-bracket.mjs --confirm
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  ScanCommand,
  BatchWriteCommand,
} from '@aws-sdk/lib-dynamodb';

const REGION = 'us-east-1';
const TABLE_PREFIX = '5acqcywhfballl4qcn7753ofme-NONE';
const CONFIRM = process.argv.includes('--confirm');

const client = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }), {
  marshallOptions: { removeUndefinedValues: true },
});

const tableName = (model) => `${model}-${TABLE_PREFIX}`;

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

async function batchDelete(table, items, pk) {
  let ok = 0;
  for (let i = 0; i < items.length; i += 25) {
    const chunk = items.slice(i, i + 25);
    const requests = chunk.map((it) => ({
      DeleteRequest: { Key: { [pk]: it[pk] } },
    }));
    try {
      await client.send(new BatchWriteCommand({ RequestItems: { [table]: requests } }));
      ok += chunk.length;
      process.stdout.write('.');
    } catch (e) {
      console.error(`\n  ! batch ${i}-${i + chunk.length}: ${e.message}`);
    }
  }
  return ok;
}

async function main() {
  console.log(`Region:        ${REGION}`);
  console.log(`Table prefix:  ${TABLE_PREFIX}`);
  console.log(`Mode:          ${CONFIRM ? 'CONFIRM' : 'DRY-RUN'}`);
  console.log('---');

  // 1) Phase: identificar IDs de fases knockout (order >= 2)
  console.log('\n=== Phase: identificar fases knockout ===');
  const phases = await scanAll(tableName('Phase'), ['id', 'order', 'name']);
  const knockoutPhaseIds = new Set(
    phases.filter((p) => Number(p.order) >= 2).map((p) => p.id),
  );
  console.log(`Phases totales: ${phases.length}`);
  console.log(`Knockout phase IDs (order >= 2): ${knockoutPhaseIds.size}`);
  for (const p of phases) {
    const tag = knockoutPhaseIds.has(p.id) ? '🌳 knockout' : '   grupo';
    console.log(`  ${tag}  order=${p.order}  ${p.name}  (${p.id})`);
  }

  if (knockoutPhaseIds.size === 0) {
    console.log('\nNo hay phases knockout. Abortando.');
    return;
  }

  // 2) Match: filtrar por phaseId knockout
  console.log('\n=== Match: filtrar partidos knockout ===');
  const allMatches = await scanAll(tableName('Match'), ['id', 'phaseId']);
  const knockoutMatches = allMatches.filter((m) => knockoutPhaseIds.has(m.phaseId));
  console.log(`Matches totales:     ${allMatches.length}`);
  console.log(`Matches knockout:    ${knockoutMatches.length}`);
  console.log(`Matches grupos (se preservan): ${allMatches.length - knockoutMatches.length}`);

  // 3) BracketPick: TODAS las predicciones de bracket de los users
  console.log('\n=== BracketPick: predicciones de users ===');
  const brackets = await scanAll(tableName('BracketPick'), ['id']);
  console.log(`BracketPick rows: ${brackets.length}`);

  if (!CONFIRM) {
    console.log('\nDRY-RUN — corre con --confirm para borrar.');
    return;
  }

  // Borrar
  if (knockoutMatches.length > 0) {
    console.log('\nBorrando Match knockout…');
    const ok = await batchDelete(tableName('Match'), knockoutMatches, 'id');
    console.log(`\n  → borrados ${ok}/${knockoutMatches.length}`);
  }

  if (brackets.length > 0) {
    console.log('\nBorrando BracketPick…');
    const ok = await batchDelete(tableName('BracketPick'), brackets, 'id');
    console.log(`\n  → borrados ${ok}/${brackets.length}`);
  }

  console.log('\nListo. La fase de grupos queda intacta; las llaves desaparecen.');
}

main().catch((e) => { console.error('\nError:', e); process.exit(1); });
