import { describe, expect, it, vi } from "vitest";

import { buildStoreMonthlyRanking } from "./build-store-monthly-ranking";

describe("buildStoreMonthlyRanking", () => {
  it("builds a ranking from tournaments in the requested store and month", () => {
    const findTournamentsByLeague = vi.fn().mockReturnValue([
      {
        id: "TOURNAMENT-1",
        storeId: "STORE-1",
        leagueMonth: "2026-11",
        originalScheduledDate: "2026-11-04",
        effectiveDate: "2026-11-04",
        participants: [
          {
            playerId: "P0001",
            placement: 1,
          },
        ],
      },
    ]);

    const ranking = buildStoreMonthlyRanking(
      {
        storeId: "STORE-1",
        leagueMonth: "2026-11",
      },
      {
        findTournamentsByLeague,
        countPlayerTournamentsBefore: vi.fn(),
        findTieBreakResolutionHistory: vi.fn().mockReturnValue([]),
      },
    );

    expect(findTournamentsByLeague).toHaveBeenCalledExactlyOnceWith(
      "STORE-1",
      "2026-11",
    );
    expect(ranking).toEqual({
      storeId: "STORE-1",
      leagueMonth: "2026-11",
      entries: [
        {
          playerId: "P0001",
          totalPoints: 15,
          position: 1,
          topCutStatus: "QUALIFIED",
        },
      ],
    });
  });

  it("adds invitation points when the invited participant is new at the store", () => {
    const findTournamentsByLeague = vi.fn().mockReturnValue([
      {
        id: "TOURNAMENT-1",
        storeId: "STORE-1",
        leagueMonth: "2026-11",
        originalScheduledDate: "2026-11-04",
        effectiveDate: "2026-11-04",
        participants: [
          {
            playerId: "P0001",
            placement: 1,
          },
          {
            playerId: "P0002",
            placement: 2,
            invitedByPlayerId: "P0001",
          },
        ],
      },
    ]);
    const countPlayerTournamentsBefore = vi.fn().mockReturnValue(0);
    const repository = {
      findTournamentsByLeague,
      countPlayerTournamentsBefore,
      findTieBreakResolutionHistory: vi.fn().mockReturnValue([]),
    };

    const ranking = buildStoreMonthlyRanking(
      {
        storeId: "STORE-1",
        leagueMonth: "2026-11",
      },
      repository,
    );

    expect(countPlayerTournamentsBefore).toHaveBeenCalledExactlyOnceWith({
      storeId: "STORE-1",
      playerId: "P0002",
      originalScheduledDate: "2026-11-04",
    });
    expect(ranking.entries).toEqual([
      {
        playerId: "P0001",
        totalPoints: 18,
        position: 1,
        topCutStatus: "QUALIFIED",
      },
      {
        playerId: "P0002",
        totalPoints: 5,
        position: 2,
        topCutStatus: "QUALIFIED",
      },
    ]);
  });

  it("adds continuity points for attending the original Wednesday and Friday pair", () => {
    const findTournamentsByLeague = vi.fn().mockReturnValue([
      {
        id: "WEDNESDAY-TOURNAMENT",
        storeId: "STORE-1",
        leagueMonth: "2026-11",
        originalScheduledDate: "2026-11-04",
        effectiveDate: "2026-11-04",
        participants: [
          {
            playerId: "P0001",
            placement: 1,
          },
        ],
      },
      {
        id: "FRIDAY-TOURNAMENT",
        storeId: "STORE-1",
        leagueMonth: "2026-11",
        originalScheduledDate: "2026-11-06",
        effectiveDate: "2026-11-08",
        participants: [
          {
            playerId: "P0001",
            placement: 1,
          },
        ],
      },
    ]);

    const ranking = buildStoreMonthlyRanking(
      {
        storeId: "STORE-1",
        leagueMonth: "2026-11",
      },
      {
        findTournamentsByLeague,
        countPlayerTournamentsBefore: vi.fn(),
        findTieBreakResolutionHistory: vi.fn().mockReturnValue([]),
      },
    );

    expect(ranking.entries).toEqual([
      {
        playerId: "P0001",
        totalPoints: 32,
        position: 1,
        topCutStatus: "QUALIFIED",
      },
    ]);
  });

  it("does not award continuity when Wednesday belongs to the previous month", () => {
    const findTournamentsByLeague = vi.fn().mockReturnValue([
      {
        id: "FRIDAY-TOURNAMENT",
        storeId: "STORE-1",
        leagueMonth: "2026-05",
        originalScheduledDate: "2026-05-01",
        effectiveDate: "2026-05-01",
        participants: [
          {
            playerId: "P0001",
            placement: 1,
          },
        ],
      },
    ]);

    const ranking = buildStoreMonthlyRanking(
      {
        storeId: "STORE-1",
        leagueMonth: "2026-05",
      },
      {
        findTournamentsByLeague,
        countPlayerTournamentsBefore: vi.fn(),
        findTieBreakResolutionHistory: vi.fn().mockReturnValue([]),
      },
    );

    expect(ranking.entries).toEqual([
      {
        playerId: "P0001",
        totalPoints: 15,
        position: 1,
        topCutStatus: "QUALIFIED",
      },
    ]);
  });

  it("applies the latest audited resolution to the Top Cut boundary tie", () => {
    const participants = Array.from({ length: 9 }, (_, index) => ({
      playerId: `P${String(index + 1).padStart(4, "0")}`,
      placement: index + 1,
    }));
    const findTournamentsByLeague = vi.fn().mockReturnValue([
      {
        id: "TOURNAMENT-1",
        storeId: "STORE-1",
        leagueMonth: "2026-11",
        originalScheduledDate: "2026-11-04",
        effectiveDate: "2026-11-04",
        participants,
      },
    ]);
    const findTieBreakResolutionHistory = vi.fn().mockReturnValue([
      {
        revision: 1,
        storeId: "STORE-1",
        leagueMonth: "2026-11",
        configuredPolicy: "MANUAL_ORDER",
        resolutionMethod: "MANUAL_ORDER",
        orderedPlayerIds: ["P0005", "P0006", "P0007", "P0008", "P0009"],
        recordedByOrganizerId: "ORGANIZER-1",
        recordedAt: "2026-11-30T20:00:00.000Z",
      },
      {
        revision: 2,
        storeId: "STORE-1",
        leagueMonth: "2026-11",
        configuredPolicy: "MANUAL_ORDER",
        resolutionMethod: "MANUAL_ORDER",
        orderedPlayerIds: ["P0009", "P0008", "P0007", "P0006", "P0005"],
        recordedByOrganizerId: "ORGANIZER-1",
        recordedAt: "2026-11-30T21:00:00.000Z",
      },
    ]);

    const ranking = buildStoreMonthlyRanking(
      {
        storeId: "STORE-1",
        leagueMonth: "2026-11",
      },
      {
        findTournamentsByLeague,
        countPlayerTournamentsBefore: vi.fn(),
        findTieBreakResolutionHistory,
      },
    );

    expect(ranking.entries.slice(4)).toEqual([
      {
        playerId: "P0009",
        totalPoints: 5,
        position: 5,
        topCutStatus: "QUALIFIED",
      },
      {
        playerId: "P0008",
        totalPoints: 5,
        position: 6,
        topCutStatus: "QUALIFIED",
      },
      {
        playerId: "P0007",
        totalPoints: 5,
        position: 7,
        topCutStatus: "QUALIFIED",
      },
      {
        playerId: "P0006",
        totalPoints: 5,
        position: 8,
        topCutStatus: "QUALIFIED",
      },
      {
        playerId: "P0005",
        totalPoints: 5,
        position: 9,
        topCutStatus: "NOT_QUALIFIED",
      },
    ]);
  });
});
