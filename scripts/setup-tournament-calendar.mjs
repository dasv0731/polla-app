#!/usr/bin/env node
/**
 * setup-tournament-calendar.mjs
 *
 * Setup masivo de calendario de fase de grupos del Mundial 2026.
 *
 * Acciones:
 *   1) Por cada match del calendario: actualiza kickoffAt (local→UTC) + venue.
 *      Resetea status a SCHEDULED y limpia scores.
 *   2) Borra TriviaQuestion + TriviaAnswer existentes de los matches del plan.
 *   3) Crea 4 trivias por match con publishedAt = kickoff + {15,30,45,60}min,
 *      timer 120s. Contenido genérico ciclado entre 4 prompts (es test del
 *      flow/scheduling, no del contenido).
 *   4) Excepción Mex-SA (test fixture): kickoff = HOY 10 AM Guayaquil (UTC-5);
 *      las 4 trivias se publican al instante del kickoff (publishedAt = kickoff).
 *      Esto permite testear el flow del modal con todas las preguntas activas
 *      en cuanto el partido entra a estado LIVE.
 *
 * Uso:
 *   AWS_PROFILE=polla node scripts/setup-tournament-calendar.mjs --confirm
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

// ---- Constantes scheduling ----
const TIMER_SECONDS = 120;
const TRIVIA_OFFSETS_MIN = [15, 30, 45, 60];   // minutos post-kickoff

// ---- Mex-SA test fixture ----
const MEX_SA_HOME = 'mexico';
const MEX_SA_AWAY = 'sudafrica';
const MEX_SA_LOCAL_HOUR = 10;     // 10 AM Guayaquil
const MEX_SA_LOCAL_MIN = 0;
const TZ_GUAYAQUIL_HOURS = 5;     // UTC-5 (Ecuador, sin DST)

// ---- Venue → tz offset (horas al oeste de UTC, junio 2026 con DST activo) ----
//   US Eastern (EDT):  UTC-4 → Atlanta, Boston, Miami, Nueva Jersey,
//                              Philadelphia, Toronto
//   US Central (CDT):  UTC-5 → Dallas, Houston, Kansas City
//   US Pacific (PDT):  UTC-7 → Los Ángeles, San Francisco, Seattle, Vancouver
//   México (sin DST):  UTC-6 → Ciudad de México, Guadalajara, Monterrey
const VENUE_TZ = {
  'Atlanta': 4,
  'Boston': 4,
  'Ciudad de México': 6,
  'Dallas': 5,
  'Guadalajara': 6,
  'Houston': 5,
  'Kansas City': 5,
  'Los Ángeles': 7,
  'Miami': 4,
  'Monterrey': 6,
  'Nueva Jersey': 4,
  'Philadelphia': 4,
  'San Francisco': 7,
  'Seatle': 7,            // typo del calendario (Seattle)
  'Toronto': 4,
  'Vancouver': 7,
};

// ---- Calendario fase de grupos (3 jornadas × 24 partidos = 72) ----
// Formato: [home_slug, away_slug, 'YYYY-MM-DD', 'HH:MM' (local del venue), venue]
const CALENDAR = [
  // Jornada 1
  ['mexico', 'sudafrica', '2026-06-11', '14:00', 'Ciudad de México'],
  ['corea-del-sur', 'republica-checa', '2026-06-11', '21:00', 'Guadalajara'],
  ['canada', 'bosnia-herzegovina', '2026-06-12', '14:00', 'Toronto'],
  ['estados-unidos', 'paraguay', '2026-06-12', '20:00', 'Los Ángeles'],
  ['qatar', 'suiza', '2026-06-13', '14:00', 'San Francisco'],
  ['brasil', 'marruecos', '2026-06-13', '17:00', 'Nueva Jersey'],
  ['haiti', 'escocia', '2026-06-13', '20:00', 'Boston'],
  ['australia', 'turquia', '2026-06-13', '23:00', 'Vancouver'],
  ['alemania', 'curazao', '2026-06-14', '12:00', 'Houston'],
  ['paises-bajos', 'japon', '2026-06-14', '15:00', 'Dallas'],
  ['costa-de-marfil', 'ecuador', '2026-06-14', '18:00', 'Philadelphia'],
  ['suecia', 'tunez', '2026-06-14', '21:00', 'Monterrey'],
  ['espana', 'cabo-verde', '2026-06-15', '11:00', 'Atlanta'],
  ['belgica', 'egipto', '2026-06-15', '14:00', 'Seatle'],
  ['arabia-saudita', 'uruguay', '2026-06-15', '17:00', 'Miami'],
  ['iran', 'nueva-zelanda', '2026-06-15', '20:00', 'Los Ángeles'],
  ['francia', 'senegal', '2026-06-16', '14:00', 'Nueva Jersey'],
  ['irak', 'noruega', '2026-06-16', '17:00', 'Boston'],
  ['argentina', 'argelia', '2026-06-16', '20:00', 'Kansas City'],
  ['austria', 'jordania', '2026-06-16', '23:00', 'San Francisco'],
  ['portugal', 'republica-del-congo', '2026-06-17', '12:00', 'Houston'],
  ['inglaterra', 'croacia', '2026-06-17', '15:00', 'Dallas'],
  ['ghana', 'panama', '2026-06-17', '18:00', 'Toronto'],
  ['uzbekistan', 'colombia', '2026-06-17', '21:00', 'Ciudad de México'],
  // Jornada 2
  ['republica-checa', 'sudafrica', '2026-06-18', '11:00', 'Atlanta'],
  ['suiza', 'bosnia-herzegovina', '2026-06-18', '14:00', 'Los Ángeles'],
  ['canada', 'qatar', '2026-06-18', '17:00', 'Vancouver'],
  ['mexico', 'corea-del-sur', '2026-06-18', '20:00', 'Guadalajara'],
  ['estados-unidos', 'australia', '2026-06-19', '14:00', 'Seatle'],
  ['escocia', 'marruecos', '2026-06-19', '17:00', 'Boston'],
  ['brasil', 'haiti', '2026-06-19', '19:30', 'Philadelphia'],
  ['turquia', 'paraguay', '2026-06-19', '22:00', 'San Francisco'],
  ['paises-bajos', 'suecia', '2026-06-20', '12:00', 'Houston'],
  ['alemania', 'costa-de-marfil', '2026-06-20', '15:00', 'Toronto'],
  ['ecuador', 'curazao', '2026-06-20', '21:00', 'Kansas City'],
  ['tunez', 'japon', '2026-06-20', '23:00', 'Monterrey'],
  ['espana', 'arabia-saudita', '2026-06-21', '11:00', 'Atlanta'],
  ['belgica', 'iran', '2026-06-21', '14:00', 'Los Ángeles'],
  ['uruguay', 'cabo-verde', '2026-06-21', '17:00', 'Miami'],
  ['nueva-zelanda', 'egipto', '2026-06-21', '20:00', 'Vancouver'],
  ['argentina', 'austria', '2026-06-22', '12:00', 'Dallas'],
  ['francia', 'irak', '2026-06-22', '16:00', 'Philadelphia'],
  ['noruega', 'senegal', '2026-06-22', '19:00', 'Nueva Jersey'],
  ['jordania', 'argelia', '2026-06-22', '22:00', 'San Francisco'],
  ['portugal', 'uzbekistan', '2026-06-23', '12:00', 'Houston'],
  ['inglaterra', 'ghana', '2026-06-23', '15:00', 'Boston'],
  ['panama', 'croacia', '2026-06-23', '18:00', 'Toronto'],
  ['colombia', 'republica-del-congo', '2026-06-23', '21:00', 'Guadalajara'],
  // Jornada 3
  ['suiza', 'canada', '2026-06-24', '14:00', 'Vancouver'],
  ['bosnia-herzegovina', 'qatar', '2026-06-24', '14:00', 'Seatle'],
  ['marruecos', 'haiti', '2026-06-24', '17:00', 'Atlanta'],
  ['brasil', 'escocia', '2026-06-24', '17:00', 'Miami'],
  ['sudafrica', 'corea-del-sur', '2026-06-24', '20:00', 'Monterrey'],
  ['republica-checa', 'mexico', '2026-06-24', '20:00', 'Ciudad de México'],
  ['curazao', 'costa-de-marfil', '2026-06-25', '15:00', 'Philadelphia'],
  ['ecuador', 'alemania', '2026-06-25', '15:00', 'Nueva Jersey'],
  ['japon', 'suecia', '2026-06-25', '18:00', 'Dallas'],
  ['tunez', 'paises-bajos', '2026-06-25', '18:00', 'Kansas City'],
  ['paraguay', 'australia', '2026-06-25', '21:00', 'San Francisco'],
  ['turquia', 'estados-unidos', '2026-06-25', '21:00', 'Los Ángeles'],
  ['noruega', 'francia', '2026-06-26', '14:00', 'Boston'],
  ['senegal', 'irak', '2026-06-26', '14:00', 'Toronto'],
  ['cabo-verde', 'arabia-saudita', '2026-06-26', '19:00', 'Houston'],
  ['uruguay', 'espana', '2026-06-26', '19:00', 'Guadalajara'],
  ['egipto', 'iran', '2026-06-26', '22:00', 'Seatle'],
  ['nueva-zelanda', 'belgica', '2026-06-26', '22:00', 'Vancouver'],
  ['croacia', 'ghana', '2026-06-27', '16:00', 'Philadelphia'],
  ['panama', 'inglaterra', '2026-06-27', '16:00', 'Nueva Jersey'],
  ['colombia', 'portugal', '2026-06-27', '18:30', 'Miami'],
  ['republica-del-congo', 'uzbekistan', '2026-06-27', '18:30', 'Atlanta'],
  ['argelia', 'austria', '2026-06-27', '21:00', 'Kansas City'],
  ['jordania', 'argentina', '2026-06-27', '21:00', 'Dallas'],
];

// 4 prompts genéricos. Es test del flow + scheduling, no del contenido.
const GENERIC_PROMPTS = [
  { prompt: 'Pregunta de prueba 1: ¿Cuántas selecciones jugarán el Mundial 2026?',
    optA: '32', optB: '40', optC: '48', optD: '64', correct: 'C',
    expl: 'El Mundial 2026 será el primero con 48 selecciones.' },
  { prompt: 'Pregunta de prueba 2: ¿Qué país NO ha sido sede de un Mundial?',
    optA: 'Brasil', optB: 'Italia', optC: 'Australia', optD: 'Sudáfrica',
    correct: 'C',
    expl: 'Australia nunca ha sido sede de un Mundial de la FIFA.' },
  { prompt: 'Pregunta de prueba 3: ¿Quién ganó la primera Copa del Mundo (1930)?',
    optA: 'Brasil', optB: 'Uruguay', optC: 'Italia', optD: 'Argentina',
    correct: 'B',
    expl: 'Uruguay fue campeón del primer Mundial, jugado en su territorio.' },
  { prompt: 'Pregunta de prueba 4: ¿Quién es el máximo goleador histórico en Mundiales?',
    optA: 'Pelé', optB: 'Ronaldo Nazário', optC: 'Müller', optD: 'Klose',
    correct: 'D',
    expl: 'Miroslav Klose anotó 16 goles a lo largo de 4 Mundiales.' },
];

const SPONSORS = [
  null,                                    // sin marca
  { name: 'Coca-Cola', icon: '🥤' },
  { name: 'adidas', icon: '👟' },
  { name: 'Visa', icon: '💳' },
];

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

/** Convierte fecha local + 'HH:MM' + tz offset (horas) a ISO UTC.
 *  tzOffsetHours es positivo para tz al oeste de UTC (e.g. EDT = 4). */
function toUtcIso(date, timeStr, tzOffsetHours) {
  const [h, m] = timeStr.split(':').map(Number);
  const utcHour = h + tzOffsetHours;
  const dayOffset = Math.floor(utcHour / 24);
  const realHour = ((utcHour % 24) + 24) % 24;
  const base = new Date(`${date}T00:00:00.000Z`);
  base.setUTCDate(base.getUTCDate() + dayOffset);
  base.setUTCHours(realHour, m ?? 0, 0, 0);
  return base.toISOString();
}

/** Mex-SA fixture: hoy a las 10 AM Guayaquil → 15:00 UTC. */
function mexSaKickoffIso() {
  const today = new Date();
  const y = today.getUTCFullYear();
  const m = String(today.getUTCMonth() + 1).padStart(2, '0');
  const d = String(today.getUTCDate()).padStart(2, '0');
  const dateStr = `${y}-${m}-${d}`;
  const time = `${MEX_SA_LOCAL_HOUR}:${String(MEX_SA_LOCAL_MIN).padStart(2, '0')}`;
  return toUtcIso(dateStr, time, TZ_GUAYAQUIL_HOURS);
}

async function main() {
  console.log(`Region:        ${REGION}`);
  console.log(`Tournament:    ${TOURNAMENT_ID}`);
  console.log(`Mode:          ${CONFIRM ? 'CONFIRM' : 'DRY-RUN'}`);
  console.log(`Calendar size: ${CALENDAR.length} matches`);
  console.log('---');

  // 1) Cargar matches del torneo
  const allMatches = await scanAll(tableName('Match'),
    ['id', 'tournamentId', 'homeTeamId', 'awayTeamId']);
  const tourneyMatches = allMatches.filter((m) => m.tournamentId === TOURNAMENT_ID);
  console.log(`\nMatches del torneo en DB: ${tourneyMatches.length}`);

  // 2) Mapear cada entrada del calendario a matchId + kickoff UTC
  const planRows = [];
  const missing = [];
  for (const row of CALENDAR) {
    const [home, away, date, time, venue] = row;
    const tz = VENUE_TZ[venue];
    if (tz === undefined) {
      console.error(`  ! Venue sin tz: "${venue}" — skip ${home} vs ${away}`);
      continue;
    }
    const target = tourneyMatches.find((m) =>
      (m.homeTeamId === home && m.awayTeamId === away) ||
      (m.homeTeamId === away && m.awayTeamId === home),
    );
    if (!target) {
      missing.push(`${home} vs ${away}`);
      continue;
    }
    const isMexSA = (home === MEX_SA_HOME && away === MEX_SA_AWAY) ||
                    (home === MEX_SA_AWAY && away === MEX_SA_HOME);
    const kickoff = isMexSA ? mexSaKickoffIso() : toUtcIso(date, time, tz);
    planRows.push({ matchId: target.id, home, away, kickoff, venue, isMexSA });
  }

  if (missing.length > 0) {
    console.error(`\n! ${missing.length} match(es) del calendario sin contraparte en DB:`);
    for (const m of missing) console.error(`    ${m}`);
  }
  console.log(`\nPlan: actualizar ${planRows.length} matches + crear ${planRows.length * 4} trivias`);

  // Mostrar Mex-SA preview
  const mexSa = planRows.find((p) => p.isMexSA);
  if (mexSa) {
    console.log(`\nMex-SA fixture:`);
    console.log(`  matchId:  ${mexSa.matchId}`);
    console.log(`  kickoff:  ${mexSa.kickoff}  (hoy 10 AM Guayaquil)`);
    console.log(`  trivias:  4 publicadas al instante del kickoff`);
  }

  if (!CONFIRM) {
    console.log('\nDRY-RUN — corre con --confirm para aplicar.');
    return;
  }

  // 3) Borrar TriviaQuestion + TriviaAnswer existentes
  const planMatchIds = new Set(planRows.map((p) => p.matchId));

  const allTrivias = await scanAll(tableName('TriviaQuestion'), ['id', 'matchId']);
  const triviasToDelete = allTrivias.filter((t) => planMatchIds.has(t.matchId));
  if (triviasToDelete.length > 0) {
    console.log(`\nBorrando ${triviasToDelete.length} trivia(s) existentes…`);
    for (let i = 0; i < triviasToDelete.length; i += 25) {
      const chunk = triviasToDelete.slice(i, i + 25);
      const requests = chunk.map((t) => ({ DeleteRequest: { Key: { id: t.id } } }));
      await client.send(new BatchWriteCommand({
        RequestItems: { [tableName('TriviaQuestion')]: requests },
      }));
    }
  }

  const allAnswers = await scanAll(tableName('TriviaAnswer'), ['id', 'matchId']);
  const answersToDelete = allAnswers.filter((a) => planMatchIds.has(a.matchId));
  if (answersToDelete.length > 0) {
    console.log(`Borrando ${answersToDelete.length} respuesta(s) existentes…`);
    for (let i = 0; i < answersToDelete.length; i += 25) {
      const chunk = answersToDelete.slice(i, i + 25);
      const requests = chunk.map((a) => ({ DeleteRequest: { Key: { id: a.id } } }));
      await client.send(new BatchWriteCommand({
        RequestItems: { [tableName('TriviaAnswer')]: requests },
      }));
    }
  }

  // 4) Update kickoff/venue + create 4 trivias por match
  console.log(`\nActualizando ${planRows.length} matches y creando trivias…`);
  let updatedMatches = 0;
  let createdTrivias = 0;
  const now = new Date().toISOString();

  for (const p of planRows) {
    await client.send(new UpdateCommand({
      TableName: tableName('Match'),
      Key: { id: p.matchId },
      UpdateExpression: 'SET #status = :s, kickoffAt = :k, venue = :v, pointsCalculated = :pc REMOVE homeScore, awayScore',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: { ':s': 'SCHEDULED', ':k': p.kickoff, ':v': p.venue, ':pc': false },
    }));
    updatedMatches++;

    const kickoffMs = Date.parse(p.kickoff);
    for (let i = 0; i < 4; i++) {
      const offsetMin = p.isMexSA ? 0 : TRIVIA_OFFSETS_MIN[i];
      const publishedAt = new Date(kickoffMs + offsetMin * 60_000).toISOString();
      const promptDef = GENERIC_PROMPTS[i % GENERIC_PROMPTS.length];
      const sponsor = SPONSORS[i % SPONSORS.length];
      const explanation = sponsor
        ? `[BRAND:${sponsor.name}:${sponsor.icon}] ${promptDef.expl}`
        : promptDef.expl;
      const item = {
        id: randomUUID(),
        matchId: p.matchId,
        tournamentId: TOURNAMENT_ID,
        prompt: promptDef.prompt,
        optionA: promptDef.optA,
        optionB: promptDef.optB,
        optionC: promptDef.optC,
        optionD: promptDef.optD,
        correctOption: promptDef.correct,
        publishedAt,
        timerSeconds: TIMER_SECONDS,
        explanation,
        createdAt: now,
        updatedAt: now,
      };
      await client.send(new PutCommand({
        TableName: tableName('TriviaQuestion'),
        Item: item,
      }));
      createdTrivias++;
    }
  }

  // 5) Verificación post-write
  const verifyTrivias = await scanAll(tableName('TriviaQuestion'), ['id', 'matchId']);
  const verifyForPlan = verifyTrivias.filter((t) => planMatchIds.has(t.matchId)).length;

  console.log(`\n────────────────────────────────────────`);
  console.log(`✓ ${updatedMatches} matches actualizados (kickoff + venue)`);
  console.log(`✓ ${createdTrivias} trivias creadas (esperado: ${planRows.length * 4})`);
  console.log(`✓ Verificación: ${verifyForPlan} trivias en DB para matches del plan`);
  if (mexSa) {
    console.log(`\nMex-SA → kickoff: ${mexSa.kickoff} (LIVE si pasaste de 10 AM Guayaquil)`);
  }
}

main().catch((e) => { console.error('\nError:', e); process.exit(1); });
