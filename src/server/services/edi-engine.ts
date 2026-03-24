export const PAYER_EDI_CONFIGS: Record<string, { payer_id: string; endpoint: string; format: string }> = {
    Aetna: { payer_id: "60054", endpoint: "edi.aetna.com:5500", format: "ANSI X12" },
    "Blue Cross Blue Shield": { payer_id: "BCBS0", endpoint: "edi.bcbs.com:5500", format: "ANSI X12" },
    Cigna: { payer_id: "62308", endpoint: "edi.cigna.com:5500", format: "ANSI X12" },
    UnitedHealthcare: { payer_id: "87726", endpoint: "edi.uhc.com:5500", format: "ANSI X12" },
    Humana: { payer_id: "61101", endpoint: "edi.humana.com:5500", format: "ANSI X12" },
    Medicare: { payer_id: "00882", endpoint: "edi.cms.gov:5500", format: "ANSI X12" },
    "Medicaid - State": { payer_id: "77027", endpoint: "edi.medicaid.gov:5500", format: "ANSI X12" },
    "Molina Healthcare": { payer_id: "20554", endpoint: "edi.molinahealthcare.com:5500", format: "ANSI X12" },
    Anthem: { payer_id: "47198", endpoint: "edi.anthem.com:5500", format: "ANSI X12" },
    Centene: { payer_id: "68069", endpoint: "edi.centene.com:5500", format: "ANSI X12" },
    Optum: { payer_id: "41211", endpoint: "edi.optum.com:5500", format: "ANSI X12" },
    WellCare: { payer_id: "34192", endpoint: "edi.wellcare.com:5500", format: "ANSI X12" },
};

export const TRANSACTION_TYPES: Record<string, { name: string; direction: string }> = {
    "837P": { name: "Professional Claim Submission", direction: "Outbound" },
    "837I": { name: "Institutional Claim Submission", direction: "Outbound" },
    "835": { name: "Payment/Remittance Advice", direction: "Inbound" },
    "276/277": { name: "Claim Status Inquiry", direction: "Outbound" },
    "270/271": { name: "Eligibility Inquiry", direction: "Outbound" },
    "278": { name: "Prior Authorization Request", direction: "Outbound" },
    "999": { name: "Acknowledgment", direction: "Inbound" },
};

function padNum(n: number, len: number): string {
    return String(n).padStart(len, "0");
}

export function generateEdi837Segment(claim: Record<string, unknown>): string {
    const now = new Date();
    const isaDate = padNum(now.getFullYear() % 100, 2) + padNum(now.getMonth() + 1, 2) + padNum(now.getDate(), 2);
    const isaTime = padNum(now.getHours(), 2) + padNum(now.getMinutes(), 2);
    const controlNum = String(Math.floor(Math.random() * 900000000) + 100000000);
    const payerId = String(claim.payer_id ?? "PAYERID");
    const claimId = String(claim.claim_id ?? "CLM001");
    const charge = Number(claim.charge_amount ?? 0);
    const patientName = String(claim.patient_name ?? "PATIENT");
    const parts = patientName.split(/\s+/);
    const lastName = parts.length > 1 ? parts[parts.length - 1] : patientName;
    const firstName = parts[0] ?? patientName;
    const dos = String(claim.dos ?? "20250101").replace(/-/g, "");

    return `ISA*00*          *00*          *ZZ*SUBMITTER_ID   *ZZ*${payerId}       *${isaDate}*${isaTime}*^*00501*${controlNum}*0*P*:~
GS*HC*SUBMITTER_ID*${payerId}*${now.getFullYear()}${padNum(now.getMonth() + 1, 2)}${padNum(now.getDate(), 2)}*${isaTime}*1*X*005010X222A1~
ST*837*0001*005010X222A1~
BHT*0019*00*${claimId}*${now.getFullYear()}${padNum(now.getMonth() + 1, 2)}${padNum(now.getDate(), 2)}*${isaTime}*CH~
NM1*41*1*${String(claim.provider ?? "PROVIDER")}****46*${Math.floor(Math.random() * 9000000000) + 1000000000}~
NM1*40*2*${String(claim.payer ?? "PAYER")}****46*${payerId}~
NM1*IL*1*${lastName}*${firstName}****MI*${String(claim.insurance_id ?? "INS123456789")}~
CLM*${claimId}*${charge.toFixed(2)}***11:B:1*Y*A*Y*I~
DTP*472*D8*${dos}~
SV1*HC:${String(claim.cpt ?? "99213")}*${charge.toFixed(2)}*UN*1***1~
SE*12*0001~
GE*1*1~
IEA*1*${controlNum}~`;
}

export function generateEdi276Segment(claim: Record<string, unknown>): string {
    const now = new Date();
    const controlNum = String(Math.floor(Math.random() * 900000000) + 100000000);
    const payerId = String(claim.payer_id ?? "PAYERID");
    const claimId = String(claim.claim_id ?? "CLM001");
    const patientName = String(claim.patient_name ?? "PATIENT");
    const parts = patientName.split(/\s+/);
    const lastName = parts.length > 1 ? parts[parts.length - 1] : patientName;
    const firstName = parts[0] ?? patientName;
    const dos = String(claim.dos ?? "20250101").replace(/-/g, "");
    const ymd =
        `${now.getFullYear()}${padNum(now.getMonth() + 1, 2)}${padNum(now.getDate(), 2)}`;
    const hm = `${padNum(now.getHours(), 2)}${padNum(now.getMinutes(), 2)}`;

    return `ISA*00*          *00*          *ZZ*SUBMITTER_ID   *ZZ*${payerId}       *${ymd.slice(2)}*${hm}*^*00501*${controlNum}*0*P*:~
GS*HR*SUBMITTER_ID*${payerId}*${ymd}*${hm}*1*X*005010X212~
ST*276*0001*005010X212~
BHT*0010*13*${claimId}*${ymd}*${hm}~
NM1*41*1*${String(claim.provider ?? "PROVIDER")}****46*${Math.floor(Math.random() * 9000000000) + 1000000000}~
NM1*PR*2*${String(claim.payer ?? "PAYER")}****PI*${payerId}~
NM1*IL*1*${lastName}*${firstName}****MI*${String(claim.insurance_id ?? "INS123456789")}~
TRN*1*${claimId}*SUBMITTER_ID~
DTP*472*D8*${dos}~
SE*9*0001~
GE*1*1~
IEA*1*${controlNum}~`;
}

export function simulateEdi277Response(claim: Record<string, unknown>): Record<string, unknown> {
    const statusOptions = [
        { code: "A1", description: "Claim Acknowledged/Forwarded", category: "Acknowledged" },
        { code: "A2", description: "Claim Accepted", category: "Accepted" },
        { code: "A3", description: "Claim Rejected - Missing/Invalid Information", category: "Rejected" },
        { code: "A4", description: "Claim Pending - Additional Information Needed", category: "Pending" },
        { code: "F1", description: "Finalized - Paid", category: "Finalized" },
        { code: "F2", description: "Finalized - Denied", category: "Finalized" },
    ];

    let status: (typeof statusOptions)[0];
    if (claim.denial_code) {
        const pool = statusOptions.filter((s) => ["A3", "F2", "A4"].includes(s.code));
        status = pool[Math.floor(Math.random() * pool.length)]!;
    } else if (claim.paid_amount && Number(claim.paid_amount) > 0) {
        status = statusOptions[4]!;
    } else {
        status = statusOptions[Math.floor(Math.random() * statusOptions.length)]!;
    }

    return {
        claim_id: claim.claim_id,
        payer_claim_ref: `PCN-${Math.floor(Math.random() * 900000) + 100000}`,
        status_code: status.code,
        status_description: status.description,
        category: status.category,
        effective_date: new Date().toISOString().slice(0, 10),
        total_charged: claim.charge_amount ?? 0,
        total_paid: claim.paid_amount ?? 0,
    };
}
