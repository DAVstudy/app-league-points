import {
  TOP_CUT_SIZE,
  type TopCutStatus,
} from "./calculate-monthly-ranking";

type TieBreakResolutionBase = Readonly<{
  tiedPlayerIds: ReadonlyArray<string>;
  startingPosition: number;
}>;

type PlayoffMatchInput =
  TieBreakResolutionBase &
  Readonly<{
    configuredPolicy: "PLAYOFF_MATCH";
    resolutionMethod: "PLAYOFF_MATCH";
    playoffOrder: ReadonlyArray<string>;
  }>;

type ManualOrderInput =
  TieBreakResolutionBase &
  Readonly<{
    configuredPolicy: "MANUAL_ORDER";
    resolutionMethod: "MANUAL_ORDER";
    manualOrder: ReadonlyArray<string>;
  }>;

type ManualFallbackInput =
  TieBreakResolutionBase &
  Readonly<{
    configuredPolicy: "PLAYOFF_MATCH";
    resolutionMethod: "MANUAL_ORDER";
    manualOrder: ReadonlyArray<string>;
    fallbackReason: string;
  }>;

type ResolveTopCutTieInput =
  | PlayoffMatchInput
  | ManualOrderInput
  | ManualFallbackInput;

type ResolvedPlayer = Readonly<{
  playerId: string;
  finalPosition: number;
  topCutStatus: TopCutStatus;
}>;

type ResolveTopCutTieResult =
  | Readonly<{
    ok: true;
    resolvedPlayers: ReadonlyArray<ResolvedPlayer>;
  }>
  | Readonly<{
    ok: false;
    error:
    | "INVALID_TIE_BREAK_ORDER"
    | "FALLBACK_REASON_REQUIRED";
  }>;

export function resolveTopCutTie(
  input: ResolveTopCutTieInput,
): ResolveTopCutTieResult {
  if (
    input.configuredPolicy === "PLAYOFF_MATCH" &&
    input.resolutionMethod === "MANUAL_ORDER" &&
    input.fallbackReason.trim().length === 0
  ) {
    return {
      ok: false,
      error: "FALLBACK_REASON_REQUIRED",
    };
  }

  const resolutionOrder =
    input.resolutionMethod === "PLAYOFF_MATCH"
      ? input.playoffOrder
      : input.manualOrder;

  const hasSamePlayerCount =
    resolutionOrder.length === input.tiedPlayerIds.length;

  const uniqueResolutionPlayerCount = new Set(
    resolutionOrder,
  ).size;

  const hasNoDuplicatePlayers =
    uniqueResolutionPlayerCount === resolutionOrder.length;

  const tiedPlayerIdSet = new Set(input.tiedPlayerIds);

  const containsOnlyTiedPlayers = resolutionOrder.every(
    (playerId) => tiedPlayerIdSet.has(playerId),
  );

  if (
    !hasSamePlayerCount ||
    !hasNoDuplicatePlayers ||
    !containsOnlyTiedPlayers
  ) {
    return {
      ok: false,
      error: "INVALID_TIE_BREAK_ORDER",
    };
  }

  const resolvedPlayers = resolutionOrder.map(
    (playerId, index): ResolvedPlayer => {
      const finalPosition = input.startingPosition + index;

      return {
        playerId,
        finalPosition,
        topCutStatus:
          finalPosition <= TOP_CUT_SIZE
            ? "QUALIFIED"
            : "NOT_QUALIFIED",
      };
    },
  );

  return {
    ok: true,
    resolvedPlayers,
  };
}
