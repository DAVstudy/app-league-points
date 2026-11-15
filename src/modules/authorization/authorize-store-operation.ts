export type OrganizerMembership = {
  organizerId: string;
  storeId: string;
};

type AuthorizeStoreOperationInput = {
  actorOrganizerId: string;
  storeId: string;
  memberships: readonly OrganizerMembership[];
};

type ExecuteAuthorizedStoreOperationInput<TResult> =
  AuthorizeStoreOperationInput & {
    operation: () => TResult;
  };

export function authorizeStoreOperation(
  input: AuthorizeStoreOperationInput,
) {
  const hasStoreMembership = input.memberships.some(
    (membership) =>
      membership.organizerId === input.actorOrganizerId &&
      membership.storeId === input.storeId,
  );

  if (hasStoreMembership) {
    return {
      ok: true,
    } as const;
  }

  return {
    ok: false,
    error: "STORE_ACCESS_DENIED",
  } as const;
}

export function executeAuthorizedStoreOperation<TResult>(
  input: ExecuteAuthorizedStoreOperationInput<TResult>,
) {
  const authorization = authorizeStoreOperation(input);

  if (!authorization.ok) {
    return authorization;
  }

  const value = input.operation();

  return {
    ok: true,
    value,
  } as const;
}
