export interface ClaimRiskInput {
    aging_days?: number;
    charge_amount?: number;
    denial_code?: string | null;
    auth_required?: boolean;
    payer?: string;
}

export function calculateRiskScore(claim: ClaimRiskInput): [number, string] {
    let score = 0;
    const aging = claim.aging_days ?? 0;
    if (aging > 120) {
        score += 35;
    } else if (aging > 90) {
        score += 25;
    } else if (aging > 60) {
        score += 15;
    } else if (aging > 30) {
        score += 8;
    }

    const charge = claim.charge_amount ?? 0;
    if (charge > 10000) {
        score += 30;
    } else if (charge > 5000) {
        score += 20;
    } else if (charge > 2000) {
        score += 10;
    } else if (charge > 1000) {
        score += 5;
    }

    if (claim.denial_code) {
        score += 25;
    }
    if (claim.auth_required) {
        score += 10;
    }
    const payer = (claim.payer ?? "").toLowerCase();
    if (payer.includes("medicaid")) {
        score += 5;
    }

    if (score >= 60) {
        return [Math.round(score * 10) / 10, "High"];
    }
    if (score >= 30) {
        return [Math.round(score * 10) / 10, "Medium"];
    }
    return [Math.round(score * 10) / 10, "Low"];
}

export function getRecommendedAction(claim: ClaimRiskInput): string {
    const denialCode = claim.denial_code ?? "";
    const aging = claim.aging_days ?? 0;

    if (!denialCode) {
        if (aging > 120) {
            return "Immediate Follow-Up - Aging Critical";
        }
        if (aging > 90) {
            return "Priority Follow-Up - Approaching Write-Off";
        }
        if (aging > 60) {
            return "Follow-Up Required";
        }
        return "Monitor - Within Normal Aging";
    }

    const denialMap: Record<string, string> = {
        "CO-4": "Correct CPT Code and Resubmit",
        "CO-16": "Add Missing Information and Resubmit",
        "CO-22": "Coordinate Benefits - Secondary Insurance",
        "CO-29": "Appeal - Timely Filing - Provide Proof",
        "CO-45": "Accept Contractual Adjustment",
        "CO-96": "Appeal with Medical Records",
        "CO-97": "Appeal - Duplicate Claim Investigation",
        "CO-109": "Appeal with Authorization Documentation",
        "CO-119": "Review Patient Responsibility",
        "CO-167": "Appeal with Medical Necessity Documentation",
        "CO-197": "Request Retro Authorization Immediately",
        "PR-1": "Bill Patient - Primary Coverage Applied",
        "PR-2": "Verify Coinsurance and Bill Patient",
        "PR-3": "Verify Deductible Status and Bill Patient",
        "PR-96": "Resubmit with Additional Documentation",
        "OA-23": "Adjust Billing to Contracted Rate",
        "PI-97": "Verify Benefits and Resubmit",
    };

    return denialMap[denialCode] ?? `Review Denial ${denialCode} and Appeal`;
}

export function assignWorkQueue(claim: ClaimRiskInput): string {
    const denialCode = claim.denial_code ?? "";
    const aging = claim.aging_days ?? 0;
    const charge = claim.charge_amount ?? 0;
    const payer = (claim.payer ?? "").toLowerCase();
    const authRequired = claim.auth_required ?? false;

    if (charge >= 5000) {
        return "High Dollar AR";
    }
    if (denialCode === "CO-197" || denialCode === "CO-109" || authRequired) {
        return "Authorization Denials";
    }
    if (["CO-22", "PR-1", "PR-2", "PR-3"].includes(denialCode)) {
        return "Eligibility Issues";
    }
    if (aging > 120) {
        return "Aging >120 Days";
    }
    if (payer.includes("medicaid")) {
        return "Medicaid Claims";
    }
    return "General AR";
}
