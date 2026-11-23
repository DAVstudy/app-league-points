import type { OrganizerMembership } from "../authorization/authorize-store-operation";

type ProvisionOrganizerResult =
  | {
      ok: true;
      organizerId: string;
    }
  | { ok: false };

type CommitFirstOrganizerResult =
  | { ok: true }
  | {
      ok: false;
      error:
        | "ORGANIZER_IDENTITY_CONFLICT"
        | "STORE_ALREADY_PROVISIONED";
    };

type ClaimFirstOrganizerResult =
  | { ok: true; claimToken: string }
  | {
      ok: false;
      error:
        | "ORGANIZER_BOOTSTRAP_IN_PROGRESS"
        | "STORE_ALREADY_PROVISIONED";
    };

type ProvisionFirstStoreOrganizerInput = {
  storeId: string;
  bootstrapAttemptId: string;
  organizerEmail: string;
  existingMemberships: readonly OrganizerMembership[];
  claimFirstOrganizer: (input: {
    attemptId: string;
    email: string;
    storeId: string;
  }) => ClaimFirstOrganizerResult;
  releaseFirstOrganizerClaim: (input: {
    attemptId: string;
    claimToken: string;
    storeId: string;
  }) => void;
  provisionOrganizer: (
    organizerEmail: string,
  ) => Promise<ProvisionOrganizerResult>;
  commitFirstOrganizer: (input: {
    attemptId: string;
    claimToken: string;
    email: string;
    membership: OrganizerMembership;
  }) => CommitFirstOrganizerResult;
};

export async function provisionFirstStoreOrganizer(
  input: ProvisionFirstStoreOrganizerInput,
) {
  const storeAlreadyHasOrganizer = input.existingMemberships.some(
    (membership) => membership.storeId === input.storeId,
  );

  if (storeAlreadyHasOrganizer) {
    return {
      ok: false,
      error: "STORE_ALREADY_PROVISIONED",
    } as const;
  }

  if (input.organizerEmail.trim().length === 0) {
    return {
      ok: false,
      error: "ORGANIZER_EMAIL_INVALID",
    } as const;
  }

  const normalizedEmail = input.organizerEmail.trim().toLowerCase();
  const claimedOrganizer = input.claimFirstOrganizer({
    attemptId: input.bootstrapAttemptId,
    email: normalizedEmail,
    storeId: input.storeId,
  });

  if (!claimedOrganizer.ok) {
    return claimedOrganizer;
  }

  let provisionedOrganizer: ProvisionOrganizerResult;

  try {
    provisionedOrganizer = await input.provisionOrganizer(normalizedEmail);
  } catch {
    provisionedOrganizer = { ok: false };
  }

  if (!provisionedOrganizer.ok) {
    input.releaseFirstOrganizerClaim({
      attemptId: input.bootstrapAttemptId,
      claimToken: claimedOrganizer.claimToken,
      storeId: input.storeId,
    });
    return {
      ok: false,
      error: "ORGANIZER_PROVISIONING_FAILED",
    } as const;
  }

  const committedOrganizer = input.commitFirstOrganizer({
    attemptId: input.bootstrapAttemptId,
    claimToken: claimedOrganizer.claimToken,
    email: normalizedEmail,
    membership: {
      organizerId: provisionedOrganizer.organizerId,
      storeId: input.storeId,
    },
  });

  if (!committedOrganizer.ok) {
    return committedOrganizer;
  }

  return {
    ok: true,
    organizerId: provisionedOrganizer.organizerId,
  } as const;
}
