import { describe, expect, it } from "vitest";

import { resolveTopCutTie } from "./resolve-top-cut-tie";

describe("resolveTopCutTie", () => {
  it("resolves a Top Cut boundary tie using the complete playoff order", () => {
    const result = resolveTopCutTie({
      configuredPolicy: "PLAYOFF_MATCH",
      resolutionMethod: "PLAYOFF_MATCH",
      tiedPlayerIds: ["P0008", "P0009", "P0010"],
      startingPosition: 8,
      playoffOrder: ["P0009", "P0010", "P0008"],
    });

    expect(result).toEqual({
      ok: true,
      resolvedPlayers: [
        {
          playerId: "P0009",
          finalPosition: 8,
          topCutStatus: "QUALIFIED",
        },
        {
          playerId: "P0010",
          finalPosition: 9,
          topCutStatus: "NOT_QUALIFIED",
        },
        {
          playerId: "P0008",
          finalPosition: 10,
          topCutStatus: "NOT_QUALIFIED",
        },
      ],
    });
  });

  it("resolves a Top Cut boundary tie using the configured manual order", () => {
    const result = resolveTopCutTie({
      configuredPolicy: "MANUAL_ORDER",
      resolutionMethod: "MANUAL_ORDER",
      tiedPlayerIds: ["P0008", "P0009", "P0010"],
      startingPosition: 8,
      manualOrder: ["P0009", "P0010", "P0008"],
    });

    expect(result).toEqual({
      ok: true,
      resolvedPlayers: [
        {
          playerId: "P0009",
          finalPosition: 8,
          topCutStatus: "QUALIFIED",
        },
        {
          playerId: "P0010",
          finalPosition: 9,
          topCutStatus: "NOT_QUALIFIED",
        },
        {
          playerId: "P0008",
          finalPosition: 10,
          topCutStatus: "NOT_QUALIFIED",
        },
      ],
    });
  });

  it("falls back from a configured playoff to a manual order with a reason", () => {
    const result = resolveTopCutTie({
      configuredPolicy: "PLAYOFF_MATCH",
      resolutionMethod: "MANUAL_ORDER",
      tiedPlayerIds: ["P0008", "P0009", "P0010"],
      startingPosition: 8,
      manualOrder: ["P0009", "P0010", "P0008"],
      fallbackReason: "P0008 cannot attend",
    });

    expect(result).toEqual({
      ok: true,
      resolvedPlayers: [
        {
          playerId: "P0009",
          finalPosition: 8,
          topCutStatus: "QUALIFIED",
        },
        {
          playerId: "P0010",
          finalPosition: 9,
          topCutStatus: "NOT_QUALIFIED",
        },
        {
          playerId: "P0008",
          finalPosition: 10,
          topCutStatus: "NOT_QUALIFIED",
        },
      ],
    });
  });

  it("rejects a manual fallback with a blank reason", () => {
    const result = resolveTopCutTie({
      configuredPolicy: "PLAYOFF_MATCH",
      resolutionMethod: "MANUAL_ORDER",
      tiedPlayerIds: ["P0008", "P0009", "P0010"],
      startingPosition: 8,
      manualOrder: ["P0009", "P0010", "P0008"],
      fallbackReason: "   ",
    });

    expect(result).toEqual({
      ok: false,
      error: "FALLBACK_REASON_REQUIRED",
    });
  });

  it("rejects a playoff order that omits a tied player", () => {
    const result = resolveTopCutTie({
      configuredPolicy: "PLAYOFF_MATCH",
      resolutionMethod: "PLAYOFF_MATCH",
      tiedPlayerIds: ["P0008", "P0009", "P0010"],
      startingPosition: 8,
      playoffOrder: ["P0009", "P0008"],
    });

    expect(result).toEqual({
      ok: false,
      error: "INVALID_TIE_BREAK_ORDER",
    });
  });

  it("rejects a playoff order that duplicates a tied player", () => {
    const result = resolveTopCutTie({
      configuredPolicy: "PLAYOFF_MATCH",
      resolutionMethod: "PLAYOFF_MATCH",
      tiedPlayerIds: ["P0008", "P0009", "P0010"],
      startingPosition: 8,
      playoffOrder: ["P0009", "P0009", "P0008"],
    });

    expect(result).toEqual({
      ok: false,
      error: "INVALID_TIE_BREAK_ORDER",
    });
  });

  it("rejects a playoff order containing an unknown player", () => {
    const result = resolveTopCutTie({
      configuredPolicy: "PLAYOFF_MATCH",
      resolutionMethod: "PLAYOFF_MATCH",
      tiedPlayerIds: ["P0008", "P0009", "P0010"],
      startingPosition: 8,
      playoffOrder: ["P0009", "P9999", "P0008"],
    });

    expect(result).toEqual({
      ok: false,
      error: "INVALID_TIE_BREAK_ORDER",
    });
  });

  it("rejects an incomplete configured manual order", () => {
    const result = resolveTopCutTie({
      configuredPolicy: "MANUAL_ORDER",
      resolutionMethod: "MANUAL_ORDER",
      tiedPlayerIds: ["P0008", "P0009", "P0010"],
      startingPosition: 8,
      manualOrder: ["P0009", "P0008"],
    });

    expect(result).toEqual({
      ok: false,
      error: "INVALID_TIE_BREAK_ORDER",
    });
  });
});
