import type { InferSelectModel } from "drizzle-orm";
import type { claims } from "@/lib/db/schema";

export type ClaimRow = InferSelectModel<typeof claims>;

export function claimToApi(c: ClaimRow): Record<string, unknown> {
    return {
        id: c.id,
        claim_id: c.claimId,
        patient_name: c.patientName,
        patient_dob: c.patientDob,
        dos: c.dos,
        payer: c.payer,
        payer_id: c.payerId,
        cpt: c.cpt,
        icd: c.icd,
        charge_amount: c.chargeAmount,
        allowed_amount: c.allowedAmount,
        paid_amount: c.paidAmount,
        aging_days: c.agingDays,
        denial_code: c.denialCode,
        denial_description: c.denialDescription,
        provider: c.provider,
        specialty: c.specialty,
        risk_score: c.riskScore,
        risk_score_value: c.riskScoreValue,
        recommended_action: c.recommendedAction,
        claim_status: c.claimStatus,
        work_queue: c.workQueue,
        auth_required: c.authRequired,
        auth_status: c.authStatus,
        eligibility_status: c.eligibilityStatus,
        insurance_id: c.insuranceId,
        group_number: c.groupNumber,
        notes: c.notes,
    };
}
