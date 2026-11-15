import { DatabaseSync } from "node:sqlite";

import type { OrganizerMembership } from "../authorization/authorize-store-operation";

export type Store = {
  id: string;
  name: string;
};

type AddOrganizerMembershipResult =
  | { ok: true }
  | {
      ok: false;
      error: "ORGANIZER_MEMBERSHIP_ALREADY_EXISTS";
    };

export interface StoreMembershipRepository {
  createStore(store: Store): void;
  findStoreById(storeId: string): Store | undefined;
  addOrganizerMembership(
    membership: OrganizerMembership,
  ): AddOrganizerMembershipResult;
  findOrganizerMembershipsByStore(
    storeId: string,
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

    CREATE TABLE IF NOT EXISTS organizer_memberships (
      store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
      organizer_id TEXT NOT NULL,
      PRIMARY KEY (store_id, organizer_id)
    ) STRICT;
  `);

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

    close() {
      database.close();
    },
  };
}
