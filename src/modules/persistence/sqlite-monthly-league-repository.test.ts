import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createSqliteMonthlyLeagueRepository } from "./sqlite-monthly-league-repository";
import { createSqliteStoreMembershipRepository } from "./sqlite-store-membership-repository";

describe("createSqliteMonthlyLeagueRepository", () => {
  const temporaryDirectories: string[] = [];

  afterEach(async () => {
    await Promise.all(
      temporaryDirectories.splice(0).map((directory) =>
        rm(directory, {
          force: true,
          recursive: true,
        }),
      ),
    );
  });

  it("persists a store-scoped monthly league after the repository is reopened", async () => {
    const directory = await mkdtemp(join(tmpdir(), "league-points-"));
    temporaryDirectories.push(directory);
    const databasePath = join(directory, "league-points.sqlite");
    const storeRepository =
      createSqliteStoreMembershipRepository(databasePath);

    storeRepository.createStore({ id: "STORE-1", name: "Local League" });
    storeRepository.close();

    const firstLeagueRepository =
      createSqliteMonthlyLeagueRepository(databasePath);

    firstLeagueRepository.createMonthlyLeague({
      storeId: "STORE-1",
      leagueMonth: "2026-11",
      tieBreakPolicy: "MANUAL_ORDER",
    });
    firstLeagueRepository.close();

    const reopenedLeagueRepository =
      createSqliteMonthlyLeagueRepository(databasePath);

    expect(
      reopenedLeagueRepository.findMonthlyLeague("STORE-1", "2026-11"),
    ).toEqual({
      storeId: "STORE-1",
      leagueMonth: "2026-11",
      tieBreakPolicy: "MANUAL_ORDER",
    });

    reopenedLeagueRepository.close();
  });

  it("persists a tournament's original and effective dates after reopening", async () => {
    const directory = await mkdtemp(join(tmpdir(), "league-points-"));
    temporaryDirectories.push(directory);
    const databasePath = join(directory, "league-points.sqlite");
    const storeRepository =
      createSqliteStoreMembershipRepository(databasePath);

    storeRepository.createStore({ id: "STORE-1", name: "Local League" });
    storeRepository.close();

    const firstLeagueRepository =
      createSqliteMonthlyLeagueRepository(databasePath);

    firstLeagueRepository.createMonthlyLeague({
      storeId: "STORE-1",
      leagueMonth: "2026-11",
      tieBreakPolicy: "MANUAL_ORDER",
    });
    firstLeagueRepository.registerTournament({
      id: "TOURNAMENT-1",
      storeId: "STORE-1",
      leagueMonth: "2026-11",
      originalScheduledDate: "2026-11-04",
      effectiveDate: "2026-11-05",
      participants: [],
    });
    firstLeagueRepository.close();

    const reopenedLeagueRepository =
      createSqliteMonthlyLeagueRepository(databasePath);

    expect(
      reopenedLeagueRepository.findTournament("STORE-1", "TOURNAMENT-1"),
    ).toEqual({
      id: "TOURNAMENT-1",
      storeId: "STORE-1",
      leagueMonth: "2026-11",
      originalScheduledDate: "2026-11-04",
      effectiveDate: "2026-11-05",
      participants: [],
    });

    reopenedLeagueRepository.close();
  });

  it("persists tournament participants and invitation assignments after reopening", async () => {
    const directory = await mkdtemp(join(tmpdir(), "league-points-"));
    temporaryDirectories.push(directory);
    const databasePath = join(directory, "league-points.sqlite");
    const storeRepository =
      createSqliteStoreMembershipRepository(databasePath);

    storeRepository.createStore({ id: "STORE-1", name: "Local League" });
    storeRepository.close();

    const firstLeagueRepository =
      createSqliteMonthlyLeagueRepository(databasePath);

    firstLeagueRepository.createMonthlyLeague({
      storeId: "STORE-1",
      leagueMonth: "2026-11",
      tieBreakPolicy: "MANUAL_ORDER",
    });
    firstLeagueRepository.registerTournament({
      id: "TOURNAMENT-1",
      storeId: "STORE-1",
      leagueMonth: "2026-11",
      originalScheduledDate: "2026-11-04",
      effectiveDate: "2026-11-04",
      participants: [
        { playerId: "P0001", placement: 1 },
        {
          playerId: "P0002",
          placement: 2,
          invitedByPlayerId: "P0001",
        },
      ],
    });
    firstLeagueRepository.close();

    const reopenedLeagueRepository =
      createSqliteMonthlyLeagueRepository(databasePath);

    expect(
      reopenedLeagueRepository.findTournament("STORE-1", "TOURNAMENT-1"),
    ).toEqual({
      id: "TOURNAMENT-1",
      storeId: "STORE-1",
      leagueMonth: "2026-11",
      originalScheduledDate: "2026-11-04",
      effectiveDate: "2026-11-04",
      participants: [
        { playerId: "P0001", placement: 1 },
        {
          playerId: "P0002",
          placement: 2,
          invitedByPlayerId: "P0001",
        },
      ],
    });

    reopenedLeagueRepository.close();
  });

  it("rejects an inviter outside the tournament without persisting partial data", async () => {
    const directory = await mkdtemp(join(tmpdir(), "league-points-"));
    temporaryDirectories.push(directory);
    const databasePath = join(directory, "league-points.sqlite");
    const storeRepository =
      createSqliteStoreMembershipRepository(databasePath);

    storeRepository.createStore({ id: "STORE-1", name: "Local League" });
    storeRepository.close();

    const leagueRepository =
      createSqliteMonthlyLeagueRepository(databasePath);

    leagueRepository.createMonthlyLeague({
      storeId: "STORE-1",
      leagueMonth: "2026-11",
      tieBreakPolicy: "MANUAL_ORDER",
    });

    expect(() =>
      leagueRepository.registerTournament({
        id: "TOURNAMENT-1",
        storeId: "STORE-1",
        leagueMonth: "2026-11",
        originalScheduledDate: "2026-11-04",
        effectiveDate: "2026-11-04",
        participants: [
          {
            playerId: "P0002",
            placement: 1,
            invitedByPlayerId: "P9999",
          },
        ],
      }),
    ).toThrow();
    expect(
      leagueRepository.findTournament("STORE-1", "TOURNAMENT-1"),
    ).toBeUndefined();

    leagueRepository.close();
  });

  it("rejects a participant inviting themselves", async () => {
    const directory = await mkdtemp(join(tmpdir(), "league-points-"));
    temporaryDirectories.push(directory);
    const databasePath = join(directory, "league-points.sqlite");
    const storeRepository =
      createSqliteStoreMembershipRepository(databasePath);

    storeRepository.createStore({ id: "STORE-1", name: "Local League" });
    storeRepository.close();

    const leagueRepository =
      createSqliteMonthlyLeagueRepository(databasePath);

    leagueRepository.createMonthlyLeague({
      storeId: "STORE-1",
      leagueMonth: "2026-11",
      tieBreakPolicy: "MANUAL_ORDER",
    });

    expect(() =>
      leagueRepository.registerTournament({
        id: "TOURNAMENT-1",
        storeId: "STORE-1",
        leagueMonth: "2026-11",
        originalScheduledDate: "2026-11-04",
        effectiveDate: "2026-11-04",
        participants: [
          {
            playerId: "P0001",
            placement: 1,
            invitedByPlayerId: "P0001",
          },
        ],
      }),
    ).toThrow();
    expect(
      leagueRepository.findTournament("STORE-1", "TOURNAMENT-1"),
    ).toBeUndefined();

    leagueRepository.close();
  });

  it("lists tournaments only for the requested store and league month", async () => {
    const directory = await mkdtemp(join(tmpdir(), "league-points-"));
    temporaryDirectories.push(directory);
    const databasePath = join(directory, "league-points.sqlite");
    const storeRepository =
      createSqliteStoreMembershipRepository(databasePath);

    storeRepository.createStore({ id: "STORE-1", name: "Local League" });
    storeRepository.createStore({ id: "STORE-2", name: "Other League" });
    storeRepository.close();

    const leagueRepository =
      createSqliteMonthlyLeagueRepository(databasePath);

    for (const storeId of ["STORE-1", "STORE-2"]) {
      leagueRepository.createMonthlyLeague({
        storeId,
        leagueMonth: "2026-11",
        tieBreakPolicy: "MANUAL_ORDER",
      });
      leagueRepository.registerTournament({
        id: `TOURNAMENT-${storeId}`,
        storeId,
        leagueMonth: "2026-11",
        originalScheduledDate: "2026-11-04",
        effectiveDate: "2026-11-04",
        participants: [{ playerId: `PLAYER-${storeId}`, placement: 1 }],
      });
    }

    expect(
      leagueRepository.findTournamentsByLeague("STORE-1", "2026-11"),
    ).toEqual([
      {
        id: "TOURNAMENT-STORE-1",
        storeId: "STORE-1",
        leagueMonth: "2026-11",
        originalScheduledDate: "2026-11-04",
        effectiveDate: "2026-11-04",
        participants: [{ playerId: "PLAYER-STORE-1", placement: 1 }],
      },
    ]);

    leagueRepository.close();
  });

  it("rejects a tournament whose original date is outside its league month", async () => {
    const directory = await mkdtemp(join(tmpdir(), "league-points-"));
    temporaryDirectories.push(directory);
    const databasePath = join(directory, "league-points.sqlite");
    const storeRepository =
      createSqliteStoreMembershipRepository(databasePath);

    storeRepository.createStore({ id: "STORE-1", name: "Local League" });
    storeRepository.close();

    const leagueRepository =
      createSqliteMonthlyLeagueRepository(databasePath);

    leagueRepository.createMonthlyLeague({
      storeId: "STORE-1",
      leagueMonth: "2026-11",
      tieBreakPolicy: "MANUAL_ORDER",
    });

    expect(() =>
      leagueRepository.registerTournament({
        id: "TOURNAMENT-1",
        storeId: "STORE-1",
        leagueMonth: "2026-11",
        originalScheduledDate: "2026-12-02",
        effectiveDate: "2026-12-02",
        participants: [],
      }),
    ).toThrow();
    expect(
      leagueRepository.findTournament("STORE-1", "TOURNAMENT-1"),
    ).toBeUndefined();

    leagueRepository.close();
  });

  it("counts only a player's earlier tournaments at the same store", async () => {
    const directory = await mkdtemp(join(tmpdir(), "league-points-"));
    temporaryDirectories.push(directory);
    const databasePath = join(directory, "league-points.sqlite");
    const storeRepository =
      createSqliteStoreMembershipRepository(databasePath);

    storeRepository.createStore({ id: "STORE-1", name: "Local League" });
    storeRepository.createStore({ id: "STORE-2", name: "Other League" });
    storeRepository.close();

    const leagueRepository =
      createSqliteMonthlyLeagueRepository(databasePath);

    for (const storeId of ["STORE-1", "STORE-2"]) {
      for (const leagueMonth of ["2026-10", "2026-11"]) {
        leagueRepository.createMonthlyLeague({
          storeId,
          leagueMonth,
          tieBreakPolicy: "MANUAL_ORDER",
        });
      }
    }

    for (const tournament of [
      {
        id: "STORE-1-OCTOBER",
        storeId: "STORE-1",
        leagueMonth: "2026-10",
        originalScheduledDate: "2026-10-30",
      },
      {
        id: "STORE-2-OCTOBER",
        storeId: "STORE-2",
        leagueMonth: "2026-10",
        originalScheduledDate: "2026-10-30",
      },
      {
        id: "STORE-1-NOVEMBER",
        storeId: "STORE-1",
        leagueMonth: "2026-11",
        originalScheduledDate: "2026-11-06",
      },
    ]) {
      leagueRepository.registerTournament({
        ...tournament,
        effectiveDate: tournament.originalScheduledDate,
        participants: [{ playerId: "P0001", placement: 1 }],
      });
    }

    expect(
      leagueRepository.countPlayerTournamentsBefore({
        storeId: "STORE-1",
        playerId: "P0001",
        originalScheduledDate: "2026-11-04",
      }),
    ).toBe(1);

    leagueRepository.close();
  });

  it.each([
    {
      originalScheduledDate: "2026-11-31",
      effectiveDate: "2026-11-04",
    },
    {
      originalScheduledDate: "2026-11-04",
      effectiveDate: "not-a-date",
    },
  ])(
    "rejects invalid tournament dates %#",
    async ({ originalScheduledDate, effectiveDate }) => {
      const directory = await mkdtemp(join(tmpdir(), "league-points-"));
      temporaryDirectories.push(directory);
      const databasePath = join(directory, "league-points.sqlite");
      const storeRepository =
        createSqliteStoreMembershipRepository(databasePath);

      storeRepository.createStore({ id: "STORE-1", name: "Local League" });
      storeRepository.close();

      const leagueRepository =
        createSqliteMonthlyLeagueRepository(databasePath);

      leagueRepository.createMonthlyLeague({
        storeId: "STORE-1",
        leagueMonth: "2026-11",
        tieBreakPolicy: "MANUAL_ORDER",
      });

      expect(() =>
        leagueRepository.registerTournament({
          id: "TOURNAMENT-1",
          storeId: "STORE-1",
          leagueMonth: "2026-11",
          originalScheduledDate,
          effectiveDate,
          participants: [],
        }),
      ).toThrow();
      expect(
        leagueRepository.findTournament("STORE-1", "TOURNAMENT-1"),
      ).toBeUndefined();

      leagueRepository.close();
    },
  );

  it("rejects a non-positive participant placement", async () => {
    const directory = await mkdtemp(join(tmpdir(), "league-points-"));
    temporaryDirectories.push(directory);
    const databasePath = join(directory, "league-points.sqlite");
    const storeRepository =
      createSqliteStoreMembershipRepository(databasePath);

    storeRepository.createStore({ id: "STORE-1", name: "Local League" });
    storeRepository.close();

    const leagueRepository =
      createSqliteMonthlyLeagueRepository(databasePath);

    leagueRepository.createMonthlyLeague({
      storeId: "STORE-1",
      leagueMonth: "2026-11",
      tieBreakPolicy: "MANUAL_ORDER",
    });

    expect(() =>
      leagueRepository.registerTournament({
        id: "TOURNAMENT-1",
        storeId: "STORE-1",
        leagueMonth: "2026-11",
        originalScheduledDate: "2026-11-04",
        effectiveDate: "2026-11-04",
        participants: [{ playerId: "P0001", placement: 0 }],
      }),
    ).toThrow();
    expect(
      leagueRepository.findTournament("STORE-1", "TOURNAMENT-1"),
    ).toBeUndefined();

    leagueRepository.close();
  });

  it.each([
    {
      name: "Monday original date",
      originalScheduledDate: "2026-11-02",
      participants: [] as const,
    },
    {
      name: "placement beyond participant count",
      originalScheduledDate: "2026-11-04",
      participants: [{ playerId: "P0001", placement: 999 }],
    },
    {
      name: "duplicate placements",
      originalScheduledDate: "2026-11-04",
      participants: [
        { playerId: "P0001", placement: 1 },
        { playerId: "P0002", placement: 1 },
      ],
    },
  ])(
    "rejects invalid tournament structure: $name",
    async ({ originalScheduledDate, participants }) => {
      const directory = await mkdtemp(join(tmpdir(), "league-points-"));
      temporaryDirectories.push(directory);
      const databasePath = join(directory, "league-points.sqlite");
      const storeRepository =
        createSqliteStoreMembershipRepository(databasePath);

      storeRepository.createStore({ id: "STORE-1", name: "Local League" });
      storeRepository.close();

      const leagueRepository =
        createSqliteMonthlyLeagueRepository(databasePath);

      leagueRepository.createMonthlyLeague({
        storeId: "STORE-1",
        leagueMonth: "2026-11",
        tieBreakPolicy: "MANUAL_ORDER",
      });

      expect(() =>
        leagueRepository.registerTournament({
          id: "TOURNAMENT-1",
          storeId: "STORE-1",
          leagueMonth: "2026-11",
          originalScheduledDate,
          effectiveDate: originalScheduledDate,
          participants,
        }),
      ).toThrow();
      expect(
        leagueRepository.findTournament("STORE-1", "TOURNAMENT-1"),
      ).toBeUndefined();

      leagueRepository.close();
    },
  );

  it("rejects a second tournament for the same store and original date", async () => {
    const directory = await mkdtemp(join(tmpdir(), "league-points-"));
    temporaryDirectories.push(directory);
    const databasePath = join(directory, "league-points.sqlite");
    const storeRepository =
      createSqliteStoreMembershipRepository(databasePath);

    storeRepository.createStore({ id: "STORE-1", name: "Local League" });
    storeRepository.close();

    const leagueRepository =
      createSqliteMonthlyLeagueRepository(databasePath);

    leagueRepository.createMonthlyLeague({
      storeId: "STORE-1",
      leagueMonth: "2026-11",
      tieBreakPolicy: "MANUAL_ORDER",
    });
    leagueRepository.registerTournament({
      id: "TOURNAMENT-1",
      storeId: "STORE-1",
      leagueMonth: "2026-11",
      originalScheduledDate: "2026-11-04",
      effectiveDate: "2026-11-04",
      participants: [],
    });

    expect(() =>
      leagueRepository.registerTournament({
        id: "TOURNAMENT-2",
        storeId: "STORE-1",
        leagueMonth: "2026-11",
        originalScheduledDate: "2026-11-04",
        effectiveDate: "2026-11-06",
        participants: [],
      }),
    ).toThrow();
    expect(
      leagueRepository.findTournamentsByLeague("STORE-1", "2026-11"),
    ).toHaveLength(1);

    leagueRepository.close();
  });

  it("rejects a second league for the same store and calendar month", async () => {
    const directory = await mkdtemp(join(tmpdir(), "league-points-"));
    temporaryDirectories.push(directory);
    const databasePath = join(directory, "league-points.sqlite");
    const storeRepository =
      createSqliteStoreMembershipRepository(databasePath);

    storeRepository.createStore({ id: "STORE-1", name: "Local League" });
    storeRepository.close();

    const leagueRepository =
      createSqliteMonthlyLeagueRepository(databasePath);

    leagueRepository.createMonthlyLeague({
      storeId: "STORE-1",
      leagueMonth: "2026-11",
      tieBreakPolicy: "MANUAL_ORDER",
    });

    expect(
      leagueRepository.createMonthlyLeague({
        storeId: "STORE-1",
        leagueMonth: "2026-11",
        tieBreakPolicy: "PLAYOFF_MATCH",
      }),
    ).toEqual({
      ok: false,
      error: "MONTHLY_LEAGUE_ALREADY_EXISTS",
    });
    expect(
      leagueRepository.findMonthlyLeague("STORE-1", "2026-11"),
    ).toEqual({
      storeId: "STORE-1",
      leagueMonth: "2026-11",
      tieBreakPolicy: "MANUAL_ORDER",
    });

    leagueRepository.close();
  });

  it("changes the tie-break policy before a tournament is registered", async () => {
    const directory = await mkdtemp(join(tmpdir(), "league-points-"));
    temporaryDirectories.push(directory);
    const databasePath = join(directory, "league-points.sqlite");
    const storeRepository =
      createSqliteStoreMembershipRepository(databasePath);

    storeRepository.createStore({ id: "STORE-1", name: "Local League" });
    storeRepository.close();

    const leagueRepository =
      createSqliteMonthlyLeagueRepository(databasePath);

    leagueRepository.createMonthlyLeague({
      storeId: "STORE-1",
      leagueMonth: "2026-11",
      tieBreakPolicy: "MANUAL_ORDER",
    });

    expect(
      leagueRepository.changeTieBreakPolicy(
        "STORE-1",
        "2026-11",
        "PLAYOFF_MATCH",
      ),
    ).toEqual({
      ok: true,
      league: {
        storeId: "STORE-1",
        leagueMonth: "2026-11",
        tieBreakPolicy: "PLAYOFF_MATCH",
      },
    });
    expect(
      leagueRepository.findMonthlyLeague("STORE-1", "2026-11"),
    ).toEqual({
      storeId: "STORE-1",
      leagueMonth: "2026-11",
      tieBreakPolicy: "PLAYOFF_MATCH",
    });

    leagueRepository.close();
  });

  it("rejects changing the policy after a persisted tournament registration", async () => {
    const directory = await mkdtemp(join(tmpdir(), "league-points-"));
    temporaryDirectories.push(directory);
    const databasePath = join(directory, "league-points.sqlite");
    const storeRepository =
      createSqliteStoreMembershipRepository(databasePath);

    storeRepository.createStore({ id: "STORE-1", name: "Local League" });
    storeRepository.close();

    const leagueRepository =
      createSqliteMonthlyLeagueRepository(databasePath);

    leagueRepository.createMonthlyLeague({
      storeId: "STORE-1",
      leagueMonth: "2026-11",
      tieBreakPolicy: "MANUAL_ORDER",
    });
    leagueRepository.registerTournament({
      id: "TOURNAMENT-1",
      storeId: "STORE-1",
      leagueMonth: "2026-11",
      originalScheduledDate: "2026-11-04",
      effectiveDate: "2026-11-04",
      participants: [],
    });
    leagueRepository.close();

    const reopenedLeagueRepository =
      createSqliteMonthlyLeagueRepository(databasePath);

    expect(
      reopenedLeagueRepository.changeTieBreakPolicy(
        "STORE-1",
        "2026-11",
        "PLAYOFF_MATCH",
      ),
    ).toEqual({
      ok: false,
      error: "TIE_BREAK_POLICY_LOCKED",
    });
    expect(
      reopenedLeagueRepository.findMonthlyLeague("STORE-1", "2026-11"),
    ).toEqual({
      storeId: "STORE-1",
      leagueMonth: "2026-11",
      tieBreakPolicy: "MANUAL_ORDER",
    });

    reopenedLeagueRepository.close();
  });

  it("does not let one store's tournament lock another store's league", async () => {
    const directory = await mkdtemp(join(tmpdir(), "league-points-"));
    temporaryDirectories.push(directory);
    const databasePath = join(directory, "league-points.sqlite");
    const storeRepository =
      createSqliteStoreMembershipRepository(databasePath);

    storeRepository.createStore({ id: "STORE-1", name: "Local League" });
    storeRepository.createStore({ id: "STORE-2", name: "Other League" });
    storeRepository.close();

    const leagueRepository =
      createSqliteMonthlyLeagueRepository(databasePath);

    leagueRepository.createMonthlyLeague({
      storeId: "STORE-1",
      leagueMonth: "2026-11",
      tieBreakPolicy: "MANUAL_ORDER",
    });
    leagueRepository.createMonthlyLeague({
      storeId: "STORE-2",
      leagueMonth: "2026-11",
      tieBreakPolicy: "MANUAL_ORDER",
    });
    leagueRepository.registerTournament({
      id: "TOURNAMENT-1",
      storeId: "STORE-1",
      leagueMonth: "2026-11",
      originalScheduledDate: "2026-11-04",
      effectiveDate: "2026-11-04",
      participants: [],
    });

    expect(
      leagueRepository.changeTieBreakPolicy(
        "STORE-1",
        "2026-11",
        "PLAYOFF_MATCH",
      ),
    ).toEqual({
      ok: false,
      error: "TIE_BREAK_POLICY_LOCKED",
    });
    expect(
      leagueRepository.changeTieBreakPolicy(
        "STORE-2",
        "2026-11",
        "PLAYOFF_MATCH",
      ),
    ).toEqual({
      ok: true,
      league: {
        storeId: "STORE-2",
        leagueMonth: "2026-11",
        tieBreakPolicy: "PLAYOFF_MATCH",
      },
    });

    leagueRepository.close();
  });

  it.each(["", "2026-13", "2026-1", "not-a-month"])(
    "rejects invalid calendar month %j",
    async (leagueMonth) => {
      const directory = await mkdtemp(join(tmpdir(), "league-points-"));
      temporaryDirectories.push(directory);
      const databasePath = join(directory, "league-points.sqlite");
      const storeRepository =
        createSqliteStoreMembershipRepository(databasePath);

      storeRepository.createStore({ id: "STORE-1", name: "Local League" });
      storeRepository.close();

      const leagueRepository =
        createSqliteMonthlyLeagueRepository(databasePath);

      expect(() =>
        leagueRepository.createMonthlyLeague({
          storeId: "STORE-1",
          leagueMonth,
          tieBreakPolicy: "MANUAL_ORDER",
        }),
      ).toThrow();
      expect(
        leagueRepository.findMonthlyLeague("STORE-1", leagueMonth),
      ).toBeUndefined();

      leagueRepository.close();
    },
  );

  it("rejects leagues and tournaments whose parent records do not exist", async () => {
    const directory = await mkdtemp(join(tmpdir(), "league-points-"));
    temporaryDirectories.push(directory);
    const databasePath = join(directory, "league-points.sqlite");
    const storeRepository =
      createSqliteStoreMembershipRepository(databasePath);

    storeRepository.createStore({ id: "STORE-1", name: "Local League" });
    storeRepository.close();

    const leagueRepository =
      createSqliteMonthlyLeagueRepository(databasePath);

    expect(() =>
      leagueRepository.createMonthlyLeague({
        storeId: "STORE-UNKNOWN",
        leagueMonth: "2026-11",
        tieBreakPolicy: "MANUAL_ORDER",
      }),
    ).toThrow();

    leagueRepository.createMonthlyLeague({
      storeId: "STORE-1",
      leagueMonth: "2026-11",
      tieBreakPolicy: "MANUAL_ORDER",
    });

    expect(() =>
      leagueRepository.registerTournament({
        id: "TOURNAMENT-1",
        storeId: "STORE-1",
        leagueMonth: "2026-12",
        originalScheduledDate: "2026-12-02",
        effectiveDate: "2026-12-02",
        participants: [],
      }),
    ).toThrow();
    expect(
      leagueRepository.findMonthlyLeague("STORE-UNKNOWN", "2026-11"),
    ).toBeUndefined();

    leagueRepository.close();
  });
});
