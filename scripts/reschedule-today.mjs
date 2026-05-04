#!/usr/bin/env node
/**
 * reschedule-today.mjs
 *
 * Reagrupa TODOS los Match a "hoy" (DATE_LOCAL), en grupos de 10
 * empezando a las 5:10 PM Guayaquil (UTC-5) y +5 min por grupo:
 *
 *   matches  0-9  → 17:10 (22:10 UTC)
 *   matches 10-19 → 17:15 (22:15 UTC)
 *   matches 20-29 → 17:20 ...
 *   etc.
 *
 * Ordena por kickoffAt actual (preserva el orden original del fixture).
 * Pone status=SCHEDULED y limpia homeScore/awayScore/pointsCalculated.
 *
 * Uso:
 *   AWS_PROFILE=polla node scripts/reschedule-today.mjs --confirm
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  ScanCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';

const REGION = 'us-east-1';
const TABLE_PREFIX = '5acqcywhfballl4qcn7753ofme-NONE';
const CONFIRM = process.argv.includes('--confirm');

// ---- config de horario ----
const DATE_LOCAL = '2026-05-04';   // hoy (zona Guayaquil)
const TZ_OFFSET_HOURS = 5;          // Guayaquil = UTC-5 (sin DST)
const START_LOCAL_HOUR = 9;         // 9:00 AM
const START_LOCAL_MIN = 0;
const GROUP_SIZE = 10;
const MIN_PER_GROUP = 5;

// Cálculo de la hora UTC base para el grupo 0
// 17:10 Guayaquil = 22:10 UTC
const baseUtcHour = START_LOCAL_HOUR + TZ_OFFSET_HOURS;
const baseUtcMin = START_LOCAL_MIN;

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
  const items = [];
  let key;
  do {
    const res = await client.send(new ScanCommand({
      TableName: table,
      ProjectionExpression: aliased.join(', '),
      ExpressionAttributeNames: names,
      ExclusiveStartKey: key,
    }));
    items.push(...(res.Items ?? []));
    key = res.LastEvaluatedKey;
  } while (key);
  return items;
}

/** Calcula el ISO UTC para el group index dado. Maneja rollover de
 *  día cuando baseUtcHour + offset >= 24 (e.g., 19:25 local Guayaquil
 *  → 00:25 UTC del día siguiente). */
function isoForGroup(groupIdx) {
  const totalMin = baseUtcMin + groupIdx * MIN_PER_GROUP;
  const totalHours = baseUtcHour + Math.floor(totalMin / 60);
  const minOnly = totalMin % 60;
  const dayOffset = Math.floor(totalHours / 24);
  const hourOnly = totalHours % 24;
  const base = new Date(`${DATE_LOCAL}T00:00:00.000Z`);
  base.setUTCDate(base.getUTCDate() + dayOffset);
  base.setUTCHours(hourOnly, minOnly, 0, 0);
  return base.toISOString();
}

async function main() {
  console.log(`Region:        ${REGION}`);
  console.log(`Table prefix:  ${TABLE_PREFIX}`);
  console.log(`Fecha local:   ${DATE_LOCAL} (Guayaquil UTC-${TZ_OFFSET_HOURS})`);
  console.log(`Inicio:        ${START_LOCAL_HOUR}:${String(START_LOCAL_MIN).padStart(2, '0')} local → ${isoForGroup(0)} UTC (con rollover de día si aplica)`);
  console.log(`Grupos:        cada ${GROUP_SIZE} partidos (+${MIN_PER_GROUP} min cada grupo)`);
  console.log(`Mode:          ${CONFIRM ? 'CONFIRM' : 'DRY-RUN'}`);
  console.log('---');

  const table = tableName('Match');
  const items = await scanAll(table, ['id', 'kickoffAt']);
  console.log(`\nMatches a reagrupar: ${items.length}`);
  if (items.length === 0) return;

  // Ordenar por kickoffAt actual (preserva orden cronológico original)
  items.sort((a, b) => String(a.kickoffAt).localeCompare(String(b.kickoffAt)));

  // Asignar nuevo kickoffAt según group index
  const plan = items.map((m, idx) => ({
    id: m.id,
    groupIdx: Math.floor(idx / GROUP_SIZE),
    newKickoff: isoForGroup(Math.floor(idx / GROUP_SIZE)),
  }));

  // Mostrar resumen por grupo
  const byGroup = new Map();
  for (const p of plan) {
    if (!byGroup.has(p.groupIdx)) byGroup.set(p.groupIdx, []);
    byGroup.get(p.groupIdx).push(p);
  }
  console.log('\nPlan por grupo:');
  for (const [g, list] of [...byGroup.entries()].sort((a, b) => a[0] - b[0])) {
    const localHour = START_LOCAL_HOUR;
    const localMin = START_LOCAL_MIN + g * MIN_PER_GROUP;
    const lh = localHour + Math.floor(localMin / 60);
    const lm = localMin % 60;
    console.log(`  Grupo ${g + 1} (${String(lh).padStart(2, '0')}:${String(lm).padStart(2, '0')} local · ${list[0].newKickoff} UTC): ${list.length} matches`);
  }

  if (!CONFIRM) {
    console.log('\nDRY-RUN — corre con --confirm para aplicar.');
    return;
  }

  console.log('\nActualizando…');
  let ok = 0;
  for (const p of plan) {
    try {
      await client.send(new UpdateCommand({
        TableName: table,
        Key: { id: p.id },
        UpdateExpression:
          'SET #status = :s, kickoffAt = :k, pointsCalculated = :pc REMOVE homeScore, awayScore',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: {
          ':s': 'SCHEDULED',
          ':k': p.newKickoff,
          ':pc': false,
        },
      }));
      ok++;
      process.stdout.write('.');
    } catch (e) {
      console.error(`\n  ! update ${p.id}: ${e.message}`);
    }
  }
  console.log(`\n  → updated ${ok}/${plan.length}`);
}

main().catch((e) => { console.error('\nError:', e); process.exit(1); });
