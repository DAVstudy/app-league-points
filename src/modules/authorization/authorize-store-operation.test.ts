import { describe, expect, expectTypeOf, it, vi } from "vitest";

import {
  authorizeStoreOperation,
  executeAuthorizedStoreOperation,
} from "./authorize-store-operation";

describe("authorizeStoreOperation", () => {
  it("allows an organizer with membership in the requested store", () => {
    const result = authorizeStoreOperation({
      actorOrganizerId: "ORG-1",
      storeId: "STORE-1",
      memberships: [
        {
          organizerId: "ORG-1",
          storeId: "STORE-1",
        },
      ],
    });

    expect(result).toEqual({
      ok: true,
    });
  });

  it("denies an organizer without membership in the requested store", () => {
    const result = authorizeStoreOperation({
      actorOrganizerId: "ORG-1",
      storeId: "STORE-1",
      memberships: [],
    });

    expect(result).toEqual({
      ok: false,
      error: "STORE_ACCESS_DENIED",
    });
  });

  it("denies an organizer whose membership belongs to another store", () => {
    const result = authorizeStoreOperation({
      actorOrganizerId: "ORG-1",
      storeId: "STORE-1",
      memberships: [
        {
          organizerId: "ORG-1",
          storeId: "STORE-2",
        },
      ],
    });

    expect(result).toEqual({
      ok: false,
      error: "STORE_ACCESS_DENIED",
    });
  });

  it("denies access when the store membership belongs to another organizer", () => {
    const result = authorizeStoreOperation({
      actorOrganizerId: "ORG-1",
      storeId: "STORE-1",
      memberships: [
        {
          organizerId: "ORG-2",
          storeId: "STORE-1",
        },
      ],
    });

    expect(result).toEqual({
      ok: false,
      error: "STORE_ACCESS_DENIED",
    });
  });

  it("does not execute a protected operation when store access is denied", () => {
    const protectedOperation = vi.fn(() => "protected store data");

    const result = executeAuthorizedStoreOperation({
      actorOrganizerId: "ORG-1",
      storeId: "STORE-1",
      memberships: [],
      operation: protectedOperation,
    });

    expect(result).toEqual({
      ok: false,
      error: "STORE_ACCESS_DENIED",
    });
    expect(protectedOperation).not.toHaveBeenCalled();
  });

  it("leaves protected state unchanged when access is denied", () => {
    const protectedState = {
      playerIds: ["P0001"],
      writes: 0,
    };
    const stateBeforeAuthorization = JSON.stringify(protectedState);
    const protectedOperation = vi.fn(() => {
      protectedState.writes += 1;
      return protectedState;
    });

    const result = executeAuthorizedStoreOperation({
      actorOrganizerId: "ORG-1",
      storeId: "STORE-1",
      memberships: [
        {
          organizerId: "ORG-1",
          storeId: "STORE-2",
        },
        {
          organizerId: "ORG-2",
          storeId: "STORE-1",
        },
      ],
      operation: protectedOperation,
    });

    expect(result).toEqual({
      ok: false,
      error: "STORE_ACCESS_DENIED",
    });
    expect(protectedOperation).not.toHaveBeenCalled();
    expect(JSON.stringify(protectedState)).toBe(stateBeforeAuthorization);
  });

  it("executes a protected operation for an authorized organizer", () => {
    const protectedOperation = vi.fn(() => "protected store data");

    const result = executeAuthorizedStoreOperation({
      actorOrganizerId: "ORG-1",
      storeId: "STORE-1",
      memberships: [
        {
          organizerId: "ORG-1",
          storeId: "STORE-1",
        },
      ],
      operation: protectedOperation,
    });

    expect(result).toEqual({
      ok: true,
      value: "protected store data",
    });
    expect(protectedOperation).toHaveBeenCalledOnce();

    if (!result.ok) {
      throw new Error("Expected the store operation to be authorized");
    }

    expectTypeOf(result.value).toEqualTypeOf<string>();
  });
});
