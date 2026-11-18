import { describe, expect, it } from "vitest";

import { selectActiveStoreContext } from "./select-active-store-context";

describe("selectActiveStoreContext", () => {
  it("selects an explicitly requested store from a multi-store account", () => {
    const result = selectActiveStoreContext({
      organizerId: "ORG-1",
      requestedStoreId: "STORE-2",
      memberships: [
        {
          organizerId: "ORG-1",
          storeId: "STORE-1",
        },
        {
          organizerId: "ORG-1",
          storeId: "STORE-2",
        },
      ],
    });

    expect(result).toEqual({
      ok: true,
      activeStore: {
        organizerId: "ORG-1",
        storeId: "STORE-2",
      },
    });
  });

  it("rejects a requested store outside the organizer memberships", () => {
    const result = selectActiveStoreContext({
      organizerId: "ORG-1",
      requestedStoreId: "STORE-2",
      memberships: [
        {
          organizerId: "ORG-1",
          storeId: "STORE-1",
        },
      ],
    });

    expect(result).toEqual({
      ok: false,
      error: "STORE_ACCESS_DENIED",
    });
  });
});
