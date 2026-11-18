import { describe, expect, it, vi } from "vitest";

import { revokeStoreOrganizerMembership } from "./revoke-store-organizer-membership";

describe("revokeStoreOrganizerMembership", () => {
  it("does not remove the final organizer membership from a store", () => {
    const removeMembership = vi.fn(() => ({ ok: true }) as const);

    const result = revokeStoreOrganizerMembership({
      actorOrganizerId: "ORG-1",
      targetOrganizerId: "ORG-1",
      storeId: "STORE-1",
      memberships: [
        {
          organizerId: "ORG-1",
          storeId: "STORE-1",
        },
      ],
      removeMembership,
    });

    expect(result).toEqual({
      ok: false,
      error: "LAST_STORE_ORGANIZER_REQUIRED",
    });
    expect(removeMembership).not.toHaveBeenCalled();
  });

  it("allows an organizer to revoke another membership when one remains", () => {
    const removeMembership = vi.fn(() => ({ ok: true }) as const);

    const result = revokeStoreOrganizerMembership({
      actorOrganizerId: "ORG-1",
      targetOrganizerId: "ORG-2",
      storeId: "STORE-1",
      memberships: [
        {
          organizerId: "ORG-1",
          storeId: "STORE-1",
        },
        {
          organizerId: "ORG-2",
          storeId: "STORE-1",
        },
      ],
      removeMembership,
    });

    expect(result).toEqual({
      ok: true,
    });
    expect(removeMembership).toHaveBeenCalledOnce();
    expect(removeMembership).toHaveBeenCalledWith({
      organizerId: "ORG-2",
      storeId: "STORE-1",
    });
  });

  it("allows self-revocation when another store organizer remains", () => {
    const removeMembership = vi.fn(() => ({ ok: true }) as const);

    const result = revokeStoreOrganizerMembership({
      actorOrganizerId: "ORG-1",
      targetOrganizerId: "ORG-1",
      storeId: "STORE-1",
      memberships: [
        {
          organizerId: "ORG-1",
          storeId: "STORE-1",
        },
        {
          organizerId: "ORG-2",
          storeId: "STORE-1",
        },
      ],
      removeMembership,
    });

    expect(result).toEqual({ ok: true });
    expect(removeMembership).toHaveBeenCalledWith({
      organizerId: "ORG-1",
      storeId: "STORE-1",
    });
  });

  it("propagates the atomic last-organizer guard from persistence", () => {
    const removeMembership = vi.fn(
      () => ({
        ok: false,
        error: "LAST_STORE_ORGANIZER_REQUIRED",
      }) as const,
    );

    const result = revokeStoreOrganizerMembership({
      actorOrganizerId: "ORG-1",
      targetOrganizerId: "ORG-2",
      storeId: "STORE-1",
      memberships: [
        { organizerId: "ORG-1", storeId: "STORE-1" },
        { organizerId: "ORG-2", storeId: "STORE-1" },
      ],
      removeMembership,
    });

    expect(result).toEqual({
      ok: false,
      error: "LAST_STORE_ORGANIZER_REQUIRED",
    });
  });
});
