import { describe, expect, it, vi } from "vitest";

import { authenticateOrganizerSession } from "./authenticate-organizer-session";

describe("authenticateOrganizerSession", () => {
  it("returns the organizer identity from a verified access token", async () => {
    const verifyAccessToken = vi.fn(async () => ({
      organizerId: "ORG-1",
    }));

    const result = await authenticateOrganizerSession({
      accessToken: "verified-access-token",
      verifyAccessToken,
    });

    expect(result).toEqual({
      ok: true,
      organizerId: "ORG-1",
    });
    expect(verifyAccessToken).toHaveBeenCalledOnce();
    expect(verifyAccessToken).toHaveBeenCalledWith("verified-access-token");
  });

  it("rejects an access token that does not resolve to an organizer", async () => {
    const verifyAccessToken = vi.fn(async () => undefined);

    const result = await authenticateOrganizerSession({
      accessToken: "invalid-access-token",
      verifyAccessToken,
    });

    expect(result).toEqual({
      ok: false,
      error: "ORGANIZER_SESSION_INVALID",
    });
    expect(verifyAccessToken).toHaveBeenCalledOnce();
    expect(verifyAccessToken).toHaveBeenCalledWith("invalid-access-token");
  });

  it("rejects an empty access token before calling the verifier", async () => {
    const verifyAccessToken = vi.fn(async () => ({
      organizerId: "ORG-1",
    }));

    const result = await authenticateOrganizerSession({
      accessToken: "   ",
      verifyAccessToken,
    });

    expect(result).toEqual({
      ok: false,
      error: "ORGANIZER_SESSION_INVALID",
    });
    expect(verifyAccessToken).not.toHaveBeenCalled();
  });

  it("maps a rejected verifier call to an invalid session", async () => {
    const verifyAccessToken = vi.fn(async () => {
      throw new Error("sensitive provider details");
    });

    await expect(
      authenticateOrganizerSession({
        accessToken: "rejected-access-token",
        verifyAccessToken,
      }),
    ).resolves.toEqual({
      ok: false,
      error: "ORGANIZER_SESSION_INVALID",
    });
  });
});
