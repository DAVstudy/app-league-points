import { describe, expect, it, vi } from "vitest";

import { recordStoreTieBreakResolution } from "./record-store-tie-break-resolution";

function createBoundaryTieTournament() {
  return {
    id: "TOURNAMENT-1",
    storeId: "STORE-1",
    leagueMonth: "2026-11",
    originalScheduledDate: "2026-11-04",
    effectiveDate: "2026-11-04",
    participants: Array.from({ length: 9 }, (_, index) => ({
      playerId: `P${String(index + 1).padStart(4, "0")}`,
      placement: index + 1,
    })),
  };
}

describe("recordStoreTieBreakResolution", () => {
  it("resolves and records a justified manual fallback for one store league", () => {
    const recordTieBreakResolution = vi.fn();
    const repository = {
      recordTieBreakResolution,
      now: vi.fn().mockReturnValue("2026-11-30T20:00:00.000Z"),
      findTournamentsByLeague: vi
        .fn()
        .mockReturnValue([createBoundaryTieTournament()]),
      countPlayerTournamentsBefore: vi.fn(),
      findTieBreakResolutionHistory: vi.fn().mockReturnValue([]),
    };

    const result = recordStoreTieBreakResolution(
      {
        storeId: "STORE-1",
        leagueMonth: "2026-11",
        configuredPolicy: "PLAYOFF_MATCH",
        resolutionMethod: "MANUAL_ORDER",
        manualOrder: ["P0009", "P0008", "P0007", "P0006", "P0005"],
        fallbackReason: "One player could not attend the playoff.",
        recordedByOrganizerId: "ORGANIZER-1",
      },
      repository,
    );

    expect(result).toEqual({
      ok: true,
      resolvedPlayers: [
        {
          playerId: "P0009",
          finalPosition: 5,
          topCutStatus: "QUALIFIED",
        },
        {
          playerId: "P0008",
          finalPosition: 6,
          topCutStatus: "QUALIFIED",
        },
        {
          playerId: "P0007",
          finalPosition: 7,
          topCutStatus: "QUALIFIED",
        },
        {
          playerId: "P0006",
          finalPosition: 8,
          topCutStatus: "QUALIFIED",
        },
        {
          playerId: "P0005",
          finalPosition: 9,
          topCutStatus: "NOT_QUALIFIED",
        },
      ],
    });
    expect(recordTieBreakResolution).toHaveBeenCalledExactlyOnceWith({
      storeId: "STORE-1",
      leagueMonth: "2026-11",
      configuredPolicy: "PLAYOFF_MATCH",
      resolutionMethod: "MANUAL_ORDER",
      orderedPlayerIds: ["P0009", "P0008", "P0007", "P0006", "P0005"],
      fallbackReason: "One player could not attend the playoff.",
      recordedByOrganizerId: "ORGANIZER-1",
      recordedAt: "2026-11-30T20:00:00.000Z",
    });
  });

  it("does not persist an incomplete order for the derived tied group", () => {
    const recordTieBreakResolution = vi.fn();
    const now = vi.fn().mockReturnValue("2026-11-30T20:00:00.000Z");

    const result = recordStoreTieBreakResolution(
      {
        storeId: "STORE-1",
        leagueMonth: "2026-11",
        configuredPolicy: "MANUAL_ORDER",
        resolutionMethod: "MANUAL_ORDER",
        manualOrder: ["P0009", "P0008", "P0007", "P0006"],
        recordedByOrganizerId: "ORGANIZER-1",
      },
      {
        recordTieBreakResolution,
        now,
        findTournamentsByLeague: vi
          .fn()
          .mockReturnValue([createBoundaryTieTournament()]),
        countPlayerTournamentsBefore: vi.fn(),
      },
    );

    expect(result).toEqual({
      ok: false,
      error: "INVALID_TIE_BREAK_ORDER",
    });
    expect(recordTieBreakResolution).not.toHaveBeenCalled();
    expect(now).not.toHaveBeenCalled();
  });

  it("does not persist a resolution when no Top Cut tie is pending", () => {
    const recordTieBreakResolution = vi.fn();
    const now = vi.fn().mockReturnValue("2026-11-30T20:00:00.000Z");

    const result = recordStoreTieBreakResolution(
      {
        storeId: "STORE-1",
        leagueMonth: "2026-11",
        configuredPolicy: "MANUAL_ORDER",
        resolutionMethod: "MANUAL_ORDER",
        manualOrder: ["P0001"],
        recordedByOrganizerId: "ORGANIZER-1",
      },
      {
        recordTieBreakResolution,
        now,
        findTournamentsByLeague: vi.fn().mockReturnValue([
          {
            ...createBoundaryTieTournament(),
            participants: [{ playerId: "P0001", placement: 1 }],
          },
        ]),
        countPlayerTournamentsBefore: vi.fn(),
      },
    );

    expect(result).toEqual({
      ok: false,
      error: "TIE_BREAK_NOT_PENDING",
    });
    expect(recordTieBreakResolution).not.toHaveBeenCalled();
    expect(now).not.toHaveBeenCalled();
  });
});
