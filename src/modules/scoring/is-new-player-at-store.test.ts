import { describe, expect, it } from "vitest";

import { isNewPlayerAtStore } from "./is-new-player-at-store";

describe("isNewPlayerAtStore", () => {
  it("identifies a player as new when they have no previous tournaments at the store", () => {
    const isNew = isNewPlayerAtStore({
      previousTournamentCountAtStore: 0,
    });

    expect(isNew).toBe(true);
  });

  it("identifies a player as not new when they have previous tournaments at the store", () => {
    const isNew = isNewPlayerAtStore({
      previousTournamentCountAtStore: 1,
    });

    expect(isNew).toBe(false);
  });
});
