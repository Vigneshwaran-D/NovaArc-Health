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

export function analyticsSummary(db: Database.Database): Record<string, unknown> {
    const totalClaims = num(db.prepare("SELECT COUNT(*) as c FROM claims").get());
    const row = db
        .prepare(
            `SELECT 
        COALESCE(SUM(charge_amount),0) as total_ar,
        COALESCE(SUM(paid_amount),0) as total_paid,
        COALESCE(SUM(allowed_amount),0) as total_allowed
      FROM claims`,
        )
        .get() as { total_ar: number; total_paid: number; total_allowed: number };
    const deniedClaims = num(
        db.prepare("SELECT COUNT(*) as c FROM claims WHERE denial_code IS NOT NULL").get(),
    );
    const highRisk = num(
        db.prepare("SELECT COUNT(*) as c FROM claims WHERE risk_score = 'High'").get(),
    );
    const avgAging = num(db.prepare("SELECT AVG(aging_days) as a FROM claims").get());
    const paidClaims = num(
        db.prepare("SELECT COUNT(*) as c FROM claims WHERE claim_status = 'Paid'").get(),
    );
    const resolvedClaims = num(
        db.prepare("SELECT COUNT(*) as c FROM claims WHERE claim_status = 'Resolved'").get(),
    );

    const totalAr = num(row.total_ar);
    const totalPaid = num(row.total_paid);
    const totalAllowed = num(row.total_allowed);
    const grossCollection = totalAr ? Math.round((totalPaid / totalAr) * 1000) / 10 : 0;
    const netCollection = totalAllowed
        ? Math.round((totalPaid / totalAllowed) * 1000) / 10
        : 0;
    const cleanClaimRate = totalClaims
        ? Math.round(((totalClaims - deniedClaims) / totalClaims) * 1000) / 10
        : 0;

    return {
        total_claims: totalClaims,
        total_ar_value: Math.round(totalAr * 100) / 100,
        total_paid: Math.round(totalPaid * 100) / 100,
        total_allowed: Math.round(totalAllowed * 100) / 100,
        denied_claims: deniedClaims,
        denial_rate: totalClaims
            ? Math.round((deniedClaims / totalClaims) * 1000) / 10
            : 0,
        high_risk_count: highRisk,
        avg_aging_days: Math.round(avgAging * 10) / 10,
        paid_claims: paidClaims,
        resolved_claims: resolvedClaims,
        gross_collection_rate: grossCollection,
        net_collection_rate: netCollection,
        clean_claim_rate: cleanClaimRate,
        revenue_leakage: Math.round((totalAr - totalPaid) * 100) / 100,
    };
}

export function analyticsDashboard(db: Database.Database): Record<string, unknown> {
    const s = analyticsSummary(db) as Record<string, number>;
    const totalClaims = s.total_claims;
    const totalAr = s.total_ar_value;
    const totalPaid = s.total_paid;
    const totalAllowed = s.total_allowed;
    const deniedClaims = s.denied_claims;
    const highRisk = s.high_risk_count;
    const avgAging = s.avg_aging_days;

    const arOver90 = num(
        db.prepare("SELECT COUNT(*) as c FROM claims WHERE aging_days > 90").get(),
    );
    const arOver90Value = num(
        db
            .prepare("SELECT COALESCE(SUM(charge_amount),0) as v FROM claims WHERE aging_days > 90")
            .get(),
    );
    const highBalance = num(
        db.prepare("SELECT COUNT(*) as c FROM claims WHERE charge_amount >= 5000").get(),
    );
    const highBalanceValue = num(
        db
            .prepare(
                "SELECT COALESCE(SUM(charge_amount),0) as v FROM claims WHERE charge_amount >= 5000",
            )
            .get(),
    );
    const appealed = num(
        db.prepare("SELECT COUNT(*) as c FROM claims WHERE claim_status = 'Appealed'").get(),
    );
    const appealedValue = num(
        db
            .prepare(
                "SELECT COALESCE(SUM(charge_amount),0) as v FROM claims WHERE claim_status = 'Appealed'",
            )
            .get(),
    );
    const unworked = num(
        db
            .prepare(
                `SELECT COUNT(*) as c FROM claims WHERE claim_status IN ('Created','Submitted','No Response')`,
            )
            .get(),
    );
    const unworkedValue = num(
        db
            .prepare(
                `SELECT COALESCE(SUM(charge_amount),0) as v FROM claims WHERE claim_status IN ('Created','Submitted','No Response')`,
            )
            .get(),
    );
    const tflRisk = num(
        db
            .prepare(
                "SELECT COUNT(*) as c FROM claims WHERE aging_days > 120 AND denial_code IS NULL",
            )
            .get(),
    );
    const tflRiskValue = num(
        db
            .prepare(
                "SELECT COALESCE(SUM(charge_amount),0) as v FROM claims WHERE aging_days > 120 AND denial_code IS NULL",
            )
            .get(),
    );
    const highValueAtRisk = num(
        db
            .prepare(
                "SELECT COUNT(*) as c FROM claims WHERE charge_amount >= 10000 AND risk_score = 'High'",
            )
            .get(),
    );
    const highValueAtRiskVal = num(
        db
            .prepare(
                "SELECT COALESCE(SUM(charge_amount),0) as v FROM claims WHERE charge_amount >= 10000 AND risk_score = 'High'",
            )
            .get(),
    );
    const underpaymentVal = num(
        db
            .prepare(
                `SELECT COALESCE(SUM(allowed_amount - paid_amount),0) as v FROM claims 
         WHERE paid_amount IS NOT NULL AND allowed_amount IS NOT NULL AND paid_amount < allowed_amount`,
            )
            .get(),
    );
    const denialValue = num(
        db
            .prepare(
                "SELECT COALESCE(SUM(charge_amount),0) as v FROM claims WHERE denial_code IS NOT NULL",
            )
            .get(),
    );
    const writeoffValue = num(
        db
            .prepare(
                "SELECT COALESCE(SUM(charge_amount),0) as v FROM claims WHERE aging_days > 180 AND denial_code IS NOT NULL",
            )
            .get(),
    );
    const denialRecovery = num(
        db
            .prepare(
                `SELECT COUNT(*) as c FROM claims WHERE claim_status IN ('Appealed','Resolved') AND denial_code IS NOT NULL`,
            )
            .get(),
    );
    const denialRecoveryRate = deniedClaims
        ? Math.round((denialRecovery / deniedClaims) * 1000) / 10
        : 0;
    const paidClaims = num(
        db.prepare("SELECT COUNT(*) as c FROM claims WHERE claim_status = 'Paid'").get(),
    );
    const resolvedClaims = num(
        db.prepare("SELECT COUNT(*) as c FROM claims WHERE claim_status = 'Resolved'").get(),
    );
    const inProcess = num(
        db.prepare("SELECT COUNT(*) as c FROM claims WHERE claim_status = 'In Process'").get(),
    );

    const grossCollection = totalAr ? Math.round((totalPaid / totalAr) * 1000) / 10 : 0;
    const netCollection = totalAllowed
        ? Math.round((totalPaid / totalAllowed) * 1000) / 10
        : 0;
    const cleanClaimRate = totalClaims
        ? Math.round(((totalClaims - deniedClaims) / totalClaims) * 1000) / 10
        : 0;

    return {
        revenue_health: {
            total_ar: Math.round(totalAr * 100) / 100,
            total_paid: Math.round(totalPaid * 100) / 100,
            total_allowed: Math.round(totalAllowed * 100) / 100,
            gross_collection_rate: grossCollection,
            net_collection_rate: netCollection,
            revenue_leakage: Math.round((totalAr - totalPaid) * 100) / 100,
            expected_reimbursement: Math.round(totalAllowed * 100) / 100,
            denial_value: Math.round(denialValue * 100) / 100,
            writeoff_value: Math.round(writeoffValue * 100) / 100,
        },
        ar_health: {
            ar_over_90_pct: totalClaims
                ? Math.round((arOver90 / totalClaims) * 1000) / 10
                : 0,
            ar_over_90_count: arOver90,
            ar_over_90_value: Math.round(arOver90Value * 100) / 100,
            high_balance_count: highBalance,
            high_balance_value: Math.round(highBalanceValue * 100) / 100,
            denied_ar_count: deniedClaims,
            denied_ar_value: Math.round(denialValue * 100) / 100,
            appealed_count: appealed,
            appealed_value: Math.round(appealedValue * 100) / 100,
        },
        denial_intelligence: {
            denial_rate: totalClaims
                ? Math.round((deniedClaims / totalClaims) * 1000) / 10
                : 0,
            denial_value: Math.round(denialValue * 100) / 100,
            denial_recovery_rate: denialRecoveryRate,
            writeoff_due_to_denial: Math.round(writeoffValue * 100) / 100,
            denied_claims: deniedClaims,
        },
        risk_indicators: {
            high_value_at_risk_count: highValueAtRisk,
            high_value_at_risk_value: Math.round(highValueAtRiskVal * 100) / 100,
            tfl_risk_count: tflRisk,
            tfl_risk_value: Math.round(tflRiskValue * 100) / 100,
            appeals_pending: appealed,
            appeals_value: Math.round(appealedValue * 100) / 100,
            underpayment_value: Math.round(underpaymentVal * 100) / 100,
            unworked_count: unworked,
            unworked_value: Math.round(unworkedValue * 100) / 100,
        },
        operational: {
            total_claims: totalClaims,
            avg_aging_days: Math.round(avgAging * 10) / 10,
            high_risk_count: highRisk,
            clean_claim_rate: cleanClaimRate,
            paid_claims: paidClaims,
            resolved_claims: resolvedClaims,
            in_process: inProcess,
            ar_backlog: unworked,
            denial_rate: totalClaims
                ? Math.round((deniedClaims / totalClaims) * 1000) / 10
                : 0,
        },
    };
}

export function analyticsDrilldown(db: Database.Database, dimension: string): unknown[] {
    let col = "payer";
    if (dimension === "specialty") {
        col = "specialty";
    } else if (dimension === "facility") {
        col = "provider";
    }

    const rows = db
        .prepare(
            `SELECT ${col} as name,
        COUNT(*) as total_claims,
        COALESCE(SUM(charge_amount),0) as total_charged,
        COALESCE(SUM(paid_amount),0) as total_paid,
        COALESCE(SUM(allowed_amount),0) as total_allowed,
        AVG(aging_days) as avg_aging
      FROM claims GROUP BY ${col} ORDER BY total_charged DESC`,
        )
        .all() as {
        name: string;
        total_claims: number;
        total_charged: number;
        total_paid: number;
        total_allowed: number;
        avg_aging: number;
    }[];

    return rows.map((r) => {
        const denied = num(
            db
                .prepare(
                    `SELECT COUNT(*) as c FROM claims WHERE ${col} = ? AND denial_code IS NOT NULL`,
                )
                .get(r.name),
        );
        const highR = num(
            db
                .prepare(
                    `SELECT COUNT(*) as c FROM claims WHERE ${col} = ? AND risk_score = 'High'`,
                )
                .get(r.name),
        );
        const ar90 = num(
            db
                .prepare(`SELECT COUNT(*) as c FROM claims WHERE ${col} = ? AND aging_days > 90`)
                .get(r.name),
        );
        return {
            name: r.name,
            total_claims: r.total_claims,
            total_charged: Math.round(num(r.total_charged) * 100) / 100,
            total_paid: Math.round(num(r.total_paid) * 100) / 100,
            total_allowed: Math.round(num(r.total_allowed) * 100) / 100,
            avg_aging: Math.round(num(r.avg_aging) * 10) / 10,
            denied_claims: denied,
            denial_rate: r.total_claims
                ? Math.round((denied / r.total_claims) * 1000) / 10
                : 0,
            high_risk: highR,
            ar_over_90: ar90,
        };
    });
}

export function analyticsPayerIntelligence(db: Database.Database): unknown[] {
    const rows = db
        .prepare(
            `SELECT payer,
        COUNT(*) as total_claims,
        COALESCE(SUM(charge_amount),0) as total_charged,
        COALESCE(SUM(paid_amount),0) as total_paid,
        COALESCE(SUM(allowed_amount),0) as total_allowed,
        AVG(aging_days) as avg_days_to_pay
      FROM claims GROUP BY payer ORDER BY total_charged DESC`,
        )
        .all() as {
        payer: string;
        total_claims: number;
        total_charged: number;
        total_paid: number;
        total_allowed: number;
        avg_days_to_pay: number;
    }[];

    return rows.map((r) => {
        const denied = num(
            db
                .prepare(
                    "SELECT COUNT(*) as c FROM claims WHERE payer = ? AND denial_code IS NOT NULL",
                )
                .get(r.payer),
        );
        const arOver60 = num(
            db
                .prepare(
                    "SELECT COALESCE(SUM(charge_amount),0) as v FROM claims WHERE payer = ? AND aging_days > 60",
                )
                .get(r.payer),
        );
        const underpaid = num(
            db
                .prepare(
                    `SELECT COALESCE(SUM(allowed_amount - paid_amount),0) as v FROM claims 
           WHERE payer = ? AND paid_amount IS NOT NULL AND allowed_amount IS NOT NULL AND paid_amount < allowed_amount`,
                )
                .get(r.payer),
        );
        const escalations = num(
            db
                .prepare(
                    `SELECT COUNT(*) as c FROM claims WHERE payer = ? AND claim_status IN ('Appealed','Rejected')`,
                )
                .get(r.payer),
        );
        const charged = num(r.total_charged);
        return {
            payer: r.payer,
            total_claims: r.total_claims,
            total_charged: Math.round(charged * 100) / 100,
            total_paid: Math.round(num(r.total_paid) * 100) / 100,
            avg_days_to_pay: Math.round(num(r.avg_days_to_pay) * 10) / 10,
            denial_rate: r.total_claims
                ? Math.round((denied / r.total_claims) * 1000) / 10
                : 0,
            underpayment_rate: Math.round((underpaid / (charged || 1)) * 1000) / 10,
            ar_over_60: Math.round(arOver60 * 100) / 100,
            escalations,
        };
    });
}

function claimToRiskRow(c: Record<string, unknown>): Record<string, unknown> {
    return {
        claim_id: c.claim_id,
        patient_name: c.patient_name,
        payer: c.payer,
        charge_amount: c.charge_amount,
        aging_days: c.aging_days,
        denial_code: c.denial_code,
        risk_score: c.risk_score,
        specialty: c.specialty,
        claim_status: c.claim_status,
    };
}

export function analyticsRiskIndicators(db: Database.Database): Record<string, unknown> {
    const highValue = db
        .prepare(
            "SELECT * FROM claims WHERE charge_amount >= 10000 AND risk_score = 'High' LIMIT 20",
        )
        .all();
    const tflRisk = db
        .prepare("SELECT * FROM claims WHERE aging_days > 120 AND denial_code IS NULL LIMIT 20")
        .all();
    const appealsRisk = db
        .prepare("SELECT * FROM claims WHERE claim_status = 'Appealed' LIMIT 20")
        .all();
    const underpaid = db
        .prepare(
            `SELECT * FROM claims WHERE paid_amount IS NOT NULL AND allowed_amount IS NOT NULL 
       AND paid_amount < allowed_amount LIMIT 20`,
        )
        .all();
    const unworked = db
        .prepare(
            `SELECT * FROM claims WHERE claim_status IN ('Created','Submitted','No Response') LIMIT 20`,
        )
        .all();

    const count = (q: string) => num(db.prepare(q).get());

    return {
        high_value_at_risk: highValue.map((c) => claimToRiskRow(c as Record<string, unknown>)),
        timely_filing_risk: tflRisk.map((c) => claimToRiskRow(c as Record<string, unknown>)),
        appeals_deadline_risk: appealsRisk.map((c) => claimToRiskRow(c as Record<string, unknown>)),
        underpayment_claims: underpaid.map((c) => claimToRiskRow(c as Record<string, unknown>)),
        unworked_ar: unworked.map((c) => claimToRiskRow(c as Record<string, unknown>)),
        counts: {
            high_value_at_risk: count(
                "SELECT COUNT(*) as c FROM claims WHERE charge_amount >= 10000 AND risk_score = 'High'",
            ),
            timely_filing_risk: count(
                "SELECT COUNT(*) as c FROM claims WHERE aging_days > 120 AND denial_code IS NULL",
            ),
            appeals_deadline_risk: count(
                "SELECT COUNT(*) as c FROM claims WHERE claim_status = 'Appealed'",
            ),
            underpayment: count(
                `SELECT COUNT(*) as c FROM claims WHERE paid_amount IS NOT NULL AND allowed_amount IS NOT NULL 
         AND paid_amount < allowed_amount`,
            ),
            unworked: count(
                `SELECT COUNT(*) as c FROM claims WHERE claim_status IN ('Created','Submitted','No Response')`,
            ),
        },
    };
}

export function analyticsAgingDistribution(db: Database.Database): unknown[] {
    const buckets: [string, number, number][] = [
        ["0-30 Days", 0, 30],
        ["31-60 Days", 31, 60],
        ["61-90 Days", 61, 90],
        ["91-120 Days", 91, 120],
        [">120 Days", 121, 99999],
    ];
    return buckets.map(([label, low, high]) => {
        const count = num(
            db
                .prepare(
                    "SELECT COUNT(*) as c FROM claims WHERE aging_days >= ? AND aging_days <= ?",
                )
                .get(low, high),
        );
        const value = num(
            db
                .prepare(
                    "SELECT COALESCE(SUM(charge_amount),0) as v FROM claims WHERE aging_days >= ? AND aging_days <= ?",
                )
                .get(low, high),
        );
        return { bucket: label, count, value: Math.round(value * 100) / 100 };
    });
}

export function analyticsDenialBreakdown(db: Database.Database): unknown[] {
    const rows = db
        .prepare(
            `SELECT denial_code, denial_description, COUNT(*) as count,
      COALESCE(SUM(charge_amount),0) as total_value
      FROM claims WHERE denial_code IS NOT NULL
      GROUP BY denial_code, denial_description ORDER BY count DESC`,
        )
        .all() as {
        denial_code: string;
        denial_description: string;
        count: number;
        total_value: number;
    }[];

    return rows.map((r) => ({
        denial_code: r.denial_code,
        description: r.denial_description ?? "",
        count: r.count,
        total_value: Math.round(num(r.total_value) * 100) / 100,
    }));
}

export function analyticsPayerPerformance(db: Database.Database): unknown[] {
    const rows = db
        .prepare(
            `SELECT payer, COUNT(*) as total_claims,
      COALESCE(SUM(charge_amount),0) as total_charged,
      COALESCE(SUM(paid_amount),0) as total_paid
      FROM claims GROUP BY payer ORDER BY total_charged DESC`,
        )
        .all() as {
        payer: string;
        total_claims: number;
        total_charged: number;
        total_paid: number;
    }[];

    return rows.map((r) => {
        const denied = num(
            db
                .prepare(
                    "SELECT COUNT(*) as c FROM claims WHERE payer = ? AND denial_code IS NOT NULL",
                )
                .get(r.payer),
        );
        return {
            payer: r.payer,
            total_claims: r.total_claims,
            total_charged: Math.round(num(r.total_charged) * 100) / 100,
            total_paid: Math.round(num(r.total_paid) * 100) / 100,
            denial_rate: r.total_claims
                ? Math.round((denied / r.total_claims) * 1000) / 10
                : 0,
        };
    });
}

export function analyticsRiskDistribution(db: Database.Database): unknown[] {
    return ["High", "Medium", "Low"].map((risk) => {
        const count = num(
            db.prepare("SELECT COUNT(*) as c FROM claims WHERE risk_score = ?").get(risk),
        );
        const value = num(
            db
                .prepare(
                    "SELECT COALESCE(SUM(charge_amount),0) as v FROM claims WHERE risk_score = ?",
                )
                .get(risk),
        );
        return { risk, count, value: Math.round(value * 100) / 100 };
    });
}

export function analyticsSpecialtyBreakdown(db: Database.Database): unknown[] {
    const rows = db
        .prepare(
            `SELECT specialty, COUNT(*) as count, COALESCE(SUM(charge_amount),0) as total_value
      FROM claims GROUP BY specialty ORDER BY count DESC`,
        )
        .all() as { specialty: string; count: number; total_value: number }[];

    return rows.map((r) => ({
        specialty: r.specialty,
        count: r.count,
        total_value: Math.round(num(r.total_value) * 100) / 100,
    }));
}

export function analyticsInsights(db: Database.Database): Record<string, unknown> {
    const total = num(db.prepare("SELECT COUNT(*) as c FROM claims").get());
    const authDenials = num(
        db.prepare("SELECT COUNT(*) as c FROM claims WHERE denial_code = 'CO-197'").get(),
    );
    const timelyFiling = num(
        db.prepare("SELECT COUNT(*) as c FROM claims WHERE denial_code = 'CO-29'").get(),
    );
    const aging120 = num(db.prepare("SELECT COUNT(*) as c FROM claims WHERE aging_days > 120").get());
    const highDollar = num(
        db.prepare("SELECT COUNT(*) as c FROM claims WHERE charge_amount >= 5000").get(),
    );
    const highRiskCount = num(
        db.prepare("SELECT COUNT(*) as c FROM claims WHERE risk_score = 'High'").get(),
    );

    const insights: string[] = [];
    if (total > 0) {
        const authPct = Math.round((authDenials / total) * 1000) / 10;
        if (authPct > 0) {
            insights.push(
                `Authorization denials (CO-197) represent ${authPct}% of the total AR backlog.`,
            );
        }
        const tfPct = Math.round((timelyFiling / total) * 1000) / 10;
        if (tfPct > 0) {
            insights.push(
                `Timely filing denials account for ${tfPct}% of claims — review submission workflows.`,
            );
        }
        const agingPct = Math.round((aging120 / total) * 1000) / 10;
        if (agingPct > 0) {
            insights.push(
                `${agingPct}% of claims are aged over 120 days and are at risk of write-off.`,
            );
        }
        const hdPct = Math.round((highDollar / total) * 1000) / 10;
        insights.push(
            `High-dollar claims (>$5,000) represent ${hdPct}% of inventory by volume.`,
        );
        const hrPct = Math.round((highRiskCount / total) * 1000) / 10;
        insights.push(
            `${hrPct}% of claims are classified as High Risk — immediate action recommended.`,
        );
    }

    const orthoAuth = num(
        db
            .prepare(
                "SELECT COUNT(*) as c FROM claims WHERE specialty = 'Orthopedic Surgery' AND denial_code = 'CO-197'",
            )
            .get(),
    );
    const orthoTotal = num(
        db
            .prepare("SELECT COUNT(*) as c FROM claims WHERE specialty = 'Orthopedic Surgery'")
            .get(),
    );
    if (orthoTotal > 0) {
        const orthoPct = Math.round((orthoAuth / orthoTotal) * 1000) / 10;
        insights.push(
            `Authorization denials represent ${orthoPct}% of AR backlog for orthopedic claims.`,
        );
    }

    return { insights };
}

export function analyticsTeamDashboard(db: Database.Database): Record<string, unknown> {
    const total = num(db.prepare("SELECT COUNT(*) as c FROM claims").get());
    const assigned = num(
        db.prepare("SELECT COUNT(*) as c FROM claims WHERE work_queue IS NOT NULL").get(),
    );
    const paidToday = num(
        db.prepare("SELECT COUNT(*) as c FROM claims WHERE claim_status = 'Paid'").get(),
    );
    const inProcess = num(
        db.prepare("SELECT COUNT(*) as c FROM claims WHERE claim_status = 'In Process'").get(),
    );
    const pending = num(
        db
            .prepare(
                `SELECT COUNT(*) as c FROM claims WHERE claim_status IN ('Created','Submitted','No Response')`,
            )
            .get(),
    );

    const queueRows = db
        .prepare(
            `SELECT work_queue as queue, COUNT(*) as count, COALESCE(SUM(charge_amount),0) as value
      FROM claims WHERE work_queue IS NOT NULL GROUP BY work_queue`,
        )
        .all() as { queue: string; count: number; value: number }[];

    return {
        total_claims: total,
        assigned_claims: assigned,
        unassigned_claims: total - assigned,
        claims_worked: paidToday + inProcess,
        claims_pending: pending,
        resolution_rate: total ? Math.round((paidToday / total) * 1000) / 10 : 0,
        queue_breakdown: queueRows.map((r) => ({
            queue: r.queue,
            count: r.count,
            value: Math.round(num(r.value) * 100) / 100,
        })),
    };
}
