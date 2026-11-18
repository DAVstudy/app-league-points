import {
  authorizeStoreOperation,
  type OrganizerMembership,
} from "../authorization/authorize-store-operation";

type SendInvitationResult =
  | {
      ok: true;
      organizerId: string;
    }
  | { ok: false };

type OrganizerIdentity = {
  email: string;
  organizerId: string;
};

type SaveOrganizerIdentityResult =
  | { ok: true }
  | {
      ok: false;
      error: "ORGANIZER_IDENTITY_CONFLICT";
    };

type ClaimOrganizerIdentityResult =
  | { ok: true; claimToken: string }
  | {
      ok: false;
      error: "ORGANIZER_INVITATION_IN_PROGRESS";
    };

type PendingOrganizerInvitation = {
  invitedByOrganizerId: string;
  organizerId: string;
  storeId: string;
};

type CreatePendingInvitationResult =
  | { ok: true }
  | {
      ok: false;
      error: "ORGANIZER_INVITATION_ALREADY_PENDING";
    };

type InviteStoreOrganizerInput = {
  actorOrganizerId: string;
  invitationAttemptId: string;
  storeId: string;
  inviteeEmail: string;
  memberships: readonly OrganizerMembership[];
  sendInvitation: (
    inviteeEmail: string,
  ) => Promise<SendInvitationResult>;
  findOrganizerIdentityByEmail: (
    email: string,
  ) => Pick<OrganizerIdentity, "organizerId"> | undefined;
  claimOrganizerIdentity: (input: {
    attemptId: string;
    email: string;
  }) => ClaimOrganizerIdentityResult;
  releaseOrganizerIdentityClaim: (input: {
    attemptId: string;
    claimToken: string;
    email: string;
  }) => void;
  saveOrganizerIdentity: (
    identity: OrganizerIdentity & {
      attemptId: string;
      claimToken: string;
    },
  ) => SaveOrganizerIdentityResult;
  createPendingInvitation: (
    invitation: PendingOrganizerInvitation,
  ) => CreatePendingInvitationResult;
};

export async function inviteStoreOrganizer(
  input: InviteStoreOrganizerInput,
) {
  const authorization = authorizeStoreOperation({
    actorOrganizerId: input.actorOrganizerId,
    storeId: input.storeId,
    memberships: input.memberships,
  });

  if (!authorization.ok) {
    return authorization;
  }

  if (input.inviteeEmail.trim().length === 0) {
    return {
      ok: false,
      error: "ORGANIZER_EMAIL_INVALID",
    } as const;
  }

  const normalizedEmail = input.inviteeEmail.trim().toLowerCase();
  const existingIdentity =
    input.findOrganizerIdentityByEmail(normalizedEmail);
  let organizerId = existingIdentity?.organizerId;

  if (organizerId === undefined) {
    const claimedIdentity = input.claimOrganizerIdentity({
      attemptId: input.invitationAttemptId,
      email: normalizedEmail,
    });

    if (!claimedIdentity.ok) {
      return claimedIdentity;
    }

    const invitedOrganizer = await input.sendInvitation(normalizedEmail);

    if (!invitedOrganizer.ok) {
      input.releaseOrganizerIdentityClaim({
        attemptId: input.invitationAttemptId,
        claimToken: claimedIdentity.claimToken,
        email: normalizedEmail,
      });
      return {
        ok: false,
        error: "ORGANIZER_INVITATION_FAILED",
      } as const;
    }

    organizerId = invitedOrganizer.organizerId;
    const savedIdentity = input.saveOrganizerIdentity({
      email: normalizedEmail,
      organizerId,
      attemptId: input.invitationAttemptId,
      claimToken: claimedIdentity.claimToken,
    });

    if (!savedIdentity.ok) {
      return savedIdentity;
    }
  }

  const pendingInvitation = input.createPendingInvitation({
    invitedByOrganizerId: input.actorOrganizerId,
    organizerId,
    storeId: input.storeId,
  });

  if (!pendingInvitation.ok) {
    return pendingInvitation;
  }

  return {
    ok: true,
    organizerId,
  } as const;
}
