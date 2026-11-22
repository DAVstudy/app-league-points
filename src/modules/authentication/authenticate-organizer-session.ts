type VerifiedOrganizerIdentity = {
  organizerId: string;
};

type AuthenticateOrganizerSessionInput = {
  accessToken: string;
  verifyAccessToken: (
    accessToken: string,
  ) => Promise<VerifiedOrganizerIdentity | undefined>;
};

export async function authenticateOrganizerSession(
  input: AuthenticateOrganizerSessionInput,
) {
  if (input.accessToken.trim().length === 0) {
    return {
      ok: false,
      error: "ORGANIZER_SESSION_INVALID",
    } as const;
  }

  let identity: VerifiedOrganizerIdentity | undefined;

  try {
    identity = await input.verifyAccessToken(input.accessToken);
  } catch {
    return {
      ok: false,
      error: "ORGANIZER_SESSION_INVALID",
    } as const;
  }

  if (identity === undefined) {
    return {
      ok: false,
      error: "ORGANIZER_SESSION_INVALID",
    } as const;
  }

  return {
    ok: true,
    organizerId: identity.organizerId,
  } as const;
}
