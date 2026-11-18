type SupabaseAuthUser = {
  email?: string;
  id: string;
};

type SupabaseUserResult = {
  data: {
    user: SupabaseAuthUser | null;
  };
  error: unknown | null;
};

type SupabaseInviteResult = SupabaseUserResult;

type SupabaseListUsersResult = {
  data: {
    nextPage?: number | null;
    users: SupabaseAuthUser[];
  };
  error: unknown | null;
};

type SupabaseOrganizerAuthClient = {
  auth: {
    getUser(accessToken: string): Promise<SupabaseUserResult>;
    admin: {
      inviteUserByEmail(email: string): Promise<SupabaseInviteResult>;
      listUsers(params: {
        page: number;
        perPage: number;
      }): Promise<SupabaseListUsersResult>;
    };
  };
};

type IsKnownOrganizerIdentity = (organizerId: string) => Promise<boolean>;

export function createSupabaseOrganizerAuthGateway(
  client: SupabaseOrganizerAuthClient,
  isKnownOrganizerIdentity: IsKnownOrganizerIdentity,
) {
  async function findUserByEmail(email: string) {
    let page = 1;

    while (true) {
      const { data, error } = await client.auth.admin.listUsers({
        page,
        perPage: 1000,
      });

      if (error !== null) {
        return { ok: false } as const;
      }

      const user = data.users.find(
        (candidate) => candidate.email?.toLowerCase() === email,
      );

      if (user !== undefined) {
        return { ok: true, user } as const;
      }

      if (data.nextPage == null) {
        return { ok: true, user: undefined } as const;
      }

      page = data.nextPage;
    }
  }

  async function sendInvitation(inviteeEmail: string) {
    try {
      const { data, error } =
        await client.auth.admin.inviteUserByEmail(inviteeEmail);

      if (error !== null || data.user === null) {
        return { ok: false } as const;
      }

      return {
        ok: true,
        organizerId: data.user.id,
      } as const;
    } catch {
      return { ok: false } as const;
    }
  }

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

    sendInvitation,

    async provisionOrganizer(organizerEmail: string) {
      const normalizedEmail = organizerEmail.trim().toLowerCase();

      try {
        const existingUser = await findUserByEmail(normalizedEmail);

        if (!existingUser.ok) {
          return { ok: false } as const;
        }

        if (existingUser.user !== undefined) {
          return {
            ok: true,
            organizerId: existingUser.user.id,
          } as const;
        }

        return sendInvitation(normalizedEmail);
      } catch {
        return { ok: false } as const;
      }
    },
  };
}
