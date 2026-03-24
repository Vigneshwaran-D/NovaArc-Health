import { and, between, desc, eq, gt, inArray, isNull, like, lte, or, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { claimToApi } from "@/lib/claim-mapper";
import {
    claims,
    ediConnections,
    ediTransactions,
    rpaBots,
    rpaRunLogs,
    users,
    workQueues,
} from "@/lib/db/schema";
import { runSeedIfNeeded } from "@/lib/db/seed";
import { getDb, getSqlite } from "@/lib/db/index";
import { runAllAgents } from "@/server/services/ai-agents";
import { generateAppealLetter } from "@/server/services/appeal-generator";
import {
    generateEdi276Segment,
    generateEdi837Segment,
    simulateEdi277Response,
    TRANSACTION_TYPES,
} from "@/server/services/edi-engine";
import { RPA_BOT_TEMPLATES, simulateBotRun } from "@/server/services/rpa-engine";
import {
    assignWorkQueue,
    calculateRiskScore,
    getRecommendedAction,
} from "@/server/services/risk-engine";
import {
    analyticsAgingDistribution,
    analyticsDashboard,
    analyticsDenialBreakdown,
    analyticsDrilldown,
    analyticsInsights,
    analyticsPayerIntelligence,
    analyticsPayerPerformance,
    analyticsRiskDistribution,
    analyticsRiskIndicators,
    analyticsSpecialtyBreakdown,
    analyticsSummary,
    analyticsTeamDashboard,
} from "@/server/handlers/analytics";
import { handleAiChat } from "@/server/handlers/ai-chat";
import Papa from "papaparse";

const loginSchema = z.object({
    username: z.string(),
    password: z.string(),
});

const COLUMN_MAP: Record<string, string[]> = {
    claim_id: ["claim_id", "claim id", "claimid", "claim #", "claim number"],
    patient_name: ["patient_name", "patient name", "patient", "member name"],
    dos: ["dos", "date of service", "service date"],
    payer: ["payer", "insurance", "payer name", "insurer"],
    cpt: ["cpt", "cpt code", "procedure code", "service code"],
    icd: ["icd", "icd code", "diagnosis code", "dx code"],
    charge_amount: ["charge_amount", "charge", "billed amount", "total charge", "charges"],
    allowed_amount: ["allowed_amount", "allowed", "allowed amount"],
    aging_days: ["aging_days", "aging", "age", "days outstanding"],
    denial_code: ["denial_code", "denial code", "denial", "adj code", "remark code"],
    provider: ["provider", "rendering provider", "physician"],
    specialty: ["specialty", "service specialty", "dept"],
};

function json(data: unknown, status = 200): NextResponse {
    return NextResponse.json(data, { status });
}

export async function dispatchApi(method: string, slug: string[], req: Request): Promise<NextResponse> {
    runSeedIfNeeded();
    const db = getDb();
    const sqlite = getSqlite();
    const pathKey = slug.join("/");

    try {
        if (pathKey === "health" && method === "GET") {
            return json({ status: "ok", service: "RCM AR Workflow Platform" });
        }

        if (pathKey === "auth/login" && method === "POST") {
            const body = loginSchema.parse(await req.json());
            const user = db
                .select()
                .from(users)
                .where(and(eq(users.username, body.username), eq(users.password, body.password)))
                .limit(1)
                .all()[0];
            if (!user) {
                return json({ detail: "Invalid credentials" }, 401);
            }
            return json({
                id: user.id,
                username: user.username,
                role: user.role,
                full_name: user.fullName,
                token: `demo-token-${user.id}-${user.role}`,
            });
        }

        if (pathKey === "auth/users" && method === "GET") {
            const rows = db.select().from(users).all();
            return json(
                rows.map((u) => ({
                    id: u.id,
                    username: u.username,
                    role: u.role,
                    full_name: u.fullName,
                })),
            );
        }

        if (pathKey === "claims/filters" && method === "GET") {
            const payers = sqlite
                .prepare(
                    "SELECT DISTINCT payer FROM claims ORDER BY payer",
                )
                .all()
                .map((r) => (r as { payer: string }).payer);
            const specialties = sqlite
                .prepare("SELECT DISTINCT specialty FROM claims ORDER BY specialty")
                .all()
                .map((r) => (r as { specialty: string }).specialty);
            const denial_codes = sqlite
                .prepare(
                    "SELECT DISTINCT denial_code FROM claims WHERE denial_code IS NOT NULL ORDER BY denial_code",
                )
                .all()
                .map((r) => (r as { denial_code: string }).denial_code);
            return json({ payers, specialties, denial_codes });
        }

        if (pathKey === "claims" && method === "GET") {
            const url = new URL(req.url);
            const payer = url.searchParams.get("payer") ?? undefined;
            const specialty = url.searchParams.get("specialty") ?? undefined;
            const denialType = url.searchParams.get("denial_type") ?? undefined;
            const agingBucket = url.searchParams.get("aging_bucket") ?? undefined;
            const riskScore = url.searchParams.get("risk_score") ?? undefined;
            const workQueue = url.searchParams.get("work_queue") ?? undefined;
            const search = url.searchParams.get("search") ?? undefined;
            const page = Number(url.searchParams.get("page") ?? "1");
            const perPage = Number(url.searchParams.get("per_page") ?? "50");

            const cond: ReturnType<typeof eq>[] = [];
            if (payer) {
                cond.push(eq(claims.payer, payer));
            }
            if (specialty) {
                cond.push(eq(claims.specialty, specialty));
            }
            if (denialType) {
                if (denialType === "No Denial") {
                    cond.push(isNull(claims.denialCode));
                } else {
                    cond.push(eq(claims.denialCode, denialType));
                }
            }
            if (agingBucket) {
                if (agingBucket === "0-30") {
                    cond.push(lte(claims.agingDays, 30));
                } else if (agingBucket === "31-60") {
                    cond.push(between(claims.agingDays, 31, 60));
                } else if (agingBucket === "61-90") {
                    cond.push(between(claims.agingDays, 61, 90));
                } else if (agingBucket === "91-120") {
                    cond.push(between(claims.agingDays, 91, 120));
                } else if (agingBucket === ">120") {
                    cond.push(gt(claims.agingDays, 120));
                }
            }
            if (riskScore) {
                cond.push(eq(claims.riskScore, riskScore));
            }
            if (workQueue) {
                cond.push(eq(claims.workQueue, workQueue));
            }
            if (search) {
                const s = `%${search}%`;
                cond.push(
                    or(
                        like(claims.claimId, s),
                        like(claims.patientName, s),
                        like(claims.payer, s),
                    )!,
                );
            }

            const whereClause = cond.length ? and(...cond) : undefined;
            const countRow = db
                .select({ n: sql<number>`count(*)` })
                .from(claims)
                .where(whereClause)
                .get();
            const total = Number(countRow?.n ?? 0);
            const rows = db
                .select()
                .from(claims)
                .where(whereClause)
                .limit(perPage)
                .offset((page - 1) * perPage)
                .all();

            return json({
                total,
                page,
                per_page: perPage,
                claims: rows.map(claimToApi),
            });
        }

        const claimDetailMatch = pathKey.match(/^claims\/([^/]+)$/);
        if (claimDetailMatch && method === "GET") {
            const claimId = decodeURIComponent(claimDetailMatch[1]!);
            const row = db.select().from(claims).where(eq(claims.claimId, claimId)).limit(1).all()[0];
            if (!row) {
                return json({ detail: "Claim not found" }, 404);
            }
            return json(claimToApi(row));
        }

        const investigateMatch = pathKey.match(/^claims\/([^/]+)\/investigate$/);
        if (investigateMatch && method === "POST") {
            const claimId = decodeURIComponent(investigateMatch[1]!);
            const row = db.select().from(claims).where(eq(claims.claimId, claimId)).limit(1).all()[0];
            if (!row) {
                return json({ detail: "Claim not found" }, 404);
            }
            const claimDict = {
                claim_id: row.claimId,
                patient_name: row.patientName,
                dos: row.dos,
                payer: row.payer,
                charge_amount: row.chargeAmount,
                paid_amount: row.paidAmount,
                denial_code: row.denialCode,
                denial_description: row.denialDescription,
                auth_required: row.authRequired,
                aging_days: row.agingDays,
            };
            return json({ claim_id: claimId, agents: runAllAgents(claimDict) });
        }

        const appealMatch = pathKey.match(/^claims\/([^/]+)\/appeal$/);
        if (appealMatch && method === "POST") {
            const claimId = decodeURIComponent(appealMatch[1]!);
            const row = db.select().from(claims).where(eq(claims.claimId, claimId)).limit(1).all()[0];
            if (!row) {
                return json({ detail: "Claim not found" }, 404);
            }
            if (!row.denialCode) {
                return json({ detail: "Claim has no denial code - appeal not required" }, 400);
            }
            const claimDict = {
                claim_id: row.claimId,
                patient_name: row.patientName,
                dos: row.dos,
                payer: row.payer,
                provider: row.provider,
                specialty: row.specialty,
                cpt: row.cpt,
                icd: row.icd,
                charge_amount: row.chargeAmount,
                denial_code: row.denialCode,
                denial_description: row.denialDescription,
            };
            return json({ claim_id: claimId, letter: generateAppealLetter(claimDict) });
        }

        const notesMatch = pathKey.match(/^claims\/([^/]+)\/notes$/);
        if (notesMatch && method === "PUT") {
            const claimId = decodeURIComponent(notesMatch[1]!);
            const body = (await req.json()) as { notes?: string };
            const row = db.select().from(claims).where(eq(claims.claimId, claimId)).limit(1).all()[0];
            if (!row) {
                return json({ detail: "Claim not found" }, 404);
            }
            db.update(claims)
                .set({ notes: body.notes ?? row.notes })
                .where(eq(claims.claimId, claimId))
                .run();
            return json({ success: true });
        }

        if (pathKey === "queues" && method === "GET") {
            const qs = db.select().from(workQueues).all();
            const result = qs.map((q) => {
                const claimCount = (
                    sqlite.prepare("SELECT COUNT(*) as c FROM claims WHERE work_queue = ?").get(q.name) as {
                        c: number;
                    }
                ).c;
                const totalAr = sqlite
                    .prepare(
                        "SELECT COALESCE(SUM(charge_amount),0) as v FROM claims WHERE work_queue = ?",
                    )
                    .get(q.name) as { v: number };
                const highRisk = (
                    sqlite
                        .prepare(
                            "SELECT COUNT(*) as c FROM claims WHERE work_queue = ? AND risk_score = 'High'",
                        )
                        .get(q.name) as { c: number }
                ).c;
                return {
                    id: q.id,
                    name: q.name,
                    description: q.description,
                    priority: q.priority,
                    claim_count: claimCount,
                    total_ar_value: Math.round(Number(totalAr.v) * 100) / 100,
                    high_risk_count: highRisk,
                };
            });
            return json(result);
        }

        const queueClaimsMatch = pathKey.match(/^queues\/(.+)\/claims$/);
        if (queueClaimsMatch && method === "GET") {
            const queueName = decodeURIComponent(queueClaimsMatch[1]!);
            const url = new URL(req.url);
            const page = Number(url.searchParams.get("page") ?? "1");
            const perPage = Number(url.searchParams.get("per_page") ?? "50");
            const cond = eq(claims.workQueue, queueName);
            const total = Number(
                db.select({ n: sql<number>`count(*)` }).from(claims).where(cond).get()?.n ?? 0,
            );
            const rows = db
                .select()
                .from(claims)
                .where(cond)
                .orderBy(desc(claims.riskScoreValue))
                .limit(perPage)
                .offset((page - 1) * perPage)
                .all();
            return json({
                queue_name: queueName,
                total,
                claims: rows.map(claimToApi),
            });
        }

        if (pathKey.startsWith("analytics/") && method === "GET") {
            const sub = pathKey.replace(/^analytics\//, "");
            const url = new URL(req.url);
            if (sub === "summary") {
                return json(analyticsSummary(sqlite));
            }
            if (sub === "dashboard") {
                return json(analyticsDashboard(sqlite));
            }
            if (sub === "drilldown") {
                const dimension = url.searchParams.get("dimension") ?? "payer";
                return json(analyticsDrilldown(sqlite, dimension));
            }
            if (sub === "payer-intelligence") {
                return json(analyticsPayerIntelligence(sqlite));
            }
            if (sub === "risk-indicators") {
                return json(analyticsRiskIndicators(sqlite));
            }
            if (sub === "aging-distribution") {
                return json(analyticsAgingDistribution(sqlite));
            }
            if (sub === "denial-breakdown") {
                return json(analyticsDenialBreakdown(sqlite));
            }
            if (sub === "payer-performance") {
                return json(analyticsPayerPerformance(sqlite));
            }
            if (sub === "risk-distribution") {
                return json(analyticsRiskDistribution(sqlite));
            }
            if (sub === "specialty-breakdown") {
                return json(analyticsSpecialtyBreakdown(sqlite));
            }
            if (sub === "insights") {
                return json(analyticsInsights(sqlite));
            }
            if (sub === "team-dashboard") {
                return json(analyticsTeamDashboard(sqlite));
            }
        }

        if (pathKey === "upload/claims" && method === "POST") {
            const formData = await req.formData();
            const file = formData.get("file");
            if (!(file instanceof Blob)) {
                return json({ detail: "Missing file" }, 400);
            }
            const filename = (file as File).name?.toLowerCase() ?? "upload.csv";
            const buf = Buffer.from(await file.arrayBuffer());
            let rows: Record<string, unknown>[] = [];

            if (filename.endsWith(".csv")) {
                const text = buf.toString("utf-8");
                const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });
                rows = parsed.data as Record<string, unknown>[];
            } else if (filename.endsWith(".xlsx") || filename.endsWith(".xls")) {
                const XLSX = await import("xlsx");
                const wb = XLSX.read(buf, { type: "buffer" });
                const sheet = wb.Sheets[wb.SheetNames[0]!];
                rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);
            } else {
                return json({ detail: "Only CSV and Excel files are supported" }, 400);
            }

            const normalizedRows = rows.map((r) => {
                const lower: Record<string, unknown> = {};
                for (const [k, v] of Object.entries(r)) {
                    lower[k.trim().toLowerCase()] = v;
                }
                const renamed: Record<string, unknown> = {};
                for (const [target, aliases] of Object.entries(COLUMN_MAP)) {
                    for (const col of aliases) {
                        if (col in lower) {
                            renamed[target] = lower[col];
                            break;
                        }
                    }
                }
                return renamed;
            });

            const required = ["claim_id", "patient_name", "dos", "payer"];
            const sample = normalizedRows[0] ?? {};
            const missing = required.filter((c) => !(c in sample) || sample[c] == null || sample[c] === "");
            if (normalizedRows.length > 0 && missing.length > 0) {
                return json({ detail: `Missing required columns: ${missing}` }, 400);
            }

            let added = 0;
            let skipped = 0;
            const errors: string[] = [];

            normalizedRows.forEach((row, idx) => {
                const claimId = String(row.claim_id ?? "").trim();
                if (!claimId) {
                    skipped += 1;
                    return;
                }
                const existing = db.select().from(claims).where(eq(claims.claimId, claimId)).limit(1).all()[0];
                if (existing) {
                    skipped += 1;
                    return;
                }
                try {
                    const charge = parseFloat(
                        String(row.charge_amount ?? 0).replace(/,/g, "").replace("$", "") || "0",
                    );
                    const aging = Math.floor(
                        Number.parseFloat(String(row.aging_days ?? 0) || "0"),
                    );
                    const denialRaw = String(row.denial_code ?? "").trim();
                    const denialCode = denialRaw || null;

                    const claimData = {
                        claimId,
                        patientName: String(row.patient_name ?? "Unknown"),
                        dos: String(row.dos ?? ""),
                        payer: String(row.payer ?? "Unknown"),
                        cpt: String(row.cpt ?? ""),
                        icd: String(row.icd ?? ""),
                        chargeAmount: charge,
                        allowedAmount: row.allowed_amount
                            ? parseFloat(
                                  String(row.allowed_amount).replace(/,/g, "").replace("$", "") || "0",
                              )
                            : null,
                        agingDays: aging,
                        denialCode,
                        denialDescription: null as string | null,
                        provider: String(row.provider ?? ""),
                        specialty: String(row.specialty ?? ""),
                        authRequired: denialCode === "CO-197" || denialCode === "CO-109",
                        patientDob: null,
                        payerId: null,
                        paidAmount: null,
                        recommendedAction: null as string | null,
                        claimStatus: "Pending",
                        workQueue: null as string | null,
                        authStatus: null,
                        eligibilityStatus: null,
                        insuranceId: null,
                        groupNumber: null,
                        notes: null,
                        riskScore: "Low",
                        riskScoreValue: 0,
                    };

                    const [riskVal, riskCat] = calculateRiskScore({
                        aging_days: claimData.agingDays,
                        charge_amount: claimData.chargeAmount,
                        denial_code: claimData.denialCode,
                        auth_required: claimData.authRequired,
                        payer: claimData.payer,
                    });
                    claimData.riskScoreValue = riskVal;
                    claimData.riskScore = riskCat;
                    claimData.recommendedAction = getRecommendedAction({
                        aging_days: claimData.agingDays,
                        denial_code: claimData.denialCode,
                    });
                    claimData.workQueue = assignWorkQueue({
                        denial_code: claimData.denialCode,
                        aging_days: claimData.agingDays,
                        charge_amount: claimData.chargeAmount,
                        payer: claimData.payer,
                        auth_required: claimData.authRequired,
                    });

                    db.insert(claims).values(claimData).run();
                    added += 1;
                } catch (e) {
                    errors.push(`Row ${idx}: ${e instanceof Error ? e.message : String(e)}`);
                }
            });

            return json({
                success: true,
                added,
                skipped,
                errors: errors.slice(0, 10),
                message: `Processed ${added + skipped} rows. Added ${added} new claims, skipped ${skipped} duplicates.`,
            });
        }

        if (pathKey === "edi/connections" && method === "GET") {
            const rows = db.select().from(ediConnections).orderBy(ediConnections.payerName).all();
            return json(
                rows.map((c) => ({
                    id: c.id,
                    payer_name: c.payerName,
                    payer_id: c.payerId,
                    connection_type: c.connectionType,
                    edi_format: c.ediFormat,
                    endpoint_url: c.endpointUrl,
                    status: c.status,
                    last_transmission: c.lastTransmission,
                    success_rate: c.successRate,
                    total_transactions: c.totalTransactions,
                })),
            );
        }

        const ediTestMatch = pathKey.match(/^edi\/connections\/(\d+)\/test$/);
        if (ediTestMatch && method === "GET") {
            const id = Number(ediTestMatch[1]);
            const conn = db.select().from(ediConnections).where(eq(ediConnections.id, id)).limit(1).all()[0];
            if (!conn) {
                return json({ detail: "Connection not found" }, 404);
            }
            const success = Math.random() > 0.1;
            const latency = Math.floor(Math.random() * 451) + 50;
            return json({
                connection_id: id,
                payer_name: conn.payerName,
                test_result: success ? "SUCCESS" : "FAILED",
                latency_ms: latency,
                endpoint: conn.endpointUrl,
                details: {
                    tcp_connect: "OK",
                    tls_handshake: success ? "OK" : "TIMEOUT",
                    edi_handshake: success ? "OK" : "REJECTED",
                    isa_segment_validation: success ? "PASSED" : "FAILED",
                },
                timestamp: new Date().toISOString(),
            });
        }

        if (pathKey === "edi/transactions" && method === "GET") {
            const url = new URL(req.url);
            const transactionType = url.searchParams.get("transaction_type") ?? undefined;
            const direction = url.searchParams.get("direction") ?? undefined;
            const payer = url.searchParams.get("payer") ?? undefined;
            const status = url.searchParams.get("status") ?? undefined;
            const page = Number(url.searchParams.get("page") ?? "1");
            const perPage = Number(url.searchParams.get("per_page") ?? "50");

            const cond: ReturnType<typeof eq>[] = [];
            if (transactionType) {
                cond.push(eq(ediTransactions.transactionType, transactionType));
            }
            if (direction) {
                cond.push(eq(ediTransactions.direction, direction));
            }
            if (payer) {
                cond.push(eq(ediTransactions.payerName, payer));
            }
            if (status) {
                cond.push(eq(ediTransactions.status, status));
            }
            const whereClause = cond.length ? and(...cond) : undefined;
            const total = Number(
                db
                    .select({ n: sql<number>`count(*)` })
                    .from(ediTransactions)
                    .where(whereClause)
                    .get()?.n ?? 0,
            );
            const rows = db
                .select()
                .from(ediTransactions)
                .where(whereClause)
                .orderBy(desc(ediTransactions.submittedAt))
                .limit(perPage)
                .offset((page - 1) * perPage)
                .all();

            return json({
                total,
                transactions: rows.map((t) => ({
                    id: t.id,
                    transaction_id: t.transactionId,
                    payer_name: t.payerName,
                    transaction_type: t.transactionType,
                    direction: t.direction,
                    status: t.status,
                    claim_count: t.claimCount,
                    total_amount: t.totalAmount,
                    file_name: t.fileName,
                    response_code: t.responseCode,
                    response_message: t.responseMessage,
                    submitted_at: t.submittedAt,
                    completed_at: t.completedAt,
                })),
            });
        }

        const ediTxDetail = pathKey.match(/^edi\/transactions\/([^/]+)$/);
        if (ediTxDetail && method === "GET") {
            const txId = decodeURIComponent(ediTxDetail[1]!);
            const t = db
                .select()
                .from(ediTransactions)
                .where(eq(ediTransactions.transactionId, txId))
                .limit(1)
                .all()[0];
            if (!t) {
                return json({ detail: "Transaction not found" }, 404);
            }
            return json({
                id: t.id,
                transaction_id: t.transactionId,
                payer_name: t.payerName,
                transaction_type: t.transactionType,
                direction: t.direction,
                status: t.status,
                claim_count: t.claimCount,
                total_amount: t.totalAmount,
                file_name: t.fileName,
                edi_content: t.ediContent,
                response_code: t.responseCode,
                response_message: t.responseMessage,
                submitted_at: t.submittedAt,
                completed_at: t.completedAt,
            });
        }

        if (pathKey === "edi/submit-837" && method === "POST") {
            const data = (await req.json()) as { payer?: string; claim_ids?: string[] };
            const payer = data.payer;
            if (!payer) {
                return json({ detail: "Payer name required" }, 400);
            }
            const claimRows =
                data.claim_ids && data.claim_ids.length > 0
                    ? db
                          .select()
                          .from(claims)
                          .where(and(eq(claims.payer, payer), inArray(claims.claimId, data.claim_ids)))
                          .limit(50)
                          .all()
                    : db.select().from(claims).where(eq(claims.payer, payer)).limit(50).all();

            if (!claimRows.length) {
                return json({ detail: `No claims found for payer: ${payer}` }, 400);
            }

            const claimDicts = claimRows.map((c) => ({
                claim_id: c.claimId,
                patient_name: c.patientName,
                dos: c.dos,
                payer: c.payer,
                payer_id: c.payerId,
                cpt: c.cpt,
                icd: c.icd,
                charge_amount: c.chargeAmount,
                provider: c.provider,
                insurance_id: c.insuranceId,
            }));

            let ediContent = claimDicts
                .slice(0, 5)
                .map((c) => generateEdi837Segment(c))
                .join("\n\n");
            if (claimDicts.length > 5) {
                ediContent += `\n\n... (${claimDicts.length - 5} additional claims in batch)`;
            }
            const totalAmount = claimRows.reduce((a, c) => a + (c.chargeAmount || 0), 0);
            const txId = `TX-837-${Math.floor(Math.random() * 900000) + 100000}`;
            const conn = db
                .select()
                .from(ediConnections)
                .where(eq(ediConnections.payerName, payer))
                .limit(1)
                .all()[0];

            db.insert(ediTransactions)
                .values({
                    transactionId: txId,
                    connectionId: conn?.id ?? null,
                    payerName: payer,
                    transactionType: "837P",
                    direction: "Outbound",
                    status: "Accepted",
                    claimCount: claimRows.length,
                    totalAmount: Math.round(totalAmount * 100) / 100,
                    fileName: `837P_${payer.replace(/\s+/g, "_")}_${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}.edi`,
                    ediContent,
                    responseCode: "TA1",
                    responseMessage: `Batch accepted: ${claimRows.length} claims, $${totalAmount.toFixed(2)}`,
                    completedAt: new Date().toISOString(),
                })
                .run();

            if (conn) {
                db.update(ediConnections)
                    .set({
                        totalTransactions: (conn.totalTransactions ?? 0) + 1,
                        lastTransmission: new Date().toISOString(),
                    })
                    .where(eq(ediConnections.id, conn.id))
                    .run();
            }

            return json({
                transaction_id: txId,
                payer,
                claims_submitted: claimRows.length,
                total_amount: Math.round(totalAmount * 100) / 100,
                status: "Accepted",
                edi_preview: ediContent.slice(0, 2000),
            });
        }

        if (pathKey === "edi/submit-276" && method === "POST") {
            const data = (await req.json()) as { claim_id?: string };
            if (!data.claim_id) {
                return json({ detail: "Claim ID required" }, 400);
            }
            const row = db
                .select()
                .from(claims)
                .where(eq(claims.claimId, data.claim_id))
                .limit(1)
                .all()[0];
            if (!row) {
                return json({ detail: "Claim not found" }, 404);
            }
            const claimDict = {
                claim_id: row.claimId,
                patient_name: row.patientName,
                dos: row.dos,
                payer: row.payer,
                payer_id: row.payerId,
                cpt: row.cpt,
                charge_amount: row.chargeAmount,
                paid_amount: row.paidAmount,
                provider: row.provider,
                insurance_id: row.insuranceId,
                denial_code: row.denialCode,
            };
            const edi276 = generateEdi276Segment(claimDict);
            const response277 = simulateEdi277Response(claimDict);
            const txId = `TX-276-${Math.floor(Math.random() * 900000) + 100000}`;
            db.insert(ediTransactions)
                .values({
                    transactionId: txId,
                    payerName: row.payer,
                    transactionType: "276/277",
                    direction: "Outbound/Inbound",
                    status: "Completed",
                    claimCount: 1,
                    totalAmount: row.chargeAmount || 0,
                    fileName: `276_${data.claim_id}_${new Date().toISOString().slice(0, 10)}.edi`,
                    ediContent: edi276,
                    responseCode: String(response277.status_code),
                    responseMessage: String(response277.status_description),
                    completedAt: new Date().toISOString(),
                })
                .run();
            return json({
                transaction_id: txId,
                claim_id: data.claim_id,
                edi_276_preview: edi276.slice(0, 1500),
                response_277: response277,
            });
        }

        if (pathKey === "edi/transaction-types" && method === "GET") {
            return json(
                Object.entries(TRANSACTION_TYPES).map(([code, v]) => ({ code, ...v })),
            );
        }

        if (pathKey === "edi/summary" && method === "GET") {
            const totalConnections = (
                sqlite.prepare("SELECT COUNT(*) as c FROM edi_connections").get() as { c: number }
            ).c;
            const activeConnections = (
                sqlite
                    .prepare("SELECT COUNT(*) as c FROM edi_connections WHERE status = 'Active'")
                    .get() as { c: number }
            ).c;
            const totalTransactions = (
                sqlite.prepare("SELECT COUNT(*) as c FROM edi_transactions").get() as { c: number }
            ).c;
            const totalClaimsSubmitted = (
                sqlite
                    .prepare("SELECT COALESCE(SUM(claim_count),0) as v FROM edi_transactions")
                    .get() as { v: number }
            ).v;
            const totalAmount = (
                sqlite
                    .prepare("SELECT COALESCE(SUM(total_amount),0) as v FROM edi_transactions")
                    .get() as { v: number }
            ).v;
            const recent = db
                .select()
                .from(ediTransactions)
                .orderBy(desc(ediTransactions.submittedAt))
                .limit(5)
                .all();
            return json({
                total_connections: totalConnections,
                active_connections: activeConnections,
                total_transactions: totalTransactions,
                total_claims_submitted: totalClaimsSubmitted,
                total_amount: Math.round(totalAmount * 100) / 100,
                recent_transactions: recent.map((t) => ({
                    transaction_id: t.transactionId,
                    payer_name: t.payerName,
                    transaction_type: t.transactionType,
                    status: t.status,
                    claim_count: t.claimCount,
                })),
            });
        }

        if (pathKey === "rpa/bots" && method === "GET") {
            const bots = db.select().from(rpaBots).orderBy(rpaBots.payerName, rpaBots.botName).all();
            return json(
                bots.map((b) => ({
                    id: b.id,
                    bot_id: b.botId,
                    bot_name: b.botName,
                    payer_name: b.payerName,
                    bot_type: b.botType,
                    status: b.status,
                    last_run: b.lastRun,
                    next_scheduled: b.nextScheduled,
                    total_runs: b.totalRuns,
                    success_rate: b.successRate,
                    claims_processed: b.claimsProcessed,
                    avg_run_time: b.avgRunTime,
                    credentials_status: b.credentialsStatus,
                })),
            );
        }

        const rpaRunMatch = pathKey.match(/^rpa\/bots\/([^/]+)\/run$/);
        if (rpaRunMatch && method === "POST") {
            const botId = decodeURIComponent(rpaRunMatch[1]!);
            const bot = db.select().from(rpaBots).where(eq(rpaBots.botId, botId)).limit(1).all()[0];
            if (!bot) {
                return json({ detail: "Bot not found" }, 404);
            }
            const claimCount = (
                sqlite
                    .prepare("SELECT COUNT(*) as c FROM claims WHERE payer = ?")
                    .get(bot.payerName) as { c: number }
            ).c;
            const result = simulateBotRun(
                bot.botType,
                bot.payerName,
                Math.min(claimCount, Math.floor(Math.random() * 46) + 15),
            ) as Record<string, string | number>;

            db.insert(rpaRunLogs)
                .values({
                    botId,
                    runId: String(result.run_id),
                    status: String(result.status),
                    claimsProcessed: Number(result.claims_processed),
                    claimsUpdated: Number(result.claims_updated),
                    errors: Number(result.errors),
                    duration: String(result.duration),
                    logOutput: String(result.log_output),
                    completedAt: String(result.completed_at),
                })
                .run();

            const totalRuns = (bot.totalRuns ?? 0) + 1;
            const prevSuccess = (bot.successRate ?? 0) * (totalRuns - 1);
            const stepSuccess =
                (Number(result.claims_updated) / Math.max(Number(result.claims_processed), 1)) * 100;
            const newSuccessRate = Math.round(((prevSuccess + stepSuccess) / totalRuns) * 10) / 10;

            db.update(rpaBots)
                .set({
                    status: "Idle",
                    lastRun: new Date().toISOString(),
                    totalRuns,
                    claimsProcessed: (bot.claimsProcessed ?? 0) + Number(result.claims_processed),
                    successRate: newSuccessRate,
                    avgRunTime: String(result.duration),
                    nextScheduled: new Date(
                        Date.now() + ([2, 4, 6, 8, 12][Math.floor(Math.random() * 5)] ?? 4) * 3600000,
                    ).toISOString(),
                })
                .where(eq(rpaBots.botId, botId))
                .run();

            return json(result);
        }

        const rpaLogsMatch = pathKey.match(/^rpa\/bots\/([^/]+)\/logs$/);
        if (rpaLogsMatch && method === "GET") {
            const botId = decodeURIComponent(rpaLogsMatch[1]!);
            const url = new URL(req.url);
            const limit = Number(url.searchParams.get("limit") ?? "10");
            const logs = db
                .select()
                .from(rpaRunLogs)
                .where(eq(rpaRunLogs.botId, botId))
                .orderBy(desc(rpaRunLogs.startedAt))
                .limit(limit)
                .all();
            return json(
                logs.map((l) => ({
                    id: l.id,
                    run_id: l.runId,
                    status: l.status,
                    claims_processed: l.claimsProcessed,
                    claims_updated: l.claimsUpdated,
                    errors: l.errors,
                    duration: l.duration,
                    log_output: l.logOutput,
                    started_at: l.startedAt,
                    completed_at: l.completedAt,
                })),
            );
        }

        if (pathKey === "rpa/bot-types" && method === "GET") {
            return json(
                Object.entries(RPA_BOT_TEMPLATES).map(([type, v]) => ({
                    type,
                    name: v.name,
                    description: v.description,
                    steps_count: v.steps.length,
                })),
            );
        }

        if (pathKey === "rpa/summary" && method === "GET") {
            const totalBots = (sqlite.prepare("SELECT COUNT(*) as c FROM rpa_bots").get() as { c: number })
                .c;
            const activeBots = (
                sqlite
                    .prepare(
                        "SELECT COUNT(*) as c FROM rpa_bots WHERE status IN ('Running','Active')",
                    )
                    .get() as { c: number }
            ).c;
            const idleBots = (
                sqlite.prepare("SELECT COUNT(*) as c FROM rpa_bots WHERE status = 'Idle'").get() as {
                    c: number;
                }
            ).c;
            const errorBots = (
                sqlite
                    .prepare("SELECT COUNT(*) as c FROM rpa_bots WHERE status IN ('Error','Failed')")
                    .get() as { c: number }
            ).c;
            const totalClaims = (
                sqlite
                    .prepare("SELECT COALESCE(SUM(claims_processed),0) as v FROM rpa_bots")
                    .get() as { v: number }
            ).v;
            const totalRuns = (
                sqlite.prepare("SELECT COALESCE(SUM(total_runs),0) as v FROM rpa_bots").get() as { v: number }
            ).v;
            const avgSuccess = (
                sqlite.prepare("SELECT AVG(success_rate) as a FROM rpa_bots").get() as { a: number }
            ).a;

            const payerStats = sqlite
                .prepare(
                    `SELECT payer_name, COUNT(*) as bot_count, SUM(claims_processed) as total_claims, AVG(success_rate) as avg_success
           FROM rpa_bots GROUP BY payer_name ORDER BY total_claims DESC`,
                )
                .all() as {
                payer_name: string;
                bot_count: number;
                total_claims: number;
                avg_success: number;
            }[];

            return json({
                total_bots: totalBots,
                active_bots: activeBots,
                idle_bots: idleBots,
                error_bots: errorBots,
                total_claims_processed: Math.floor(totalClaims),
                total_runs: Math.floor(totalRuns),
                avg_success_rate: Math.round(avgSuccess * 10) / 10,
                payer_stats: payerStats.map((s) => ({
                    payer: s.payer_name,
                    bot_count: s.bot_count,
                    total_claims: Math.floor(s.total_claims ?? 0),
                    avg_success: Math.round((s.avg_success ?? 0) * 10) / 10,
                })),
            });
        }

        const rpaScheduleMatch = pathKey.match(/^rpa\/bots\/([^/]+)\/schedule$/);
        if (rpaScheduleMatch && method === "POST") {
            const botId = decodeURIComponent(rpaScheduleMatch[1]!);
            const bot = db.select().from(rpaBots).where(eq(rpaBots.botId, botId)).limit(1).all()[0];
            if (!bot) {
                return json({ detail: "Bot not found" }, 404);
            }
            const body = (await req.json()) as { hours?: unknown };
            const hours = Number(body.hours ?? 4);
            if (!Number.isFinite(hours) || hours < 1 || hours > 168) {
                return json({ detail: "Hours must be a number between 1 and 168" }, 400);
            }
            const next = new Date(Date.now() + hours * 3600000).toISOString();
            db.update(rpaBots).set({ nextScheduled: next }).where(eq(rpaBots.botId, botId)).run();
            return json({ bot_id: botId, next_scheduled: next });
        }

        if (pathKey === "ai/chat" && method === "POST") {
            const body = (await req.json()) as { message?: string };
            const message = body.message ?? "";
            return json(handleAiChat(sqlite, message));
        }

        return json({ detail: "Not found" }, 404);
    } catch (e) {
        if (e instanceof z.ZodError) {
            return json({ detail: e.flatten() }, 400);
        }
        console.error(e);
        return json({ detail: e instanceof Error ? e.message : "Server error" }, 500);
    }
}
