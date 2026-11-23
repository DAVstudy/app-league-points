import { describe, expect, it, vi } from "vitest";

import { provisionFirstStoreOrganizer } from "./provision-first-store-organizer";

describe("provisionFirstStoreOrganizer", () => {
  it("administratively provisions the first organizer for an empty store", async () => {
    const provisionOrganizer = vi.fn(async () => ({
      ok: true,
      organizerId: "ORG-1",
    }) as const);
    const commitFirstOrganizer = vi.fn(() => ({ ok: true }) as const);
    const claimFirstOrganizer = vi.fn(() => ({
      ok: true,
      claimToken: "CLAIM-1",
    }) as const);
    const releaseFirstOrganizerClaim = vi.fn();

    const result = await provisionFirstStoreOrganizer({
      storeId: "STORE-1",
      bootstrapAttemptId: "ATTEMPT-1",
      organizerEmail: "owner@example.com",
      existingMemberships: [],
      claimFirstOrganizer,
      releaseFirstOrganizerClaim,
      provisionOrganizer,
      commitFirstOrganizer,
    });

    expect(result).toEqual({
      ok: true,
      organizerId: "ORG-1",
    });
    expect(provisionOrganizer).toHaveBeenCalledOnce();
    expect(claimFirstOrganizer).toHaveBeenCalledWith({
      attemptId: "ATTEMPT-1",
      email: "owner@example.com",
      storeId: "STORE-1",
    });
    expect(provisionOrganizer).toHaveBeenCalledWith("owner@example.com");
    expect(commitFirstOrganizer).toHaveBeenCalledWith({
      attemptId: "ATTEMPT-1",
      claimToken: "CLAIM-1",
      email: "owner@example.com",
      membership: {
        organizerId: "ORG-1",
        storeId: "STORE-1",
      },
    });
  });

  it("rejects administrative bootstrap when the store already has an organizer", async () => {
    const provisionOrganizer = vi.fn(async () => ({
      ok: true,
      organizerId: "ORG-2",
    }) as const);
    const commitFirstOrganizer = vi.fn(() => ({ ok: true }) as const);
    const claimFirstOrganizer = vi.fn();
    const releaseFirstOrganizerClaim = vi.fn();

    const result = await provisionFirstStoreOrganizer({
      storeId: "STORE-1",
      bootstrapAttemptId: "ATTEMPT-2",
      organizerEmail: "second.owner@example.com",
      existingMemberships: [
        {
          organizerId: "ORG-1",
          storeId: "STORE-1",
        },
      ],
      claimFirstOrganizer,
      releaseFirstOrganizerClaim,
      provisionOrganizer,
      commitFirstOrganizer,
    });

    expect(result).toEqual({
      ok: false,
      error: "STORE_ALREADY_PROVISIONED",
    });
    expect(provisionOrganizer).not.toHaveBeenCalled();
    expect(claimFirstOrganizer).not.toHaveBeenCalled();
    expect(commitFirstOrganizer).not.toHaveBeenCalled();
  });

  it("rejects an empty first-organizer email without side effects", async () => {
    const provisionOrganizer = vi.fn(async () => ({
      ok: true,
      organizerId: "ORG-1",
    }) as const);
    const commitFirstOrganizer = vi.fn(() => ({ ok: true }) as const);
    const claimFirstOrganizer = vi.fn();
    const releaseFirstOrganizerClaim = vi.fn();

    const result = await provisionFirstStoreOrganizer({
      storeId: "STORE-1",
      bootstrapAttemptId: "ATTEMPT-1",
      organizerEmail: "   ",
      existingMemberships: [],
      claimFirstOrganizer,
      releaseFirstOrganizerClaim,
      provisionOrganizer,
      commitFirstOrganizer,
    });

    expect(result).toEqual({
      ok: false,
      error: "ORGANIZER_EMAIL_INVALID",
    });
    expect(provisionOrganizer).not.toHaveBeenCalled();
    expect(claimFirstOrganizer).not.toHaveBeenCalled();
    expect(commitFirstOrganizer).not.toHaveBeenCalled();
  });

  it("releases a failed provider claim so the same attempt can retry", async () => {
    const provisionOrganizer = vi
      .fn()
      .mockResolvedValueOnce({ ok: false } as const)
      .mockResolvedValueOnce({ ok: true, organizerId: "ORG-1" } as const);
    const commitFirstOrganizer = vi.fn(() => ({ ok: true }) as const);
    const claimFirstOrganizer = vi
      .fn()
      .mockReturnValueOnce({ ok: true, claimToken: "CLAIM-1" } as const)
      .mockReturnValueOnce({ ok: true, claimToken: "CLAIM-2" } as const);
    const releaseFirstOrganizerClaim = vi.fn();
    const input = {
      storeId: "STORE-1",
      bootstrapAttemptId: "ATTEMPT-1",
      organizerEmail: "owner@example.com",
      existingMemberships: [],
      claimFirstOrganizer,
      releaseFirstOrganizerClaim,
      provisionOrganizer,
      commitFirstOrganizer,
    };

    await expect(provisionFirstStoreOrganizer(input)).resolves.toEqual({
      ok: false,
      error: "ORGANIZER_PROVISIONING_FAILED",
    });
    await expect(provisionFirstStoreOrganizer(input)).resolves.toEqual({
      ok: true,
      organizerId: "ORG-1",
    });
    expect(provisionOrganizer).toHaveBeenCalledTimes(2);
    expect(releaseFirstOrganizerClaim).toHaveBeenCalledWith({
      attemptId: "ATTEMPT-1",
      claimToken: "CLAIM-1",
      storeId: "STORE-1",
    });
    expect(commitFirstOrganizer).toHaveBeenCalledOnce();
  });

  it("allows only one concurrent bootstrap to provision externally", async () => {
    const claimFirstOrganizer = vi
      .fn()
      .mockReturnValueOnce({ ok: true, claimToken: "CLAIM-1" } as const)
      .mockReturnValueOnce({
        ok: false,
        error: "ORGANIZER_BOOTSTRAP_IN_PROGRESS",
      } as const);
    const provisionOrganizer = vi.fn(async (email: string) => ({
      ok: true,
      organizerId: email === "first@example.com" ? "ORG-1" : "ORG-2",
    }) as const);
    const commitFirstOrganizer = vi.fn(() => ({ ok: true }) as const);
    const releaseFirstOrganizerClaim = vi.fn();
    const baseInput = {
      storeId: "STORE-1",
      bootstrapAttemptId: "ATTEMPT-1",
      existingMemberships: [],
      claimFirstOrganizer,
      releaseFirstOrganizerClaim,
      provisionOrganizer,
      commitFirstOrganizer,
    };

    await expect(
      Promise.all([
        provisionFirstStoreOrganizer({
          ...baseInput,
          organizerEmail: "first@example.com",
        }),
        provisionFirstStoreOrganizer({
          ...baseInput,
          organizerEmail: "second@example.com",
        }),
      ]),
    ).resolves.toEqual([
      { ok: true, organizerId: "ORG-1" },
      { ok: false, error: "ORGANIZER_BOOTSTRAP_IN_PROGRESS" },
    ]);
    expect(provisionOrganizer).toHaveBeenCalledOnce();
  });
});
