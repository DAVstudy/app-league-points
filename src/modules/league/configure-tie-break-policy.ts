export type TieBreakPolicy = "MANUAL_ORDER" | "PLAYOFF_MATCH";

export type League = Readonly<{
  leagueMonth: string;
  tieBreakPolicy: TieBreakPolicy;
  hasRegisteredTournaments: boolean;
}>;

type ConfigureTieBreakPolicyInput = Readonly<{
  league: League;
  newTieBreakPolicy: TieBreakPolicy;
}>;

type ConfigureTieBreakPolicyResult =
  | Readonly<{
    ok: true;
    league: League;
  }>
  | Readonly<{
    ok: false;
    error: "TIE_BREAK_POLICY_LOCKED";
  }>;

export function configureTieBreakPolicy(
  input: ConfigureTieBreakPolicyInput,
): ConfigureTieBreakPolicyResult {
  if (input.league.hasRegisteredTournaments) {
    return {
      ok: false,
      error: "TIE_BREAK_POLICY_LOCKED",
    };
  }

  return {
    ok: true,
    league: {
      ...input.league,
      tieBreakPolicy: input.newTieBreakPolicy,
    },
  };
}
