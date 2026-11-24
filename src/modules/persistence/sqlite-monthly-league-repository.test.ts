import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { afterEach, describe, expect, it } from "vitest";

import { revokeStoreOrganizerMembership } from "../authentication/revoke-store-organizer-membership";
import { createSqliteMonthlyLeagueRepository } from "./sqlite-monthly-league-repository";
import { createSqliteStoreMembershipRepository } from "./sqlite-store-membership-repository";

async function hashFile(path: string): Promise<string> {
  const contents = await readFile(path);

  return createHash("sha256").update(contents).digest("hex");
}

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

  it.each([false, true])("retains audited authorship after revocation (legacy database: %s)", async (legacy) => {
    const directory = await mkdtemp(join(tmpdir(), "league-points-"));
    temporaryDirectories.push(directory);
    const databasePath = join(directory, "league-points.sqlite");
    const stores = createSqliteStoreMembershipRepository(databasePath);
    for (const storeId of ["STORE-1", "STORE-2"]) {
      stores.createStore({ id: storeId, name: storeId });
      stores.addOrganizerMembership({ storeId, organizerId: "AUTHOR" });
      stores.addOrganizerMembership({ storeId, organizerId: "KEEPER" });
    }
    let leagues = createSqliteMonthlyLeagueRepository(databasePath);
    const league = {
      storeId: "STORE-1",
      leagueMonth: "2026-11",
      tieBreakPolicy: "PLAYOFF_MATCH",
    } as const;
    leagues.createMonthlyLeague(league);
    const tournament = {
      id: "TOURNAMENT-1",
      storeId: league.storeId,
      leagueMonth: league.leagueMonth,
      originalScheduledDate: "2026-11-04",
      effectiveDate: "2026-11-05",
      participants: [
        { playerId: "P1", placement: 1 },
        { playerId: "P2", placement: 2, invitedByPlayerId: "P1" },
      ],
    };
    leagues.registerTournament(tournament);
    const resolution = {
      storeId: league.storeId,
      leagueMonth: league.leagueMonth,
      configuredPolicy: "PLAYOFF_MATCH",
      resolutionMethod: "MANUAL_ORDER",
      fallbackReason: "Playoff unavailable",
      orderedPlayerIds: ["P2", "P1"],
      recordedByOrganizerId: "AUTHOR",
      recordedAt: "2026-11-30T20:00:00.000Z",
    } as const;
    leagues.recordTieBreakResolution(resolution);
    leagues.recordTieBreakResolution({
      ...resolution,
      orderedPlayerIds: ["P1", "P2"],
    });
    const history = leagues.findTieBreakResolutionHistory("STORE-1", "2026-11");
    leagues.close();

    if (legacy) {
      // Rebuild only the fixture's audit table with the original membership FK.
      // Seeded revisions and child player orders must survive the real upgrade.
      const database = new DatabaseSync(databasePath);
      database.exec(`
        PRAGMA foreign_keys = OFF;
        BEGIN;
        CREATE TABLE legacy_revisions (
          store_id TEXT NOT NULL,
          league_month TEXT NOT NULL,
          revision INTEGER NOT NULL CHECK (revision > 0),
          configured_policy TEXT NOT NULL CHECK (
            configured_policy IN ('MANUAL_ORDER', 'PLAYOFF_MATCH')
          ),
          resolution_method TEXT NOT NULL CHECK (
            resolution_method IN ('MANUAL_ORDER', 'PLAYOFF_MATCH')
          ),
          fallback_reason TEXT,
          recorded_by_organizer_id TEXT NOT NULL,
          recorded_at TEXT NOT NULL,
          PRIMARY KEY (store_id, league_month, revision),
          FOREIGN KEY (store_id, league_month)
            REFERENCES monthly_leagues (store_id, league_month) ON DELETE CASCADE,
          FOREIGN KEY (store_id, recorded_by_organizer_id)
            REFERENCES organizer_memberships (store_id, organizer_id),
          CHECK (
            (configured_policy = 'MANUAL_ORDER' AND resolution_method = 'MANUAL_ORDER'
              AND fallback_reason IS NULL) OR
            (configured_policy = 'PLAYOFF_MATCH' AND resolution_method = 'PLAYOFF_MATCH'
              AND fallback_reason IS NULL) OR
            (configured_policy = 'PLAYOFF_MATCH' AND resolution_method = 'MANUAL_ORDER'
              AND length(trim(fallback_reason)) > 0)
          )
        ) STRICT;
        INSERT INTO legacy_revisions SELECT * FROM tie_break_resolution_revisions;
        DROP TABLE tie_break_resolution_revisions;
        ALTER TABLE legacy_revisions RENAME TO tie_break_resolution_revisions;
        COMMIT;
      `);
      database.close();
    }

    leagues = createSqliteMonthlyLeagueRepository(databasePath);
    const revoke = (actorOrganizerId: string, targetOrganizerId: string) =>
      revokeStoreOrganizerMembership({
        actorOrganizerId,
        targetOrganizerId,
        storeId: "STORE-1",
        memberships: stores.findOrganizerMembershipsByStore("STORE-1"),
        removeMembership: stores.removeOrganizerMembership,
      });
    expect(revoke("KEEPER", "AUTHOR")).toEqual({ ok: true });
    expect(stores.findOrganizerMembershipsByStore("STORE-1")).toEqual([
      { storeId: "STORE-1", organizerId: "KEEPER" },
    ]);
    expect(stores.findOrganizerMembershipsByStore("STORE-2")).toEqual([
      { storeId: "STORE-2", organizerId: "AUTHOR" },
      { storeId: "STORE-2", organizerId: "KEEPER" },
    ]);
    const hashBeforeRejections = await hashFile(databasePath);
    expect(revoke("AUTHOR", "KEEPER")).toEqual({
      ok: false,
      error: "STORE_ACCESS_DENIED",
    });
    expect(stores.removeOrganizerMembership({
      storeId: "STORE-1",
      organizerId: "KEEPER",
    })).toEqual({ ok: false, error: "LAST_STORE_ORGANIZER_REQUIRED" });
    expect(stores.findOrganizerMembershipsByStore("STORE-1")).toEqual([
      { storeId: "STORE-1", organizerId: "KEEPER" },
    ]);
    expect(
      leagues.findTieBreakResolutionHistory("STORE-1", "2026-11"),
    ).toEqual(history);
    expect(await hashFile(databasePath)).toBe(hashBeforeRejections);
    for (const recordedByOrganizerId of ["AUTHOR", "UNKNOWN"]) {
      expect(() => leagues.recordTieBreakResolution({
        ...resolution,
        recordedByOrganizerId,
      })).toThrow();
      expect(
        leagues.findTieBreakResolutionHistory("STORE-1", "2026-11"),
      ).toEqual(history);
      expect(leagues.findTournament("STORE-1", tournament.id)).toEqual(tournament);
      expect(await hashFile(databasePath)).toBe(hashBeforeRejections);
    }
    // An active author still cannot bypass the existing policy validation.
    expect(() => leagues.recordTieBreakResolution({
      ...resolution,
      recordedByOrganizerId: "KEEPER",
      configuredPolicy: "MANUAL_ORDER",
    })).toThrow("TIE_BREAK_POLICY_MISMATCH");
    expect(await hashFile(databasePath)).toBe(hashBeforeRejections);
    leagues.recordTieBreakResolution({ ...resolution, recordedByOrganizerId: "KEEPER" });
    leagues.close();
    stores.close();

    leagues = createSqliteMonthlyLeagueRepository(databasePath);
    const reopenedStores = createSqliteStoreMembershipRepository(databasePath);
    expect(
      leagues.findTieBreakResolutionHistory("STORE-1", "2026-11"),
    ).toEqual([
      ...history,
      { ...resolution, recordedByOrganizerId: "KEEPER", revision: 3 },
    ]);
    expect(leagues.findMonthlyLeague("STORE-1", "2026-11")).toEqual(league);
    expect(leagues.findTournament("STORE-1", tournament.id)).toEqual(tournament);
    expect(reopenedStores.findOrganizerMembershipsByStore("STORE-1")).toEqual([
      { storeId: "STORE-1", organizerId: "KEEPER" },
    ]);
    leagues.close();
    reopenedStores.close();
  });

  it.each([false, true])("preserves policy error precedence (installed old trigger: %s)", async (oldTrigger) => {
    const directory = await mkdtemp(join(tmpdir(), "league-points-"));
    temporaryDirectories.push(directory);
    const databasePath = join(directory, "league-points.sqlite");
    const stores = createSqliteStoreMembershipRepository(databasePath);
    for (const [storeId, organizerId] of [["A", "KEEPER"], ["B", "AUTHOR"]] as const) {
      stores.createStore({ id: storeId, name: storeId });
      stores.addOrganizerMembership({ storeId, organizerId });
    }
    const league = {
      storeId: "A",
      leagueMonth: "2026-11",
      tieBreakPolicy: "PLAYOFF_MATCH",
    } as const;
    const resolution = {
      storeId: "A",
      leagueMonth: "2026-11",
      configuredPolicy: "PLAYOFF_MATCH",
      resolutionMethod: "PLAYOFF_MATCH",
      orderedPlayerIds: ["P1", "P2"],
      recordedByOrganizerId: "KEEPER",
      recordedAt: "2026-11-30T20:00:00.000Z",
    } as const;
    let leagues = createSqliteMonthlyLeagueRepository(databasePath);
    leagues.createMonthlyLeague(league);
    leagues.recordTieBreakResolution(resolution);
    const history = leagues.findTieBreakResolutionHistory("A", "2026-11");
    leagues.close();
    if (oldTrigger) {
      const database = new DatabaseSync(databasePath);
      database.exec(`
        DROP TRIGGER validate_tie_break_resolution_membership;
        CREATE TRIGGER validate_tie_break_resolution_membership
        BEFORE INSERT ON tie_break_resolution_revisions
        WHEN NOT EXISTS (
          SELECT 1 FROM organizer_memberships
          WHERE store_id = NEW.store_id
            AND organizer_id = NEW.recorded_by_organizer_id
        )
        BEGIN
          SELECT RAISE(ABORT, 'FOREIGN KEY constraint failed');
        END;
      `);
      database.close();
    }
    leagues = createSqliteMonthlyLeagueRepository(databasePath);
    const hashBeforeRejections = await hashFile(databasePath);
    for (let reopen = 0; reopen < 2; reopen += 1) {
      for (const recordedByOrganizerId of ["AUTHOR", "UNKNOWN"]) {
        for (const configuredPolicy of ["MANUAL_ORDER", "PLAYOFF_MATCH"] as const) {
          expect(() => leagues.recordTieBreakResolution({
            ...resolution,
            recordedByOrganizerId,
            configuredPolicy,
            resolutionMethod: configuredPolicy,
          })).toThrow(expect.objectContaining({
            message: configuredPolicy === "MANUAL_ORDER"
              ? "TIE_BREAK_POLICY_MISMATCH"
              : "FOREIGN KEY constraint failed",
          }));
          expect(leagues.findTieBreakResolutionHistory("A", "2026-11")).toEqual(history);
          expect(leagues.findMonthlyLeague("A", "2026-11")).toEqual(league);
          expect(stores.findOrganizerMembershipsByStore("A")).toEqual([
            { storeId: "A", organizerId: "KEEPER" },
          ]);
          expect(await hashFile(databasePath)).toBe(hashBeforeRejections);
        }
      }
      leagues.close();
      leagues = createSqliteMonthlyLeagueRepository(databasePath);
      expect(await hashFile(databasePath)).toBe(hashBeforeRejections);
    }
    leagues.recordTieBreakResolution(resolution);
    expect(leagues.findTieBreakResolutionHistory("A", "2026-11")).toEqual([
      ...history, { ...resolution, revision: 2 },
    ]);
    leagues.close();
    stores.close();
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

  it("persists an auditable tie-break resolution after reopening", async () => {
    const directory = await mkdtemp(join(tmpdir(), "league-points-"));
    temporaryDirectories.push(directory);
    const databasePath = join(directory, "league-points.sqlite");
    const storeRepository =
      createSqliteStoreMembershipRepository(databasePath);

    storeRepository.createStore({ id: "STORE-1", name: "Local League" });
    storeRepository.addOrganizerMembership({
      storeId: "STORE-1",
      organizerId: "ORGANIZER-1",
    });
    storeRepository.close();

    const firstLeagueRepository =
      createSqliteMonthlyLeagueRepository(databasePath);

    firstLeagueRepository.createMonthlyLeague({
      storeId: "STORE-1",
      leagueMonth: "2026-11",
      tieBreakPolicy: "PLAYOFF_MATCH",
    });
    firstLeagueRepository.recordTieBreakResolution({
      storeId: "STORE-1",
      leagueMonth: "2026-11",
      configuredPolicy: "PLAYOFF_MATCH",
      resolutionMethod: "MANUAL_ORDER",
      orderedPlayerIds: ["P0001", "P0002"],
      fallbackReason: "One player could not attend the playoff.",
      recordedByOrganizerId: "ORGANIZER-1",
      recordedAt: "2026-11-30T20:00:00.000Z",
    });
    firstLeagueRepository.close();

    const reopenedLeagueRepository =
      createSqliteMonthlyLeagueRepository(databasePath);

    expect(
      reopenedLeagueRepository.findTieBreakResolutionHistory(
        "STORE-1",
        "2026-11",
      ),
    ).toEqual([
      {
        revision: 1,
        storeId: "STORE-1",
        leagueMonth: "2026-11",
        configuredPolicy: "PLAYOFF_MATCH",
        resolutionMethod: "MANUAL_ORDER",
        orderedPlayerIds: ["P0001", "P0002"],
        fallbackReason: "One player could not attend the playoff.",
        recordedByOrganizerId: "ORGANIZER-1",
        recordedAt: "2026-11-30T20:00:00.000Z",
      },
    ]);

    reopenedLeagueRepository.close();
  });

  it("retains the original resolution when an organizer records a correction", async () => {
    const directory = await mkdtemp(join(tmpdir(), "league-points-"));
    temporaryDirectories.push(directory);
    const databasePath = join(directory, "league-points.sqlite");
    const storeRepository =
      createSqliteStoreMembershipRepository(databasePath);

    storeRepository.createStore({ id: "STORE-1", name: "Local League" });
    storeRepository.addOrganizerMembership({
      storeId: "STORE-1",
      organizerId: "ORGANIZER-1",
    });
    storeRepository.close();

    const leagueRepository =
      createSqliteMonthlyLeagueRepository(databasePath);

    leagueRepository.createMonthlyLeague({
      storeId: "STORE-1",
      leagueMonth: "2026-11",
      tieBreakPolicy: "PLAYOFF_MATCH",
    });
    leagueRepository.recordTieBreakResolution({
      storeId: "STORE-1",
      leagueMonth: "2026-11",
      configuredPolicy: "PLAYOFF_MATCH",
      resolutionMethod: "MANUAL_ORDER",
      orderedPlayerIds: ["P0001", "P0002"],
      fallbackReason: "One player could not attend the playoff.",
      recordedByOrganizerId: "ORGANIZER-1",
      recordedAt: "2026-11-30T20:00:00.000Z",
    });
    leagueRepository.recordTieBreakResolution({
      storeId: "STORE-1",
      leagueMonth: "2026-11",
      configuredPolicy: "PLAYOFF_MATCH",
      resolutionMethod: "PLAYOFF_MATCH",
      orderedPlayerIds: ["P0002", "P0001"],
      recordedByOrganizerId: "ORGANIZER-1",
      recordedAt: "2026-11-30T21:00:00.000Z",
    });

    expect(
      leagueRepository.findTieBreakResolutionHistory(
        "STORE-1",
        "2026-11",
      ),
    ).toEqual([
      {
        revision: 1,
        storeId: "STORE-1",
        leagueMonth: "2026-11",
        configuredPolicy: "PLAYOFF_MATCH",
        resolutionMethod: "MANUAL_ORDER",
        orderedPlayerIds: ["P0001", "P0002"],
        fallbackReason: "One player could not attend the playoff.",
        recordedByOrganizerId: "ORGANIZER-1",
        recordedAt: "2026-11-30T20:00:00.000Z",
      },
      {
        revision: 2,
        storeId: "STORE-1",
        leagueMonth: "2026-11",
        configuredPolicy: "PLAYOFF_MATCH",
        resolutionMethod: "PLAYOFF_MATCH",
        orderedPlayerIds: ["P0002", "P0001"],
        recordedByOrganizerId: "ORGANIZER-1",
        recordedAt: "2026-11-30T21:00:00.000Z",
      },
    ]);

    leagueRepository.close();
  });

  it("rejects a resolution whose configured policy differs from the league", async () => {
    const directory = await mkdtemp(join(tmpdir(), "league-points-"));
    temporaryDirectories.push(directory);
    const databasePath = join(directory, "league-points.sqlite");
    const storeRepository =
      createSqliteStoreMembershipRepository(databasePath);

    storeRepository.createStore({ id: "STORE-1", name: "Local League" });
    storeRepository.addOrganizerMembership({
      storeId: "STORE-1",
      organizerId: "ORGANIZER-1",
    });
    storeRepository.close();

    const leagueRepository =
      createSqliteMonthlyLeagueRepository(databasePath);

    leagueRepository.createMonthlyLeague({
      storeId: "STORE-1",
      leagueMonth: "2026-11",
      tieBreakPolicy: "PLAYOFF_MATCH",
    });

    expect(() =>
      leagueRepository.recordTieBreakResolution({
        storeId: "STORE-1",
        leagueMonth: "2026-11",
        configuredPolicy: "MANUAL_ORDER",
        resolutionMethod: "MANUAL_ORDER",
        orderedPlayerIds: ["P0001", "P0002"],
        recordedByOrganizerId: "ORGANIZER-1",
        recordedAt: "2026-11-30T20:00:00.000Z",
      }),
    ).toThrow();
    expect(
      leagueRepository.findTieBreakResolutionHistory(
        "STORE-1",
        "2026-11",
      ),
    ).toEqual([]);

    leagueRepository.close();
  });

  it("rejects an empty audited final order atomically", async () => {
    const directory = await mkdtemp(join(tmpdir(), "league-points-"));
    temporaryDirectories.push(directory);
    const databasePath = join(directory, "league-points.sqlite");
    const storeRepository =
      createSqliteStoreMembershipRepository(databasePath);

    storeRepository.createStore({ id: "STORE-1", name: "Local League" });
    storeRepository.addOrganizerMembership({
      storeId: "STORE-1",
      organizerId: "ORGANIZER-1",
    });
    storeRepository.close();

    const leagueRepository =
      createSqliteMonthlyLeagueRepository(databasePath);

    leagueRepository.createMonthlyLeague({
      storeId: "STORE-1",
      leagueMonth: "2026-11",
      tieBreakPolicy: "MANUAL_ORDER",
    });
    const hashBeforeRejection = await hashFile(databasePath);

    expect(() =>
      leagueRepository.recordTieBreakResolution({
        storeId: "STORE-1",
        leagueMonth: "2026-11",
        configuredPolicy: "MANUAL_ORDER",
        resolutionMethod: "MANUAL_ORDER",
        orderedPlayerIds: [],
        recordedByOrganizerId: "ORGANIZER-1",
        recordedAt: "2026-11-30T20:00:00.000Z",
      }),
    ).toThrow("INVALID_TIE_BREAK_ORDER");
    expect(
      leagueRepository.findTieBreakResolutionHistory(
        "STORE-1",
        "2026-11",
      ),
    ).toEqual([]);
    expect(await hashFile(databasePath)).toBe(hashBeforeRejection);

    leagueRepository.close();
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
