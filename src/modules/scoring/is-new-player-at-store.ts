export type IsNewPlayerAtStoreInput = Readonly<{
  previousTournamentCountAtStore: number;
}>;

export function isNewPlayerAtStore(
  input: IsNewPlayerAtStoreInput,
): boolean {
  return input.previousTournamentCountAtStore === 0;
}
