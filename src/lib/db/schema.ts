import { sql } from "drizzle-orm";
import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
    id: integer("id").primaryKey({ autoIncrement: true }),
    username: text("username").notNull().unique(),
    password: text("password").notNull(),
    role: text("role").notNull(),
    fullName: text("full_name").notNull(),
    createdAt: text("created_at").default(sql`(datetime('now'))`),
});

export const claims = sqliteTable("claims", {
    id: integer("id").primaryKey({ autoIncrement: true }),
    claimId: text("claim_id").notNull().unique(),
    patientName: text("patient_name").notNull(),
    patientDob: text("patient_dob"),
    dos: text("dos").notNull(),
    payer: text("payer").notNull(),
    payerId: text("payer_id"),
    cpt: text("cpt").notNull(),
    icd: text("icd").notNull(),
    chargeAmount: real("charge_amount").notNull(),
    allowedAmount: real("allowed_amount"),
    paidAmount: real("paid_amount"),
    agingDays: integer("aging_days").notNull(),
    denialCode: text("denial_code"),
    denialDescription: text("denial_description"),
    provider: text("provider").notNull(),
    specialty: text("specialty").notNull(),
    riskScore: text("risk_score").notNull().default("Low"),
    riskScoreValue: real("risk_score_value").notNull().default(0),
    recommendedAction: text("recommended_action"),
    claimStatus: text("claim_status").notNull().default("Pending"),
    workQueue: text("work_queue"),
    authRequired: integer("auth_required", { mode: "boolean" }).notNull().default(false),
    authStatus: text("auth_status"),
    eligibilityStatus: text("eligibility_status"),
    insuranceId: text("insurance_id"),
    groupNumber: text("group_number"),
    notes: text("notes"),
    createdAt: text("created_at").default(sql`(datetime('now'))`),
    updatedAt: text("updated_at"),
});

export const workQueues = sqliteTable("work_queues", {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull().unique(),
    description: text("description").notNull(),
    priority: text("priority").notNull().default("Medium"),
    claimCount: integer("claim_count").notNull().default(0),
});

export const auditLogs = sqliteTable("audit_logs", {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id").notNull(),
    action: text("action").notNull(),
    claimId: text("claim_id"),
    details: text("details"),
    createdAt: text("created_at").default(sql`(datetime('now'))`),
});

export const ediConnections = sqliteTable("edi_connections", {
    id: integer("id").primaryKey({ autoIncrement: true }),
    payerName: text("payer_name").notNull(),
    payerId: text("payer_id").notNull(),
    connectionType: text("connection_type").notNull(),
    ediFormat: text("edi_format").notNull(),
    endpointUrl: text("endpoint_url").notNull(),
    status: text("status").notNull().default("Active"),
    lastTransmission: text("last_transmission"),
    successRate: real("success_rate").notNull().default(0),
    totalTransactions: integer("total_transactions").notNull().default(0),
    createdAt: text("created_at").default(sql`(datetime('now'))`),
});

export const ediTransactions = sqliteTable("edi_transactions", {
    id: integer("id").primaryKey({ autoIncrement: true }),
    transactionId: text("transaction_id").notNull().unique(),
    connectionId: integer("connection_id"),
    payerName: text("payer_name").notNull(),
    transactionType: text("transaction_type").notNull(),
    direction: text("direction").notNull(),
    status: text("status").notNull().default("Pending"),
    claimCount: integer("claim_count").notNull().default(0),
    totalAmount: real("total_amount").notNull().default(0),
    fileName: text("file_name"),
    ediContent: text("edi_content"),
    responseCode: text("response_code"),
    responseMessage: text("response_message"),
    submittedAt: text("submitted_at").default(sql`(datetime('now'))`),
    completedAt: text("completed_at"),
});

export const rpaBots = sqliteTable("rpa_bots", {
    id: integer("id").primaryKey({ autoIncrement: true }),
    botId: text("bot_id").notNull().unique(),
    botName: text("bot_name").notNull(),
    payerName: text("payer_name").notNull(),
    botType: text("bot_type").notNull(),
    status: text("status").notNull().default("Idle"),
    lastRun: text("last_run"),
    nextScheduled: text("next_scheduled"),
    totalRuns: integer("total_runs").notNull().default(0),
    successRate: real("success_rate").notNull().default(0),
    claimsProcessed: integer("claims_processed").notNull().default(0),
    avgRunTime: text("avg_run_time"),
    credentialsStatus: text("credentials_status").notNull().default("Valid"),
    createdAt: text("created_at").default(sql`(datetime('now'))`),
});

export const rpaRunLogs = sqliteTable("rpa_run_logs", {
    id: integer("id").primaryKey({ autoIncrement: true }),
    botId: text("bot_id").notNull(),
    runId: text("run_id").notNull().unique(),
    status: text("status").notNull(),
    claimsProcessed: integer("claims_processed").notNull().default(0),
    claimsUpdated: integer("claims_updated").notNull().default(0),
    errors: integer("errors").notNull().default(0),
    duration: text("duration"),
    logOutput: text("log_output"),
    startedAt: text("started_at").default(sql`(datetime('now'))`),
    completedAt: text("completed_at"),
});
