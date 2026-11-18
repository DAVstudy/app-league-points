import { describe, expect, it, vi } from "vitest";

import { acceptStoreOrganizerInvitation } from "./accept-store-organizer-invitation";

describe("acceptStoreOrganizerInvitation", () => {
  it("activates only the invitation belonging to the authenticated identity", () => {
    const activatePendingInvitation = vi.fn(
      () => ({ ok: true }) as const,
    );

    const result = acceptStoreOrganizerInvitation({
      authenticatedOrganizerId: "ORG-2",
      storeId: "STORE-1",
      activatePendingInvitation,
    });

    expect(result).toEqual({ ok: true });
    expect(activatePendingInvitation).toHaveBeenCalledOnce();
    expect(activatePendingInvitation).toHaveBeenCalledWith({
      organizerId: "ORG-2",
      storeId: "STORE-1",
    });
  });
});
