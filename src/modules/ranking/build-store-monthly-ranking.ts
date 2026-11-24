import type {
  MonthlyLeagueRepository,
  TieBreakResolutionRevision,
} from "../persistence/sqlite-monthly-league-repository";
import { calculateInvitationPoints } from "../scoring/calculate-invitation-points";
import { calculateTournamentPoints } from "../scoring/calculate-tournament-points";
import { calculateWeeklyContinuityPoints } from "../scoring/calculate-weekly-continuity-points";
import {
  calculateMonthlyRanking,
  type MonthlyRanking,
} from "./calculate-monthly-ranking";
import { resolveTopCutTie } from "./resolve-top-cut-tie";

export type BuildStoreMonthlyRankingInput = Readonly<{
  storeId: string;
  leagueMonth: string;
}>;

export type StoreMonthlyRanking = MonthlyRanking &
  Readonly<{
    storeId: string;
  }>;

export type ProvisionalStoreRankingRepository = Pick<
  MonthlyLeagueRepository,
  | "countPlayerTournamentsBefore"
  | "findTournamentsByLeague"
>;

type StoreRankingRepository = ProvisionalStoreRankingRepository &
  Pick<MonthlyLeagueRepository, "findTieBreakResolutionHistory">;

export function buildStoreMonthlyRanking(
  input: BuildStoreMonthlyRankingInput,
  repository: StoreRankingRepository,
): StoreMonthlyRanking {
  const provisionalRanking = buildProvisionalStoreMonthlyRanking(
    input,
    repository,
  );
  const resolutionHistory = repository.findTieBreakResolutionHistory(
    input.storeId,
    input.leagueMonth,
  );

  return {
    storeId: input.storeId,
    ...applyLatestTieBreakResolution(provisionalRanking, resolutionHistory),
  };
}

export function buildProvisionalStoreMonthlyRanking(
  input: BuildStoreMonthlyRankingInput,
  repository: ProvisionalStoreRankingRepository,
): StoreMonthlyRanking {
  const tournaments = repository.findTournamentsByLeague(
    input.storeId,
    input.leagueMonth,
  );
  const weeklyAttendanceByPlayer = new Map<
    string,
    Map<
      string,
      {
        attendedWednesdayTournament: boolean;
        attendedFridayTournament: boolean;
      }
    >
  >();

  const tournamentPoints = tournaments.flatMap((tournament) => {
    const playerCount = tournament.participants.length;
    const scheduledDay = getUtcDay(tournament.originalScheduledDate);
    const schedulePairKey = getSchedulePairKey(
      tournament.originalScheduledDate,
      scheduledDay,
    );

    return tournament.participants.map((participant) => {
      const playerAttendance =
        weeklyAttendanceByPlayer.get(participant.playerId) ?? new Map();
      const weeklyAttendance = playerAttendance.get(schedulePairKey) ?? {
        attendedWednesdayTournament: false,
        attendedFridayTournament: false,
      };

      if (scheduledDay === 3) {
        weeklyAttendance.attendedWednesdayTournament = true;
      }

      if (scheduledDay === 5) {
        weeklyAttendance.attendedFridayTournament = true;
      }

      playerAttendance.set(schedulePairKey, weeklyAttendance);
      weeklyAttendanceByPlayer.set(participant.playerId, playerAttendance);

      const basePoints = calculateTournamentPoints({
        placement: participant.placement,
        playerCount,
      }).total;
      const invitedPlayers = tournament.participants
        .filter(
          (candidate) =>
            candidate.invitedByPlayerId === participant.playerId,
        )
        .map((invitedPlayer) => ({
          playerId: invitedPlayer.playerId,
          previousTournamentCountAtStore:
            repository.countPlayerTournamentsBefore({
              storeId: input.storeId,
              playerId: invitedPlayer.playerId,
              originalScheduledDate: tournament.originalScheduledDate,
            }),
        }));
      const invitationPoints = calculateInvitationPoints({
        inviterPlayerId: participant.playerId,
        invitedPlayers,
      });

      return {
        playerId: participant.playerId,
        originalScheduledDate: tournament.originalScheduledDate,
        points: basePoints + invitationPoints,
      };
    });
  });
  const continuityPoints = Array.from(
    weeklyAttendanceByPlayer.entries(),
  ).flatMap(([playerId, attendanceBySchedulePair]) =>
    Array.from(attendanceBySchedulePair.entries()).map(
      ([originalScheduledDate, attendance]) => ({
        playerId,
        originalScheduledDate,
        points: calculateWeeklyContinuityPoints(attendance),
      }),
    ),
  );
  const provisionalRanking = calculateMonthlyRanking({
    leagueMonth: input.leagueMonth,
    tournamentPoints: [...tournamentPoints, ...continuityPoints],
  });

  return {
    storeId: input.storeId,
    ...provisionalRanking,
  };
}

function applyLatestTieBreakResolution(
  ranking: MonthlyRanking,
  resolutionHistory: ReadonlyArray<TieBreakResolutionRevision>,
): MonthlyRanking {
  const latestResolution = resolutionHistory.at(-1);
  const tiedEntries = ranking.entries.filter(
    (entry) => entry.topCutStatus === "TIE_BREAK_PENDING",
  );
  const firstTiedEntry = tiedEntries[0];

  if (latestResolution === undefined || firstTiedEntry === undefined) {
    return ranking;
  }

  const tie = {
    tiedPlayerIds: tiedEntries.map((entry) => entry.playerId),
    startingPosition: firstTiedEntry.position,
  };
  const resolutionInput =
    latestResolution.resolutionMethod === "PLAYOFF_MATCH"
      ? {
          ...tie,
          configuredPolicy: "PLAYOFF_MATCH" as const,
          resolutionMethod: "PLAYOFF_MATCH" as const,
          playoffOrder: latestResolution.orderedPlayerIds,
        }
      : latestResolution.configuredPolicy === "PLAYOFF_MATCH"
        ? {
            ...tie,
            configuredPolicy: "PLAYOFF_MATCH" as const,
            resolutionMethod: "MANUAL_ORDER" as const,
            manualOrder: latestResolution.orderedPlayerIds,
            fallbackReason: latestResolution.fallbackReason ?? "",
          }
        : {
            ...tie,
            configuredPolicy: "MANUAL_ORDER" as const,
            resolutionMethod: "MANUAL_ORDER" as const,
            manualOrder: latestResolution.orderedPlayerIds,
          };
  // Validate the historical order on its own group before checking applicability.
  // Malformed audit data must not be mistaken for a later membership change.
  const resolution = resolveTopCutTie({
    ...resolutionInput,
    tiedPlayerIds: latestResolution.orderedPlayerIds.length > 0
      ? latestResolution.orderedPlayerIds
      : tie.tiedPlayerIds,
  });

  if (!resolution.ok) {
    throw new Error(
      `INVALID_PERSISTED_TIE_BREAK_RESOLUTION: ${resolution.error}`,
    );
  }

  const currentTiedPlayerIds = new Set(tie.tiedPlayerIds);
  const hasSamePlayerGroup =
    latestResolution.orderedPlayerIds.length === currentTiedPlayerIds.size &&
    latestResolution.orderedPlayerIds.every((playerId) =>
      currentTiedPlayerIds.has(playerId),
    );

  if (!hasSamePlayerGroup) {
    return ranking;
  }

  const resolvedPlayerById = new Map(
    resolution.resolvedPlayers.map((player) => [player.playerId, player]),
  );
  const entries = ranking.entries
    .map((entry) => {
      const resolvedPlayer = resolvedPlayerById.get(entry.playerId);

      return resolvedPlayer === undefined
        ? entry
        : {
            ...entry,
            position: resolvedPlayer.finalPosition,
            topCutStatus: resolvedPlayer.topCutStatus,
          };
    })
    .sort((firstEntry, secondEntry) =>
      firstEntry.position - secondEntry.position,
    );

  return {
    ...ranking,
    entries,
  };
}

function getUtcDay(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

function getSchedulePairKey(date: string, scheduledDay: number): string {
  if (scheduledDay !== 5) {
    return date;
  }

  const wednesday = new Date(`${date}T00:00:00Z`);
  wednesday.setUTCDate(wednesday.getUTCDate() - 2);

  return wednesday.toISOString().slice(0, 10);
}
