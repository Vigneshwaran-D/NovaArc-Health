import type Database from "better-sqlite3";

export function runDdl(sqlite: Database.Database): void {
    sqlite.exec(`
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    username TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    role TEXT NOT NULL,
    full_name TEXT NOT NULL,
    created_at DATETIME DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS claims (
    id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    claim_id TEXT NOT NULL UNIQUE,
    patient_name TEXT NOT NULL,
    patient_dob TEXT,
    dos TEXT NOT NULL,
    payer TEXT NOT NULL,
    payer_id TEXT,
    cpt TEXT NOT NULL,
    icd TEXT NOT NULL,
    charge_amount REAL NOT NULL,
    allowed_amount REAL,
    paid_amount REAL,
    aging_days INTEGER NOT NULL,
    denial_code TEXT,
    denial_description TEXT,
    provider TEXT NOT NULL,
    specialty TEXT NOT NULL,
    risk_score TEXT DEFAULT 'Low' NOT NULL,
    risk_score_value REAL DEFAULT 0 NOT NULL,
    recommended_action TEXT,
    claim_status TEXT DEFAULT 'Pending' NOT NULL,
    work_queue TEXT,
    auth_required INTEGER DEFAULT 0 NOT NULL,
    auth_status TEXT,
    eligibility_status TEXT,
    insurance_id TEXT,
    group_number TEXT,
    notes TEXT,
    created_at DATETIME DEFAULT (datetime('now')),
    updated_at DATETIME
);

CREATE TABLE IF NOT EXISTS work_queues (
    id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    name TEXT NOT NULL UNIQUE,
    description TEXT NOT NULL,
    priority TEXT DEFAULT 'Medium' NOT NULL,
    claim_count INTEGER DEFAULT 0 NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    user_id INTEGER NOT NULL,
    action TEXT NOT NULL,
    claim_id TEXT,
    details TEXT,
    created_at DATETIME DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS edi_connections (
    id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    payer_name TEXT NOT NULL,
    payer_id TEXT NOT NULL,
    connection_type TEXT NOT NULL,
    edi_format TEXT NOT NULL,
    endpoint_url TEXT NOT NULL,
    status TEXT DEFAULT 'Active' NOT NULL,
    last_transmission TEXT,
    success_rate REAL DEFAULT 0 NOT NULL,
    total_transactions INTEGER DEFAULT 0 NOT NULL,
    created_at DATETIME DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS edi_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    transaction_id TEXT NOT NULL UNIQUE,
    connection_id INTEGER,
    payer_name TEXT NOT NULL,
    transaction_type TEXT NOT NULL,
    direction TEXT NOT NULL,
    status TEXT DEFAULT 'Pending' NOT NULL,
    claim_count INTEGER DEFAULT 0 NOT NULL,
    total_amount REAL DEFAULT 0 NOT NULL,
    file_name TEXT,
    edi_content TEXT,
    response_code TEXT,
    response_message TEXT,
    submitted_at DATETIME DEFAULT (datetime('now')),
    completed_at TEXT
);

CREATE TABLE IF NOT EXISTS rpa_bots (
    id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    bot_id TEXT NOT NULL UNIQUE,
    bot_name TEXT NOT NULL,
    payer_name TEXT NOT NULL,
    bot_type TEXT NOT NULL,
    status TEXT DEFAULT 'Idle' NOT NULL,
    last_run TEXT,
    next_scheduled TEXT,
    total_runs INTEGER DEFAULT 0 NOT NULL,
    success_rate REAL DEFAULT 0 NOT NULL,
    claims_processed INTEGER DEFAULT 0 NOT NULL,
    avg_run_time TEXT,
    credentials_status TEXT DEFAULT 'Valid' NOT NULL,
    created_at DATETIME DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS rpa_run_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    bot_id TEXT NOT NULL,
    run_id TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL,
    claims_processed INTEGER DEFAULT 0 NOT NULL,
    claims_updated INTEGER DEFAULT 0 NOT NULL,
    errors INTEGER DEFAULT 0 NOT NULL,
    duration TEXT,
    log_output TEXT,
    started_at DATETIME DEFAULT (datetime('now')),
    completed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_claims_payer ON claims(payer);
CREATE INDEX IF NOT EXISTS idx_claims_work_queue ON claims(work_queue);
CREATE INDEX IF NOT EXISTS idx_claims_claim_id ON claims(claim_id);
CREATE INDEX IF NOT EXISTS idx_edi_tx_transaction_id ON edi_transactions(transaction_id);
CREATE INDEX IF NOT EXISTS idx_rpa_logs_bot_id ON rpa_run_logs(bot_id);
`);
}
