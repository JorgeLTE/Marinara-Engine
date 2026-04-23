// ──────────────────────────────────────────────
// Routes: Text-to-Speech
// ──────────────────────────────────────────────
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { ttsConfigSchema, TTS_SETTINGS_KEY, TTS_API_KEY_MASK } from "@marinara-engine/shared";
import { createAppSettingsStorage } from "../services/storage/app-settings.storage.js";
import { encryptApiKey, decryptApiKey } from "../utils/crypto.js";

// OpenAI built-in voices used as fallback when the provider has no /audio/voices endpoint
const OPENAI_FALLBACK_VOICES = ["alloy", "ash", "coral", "echo", "fable", "nova", "onyx", "sage", "shimmer"];

const speakSchema = z.object({
  text: z.string().min(1).max(4096),
});

// ── Helpers ─────────────────────────────────────

function parseStoredConfig(raw: string | null) {
  if (!raw) return ttsConfigSchema.parse({});
  try {
    return ttsConfigSchema.parse(JSON.parse(raw));
  } catch {
    return ttsConfigSchema.parse({});
  }
}

/**
 * Resolve the stored config and decrypt the API key.
 * Returns config with the plain-text key (never sent to client).
 */
async function loadConfig(storage: ReturnType<typeof createAppSettingsStorage>) {
  const raw = await storage.get(TTS_SETTINGS_KEY);
  const cfg = parseStoredConfig(raw);
  cfg.apiKey = decryptApiKey(cfg.apiKey);
  return cfg;
}

// ── Routes ──────────────────────────────────────

export async function ttsRoutes(app: FastifyInstance) {
  const storage = createAppSettingsStorage(app.db);

  /**
   * GET /api/tts/config
   * Returns TTS config with the API key masked.
   */
  app.get("/config", async () => {
    const raw = await storage.get(TTS_SETTINGS_KEY);
    const cfg = parseStoredConfig(raw);
    // Mask the stored (encrypted) key — just tell client whether one is saved
    const hasKey = Boolean(cfg.apiKey);
    return { ...cfg, apiKey: hasKey ? TTS_API_KEY_MASK : "" };
  });

  /**
   * PUT /api/tts/config
   * Saves TTS config. Encrypts the API key before storage.
   * If apiKey equals the mask, the existing key is kept unchanged.
   */
  app.put("/config", async (req, reply) => {
    const input = ttsConfigSchema.parse(req.body);

    if (input.apiKey === TTS_API_KEY_MASK) {
      // Client sent the mask back — preserve the existing encrypted key
      const existing = parseStoredConfig(await storage.get(TTS_SETTINGS_KEY));
      input.apiKey = existing.apiKey; // already encrypted blob
    } else {
      input.apiKey = encryptApiKey(input.apiKey);
    }

    await storage.set(TTS_SETTINGS_KEY, JSON.stringify(input));
    return reply.status(204).send();
  });

  /**
   * GET /api/tts/voices
   * Fetches available voices from the configured provider.
   * Falls back to the OpenAI built-in list when the provider doesn't support /audio/voices.
   */
  app.get("/voices", async () => {
    const cfg = await loadConfig(storage);

    if (!cfg.enabled || !cfg.baseUrl) {
      return { voices: OPENAI_FALLBACK_VOICES, fromProvider: false };
    }

    const base = cfg.baseUrl.replace(/\/+$/, "");
    const url = `${base}/audio/voices`;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (cfg.apiKey) headers["Authorization"] = `Bearer ${cfg.apiKey}`;

    try {
      const res = await fetch(url, {
        headers,
        signal: AbortSignal.timeout(10_000),
      });

      if (!res.ok) {
        return { voices: OPENAI_FALLBACK_VOICES, fromProvider: false };
      }

      const data = (await res.json()) as unknown;

      // Several common response shapes from self-hosted providers:
      // { voices: string[] }
      // { voices: [{ voice_id: string, name?: string }, ...] }
      // string[] directly
      let voices: string[] = [];

      if (Array.isArray(data)) {
        voices = data.map((v) => (typeof v === "string" ? v : String(v?.voice_id ?? v?.name ?? v)));
      } else if (data && typeof data === "object") {
        const obj = data as Record<string, unknown>;
        const list = obj["voices"] ?? obj["data"];
        if (Array.isArray(list)) {
          voices = list.map((v) => (typeof v === "string" ? v : String(v?.voice_id ?? v?.name ?? v)));
        }
      }

      voices = voices.filter(Boolean);
      if (voices.length === 0) return { voices: OPENAI_FALLBACK_VOICES, fromProvider: false };

      return { voices, fromProvider: true };
    } catch {
      return { voices: OPENAI_FALLBACK_VOICES, fromProvider: false };
    }
  });

  /**
   * POST /api/tts/speak
   * Proxies a TTS request to the configured provider and streams the audio back.
   */
  app.post("/speak", async (req, reply) => {
    const { text } = speakSchema.parse(req.body);

    const cfg = await loadConfig(storage);

    if (!cfg.enabled) {
      return reply.status(400).send({ error: "TTS is not enabled" });
    }
    if (!cfg.baseUrl) {
      return reply.status(400).send({ error: "TTS base URL is not configured" });
    }

    const base = cfg.baseUrl.replace(/\/+$/, "");
    const url = `${base}/audio/speech`;

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (cfg.apiKey) headers["Authorization"] = `Bearer ${cfg.apiKey}`;

    let providerRes: Response;
    try {
      providerRes = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: cfg.model,
          input: text,
          voice: cfg.voice,
          speed: cfg.speed,
          response_format: "mp3",
        }),
        signal: AbortSignal.timeout(60_000),
      });
    } catch (err: unknown) {
      const msg = err instanceof Error && err.name === "TimeoutError" ? "TTS request timed out" : "TTS provider unreachable";
      return reply.status(502).send({ error: msg });
    }

    if (!providerRes.ok) {
      const body = await providerRes.text().catch(() => "");
      return reply.status(502).send({ error: `TTS provider returned ${providerRes.status}`, detail: body });
    }

    const audioBuffer = await providerRes.arrayBuffer();
    reply.header("Content-Type", "audio/mpeg");
    reply.header("Content-Length", String(audioBuffer.byteLength));
    return reply.send(Buffer.from(audioBuffer));
  });
}
