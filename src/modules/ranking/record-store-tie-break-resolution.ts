import type { MonthlyLeagueRepository } from "../persistence/sqlite-monthly-league-repository";
import {
  buildProvisionalStoreMonthlyRanking,
  type ProvisionalStoreRankingRepository,
} from "./build-store-monthly-ranking";
import {
  resolveTopCutTie,
  type ResolveTopCutTieInput,
  type ResolveTopCutTieResult,
} from "./resolve-top-cut-tie";

type AuditMetadata = Readonly<{
  storeId: string;
  leagueMonth: string;
  recordedByOrganizerId: string;
}>;

type WithoutDerivedTie<T> = T extends ResolveTopCutTieInput
  ? Omit<T, "startingPosition" | "tiedPlayerIds">
  : never;

export type RecordStoreTieBreakResolutionInput = WithoutDerivedTie<
  ResolveTopCutTieInput
> &
  AuditMetadata;

type TieBreakResolutionRepository = ProvisionalStoreRankingRepository &
  Pick<MonthlyLeagueRepository, "recordTieBreakResolution"> &
  Readonly<{
    now(): string;
  }>;

export type RecordStoreTieBreakResolutionResult =
  | ResolveTopCutTieResult
  | Readonly<{
      ok: false;
      error: "TIE_BREAK_NOT_PENDING";
    }>;

export function recordStoreTieBreakResolution(
  input: RecordStoreTieBreakResolutionInput,
  repository: TieBreakResolutionRepository,
): RecordStoreTieBreakResolutionResult {
  const ranking = buildProvisionalStoreMonthlyRanking(input, repository);
  const tiedEntries = ranking.entries.filter(
    (entry) => entry.topCutStatus === "TIE_BREAK_PENDING",
  );
  const firstTiedEntry = tiedEntries[0];

  if (firstTiedEntry === undefined) {
    return {
      ok: false,
      error: "TIE_BREAK_NOT_PENDING",
    };
  }

  const tie = {
    tiedPlayerIds: tiedEntries.map((entry) => entry.playerId),
    startingPosition: firstTiedEntry.position,
  };
  const resolutionInput =
    input.resolutionMethod === "PLAYOFF_MATCH"
      ? {
          ...tie,
          configuredPolicy: "PLAYOFF_MATCH" as const,
          resolutionMethod: "PLAYOFF_MATCH" as const,
          playoffOrder: input.playoffOrder,
        }
      : input.configuredPolicy === "PLAYOFF_MATCH"
        ? {
            ...tie,
            configuredPolicy: "PLAYOFF_MATCH" as const,
            resolutionMethod: "MANUAL_ORDER" as const,
            manualOrder: input.manualOrder,
            fallbackReason: input.fallbackReason,
          }
        : {
            ...tie,
            configuredPolicy: "MANUAL_ORDER" as const,
            resolutionMethod: "MANUAL_ORDER" as const,
            manualOrder: input.manualOrder,
          };
  const result = resolveTopCutTie(resolutionInput);

  if (!result.ok) {
    return result;
  }

  const orderedPlayerIds =
    input.resolutionMethod === "PLAYOFF_MATCH"
      ? input.playoffOrder
      : input.manualOrder;
  const auditRecord = {
    storeId: input.storeId,
    leagueMonth: input.leagueMonth,
    configuredPolicy: input.configuredPolicy,
    resolutionMethod: input.resolutionMethod,
    orderedPlayerIds,
    recordedByOrganizerId: input.recordedByOrganizerId,
    recordedAt: repository.now(),
  };

  if (
    input.configuredPolicy === "PLAYOFF_MATCH" &&
    input.resolutionMethod === "MANUAL_ORDER"
  ) {
    repository.recordTieBreakResolution({
      ...auditRecord,
      fallbackReason: input.fallbackReason,
    });
  } else {
    repository.recordTieBreakResolution(auditRecord);
  }

  return result;
}
