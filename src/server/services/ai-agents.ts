const DENIAL_KNOWLEDGE_BASE: Record<
    string,
    { root_cause: string; action: string; confidence: number }
> = {
    "CO-4": {
        root_cause: "Procedure code inconsistent with modifier or place of service",
        action: "Review CPT/modifier combination and resubmit",
        confidence: 0.92,
    },
    "CO-16": {
        root_cause: "Claim/service lacks information or has submission/billing error",
        action: "Identify missing fields and resubmit with complete information",
        confidence: 0.88,
    },
    "CO-22": {
        root_cause: "Coordination of Benefits - Another payer may be primary",
        action: "Verify primary insurance, submit to correct payer first",
        confidence: 0.85,
    },
    "CO-29": {
        root_cause: "Timely filing limit exceeded based on payer contract",
        action: "Gather proof of timely filing (EDI confirmation, postmark) and appeal",
        confidence: 0.79,
    },
    "CO-45": {
        root_cause: "Charge exceeds fee schedule or contracted rate",
        action: "Accept contractual adjustment - no further action required",
        confidence: 0.97,
    },
    "CO-96": {
        root_cause: "Non-covered charge - not medically necessary per payer policy",
        action: "Submit appeal with medical necessity documentation and clinical notes",
        confidence: 0.81,
    },
    "CO-97": {
        root_cause: "Payment included in allowance for another service",
        action: "Review bundling rules - appeal if services are separately billable",
        confidence: 0.83,
    },
    "CO-109": {
        root_cause: "Claim not covered by this payer - may be covered by another",
        action: "Verify correct payer and resubmit or bill secondary",
        confidence: 0.86,
    },
    "CO-167": {
        root_cause: "Diagnosis is not covered based on payer LCD/NCD policy",
        action: "Review diagnosis codes and submit appeal with clinical justification",
        confidence: 0.8,
    },
    "CO-197": {
        root_cause: "Precertification or authorization absent or exceeded",
        action: "Request retroactive authorization immediately; escalate if urgent",
        confidence: 0.94,
    },
    "PR-1": {
        root_cause: "Deductible amount applied to patient responsibility",
        action: "Bill patient for deductible amount per EOB",
        confidence: 0.96,
    },
    "PR-2": {
        root_cause: "Coinsurance amount applied to patient responsibility",
        action: "Bill patient for coinsurance per EOB",
        confidence: 0.96,
    },
    "PR-3": {
        root_cause: "Co-payment amount due from patient",
        action: "Collect copay from patient",
        confidence: 0.96,
    },
    "OA-23": {
        root_cause: "Payment adjusted to contracted fee schedule amount",
        action: "Accept payment - contractual adjustment only",
        confidence: 0.95,
    },
};

function pickWeighted<T>(items: T[], weights: number[]): T {
    const total = weights.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    for (let i = 0; i < items.length; i++) {
        r -= weights[i] ?? 0;
        if (r < 0) {
            return items[i]!;
        }
    }
    return items[items.length - 1]!;
}

export function runClaimStatusAgent(claim: Record<string, unknown>): Record<string, unknown> {
    const statusOptions = ["Received", "In Process", "Paid", "Denied", "Pending Review"];
    const weights = [0.15, 0.25, 0.3, 0.2, 0.1];

    let status: string;
    if (claim.denial_code) {
        status = "Denied";
    } else if ((Number(claim.paid_amount) || 0) > 0) {
        status = "Paid";
    } else {
        status = pickWeighted(statusOptions, weights);
    }

    return {
        agent: "Claim Status Agent",
        status: "completed",
        result: {
            claim_status: status,
            payer_reference: `REF-${Math.floor(Math.random() * 900000) + 100000}`,
            last_checked: new Date().toISOString(),
            estimated_payment_date:
                status === "Denied" || status === "Pending Review" ? "N/A" : "7-14 business days",
        },
        confidence: Math.round((0.82 + Math.random() * 0.16) * 100) / 100,
    };
}

export function runEligibilityAgent(claim: Record<string, unknown>): Record<string, unknown> {
    const payer = String(claim.payer ?? "");
    const denialCode = String(claim.denial_code ?? "");

    let coverageStatus: string;
    let patientResponsibility: number;
    if (["CO-22", "PR-1", "PR-2", "PR-3"].includes(denialCode)) {
        coverageStatus = "Coverage Issue Detected";
        patientResponsibility = Math.round((50 + Math.random() * 450) * 100) / 100;
    } else {
        coverageStatus = "Coverage Active";
        patientResponsibility = Math.round(Math.random() * 150 * 100) / 100;
    }

    const plans = ["PPO", "HMO", "EPO", "POS", "HDHP"];

    return {
        agent: "Eligibility Agent",
        status: "completed",
        result: {
            coverage_status: coverageStatus,
            payer,
            plan_type: plans[Math.floor(Math.random() * plans.length)],
            patient_responsibility: `$${patientResponsibility.toFixed(2)}`,
            in_network: Math.random() < 0.75,
            effective_date: "01/01/2025",
            termination_date: "12/31/2025",
            deductible_met: Math.random() > 0.5,
            out_of_pocket_remaining: `$${(Math.random() * 3000).toFixed(2)}`,
        },
        confidence: Math.round((0.85 + Math.random() * 0.12) * 100) / 100,
    };
}

export function runAuthorizationAgent(claim: Record<string, unknown>): Record<string, unknown> {
    const authRequired = Boolean(claim.auth_required);
    const denialCode = String(claim.denial_code ?? "");

    let authStatus: string;
    let action: string;
    if (denialCode === "CO-197") {
        authStatus = "Authorization Missing";
        action = "Request Retro Authorization Immediately";
    } else if (authRequired) {
        authStatus =
            Math.random() < 0.66 ? "Authorization Present" : "Authorization Missing";
        action =
            authStatus === "Authorization Missing"
                ? "Retro Auth Required"
                : "Authorization Verified";
    } else {
        authStatus = "Authorization Not Required";
        action = "Proceed with claim processing";
    }

    return {
        agent: "Authorization Agent",
        status: "completed",
        result: {
            auth_status: authStatus,
            auth_number:
                authStatus.includes("Present") && !authStatus.includes("Missing")
                    ? `AUTH-${Math.floor(Math.random() * 90000) + 10000}`
                    : null,
            recommended_action: action,
            urgency: denialCode === "CO-197" ? "High" : "Normal",
        },
        confidence: Math.round((0.88 + Math.random() * 0.11) * 100) / 100,
    };
}

export function runDenialAnalysisAgent(claim: Record<string, unknown>): Record<string, unknown> {
    const denialCode = String(claim.denial_code ?? "");

    if (!denialCode) {
        return {
            agent: "Denial Analysis Agent",
            status: "completed",
            result: {
                denial_found: false,
                message: "No denial code present on this claim",
            },
            confidence: 0.99,
        };
    }

    const kbEntry = DENIAL_KNOWLEDGE_BASE[denialCode] ?? {
        root_cause: `Unknown denial reason for code ${denialCode}`,
        action: "Manual review required",
        confidence: 0.6,
    };

    return {
        agent: "Denial Analysis Agent",
        status: "completed",
        result: {
            denial_found: true,
            denial_code: denialCode,
            denial_description: claim.denial_description ?? "",
            root_cause: kbEntry.root_cause,
            recommended_action: kbEntry.action,
            appeal_window: `${[30, 60, 90, 180][Math.floor(Math.random() * 4)]} days`,
            recovery_probability: `${Math.floor(Math.random() * 48) + 45}%`,
        },
        confidence: kbEntry.confidence,
    };
}

export function runAllAgents(claim: Record<string, unknown>): Record<string, unknown>[] {
    return [
        runClaimStatusAgent(claim),
        runEligibilityAgent(claim),
        runAuthorizationAgent(claim),
        runDenialAnalysisAgent(claim),
    ];
}
