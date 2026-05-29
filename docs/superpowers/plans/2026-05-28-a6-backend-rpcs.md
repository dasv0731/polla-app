# A6 · Backend RPCs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **All sub-agent dispatches MUST use opus 4.7** per project memory.

**Goal:** Implementar las lambdas + mutations + models requeridos por las decisiones de producto del walkthrough UX. Reduce N+1 calls (right-rail), expone data faltante (preview maxMembers, tournament, stats públicos), agrega features pendientes (leaveGroup, notif kinds, RankSnapshot). **Backend trabajo separado** — vive en repo polla-backend (Amplify Gen 2), NO en polla-app.

**Architecture:** Cada item es una mutation/query/model independiente. Implementados en `polla-backend/amplify/` con Amplify Gen 2 schema + custom resolvers. Frontend (polla-app) consume via apiClient + `generateClient<Schema>()`. Sandbox deploy verifica cada lambda antes de prod merge.

**Tech Stack:** Amplify Gen 2 (TypeScript) + DynamoDB + AppSync GraphQL + Cognito. Tests integración via Vitest contra sandbox.

---

## File Structure

**Repo separado**: `polla-backend/` (sibling de polla-app per project memory).

**Create/Modify** in polla-backend:
- `amplify/data/resource.ts` — extend schema con nuevos fields + types + mutations
- `amplify/functions/preview-join-code/handler.ts` — extend con createdAt + maxMembers + tournamentCode
- `amplify/functions/get-my-right-rail/handler.ts` (NEW) — consolidated lambda
- `amplify/functions/get-public-stats/handler.ts` (NEW) — aggregates
- `amplify/functions/leave-group/handler.ts` (NEW)
- `amplify/functions/rank-snapshot-weekly/handler.ts` (NEW) — scheduled job
- `amplify/functions/avatar-url-resolver/handler.ts` (NEW) — long-lived URLs

**Modify in polla-app** (frontend consumers — after backend deployed):
- `src/app/core/api/api.service.ts` — add new RPC methods
- Consumers updated in A7 (auth family) + A8 (surfaces) tasks.

---

## Backend tasks (12 tasks)

### Task 1: Extend previewJoinCode lambda

**Files:**
- Modify: `polla-backend/amplify/functions/preview-join-code/handler.ts`
- Modify: `polla-backend/amplify/data/resource.ts` (extend response type)

- [ ] **Step 1: Extend response shape**

Update GraphQL schema return type:

```typescript
// In resource.ts schema definition
previewJoinCode: a
  .mutation()
  .arguments({ code: a.string().required() })
  .returns(a.customType({
    ok: a.boolean().required(),
    message: a.string(),
    groupId: a.string(),
    groupName: a.string(),
    ownerHandle: a.string(),
    memberCount: a.integer().required(),
    alreadyMember: a.boolean().required(),
    // NEW fields
    createdAt: a.datetime(),
    maxMembers: a.integer(),
    tournamentCode: a.string(),
  })),
```

- [ ] **Step 2: Update handler**

In handler.ts, after fetching group from DynamoDB:

```typescript
return {
  ok: true,
  groupId: group.id,
  groupName: group.name,
  ownerHandle: ownerUser?.handle ?? '—',
  memberCount: members.length,
  alreadyMember: !!members.find(m => m.userId === userSub),
  createdAt: group.createdAt,
  maxMembers: group.maxMembers ?? 30,  // backend constant or field
  tournamentCode: group.tournamentId,
};
```

- [ ] **Step 3: Sandbox deploy + integration test**

```bash
npx ampx sandbox
# in new terminal:
npm test -- preview-join-code.test.ts
```

Test should call mutation and verify new fields present.

- [ ] **Step 4: Commit**

```bash
git add amplify/
git commit -m "feat(preview-join-code): expose createdAt + maxMembers + tournamentCode

A6.1 backend extension. Allows frontend group-join page to display
real data instead of hardcoded values (MAX_MEMBERS=30, WC26 string).

Refs: docs/ux-redesign/20-group-join.md"
```

---

### Task 2: getMyRightRail consolidated lambda

**Files:**
- Create: `polla-backend/amplify/functions/get-my-right-rail/handler.ts`
- Modify: `polla-backend/amplify/data/resource.ts`

- [ ] **Step 1: Define schema**

```typescript
getMyRightRail: a
  .query()
  .returns(a.customType({
    nextMatch: a.customType({
      id: a.string().required(),
      homeTeamId: a.string().required(),
      awayTeamId: a.string().required(),
      homeName: a.string().required(),
      awayName: a.string().required(),
      homeFlag: a.string(),
      awayFlag: a.string(),
      kickoffAt: a.datetime().required(),
      venue: a.string(),
      phaseLabel: a.string().required(),
      status: a.string().required(),
      myPick: a.customType({
        homeScorePred: a.integer().required(),
        awayScorePred: a.integer().required(),
      }),
    }),
    upcomingPicks: a.customType({
      id: a.string().required(),
      kickoffAt: a.datetime().required(),
      homeName: a.string().required(),
      awayName: a.string().required(),
      hasPick: a.boolean().required(),
      pickHome: a.integer(),
      pickAway: a.integer(),
    }).array(),
    news: a.customType({
      id: a.string().required(),
      title: a.string().required(),
      externalUrl: a.string().required(),
      imageUrl: a.string(),  // pre-resolved long-lived URL
      publishedAt: a.datetime().required(),
    }).array(),
  }))
  .authorization((allow) => [allow.authenticated()]),
```

- [ ] **Step 2: Implement handler**

In handler.ts:
1. Read userSub from event.identity.sub.
2. Fetch next match (filter status != 'FINAL', sort by kickoffAt asc, take 1).
3. Fetch upcoming picks (4 next matches after next, with user's pick if exists).
4. Fetch published articles (4 latest, with pre-resolved S3 URLs).
5. Return consolidated.

Implementation skeleton:

```typescript
import type { Handler } from 'aws-lambda';
import { DynamoDB } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocument } from '@aws-sdk/lib-dynamodb';
import { S3 } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export const handler: Handler = async (event) => {
  const userSub = event.identity?.sub;
  if (!userSub) throw new Error('Unauthorized');

  const ddb = DynamoDBDocument.from(new DynamoDB({}));

  // Fetch matches + teams + picks in parallel
  const [matchesRes, teamsRes, picksRes, articlesRes] = await Promise.all([
    ddb.query({ TableName: process.env.MATCHES_TABLE, /* ... */ }),
    ddb.scan({ TableName: process.env.TEAMS_TABLE }),
    ddb.query({ TableName: process.env.PICKS_TABLE, KeyConditionExpression: 'userId = :u', ExpressionAttributeValues: { ':u': userSub } }),
    ddb.scan({ TableName: process.env.ARTICLES_TABLE, FilterExpression: 'attribute_exists(publishedAt)' }),
  ]);

  // Build teamMap + pickMap for O(1) lookup
  // Pre-resolve S3 image URLs (long-lived signed if needed)
  // Compose response

  return { nextMatch, upcomingPicks, news };
};
```

- [ ] **Step 3: Sandbox deploy + test**

```bash
npx ampx sandbox
# test via Amplify Studio GraphQL playground or curl
```

- [ ] **Step 4: Commit**

```bash
git add amplify/
git commit -m "feat(get-my-right-rail): consolidated lambda for right-rail data

A6.2. Reduces frontend from 5+ calls + N×getUrl to 1 call. Returns
nextMatch + upcomingPicks + news (with pre-resolved imageUrls).

Refs: docs/ux-redesign/32-right-rail.md (N+1 documented)"
```

---

### Task 3: getPublicStats lambda

**Files:**
- Create: `polla-backend/amplify/functions/get-public-stats/handler.ts`
- Modify: `polla-backend/amplify/data/resource.ts`

- [ ] **Step 1: Schema**

```typescript
getPublicStats: a
  .query()
  .returns(a.customType({
    totalUsers: a.integer().required(),
    totalGroups: a.integer().required(),
    totalPrizesAccrued: a.float(),  // in USD or accumulated representation
  }))
  .authorization((allow) => [allow.publicApiKey(), allow.authenticated()]),
```

- [ ] **Step 2: Handler with cache**

```typescript
import { DynamoDB } from '@aws-sdk/client-dynamodb';

// Cache for 1 hour
let cache: { totalUsers: number; totalGroups: number; totalPrizesAccrued: number; expires: number } | null = null;

export const handler: Handler = async () => {
  if (cache && cache.expires > Date.now()) {
    return { totalUsers: cache.totalUsers, totalGroups: cache.totalGroups, totalPrizesAccrued: cache.totalPrizesAccrued };
  }

  const ddb = new DynamoDB({});
  // Count users + groups + sum prizes
  const totalUsers = (await ddb.scan({ TableName: process.env.USERS_TABLE, Select: 'COUNT' })).Count ?? 0;
  const totalGroups = (await ddb.scan({ TableName: process.env.GROUPS_TABLE, Select: 'COUNT' })).Count ?? 0;
  const totalPrizesAccrued = 0;  // TODO sum from groups.prizes if numeric

  cache = { totalUsers, totalGroups, totalPrizesAccrued, expires: Date.now() + 3600 * 1000 };
  return { totalUsers, totalGroups, totalPrizesAccrued };
};
```

- [ ] **Step 3: Sandbox deploy + test**

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(get-public-stats): aggregate public stats lambda (1h cache)

A6.3. Replaces hardcoded stats (2.4k/180/$15k) in auth brand panels
with real backend counts. Cached 1h to avoid scan-per-request.

Refs: docs/ux-redesign/17-login.md, 18-register.md, 19-forgot-password.md"
```

---

### Task 4: leaveGroup mutation

**Files:**
- Create: `polla-backend/amplify/functions/leave-group/handler.ts`
- Modify: `polla-backend/amplify/data/resource.ts`

- [ ] **Step 1: Schema**

```typescript
leaveGroup: a
  .mutation()
  .arguments({ groupId: a.string().required() })
  .returns(a.customType({
    ok: a.boolean().required(),
    message: a.string(),
  }))
  .authorization((allow) => [allow.authenticated()]),
```

- [ ] **Step 2: Handler**

```typescript
export const handler: Handler = async (event) => {
  const userSub = event.identity?.sub;
  const { groupId } = event.arguments;
  if (!userSub || !groupId) return { ok: false, message: 'Missing params' };

  const ddb = DynamoDBDocument.from(new DynamoDB({}));

  // Verify membership exists
  const member = await ddb.get({ TableName: process.env.GROUP_MEMBERS_TABLE, Key: { groupId, userId: userSub } });
  if (!member.Item) return { ok: false, message: 'Not a member' };

  // Prevent admin from leaving without transfer
  const group = await ddb.get({ TableName: process.env.GROUPS_TABLE, Key: { id: groupId } });
  if (group.Item?.adminUserId === userSub) {
    return { ok: false, message: 'Admin debe transferir admin antes de abandonar.' };
  }

  // Delete member row + reset their score in group (per walkthrough doc 09)
  await ddb.delete({ TableName: process.env.GROUP_MEMBERS_TABLE, Key: { groupId, userId: userSub } });

  return { ok: true };
};
```

- [ ] **Step 3: Sandbox + test**

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(leave-group): mutation for non-admin member abandon

A6.4. Documented pending in walkthrough memory. Score reset per
doc 09 spec ('si abandonas, tu score acumulado en este grupo se borra').
Admin must transfer admin role first (separate flow).

Refs: docs/ux-redesign/09-group-detail.md"
```

---

### Task 5: RankSnapshot model + weekly job

**Files:**
- Modify: `polla-backend/amplify/data/resource.ts` (add model)
- Create: `polla-backend/amplify/functions/rank-snapshot-weekly/handler.ts`
- Modify: `polla-backend/amplify/functions/rank-snapshot-weekly/resource.ts` (schedule)

- [ ] **Step 1: Define model**

```typescript
// In resource.ts
RankSnapshot: a.model({
  scope: a.string().required(),  // 'global' or `group:${groupId}`
  userId: a.string().required(),
  weekStart: a.date().required(),
  rank: a.integer().required(),
  totalPoints: a.integer().required(),
}).identifier(['scope', 'userId', 'weekStart'])
  .authorization((allow) => [allow.authenticated().to(['read'])]),
```

- [ ] **Step 2: Scheduled function**

```typescript
// rank-snapshot-weekly/resource.ts
import { defineFunction } from '@aws-amplify/backend';
export const rankSnapshotWeekly = defineFunction({
  name: 'rank-snapshot-weekly',
  schedule: 'every week',  // Mondays 00:00 UTC
});
```

```typescript
// rank-snapshot-weekly/handler.ts
import type { ScheduledHandler } from 'aws-lambda';

export const handler: ScheduledHandler = async () => {
  const ddb = DynamoDBDocument.from(new DynamoDB({}));

  // For global scope: scan Users + sort by totalPoints
  // For each group scope: scan group members + their points
  // Write RankSnapshot rows with weekStart = monday of this week

  const now = new Date();
  const dayOfWeek = now.getDay();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - dayOfWeek + 1);  // Monday
  weekStart.setUTCHours(0, 0, 0, 0);
  const weekStartISO = weekStart.toISOString().slice(0, 10);

  // ... compute rankings + batch write
};
```

- [ ] **Step 3: Sandbox + test**

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(rank-snapshot): weekly job + RankSnapshot model

A6.5. Documented pending in walkthrough. Enables 'delta semanal' UX
in /ranking + /groups/:id that's currently using localStorage fallback
(semi-mentira per doc 07).

Refs: docs/ux-redesign/07-ranking.md, 09-group-detail.md"
```

---

### Task 6: Notif kinds expansion

**Files:**
- Modify: `polla-backend/amplify/data/resource.ts` — extend Notification.kind enum
- Modify: notification creation lambdas (admin actions, system events)

- [ ] **Step 1: Extend kind enum**

```typescript
Notification: a.model({
  // existing fields...
  kind: a.enum(['COMODIN_PENDING', 'COMODIN_EXPIRING', 'COMODIN_ACTIVATED', /* existing */,
    'JOIN',           // member joined a group user is admin of
    'MATCH_LIVE',     // a match user has a pick in is starting
    'RANK_CHANGED',   // rank shifted in any group
    'GROUP_ACTIVITY', // consolidated "X new picks in Group Y"
  ]),
  // ...
}),
```

- [ ] **Step 2: Triggers**

- JOIN: in joinGroup mutation, after member added, create Notification for adminUserId.
- MATCH_LIVE: EventBridge schedule that triggers 15 min before kickoff per match. Lambda fans out notifications.
- RANK_CHANGED: in rank-snapshot-weekly, compare to previous week's snapshot. If rank changed for a user in a group, create Notification.
- GROUP_ACTIVITY: in pick save mutations, batch into per-group activity feed; debounce 1h.

- [ ] **Step 3: Sandbox + test**

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(notif): expand kinds to JOIN/MATCH_LIVE/RANK_CHANGED/GROUP_ACTIVITY

A6.6. Documented pending in walkthrough memory. Unlocks promesa
'Te avisamos cuando alguien se una' en group-invite (doc 12) + engagement
features across surfaces.

Refs: docs/ux-redesign/16-notifications.md"
```

---

### Task 7: Avatar URL persistence

**Files:**
- Create: `polla-backend/amplify/functions/avatar-url-resolver/handler.ts`
- Modify: `polla-backend/amplify/data/resource.ts` — add avatarUrl field (resolver-backed)

**Strategy**: Add `avatarUrl` field to User model that's computed via resolver returning a long-lived presigned URL (24-hour expiry or CDN-cached).

- [ ] **Step 1: Resolver**

```typescript
// In User model, add resolver field
avatarUrl: a.string().resolver(/* ... */)
```

- [ ] **Step 2: Implementation**

Resolver lambda: get avatarKey from User row, sign URL with 24h expiry (or use CloudFront if configured). Cache result in DynamoDB for fast retrieval.

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(avatar-url): long-lived avatar URL via resolver

A6.7. Frontend currently uses getUrl({ expiresIn: 3600 }) every render
which: (a) breaks if tab open >1h, (b) N+1 calls. Backend pre-signs
24h URLs.

Refs: docs/ux-redesign/26-edit-profile-modal.md, 32-right-rail.md"
```

---

### Tasks 8-12: Integration testing + frontend hookup

After all backend functions deployed to sandbox:

### Task 8: Update polla-app ApiService methods

**Files** (polla-app, not polla-backend):
- Modify: `src/app/core/api/api.service.ts` — add new methods for previewJoinCode extended, getMyRightRail, getPublicStats, leaveGroup, etc.

Add typed methods that call the new mutations/queries.

### Task 9: Right-rail consume getMyRightRail

**Files:**
- Modify: `src/app/shared/layout/right-rail.component.ts` — replace 5+ calls with single `getMyRightRail`.

Done as part of A8d (micro-surfaces) usually, but if A6 completes first can be done immediately.

### Task 10: Auth panels consume getPublicStats

**Files:**
- Modify: `src/app/features/auth/login.component.ts` (brand panel)
- Modify: `src/app/features/auth/register.component.ts`
- Modify: `src/app/features/auth/forgot-password.component.ts`

Done as part of A7 (auth family redesign).

### Task 11: Group-join consume previewJoinCode extended

**Files:**
- Modify: `src/app/features/groups/group-join.component.ts` — render real createdAt + maxMembers + tournamentCode.

Done as part of A7 (auth family) since group-join is in auth chain.

### Task 12: Final verification

- All sandbox deploys succeed
- Integration tests pass per lambda
- Frontend builds against new schema (npm install @aws-amplify/data + regenerate types if needed)

```bash
git commit --allow-empty -m "chore(a6): A6 backend RPCs complete

Summary:
- previewJoinCode extended (createdAt, maxMembers, tournamentCode)
- getMyRightRail consolidated (1 call vs 5+)
- getPublicStats lambda with 1h cache
- leaveGroup mutation
- RankSnapshot model + weekly scheduled job
- Notif kinds: JOIN, MATCH_LIVE, RANK_CHANGED, GROUP_ACTIVITY
- avatarUrl resolver (24h persistent vs 1h getUrl)

Sandbox deploy: success.
Integration tests: passing.

Frontend hookup pending in A7 (auth/right-rail) + A8 (other surfaces).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Summary

A6 produce 12 commits en polla-backend repo + final verification commit. Frontend hookups happen during A7 + A8.

**Dependency**: NONE strict (separate repo).

**Sub-proyectos downstream que se benefician**:
- A7 auth family — getPublicStats + extended previewJoinCode + leaveGroup
- A8d right-rail — getMyRightRail single-call refactor
- A8 cross-cutting — notif kinds for various features

**Estimación**: ~2 semanas (12 tasks, each requires sandbox deploy + integration test).

**Dispatch strategy**: 1 sub-agente opus 4.7 trabajando en polla-backend repo separado. Or split into 2: one for schema+functions (Tasks 1-7) + one for frontend hookup (Tasks 8-12).

**Note**: Frontend changes in Tasks 8-11 are placeholder reminders — actual implementation is during A7 + A8 plans. A6 plan focuses on backend.
