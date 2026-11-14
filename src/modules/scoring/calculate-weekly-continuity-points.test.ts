import { describe, expect, it } from "vitest";

import { calculateWeeklyContinuityPoints } from "./calculate-weekly-continuity-points";

describe("calculateWeeklyContinuityPoints", () => {
  it("awards 2 points when the player attends the scheduled Wednesday and Friday tournaments", () => {
    const points = calculateWeeklyContinuityPoints({
      attendedWednesdayTournament: true,
      attendedFridayTournament: true,
    });

    expect(points).toBe(2);
  });

  it("awards 0 points when the player misses the Friday tournament", () => {
    const points = calculateWeeklyContinuityPoints({
      attendedWednesdayTournament: true,
      attendedFridayTournament: false,
    });

    expect(points).toBe(0);
  });

  it("awards 0 points when the player misses the Wednesday tournament", () => {
    const points = calculateWeeklyContinuityPoints({
      attendedWednesdayTournament: false,
      attendedFridayTournament: true,
    });

    expect(points).toBe(0);
  });
});
