import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { executeAuthorizedStoreOperation } from "../authorization/authorize-store-operation";
import { createSqliteMonthlyLeagueRepository } from "../persistence/sqlite-monthly-league-repository";
import { createSqliteStoreMembershipRepository } from "../persistence/sqlite-store-membership-repository";
import { buildStoreMonthlyRanking } from "./build-store-monthly-ranking";
import { recordStoreTieBreakResolution } from "./record-store-tie-break-resolution";

describe("buildStoreMonthlyRanking", () => {
  it.each(["shrunk", "expanded", "replaced"] as const)(
    "keeps history and returns a pending ranking when the tied group has %s",
    async (change) => {
      const directory = await mkdtemp(join(tmpdir(), "ranking-history-"));
      const databasePath = join(directory, "league.sqlite");
      const stores = createSqliteStoreMembershipRepository(databasePath);
      const repository = createSqliteMonthlyLeagueRepository(databasePath);
      const input = { storeId: "STORE-1", leagueMonth: "2026-11" };
      const originalOrder = ["P0009", "P0008", "P0007", "P0006", "P0005"];
      try {
        for (const storeId of ["STORE-1", "STORE-2"]) {
          stores.createStore({ id: storeId, name: storeId });
          stores.addOrganizerMembership({ storeId, organizerId: "ORGANIZER-1" });
          repository.createMonthlyLeague({ ...input, storeId, tieBreakPolicy: "MANUAL_ORDER" });
          repository.registerTournament({
            ...input,
            storeId,
            id: `INITIAL-${storeId}`,
            originalScheduledDate: "2026-11-04",
            effectiveDate: "2026-11-04",
            participants: Array.from({ length: 9 }, (_, index) => ({
              playerId: `P${String(index + 1).padStart(4, "0")}`,
              placement: index + 1,
            })),
          });
          for (const manualOrder of [originalOrder.toReversed(), originalOrder]) {
            expect(recordStoreTieBreakResolution({
              ...input,
              storeId,
              configuredPolicy: "MANUAL_ORDER",
              resolutionMethod: "MANUAL_ORDER",
              manualOrder,
              recordedByOrganizerId: "ORGANIZER-1",
            }, { ...repository, now: () => "2026-11-05T20:00:00.000Z" }).ok).toBe(true);
          }
        }
        const history = repository.findTieBreakResolutionHistory(input.storeId, input.leagueMonth);
        const otherHistory = repository.findTieBreakResolutionHistory("STORE-2", input.leagueMonth);
        const compatibleRanking = buildStoreMonthlyRanking({ ...input, storeId: "STORE-2" }, repository);
        expect(compatibleRanking.entries.slice(4)).toEqual(originalOrder.map((playerId, index) => ({
          playerId, totalPoints: 5, position: index + 5,
          topCutStatus: index < 4 ? "QUALIFIED" : "NOT_QUALIFIED",
        })));
        repository.registerTournament({
          ...input,
          id: "LATER-TOURNAMENT",
          originalScheduledDate: "2026-11-11",
          effectiveDate: "2026-11-11",
          participants: change === "shrunk"
            ? [{ playerId: "P0005", placement: 1 }]
            : [
                { playerId: change === "expanded" ? "P0001" : "P0005", placement: 1 },
                { playerId: "P0010", placement: 2 },
              ],
        });
        const pendingIds = change === "expanded"
          ? ["P0005", "P0006", "P0007", "P0008", "P0009", "P0010"]
          : change === "shrunk"
            ? ["P0006", "P0007", "P0008", "P0009"]
            : ["P0006", "P0007", "P0008", "P0009", "P0010"];
        const leadingIds = change === "expanded"
          ? ["P0001", "P0002", "P0003", "P0004"]
          : ["P0005", "P0001", "P0002", "P0003", "P0004"];
        const expectedRanking = {
          ...input,
          entries: [
            ...leadingIds.map((playerId, index) => ({
              playerId,
              totalPoints: playerId === "P0005" ? 20 : playerId === "P0001"
                ? (change === "expanded" ? 30 : 15) : 10,
              position: index < 2 ? index + 1 : (change === "expanded" ? 2 : 3),
              topCutStatus: "QUALIFIED",
            })),
            ...pendingIds.map((playerId) => ({
              playerId, totalPoints: 5, position: leadingIds.length + 1,
              topCutStatus: "TIE_BREAK_PENDING",
            })),
          ],
        };
        expect(buildStoreMonthlyRanking(input, repository)).toEqual(expectedRanking);
        expect(repository.findTieBreakResolutionHistory(input.storeId, input.leagueMonth)).toEqual(history);
        expect(buildStoreMonthlyRanking({ ...input, storeId: "STORE-2" }, repository)).toEqual(compatibleRanking);
        expect(repository.findTieBreakResolutionHistory("STORE-2", input.leagueMonth)).toEqual(otherHistory);
        expect(buildStoreMonthlyRanking({ ...input, leagueMonth: "2026-12" }, repository)).toEqual({
          ...input, leagueMonth: "2026-12", entries: [],
        });
        const operation = vi.fn(() => buildStoreMonthlyRanking(input, repository));
        expect(executeAuthorizedStoreOperation({
          actorOrganizerId: "OUTSIDER", storeId: input.storeId, memberships: [], operation,
        })).toEqual({ ok: false, error: "STORE_ACCESS_DENIED" });
        expect(operation).not.toHaveBeenCalled();
        const now = vi.fn(() => "2026-11-12T20:00:00.000Z");
        expect(recordStoreTieBreakResolution({
          ...input,
          configuredPolicy: "MANUAL_ORDER",
          resolutionMethod: "MANUAL_ORDER",
          manualOrder: originalOrder,
          recordedByOrganizerId: "ORGANIZER-1",
        }, { ...repository, now })).toEqual({ ok: false, error: "INVALID_TIE_BREAK_ORDER" });
        expect(now).not.toHaveBeenCalled();
        expect(repository.findTieBreakResolutionHistory(input.storeId, input.leagueMonth)).toEqual(history);
      } finally {
        repository.close();
        stores.close();
        await rm(directory, { recursive: true, force: true });
      }
    },
  );

  it.each([
    {
      orderedPlayerIds: [],
      configuredPolicy: "MANUAL_ORDER",
      error: "INVALID_TIE_BREAK_ORDER",
    },
    {
      orderedPlayerIds: ["P0005", "P0006", "P0007", "P0008", "P0009", "P0009"],
      configuredPolicy: "MANUAL_ORDER",
      error: "INVALID_TIE_BREAK_ORDER",
    },
    {
      orderedPlayerIds: ["P0005", "P0006", "P0007", "P0008", "P0010"],
      configuredPolicy: "PLAYOFF_MATCH",
      error: "FALLBACK_REASON_REQUIRED",
    },
  ])("rejects malformed persisted resolutions: $error", ({ error, ...resolution }) => {
    const repository = {
      findTournamentsByLeague: vi.fn().mockReturnValue([{
        originalScheduledDate: "2026-11-04",
        participants: Array.from({ length: 9 }, (_, index) => ({ playerId: `P000${index + 1}`, placement: index + 1 })),
      }]),
      countPlayerTournamentsBefore: vi.fn(),
      findTieBreakResolutionHistory: vi.fn().mockReturnValue([{ ...resolution, resolutionMethod: "MANUAL_ORDER" }]),
    };
    expect(() => buildStoreMonthlyRanking({ storeId: "STORE-1", leagueMonth: "2026-11" }, repository))
      .toThrow(`INVALID_PERSISTED_TIE_BREAK_RESOLUTION: ${error}`);
  });

  it("ignores saved resolutions when there is no boundary tie", () => {
    const history = [{ orderedPlayerIds: ["OLD-PLAYER"], configuredPolicy: "MANUAL_ORDER", resolutionMethod: "MANUAL_ORDER" }];
    const before = structuredClone(history);
    const ranking = buildStoreMonthlyRanking({ storeId: "STORE-1", leagueMonth: "2026-11" }, {
      findTournamentsByLeague: vi.fn().mockReturnValue([{
        originalScheduledDate: "2026-11-04",
        participants: [{ playerId: "P0001", placement: 1 }],
      }]),
      countPlayerTournamentsBefore: vi.fn(),
      findTieBreakResolutionHistory: vi.fn().mockReturnValue(history),
    });
    expect(ranking).toEqual({
      storeId: "STORE-1", leagueMonth: "2026-11",
      entries: [{ playerId: "P0001", totalPoints: 15, position: 1, topCutStatus: "QUALIFIED" }],
    });
    expect(history).toEqual(before);
  });

  it("does not fall back to an older compatible revision", () => {
    const history = [
      { orderedPlayerIds: ["P0009", "P0008", "P0007", "P0006", "P0005"], configuredPolicy: "MANUAL_ORDER", resolutionMethod: "MANUAL_ORDER" },
      { orderedPlayerIds: ["P0009", "P0008", "P0007", "P0006"], configuredPolicy: "MANUAL_ORDER", resolutionMethod: "MANUAL_ORDER" },
    ];
    const before = structuredClone(history);
    const ranking = buildStoreMonthlyRanking({ storeId: "STORE-1", leagueMonth: "2026-11" }, {
      findTournamentsByLeague: vi.fn().mockReturnValue([{
        originalScheduledDate: "2026-11-04",
        participants: Array.from({ length: 9 }, (_, index) => ({ playerId: `P000${index + 1}`, placement: index + 1 })),
      }]),
      countPlayerTournamentsBefore: vi.fn(),
      findTieBreakResolutionHistory: vi.fn().mockReturnValue(history),
    });
    expect(ranking.entries.slice(4)).toEqual(["P0005", "P0006", "P0007", "P0008", "P0009"].map((playerId) => ({
      playerId, totalPoints: 5, position: 5, topCutStatus: "TIE_BREAK_PENDING",
    })));
    expect(history).toEqual(before);
  });
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
