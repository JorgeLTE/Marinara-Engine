import test from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { sql } from "drizzle-orm";
import { runMigrations } from "../src/db/migrate.js";
import type { DB } from "../src/db/connection.js";

test("startup migrations add lorebook folders schema to existing installs", async () => {
  const client = createClient({ url: "file::memory:" });
  const db = drizzle(client) as unknown as DB;

  try {
    await db.run(
      sql.raw(`CREATE TABLE lorebooks (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        category TEXT NOT NULL DEFAULT 'uncategorized',
        scan_depth INTEGER NOT NULL DEFAULT 2,
        token_budget INTEGER NOT NULL DEFAULT 2048,
        recursive_scanning TEXT NOT NULL DEFAULT 'false',
        character_id TEXT,
        persona_id TEXT,
        chat_id TEXT,
        enabled TEXT NOT NULL DEFAULT 'true',
        generated_by TEXT,
        source_agent_id TEXT,
        tags TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`),
    );
    await db.run(
      sql.raw(`CREATE TABLE lorebook_entries (
        id TEXT PRIMARY KEY NOT NULL,
        lorebook_id TEXT NOT NULL REFERENCES lorebooks(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        content TEXT NOT NULL DEFAULT '',
        keys TEXT NOT NULL DEFAULT '[]',
        secondary_keys TEXT NOT NULL DEFAULT '[]',
        enabled TEXT NOT NULL DEFAULT 'true',
        constant TEXT NOT NULL DEFAULT 'false',
        selective TEXT NOT NULL DEFAULT 'false',
        selective_logic TEXT NOT NULL DEFAULT 'and',
        probability INTEGER,
        scan_depth INTEGER,
        match_whole_words TEXT NOT NULL DEFAULT 'false',
        case_sensitive TEXT NOT NULL DEFAULT 'false',
        use_regex TEXT NOT NULL DEFAULT 'false',
        position INTEGER NOT NULL DEFAULT 0,
        depth INTEGER NOT NULL DEFAULT 4,
        "order" INTEGER NOT NULL DEFAULT 100,
        role TEXT NOT NULL DEFAULT 'system',
        sticky INTEGER,
        cooldown INTEGER,
        delay INTEGER,
        "group" TEXT NOT NULL DEFAULT '',
        group_weight INTEGER,
        tag TEXT NOT NULL DEFAULT '',
        relationships TEXT NOT NULL DEFAULT '{}',
        dynamic_state TEXT NOT NULL DEFAULT '{}',
        activation_conditions TEXT NOT NULL DEFAULT '[]',
        schedule TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`),
    );

    await runMigrations(db);
    await runMigrations(db);

    const folderTables = await db.all<{ name: string }>(
      sql.raw(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'lorebook_folders'`),
    );
    const entryColumns = await db.all<{ name: string }>(sql.raw("PRAGMA table_info(lorebook_entries)"));

    assert.equal(folderTables.length, 1);
    assert.ok(entryColumns.some((column) => column.name === "folder_id"));
  } finally {
    client.close();
  }
});
