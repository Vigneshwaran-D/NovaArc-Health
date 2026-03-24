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
    // On Vercel, the default production filesystem is read-only.
    // We use /tmp to allow the database to be created and seeded at runtime.
    if (process.env.VERCEL) {
        return "/tmp/rcm_ar.db";
    }
    return path.join(process.cwd(), "data", "rcm_ar.db");
}

export function getSqlite(): Database.Database {
    if (globalThis.__rcmSqlite) {
        return globalThis.__rcmSqlite;
    }
    let dbPath = resolveDbPath();

    // On Vercel, if we use /tmp, we should copy the bundled database from the 'data' folder
    // to /tmp so that the app starts with the provided data but remains writable.
    if (process.env.VERCEL && dbPath.startsWith("/tmp/")) {
        const bundledPath = path.join(process.cwd(), "data", "rcm_ar.db");
        if (fs.existsSync(bundledPath) && !fs.existsSync(dbPath)) {
            try {
                fs.copyFileSync(bundledPath, dbPath);
            } catch (e) {
                console.error("Failed to copy database to /tmp:", e);
                // Fallback to bundled path (read-only) if copy fails
                dbPath = bundledPath;
            }
        }
    }

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
