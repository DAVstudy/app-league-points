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
  storeId: string;
  inviteeEmail: string;
  memberships: readonly OrganizerMembership[];
  sendInvitation: (
    inviteeEmail: string,
  ) => Promise<SendInvitationResult>;
  findOrganizerIdentityByEmail: (
    email: string,
  ) => Pick<OrganizerIdentity, "organizerId"> | undefined;
  saveOrganizerIdentity: (
    identity: OrganizerIdentity,
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
    const invitedOrganizer = await input.sendInvitation(normalizedEmail);

    if (!invitedOrganizer.ok) {
      return {
        ok: false,
        error: "ORGANIZER_INVITATION_FAILED",
      } as const;
    }

    organizerId = invitedOrganizer.organizerId;
    const savedIdentity = input.saveOrganizerIdentity({
      email: normalizedEmail,
      organizerId,
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
