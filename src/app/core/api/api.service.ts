import { Injectable } from '@angular/core';
import { apiClient } from './client';

type SpecialType = 'CHAMPION' | 'RUNNER_UP' | 'DARK_HORSE';
type MatchStatus = 'SCHEDULED' | 'LIVE' | 'FINAL';

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
  createGroup(name: string, tournamentId: string) {
    return apiClient.mutations.createGroup({ name, tournamentId });
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
  adjudicateSpecial(tournamentId: string, type: SpecialType, winningTeamId: string) {
    return apiClient.mutations.adjudicateSpecial({ tournamentId, type, winningTeamId });
  }
  // Two-step admin flow for results: updateMatch then scoreMatch
  updateMatchResult(matchId: string, homeScore: number, awayScore: number, version: number) {
    return apiClient.models.Match.update({
      id: matchId,
      homeScore,
      awayScore,
      status: 'FINAL' as MatchStatus,
      version: version + 1,
    });
  }

  // ----- SpecialPick upsert (owner-based auto-CRUD) -----
  // userId must be passed explicitly even though allow.ownerDefinedIn('userId')
  // would auto-fill it server-side: the generated TS signature for create()
  // marks userId as required. Caller passes auth.user()!.sub.
  async upsertSpecialPick(userId: string, type: SpecialType, teamId: string, tournamentId: string) {
    const existing = await apiClient.models.SpecialPick.list({
      filter: { tournamentId: { eq: tournamentId }, type: { eq: type } },
      limit: 1,
    });
    const found = (existing.data ?? [])[0];
    if (found) return apiClient.models.SpecialPick.update({ id: found.id, teamId });
    return apiClient.models.SpecialPick.create({ userId, type, teamId, tournamentId });
  }
  mySpecialPicks(tournamentId: string) {
    return apiClient.models.SpecialPick.list({
      filter: { tournamentId: { eq: tournamentId } },
    });
  }
}
