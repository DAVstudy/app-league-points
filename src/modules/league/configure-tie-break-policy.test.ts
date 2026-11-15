import { describe, expect, it } from "vitest";

import {
  configureTieBreakPolicy,
  type League,
} from "./configure-tie-break-policy";

describe("configureTieBreakPolicy", () => {
  it("allows switching from MANUAL_ORDER to PLAYOFF_MATCH before registering the first tournament", () => {
    const result = configureTieBreakPolicy({
      league: {
        leagueMonth: "2026-11",
        tieBreakPolicy: "MANUAL_ORDER",
        hasRegisteredTournaments: false,
      },
      newTieBreakPolicy: "PLAYOFF_MATCH",
    });

    expect(result).toEqual({
      ok: true,
      league: {
        leagueMonth: "2026-11",
        tieBreakPolicy: "PLAYOFF_MATCH",
        hasRegisteredTournaments: false,
      },
    });
  });

  it("rejects changing the tie-break policy after registering the first tournament", () => {
    const league: League = {
      leagueMonth: "2026-11",
      tieBreakPolicy: "MANUAL_ORDER",
      hasRegisteredTournaments: true,
    };

    const result = configureTieBreakPolicy({
      league,
      newTieBreakPolicy: "PLAYOFF_MATCH",
    });

    expect(result).toEqual({
      ok: false,
      error: "TIE_BREAK_POLICY_LOCKED",
    });

    expect(league.tieBreakPolicy).toBe("MANUAL_ORDER");
  });
});