import type Database from "better-sqlite3";

function num(v: unknown): number {
    if (v == null) {
        return 0;
    }
    if (typeof v === "object" && !Array.isArray(v)) {
        const vals = Object.values(v as Record<string, unknown>);
        if (vals.length >= 1 && vals[0] != null) {
            return Number(vals[0]);
        }
        return 0;
    }
    return Number(v);
}

const QUERY_PATTERNS: { patterns: RegExp[]; handler: string }[] = [
    { patterns: [/total ar.*over 90|ar.*>.*90|ar.*90.*day|aging.*90/i], handler: "ar_over_90" },
    { patterns: [/denial.*rate|denied.*rate/i], handler: "denial_rate" },
    { patterns: [/highest denial.*payer|payer.*highest denial|denial.*by payer|payer.*denial/i], handler: "denial_by_payer" },
    { patterns: [/ar.*aging.*specialty|aging.*by.*specialty|specialty.*ar|ar.*by.*specialty/i], handler: "ar_by_specialty" },
    { patterns: [/total ar|total.*account.*receiv|ar.*value|outstanding/i], handler: "total_ar" },
    { patterns: [/high.*risk|risk.*claim/i], handler: "high_risk" },
    { patterns: [/collection.*rate|net.*collection|gross.*collection/i], handler: "collection_rate" },
    { patterns: [/payer.*performance|payer.*comparison|compare.*payer/i], handler: "payer_performance" },
    { patterns: [/denial.*code|top.*denial|denial.*breakdown/i], handler: "denial_codes" },
    { patterns: [/revenue.*leak|leakage|lost.*revenue/i], handler: "revenue_leakage" },
    { patterns: [/clean.*claim|clean.*rate/i], handler: "clean_claim_rate" },
    { patterns: [/timely.*fil|tfl.*risk/i], handler: "tfl_risk" },
    { patterns: [/unworked|backlog|pending.*claim/i], handler: "unworked" },
    { patterns: [/appeal|appealed/i], handler: "appeals" },
    { patterns: [/underpay|under.*pay/i], handler: "underpayment" },
    { patterns: [/claim.*status|status.*breakdown|status.*distribution/i], handler: "status_breakdown" },
    { patterns: [/help|what can you|what.*do|capabilities/i], handler: "help" },
];

function matchQuery(message: string): string | null {
    const msgLower = message.toLowerCase().trim();
    for (const qp of QUERY_PATTERNS) {
        for (const pattern of qp.patterns) {
            if (pattern.test(msgLower)) {
                return qp.handler;
            }
        }
    }
    return null;
}

function handleArOver90(db: Database.Database): Record<string, unknown> {
    const count = num(db.prepare("SELECT COUNT(*) as c FROM claims WHERE aging_days > 90").get());
    const value = num(
        db
            .prepare("SELECT COALESCE(SUM(charge_amount),0) as v FROM claims WHERE aging_days > 90")
            .get(),
    );
    const total = num(db.prepare("SELECT COUNT(*) as c FROM claims").get());
    const pct = total ? Math.round((count / total) * 1000) / 10 : 0;
    const byPayer = db
        .prepare(
            `SELECT payer, COUNT(*) as cnt, COALESCE(SUM(charge_amount),0) as val 
       FROM claims WHERE aging_days > 90 GROUP BY payer ORDER BY val DESC LIMIT 8`,
        )
        .all() as { payer: string; cnt: number; val: number }[];
    return {
        text: `Total AR over 90 days: **${count} claims** worth **$${value.toLocaleString("en-US", { minimumFractionDigits: 2 })}** (${pct}% of total inventory). This represents a significant portion of aging receivables that require immediate follow-up to prevent write-offs.`,
        chart: {
            type: "bar",
            title: "AR Over 90 Days by Payer",
            data: byPayer.map((r) => ({
                name: r.payer.slice(0, 20),
                value: Math.round(num(r.val) * 100) / 100,
                count: r.cnt,
            })),
        },
        metrics: [
            { label: "Claims > 90 Days", value: String(count) },
            { label: "Total Value", value: `$${Math.round(value).toLocaleString()}` },
            { label: "% of Total AR", value: `${pct}%` },
        ],
    };
}

function handleDenialRate(db: Database.Database): Record<string, unknown> {
    const total = num(db.prepare("SELECT COUNT(*) as c FROM claims").get());
    const denied = num(
        db.prepare("SELECT COUNT(*) as c FROM claims WHERE denial_code IS NOT NULL").get(),
    );
    const rate = total ? Math.round((denied / total) * 1000) / 10 : 0;
    const denialValue = num(
        db
            .prepare(
                "SELECT COALESCE(SUM(charge_amount),0) as v FROM claims WHERE denial_code IS NOT NULL",
            )
            .get(),
    );
    return {
        text: `Current denial rate is **${rate}%** (${denied} out of ${total} claims). Total denied AR value: **$${denialValue.toLocaleString("en-US", { minimumFractionDigits: 2 })}**. Industry benchmark is 5-10%. ${rate > 10 ? "Your denial rate is above benchmark — consider root cause analysis." : "Your denial rate is within acceptable range."}`,
        metrics: [
            { label: "Denial Rate", value: `${rate}%` },
            { label: "Denied Claims", value: String(denied) },
            { label: "Denied Value", value: `$${Math.round(denialValue).toLocaleString()}` },
        ],
    };
}

function handleDenialByPayer(db: Database.Database): Record<string, unknown> {
    const rows = db
        .prepare("SELECT payer, COUNT(*) as total FROM claims GROUP BY payer")
        .all() as { payer: string; total: number }[];
    const payerData = rows.map((r) => {
        const denied = num(
            db
                .prepare(
                    "SELECT COUNT(*) as c FROM claims WHERE payer = ? AND denial_code IS NOT NULL",
                )
                .get(r.payer),
        );
        const rate = r.total ? Math.round((denied / r.total) * 1000) / 10 : 0;
        return { name: r.payer, denial_rate: rate, denied, total: r.total };
    });
    payerData.sort((a, b) => b.denial_rate - a.denial_rate);
    const top = payerData[0] ?? { name: "N/A", denial_rate: 0 };
    return {
        text: `**${top.name}** has the highest denial rate at **${top.denial_rate}%**. Here's the breakdown across all payers:`,
        chart: {
            type: "bar",
            title: "Denial Rate by Payer",
            data: payerData.slice(0, 10).map((p) => ({
                name: p.name.slice(0, 20),
                value: p.denial_rate,
                count: p.denied,
            })),
        },
        table: {
            headers: ["Payer", "Denial Rate", "Denied", "Total Claims"],
            rows: payerData.map((p) => [
                p.name,
                `${p.denial_rate}%`,
                String(p.denied),
                String(p.total),
            ]),
        },
    };
}

function handleArBySpecialty(db: Database.Database): Record<string, unknown> {
    const rows = db
        .prepare(
            `SELECT specialty, COUNT(*) as count, COALESCE(SUM(charge_amount),0) as value, AVG(aging_days) as avg_aging
       FROM claims GROUP BY specialty ORDER BY value DESC`,
        )
        .all() as { specialty: string; count: number; value: number; avg_aging: number }[];
    const first = rows[0];
    return {
        text:
            rows.length > 0
                ? `AR aging breakdown by specialty — ${rows.length} specialties in the system. Top AR concentration is in **${first!.specialty}** with $${num(first!.value).toLocaleString()} in outstanding AR.`
                : "No specialty data available.",
        chart: {
            type: "bar",
            title: "AR Value by Specialty",
            data: rows.map((r) => ({
                name: r.specialty.slice(0, 20),
                value: Math.round(num(r.value) * 100) / 100,
                count: r.count,
            })),
        },
        table: {
            headers: ["Specialty", "Claims", "AR Value", "Avg Aging"],
            rows: rows.map((r) => [
                r.specialty,
                String(r.count),
                `$${num(r.value).toLocaleString()}`,
                `${Math.round(num(r.avg_aging))} days`,
            ]),
        },
    };
}

function handleTotalAr(db: Database.Database): Record<string, unknown> {
    const totalAr = num(
        db.prepare("SELECT COALESCE(SUM(charge_amount),0) as v FROM claims").get(),
    );
    const totalPaid = num(
        db.prepare("SELECT COALESCE(SUM(paid_amount),0) as v FROM claims").get(),
    );
    const totalClaims = num(db.prepare("SELECT COUNT(*) as c FROM claims").get());
    const buckets: [string, number, number][] = [
        ["0-30", 0, 30],
        ["31-60", 31, 60],
        ["61-90", 61, 90],
        ["91-120", 91, 120],
        [">120", 121, 99999],
    ];
    const bucketData = buckets.map(([label, low, high]) => {
        const val = num(
            db
                .prepare(
                    "SELECT COALESCE(SUM(charge_amount),0) as v FROM claims WHERE aging_days >= ? AND aging_days <= ?",
                )
                .get(low, high),
        );
        const cnt = num(
            db
                .prepare(
                    "SELECT COUNT(*) as c FROM claims WHERE aging_days >= ? AND aging_days <= ?",
                )
                .get(low, high),
        );
        return { name: label, value: Math.round(val * 100) / 100, count: cnt };
    });
    return {
        text: `Total outstanding AR: **$${totalAr.toLocaleString("en-US", { minimumFractionDigits: 2 })}** across **${totalClaims}** claims. Total payments collected: **$${totalPaid.toLocaleString("en-US", { minimumFractionDigits: 2 })}**.`,
        chart: { type: "bar", title: "AR by Aging Bucket", data: bucketData },
        metrics: [
            { label: "Total AR", value: `$${Math.round(totalAr).toLocaleString()}` },
            { label: "Total Paid", value: `$${Math.round(totalPaid).toLocaleString()}` },
            { label: "Total Claims", value: String(totalClaims) },
        ],
    };
}

function handleHighRisk(db: Database.Database): Record<string, unknown> {
    const count = num(
        db.prepare("SELECT COUNT(*) as c FROM claims WHERE risk_score = 'High'").get(),
    );
    const value = num(
        db
            .prepare(
                "SELECT COALESCE(SUM(charge_amount),0) as v FROM claims WHERE risk_score = 'High'",
            )
            .get(),
    );
    const total = num(db.prepare("SELECT COUNT(*) as c FROM claims").get());
    const byPayer = db
        .prepare(
            `SELECT payer, COUNT(*) as cnt FROM claims WHERE risk_score = 'High' GROUP BY payer ORDER BY cnt DESC LIMIT 8`,
        )
        .all() as { payer: string; cnt: number }[];
    return {
        text: `**${count} high-risk claims** valued at **$${value.toLocaleString("en-US", { minimumFractionDigits: 2 })}** (${total ? Math.round((count / total) * 1000) / 10 : 0}% of total). These claims require immediate attention to prevent revenue loss.`,
        chart: {
            type: "bar",
            title: "High Risk Claims by Payer",
            data: byPayer.map((r) => ({
                name: r.payer.slice(0, 20),
                value: r.cnt,
                count: r.cnt,
            })),
        },
        metrics: [
            { label: "High Risk Claims", value: String(count) },
            { label: "At-Risk Value", value: `$${Math.round(value).toLocaleString()}` },
            { label: "% of Total", value: `${total ? Math.round((count / total) * 1000) / 10 : 0}%` },
        ],
    };
}

function handleCollectionRate(db: Database.Database): Record<string, unknown> {
    const totalAr = num(
        db.prepare("SELECT COALESCE(SUM(charge_amount),0) as v FROM claims").get(),
    );
    const totalPaid = num(
        db.prepare("SELECT COALESCE(SUM(paid_amount),0) as v FROM claims").get(),
    );
    const totalAllowed = num(
        db.prepare("SELECT COALESCE(SUM(allowed_amount),0) as v FROM claims").get(),
    );
    const gross = totalAr ? Math.round((totalPaid / totalAr) * 1000) / 10 : 0;
    const net = totalAllowed ? Math.round((totalPaid / totalAllowed) * 1000) / 10 : 0;
    return {
        text: `Gross Collection Rate: **${gross}%** | Net Collection Rate: **${net}%**. Industry benchmark for net collection is 95-98%.`,
        metrics: [
            { label: "Gross Collection", value: `${gross}%` },
            { label: "Net Collection", value: `${net}%` },
            { label: "Total Collected", value: `$${Math.round(totalPaid).toLocaleString()}` },
        ],
    };
}

function handlePayerPerformance(db: Database.Database): Record<string, unknown> {
    const rows = db
        .prepare(
            `SELECT payer, COUNT(*) as total, COALESCE(SUM(charge_amount),0) as charged, COALESCE(SUM(paid_amount),0) as paid, AVG(aging_days) as avg_aging
       FROM claims GROUP BY payer ORDER BY charged DESC`,
        )
        .all() as {
        payer: string;
        total: number;
        charged: number;
        paid: number;
        avg_aging: number;
    }[];
    return {
        text: `Payer performance comparison across ${rows.length} payers:`,
        chart: {
            type: "bar",
            title: "Payer Performance - Charged vs Paid",
            data: rows.map((r) => ({
                name: r.payer.slice(0, 20),
                value: Math.round(num(r.charged) * 100) / 100,
                paid: Math.round(num(r.paid) * 100) / 100,
            })),
        },
        table: {
            headers: ["Payer", "Claims", "Charged", "Paid", "Avg Aging"],
            rows: rows.map((r) => [
                r.payer,
                String(r.total),
                `$${num(r.charged).toLocaleString()}`,
                `$${num(r.paid).toLocaleString()}`,
                `${Math.round(num(r.avg_aging))}d`,
            ]),
        },
    };
}

function handleDenialCodes(db: Database.Database): Record<string, unknown> {
    const rows = db
        .prepare(
            `SELECT denial_code, denial_description, COUNT(*) as cnt, COALESCE(SUM(charge_amount),0) as val
       FROM claims WHERE denial_code IS NOT NULL GROUP BY denial_code, denial_description ORDER BY cnt DESC`,
        )
        .all() as { denial_code: string; denial_description: string; cnt: number; val: number }[];
    const sumCnt = rows.reduce((a, r) => a + r.cnt, 0);
    return {
        text: `Top denial codes across ${sumCnt} denied claims:`,
        chart: {
            type: "bar",
            title: "Denial Code Distribution",
            data: rows.slice(0, 10).map((r) => ({
                name: r.denial_code,
                value: r.cnt,
                count: r.cnt,
            })),
        },
        table: {
            headers: ["Code", "Description", "Count", "Value"],
            rows: rows.map((r) => [
                r.denial_code,
                r.denial_description ?? "",
                String(r.cnt),
                `$${num(r.val).toLocaleString()}`,
            ]),
        },
    };
}

function handleRevenueLeakage(db: Database.Database): Record<string, unknown> {
    const totalAr = num(
        db.prepare("SELECT COALESCE(SUM(charge_amount),0) as v FROM claims").get(),
    );
    const totalPaid = num(
        db.prepare("SELECT COALESCE(SUM(paid_amount),0) as v FROM claims").get(),
    );
    const leakage = totalAr - totalPaid;
    const denialValue = num(
        db
            .prepare(
                "SELECT COALESCE(SUM(charge_amount),0) as v FROM claims WHERE denial_code IS NOT NULL",
            )
            .get(),
    );
    const writeoff = num(
        db
            .prepare(
                "SELECT COALESCE(SUM(charge_amount),0) as v FROM claims WHERE aging_days > 180 AND denial_code IS NOT NULL",
            )
            .get(),
    );
    return {
        text: `Revenue leakage analysis: Total leakage **$${leakage.toLocaleString("en-US", { minimumFractionDigits: 2 })}**. Denied AR: **$${denialValue.toLocaleString("en-US", { minimumFractionDigits: 2 })}**. Potential write-offs: **$${writeoff.toLocaleString("en-US", { minimumFractionDigits: 2 })}**.`,
        metrics: [
            { label: "Revenue Leakage", value: `$${Math.round(leakage).toLocaleString()}` },
            { label: "Denied AR", value: `$${Math.round(denialValue).toLocaleString()}` },
            { label: "Write-off Risk", value: `$${Math.round(writeoff).toLocaleString()}` },
        ],
    };
}

function handleCleanClaimRate(db: Database.Database): Record<string, unknown> {
    const total = num(db.prepare("SELECT COUNT(*) as c FROM claims").get());
    const denied = num(
        db.prepare("SELECT COUNT(*) as c FROM claims WHERE denial_code IS NOT NULL").get(),
    );
    const rate = total ? Math.round(((total - denied) / total) * 1000) / 10 : 0;
    return {
        text: `Clean claim rate is **${rate}%** (${total - denied} of ${total} claims processed without denial). Industry target is 95%+. ${rate >= 95 ? "On track!" : "Below benchmark — review front-end edits and eligibility verification."}`,
        metrics: [
            { label: "Clean Claim Rate", value: `${rate}%` },
            { label: "Clean Claims", value: String(total - denied) },
            { label: "Total Claims", value: String(total) },
        ],
    };
}

function handleTflRisk(db: Database.Database): Record<string, unknown> {
    const count = num(
        db
            .prepare(
                "SELECT COUNT(*) as c FROM claims WHERE aging_days > 120 AND denial_code IS NULL",
            )
            .get(),
    );
    const value = num(
        db
            .prepare(
                "SELECT COALESCE(SUM(charge_amount),0) as v FROM claims WHERE aging_days > 120 AND denial_code IS NULL",
            )
            .get(),
    );
    return {
        text: `**${count} claims** at risk of timely filing expiration, valued at **$${value.toLocaleString("en-US", { minimumFractionDigits: 2 })}**. These claims are over 120 days old and need immediate submission or follow-up.`,
        metrics: [
            { label: "TFL Risk Claims", value: String(count) },
            { label: "At-Risk Value", value: `$${Math.round(value).toLocaleString()}` },
        ],
    };
}

function handleUnworked(db: Database.Database): Record<string, unknown> {
    const count = num(
        db
            .prepare(
                `SELECT COUNT(*) as c FROM claims WHERE claim_status IN ('Created','Submitted','No Response')`,
            )
            .get(),
    );
    const value = num(
        db
            .prepare(
                `SELECT COALESCE(SUM(charge_amount),0) as v FROM claims WHERE claim_status IN ('Created','Submitted','No Response')`,
            )
            .get(),
    );
    return {
        text: `**${count} unworked claims** in the backlog, valued at **$${value.toLocaleString("en-US", { minimumFractionDigits: 2 })}**. These claims have not been actively worked and require assignment to AR executives.`,
        metrics: [
            { label: "Unworked Claims", value: String(count) },
            { label: "Backlog Value", value: `$${Math.round(value).toLocaleString()}` },
        ],
    };
}

function handleAppeals(db: Database.Database): Record<string, unknown> {
    const count = num(
        db.prepare("SELECT COUNT(*) as c FROM claims WHERE claim_status = 'Appealed'").get(),
    );
    const value = num(
        db
            .prepare(
                "SELECT COALESCE(SUM(charge_amount),0) as v FROM claims WHERE claim_status = 'Appealed'",
            )
            .get(),
    );
    return {
        text: `**${count} claims** currently in appeal status, valued at **$${value.toLocaleString("en-US", { minimumFractionDigits: 2 })}**. Monitor appeal deadlines to prevent missed filing windows.`,
        metrics: [
            { label: "Appeals Pending", value: String(count) },
            { label: "Appeal Value", value: `$${Math.round(value).toLocaleString()}` },
        ],
    };
}

function handleUnderpayment(db: Database.Database): Record<string, unknown> {
    const count = num(
        db
            .prepare(
                `SELECT COUNT(*) as c FROM claims WHERE paid_amount IS NOT NULL AND allowed_amount IS NOT NULL AND paid_amount < allowed_amount`,
            )
            .get(),
    );
    const value = num(
        db
            .prepare(
                `SELECT COALESCE(SUM(allowed_amount - paid_amount),0) as v FROM claims 
         WHERE paid_amount IS NOT NULL AND allowed_amount IS NOT NULL AND paid_amount < allowed_amount`,
            )
            .get(),
    );
    return {
        text: `**${count} underpaid claims** detected with total underpayment of **$${value.toLocaleString("en-US", { minimumFractionDigits: 2 })}**. These should be reviewed against contracted fee schedules.`,
        metrics: [
            { label: "Underpaid Claims", value: String(count) },
            { label: "Underpayment Value", value: `$${Math.round(value).toLocaleString()}` },
        ],
    };
}

function handleStatusBreakdown(db: Database.Database): Record<string, unknown> {
    const statuses = [
        "Created",
        "Submitted",
        "Rejected",
        "Received",
        "No Response",
        "In Process",
        "Denied",
        "Paid",
        "Appealed",
        "Resolved",
    ];
    const data: { name: string; value: number; count: number }[] = [];
    for (const status of statuses) {
        const c = num(
            db.prepare("SELECT COUNT(*) as c FROM claims WHERE claim_status = ?").get(status),
        );
        if (c > 0) {
            data.push({ name: status, value: c, count: c });
        }
    }
    const total = data.reduce((a, d) => a + d.count, 0);
    return {
        text: `Claim status distribution across all ${total} claims:`,
        chart: { type: "bar", title: "Claim Status Distribution", data },
    };
}

function handleHelp(): Record<string, unknown> {
    return {
        text: `I can help you analyze your RCM data. Try asking questions like:

• **"What is the total AR over 90 days?"** — AR aging analysis
• **"Which payer has the highest denial rate?"** — Payer denial comparison
• **"Show AR aging by specialty"** — Specialty breakdown
• **"What is the denial rate?"** — Overall denial metrics
• **"Show collection rate"** — Gross and net collection rates
• **"Show payer performance"** — Payer comparison with charges vs paid
• **"What are the top denial codes?"** — Denial code breakdown
• **"Show revenue leakage"** — Revenue gap analysis
• **"What is the clean claim rate?"** — Clean claim percentage
• **"Show timely filing risk"** — TFL risk analysis
• **"How many unworked claims?"** — Backlog analysis
• **"Show appeals status"** — Pending appeals
• **"Show underpayment analysis"** — Underpaid claims
• **"Show claim status breakdown"** — Status distribution`,
        metrics: [],
    };
}

const HANDLERS: Record<string, (db: Database.Database) => Record<string, unknown>> = {
    ar_over_90: handleArOver90,
    denial_rate: handleDenialRate,
    denial_by_payer: handleDenialByPayer,
    ar_by_specialty: handleArBySpecialty,
    total_ar: handleTotalAr,
    high_risk: handleHighRisk,
    collection_rate: handleCollectionRate,
    payer_performance: handlePayerPerformance,
    denial_codes: handleDenialCodes,
    revenue_leakage: handleRevenueLeakage,
    clean_claim_rate: handleCleanClaimRate,
    tfl_risk: handleTflRisk,
    unworked: handleUnworked,
    appeals: handleAppeals,
    underpayment: handleUnderpayment,
    status_breakdown: handleStatusBreakdown,
    help: () => handleHelp(),
};

export function handleAiChat(db: Database.Database, message: string): Record<string, unknown> {
    const handlerName = matchQuery(message);
    if (handlerName && HANDLERS[handlerName]) {
        const result = HANDLERS[handlerName]!(db);
        return {
            response: result.text ?? "",
            chart: result.chart,
            table: result.table,
            metrics: result.metrics ?? [],
            query_type: handlerName,
        };
    }
    return {
        response:
            "I can help you analyze your RCM data. Try asking about AR aging, denial rates, payer performance, collection rates, risk indicators, or claim status. Type **'help'** to see all available queries.",
        chart: null,
        table: null,
        metrics: [],
        query_type: "unknown",
    };
}
