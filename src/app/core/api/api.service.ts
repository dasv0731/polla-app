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
  listUsers(limit = 1000) {
    return apiClient.models.User.list({ limit });
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
  createGroup(name: string, tournamentId: string, mode: 'SIMPLE' | 'COMPLETE') {
    return apiClient.mutations.createGroup({ name, tournamentId, mode });
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
  upsertBracketPick(input: {
    id?: string;
    userId: string;
    tournamentId: string;
    mode: 'SIMPLE' | 'COMPLETE';
    octavos: string[]; cuartos: string[]; semis: string[]; final: string[];
    champion: string;
  }) {
    if (input.id) {
      return apiClient.models.BracketPick.update({
        id: input.id,
        octavos: input.octavos, cuartos: input.cuartos,
        semis: input.semis, final: input.final, champion: input.champion,
      });
    }
    return apiClient.models.BracketPick.create({
      userId: input.userId,
      tournamentId: input.tournamentId,
      mode: input.mode,
      octavos: input.octavos, cuartos: input.cuartos,
      semis: input.semis, final: input.final, champion: input.champion,
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
