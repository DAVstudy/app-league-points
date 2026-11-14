export type WeeklyAttendance = Readonly<{
  attendedWednesdayTournament: boolean;
  attendedFridayTournament: boolean;
}>;

export function calculateWeeklyContinuityPoints(
  attendance: WeeklyAttendance,
): number {
  if (
    attendance.attendedWednesdayTournament &&
    attendance.attendedFridayTournament
  ) {
    return 2;
  }

  return 0;
}
