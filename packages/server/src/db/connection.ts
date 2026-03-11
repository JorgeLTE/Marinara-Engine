// ──────────────────────────────────────────────
// Database Connection
// ──────────────────────────────────────────────
import * as schema from "./schema/index.js";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

type DrizzleDB = ReturnType<typeof import("drizzle-orm/libsql").drizzle<typeof schema>>;

let db: DrizzleDB | null = null;

async function createWithLibsql(dbPath: string): Promise<DrizzleDB> {
  const { createClient } = await import("@libsql/client");
  const { drizzle } = await import("drizzle-orm/libsql");

  const client = createClient({ url: `file:${dbPath}` });
  client.execute("PRAGMA journal_mode=WAL");
  client.execute("PRAGMA synchronous=NORMAL");

  return drizzle(client, { schema });
}

async function createWithBetterSqlite3(dbPath: string): Promise<DrizzleDB> {
  const Database = (await import("better-sqlite3")).default;
  const { drizzle } = await import("drizzle-orm/better-sqlite3");

  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("synchronous = NORMAL");

  // Cast is safe — both Drizzle SQLite drivers share the same query API
  return drizzle(sqlite, { schema }) as unknown as DrizzleDB;
}

async function createDB(dbPath: string): Promise<DrizzleDB> {
  mkdirSync(dirname(dbPath), { recursive: true });

  // If explicitly requested (e.g. Termux), skip libsql entirely
  if (process.env.DATABASE_DRIVER === "better-sqlite3") {
    return createWithBetterSqlite3(dbPath);
  }

  // Default: try libsql, fall back to better-sqlite3
  try {
    return await createWithLibsql(dbPath);
  } catch {
    return createWithBetterSqlite3(dbPath);
  }
}

export async function getDB() {
  if (!db) {
    const dbUrl = process.env.DATABASE_URL ?? "file:./data/marinara-engine.db";
    const dbPath = dbUrl.replace(/^file:/, "");
    db = await createDB(dbPath);
  }
  return db;
}

export type DB = DrizzleDB;
