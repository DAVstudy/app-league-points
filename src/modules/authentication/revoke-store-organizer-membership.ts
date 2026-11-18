import {
  authorizeStoreOperation,
  type OrganizerMembership,
} from "../authorization/authorize-store-operation";

type RemoveMembershipResult =
  | { ok: true }
  | {
      ok: false;
      error:
        | "LAST_STORE_ORGANIZER_REQUIRED"
        | "ORGANIZER_MEMBERSHIP_NOT_FOUND";
    };

type RevokeStoreOrganizerMembershipInput = {
  actorOrganizerId: string;
  targetOrganizerId: string;
  storeId: string;
  memberships: readonly OrganizerMembership[];
  removeMembership: (
    membership: OrganizerMembership,
  ) => RemoveMembershipResult;
};

export function revokeStoreOrganizerMembership(
  input: RevokeStoreOrganizerMembershipInput,
) {
  const authorization = authorizeStoreOperation({
    actorOrganizerId: input.actorOrganizerId,
    storeId: input.storeId,
    memberships: input.memberships,
  });

  if (!authorization.ok) {
    return authorization;
  }

  const storeMembershipCount = input.memberships.filter(
    (membership) => membership.storeId === input.storeId,
  ).length;

  if (storeMembershipCount <= 1) {
    return {
      ok: false,
      error: "LAST_STORE_ORGANIZER_REQUIRED",
    } as const;
  }

  return input.removeMembership({
    organizerId: input.targetOrganizerId,
    storeId: input.storeId,
  });
}
