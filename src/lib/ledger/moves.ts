import type { MoveKind } from "@/lib/db/types";

/**
 * The kind of an envelope move follows from its two ends (null = To Assign).
 * Mirrors private.validate_envelope_move in the database.
 */
export function inferMoveKind(fromKind: string | null, toKind: string | null): MoveKind | null {
  if (fromKind === null && toKind === "personal") return "assign";
  if (fromKind === "personal" && toKind === null) return "assign";
  if (fromKind === "personal" && toKind === "personal") return "move";
  if ((fromKind === null || fromKind === "personal") && toKind === "venture") return "investment";
  if (fromKind === "venture" && toKind === null) return "draw";
  return null;
}

export const MOVE_LABEL: Record<MoveKind, string> = {
  assign: "Assign",
  move: "Move",
  investment: "Invest",
  draw: "Pay myself",
};
