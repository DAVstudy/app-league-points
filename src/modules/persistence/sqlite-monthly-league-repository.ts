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
  originalScheduledDate: string;
  effectiveDate: string;
  participants: ReadonlyArray<TournamentParticipant>;
}>;

export type TournamentParticipant = Readonly<{
  playerId: string;
  placement: number;
  invitedByPlayerId?: string;
}>;

export type PlayerTournamentHistoryQuery = Readonly<{
  storeId: string;
  playerId: string;
  originalScheduledDate: string;
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
  findTournament(
    storeId: string,
    tournamentId: string,
  ): TournamentRegistration | undefined;
  findTournamentsByLeague(
    storeId: string,
    leagueMonth: string,
  ): ReadonlyArray<TournamentRegistration>;
  countPlayerTournamentsBefore(query: PlayerTournamentHistoryQuery): number;
  close(): void;
}

export function createSqliteMonthlyLeagueRepository(
  databasePath: string,
): MonthlyLeagueRepository {
  const database = new DatabaseSync(databasePath);

  database.exec("PRAGMA foreign_keys = ON;");

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

    CREATE TABLE IF NOT EXISTS tournament_details (
      tournament_id TEXT PRIMARY KEY
        REFERENCES tournaments(id) ON DELETE CASCADE,
      original_scheduled_date TEXT NOT NULL CHECK (
        length(original_scheduled_date) = 10
        AND original_scheduled_date GLOB
          '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
        AND date(original_scheduled_date, '+0 days') = original_scheduled_date
        AND strftime('%w', original_scheduled_date) IN ('3', '5')
      ),
      effective_date TEXT NOT NULL CHECK (
        length(effective_date) = 10
        AND effective_date GLOB
          '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
        AND date(effective_date, '+0 days') = effective_date
      )
    ) STRICT;

    CREATE TABLE IF NOT EXISTS tournament_participants (
      tournament_id TEXT NOT NULL
        REFERENCES tournaments(id) ON DELETE CASCADE,
      player_id TEXT NOT NULL,
      placement INTEGER NOT NULL CHECK (placement > 0),
      invited_by_player_id TEXT CHECK (
        invited_by_player_id IS NULL OR invited_by_player_id <> player_id
      ),
      PRIMARY KEY (tournament_id, player_id),
      FOREIGN KEY (tournament_id, invited_by_player_id)
        REFERENCES tournament_participants (tournament_id, player_id)
        DEFERRABLE INITIALLY DEFERRED
    ) STRICT;

    CREATE TRIGGER IF NOT EXISTS validate_tournament_original_month
    BEFORE INSERT ON tournament_details
    WHEN substr(NEW.original_scheduled_date, 1, 7) <> (
      SELECT league_month
      FROM tournaments
      WHERE id = NEW.tournament_id
    )
    BEGIN
      SELECT RAISE(ABORT, 'ORIGINAL_DATE_OUTSIDE_LEAGUE_MONTH');
    END;

    CREATE TRIGGER IF NOT EXISTS prevent_duplicate_tournament_schedule_slot
    BEFORE INSERT ON tournament_details
    WHEN EXISTS (
      SELECT 1
      FROM tournament_details AS existing_details
      INNER JOIN tournaments AS existing_tournament
        ON existing_tournament.id = existing_details.tournament_id
      INNER JOIN tournaments AS new_tournament
        ON new_tournament.id = NEW.tournament_id
      WHERE existing_tournament.store_id = new_tournament.store_id
        AND existing_details.original_scheduled_date =
          NEW.original_scheduled_date
    )
    BEGIN
      SELECT RAISE(ABORT, 'TOURNAMENT_SCHEDULE_SLOT_ALREADY_EXISTS');
    END;
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

  function findTournament(
    storeId: string,
    tournamentId: string,
  ): TournamentRegistration | undefined {
    const row = database
      .prepare(`
        SELECT
          id,
          store_id AS storeId,
          league_month AS leagueMonth,
          tournament_details.original_scheduled_date AS originalScheduledDate,
          tournament_details.effective_date AS effectiveDate
        FROM tournaments
        INNER JOIN tournament_details
          ON tournament_details.tournament_id = tournaments.id
        WHERE tournaments.store_id = ? AND tournaments.id = ?
      `)
      .get(storeId, tournamentId);

    if (row === undefined) {
      return undefined;
    }

    if (
      typeof row.id !== "string" ||
      typeof row.storeId !== "string" ||
      typeof row.leagueMonth !== "string" ||
      typeof row.originalScheduledDate !== "string" ||
      typeof row.effectiveDate !== "string"
    ) {
      throw new Error("INVALID_TOURNAMENT_ROW");
    }

    const participants = database
      .prepare(`
        SELECT
          player_id AS playerId,
          placement,
          invited_by_player_id AS invitedByPlayerId
        FROM tournament_participants
        WHERE tournament_id = ?
        ORDER BY placement ASC
      `)
      .all(tournamentId)
      .map((participant): TournamentParticipant => {
        if (
          typeof participant.playerId !== "string" ||
          typeof participant.placement !== "number" ||
          (participant.invitedByPlayerId !== null &&
            typeof participant.invitedByPlayerId !== "string")
        ) {
          throw new Error("INVALID_TOURNAMENT_PARTICIPANT_ROW");
        }

        return participant.invitedByPlayerId === null
          ? {
              playerId: participant.playerId,
              placement: participant.placement,
            }
          : {
              playerId: participant.playerId,
              placement: participant.placement,
              invitedByPlayerId: participant.invitedByPlayerId,
            };
      });

    return {
      id: row.id,
      storeId: row.storeId,
      leagueMonth: row.leagueMonth,
      originalScheduledDate: row.originalScheduledDate,
      effectiveDate: row.effectiveDate,
      participants,
    };
  }

  function findTournamentsByLeague(
    storeId: string,
    leagueMonth: string,
  ): ReadonlyArray<TournamentRegistration> {
    return database
      .prepare(`
        SELECT tournaments.id
        FROM tournaments
        INNER JOIN tournament_details
          ON tournament_details.tournament_id = tournaments.id
        WHERE tournaments.store_id = ?
          AND tournaments.league_month = ?
        ORDER BY
          tournament_details.original_scheduled_date ASC,
          tournaments.id ASC
      `)
      .all(storeId, leagueMonth)
      .map((row) => {
        if (typeof row.id !== "string") {
          throw new Error("INVALID_TOURNAMENT_ROW");
        }

        const tournament = findTournament(storeId, row.id);

        if (tournament === undefined) {
          throw new Error("TOURNAMENT_NOT_FOUND");
        }

        return tournament;
      });
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
      const placements = tournament.participants.map(
        (participant) => participant.placement,
      );
      const hasInvalidPlacement = placements.some(
        (placement) =>
          !Number.isSafeInteger(placement) ||
          placement < 1 ||
          placement > tournament.participants.length,
      );

      if (hasInvalidPlacement || new Set(placements).size !== placements.length) {
        throw new Error("INVALID_TOURNAMENT_STANDINGS");
      }

      database.exec("BEGIN");

      try {
        database
          .prepare(`
            INSERT INTO tournaments (id, store_id, league_month)
            VALUES (?, ?, ?)
          `)
          .run(tournament.id, tournament.storeId, tournament.leagueMonth);
        database
          .prepare(`
            INSERT INTO tournament_details (
              tournament_id,
              original_scheduled_date,
              effective_date
            ) VALUES (?, ?, ?)
          `)
          .run(
            tournament.id,
            tournament.originalScheduledDate,
            tournament.effectiveDate,
          );

        const insertParticipant = database.prepare(`
          INSERT INTO tournament_participants (
            tournament_id,
            player_id,
            placement,
            invited_by_player_id
          ) VALUES (?, ?, ?, ?)
        `);

        for (const participant of tournament.participants) {
          insertParticipant.run(
            tournament.id,
            participant.playerId,
            participant.placement,
            participant.invitedByPlayerId ?? null,
          );
        }

        database.exec("COMMIT");
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
    },

    findTournament,

    findTournamentsByLeague,

    countPlayerTournamentsBefore(query: PlayerTournamentHistoryQuery) {
      const row = database
        .prepare(`
          SELECT COUNT(*) AS tournamentCount
          FROM tournament_participants
          INNER JOIN tournaments
            ON tournaments.id = tournament_participants.tournament_id
          INNER JOIN tournament_details
            ON tournament_details.tournament_id = tournaments.id
          WHERE tournaments.store_id = ?
            AND tournament_participants.player_id = ?
            AND tournament_details.original_scheduled_date < ?
        `)
        .get(query.storeId, query.playerId, query.originalScheduledDate);

      if (
        row === undefined ||
        typeof row.tournamentCount !== "number" ||
        !Number.isSafeInteger(row.tournamentCount)
      ) {
        throw new Error("INVALID_PLAYER_TOURNAMENT_COUNT");
      }

      return row.tournamentCount;
    },

    close() {
      database.close();
    },
  };
}
