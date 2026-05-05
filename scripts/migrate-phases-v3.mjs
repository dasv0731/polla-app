#!/usr/bin/env node
/**
 * migrate-phases-v3.mjs
 *
 * Migra las phases del torneo del schema v2 (6 phases) a v3 (9 phases),
 * y reasigna matches a sus phaseIds correctos según kickoff.
 *
 * Cambios v3 vs v2:
 *   v2:
 *     1: Grupos               → 1 phase para Fecha 1/2/3 (matchday distingue)
 *     2: Round of 32
 *     3: Octavos
 *     4: Cuartos
 *     5: Semifinales
 *     6: Final + 3er          → contiene Final + 3er puesto match (bracketPosition)
 *   v3:
 *     1: Fecha 1              ← rename + keep id de "Grupos"
 *     2: Fecha 2              ← NEW
 *     3: Fecha 3              ← NEW
 *     4: 16avos               ← rename + reorder de "Round of 32" (era order 2)
 *     5: 8avos                ← rename + reorder de "Octavos" (era order 3)
 *     6: 4tos                 ← rename + reorder de "Cuartos" (era order 4)
 *     7: Semis                ← rename + reorder de "Semifinales" (era order 5)
 *     8: Final                ← rename + reorder de "Final + 3er" (era order 6)
 *     9: 3er puesto           ← NEW (reasigna el 3rd place match)
 *
 * Pasos:
 *   1) Cargar phases existentes del torneo.
 *   2) Update in place: rename + reorder de las 6 phases existentes.
 *   3) Create las 3 phases nuevas (Fecha 2, Fecha 3, 3er puesto).
 *   4) Reasignar matches:
 *      a) Group stage: matches con kickoff en jorn 2 → Fecha 2 phaseId.
 *                       matches con kickoff en jorn 3 → Fecha 3 phaseId.
 *                       (jorn 1 queda en Fecha 1 = old Grupos id, sin cambio).
 *      b) 3er puesto: el match con bracketPosition=2 en old "Final + 3er" → 3er puesto phaseId.
 *   5) Remove matchday field de todos los matches (REMOVE matchday).
 *
 * Uso:
 *   AWS_PROFILE=polla node scripts/migrate-phases-v3.mjs --confirm
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  ScanCommand,
  UpdateCommand,
  PutCommand,
} from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'node:crypto';

const REGION = 'us-east-1';
const TABLE_PREFIX = '5acqcywhfballl4qcn7753ofme-NONE';
const TOURNAMENT_ID = 'mundial-2026';
const CONFIRM = process.argv.includes('--confirm');

// Mapeo old name → new (name, order, multiplier).
// Multiplier es legacy (integer no soporta fracciones); preservamos un valor
// "razonable" según la fase pero el scoring real usa phase.order.
const RENAME_MAP = {
  'Grupos':       { newName: 'Fecha 1',     newOrder: 1, multiplier: 1 },
  'Round of 32':  { newName: '16avos',      newOrder: 4, multiplier: 2 },
  'Octavos':      { newName: '8avos',       newOrder: 5, multiplier: 2 },
  'Cuartos':      { newName: '4tos',        newOrder: 6, multiplier: 3 },
  'Semifinales':  { newName: 'Semis',       newOrder: 7, multiplier: 3 },
  'Final + 3er':  { newName: 'Final',       newOrder: 8, multiplier: 4 },
};

// Phases nuevas a crear.
const NEW_PHASES = [
  { name: 'Fecha 2',    order: 2, multiplier: 1 },
  { name: 'Fecha 3',    order: 3, multiplier: 1 },
  { name: '3er puesto', order: 9, multiplier: 3 },
];

// Cutoffs de kickoff por jornada (UTC). Calendario: jorn 1 = 11-17 jun,
// jorn 2 = 18-23 jun, jorn 3 = 24-27 jun. Usamos límites a las 00:00 UTC
// del primer día de cada bloque.
const FECHA_2_START = Date.parse('2026-06-18T00:00:00Z');
const FECHA_3_START = Date.parse('2026-06-24T00:00:00Z');

const client = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }), {
  marshallOptions: { removeUndefinedValues: true },
});
const tableName = (model) => `${model}-${TABLE_PREFIX}`;

async function scanAll(table, fields) {
  const names = {};
  const aliased = fields.map((f, i) => {
    const a = `#k${i}`;
    names[a] = f;
    return a;
  });
  const items = [];
  let key;
  do {
    const r = await client.send(new ScanCommand({
      TableName: table,
      ProjectionExpression: aliased.join(', '),
      ExpressionAttributeNames: names,
      ExclusiveStartKey: key,
    }));
    items.push(...(r.Items ?? []));
    key = r.LastEvaluatedKey;
  } while (key);
  return items;
}

async function main() {
  console.log(`Region:      ${REGION}`);
  console.log(`Tournament:  ${TOURNAMENT_ID}`);
  console.log(`Mode:        ${CONFIRM ? 'CONFIRM' : 'DRY-RUN'}`);
  console.log('---\n');

  // 1) Phases existentes
  const allPhases = await scanAll(tableName('Phase'),
    ['id', 'tournamentId', 'name', 'order', 'multiplier']);
  const tourneyPhases = allPhases.filter((p) => p.tournamentId === TOURNAMENT_ID);
  console.log(`Phases del torneo: ${tourneyPhases.length}`);
  for (const p of tourneyPhases) {
    console.log(`  [${p.order}] ${p.name}  (id=${p.id.slice(0, 8)}…)`);
  }

  // 2) Mapeo de id → newOrder (para reusar luego en match reassignment).
  const oldNameToId = new Map();
  for (const p of tourneyPhases) oldNameToId.set(p.name, p.id);

  // 3) Matches del torneo — para reasignar
  const allMatches = await scanAll(tableName('Match'),
    ['id', 'tournamentId', 'phaseId', 'kickoffAt', 'bracketPosition']);
  const tourneyMatches = allMatches.filter((m) => m.tournamentId === TOURNAMENT_ID);
  console.log(`\nMatches del torneo: ${tourneyMatches.length}\n`);

  // Plan
  const updates = [];
  const creates = [];
  const matchReassignments = [];
  const removeMatchday = [];

  // 4) Rename + reorder phases existentes
  for (const p of tourneyPhases) {
    const target = RENAME_MAP[p.name];
    if (!target) {
      console.warn(`  ! Phase "${p.name}" sin mapping de v2→v3 — skip.`);
      continue;
    }
    if (p.name === target.newName && p.order === target.newOrder) continue;   // ya migrada
    updates.push({
      id: p.id,
      from: { name: p.name, order: p.order },
      to:   { name: target.newName, order: target.newOrder, multiplier: target.multiplier },
    });
  }

  // 5) Crear phases nuevas (si no existen ya por re-run)
  const existingByOrder = new Map(tourneyPhases.map((p) => [p.order, p]));
  for (const np of NEW_PHASES) {
    // Si ya existe una phase con ese order Y nombre nuevo (e.g. re-run), skip.
    const existing = tourneyPhases.find((p) => p.name === np.name);
    if (existing) continue;
    // Si ya existe con ese order pero nombre distinto, NO crear duplicado;
    // el script asume migración limpia (corre una sola vez por torneo).
    if (existingByOrder.has(np.order)) {
      // Ojo: puede ser una phase legacy ya renombrada. Solo skip si su
      // nombre es el target nuevo.
      const e = existingByOrder.get(np.order);
      if (e.name === np.name) continue;
    }
    creates.push({
      id: randomUUID(),
      tournamentId: TOURNAMENT_ID,
      name: np.name,
      order: np.order,
      multiplier: np.multiplier,
    });
  }

  // 6) Reasignar matches:
  //    a) Group stage: matches actualmente en old "Grupos" → split por kickoff.
  //    b) 3er puesto: match con bracketPosition=2 en old "Final + 3er".
  const oldGruposId = oldNameToId.get('Grupos');
  const oldFinalId  = oldNameToId.get('Final + 3er');

  // Necesitamos los IDs nuevos de Fecha 2, Fecha 3, 3er puesto. Si los creamos
  // en `creates`, sus IDs son los de creates[].id. Si ya existían (re-run),
  // los buscamos en tourneyPhases.
  const fecha2Id = creates.find((c) => c.name === 'Fecha 2')?.id
    ?? tourneyPhases.find((p) => p.name === 'Fecha 2')?.id;
  const fecha3Id = creates.find((c) => c.name === 'Fecha 3')?.id
    ?? tourneyPhases.find((p) => p.name === 'Fecha 3')?.id;
  const tercerId = creates.find((c) => c.name === '3er puesto')?.id
    ?? tourneyPhases.find((p) => p.name === '3er puesto')?.id;

  if (oldGruposId) {
    for (const m of tourneyMatches) {
      if (m.phaseId !== oldGruposId) continue;
      const k = Date.parse(m.kickoffAt ?? '');
      if (Number.isNaN(k)) continue;
      let targetPhaseId = null;
      if (k >= FECHA_3_START)      targetPhaseId = fecha3Id;
      else if (k >= FECHA_2_START) targetPhaseId = fecha2Id;
      // jorn 1 queda en Grupos id (que ahora se llama "Fecha 1").
      if (targetPhaseId && targetPhaseId !== m.phaseId) {
        matchReassignments.push({ id: m.id, fromPhaseId: m.phaseId, toPhaseId: targetPhaseId, reason: k >= FECHA_3_START ? 'Fecha 3' : 'Fecha 2' });
      }
    }
  }

  if (oldFinalId && tercerId) {
    for (const m of tourneyMatches) {
      if (m.phaseId !== oldFinalId) continue;
      if (m.bracketPosition === 2) {
        matchReassignments.push({ id: m.id, fromPhaseId: m.phaseId, toPhaseId: tercerId, reason: '3er puesto match' });
      }
    }
  }

  // 7) Remove matchday de todos los matches del torneo
  for (const m of tourneyMatches) {
    removeMatchday.push(m.id);
  }

  // ─── Reporte ─────
  console.log(`Plan:`);
  console.log(`  - ${updates.length} phases para rename + reorder`);
  console.log(`  - ${creates.length} phases nuevas para crear`);
  console.log(`  - ${matchReassignments.length} matches para reasignar phaseId`);
  console.log(`  - ${removeMatchday.length} matches para REMOVE matchday`);

  if (updates.length > 0) {
    console.log(`\nUpdates phases:`);
    for (const u of updates) {
      console.log(`  ${u.from.name} (order ${u.from.order}) → ${u.to.name} (order ${u.to.newOrder ?? u.to.order})`);
    }
  }

  if (creates.length > 0) {
    console.log(`\nCreates phases:`);
    for (const c of creates) {
      console.log(`  + ${c.name} (order ${c.order}) id=${c.id.slice(0, 8)}…`);
    }
  }

  const reasignByReason = new Map();
  for (const r of matchReassignments) {
    reasignByReason.set(r.reason, (reasignByReason.get(r.reason) ?? 0) + 1);
  }
  if (reasignByReason.size > 0) {
    console.log(`\nReasignaciones de match:`);
    for (const [reason, n] of reasignByReason) console.log(`  ${reason}: ${n}`);
  }

  if (!CONFIRM) {
    console.log('\nDRY-RUN — corre con --confirm para aplicar.');
    return;
  }

  // ─── Apply ─────
  console.log('\n--- APPLYING ---');

  // Updates de phase deben ir DESPUÉS de creates (para que las nuevas existan
  // antes de mover matches a sus IDs). Orden:
  //   1. Crear phases nuevas (Fecha 2, Fecha 3, 3er puesto).
  //   2. Update phases existentes (rename + reorder).
  //   3. Reasignar matches.
  //   4. Remove matchday.

  console.log(`\n1) Creando ${creates.length} phases nuevas…`);
  for (const c of creates) {
    const now = new Date().toISOString();
    await client.send(new PutCommand({
      TableName: tableName('Phase'),
      Item: { ...c, createdAt: now, updatedAt: now },
    }));
    console.log(`  + ${c.name}`);
  }

  console.log(`\n2) Actualizando ${updates.length} phases existentes…`);
  for (const u of updates) {
    await client.send(new UpdateCommand({
      TableName: tableName('Phase'),
      Key: { id: u.id },
      UpdateExpression: 'SET #n = :n, #o = :o, multiplier = :m, updatedAt = :now',
      ExpressionAttributeNames: { '#n': 'name', '#o': 'order' },
      ExpressionAttributeValues: {
        ':n': u.to.name,
        ':o': u.to.order,
        ':m': u.to.multiplier,
        ':now': new Date().toISOString(),
      },
    }));
    console.log(`  ✓ ${u.from.name} → ${u.to.name}`);
  }

  console.log(`\n3) Reasignando ${matchReassignments.length} matches…`);
  for (const r of matchReassignments) {
    await client.send(new UpdateCommand({
      TableName: tableName('Match'),
      Key: { id: r.id },
      UpdateExpression: 'SET phaseId = :p, updatedAt = :now',
      ExpressionAttributeValues: {
        ':p': r.toPhaseId,
        ':now': new Date().toISOString(),
      },
    }));
  }
  console.log(`  ✓ ${matchReassignments.length} matches reasignados`);

  console.log(`\n4) Removiendo matchday de ${removeMatchday.length} matches…`);
  for (const id of removeMatchday) {
    try {
      await client.send(new UpdateCommand({
        TableName: tableName('Match'),
        Key: { id },
        UpdateExpression: 'REMOVE matchday',
      }));
    } catch (err) {
      // Si el item no tiene matchday, REMOVE es idempotente y no falla,
      // pero por seguridad lo wrappeamos.
      console.warn(`  ! No pude remover matchday de ${id}:`, err.message);
    }
  }
  console.log(`  ✓ matchday removido`);

  console.log('\n--- DONE ---');
}

main().catch((e) => { console.error('\nError:', e); process.exit(1); });
