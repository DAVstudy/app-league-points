import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import { createSupabaseOrganizerAuthGateway } from "./supabase-organizer-auth-gateway";

describe("createSupabaseOrganizerAuthGateway", () => {
  const isKnownOrganizerIdentity = async () => true;
  const listUsers = vi.fn(async () => ({
    data: { users: [], nextPage: null },
    error: null,
  }));
  const acceptsInstalledSupabaseClient = (client: SupabaseClient) =>
    createSupabaseOrganizerAuthGateway(client, isKnownOrganizerIdentity);

  it("derives the organizer identity from Supabase getUser token verification", async () => {
    const getUser = vi.fn(async () => ({
      data: {
        user: {
          id: "ORG-1",
        },
      },
      error: null,
    }));
    const inviteUserByEmail = vi.fn();
    const gateway = createSupabaseOrganizerAuthGateway(
      {
        auth: {
          getUser,
          admin: {
            inviteUserByEmail,
            listUsers,
          },
        },
      },
      isKnownOrganizerIdentity,
    );

    await expect(
      gateway.verifyAccessToken("verified-access-token"),
    ).resolves.toEqual({
      organizerId: "ORG-1",
    });
    expect(getUser).toHaveBeenCalledOnce();
    expect(getUser).toHaveBeenCalledWith("verified-access-token");
  });

  it("rejects an authenticated user without a known organizer identity", async () => {
    const getUser = vi.fn(async () => ({
      data: {
        user: {
          id: "PLAYER-1",
        },
      },
      error: null,
    }));
    const gateway = createSupabaseOrganizerAuthGateway(
      {
        auth: {
          getUser,
          admin: {
            inviteUserByEmail: vi.fn(),
            listUsers,
          },
        },
      },
      async () => false,
    );

    await expect(
      gateway.verifyAccessToken("verified-player-token"),
    ).resolves.toBeUndefined();
  });

  it("sends organizer invitations through the Supabase admin API", async () => {
    const getUser = vi.fn();
    const inviteUserByEmail = vi.fn(async () => ({
      data: {
        user: {
          id: "ORG-2",
        },
      },
      error: null,
    }));
    const gateway = createSupabaseOrganizerAuthGateway(
      {
        auth: {
          getUser,
          admin: {
            inviteUserByEmail,
            listUsers,
          },
        },
      },
      isKnownOrganizerIdentity,
    );

    await expect(
      gateway.sendInvitation("new.organizer@example.com"),
    ).resolves.toEqual({
      ok: true,
      organizerId: "ORG-2",
    });
    expect(inviteUserByEmail).toHaveBeenCalledOnce();
    expect(inviteUserByEmail).toHaveBeenCalledWith(
      "new.organizer@example.com",
    );
  });

  it("rejects provider failures without exposing Supabase errors", async () => {
    const providerError = new Error("sensitive provider details");
    const getUser = vi.fn(async () => ({
      data: {
        user: null,
      },
      error: providerError,
    }));
    const inviteUserByEmail = vi.fn(async () => ({
      data: {
        user: null,
      },
      error: providerError,
    }));
    const gateway = createSupabaseOrganizerAuthGateway(
      {
        auth: {
          getUser,
          admin: {
            inviteUserByEmail,
            listUsers,
          },
        },
      },
      isKnownOrganizerIdentity,
    );

    await expect(
      gateway.verifyAccessToken("invalid-access-token"),
    ).resolves.toBeUndefined();
    await expect(
      gateway.sendInvitation("new.organizer@example.com"),
    ).resolves.toEqual({ ok: false });
  });

  it("redacts rejected provider calls", async () => {
    const gateway = createSupabaseOrganizerAuthGateway(
      {
        auth: {
          getUser: async () =>
            Promise.reject(new Error("provider secret")),
          admin: {
            inviteUserByEmail: async () =>
              Promise.reject(new Error("admin secret")),
            listUsers,
          },
        },
      },
      isKnownOrganizerIdentity,
    );

    await expect(
      gateway.verifyAccessToken("rejected-access-token"),
    ).resolves.toBeUndefined();
    await expect(
      gateway.sendInvitation("new.organizer@example.com"),
    ).resolves.toEqual({ ok: false });
  });

  it("accepts the installed Supabase client contract", () => {
    expect(acceptsInstalledSupabaseClient).toBeTypeOf("function");
  });

  it("invites once and reuses that identity during bootstrap retry", async () => {
    const users: { email: string; id: string }[] = [];
    const inviteUserByEmail = vi.fn(async (email: string) => {
      const user = { email, id: "ORG-1" };
      users.push(user);

      return { data: { user }, error: null };
    });
    const gateway = createSupabaseOrganizerAuthGateway(
      {
        auth: {
          getUser: vi.fn(),
          admin: {
            inviteUserByEmail,
            listUsers: vi.fn(async () => ({
              data: { users, nextPage: null },
              error: null,
            })),
          },
        },
      },
      isKnownOrganizerIdentity,
    );

    await expect(
      gateway.provisionOrganizer(" Owner@Example.COM "),
    ).resolves.toEqual({
      ok: true,
      organizerId: "ORG-1",
    });
    await expect(
      gateway.provisionOrganizer("owner@example.com"),
    ).resolves.toEqual({
      ok: true,
      organizerId: "ORG-1",
    });
    expect(inviteUserByEmail).toHaveBeenCalledOnce();
  });
});
