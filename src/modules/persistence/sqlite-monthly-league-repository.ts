import { DatabaseSync } from "node:sqlite";

import type { TieBreakPolicy } from "../league/configure-tie-break-policy";

export type MonthlyLeague = Readonly<{
  storeId: string;
  leagueMonth: string;
  tieBreakPolicy: TieBreakPolicy;
}>;

export type TournamentRegistration = Readonly<{
  id: string;
  storeId: string;
  leagueMonth: string;
}>;

type CreateMonthlyLeagueResult =
  | Readonly<{ ok: true }>
  | Readonly<{
      ok: false;
      error: "MONTHLY_LEAGUE_ALREADY_EXISTS";
    }>;

type ChangeTieBreakPolicyResult =
  | Readonly<{
      ok: true;
      league: MonthlyLeague;
    }>
  | Readonly<{
      ok: false;
      error: "TIE_BREAK_POLICY_LOCKED";
    }>;

export interface MonthlyLeagueRepository {
  createMonthlyLeague(league: MonthlyLeague): CreateMonthlyLeagueResult;
  findMonthlyLeague(
    storeId: string,
    leagueMonth: string,
  ): MonthlyLeague | undefined;
  changeTieBreakPolicy(
    storeId: string,
    leagueMonth: string,
    newTieBreakPolicy: TieBreakPolicy,
  ): ChangeTieBreakPolicyResult;
  registerTournament(tournament: TournamentRegistration): void;
  close(): void;
}

export function createSqliteMonthlyLeagueRepository(
  databasePath: string,
): MonthlyLeagueRepository {
  const database = new DatabaseSync(databasePath);

  database.exec(`
    CREATE TABLE IF NOT EXISTS monthly_leagues (
      store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
      league_month TEXT NOT NULL CHECK (
        length(league_month) = 7
        AND league_month GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]'
        AND CAST(substr(league_month, 6, 2) AS INTEGER) BETWEEN 1 AND 12
      ),
      tie_break_policy TEXT NOT NULL CHECK (
        tie_break_policy IN ('MANUAL_ORDER', 'PLAYOFF_MATCH')
      ),
      PRIMARY KEY (store_id, league_month)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS tournaments (
      id TEXT PRIMARY KEY,
      store_id TEXT NOT NULL,
      league_month TEXT NOT NULL,
      FOREIGN KEY (store_id, league_month)
        REFERENCES monthly_leagues (store_id, league_month)
        ON DELETE CASCADE
    ) STRICT;
  `);

  function findMonthlyLeague(
    storeId: string,
    leagueMonth: string,
  ): MonthlyLeague | undefined {
    const row = database
      .prepare(`
        SELECT
          store_id AS storeId,
          league_month AS leagueMonth,
          tie_break_policy AS tieBreakPolicy
        FROM monthly_leagues
        WHERE store_id = ? AND league_month = ?
      `)
      .get(storeId, leagueMonth);

    if (row === undefined) {
      return undefined;
    }

    if (
      typeof row.storeId !== "string" ||
      typeof row.leagueMonth !== "string" ||
      (row.tieBreakPolicy !== "MANUAL_ORDER" &&
        row.tieBreakPolicy !== "PLAYOFF_MATCH")
    ) {
      throw new Error("INVALID_MONTHLY_LEAGUE_ROW");
    }

    return {
      storeId: row.storeId,
      leagueMonth: row.leagueMonth,
      tieBreakPolicy: row.tieBreakPolicy,
    };
  }

  return {
    createMonthlyLeague(league: MonthlyLeague) {
      const result = database
        .prepare(`
          INSERT INTO monthly_leagues (
            store_id,
            league_month,
            tie_break_policy
          ) VALUES (?, ?, ?)
          ON CONFLICT (store_id, league_month) DO NOTHING
        `)
        .run(league.storeId, league.leagueMonth, league.tieBreakPolicy);

      if (result.changes === 0) {
        return {
          ok: false,
          error: "MONTHLY_LEAGUE_ALREADY_EXISTS",
        } as const;
      }

      return { ok: true } as const;
    },

    findMonthlyLeague,

    changeTieBreakPolicy(storeId, leagueMonth, newTieBreakPolicy) {
      const result = database
        .prepare(`
          UPDATE monthly_leagues
          SET tie_break_policy = ?
          WHERE store_id = ?
            AND league_month = ?
            AND NOT EXISTS (
              SELECT 1
              FROM tournaments
              WHERE tournaments.store_id = monthly_leagues.store_id
                AND tournaments.league_month = monthly_leagues.league_month
            )
        `)
        .run(newTieBreakPolicy, storeId, leagueMonth);

      const league = findMonthlyLeague(storeId, leagueMonth);

      if (league === undefined) {
        throw new Error("MONTHLY_LEAGUE_NOT_FOUND");
      }

      if (result.changes === 0) {
        return {
          ok: false,
          error: "TIE_BREAK_POLICY_LOCKED",
        };
      }

      return {
        ok: true,
        league,
      };
    },

    registerTournament(tournament: TournamentRegistration) {
      database
        .prepare(`
          INSERT INTO tournaments (id, store_id, league_month)
          VALUES (?, ?, ?)
        `)
        .run(tournament.id, tournament.storeId, tournament.leagueMonth);
    },

    close() {
      database.close();
    },
  };
}
