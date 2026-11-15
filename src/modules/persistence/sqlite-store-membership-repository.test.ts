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
