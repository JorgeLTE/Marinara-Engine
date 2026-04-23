// ──────────────────────────────────────────────
// TTS Types
// ──────────────────────────────────────────────
import { z } from "zod";

export const ttsConfigSchema = z.object({
  enabled: z.boolean().default(false),
  baseUrl: z.string().default("https://api.openai.com/v1"),
  /** Plain text on write; masked "••••••" on read when a key is saved */
  apiKey: z.string().default(""),
  voice: z.string().default("alloy"),
  model: z.string().default("tts-1"),
  /** 0.25 – 4.0 */
  speed: z.number().min(0.25).max(4.0).default(1.0),
  autoplayRP: z.boolean().default(false),
  autoplayConvo: z.boolean().default(false),
  autoplayGame: z.boolean().default(false),
});

export type TTSConfig = z.infer<typeof ttsConfigSchema>;

export const TTS_SETTINGS_KEY = "tts";
export const TTS_API_KEY_MASK = "••••••";

/** Returned by GET /api/tts/voices */
export interface TTSVoicesResponse {
  voices: string[];
  /** True when the list came from the provider; false = OpenAI built-in fallback */
  fromProvider: boolean;
}
