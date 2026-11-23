import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";

import type { OrganizerMembership } from "../authorization/authorize-store-operation";

export type Store = {
  id: string;
  name: string;
};

export type PendingOrganizerInvitation = {
  invitedByOrganizerId: string;
  organizerId: string;
  storeId: string;
};

export type OrganizerIdentity = {
  email: string;
  organizerId: string;
};

type AddOrganizerMembershipResult =
  | { ok: true }
  | {
      ok: false;
      error: "ORGANIZER_MEMBERSHIP_ALREADY_EXISTS";
    };

type RemoveOrganizerMembershipResult =
  | { ok: true }
  | {
      ok: false;
      error:
        | "LAST_STORE_ORGANIZER_REQUIRED"
        | "ORGANIZER_MEMBERSHIP_NOT_FOUND";
    };

type CreatePendingOrganizerInvitationResult =
  | { ok: true }
  | {
      ok: false;
      error: "ORGANIZER_INVITATION_ALREADY_PENDING";
    };

type ActivatePendingOrganizerInvitationResult =
  | { ok: true }
  | {
      ok: false;
      error: "ORGANIZER_INVITATION_NOT_FOUND";
    };

type SaveOrganizerIdentityResult =
  | { ok: true }
  | {
      ok: false;
      error: "ORGANIZER_IDENTITY_CONFLICT";
    };

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

type RecoverFirstOrganizerClaimResult =
  | { ok: true }
  | {
      ok: false;
      error: "ORGANIZER_BOOTSTRAP_CLAIM_NOT_FOUND";
    };

export interface StoreMembershipRepository {
  createStore(store: Store): void;
  findStoreById(storeId: string): Store | undefined;
  saveOrganizerIdentity(
    identity: OrganizerIdentity,
  ): SaveOrganizerIdentityResult;
  findOrganizerIdentityByEmail(
    email: string,
  ): OrganizerIdentity | undefined;
  hasOrganizerIdentity(organizerId: string): boolean;
  claimFirstOrganizer(input: {
    attemptId: string;
    email: string;
    storeId: string;
  }): ClaimFirstOrganizerResult;
  releaseFirstOrganizerClaim(input: {
    attemptId: string;
    claimToken: string;
    storeId: string;
  }): void;
  recoverFirstOrganizerClaim(input: {
    attemptId: string;
    storeId: string;
  }): RecoverFirstOrganizerClaimResult;
  commitFirstOrganizer(input: {
    attemptId: string;
    claimToken: string;
    email: string;
    membership: OrganizerMembership;
  }): CommitFirstOrganizerResult;
  addOrganizerMembership(
    membership: OrganizerMembership,
  ): AddOrganizerMembershipResult;
  removeOrganizerMembership(
    membership: OrganizerMembership,
  ): RemoveOrganizerMembershipResult;
  createPendingOrganizerInvitation(
    invitation: PendingOrganizerInvitation,
  ): CreatePendingOrganizerInvitationResult;
  findPendingOrganizerInvitation(
    membership: OrganizerMembership,
  ): PendingOrganizerInvitation | undefined;
  activatePendingOrganizerInvitation(
    membership: OrganizerMembership,
  ): ActivatePendingOrganizerInvitationResult;
  findOrganizerMembershipsByStore(
    storeId: string,
  ): OrganizerMembership[];
  findOrganizerMembershipsByOrganizer(
    organizerId: string,
  ): OrganizerMembership[];
  close(): void;
}

export function createSqliteStoreMembershipRepository(
  databasePath: string,
): StoreMembershipRepository {
  const database = new DatabaseSync(databasePath);

  database.exec(`
    CREATE TABLE IF NOT EXISTS stores (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL
    ) STRICT;

    CREATE TABLE IF NOT EXISTS organizer_identities (
      organizer_id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      CHECK (length(trim(email)) > 0 AND email = lower(trim(email)))
    ) STRICT;

    CREATE TABLE IF NOT EXISTS organizer_memberships (
      store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
      organizer_id TEXT NOT NULL,
      PRIMARY KEY (store_id, organizer_id)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS pending_organizer_invitations (
      store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
      organizer_id TEXT NOT NULL,
      invited_by_organizer_id TEXT NOT NULL,
      PRIMARY KEY (store_id, organizer_id)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS first_organizer_claims (
      store_id TEXT PRIMARY KEY REFERENCES stores(id) ON DELETE CASCADE,
      attempt_id TEXT NOT NULL,
      email TEXT NOT NULL COLLATE NOCASE,
      claim_token TEXT,
      CHECK (length(trim(email)) > 0 AND email = lower(trim(email)))
    ) STRICT;
  `);

  const claimColumns = database
    .prepare("PRAGMA table_info(first_organizer_claims)")
    .all();
  const hasClaimAttemptId = claimColumns.some(
    (column) => column.name === "attempt_id",
  );

  if (!hasClaimAttemptId) {
    database.exec(`
      BEGIN IMMEDIATE;
      ALTER TABLE first_organizer_claims
        RENAME TO legacy_first_organizer_claims;
      CREATE TABLE first_organizer_claims (
        store_id TEXT PRIMARY KEY REFERENCES stores(id) ON DELETE CASCADE,
        attempt_id TEXT NOT NULL,
        email TEXT NOT NULL COLLATE NOCASE,
        claim_token TEXT,
        CHECK (length(trim(email)) > 0 AND email = lower(trim(email)))
      ) STRICT;
      INSERT INTO first_organizer_claims (
        store_id,
        attempt_id,
        email,
        claim_token
      )
      SELECT
        store_id,
        'legacy:' || store_id,
        email,
        'ADMINISTRATIVE_RECOVERY_REQUIRED'
      FROM legacy_first_organizer_claims;
      DROP TABLE legacy_first_organizer_claims;
      COMMIT;
    `);
  }

  return {
    createStore(store: Store) {
      database
        .prepare("INSERT INTO stores (id, name) VALUES (?, ?)")
        .run(store.id, store.name);
    },

    findStoreById(storeId: string): Store | undefined {
      const row = database
        .prepare("SELECT id, name FROM stores WHERE id = ?")
        .get(storeId);

      if (row === undefined) {
        return undefined;
      }

      if (typeof row.id !== "string" || typeof row.name !== "string") {
        throw new Error("INVALID_STORE_ROW");
      }

      return {
        id: row.id,
        name: row.name,
      };
    },

    saveOrganizerIdentity(identity: OrganizerIdentity) {
      const result = database
        .prepare(`
          INSERT INTO organizer_identities (organizer_id, email)
          VALUES (?, ?)
          ON CONFLICT DO NOTHING
        `)
        .run(identity.organizerId, identity.email);

      if (result.changes === 0) {
        return {
          ok: false,
          error: "ORGANIZER_IDENTITY_CONFLICT",
        } as const;
      }

      return {
        ok: true,
      } as const;
    },

    findOrganizerIdentityByEmail(email: string) {
      const row = database
        .prepare(`
          SELECT organizer_id AS organizerId, email
          FROM organizer_identities
          WHERE email = ? COLLATE NOCASE
        `)
        .get(email);

      if (row === undefined) {
        return undefined;
      }

      if (
        typeof row.organizerId !== "string" ||
        typeof row.email !== "string"
      ) {
        throw new Error("INVALID_ORGANIZER_IDENTITY_ROW");
      }

      return {
        email: row.email,
        organizerId: row.organizerId,
      };
    },

    hasOrganizerIdentity(organizerId: string) {
      return (
        database
          .prepare(`
            SELECT 1
            FROM organizer_identities
            WHERE organizer_id = ?
          `)
          .get(organizerId) !== undefined
      );
    },

    claimFirstOrganizer({ attemptId, email, storeId }) {
      database.exec("BEGIN IMMEDIATE");

      try {
        const existingMembership = database
          .prepare(`
            SELECT 1
            FROM organizer_memberships
            WHERE store_id = ?
            LIMIT 1
          `)
          .get(storeId);

        if (existingMembership !== undefined) {
          database.exec("ROLLBACK");
          return { ok: false, error: "STORE_ALREADY_PROVISIONED" } as const;
        }

        const claim = database
          .prepare(`
            SELECT attempt_id AS attemptId, claim_token AS claimToken, email
            FROM first_organizer_claims
            WHERE store_id = ?
          `)
          .get(storeId);
        const claimToken = randomUUID();

        if (claim === undefined) {
          database
            .prepare(`
              INSERT INTO first_organizer_claims (
                store_id,
                attempt_id,
                email,
                claim_token
              ) VALUES (?, ?, ?, ?)
            `)
            .run(storeId, attemptId, email, claimToken);
        } else if (
          claim.attemptId !== attemptId ||
          claim.email !== email ||
          claim.claimToken !== null
        ) {
          database.exec("ROLLBACK");
          return {
            ok: false,
            error: "ORGANIZER_BOOTSTRAP_IN_PROGRESS",
          } as const;
        } else {
          database
            .prepare(`
              UPDATE first_organizer_claims
              SET claim_token = ?
              WHERE store_id = ? AND claim_token IS NULL
            `)
            .run(claimToken, storeId);
        }

        database.exec("COMMIT");
        return { ok: true, claimToken } as const;
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
    },

    releaseFirstOrganizerClaim({ attemptId, claimToken, storeId }) {
      database
        .prepare(`
          UPDATE first_organizer_claims
          SET claim_token = NULL
          WHERE store_id = ? AND attempt_id = ? AND claim_token = ?
        `)
        .run(storeId, attemptId, claimToken);
    },

    recoverFirstOrganizerClaim({ attemptId, storeId }) {
      const result = database
        .prepare(`
          UPDATE first_organizer_claims
          SET claim_token = NULL
          WHERE store_id = ? AND attempt_id = ?
        `)
        .run(storeId, attemptId);

      if (result.changes === 0) {
        return {
          ok: false,
          error: "ORGANIZER_BOOTSTRAP_CLAIM_NOT_FOUND",
        } as const;
      }

      return { ok: true } as const;
    },

    commitFirstOrganizer({ attemptId, claimToken, email, membership }) {
      database.exec("BEGIN IMMEDIATE");

      try {
        const existingMembership = database
          .prepare(`
            SELECT 1
            FROM organizer_memberships
            WHERE store_id = ?
            LIMIT 1
          `)
          .get(membership.storeId);

        if (existingMembership !== undefined) {
          database.exec("ROLLBACK");
          return { ok: false, error: "STORE_ALREADY_PROVISIONED" } as const;
        }

        const claim = database
          .prepare(`
            SELECT attempt_id AS attemptId, claim_token AS claimToken, email
            FROM first_organizer_claims
            WHERE store_id = ?
          `)
          .get(membership.storeId);

        if (
          claim?.attemptId !== attemptId ||
          claim.claimToken !== claimToken ||
          claim.email !== email
        ) {
          database.exec("ROLLBACK");
          return { ok: false, error: "STORE_ALREADY_PROVISIONED" } as const;
        }

        const identity = database
          .prepare(`
            SELECT organizer_id AS organizerId, email
            FROM organizer_identities
            WHERE organizer_id = ? OR email = ? COLLATE NOCASE
          `)
          .get(membership.organizerId, email);

        if (identity === undefined) {
          database
            .prepare(`
              INSERT INTO organizer_identities (organizer_id, email)
              VALUES (?, ?)
            `)
            .run(membership.organizerId, email);
        } else if (
          identity.organizerId !== membership.organizerId ||
          identity.email !== email
        ) {
          database.exec("ROLLBACK");
          return { ok: false, error: "ORGANIZER_IDENTITY_CONFLICT" } as const;
        }

        database
          .prepare(`
            INSERT INTO organizer_memberships (store_id, organizer_id)
            VALUES (?, ?)
          `)
          .run(membership.storeId, membership.organizerId);
        database
          .prepare(`
            DELETE FROM first_organizer_claims
            WHERE store_id = ? AND attempt_id = ? AND claim_token = ?
          `)
          .run(membership.storeId, attemptId, claimToken);
        database.exec("COMMIT");

        return { ok: true } as const;
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
    },

    addOrganizerMembership(membership: OrganizerMembership) {
      const result = database
        .prepare(`
          INSERT INTO organizer_memberships (store_id, organizer_id)
          VALUES (?, ?)
          ON CONFLICT (store_id, organizer_id) DO NOTHING
        `)
        .run(membership.storeId, membership.organizerId);

      if (result.changes === 0) {
        return {
          ok: false,
          error: "ORGANIZER_MEMBERSHIP_ALREADY_EXISTS",
        } as const;
      }

      return {
        ok: true,
      } as const;
    },

    removeOrganizerMembership(membership: OrganizerMembership) {
      const result = database
        .prepare(`
          DELETE FROM organizer_memberships
          WHERE store_id = ?
            AND organizer_id = ?
            AND (
              SELECT COUNT(*)
              FROM organizer_memberships
              WHERE store_id = ?
            ) > 1
        `)
        .run(
          membership.storeId,
          membership.organizerId,
          membership.storeId,
        );

      if (result.changes === 0) {
        const membershipExists = database
          .prepare(`
            SELECT 1
            FROM organizer_memberships
            WHERE store_id = ? AND organizer_id = ?
          `)
          .get(membership.storeId, membership.organizerId);

        if (membershipExists !== undefined) {
          return {
            ok: false,
            error: "LAST_STORE_ORGANIZER_REQUIRED",
          } as const;
        }

        return {
          ok: false,
          error: "ORGANIZER_MEMBERSHIP_NOT_FOUND",
        } as const;
      }

      return {
        ok: true,
      } as const;
    },

    createPendingOrganizerInvitation(
      invitation: PendingOrganizerInvitation,
    ) {
      const result = database
        .prepare(`
          INSERT INTO pending_organizer_invitations (
            store_id,
            organizer_id,
            invited_by_organizer_id
          )
          VALUES (?, ?, ?)
          ON CONFLICT (store_id, organizer_id) DO NOTHING
        `)
        .run(
          invitation.storeId,
          invitation.organizerId,
          invitation.invitedByOrganizerId,
        );

      if (result.changes === 0) {
        return {
          ok: false,
          error: "ORGANIZER_INVITATION_ALREADY_PENDING",
        } as const;
      }

      return {
        ok: true,
      } as const;
    },

    findPendingOrganizerInvitation(membership: OrganizerMembership) {
      const row = database
        .prepare(`
          SELECT
            store_id AS storeId,
            organizer_id AS organizerId,
            invited_by_organizer_id AS invitedByOrganizerId
          FROM pending_organizer_invitations
          WHERE store_id = ? AND organizer_id = ?
        `)
        .get(membership.storeId, membership.organizerId);

      if (row === undefined) {
        return undefined;
      }

      if (
        typeof row.storeId !== "string" ||
        typeof row.organizerId !== "string" ||
        typeof row.invitedByOrganizerId !== "string"
      ) {
        throw new Error("INVALID_PENDING_ORGANIZER_INVITATION_ROW");
      }

      return {
        invitedByOrganizerId: row.invitedByOrganizerId,
        organizerId: row.organizerId,
        storeId: row.storeId,
      };
    },

    activatePendingOrganizerInvitation(
      membership: OrganizerMembership,
    ) {
      database.exec("BEGIN IMMEDIATE");

      try {
        const pendingInvitation = database
          .prepare(`
            SELECT 1
            FROM pending_organizer_invitations
            WHERE store_id = ? AND organizer_id = ?
          `)
          .get(membership.storeId, membership.organizerId);

        if (pendingInvitation === undefined) {
          database.exec("ROLLBACK");

          return {
            ok: false,
            error: "ORGANIZER_INVITATION_NOT_FOUND",
          } as const;
        }

        database
          .prepare(`
            INSERT INTO organizer_memberships (store_id, organizer_id)
            VALUES (?, ?)
            ON CONFLICT (store_id, organizer_id) DO NOTHING
          `)
          .run(membership.storeId, membership.organizerId);
        database
          .prepare(`
            DELETE FROM pending_organizer_invitations
            WHERE store_id = ? AND organizer_id = ?
          `)
          .run(membership.storeId, membership.organizerId);
        database.exec("COMMIT");

        return {
          ok: true,
        } as const;
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
    },

    findOrganizerMembershipsByStore(
      storeId: string,
    ): OrganizerMembership[] {
      const rows = database
        .prepare(`
          SELECT store_id AS storeId, organizer_id AS organizerId
          FROM organizer_memberships
          WHERE store_id = ?
          ORDER BY organizer_id
        `)
        .all(storeId);

      return rows.map((row) => {
        if (
          typeof row.storeId !== "string" ||
          typeof row.organizerId !== "string"
        ) {
          throw new Error("INVALID_ORGANIZER_MEMBERSHIP_ROW");
        }

        return {
          organizerId: row.organizerId,
          storeId: row.storeId,
        };
      });
    },

    findOrganizerMembershipsByOrganizer(
      organizerId: string,
    ): OrganizerMembership[] {
      const rows = database
        .prepare(`
          SELECT store_id AS storeId, organizer_id AS organizerId
          FROM organizer_memberships
          WHERE organizer_id = ?
          ORDER BY store_id
        `)
        .all(organizerId);

      return rows.map((row) => {
        if (
          typeof row.storeId !== "string" ||
          typeof row.organizerId !== "string"
        ) {
          throw new Error("INVALID_ORGANIZER_MEMBERSHIP_ROW");
        }

        return {
          organizerId: row.organizerId,
          storeId: row.storeId,
        };
      });
    },

    close() {
      database.close();
    },
  };
}
