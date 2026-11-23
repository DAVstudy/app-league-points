import {
  authorizeStoreOperation,
  type OrganizerMembership,
} from "../authorization/authorize-store-operation";

type SelectActiveStoreContextInput = {
  organizerId: string;
  requestedStoreId: string;
  memberships: readonly OrganizerMembership[];
};

export function selectActiveStoreContext(
  input: SelectActiveStoreContextInput,
) {
  const authorization = authorizeStoreOperation({
    actorOrganizerId: input.organizerId,
    storeId: input.requestedStoreId,
    memberships: input.memberships,
  });

  if (!authorization.ok) {
    return authorization;
  }

  return {
    ok: true,
    activeStore: {
      organizerId: input.organizerId,
      storeId: input.requestedStoreId,
    },
  } as const;
}
