export type TournamentResult = Readonly<{
  placement: number;
  playerCount: number;
}>;

export type TournamentPointBreakdown = Readonly<{
  attendance: number;
  winner: number;
  placement: number;
  total: number;
}>;

const ATTENDANCE_POINTS = 5;
const WINNER_POINTS = 10;
const TOP_FOUR_POINTS = 5;
const TOP_EIGHT_POINTS = 3;

export function calculateTournamentPoints(
  result: TournamentResult,
): TournamentPointBreakdown {
  const winner = result.placement === 1 ? WINNER_POINTS : 0;
  const placement = calculatePlacementPoints(result);

  return {
    attendance: ATTENDANCE_POINTS,
    winner,
    placement,
    total: ATTENDANCE_POINTS + winner + placement,
  };
}

function calculatePlacementPoints(result: TournamentResult): number {
  if (result.playerCount >= 8 && result.placement <= 4) {
    return TOP_FOUR_POINTS;
  }

  if (
    result.playerCount >= 16 &&
    result.placement >= 5 &&
    result.placement <= 8
  ) {
    return TOP_EIGHT_POINTS;
  }

  return 0;
}
