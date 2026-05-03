#!/usr/bin/env node
/**
 * seed-trivia-random.mjs
 *
 * Borra TODAS las TriviaQuestion existentes y crea 4 nuevas random por
 * cada Match del torneo. Pensado para smoke-test del flow de trivia
 * + modales (con/sin marca).
 *
 * Para cada match:
 *   · Pregunta 1 → publishedAt = kickoffAt + 3min
 *   · Pregunta 2 → publishedAt = kickoffAt + 6min
 *   · Pregunta 3 → publishedAt = kickoffAt + 9min
 *   · Pregunta 4 → publishedAt = kickoffAt + 12min
 *
 * Cada pregunta:
 *   · Prompt random de un pool de 12.
 *   · Opciones random (4 strings cortos del pool).
 *   · correctOption random A/B/C/D.
 *   · timerSeconds = 120 (igual al default del modal).
 *   · explanation: 50/50 con prefijo [BRAND:Sponsor:emoji] para
 *     activar la variante "marca" del modal, o sin prefijo (sinad).
 *
 * Uso:
 *   AWS_PROFILE=polla node scripts/seed-trivia-random.mjs --confirm
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  ScanCommand,
  BatchWriteCommand,
  PutCommand,
} from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'node:crypto';

const REGION = 'us-east-1';
const TABLE_PREFIX = '5acqcywhfballl4qcn7753ofme-NONE';
const TOURNAMENT_ID = 'mundial-2026';
const CONFIRM = process.argv.includes('--confirm');

const client = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }), {
  marshallOptions: { removeUndefinedValues: true },
});

const tableName = (model) => `${model}-${TABLE_PREFIX}`;

const PROMPTS = [
  '¿Cuántos goles marcó Pelé en el Mundial 1958?',
  '¿Qué selección ganó la primera Copa Mundial de la FIFA?',
  '¿Quién es el máximo goleador histórico de los Mundiales?',
  '¿En qué año se jugó el primer Mundial?',
  '¿Cuál es el estadio más grande del Mundial 2026?',
  '¿Cuántas selecciones participan en el Mundial 2026?',
  '¿Qué jugador tiene más asistencias en Mundiales?',
  '¿Cuál es el equipo con más Copas del Mundo ganadas?',
  '¿Quién es el árbitro más joven en debutar en un Mundial?',
  '¿En qué Mundial se introdujo el VAR por primera vez?',
  '¿Cuál fue el resultado de la final del Mundial 2022?',
  '¿Qué selección eliminó a Brasil en cuartos en el Mundial 2022?',
];

const OPTIONS_POOL = [
  'Brasil', 'Argentina', 'Alemania', 'Francia',
  'Italia', 'Inglaterra', 'España', 'Uruguay',
  '1930', '1934', '1958', '1962', '1970', '1986', '2002', '2018', '2022',
  'Pelé', 'Maradona', 'Messi', 'Cristiano Ronaldo', 'Klose', 'Müller',
  '4', '6', '8', '10', '12', '16', '32', '48',
  'Maracaná', 'Wembley', 'Camp Nou', 'Azteca', 'MetLife',
  'Howard Webb', 'Pierluigi Collina', 'Néstor Pitana', 'Anthony Taylor',
  '3-3 (4-2 pen)', '4-2', '2-1', '1-0', '3-0',
  'Croacia', 'Bélgica', 'Holanda', 'Marruecos', 'Portugal',
  'Francia 1998', 'Alemania 2006', 'Brasil 2014', 'Rusia 2018', 'Catar 2022',
];

const SPONSORS = [
  { name: 'Coca-Cola',   icon: '🥤' },
  { name: 'adidas',       icon: '👟' },
  { name: 'McDonalds',    icon: '🍔' },
  { name: 'Visa',         icon: '💳' },
  { name: 'Hyundai',      icon: '🚗' },
  { name: 'Budweiser',    icon: '🍺' },
];

const EXPLANATIONS_PLAIN = [
  'Una respuesta interesante que no necesariamente es correcta para esta pregunta de prueba.',
  'Dato curioso aleatorio para validar el flow del reveal.',
  'Esto se muestra solo después de responder o cuando expira el timer.',
  'Texto random de explicación — no le hagas caso al contenido.',
  'Curiosidad random para validar el reveal post-respuesta.',
  'La explicación aparece junto al feedback ✓/✕ tras presionar Responder.',
];

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function pickN(arr, n) {
  const copy = [...arr];
  const out = [];
  for (let i = 0; i < n && copy.length > 0; i++) {
    const idx = Math.floor(Math.random() * copy.length);
    out.push(copy.splice(idx, 1)[0]);
  }
  return out;
}

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
  console.log(`Tournament:    ${TOURNAMENT_ID}`);
  console.log(`Mode:          ${CONFIRM ? 'CONFIRM' : 'DRY-RUN'}`);
  console.log('---');

  const matchTable = tableName('Match');
  const triviaTable = tableName('TriviaQuestion');
  const answersTable = tableName('TriviaAnswer');

  // 1) Scan matches del torneo
  const matches = await scanAll(matchTable, ['id', 'kickoffAt', 'tournamentId']);
  const tourMatches = matches.filter((m) => m.tournamentId === TOURNAMENT_ID);
  console.log(`\nMatches del torneo: ${tourMatches.length}`);

  // 2) Scan trivia + answers existentes
  const existingTrivia = await scanAll(triviaTable, ['id']);
  const existingAnswers = await scanAll(answersTable, ['id']);
  console.log(`Trivias existentes: ${existingTrivia.length}`);
  console.log(`Answers existentes: ${existingAnswers.length}`);

  console.log(`\nPlan: borrar ${existingTrivia.length} trivia + ${existingAnswers.length} answers, crear ${tourMatches.length * 4} trivia nuevas (4 por match).`);

  if (!CONFIRM) {
    console.log('\nDRY-RUN — corre con --confirm para aplicar.');
    return;
  }

  // 3) Borrar answers (dependen de trivia)
  if (existingAnswers.length > 0) {
    console.log('\nBorrando TriviaAnswer existentes…');
    const ok = await batchDelete(answersTable, existingAnswers, 'id');
    console.log(`\n  → borradas ${ok}/${existingAnswers.length}`);
  }

  // 4) Borrar trivia
  if (existingTrivia.length > 0) {
    console.log('\nBorrando TriviaQuestion existentes…');
    const ok = await batchDelete(triviaTable, existingTrivia, 'id');
    console.log(`\n  → borradas ${ok}/${existingTrivia.length}`);
  }

  // 5) Crear 4 trivia random por match
  console.log('\nCreando trivia random…');
  const now = new Date().toISOString();
  let created = 0;
  let withBrand = 0;
  for (const m of tourMatches) {
    const kickoffMs = Date.parse(m.kickoffAt);
    if (Number.isNaN(kickoffMs)) {
      console.warn(`  ! skip ${m.id}: kickoffAt inválido (${m.kickoffAt})`);
      continue;
    }
    for (let i = 1; i <= 4; i++) {
      const publishedMs = kickoffMs + i * 3 * 60_000;   // +3, +6, +9, +12 min
      const publishedAt = new Date(publishedMs).toISOString();
      const opts = pickN(OPTIONS_POOL, 4);
      const correctOption = pick(['A', 'B', 'C', 'D']);
      const useBrand = Math.random() < 0.5;
      let explanation;
      if (useBrand) {
        const sponsor = pick(SPONSORS);
        explanation = `[BRAND:${sponsor.name}:${sponsor.icon}] ${pick(EXPLANATIONS_PLAIN)}`;
        withBrand++;
      } else {
        explanation = pick(EXPLANATIONS_PLAIN);
      }
      const item = {
        id: randomUUID(),
        matchId: m.id,
        tournamentId: TOURNAMENT_ID,
        prompt: pick(PROMPTS),
        optionA: opts[0], optionB: opts[1], optionC: opts[2], optionD: opts[3],
        correctOption,
        publishedAt,
        timerSeconds: 120,
        explanation,
        createdAt: now,
        updatedAt: now,
      };
      try {
        await client.send(new PutCommand({ TableName: triviaTable, Item: item }));
        created++;
        if (created % 25 === 0) process.stdout.write('.');
      } catch (e) {
        console.error(`\n  ! create trivia para match ${m.id}: ${e.message}`);
      }
    }
  }
  console.log(`\n  → creadas ${created} trivia (${withBrand} con marca, ${created - withBrand} sin marca)`);
  console.log(`\nListo. Cada match tiene 4 trivia escalonadas a +3, +6, +9, +12 min de su kickoff.`);
}

main().catch((e) => { console.error('\nError:', e); process.exit(1); });
