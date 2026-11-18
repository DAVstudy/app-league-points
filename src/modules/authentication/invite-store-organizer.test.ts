import { describe, expect, it, vi } from "vitest";

import { inviteStoreOrganizer } from "./invite-store-organizer";

describe("inviteStoreOrganizer", () => {
  it("does not send an invitation when the acting organizer lacks store access", async () => {
    const sendInvitation = vi.fn(async () => ({
      ok: true,
      organizerId: "ORG-2",
    }) as const);
    const findOrganizerIdentityByEmail = vi.fn(() => undefined);
    const saveOrganizerIdentity = vi.fn(() => ({ ok: true }) as const);
    const createPendingInvitation = vi.fn(
      () => ({ ok: true }) as const,
    );

    const result = await inviteStoreOrganizer({
      actorOrganizerId: "ORG-1",
      storeId: "STORE-1",
      inviteeEmail: "new.organizer@example.com",
      memberships: [],
      sendInvitation,
      findOrganizerIdentityByEmail,
      saveOrganizerIdentity,
      createPendingInvitation,
    });

    expect(result).toEqual({
      ok: false,
      error: "STORE_ACCESS_DENIED",
    });
    expect(sendInvitation).not.toHaveBeenCalled();
    expect(findOrganizerIdentityByEmail).not.toHaveBeenCalled();
    expect(saveOrganizerIdentity).not.toHaveBeenCalled();
    expect(createPendingInvitation).not.toHaveBeenCalled();
  });

  it("sends an invitation for an organizer with access to the store", async () => {
    const sendInvitation = vi.fn(async () => ({
      ok: true,
      organizerId: "ORG-2",
    }) as const);
    const findOrganizerIdentityByEmail = vi.fn(() => undefined);
    const saveOrganizerIdentity = vi.fn(() => ({ ok: true }) as const);
    const createPendingInvitation = vi.fn(
      () => ({ ok: true }) as const,
    );

    const result = await inviteStoreOrganizer({
      actorOrganizerId: "ORG-1",
      storeId: "STORE-1",
      inviteeEmail: "new.organizer@example.com",
      memberships: [
        {
          organizerId: "ORG-1",
          storeId: "STORE-1",
        },
      ],
      sendInvitation,
      findOrganizerIdentityByEmail,
      saveOrganizerIdentity,
      createPendingInvitation,
    });

    expect(result).toEqual({
      ok: true,
      organizerId: "ORG-2",
    });
    expect(sendInvitation).toHaveBeenCalledOnce();
    expect(sendInvitation).toHaveBeenCalledWith("new.organizer@example.com");
    expect(findOrganizerIdentityByEmail).toHaveBeenCalledWith(
      "new.organizer@example.com",
    );
    expect(saveOrganizerIdentity).toHaveBeenCalledWith({
      email: "new.organizer@example.com",
      organizerId: "ORG-2",
    });
    expect(createPendingInvitation).toHaveBeenCalledOnce();
    expect(createPendingInvitation).toHaveBeenCalledWith({
      invitedByOrganizerId: "ORG-1",
      organizerId: "ORG-2",
      storeId: "STORE-1",
    });
  });

  it("rejects an empty organizer email before creating external or durable state", async () => {
    const sendInvitation = vi.fn(async () => ({
      ok: true,
      organizerId: "ORG-2",
    }) as const);
    const findOrganizerIdentityByEmail = vi.fn(() => undefined);
    const saveOrganizerIdentity = vi.fn(() => ({ ok: true }) as const);
    const createPendingInvitation = vi.fn(
      () => ({ ok: true }) as const,
    );

    const result = await inviteStoreOrganizer({
      actorOrganizerId: "ORG-1",
      storeId: "STORE-1",
      inviteeEmail: "   ",
      memberships: [
        {
          organizerId: "ORG-1",
          storeId: "STORE-1",
        },
      ],
      sendInvitation,
      findOrganizerIdentityByEmail,
      saveOrganizerIdentity,
      createPendingInvitation,
    });

    expect(result).toEqual({
      ok: false,
      error: "ORGANIZER_EMAIL_INVALID",
    });
    expect(sendInvitation).not.toHaveBeenCalled();
    expect(findOrganizerIdentityByEmail).not.toHaveBeenCalled();
    expect(saveOrganizerIdentity).not.toHaveBeenCalled();
    expect(createPendingInvitation).not.toHaveBeenCalled();
  });

  it("does not create a membership when the invitation provider fails", async () => {
    const sendInvitation = vi.fn(
      async () => ({ ok: false }) as const,
    );
    const findOrganizerIdentityByEmail = vi.fn(() => undefined);
    const saveOrganizerIdentity = vi.fn(() => ({ ok: true }) as const);
    const createPendingInvitation = vi.fn(
      () => ({ ok: true }) as const,
    );

    const result = await inviteStoreOrganizer({
      actorOrganizerId: "ORG-1",
      storeId: "STORE-1",
      inviteeEmail: "new.organizer@example.com",
      memberships: [
        {
          organizerId: "ORG-1",
          storeId: "STORE-1",
        },
      ],
      sendInvitation,
      findOrganizerIdentityByEmail,
      saveOrganizerIdentity,
      createPendingInvitation,
    });

    expect(result).toEqual({
      ok: false,
      error: "ORGANIZER_INVITATION_FAILED",
    });
    expect(saveOrganizerIdentity).not.toHaveBeenCalled();
    expect(createPendingInvitation).not.toHaveBeenCalled();
  });

  it("reuses an existing organizer identity for another store without a new Auth invite", async () => {
    const sendInvitation = vi.fn(async () => ({
      ok: true,
      organizerId: "UNEXPECTED-ORG",
    }) as const);
    const findOrganizerIdentityByEmail = vi.fn(() => ({
      organizerId: "ORG-2",
    }));
    const saveOrganizerIdentity = vi.fn(() => ({ ok: true }) as const);
    const createPendingInvitation = vi.fn(
      () => ({ ok: true }) as const,
    );

    const result = await inviteStoreOrganizer({
      actorOrganizerId: "ORG-1",
      storeId: "STORE-2",
      inviteeEmail: " Existing.Organizer@Example.com ",
      memberships: [
        {
          organizerId: "ORG-1",
          storeId: "STORE-2",
        },
      ],
      sendInvitation,
      findOrganizerIdentityByEmail,
      saveOrganizerIdentity,
      createPendingInvitation,
    });

    expect(result).toEqual({
      ok: true,
      organizerId: "ORG-2",
    });
    expect(findOrganizerIdentityByEmail).toHaveBeenCalledWith(
      "existing.organizer@example.com",
    );
    expect(sendInvitation).not.toHaveBeenCalled();
    expect(saveOrganizerIdentity).not.toHaveBeenCalled();
    expect(createPendingInvitation).toHaveBeenCalledWith({
      invitedByOrganizerId: "ORG-1",
      organizerId: "ORG-2",
      storeId: "STORE-2",
    });
  });
});
