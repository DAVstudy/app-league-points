import { describe, expect, it } from "vitest";

import { calculateInvitationPoints } from "./calculate-invitation-points";

describe("calculateInvitationPoints", () => {
  it("awards 3 points for each invited new player", () => {
    const points = calculateInvitationPoints({
      inviterPlayerId: "P0001",
      invitedPlayers: [
        { playerId: "P0002", previousTournamentCountAtStore: 0 },
        { playerId: "P0003", previousTournamentCountAtStore: 0 },
      ],
    });

    expect(points).toBe(6);
  });

  it("awards 3 points when exactly one new player is invited", () => {
    const points = calculateInvitationPoints({
      inviterPlayerId: "P0001",
      invitedPlayers: [
        { playerId: "P0002", previousTournamentCountAtStore: 0 },
      ],
    });

    expect(points).toBe(3);
  });

  it("awards points only for invited players who are new at the store", () => {
    const points = calculateInvitationPoints({
      inviterPlayerId: "P0001",
      invitedPlayers: [
        { playerId: "P0002", previousTournamentCountAtStore: 0 },
        { playerId: "P0003", previousTournamentCountAtStore: 1 },
      ],
    });

    expect(points).toBe(3);
  });

  it("awards points only once when the same invited player appears twice", () => {
    const points = calculateInvitationPoints({
      inviterPlayerId: "P0001",
      invitedPlayers: [
        { playerId: "P0002", previousTournamentCountAtStore: 0 },
        { playerId: "P0002", previousTournamentCountAtStore: 0 },
      ],
    });

    expect(points).toBe(3);
  });
});
