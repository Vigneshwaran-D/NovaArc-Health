import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import fs from "fs";
import path from "path";
import * as schema from "./schema";
import { runDdl } from "./ddl";

declare global {
    var __rcmSqlite: Database.Database | undefined;
    var __rcmDrizzle: ReturnType<typeof drizzle<typeof schema>> | undefined;
}

function resolveDbPath(): string {
    const envPath = process.env.DATABASE_PATH;
    if (envPath) {
        return path.isAbsolute(envPath) ? envPath : path.join(process.cwd(), envPath);
    }
    return path.join(process.cwd(), "data", "rcm_ar.db");
}

export function getSqlite(): Database.Database {
    if (globalThis.__rcmSqlite) {
        return globalThis.__rcmSqlite;
    }
    const dbPath = resolveDbPath();
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    const sqlite = new Database(dbPath);
    sqlite.pragma("journal_mode = WAL");
    runDdl(sqlite);
    globalThis.__rcmSqlite = sqlite;
    return sqlite;
}

export function getDb() {
    if (globalThis.__rcmDrizzle) {
        return globalThis.__rcmDrizzle;
    }
    const sqlite = getSqlite();
    const db = drizzle(sqlite, { schema });
    globalThis.__rcmDrizzle = db;
    return db;
}

export type AppDatabase = ReturnType<typeof getDb>;
