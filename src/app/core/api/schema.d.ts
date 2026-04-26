// Hand-written stub mirroring the polla-backend GraphQL schema.
// Replace with a generated type via `npx ampx generate graphql-client-code`
// from the polla-backend repo when the Amplify type-gen step is wired in CI.

export interface Schema {
  Tournament: { type: { slug: string; name: string; startsAt: string; endsAt: string; specialsLockAt: string; sponsoredPrize?: string } };
  Phase: { type: { id: string; tournamentId: string; order: number; name: string; multiplier: number } };
  Team: { type: { slug: string; tournamentId: string; name: string; flagCode: string } };
  Match: {
    type: {
      id: string;
      tournamentId: string;
      phaseId: string;
      homeTeamId: string;
      awayTeamId: string;
      kickoffAt: string;
      status: 'SCHEDULED' | 'LIVE' | 'FINAL';
      homeScore?: number;
      awayScore?: number;
      pointsCalculated: boolean;
      version: number;
    };
  };
  Pick: {
    type: {
      id: string;
      userId: string;
      matchId: string;
      tournamentId: string;
      homeScorePred: number;
      awayScorePred: number;
      pointsEarned?: number;
      exactScore?: boolean;
      correctResult?: boolean;
    };
  };
  Group: { type: { id: string; name: string; tournamentId: string; adminUserId: string; joinCode: string; createdAt: string } };
  Membership: { type: { id: string; groupId: string; userId: string; isAdmin: boolean; joinedAt: string } };
  InviteCode: { type: { code: string; groupId: string } };
  SpecialPick: {
    type: {
      id: string;
      userId: string;
      tournamentId: string;
      type: 'CHAMPION' | 'RUNNER_UP' | 'DARK_HORSE';
      teamId: string;
      pointsEarned?: number;
    };
  };
  SpecialResult: { type: { tournamentId: string; type: 'CHAMPION' | 'RUNNER_UP' | 'DARK_HORSE'; winningTeamId: string; adjudicatedAt: string } };
  UserTournamentTotal: { type: { userId: string; tournamentId: string; points: number; exactCount: number; resultCount: number } };
  UserGroupTotal: { type: { groupId: string; userId: string; points: number; exactCount: number; resultCount: number } };
}
