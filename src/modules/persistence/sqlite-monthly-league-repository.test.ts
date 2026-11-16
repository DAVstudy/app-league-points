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
      }),
    ).toThrow();
    expect(
      leagueRepository.findMonthlyLeague("STORE-UNKNOWN", "2026-11"),
    ).toBeUndefined();

    leagueRepository.close();
  });
});
