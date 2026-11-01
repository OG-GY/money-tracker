"use client";

import Dexie, { type EntityTable } from "dexie";
import type { ParsedDraft } from "@/lib/ai/types";
import type { TransactionValues } from "@/lib/ledger/schema";

/**
 * Unconfirmed voice drafts live only on this device (SPEC §4 step 7, §5) and
 * reach the database when the user taps Add. Survives closing the app.
 */
export type StoredDraft = {
  id: string;
  batchId: string;
  createdAt: number;
  transcript: string;
  parsed: ParsedDraft;
  /** Set once the user edits the card; replaces what the parser produced. */
  edited?: TransactionValues;
};

class VoiceDB extends Dexie {
  drafts!: EntityTable<StoredDraft, "id">;
  constructor() {
    super("money-tracker");
    this.version(1).stores({ drafts: "id, batchId, createdAt" });
  }
}

let instance: VoiceDB | null = null;
/** Lazily opened so server renders never touch IndexedDB. */
export const voiceDb = () => (instance ??= new VoiceDB());

export async function saveDrafts(batchId: string, transcript: string, drafts: ParsedDraft[]) {
  const now = Date.now();
  await voiceDb().drafts.bulkAdd(
    drafts.map((parsed, i) => ({ id: crypto.randomUUID(), batchId, createdAt: now + i, transcript, parsed })),
  );
}
