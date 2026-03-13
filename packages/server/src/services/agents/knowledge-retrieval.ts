// ──────────────────────────────────────────────
// Knowledge Retrieval Agent — Chunked RAG Pipeline
// ──────────────────────────────────────────────
// Scans lorebook entries (or other reference material) for information
// relevant to the current conversation. If the material doesn't fit in
// a single LLM context window, it splits it into chunks and runs
// multiple extraction passes, then consolidates the results.
// ──────────────────────────────────────────────
import type { AgentContext, AgentResult } from "@marinara-engine/shared";
import type { BaseLLMProvider } from "../llm/base-provider.js";
import { executeAgent, type AgentExecConfig } from "./agent-executor.js";

/**
 * Rough token estimate: ~4 characters per token for English text.
 * We leave headroom for the system prompt + context block.
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Split text into chunks of approximately `maxTokens` tokens each.
 * Splits on double-newlines (entry boundaries) to keep entries intact.
 */
function chunkText(text: string, maxTokens: number): string[] {
  const entries = text.split(/\n\n+/);
  const chunks: string[] = [];
  let current = "";

  for (const entry of entries) {
    const combined = current ? current + "\n\n" + entry : entry;
    if (estimateTokens(combined) > maxTokens && current) {
      chunks.push(current.trim());
      current = entry;
    } else {
      current = combined;
    }
  }
  if (current.trim()) {
    chunks.push(current.trim());
  }
  return chunks.length > 0 ? chunks : [text];
}

/**
 * Execute the knowledge-retrieval agent with automatic chunking.
 *
 * If the source material fits the agent's context budget, runs a single pass.
 * Otherwise, splits into chunks and runs:
 *   - N extraction passes (one per chunk)
 *   - 1 final consolidation pass that merges all extractions
 *
 * Returns the standard AgentResult with type "context_injection".
 */
export async function executeKnowledgeRetrieval(
  config: AgentExecConfig,
  baseContext: AgentContext,
  provider: BaseLLMProvider,
  model: string,
  sourceMaterial: string,
): Promise<AgentResult> {
  const maxTokens = (config.settings.maxTokens as number) ?? 2048;
  // Reserve tokens for system prompt (~600), context block (~1500), and response (~maxTokens)
  // Rough budget for source material: whatever's left
  const contextBudget = (config.settings.sourceContextBudget as number) ?? 6000;

  const materialTokens = estimateTokens(sourceMaterial);

  // ── Single-pass: material fits in one call ──
  if (materialTokens <= contextBudget) {
    const context: AgentContext = {
      ...baseContext,
      memory: {
        ...baseContext.memory,
        _sourceMaterial: sourceMaterial,
      },
    };
    return executeAgent(config, context, provider, model);
  }

  // ── Multi-pass: split into chunks ──
  const chunks = chunkText(sourceMaterial, contextBudget);
  const extractions: string[] = [];
  let totalTokens = 0;
  let totalDuration = 0;

  for (let i = 0; i < chunks.length; i++) {
    const chunkContext: AgentContext = {
      ...baseContext,
      memory: {
        ...baseContext.memory,
        _sourceMaterial: chunks[i]!,
        _chunkInfo: { current: i + 1, total: chunks.length },
        // On the last chunk, include all previous extractions for consolidation
        ...(i === chunks.length - 1 && extractions.length > 0 ? { _previousExtractions: extractions } : {}),
      },
    };

    const result = await executeAgent(config, chunkContext, provider, model);
    totalTokens += result.tokensUsed;
    totalDuration += result.durationMs;

    if (result.success && result.data) {
      const text = typeof result.data === "string" ? result.data : ((result.data as { text?: string })?.text ?? "");
      if (text && text !== "No relevant information found.") {
        extractions.push(text);
      }
    }
  }

  // If we had multiple chunks but the last chunk did consolidation, use its result.
  // If only one extraction or none, no extra consolidation needed.
  if (extractions.length === 0) {
    return {
      agentId: config.id,
      agentType: config.type,
      type: "context_injection",
      data: { text: "" },
      tokensUsed: totalTokens,
      durationMs: totalDuration,
      success: true,
      error: null,
    };
  }

  // If we had extractions and multiple chunks, prefer the consolidated output
  // when available. If the final chunk failed or produced no output, we may
  // have fewer extractions than chunks; in that case, fall back to combining
  // all partial extractions so we don't drop earlier results.
  if (chunks.length > 1 && extractions.length > 0) {
    if (extractions.length < chunks.length) {
      // Best-effort consolidation: concatenate all partial extractions.
      const combined = extractions.filter(Boolean).join("\n\n");
      return {
        agentId: config.id,
        agentType: config.type,
        type: "context_injection",
        data: { text: combined },
        tokensUsed: totalTokens,
        durationMs: totalDuration,
        success: true,
        error: null,
      };
    }

    // The last extraction is the consolidated result
    const consolidated = extractions[extractions.length - 1]!;
    return {
      agentId: config.id,
      agentType: config.type,
      type: "context_injection",
      data: { text: consolidated },
      tokensUsed: totalTokens,
      durationMs: totalDuration,
      success: true,
      error: null,
    };
  }

  // Single extraction — return as-is
  return {
    agentId: config.id,
    agentType: config.type,
    type: "context_injection",
    data: { text: extractions[0] ?? "" },
    tokensUsed: totalTokens,
    durationMs: totalDuration,
    success: true,
    error: null,
  };
}
