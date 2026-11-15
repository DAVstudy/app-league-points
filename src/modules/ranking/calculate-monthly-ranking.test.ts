import { describe, expect, it } from "vitest";

import { calculateMonthlyRanking } from "./calculate-monthly-ranking";

describe("calculateMonthlyRanking", () => {
  it("accumulates a player's points into a single monthly ranking entry", () => {
    const ranking = calculateMonthlyRanking({
      leagueMonth: "2026-11",
      tournamentPoints: [
        {
          playerId: "P0001",
          originalScheduledDate: "2026-11-04",
          points: 15,
        },
        {
          playerId: "P0001",
          originalScheduledDate: "2026-11-06",
          points: 7,
        },
      ],
    });

    expect(ranking).toEqual({
      leagueMonth: "2026-11",
      entries: [
        {
          playerId: "P0001",
          totalPoints: 22,
          position: 1,
          topCutStatus: "QUALIFIED",
        },
      ],
    });
  });

  it("creates one monthly ranking entry for each player", () => {
    const ranking = calculateMonthlyRanking({
      leagueMonth: "2026-11",
      tournamentPoints: [
        {
          playerId: "P0001",
          originalScheduledDate: "2026-11-04",
          points: 15,
        },
        {
          playerId: "P0002",
          originalScheduledDate: "2026-11-06",
          points: 10,
        },
      ],
    });

    expect(ranking).toEqual({
      leagueMonth: "2026-11",
      entries: [
        {
          playerId: "P0001",
          totalPoints: 15,
          position: 1,
          topCutStatus: "QUALIFIED",
        },
        {
          playerId: "P0002",
          totalPoints: 10,
          position: 2,
          topCutStatus: "QUALIFIED",
        },
      ],
    });
  });

  it("orders players from highest to lowest total points", () => {
    const ranking = calculateMonthlyRanking({
      leagueMonth: "2026-11",
      tournamentPoints: [
        {
          playerId: "P0001",
          originalScheduledDate: "2026-11-04",
          points: 10,
        },
        {
          playerId: "P0002",
          originalScheduledDate: "2026-11-06",
          points: 15,
        },
      ],
    });

    expect(ranking).toEqual({
      leagueMonth: "2026-11",
      entries: [
        {
          playerId: "P0002",
          totalPoints: 15,
          position: 1,
          topCutStatus: "QUALIFIED",
        },
        {
          playerId: "P0001",
          totalPoints: 10,
          position: 2,
          topCutStatus: "QUALIFIED",
        },
      ],
    });
  });

  it("assigns the same provisional position to players with equal points", () => {
    const ranking = calculateMonthlyRanking({
      leagueMonth: "2026-11",
      tournamentPoints: [
        {
          playerId: "P0001",
          originalScheduledDate: "2026-11-04",
          points: 20,
        },
        {
          playerId: "P0002",
          originalScheduledDate: "2026-11-06",
          points: 10,
        },
        {
          playerId: "P0003",
          originalScheduledDate: "2026-11-04",
          points: 10,
        },
        {
          playerId: "P0004",
          originalScheduledDate: "2026-11-06",
          points: 5,
        },
      ],
    });

    expect(ranking.leagueMonth).toBe("2026-11");

    expect(ranking.entries).toHaveLength(4);

    expect(ranking.entries).toEqual(
      expect.arrayContaining([
        {
          playerId: "P0001",
          totalPoints: 20,
          position: 1,
          topCutStatus: "QUALIFIED",
        },
        {
          playerId: "P0002",
          totalPoints: 10,
          position: 2,
          topCutStatus: "QUALIFIED",
        },
        {
          playerId: "P0003",
          totalPoints: 10,
          position: 2,
          topCutStatus: "QUALIFIED",
        },
        {
          playerId: "P0004",
          totalPoints: 5,
          position: 4,
          topCutStatus: "QUALIFIED",
        },
      ]),
    );
  });

  it("includes points only when the original scheduled date belongs to the league month", () => {
    const ranking = calculateMonthlyRanking({
      leagueMonth: "2026-11",
      tournamentPoints: [
        {
          playerId: "P0001",
          originalScheduledDate: "2026-11-30",
          points: 10,
        },
        {
          playerId: "P0001",
          originalScheduledDate: "2026-12-01",
          points: 20,
        },
      ],
    });

    expect(ranking).toEqual({
      leagueMonth: "2026-11",
      entries: [
        {
          playerId: "P0001",
          totalPoints: 10,
          position: 1,
          topCutStatus: "QUALIFIED",
        },
      ],
    });
  });

  it("marks only the first eight positions as qualified for Top Cut", () => {
    const tournamentPoints = Array.from(
      { length: 9 },
      (_, index) => ({
        playerId: `P${String(index + 1).padStart(4, "0")}`,
        originalScheduledDate: "2026-11-04",
        points: 9 - index,
      }),
    );

    const ranking = calculateMonthlyRanking({
      leagueMonth: "2026-11",
      tournamentPoints,
    });

    expect(ranking.entries).toHaveLength(9);

    expect(ranking.entries[7]).toMatchObject({
      playerId: "P0008",
      position: 8,
      topCutStatus: "QUALIFIED",
    });

    expect(ranking.entries[8]).toMatchObject({
      playerId: "P0009",
      position: 9,
      topCutStatus: "NOT_QUALIFIED",
    });
  });

  it("marks a tie affecting the Top Cut boundary as pending", () => {
    const qualifiedPlayers = Array.from(
      { length: 7 },
      (_, index) => ({
        playerId: `P${String(index + 1).padStart(4, "0")}`,
        originalScheduledDate: "2026-11-04",
        points: 20 - index,
      }),
    );

    const ranking = calculateMonthlyRanking({
      leagueMonth: "2026-11",
      tournamentPoints: [
        ...qualifiedPlayers,
        {
          playerId: "P0008",
          originalScheduledDate: "2026-11-06",
          points: 10,
        },
        {
          playerId: "P0009",
          originalScheduledDate: "2026-11-06",
          points: 10,
        },
        {
          playerId: "P0010",
          originalScheduledDate: "2026-11-06",
          points: 10,
        },
      ],
    });

    expect(ranking.entries).toHaveLength(10);

    expect(ranking.entries.slice(7)).toEqual(
      expect.arrayContaining([
        {
          playerId: "P0008",
          totalPoints: 10,
          position: 8,
          topCutStatus: "TIE_BREAK_PENDING",
        },
        {
          playerId: "P0009",
          totalPoints: 10,
          position: 8,
          topCutStatus: "TIE_BREAK_PENDING",
        },
        {
          playerId: "P0010",
          totalPoints: 10,
          position: 8,
          topCutStatus: "TIE_BREAK_PENDING",
        },
      ]),
    );
  });

  it("returns an empty ranking when there are no tournament points", () => {
    const ranking = calculateMonthlyRanking({
      leagueMonth: "2026-11",
      tournamentPoints: [],
    });

    expect(ranking).toEqual({
      leagueMonth: "2026-11",
      entries: [],
    });
  });
});
