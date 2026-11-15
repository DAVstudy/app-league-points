export type TournamentPointsEntry = Readonly<{
  playerId: string;
  originalScheduledDate: string;
  points: number;
}>;

export type MonthlyRankingInput = Readonly<{
  leagueMonth: string;
  tournamentPoints: ReadonlyArray<TournamentPointsEntry>;
}>;

export type TopCutStatus =
  | "QUALIFIED"
  | "NOT_QUALIFIED"
  | "TIE_BREAK_PENDING";

export type MonthlyRankingEntry = Readonly<{
  playerId: string;
  totalPoints: number;
  position: number;
  topCutStatus: TopCutStatus;
}>;

export type MonthlyRanking = Readonly<{
  leagueMonth: string;
  entries: ReadonlyArray<MonthlyRankingEntry>;
}>;

const TOP_CUT_SIZE = 8;

export function calculateMonthlyRanking(
  input: MonthlyRankingInput,
): MonthlyRanking {
  let previousTotalPoints: number | undefined;
  let previousPosition = 0;

  const pointsByPlayer = new Map<string, number>();

  for (const tournament of input.tournamentPoints) {
    const belongsToLeagueMonth =
      tournament.originalScheduledDate.startsWith(
        `${input.leagueMonth}-`,
      );

    if (!belongsToLeagueMonth) {
      continue;
    }

    const accumulatedPoints =
      pointsByPlayer.get(tournament.playerId) ?? 0;
    pointsByPlayer.set(
      tournament.playerId,
      accumulatedPoints + tournament.points,
    );
  }

  const sortedPlayerPoints = Array.from(pointsByPlayer.entries()).sort(
    ([, firstPlayerPoints], [, secondPlayerPoints]) =>
      secondPlayerPoints - firstPlayerPoints,
  );

  const playerCountByPoints = new Map<number, number>();

  for (const [, totalPoints] of sortedPlayerPoints) {
    const currentPlayerCount =
      playerCountByPoints.get(totalPoints) ?? 0;

    playerCountByPoints.set(
      totalPoints,
      currentPlayerCount + 1,
    );
  }

  const entries = sortedPlayerPoints.map(
    ([playerId, totalPoints], index): MonthlyRankingEntry => {
      const position =
        totalPoints === previousTotalPoints
          ? previousPosition
          : index + 1;

      const tiedPlayerCount =
        playerCountByPoints.get(totalPoints) ?? 0;

      const lastTiedPosition =
        position + tiedPlayerCount - 1;

      const tieAffectsTopCut =
        position <= TOP_CUT_SIZE &&
        lastTiedPosition > TOP_CUT_SIZE;

      previousTotalPoints = totalPoints;
      previousPosition = position;

      let topCutStatus: TopCutStatus;

      if (tieAffectsTopCut) {
        topCutStatus = "TIE_BREAK_PENDING";
      } else if (position <= TOP_CUT_SIZE) {
        topCutStatus = "QUALIFIED";
      } else {
        topCutStatus = "NOT_QUALIFIED";
      }
      return {
        playerId,
        totalPoints,
        position,
        topCutStatus,
      };
    },
  );

  return {
    leagueMonth: input.leagueMonth,
    entries,
  };
}
