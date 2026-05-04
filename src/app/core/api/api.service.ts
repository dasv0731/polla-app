import { Injectable } from '@angular/core';
import { apiClient } from './client';

type SpecialType = 'CHAMPION' | 'RUNNER_UP' | 'DARK_HORSE';

@Injectable({ providedIn: 'root' })
export class ApiService {
  // ----- Public reads (API key) -----
  listTournaments() {
    return apiClient.models.Tournament.list({ authMode: 'apiKey' });
  }
  listMatches(tournamentId: string) {
    return apiClient.models.Match.list({
      filter: { tournamentId: { eq: tournamentId } },
      authMode: 'apiKey',
    });
  }
  getMatch(id: string) {
    // apiKey because Match.read is allowed only via publicApiKey (same auth
    // mode listMatches uses). Without it the Cognito-default request hits the
    // model authz, returns data:null, and the edit form pre-fill goes blank.
    return apiClient.models.Match.get({ id }, { authMode: 'apiKey' });
  }
  listLeaderboard(tournamentId: string, limit = 100) {
    return apiClient.models.UserTournamentTotal.list({
      filter: { tournamentId: { eq: tournamentId } },
      limit,
    });
  }

  // ----- Single-item reads -----
  getTournament(slug: string) {
    return apiClient.models.Tournament.get({ slug }, { authMode: 'apiKey' });
  }
  getGroup(id: string) {
    return apiClient.models.Group.get({ id });
  }
  getInviteCode(code: string) {
    return apiClient.models.InviteCode.get({ code });
  }
  getUserByHandle(handle: string) {
    return apiClient.models.User.list({
      filter: { handle: { eq: handle } },
      authMode: 'apiKey',
      limit: 1,
    });
  }
  getUser(sub: string) {
    return apiClient.models.User.get({ sub });
  }
  /**
   * Lista todos los users paginando vía nextToken. Amplify Gen2 cap por
   * página es ~100 — un solo `list({ limit: 1000 })` solo devuelve la
   * primera página y deja afuera los users registrados después de los
   * primeros 100. Acá iteramos hasta agotar nextToken.
   */
  async listUsers(maxTotal = 5000) {
    type Row = Awaited<ReturnType<typeof apiClient.models.User.list>>['data'][number];
    const allItems: Row[] = [];
    let nextToken: string | null | undefined = undefined;
    do {
      const res = await apiClient.models.User.list({ limit: 100, nextToken });
      if (res.errors && res.errors.length > 0) {
        return { data: allItems, errors: res.errors };
      }
      allItems.push(...(res.data ?? []));
      nextToken = res.nextToken;
      if (allItems.length >= maxTotal) break;
    } while (nextToken);
    return { data: allItems };
  }
  // ----- Sponsors / códigos de canje -----
  listSponsors(limit = 200) {
    return apiClient.models.Sponsor.list({ limit });
  }
  getSponsor(id: string) {
    return apiClient.models.Sponsor.get({ id });
  }
  createSponsor(input: {
    name: string;
    maxRedemptionsPerUser?: number;
    banner1?: string | null;
    banner2?: string | null;
    banner3?: string | null;
    bannerKeys?: string[];      // legacy, opcional
  }) {
    return apiClient.models.Sponsor.create({
      name: input.name,
      maxRedemptionsPerUser: input.maxRedemptionsPerUser ?? 1,
      banner1: input.banner1 ?? null,
      banner2: input.banner2 ?? null,
      banner3: input.banner3 ?? null,
      ...(input.bannerKeys ? { bannerKeys: input.bannerKeys } : {}),
    });
  }
  updateSponsor(input: {
    id: string;
    name?: string;
    maxRedemptionsPerUser?: number;
    banner1?: string | null;
    banner2?: string | null;
    banner3?: string | null;
    bannerKeys?: string[];
  }) {
    return apiClient.models.Sponsor.update(input);
  }
  deleteSponsor(id: string) {
    return apiClient.models.Sponsor.delete({ id });
  }
  listSponsorCodes(sponsorId: string) {
    return apiClient.models.SponsorCode.list({
      filter: { sponsorId: { eq: sponsorId } },
      limit: 200,
    });
  }
  createSponsorCode(input: {
    sponsorId: string;
    tournamentId: string;
    code: string;
    startDate: string; endDate: string;
    maxUses: number;
    pointsValue: number;
    comodinType?: string | null;
  }) {
    return apiClient.models.SponsorCode.create({
      ...input,
      currentUses: 0,
    });
  }
  updateSponsorCode(input: {
    id: string;
    code?: string;
    startDate?: string; endDate?: string;
    maxUses?: number;
    pointsValue?: number;
    comodinType?: string | null;
  }) {
    return apiClient.models.SponsorCode.update(input);
  }
  deleteSponsorCode(id: string) {
    return apiClient.models.SponsorCode.delete({ id });
  }
  redeemSponsorCode(code: string) {
    return apiClient.mutations.redeemSponsorCode({ code });
  }
  myRedemptions(userId: string, limit = 100) {
    return apiClient.models.SponsorRedemption.list({
      filter: { userId: { eq: userId } },
      limit,
    });
  }

  // ----- Notifications -----
  listMyNotifications(userId: string, limit = 100) {
    return apiClient.models.Notification.list({
      filter: { userId: { eq: userId } },
      limit,
    });
  }
  /**
   * AppSync live subscription. Returns an Observable that emits snapshots
   * { items, isSynced } cada vez que algo cambia. Usado por el bell badge
   * en nav para mostrar count de unread sin polling.
   */
  observeMyNotifications(userId: string) {
    return apiClient.models.Notification.observeQuery({
      filter: { userId: { eq: userId } },
    });
  }
  markNotificationRead(id: string) {
    return apiClient.models.Notification.update({
      id,
      readAt: new Date().toISOString(),
    });
  }

  // ----- Comodines (sistema reglamento §comodines) -----
  listMyComodines(userId: string, tournamentId: string, limit = 50) {
    return apiClient.models.Comodin.list({
      filter: {
        userId: { eq: userId },
        tournamentId: { eq: tournamentId },
      },
      limit,
    });
  }
  claimComodinType(comodinId: string, type: string) {
    return apiClient.mutations.claimComodinType({ comodinId, type });
  }
  assignComodin(input: {
    comodinId: string;
    matchId?: string;
    phaseOrder?: number;
    groupLetter?: string;
    positionIndex?: number;
    teamSlug?: string;
    targetComodinId?: string;
  }) {
    return apiClient.mutations.assignComodin(input);
  }
  useLateEdit(input: { comodinId: string; matchId: string; homeScorePred: number; awayScorePred: number; }) {
    return apiClient.mutations.useLateEdit(input);
  }
  useReassignChampRunner(input: { comodinId: string; specialType: 'CHAMPION' | 'RUNNER_UP'; newTeamSlug: string; }) {
    return apiClient.mutations.useReassignChampRunner(input);
  }
  useGroupReset(input: { comodinId: string; groupLetter: string; pos1: string; pos2: string; pos3: string; pos4: string; }) {
    return apiClient.mutations.useGroupReset(input);
  }
  useBracketReset(input: { comodinId: string; phaseOrder: number; newPicks: string[]; }) {
    return apiClient.mutations.useBracketReset(input);
  }
  runLoyaltySweep(tournamentId: string) {
    return apiClient.mutations.runLoyaltySweep({ tournamentId });
  }
  runEngagementSweep(tournamentId: string) {
    return apiClient.mutations.runEngagementSweep({ tournamentId });
  }
  expireComodines(tournamentId: string) {
    return apiClient.mutations.expireComodines({ tournamentId });
  }
  getSponsorCode(id: string) {
    return apiClient.models.SponsorCode.get({ id });
  }

  // ----- Bulk listings para vistas de admin -----
  listAllTournamentTotals(tournamentId: string, limit = 5000) {
    return apiClient.models.UserTournamentTotal.list({
      filter: { tournamentId: { eq: tournamentId } },
      limit,
    });
  }
  listAllStandings(tournamentId: string, limit = 5000) {
    return apiClient.models.GroupStandingPick.list({
      filter: { tournamentId: { eq: tournamentId } },
      limit,
    });
  }
  listAllBestThirds(tournamentId: string, limit = 5000) {
    return apiClient.models.BestThirdsPick.list({
      filter: { tournamentId: { eq: tournamentId } },
      limit,
    });
  }
  listAllBrackets(tournamentId: string, limit = 5000) {
    return apiClient.models.BracketPick.list({
      filter: { tournamentId: { eq: tournamentId } },
      limit,
    });
  }
  listAllSpecials(tournamentId: string, limit = 5000) {
    return apiClient.models.SpecialPick.list({
      filter: { tournamentId: { eq: tournamentId } },
      limit,
    });
  }
  listAllTriviaAnswers(limit = 5000) {
    return apiClient.models.TriviaAnswer.list({ limit });
  }

  listAllPicks(tournamentId: string, limit = 5000) {
    return apiClient.models.Pick.list({
      filter: { tournamentId: { eq: tournamentId } },
      limit,
    });
  }
  listGroups(tournamentId: string, limit = 500) {
    return apiClient.models.Group.list({
      filter: { tournamentId: { eq: tournamentId } },
      limit,
    });
  }

  // ----- Authenticated reads (JWT) -----
  myPicks(userId: string) {
    return apiClient.models.Pick.list({
      filter: { userId: { eq: userId } },
    });
  }
  myGroups(userId: string) {
    return apiClient.models.Membership.list({
      filter: { userId: { eq: userId } },
    });
  }
  groupMembers(groupId: string) {
    return apiClient.models.Membership.list({
      filter: { groupId: { eq: groupId } },
    });
  }
  groupLeaderboard(groupId: string) {
    return apiClient.models.UserGroupTotal.list({
      filter: { groupId: { eq: groupId } },
    });
  }
  myTotal(userId: string, tournamentId: string) {
    return apiClient.models.UserTournamentTotal.list({
      filter: { userId: { eq: userId }, tournamentId: { eq: tournamentId } },
      limit: 1,
    });
  }
  listTeams(tournamentId: string) {
    return apiClient.models.Team.list({
      filter: { tournamentId: { eq: tournamentId } },
      authMode: 'apiKey',
    });
  }
  listPhases(tournamentId: string) {
    return apiClient.models.Phase.list({
      filter: { tournamentId: { eq: tournamentId } },
      authMode: 'apiKey',
    });
  }

  // ----- Custom mutations (Lambda-backed) -----
  upsertPick(matchId: string, homeScorePred: number, awayScorePred: number) {
    return apiClient.mutations.upsertPick({ matchId, homeScorePred, awayScorePred });
  }
  createGroup(name: string, tournamentId: string, mode: 'SIMPLE' | 'COMPLETE', description?: string, imageKey?: string) {
    return apiClient.mutations.createGroup({ name, tournamentId, mode, description: description ?? null, imageKey: imageKey ?? null });
  }
  updateGroup(input: { id: string; name?: string; description?: string | null; imageKey?: string | null }) {
    return apiClient.models.Group.update(input);
  }
  joinGroup(code: string) {
    return apiClient.mutations.joinGroup({ code });
  }
  deleteGroup(groupId: string) {
    return apiClient.mutations.deleteGroup({ groupId });
  }
  emailGroupInvite(groupId: string, emails: string[]) {
    return apiClient.mutations.emailGroupInvite({ groupId, emails });
  }
  adminUserAction(userSub: string, action: 'reset_password' | 'disable' | 'enable') {
    return apiClient.mutations.adminUserAction({ userSub, action });
  }

  // ----- Custom query -----
  pendingMatches(tournamentId: string, beforeHours: number) {
    return apiClient.queries.pendingMatches({ tournamentId, beforeHours });
  }

  // ----- Admin mutations -----
  scoreMatch(matchId: string) {
    return apiClient.mutations.scoreMatch({ matchId });
  }
  scoreGroupStage(tournamentId: string) {
    return apiClient.mutations.scoreGroupStage({ tournamentId });
  }
  scoreBracket(tournamentId: string) {
    return apiClient.mutations.scoreBracket({ tournamentId });
  }
  scoreTrivia(matchId: string) {
    return apiClient.mutations.scoreTrivia({ matchId });
  }
  adjudicateSpecial(tournamentId: string, type: SpecialType, winningTeamId: string) {
    return apiClient.mutations.adjudicateSpecial({ tournamentId, type, winningTeamId });
  }
  // Two-step admin flow for results: updateMatch then scoreMatch.
  // status:'FINAL' se manda solo si no estaba en FINAL ya. Re-asignar el
  // mismo enum value dispara field-level auth checks redundantes en
  // AppSync que pueden devolver "Unauthorized on [status]" silenciosamente.
  updateMatchResult(
    matchId: string,
    homeScore: number,
    awayScore: number,
    version: number,
    currentStatus: 'SCHEDULED' | 'LIVE' | 'FINAL',
  ) {
    const payload: Record<string, unknown> = {
      id: matchId,
      homeScore,
      awayScore,
      version: version + 1,
    };
    if (currentStatus !== 'FINAL') payload['status'] = 'FINAL';
    return apiClient.models.Match.update(payload);
  }

  /** Admin marca un partido como "terminó de jugarse" — sin score aún.
   *  Status pasa a FINAL para que aparezca en /admin/results para
   *  publicar el marcador. NO toca homeScore/awayScore: se entran
   *  manualmente en results. */
  markMatchFinished(matchId: string, version: number) {
    return apiClient.models.Match.update({
      id: matchId,
      status: 'FINAL',
      version: version + 1,
    });
  }

  // ----- Group-stage prediction picks -----
  // Cada user puede tener dos predicciones por torneo (mode SIMPLE y mode
  // COMPLETE) — el filtro siempre lleva mode para no mezclar.
  listGroupStandingPicks(userId: string, mode: 'SIMPLE' | 'COMPLETE') {
    return apiClient.models.GroupStandingPick.list({
      filter: { userId: { eq: userId }, mode: { eq: mode } },
      limit: 50,
    });
  }
  upsertGroupStandingPick(input: {
    id?: string;
    userId: string;
    tournamentId: string;
    mode: 'SIMPLE' | 'COMPLETE';
    groupLetter: string;
    pos1: string; pos2: string; pos3: string; pos4: string;
  }) {
    if (input.id) {
      return apiClient.models.GroupStandingPick.update({
        id: input.id,
        pos1: input.pos1, pos2: input.pos2, pos3: input.pos3, pos4: input.pos4,
      });
    }
    return apiClient.models.GroupStandingPick.create({
      userId: input.userId,
      tournamentId: input.tournamentId,
      mode: input.mode,
      groupLetter: input.groupLetter,
      pos1: input.pos1, pos2: input.pos2, pos3: input.pos3, pos4: input.pos4,
    });
  }
  getBestThirdsPick(userId: string, tournamentId: string, mode: 'SIMPLE' | 'COMPLETE') {
    return apiClient.models.BestThirdsPick.list({
      filter: { userId: { eq: userId }, tournamentId: { eq: tournamentId }, mode: { eq: mode } },
      limit: 1,
    });
  }
  upsertBestThirdsPick(input: { id?: string; userId: string; tournamentId: string; mode: 'SIMPLE' | 'COMPLETE'; advancing: string[] }) {
    if (input.id) {
      return apiClient.models.BestThirdsPick.update({
        id: input.id,
        advancing: input.advancing,
      });
    }
    return apiClient.models.BestThirdsPick.create({
      userId: input.userId,
      tournamentId: input.tournamentId,
      mode: input.mode,
      advancing: input.advancing,
    });
  }

  // ----- Bracket pick (llaves eliminatorias) -----
  getBracketPick(userId: string, tournamentId: string, mode: 'SIMPLE' | 'COMPLETE') {
    return apiClient.models.BracketPick.list({
      filter: { userId: { eq: userId }, tournamentId: { eq: tournamentId }, mode: { eq: mode } },
      limit: 1,
    });
  }
  // ----- Trivia (admin CRUD + user answers) -----
  listTriviaByMatch(matchId: string) {
    return apiClient.models.TriviaQuestion.list({
      filter: { matchId: { eq: matchId } },
      limit: 200,
    });
  }
  listTriviaByTournament(tournamentId: string) {
    return apiClient.models.TriviaQuestion.list({
      filter: { tournamentId: { eq: tournamentId } },
      limit: 1000,
    });
  }
  createTriviaQuestion(input: {
    matchId: string;
    tournamentId: string;
    prompt: string;
    optionA: string; optionB: string; optionC: string; optionD: string;
    correctOption: 'A' | 'B' | 'C' | 'D';
    publishedAt: string;
    timerSeconds: number;
    explanation?: string | null;
  }) {
    return apiClient.models.TriviaQuestion.create(input);
  }
  updateTriviaQuestion(input: {
    id: string;
    prompt?: string;
    optionA?: string; optionB?: string; optionC?: string; optionD?: string;
    correctOption?: 'A' | 'B' | 'C' | 'D';
    publishedAt?: string;
    timerSeconds?: number;
    explanation?: string | null;
  }) {
    return apiClient.models.TriviaQuestion.update(input);
  }
  deleteTriviaQuestion(id: string) {
    return apiClient.models.TriviaQuestion.delete({ id });
  }
  myTriviaAnswers(userId: string, matchId: string) {
    return apiClient.models.TriviaAnswer.list({
      filter: { userId: { eq: userId }, matchId: { eq: matchId } },
      limit: 200,
    });
  }
  listTriviaAnswersByMatch(matchId: string) {
    return apiClient.models.TriviaAnswer.list({
      filter: { matchId: { eq: matchId } },
      limit: 5000,
    });
  }
  listPicksByMatch(matchId: string) {
    return apiClient.models.Pick.list({
      filter: { matchId: { eq: matchId } },
      limit: 5000,
    });
  }
  upsertTriviaAnswer(input: {
    id?: string;
    userId: string;
    questionId: string;
    matchId: string;
    selectedOption: 'A' | 'B' | 'C' | 'D';
  }) {
    const answeredAt = new Date().toISOString();
    if (input.id) {
      return apiClient.models.TriviaAnswer.update({
        id: input.id,
        selectedOption: input.selectedOption,
        answeredAt,
      });
    }
    return apiClient.models.TriviaAnswer.create({
      userId: input.userId,
      questionId: input.questionId,
      matchId: input.matchId,
      selectedOption: input.selectedOption,
      answeredAt,
    });
  }

  upsertBracketPick(input: {
    id?: string;     // ignorado: el server resuelve upsert por (user, tournament, mode)
    userId: string;  // ignorado: el server toma identity.sub
    tournamentId: string;
    mode: 'SIMPLE' | 'COMPLETE';
    octavos: string[]; cuartos: string[]; semis: string[]; final: string[];
    champion: string;
  }) {
    // Custom mutation: enforcea el lock §4 (kickoff del primer partido
    // eliminatorio). El server upserta por (userId=identity.sub,
    // tournamentId, mode), preservando createdAt y pointsEarned.
    return apiClient.mutations.upsertBracketPick({
      tournamentId: input.tournamentId,
      mode: input.mode,
      octavos: input.octavos,
      cuartos: input.cuartos,
      semis: input.semis,
      final: input.final,
      champion: input.champion ? input.champion : null,
    });
  }

  // ----- SpecialPick upsert (owner-based auto-CRUD) -----
  // userId must be passed explicitly even though allow.ownerDefinedIn('userId')
  // would auto-fill it server-side: the generated TS signature for create()
  // marks userId as required. Caller passes auth.user()!.sub.
  async upsertSpecialPick(userId: string, type: SpecialType, teamId: string, tournamentId: string, mode: 'SIMPLE' | 'COMPLETE') {
    const existing = await apiClient.models.SpecialPick.list({
      filter: { tournamentId: { eq: tournamentId }, type: { eq: type }, mode: { eq: mode } },
      limit: 1,
    });
    const found = (existing.data ?? [])[0];
    if (found) return apiClient.models.SpecialPick.update({ id: found.id, teamId });
    return apiClient.models.SpecialPick.create({ userId, type, teamId, tournamentId, mode });
  }
  mySpecialPicks(tournamentId: string, mode: 'SIMPLE' | 'COMPLETE') {
    return apiClient.models.SpecialPick.list({
      filter: { tournamentId: { eq: tournamentId }, mode: { eq: mode } },
    });
  }
}
