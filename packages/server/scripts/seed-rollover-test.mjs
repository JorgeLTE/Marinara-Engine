// ──────────────────────────────────────────────
// Test helper: seed scripted messages into a conversation chat for
// exercising day-rollover, summarization, and week-consolidation logic.
//
// Usage:
//   1. Stop the dev server (avoid SQLite lock contention).
//   2. Back up the DB file (printed below at runtime).
//   3. Pick a scenario by editing or passing it as the second arg.
//   4. Run from the repo root:
//        node packages/server/scripts/seed-rollover-test.mjs <chatId> [scenario]
//      Scenarios:
//        - rollover (default): late-night messages spanning midnight, used
//          to verify the dayRolloverHour boundary.
//        - week: a full prior calendar week of daily messages, used to
//          verify week-consolidation. After triggering one generation,
//          all 7 day summaries should consolidate into a single
//          weekSummaries entry that mentions codes from every day.
//   5. Start the server, send a real "today" message, then inspect the
//      prompt + daySummaries / weekSummaries metadata.
//   6. Restore the backup before changing settings or rerunning.
//
// Why a separate script: nothing here runs during normal generation, so
// the production code stays clean and your test data is purely additive
// to the DB. No fake-time logic to pollute the results.
//
// Note on cost: the "week" scenario triggers 7 day summaries + 1 week
// consolidation = 8 LLM calls per generation, which can take a minute and
// burn API credits. The "rollover" scenario triggers 1 day summary.
// ──────────────────────────────────────────────

import Database from "better-sqlite3";
import { nanoid } from "nanoid";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(__dirname, "..");

// ── Scenarios ──────────────────────────────────────────────
// `time` strings are interpreted as LOCAL TIME (no trailing Z).
// Each user message includes a unique "code" that acts as a beacon —
// after summarization runs, you can read the resulting summary text
// to see exactly which messages got grouped where.
//
// Adjust the date range below for your test run. The defaults assume
// "today" is roughly late April 2026; pick dates that are clearly in the
// past relative to your real wall clock so summarization fires on them.
const SCENARIOS = {
  // Tests dayRolloverHour: codes cluster around the midnight boundary so
  // moving the rollover knob (4 AM, 2 AM, etc.) visibly shuffles which
  // codes land in yesterday's summary vs. today's verbatim turns.
  rollover: [
    { time: "2026-04-29T22:00:00", role: "user", content: "Hey! Let's play a game. I will say random numbers throughout the night and I need you to remember them. It will make sense at the end." },
    { time: "2026-04-29T22:01:00", role: "assistant", content: "OK, I'll keep track. Lay them on me." },
    { time: "2026-04-29T23:30:00", role: "user", content: "1130" },
    { time: "2026-04-29T23:31:00", role: "assistant", content: "Noted: 1130." },
    { time: "2026-04-30T00:30:00", role: "user", content: "1230" },
    { time: "2026-04-30T00:31:00", role: "assistant", content: "Got 1230." },
    { time: "2026-04-30T01:30:00", role: "user", content: "0130" },
    { time: "2026-04-30T01:31:00", role: "assistant", content: "0130 saved." },
    { time: "2026-04-30T02:30:00", role: "user", content: "0230" },
    { time: "2026-04-30T02:31:00", role: "assistant", content: "Mhm, 0230." },
    { time: "2026-04-30T03:30:00", role: "user", content: "0330" },
    { time: "2026-04-30T03:31:00", role: "assistant", content: "0330." },
  ],

  // Tests weekly consolidation: one user message per day across a full
  // prior calendar week (Mon Apr 20 → Sun Apr 26). After one generation,
  // all 7 days should be summarized AND then rolled into a single
  // <summary week="20.04.2026 – 26.04.2026"> block. The week summary
  // should mention the codes MON-A through SUN-G; if any are missing,
  // that day didn't make it into the consolidation.
  week: [
    { time: "2026-04-20T20:00:00", role: "user", content: "Same game as before. Today's code is MON-A. Hold onto it." },
    { time: "2026-04-20T20:01:00", role: "assistant", content: "MON-A locked in." },
    { time: "2026-04-21T20:00:00", role: "user", content: "Today's code: TUE-B." },
    { time: "2026-04-21T20:01:00", role: "assistant", content: "TUE-B noted." },
    { time: "2026-04-22T20:00:00", role: "user", content: "WED-C — please remember." },
    { time: "2026-04-22T20:01:00", role: "assistant", content: "Got WED-C." },
    { time: "2026-04-23T20:00:00", role: "user", content: "THU-D for Thursday." },
    { time: "2026-04-23T20:01:00", role: "assistant", content: "THU-D held." },
    { time: "2026-04-24T20:00:00", role: "user", content: "FRI-E. Almost there." },
    { time: "2026-04-24T20:01:00", role: "assistant", content: "FRI-E saved." },
    { time: "2026-04-25T20:00:00", role: "user", content: "SAT-F." },
    { time: "2026-04-25T20:01:00", role: "assistant", content: "SAT-F." },
    { time: "2026-04-26T20:00:00", role: "user", content: "SUN-G — last one of the week." },
    { time: "2026-04-26T20:01:00", role: "assistant", content: "SUN-G. All seven captured." },
  ],
};

// ── DB path resolution (mirrors runtime-config.ts) ─────────
function resolveDbPath() {
  const envUrl = process.env.DATABASE_URL?.trim();
  if (envUrl) {
    const match = envUrl.match(/^file:(.+)$/);
    if (match) return resolve(match[1]);
  }
  const dataDir = process.env.DATA_DIR?.trim() || resolve(PACKAGE_ROOT, "data");
  return resolve(dataDir, "marinara-engine.db");
}

// ── Main ───────────────────────────────────────────────────
const chatId = process.argv[2];
const scenarioName = (process.argv[3] ?? "rollover").toLowerCase();

if (!chatId) {
  console.error("Usage: node packages/server/scripts/seed-rollover-test.mjs <chatId> [scenario]");
  console.error(`Scenarios: ${Object.keys(SCENARIOS).join(", ")}  (default: rollover)`);
  console.error("");
  console.error("Find a chat ID with the SQL:");
  console.error("  SELECT id, name FROM chats WHERE mode = 'conversation' ORDER BY updated_at DESC LIMIT 5;");
  process.exit(1);
}

const messages = SCENARIOS[scenarioName];
if (!messages) {
  console.error(`[seed] Unknown scenario "${scenarioName}". Known: ${Object.keys(SCENARIOS).join(", ")}`);
  process.exit(1);
}

const dbPath = resolveDbPath();
console.log(`[seed] DB:       ${dbPath}`);
console.log(`[seed] Chat:     ${chatId}`);
console.log(`[seed] Scenario: ${scenarioName} (${messages.length} messages)`);

const db = new Database(dbPath);
db.pragma("foreign_keys = ON");

const chat = db
  .prepare("SELECT id, name, mode, character_ids FROM chats WHERE id = ?")
  .get(chatId);
if (!chat) {
  console.error(`[seed] Chat not found: ${chatId}`);
  process.exit(1);
}
if (chat.mode !== "conversation") {
  console.warn(`[seed] Warning: chat mode is "${chat.mode}", not "conversation". Continuing anyway.`);
}

const characterIds = JSON.parse(chat.character_ids ?? "[]");
const firstCharId = characterIds[0] ?? null;
if (!firstCharId) {
  console.error(`[seed] Chat has no characters; cannot create assistant messages.`);
  process.exit(1);
}

console.log(`[seed] Chat name: ${chat.name}`);
console.log(`[seed] Character: ${firstCharId}`);
console.log(`[seed] Inserting ${messages.length} messages…`);
console.log("");
console.log(`[seed] Tip: back up the DB before running. Copy:`);
console.log(`         ${dbPath}`);
console.log("");

const insertMsg = db.prepare(`
  INSERT INTO messages (id, chat_id, role, character_id, content, active_swipe_index, extra, created_at)
  VALUES (@id, @chatId, @role, @characterId, @content, 0, @extra, @createdAt)
`);
const insertSwipe = db.prepare(`
  INSERT INTO message_swipes (id, message_id, "index", content, extra, created_at)
  VALUES (@id, @messageId, 0, @content, '{}', @createdAt)
`);
const updateChat = db.prepare(`UPDATE chats SET updated_at = ? WHERE id = ?`);

const seed = db.transaction(() => {
  let lastIso = "";
  for (const m of messages) {
    const localDate = new Date(m.time);
    if (Number.isNaN(localDate.getTime())) {
      throw new Error(`[seed] Bad time string: ${m.time}`);
    }
    const isUser = m.role === "user";
    const createdAt = localDate.toISOString();
    const msgId = nanoid();
    const extra = JSON.stringify({
      displayText: null,
      isGenerated: !isUser,
      tokenCount: null,
      generationInfo: null,
    });
    insertMsg.run({
      id: msgId,
      chatId,
      role: m.role,
      characterId: isUser ? null : firstCharId,
      content: m.content,
      extra,
      createdAt,
    });
    insertSwipe.run({
      id: nanoid(),
      messageId: msgId,
      content: m.content,
      createdAt,
    });
    lastIso = createdAt;
    console.log(`  + ${m.time}  ${m.role.padEnd(9)} ${m.content}`);
  }
  updateChat.run(lastIso, chatId);
});

seed();
console.log("");
console.log(`[seed] Done. ${messages.length} messages inserted.`);
db.close();
