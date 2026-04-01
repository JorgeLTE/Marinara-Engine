// ──────────────────────────────────────────────
// Lorebook Service: Orchestrator
// Ties together storage, scanning, and injection.
// ──────────────────────────────────────────────
import type { DB } from "../../db/connection.js";
import type { LorebookEntry } from "@marinara-engine/shared";
import { createLorebooksStorage } from "../storage/lorebooks.storage.js";
import {
  scanForActivatedEntries,
  recursiveScan,
  type ScanMessage,
  type ScanOptions,
  type GameStateForScanning,
  type ActivatedEntry,
} from "./keyword-scanner.js";
import { processActivatedEntries } from "./prompt-injector.js";

export interface LorebookScanResult {
  worldInfoBefore: string;
  worldInfoAfter: string;
  depthEntries: Array<{ content: string; role: "system" | "user" | "assistant"; depth: number; order: number }>;
  totalEntries: number;
  totalTokensEstimate: number;
  activatedEntryIds: string[];
  /** Updated per-chat entry state overrides (ephemeral countdown). Caller should persist to chat metadata. */
  updatedEntryStateOverrides?: Record<string, { ephemeral?: number | null; enabled?: boolean }>;
}

/**
 * Main lorebook processing for a generation request.
 * 1. Fetch all active entries from enabled lorebooks
 * 2. Scan chat messages for keyword matches
 * 3. Process into injectable blocks
 */
export async function processLorebooks(
  db: DB,
  messages: ScanMessage[],
  gameState?: GameStateForScanning | null,
  options?: {
    chatId?: string;
    characterIds?: string[];
    activeLorebookIds?: string[];
    tokenBudget?: number;
    enableRecursive?: boolean;
    /** Pre-computed embedding of the chat context for semantic matching. */
    chatEmbedding?: number[] | null;
    /** Cosine similarity threshold for semantic matching (0-1, default 0.3). */
    semanticThreshold?: number;
    /** Per-chat entry state overrides (from chat metadata). When provided, ephemeral
     *  countdown is tracked here instead of modifying the global entry row. */
    entryStateOverrides?: Record<string, { ephemeral?: number | null; enabled?: boolean }>;
  },
): Promise<LorebookScanResult> {
  const storage = createLorebooksStorage(db);

  // Build filters for scoped lorebook selection
  const filters =
    options?.chatId || options?.characterIds?.length || options?.activeLorebookIds?.length
      ? {
          chatId: options.chatId,
          characterIds: options.characterIds,
          activeLorebookIds: options.activeLorebookIds,
        }
      : undefined;

  // Fetch active entries (filtered if context provided)
  let allEntries = (await storage.listActiveEntries(filters)) as unknown as LorebookEntry[];

  // Apply per-chat entry state overrides — an entry that was disabled by ephemeral
  // countdown in *this* chat should be excluded, and ephemeral values should
  // reflect the per-chat remaining count rather than the global default.
  const overrides = options?.entryStateOverrides;
  if (overrides) {
    allEntries = allEntries
      .filter((e) => {
        const ov = overrides[e.id];
        // If per-chat override explicitly disabled this entry, skip it
        if (ov && ov.enabled === false) return false;
        return true;
      })
      .map((e) => {
        const ov = overrides[e.id];
        if (ov && ov.ephemeral !== undefined) {
          // Use per-chat ephemeral remaining instead of global value
          return { ...e, ephemeral: ov.ephemeral };
        }
        return e;
      });
  }

  if (allEntries.length === 0) {
    return {
      worldInfoBefore: "",
      worldInfoAfter: "",
      depthEntries: [],
      totalEntries: 0,
      totalTokensEstimate: 0,
      activatedEntryIds: [],
    };
  }

  // No global token budget — include all activated entries.
  // Each lorebook's own tokenBudget only serves as a hint for the UI;
  // prompt-level truncation is handled upstream by the assembler / context window.
  const tokenBudget = options?.tokenBudget ?? 0;

  // Scan for activated entries
  const scanOpts: ScanOptions = {
    scanDepth: 0, // Scan all messages
    gameState: gameState ?? null,
    chatEmbedding: options?.chatEmbedding ?? null,
    semanticThreshold: options?.semanticThreshold,
  };

  // Determine recursion settings from enabled lorebooks
  const enabledBooks = await storage.list();
  const activeBooks = enabledBooks.filter((b: { enabled: boolean }) => b.enabled);
  const anyRecursive =
    options?.enableRecursive || activeBooks.some((b: { recursiveScanning: boolean }) => b.recursiveScanning);
  const maxRecursionDepth = activeBooks.reduce(
    (max: number, b: { recursiveScanning: boolean; maxRecursionDepth?: number }) => {
      if (!b.recursiveScanning) return max;
      return Math.max(max, b.maxRecursionDepth ?? 3);
    },
    3,
  );

  let activated: ActivatedEntry[];
  if (anyRecursive) {
    activated = recursiveScan(messages, allEntries, scanOpts, maxRecursionDepth);
  } else {
    activated = scanForActivatedEntries(messages, allEntries, scanOpts);
  }

  // Decrement ephemeral counters for activated entries.
  // When per-chat overrides are provided, track the countdown in those overrides
  // so each chat has independent ephemeral state. Otherwise fall back to global
  // DB writes (legacy / test-scan behavior, but skip global writes for test scans
  // that don't pass a chatId).
  let updatedOverrides: Record<string, { ephemeral?: number | null; enabled?: boolean }> | undefined;

  if (overrides) {
    // Per-chat tracking: write to overrides, leave global entry untouched
    updatedOverrides = { ...overrides };
    for (const a of activated) {
      if (a.entry.ephemeral !== null && a.entry.ephemeral > 0) {
        const remaining = a.entry.ephemeral - 1;
        updatedOverrides[a.entry.id] = {
          ...updatedOverrides[a.entry.id],
          ephemeral: remaining,
          ...(remaining <= 0 ? { enabled: false } : {}),
        };
      }
    }
  } else if (options?.chatId) {
    // Legacy path: first call for this chat (no overrides yet) — initialise per-chat overrides
    updatedOverrides = {};
    for (const a of activated) {
      if (a.entry.ephemeral !== null && a.entry.ephemeral > 0) {
        const remaining = a.entry.ephemeral - 1;
        updatedOverrides[a.entry.id] = {
          ephemeral: remaining,
          ...(remaining <= 0 ? { enabled: false } : {}),
        };
      }
    }
  }
  // When neither overrides nor chatId is present (e.g. test scan), do nothing —
  // don't modify global state or return overrides.

  // Process into injectable content
  const result = processActivatedEntries(activated, tokenBudget);

  return {
    ...result,
    activatedEntryIds: activated.map((a) => a.entry.id),
    ...(updatedOverrides ? { updatedEntryStateOverrides: updatedOverrides } : {}),
  };
}
