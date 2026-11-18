type SupabaseAuthUser = {
  id: string;
};

type SupabaseUserResult = {
  data: {
    user: SupabaseAuthUser | null;
  };
  error: unknown | null;
};

type SupabaseInviteResult = SupabaseUserResult;

type SupabaseOrganizerAuthClient = {
  auth: {
    getUser(accessToken: string): Promise<SupabaseUserResult>;
    admin: {
      inviteUserByEmail(email: string): Promise<SupabaseInviteResult>;
    };
  };
};

type IsKnownOrganizerIdentity = (organizerId: string) => Promise<boolean>;

export function createSupabaseOrganizerAuthGateway(
  client: SupabaseOrganizerAuthClient,
  isKnownOrganizerIdentity: IsKnownOrganizerIdentity,
) {
  return {
    async verifyAccessToken(accessToken: string) {
      try {
        const { data, error } = await client.auth.getUser(accessToken);

        if (error !== null || data.user === null) {
          return undefined;
        }

        if (!(await isKnownOrganizerIdentity(data.user.id))) {
          return undefined;
        }

        return {
          organizerId: data.user.id,
        };
      } catch {
        return undefined;
      }
    },

    async sendInvitation(inviteeEmail: string) {
      try {
        const { data, error } =
          await client.auth.admin.inviteUserByEmail(inviteeEmail);

        if (error !== null || data.user === null) {
          return {
            ok: false,
          } as const;
        }

        return {
          ok: true,
          organizerId: data.user.id,
        } as const;
      } catch {
        return {
          ok: false,
        } as const;
      }
    },
  };
}
