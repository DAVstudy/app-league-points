import { isNewPlayerAtStore } from "./is-new-player-at-store";

export type InvitedPlayer = Readonly<{
  playerId: string;
  previousTournamentCountAtStore: number;
}>;

export type InvitationPointsInput = Readonly<{
  inviterPlayerId: string;
  invitedPlayers: ReadonlyArray<InvitedPlayer>;
}>;

const POINTS_PER_NEW_PLAYER = 3;

export function calculateInvitationPoints(
  input: InvitationPointsInput,
): number {
  const playerIds = input.invitedPlayers
    .filter((player) =>
      isNewPlayerAtStore({
        previousTournamentCountAtStore: player.previousTournamentCountAtStore,
      }),
    )
    .map((player) => player.playerId);

  const uniquePlayerIds = new Set(playerIds);

  return uniquePlayerIds.size * POINTS_PER_NEW_PLAYER;
}
