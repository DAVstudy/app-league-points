import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { authorizeStoreOperation } from "../authorization/authorize-store-operation";
import { createSqliteStoreMembershipRepository } from "./sqlite-store-membership-repository";

async function hashFile(path: string) {
  const contents = await readFile(path);

  return createHash("sha256").update(contents).digest("hex");
}

describe("createSqliteStoreMembershipRepository", () => {
  const temporaryDirectories: string[] = [];

  afterEach(async () => {
    await Promise.all(
      temporaryDirectories.splice(0).map((directory) =>
        rm(directory, {
          force: true,
          recursive: true,
        }),
      ),
    );
  });

  it("persists a store after the repository is reopened", async () => {
    const directory = await mkdtemp(join(tmpdir(), "league-points-"));
    temporaryDirectories.push(directory);
    const databasePath = join(directory, "league-points.sqlite");

    const firstRepository =
      createSqliteStoreMembershipRepository(databasePath);

    firstRepository.createStore({
      id: "STORE-1",
      name: "Local League",
    });
    firstRepository.close();

    const reopenedRepository =
      createSqliteStoreMembershipRepository(databasePath);

    expect(reopenedRepository.findStoreById("STORE-1")).toEqual({
      id: "STORE-1",
      name: "Local League",
    });

    reopenedRepository.close();
  });

  it("persists and resolves one organizer identity by email", async () => {
    const directory = await mkdtemp(join(tmpdir(), "league-points-"));
    temporaryDirectories.push(directory);
    const databasePath = join(directory, "league-points.sqlite");
    const repository = createSqliteStoreMembershipRepository(databasePath);

    expect(
      repository.saveOrganizerIdentity({
        email: "organizer@example.com",
        organizerId: "ORG-1",
      }),
    ).toEqual({ ok: true });
    repository.close();

    const reopenedRepository =
      createSqliteStoreMembershipRepository(databasePath);

    expect(
      reopenedRepository.findOrganizerIdentityByEmail(
        "ORGANIZER@example.com",
      ),
    ).toEqual({
      email: "organizer@example.com",
      organizerId: "ORG-1",
    });

    reopenedRepository.close();
  });

  it("resolves whether an authenticated organizer identity is known", async () => {
    const directory = await mkdtemp(join(tmpdir(), "league-points-"));
    temporaryDirectories.push(directory);
    const databasePath = join(directory, "league-points.sqlite");
    const repository = createSqliteStoreMembershipRepository(databasePath);

    repository.saveOrganizerIdentity({
      email: "organizer@example.com",
      organizerId: "ORG-1",
    });

    expect(repository.hasOrganizerIdentity("ORG-1")).toBe(true);
    expect(repository.hasOrganizerIdentity("PLAYER-1")).toBe(false);

    repository.close();
  });

  it("persists memberships and returns only those from the requested store", async () => {
    const directory = await mkdtemp(join(tmpdir(), "league-points-"));
    temporaryDirectories.push(directory);
    const databasePath = join(directory, "league-points.sqlite");

    const firstRepository =
      createSqliteStoreMembershipRepository(databasePath);

    firstRepository.createStore({ id: "STORE-1", name: "Local League" });
    firstRepository.createStore({ id: "STORE-2", name: "Other League" });
    firstRepository.addOrganizerMembership({
      organizerId: "ORG-1",
      storeId: "STORE-1",
    });
    firstRepository.addOrganizerMembership({
      organizerId: "ORG-1",
      storeId: "STORE-2",
    });
    firstRepository.close();

    const reopenedRepository =
      createSqliteStoreMembershipRepository(databasePath);

    expect(
      reopenedRepository.findOrganizerMembershipsByStore("STORE-1"),
    ).toEqual([
      {
        organizerId: "ORG-1",
        storeId: "STORE-1",
      },
    ]);
    expect(
      reopenedRepository.findOrganizerMembershipsByStore("STORE-2"),
    ).toEqual([
      {
        organizerId: "ORG-1",
        storeId: "STORE-2",
      },
    ]);
    expect(
      reopenedRepository.findOrganizerMembershipsByStore("STORE-UNKNOWN"),
    ).toEqual([]);

    reopenedRepository.close();
  });

  it("persists an organizer invitation without granting store membership", async () => {
    const directory = await mkdtemp(join(tmpdir(), "league-points-"));
    temporaryDirectories.push(directory);
    const databasePath = join(directory, "league-points.sqlite");
    const repository = createSqliteStoreMembershipRepository(databasePath);

    repository.createStore({ id: "STORE-1", name: "Local League" });
    repository.addOrganizerMembership({
      organizerId: "ORG-1",
      storeId: "STORE-1",
    });

    expect(
      repository.createPendingOrganizerInvitation({
        invitedByOrganizerId: "ORG-1",
        organizerId: "ORG-2",
        storeId: "STORE-1",
      }),
    ).toEqual({ ok: true });
    repository.close();

    const reopenedRepository =
      createSqliteStoreMembershipRepository(databasePath);

    expect(
      reopenedRepository.findPendingOrganizerInvitation({
        organizerId: "ORG-2",
        storeId: "STORE-1",
      }),
    ).toEqual({
      invitedByOrganizerId: "ORG-1",
      organizerId: "ORG-2",
      storeId: "STORE-1",
    });
    expect(
      reopenedRepository.findOrganizerMembershipsByStore("STORE-1"),
    ).toEqual([
      {
        organizerId: "ORG-1",
        storeId: "STORE-1",
      },
    ]);

    reopenedRepository.close();
  });

  it("atomically activates a pending invitation as store membership", async () => {
    const directory = await mkdtemp(join(tmpdir(), "league-points-"));
    temporaryDirectories.push(directory);
    const databasePath = join(directory, "league-points.sqlite");
    const repository = createSqliteStoreMembershipRepository(databasePath);
    const invitedMembership = {
      organizerId: "ORG-2",
      storeId: "STORE-1",
    };

    repository.createStore({ id: "STORE-1", name: "Local League" });
    repository.addOrganizerMembership({
      organizerId: "ORG-1",
      storeId: "STORE-1",
    });
    repository.createPendingOrganizerInvitation({
      invitedByOrganizerId: "ORG-1",
      ...invitedMembership,
    });

    expect(
      repository.activatePendingOrganizerInvitation(invitedMembership),
    ).toEqual({ ok: true });
    repository.close();

    const reopenedRepository =
      createSqliteStoreMembershipRepository(databasePath);

    expect(
      reopenedRepository.findPendingOrganizerInvitation(invitedMembership),
    ).toBeUndefined();
    expect(
      reopenedRepository.findOrganizerMembershipsByStore("STORE-1"),
    ).toEqual([
      {
        organizerId: "ORG-1",
        storeId: "STORE-1",
      },
      invitedMembership,
    ]);

    reopenedRepository.close();
  });

  it("returns every store membership for one organizer account", async () => {
    const directory = await mkdtemp(join(tmpdir(), "league-points-"));
    temporaryDirectories.push(directory);
    const repository = createSqliteStoreMembershipRepository(
      join(directory, "league-points.sqlite"),
    );

    repository.createStore({ id: "STORE-1", name: "Local League" });
    repository.createStore({ id: "STORE-2", name: "Other League" });
    repository.addOrganizerMembership({
      organizerId: "ORG-1",
      storeId: "STORE-1",
    });
    repository.addOrganizerMembership({
      organizerId: "ORG-1",
      storeId: "STORE-2",
    });
    repository.addOrganizerMembership({
      organizerId: "ORG-2",
      storeId: "STORE-2",
    });

    expect(
      repository.findOrganizerMembershipsByOrganizer("ORG-1"),
    ).toEqual([
      {
        organizerId: "ORG-1",
        storeId: "STORE-1",
      },
      {
        organizerId: "ORG-1",
        storeId: "STORE-2",
      },
    ]);

    repository.close();
  });

  it("rejects a duplicate organizer membership", async () => {
    const directory = await mkdtemp(join(tmpdir(), "league-points-"));
    temporaryDirectories.push(directory);
    const databasePath = join(directory, "league-points.sqlite");
    const repository = createSqliteStoreMembershipRepository(databasePath);
    const membership = {
      organizerId: "ORG-1",
      storeId: "STORE-1",
    };

    repository.createStore({ id: "STORE-1", name: "Local League" });
    repository.addOrganizerMembership(membership);
    const databaseHashBeforeDuplicate = await hashFile(databasePath);

    expect(repository.addOrganizerMembership(membership)).toEqual({
      ok: false,
      error: "ORGANIZER_MEMBERSHIP_ALREADY_EXISTS",
    });
    expect(await hashFile(databasePath)).toBe(databaseHashBeforeDuplicate);
    expect(repository.findOrganizerMembershipsByStore("STORE-1")).toEqual([
      membership,
    ]);

    repository.close();
  });

  it("removes only the requested organizer and store membership", async () => {
    const directory = await mkdtemp(join(tmpdir(), "league-points-"));
    temporaryDirectories.push(directory);
    const databasePath = join(directory, "league-points.sqlite");
    const repository = createSqliteStoreMembershipRepository(databasePath);

    repository.createStore({ id: "STORE-1", name: "Local League" });
    repository.createStore({ id: "STORE-2", name: "Other League" });
    repository.addOrganizerMembership({
      organizerId: "ORG-1",
      storeId: "STORE-1",
    });
    repository.addOrganizerMembership({
      organizerId: "ORG-2",
      storeId: "STORE-1",
    });
    repository.addOrganizerMembership({
      organizerId: "ORG-2",
      storeId: "STORE-2",
    });

    expect(
      repository.removeOrganizerMembership({
        organizerId: "ORG-2",
        storeId: "STORE-1",
      }),
    ).toEqual({ ok: true });
    repository.close();

    const reopenedRepository =
      createSqliteStoreMembershipRepository(databasePath);

    expect(
      reopenedRepository.findOrganizerMembershipsByStore("STORE-1"),
    ).toEqual([
      {
        organizerId: "ORG-1",
        storeId: "STORE-1",
      },
    ]);
    expect(
      reopenedRepository.findOrganizerMembershipsByStore("STORE-2"),
    ).toEqual([
      {
        organizerId: "ORG-2",
        storeId: "STORE-2",
      },
    ]);

    reopenedRepository.close();
  });

  it("preserves the final organizer membership at the durable boundary", async () => {
    const directory = await mkdtemp(join(tmpdir(), "league-points-"));
    temporaryDirectories.push(directory);
    const databasePath = join(directory, "league-points.sqlite");
    const repository = createSqliteStoreMembershipRepository(databasePath);
    const membership = {
      organizerId: "ORG-1",
      storeId: "STORE-1",
    };

    repository.createStore({ id: "STORE-1", name: "Local League" });
    repository.addOrganizerMembership(membership);
    const databaseHashBeforeRemoval = await hashFile(databasePath);

    expect(repository.removeOrganizerMembership(membership)).toEqual({
      ok: false,
      error: "LAST_STORE_ORGANIZER_REQUIRED",
    });
    expect(repository.findOrganizerMembershipsByStore("STORE-1")).toEqual([
      membership,
    ]);
    expect(await hashFile(databasePath)).toBe(databaseHashBeforeRemoval);

    repository.close();
  });

  it("rejects a membership for a store that does not exist", async () => {
    const directory = await mkdtemp(join(tmpdir(), "league-points-"));
    temporaryDirectories.push(directory);
    const repository = createSqliteStoreMembershipRepository(
      join(directory, "league-points.sqlite"),
    );

    expect(() =>
      repository.addOrganizerMembership({
        organizerId: "ORG-1",
        storeId: "STORE-UNKNOWN",
      }),
    ).toThrow();

    repository.close();
  });

  it("provides persisted memberships to the store authorization policy", async () => {
    const directory = await mkdtemp(join(tmpdir(), "league-points-"));
    temporaryDirectories.push(directory);
    const repository = createSqliteStoreMembershipRepository(
      join(directory, "league-points.sqlite"),
    );

    repository.createStore({ id: "STORE-1", name: "Local League" });
    repository.addOrganizerMembership({
      organizerId: "ORG-1",
      storeId: "STORE-1",
    });

    expect(
      authorizeStoreOperation({
        actorOrganizerId: "ORG-1",
        storeId: "STORE-1",
        memberships:
          repository.findOrganizerMembershipsByStore("STORE-1"),
      }),
    ).toEqual({ ok: true });
    expect(
      authorizeStoreOperation({
        actorOrganizerId: "ORG-1",
        storeId: "STORE-2",
        memberships:
          repository.findOrganizerMembershipsByStore("STORE-2"),
      }),
    ).toEqual({
      ok: false,
      error: "STORE_ACCESS_DENIED",
    });

    repository.close();
  });
});
