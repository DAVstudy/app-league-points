import type { OrganizerMembership } from "../authorization/authorize-store-operation";

type ActivatePendingInvitationResult =
  | { ok: true }
  | {
      ok: false;
      error: "ORGANIZER_INVITATION_NOT_FOUND";
    };

type AcceptStoreOrganizerInvitationInput = {
  authenticatedOrganizerId: string;
  storeId: string;
  activatePendingInvitation: (
    membership: OrganizerMembership,
  ) => ActivatePendingInvitationResult;
};

export function acceptStoreOrganizerInvitation(
  input: AcceptStoreOrganizerInvitationInput,
) {
  return input.activatePendingInvitation({
    organizerId: input.authenticatedOrganizerId,
    storeId: input.storeId,
  });
}
