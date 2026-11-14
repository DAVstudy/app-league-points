import { describe, expect, it } from "vitest";

import { calculateTournamentPoints } from "./calculate-tournament-points";

describe("calculateTournamentPoints", () => {
  it("adds attendance, winner, and Top 4 points for a winner with at least 8 players", () => {
    expect(
      calculateTournamentPoints({
        placement: 1,
        playerCount: 8,
      }),
    ).toEqual({
      attendance: 5,
      winner: 10,
      placement: 5,
      total: 20,
    });
  });

  it("does not award Top 4 points when fewer than 8 players participate", () => {
    expect(
      calculateTournamentPoints({
        placement: 1,
        playerCount: 7,
      }),
    ).toEqual({
      attendance: 5,
      winner: 10,
      placement: 0,
      total: 15,
    });
  });

  it("awards Top 4 points to places 2 through 4 when at least 8 players participate", () => {
    expect(
      calculateTournamentPoints({
        placement: 4,
        playerCount: 8,
      }),
    ).toEqual({
      attendance: 5,
      winner: 0,
      placement: 5,
      total: 10,
    });
  });

  it("awards 3 placement points to places 5 through 8 when at least 16 players participate", () => {
    expect(
      calculateTournamentPoints({
        placement: 8,
        playerCount: 16,
      }),
    ).toEqual({
      attendance: 5,
      winner: 0,
      placement: 3,
      total: 8,
    });

    expect(
      calculateTournamentPoints({
        placement: 8,
        playerCount: 15,
      }),
    ).toEqual({
      attendance: 5,
      winner: 0,
      placement: 0,
      total: 5,
    });
  });
});
