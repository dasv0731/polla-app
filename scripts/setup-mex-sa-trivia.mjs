#!/usr/bin/env node
/**
 * setup-mex-sa-trivia.mjs
 *
 * Setup específico para testear el flow de modales de trivia:
 *   1) Encuentra el partido México vs Sudáfrica (slug "MEX" / "RSA").
 *   2) Lo programa a las 11:00 AM hora local Guayaquil hoy
 *      (UTC-5 → UTC 16:00).
 *   3) Borra trivias existentes de ese partido.
 *   4) Crea 3 trivias nuevas con publishedAt = kickoffAt
 *      (las 3 publicadas al instante del kickoff, no escalonadas).
 *      Esto permite probar la cola del modal cuando hay múltiples
 *      preguntas activas simultáneamente.
 *
 * Uso:
 *   AWS_PROFILE=polla node scripts/setup-mex-sa-trivia.mjs --confirm
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  ScanCommand,
  UpdateCommand,
  PutCommand,
  BatchWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'node:crypto';

const REGION = 'us-east-1';
const TABLE_PREFIX = '5acqcywhfballl4qcn7753ofme-NONE';
const TOURNAMENT_ID = 'mundial-2026';
const CONFIRM = process.argv.includes('--confirm');

// ---- Target match ----
const HOME_TEAM_SLUG = 'mexico';     // México
const AWAY_TEAM_SLUG = 'sudafrica';  // Sudáfrica

// ---- Schedule ----
// Modo "test sin límite": pone el kickoff a `now - 5 min` para que el
// partido esté EN VIVO inmediatamente, y trivias con timerSeconds altísimo
// (24h) para que no auto-revelen mientras testeás los modales.
const TEST_MODE_NO_LIMIT = true;
const DATE_LOCAL = '2026-05-04';     // legacy si TEST_MODE_NO_LIMIT=false
const LOCAL_HOUR = 11;
const LOCAL_MIN = 59;
const TZ_OFFSET_HOURS = 5;       // Guayaquil UTC-5

const TIMER_SECONDS = TEST_MODE_NO_LIMIT ? 86400 : 120;

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

function kickoffISO() {
  if (TEST_MODE_NO_LIMIT) {
    // Kickoff = ahora - 5 min. Esto pone el match en estado LIVE (kickoff
    // past) con 3h de ventana viva por delante para testing.
    return new Date(Date.now() - 5 * 60_000).toISOString();
  }
  const utcHour = LOCAL_HOUR + TZ_OFFSET_HOURS;
  const dayOffset = Math.floor(utcHour / 24);
  const realHour = utcHour % 24;
  const base = new Date(`${DATE_LOCAL}T00:00:00.000Z`);
  base.setUTCDate(base.getUTCDate() + dayOffset);
  base.setUTCHours(realHour, LOCAL_MIN, 0, 0);
  return base.toISOString();
}

const PROMPTS = [
  { prompt: '¿En qué año debutó México en un Mundial?',
    optA: '1930', optB: '1934', optC: '1950', optD: '1958',
    correct: 'A',
    expl: 'México participó en el primer Mundial de 1930 en Uruguay.' },
  { prompt: '¿Cuál fue el resultado del último Mundial entre México y Sudáfrica?',
    optA: '0-1', optB: '1-1', optC: '2-1', optD: 'Nunca se enfrentaron',
    correct: 'B',
    expl: 'Empataron 1-1 en la fase de grupos del Mundial 2010.' },
  { prompt: '¿Quién es el máximo goleador histórico de México en Mundiales?',
    optA: 'Hugo Sánchez', optB: 'Javier Hernández',
    optC: 'Luis Hernández', optD: 'Cuauhtémoc Blanco',
    correct: 'B',
    expl: 'Chicharito Hernández es el máximo goleador histórico de México en Mundiales.' },
];

const SPONSORS = [
  null,                                // sin marca
  { name: 'Coca-Cola', icon: '🥤' },
  { name: 'adidas', icon: '👟' },
];

async function main() {
  console.log(`Region:        ${REGION}`);
  console.log(`Tournament:    ${TOURNAMENT_ID}`);
  console.log(`Mode:          ${CONFIRM ? 'CONFIRM' : 'DRY-RUN'}`);
  console.log(`Target:        ${HOME_TEAM_SLUG.toUpperCase()} vs ${AWAY_TEAM_SLUG.toUpperCase()}`);
  console.log(`Schedule:      ${LOCAL_HOUR}:${String(LOCAL_MIN).padStart(2, '0')} local Guayaquil → ${kickoffISO()} UTC`);
  console.log('---');

  // 1) Find the match
  const matches = await scanAll(tableName('Match'),
    ['id', 'tournamentId', 'homeTeamId', 'awayTeamId', 'kickoffAt', 'phaseId']);
  const target = matches.find((m) =>
    m.tournamentId === TOURNAMENT_ID
    && (m.homeTeamId === HOME_TEAM_SLUG || m.awayTeamId === HOME_TEAM_SLUG)
    && (m.homeTeamId === AWAY_TEAM_SLUG || m.awayTeamId === AWAY_TEAM_SLUG),
  );
  if (!target) {
    console.error(`! No match found between ${HOME_TEAM_SLUG} and ${AWAY_TEAM_SLUG}`);
    return;
  }
  console.log(`\nMatch encontrado: ${target.id}`);
  console.log(`  Home: ${target.homeTeamId}  Away: ${target.awayTeamId}`);
  console.log(`  Kickoff actual: ${target.kickoffAt}`);

  const newKickoff = kickoffISO();

  if (!CONFIRM) {
    console.log('\nDRY-RUN — corre con --confirm para aplicar.');
    return;
  }

  // 2) Update kickoff + reset status/scores
  console.log('\nActualizando kickoff…');
  await client.send(new UpdateCommand({
    TableName: tableName('Match'),
    Key: { id: target.id },
    UpdateExpression: 'SET #status = :s, kickoffAt = :k, pointsCalculated = :pc REMOVE homeScore, awayScore',
    ExpressionAttributeNames: { '#status': 'status' },
    ExpressionAttributeValues: { ':s': 'SCHEDULED', ':k': newKickoff, ':pc': false },
  }));
  console.log(`  → kickoff: ${newKickoff}`);

  // 3) Delete existing trivias for this match
  const allTrivias = await scanAll(tableName('TriviaQuestion'), ['id', 'matchId']);
  const matchTrivias = allTrivias.filter((t) => t.matchId === target.id);
  if (matchTrivias.length > 0) {
    console.log(`\nBorrando ${matchTrivias.length} trivia(s) existentes…`);
    // BatchWrite máx 25 items por request — chunkeamos por si hay más.
    for (let i = 0; i < matchTrivias.length; i += 25) {
      const chunk = matchTrivias.slice(i, i + 25);
      const requests = chunk.map((t) => ({ DeleteRequest: { Key: { id: t.id } } }));
      await client.send(new BatchWriteCommand({
        RequestItems: { [tableName('TriviaQuestion')]: requests },
      }));
    }
    console.log(`  → ${matchTrivias.length} borradas`);
  }

  // 3b) Delete existing TriviaAnswer rows for this match — sin esto, las
  //     respuestas viejas filtran las nuevas trivias del frontend (collectForMatch
  //     hace `if (answeredQids.has(q.id)) continue;`) y la cola sale vacía.
  const allAnswers = await scanAll(tableName('TriviaAnswer'), ['id', 'matchId']);
  const matchAnswers = allAnswers.filter((a) => a.matchId === target.id);
  if (matchAnswers.length > 0) {
    console.log(`\nBorrando ${matchAnswers.length} respuesta(s) previas del match…`);
    for (let i = 0; i < matchAnswers.length; i += 25) {
      const chunk = matchAnswers.slice(i, i + 25);
      const requests = chunk.map((a) => ({ DeleteRequest: { Key: { id: a.id } } }));
      await client.send(new BatchWriteCommand({
        RequestItems: { [tableName('TriviaAnswer')]: requests },
      }));
    }
    console.log(`  → ${matchAnswers.length} borradas`);
  }

  // 4) Create 3 trivias all published at kickoff
  console.log('\nCreando 3 trivias nuevas (todas publicadas al kickoff)…');
  const now = new Date().toISOString();
  let createdCount = 0;
  for (let i = 0; i < 3; i++) {
    const p = PROMPTS[i];
    const sponsor = SPONSORS[i % SPONSORS.length];
    const explanation = sponsor
      ? `[BRAND:${sponsor.name}:${sponsor.icon}] ${p.expl}`
      : p.expl;
    const item = {
      id: randomUUID(),
      matchId: target.id,
      tournamentId: TOURNAMENT_ID,
      prompt: p.prompt,
      optionA: p.optA, optionB: p.optB, optionC: p.optC, optionD: p.optD,
      correctOption: p.correct,
      publishedAt: newKickoff,    // todas al inicio
      timerSeconds: TIMER_SECONDS,
      explanation,
      createdAt: now,
      updatedAt: now,
    };
    try {
      await client.send(new PutCommand({
        TableName: tableName('TriviaQuestion'),
        Item: item,
      }));
      createdCount++;
      console.log(`  ${i + 1}. "${p.prompt.slice(0, 50)}…"  id=${item.id}  ${sponsor ? '· con marca ' + sponsor.name : '· sin marca'}`);
    } catch (err) {
      console.error(`  ${i + 1}. ERROR creando: ${err.message}`);
    }
  }

  // 5) Verificación post-write: re-scan para confirmar que las 3 quedaron en DB
  const verifyTrivias = await scanAll(tableName('TriviaQuestion'), ['id', 'matchId']);
  const verifyForMatch = verifyTrivias.filter((t) => t.matchId === target.id);
  console.log(`\nVerificación: ${verifyForMatch.length} trivia(s) en DB para este match (esperado: 3)`);

  console.log(`\nListo. ${createdCount}/3 trivias creadas. Match ${HOME_TEAM_SLUG.toUpperCase()}-${AWAY_TEAM_SLUG.toUpperCase()} kickoff ${newKickoff}.`);
}

main().catch((e) => { console.error('\nError:', e); process.exit(1); });
