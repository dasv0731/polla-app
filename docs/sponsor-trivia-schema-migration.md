# Migración: campo `sponsorId` en `TriviaQuestion`

## Por qué

Actualmente, la asociación de una pregunta de trivia con un sponsor
(para mostrar el modal `trivia-modal--marca` con header rojo y footer
"patrocinada por X") se serializa como prefijo del campo `explanation`:

```
[BRAND:Coca-Cola:🥤] El resto de la explicación de la trivia.
```

Es una convención temporal — funciona pero ensucia el campo
`explanation` y no permite consultar trivias por sponsor. La solución
correcta es agregar un campo `sponsorId` opcional al modelo
`TriviaQuestion` que apunte al modelo `Sponsor` ya existente.

## Cambios en el backend (`amplify/data/resource.ts`)

Agregá el campo `sponsorId` al modelo `TriviaQuestion`. Ejemplo
aproximado (ajustá nombre/forma a tu schema actual):

```ts
TriviaQuestion: a.model({
  matchId:       a.string().required(),
  tournamentId:  a.string().required(),
  prompt:        a.string().required(),
  optionA:       a.string().required(),
  optionB:       a.string().required(),
  optionC:       a.string().required(),
  optionD:       a.string().required(),
  correctOption: a.enum(['A', 'B', 'C', 'D']),
  publishedAt:   a.datetime().required(),
  timerSeconds:  a.integer().default(120),
  explanation:   a.string(),

  // ↓ nuevo
  sponsorId:     a.string(),                  // FK suelta al model Sponsor
  // (no usamos a.belongsTo() porque Sponsor no es propietario de la
  //  pregunta — la trivia existe sin sponsor cuando es "sin marca")
})
.secondaryIndexes((idx) => [
  idx('matchId').queryField('triviaByMatch'),
  idx('tournamentId').queryField('triviaByTournament'),
  idx('sponsorId').queryField('triviaBySponsor'),  // ← nuevo, opcional
])
.authorization((allow) => [
  allow.authenticated().to(['read']),
  allow.groups(['admins']).to(['create', 'update', 'delete']),
]);
```

Después del cambio, deployá:

```sh
cd <tu-amplify-backend>
npx ampx sandbox    # para sandbox
# o
npx ampx pipeline-deploy --branch main --app-id …  # producción
```

## Migración de datos existentes (one-shot)

Si ya hay preguntas creadas con la convención `[BRAND:nombre:icono]`,
hay que pasarlas al nuevo campo `sponsorId`. Script Node sugerido
(corré local con AWS creds):

```js
// scripts/migrate-trivia-sponsor-prefix.mjs
import { generateClient } from 'aws-amplify/api';
import { Amplify } from 'aws-amplify';
import outputs from '../amplify_outputs.json' with { type: 'json' };

Amplify.configure(outputs);
const client = generateClient({ authMode: 'userPool' });
// (necesita un id-token de admin smoketest, ver scripts/README.md)

const { data: triviaList } = await client.models.TriviaQuestion.list({ limit: 1000 });
const { data: sponsors }   = await client.models.Sponsor.list({ limit: 200 });

const sponsorByName = new Map(sponsors.map((s) => [s.name.toLowerCase(), s]));

for (const q of triviaList) {
  if (!q.explanation) continue;
  const m = q.explanation.match(/^\s*\[BRAND:([^:\]]+):([^\]]+)\]\s*(.*)$/s);
  if (!m) continue;
  const sponsorName = m[1].trim();
  const cleanRest   = m[3].trim();
  const sponsor = sponsorByName.get(sponsorName.toLowerCase());
  if (!sponsor) {
    console.warn(`Sponsor "${sponsorName}" no existe en el modelo Sponsor — saltando ${q.id}`);
    continue;
  }
  await client.models.TriviaQuestion.update({
    id: q.id,
    sponsorId: sponsor.id,
    explanation: cleanRest || null,
  });
  console.log(`✓ ${q.id} → sponsor ${sponsor.name}`);
}
```

## Cambios en el front-end (después del deploy)

Tres archivos tocan la convención de prefijo. Cuando el campo
`sponsorId` esté en producción, hay que pasar a leerlo:

### 1. `src/app/features/trivia/trivia-popup.component.ts`

Reemplazá `parseSponsor(explanation)` por una resolución directa contra
el modelo Sponsor:

```ts
// ANTES (parser de prefijo):
const parsed = parseSponsor(q.explanation);
collected.push({ ..., sponsor: parsed.sponsor, cleanExplanation: parsed.cleanExplanation });

// DESPUÉS:
const sponsor = q.sponsorId
  ? this.sponsorMap.get(q.sponsorId) ?? null
  : null;
collected.push({ ..., sponsor, cleanExplanation: q.explanation ?? '' });
```

Donde `sponsorMap` es un `Map<sponsorId, { name, icon }>` cargado
una vez en `ngOnInit` con `api.listSponsors()`. El campo `icon` no
existe en el modelo `Sponsor` — habría que agregarlo (ej.
`a.string()` opcional) o seguir manejándolo como string vacío y caer
a un emoji default (🎁) en el modal.

### 2. `src/app/features/admin/admin-trivia.component.ts`

El form ya tiene un select de sponsor + campo icono. Hoy los
serializa como prefijo en `explanation`. Cambialo a:

```ts
// ANTES:
explanation: buildExplanation(this.form.explanation, this.form.sponsorName, this.form.sponsorIcon),

// DESPUÉS:
explanation: this.form.explanation.trim() || null,
sponsorId:   this.sponsors().find((s) => s.name === this.form.sponsorName)?.id ?? null,
```

Y en `startEdit`, reemplazá `parseSponsorPrefix` por:

```ts
const sponsor = q.sponsorId
  ? this.sponsors().find((s) => s.id === q.sponsorId)
  : null;
this.form = {
  ...
  explanation: q.explanation ?? '',
  sponsorName: sponsor?.name ?? '',
  sponsorIcon: '🎁',  // o leer de un campo Sponsor.icon si lo agregás
};
```

### 3. `src/app/features/picks/picks-list.component.ts`

Hay un helper `parseSponsor` al final del archivo que hace lo mismo.
Reemplazá `triviaInfo()` para resolver via `sponsorId`:

```ts
triviaInfo(matchId: string): TriviaInfo | null {
  const list = this.triviaByMatch().get(matchId);
  if (!list || list.length === 0) return null;
  const first = list[0];
  const sponsor = first.sponsorId
    ? this.sponsorMap.get(first.sponsorId)
    : null;
  // … resto igual
}
```

Y eliminá el helper `parseSponsor` al final del archivo (ya no se usa).

## Plan de cutover sugerido

1. Aplicar el cambio de schema en sandbox.
2. Verificar que `client.models.TriviaQuestion.create({ sponsorId: '…' })` funciona.
3. Deployar a producción.
4. Correr el script de migración de datos.
5. Hacer un PR con los 3 cambios de front-end juntos (una sola tanda).
6. Verificar en producción que las preguntas patrocinadas siguen
   mostrando el modal `trivia-modal--marca` correctamente.
7. Borrar el helper `parseSponsor` y el comentario `[BRAND:…]` de
   admin-trivia.

## Por qué no lo hago automático en este repo

El backend Amplify (`amplify/data/resource.ts` etc.) **no vive en este
repo** — solo está el output `amplify_outputs.json`. La migración tiene
que hacerse en el repo del backend. El front-end ya está preparado para
recibir `sponsorId` (tipos quedaron `as any` accesibles), solo falta
swappear el parser por la resolución directa.
