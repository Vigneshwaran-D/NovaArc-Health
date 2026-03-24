import { eq } from "drizzle-orm";
import {
    claims,
    ediConnections,
    ediTransactions,
    rpaBots,
    users,
    workQueues,
} from "@/lib/db/schema";
import { getDb, getSqlite } from "@/lib/db/index";
import {
    assignWorkQueue,
    calculateRiskScore,
    getRecommendedAction,
} from "@/server/services/risk-engine";
import { PAYER_EDI_CONFIGS } from "@/server/services/edi-engine";

const PAYERS = [
    "Aetna",
    "Blue Cross Blue Shield",
    "Cigna",
    "UnitedHealthcare",
    "Humana",
    "Medicare",
    "Medicaid - State",
    "Molina Healthcare",
    "Anthem",
    "Centene",
    "Optum",
    "WellCare",
];

const SPECIALTIES = [
    "Orthopedic Surgery",
    "Cardiology",
    "Primary Care",
    "Radiology",
    "Oncology",
    "Emergency Medicine",
    "Neurology",
    "Internal Medicine",
    "Pediatrics",
    "Obstetrics/Gynecology",
];

const PROVIDERS = [
    "Dr. James Mitchell",
    "Dr. Sarah Chen",
    "Dr. Robert Williams",
    "Dr. Maria Garcia",
    "Dr. David Johnson",
    "Dr. Lisa Thompson",
    "Dr. Michael Brown",
    "Dr. Jennifer Davis",
    "Dr. Carlos Rodriguez",
    "Dr. Amanda Wilson",
];

const CPT_CODES = [
    "99213",
    "99214",
    "99215",
    "27447",
    "27130",
    "93000",
    "71046",
    "70553",
    "99285",
    "27486",
    "93306",
    "45378",
    "66984",
    "29827",
];

const ICD_CODES = [
    "M17.11",
    "I10",
    "Z00.00",
    "J18.9",
    "E11.9",
    "M54.5",
    "K21.0",
    "F32.9",
    "J06.9",
    "N39.0",
    "R07.9",
    "Z79.4",
];

const DENIAL_CODES: [string, string][] = [
    ["CO-197", "Precertification/Authorization Absent"],
    ["CO-29", "Timely Filing Limit Exceeded"],
    ["CO-22", "Coordination of Benefits"],
    ["CO-96", "Non-covered charge - Not medically necessary"],
    ["CO-16", "Claim lacks information or has billing error"],
    ["CO-45", "Charge exceeds contracted fee schedule"],
    ["CO-4", "Procedure code inconsistent with modifier"],
    ["CO-167", "Diagnosis not covered per payer policy"],
    ["PR-1", "Deductible - Patient Responsibility"],
    ["PR-2", "Coinsurance - Patient Responsibility"],
    ["OA-23", "Payment adjusted to contracted amount"],
];

const FIRST_NAMES = [
    "James",
    "Mary",
    "John",
    "Patricia",
    "Robert",
    "Jennifer",
    "Michael",
    "Linda",
    "William",
    "Barbara",
    "David",
    "Elizabeth",
    "Richard",
    "Susan",
    "Joseph",
    "Jessica",
    "Thomas",
    "Sarah",
    "Charles",
    "Karen",
    "Christopher",
    "Lisa",
    "Daniel",
    "Nancy",
    "Matthew",
    "Betty",
    "Anthony",
    "Margaret",
    "Mark",
    "Sandra",
];

const LAST_NAMES = [
    "Smith",
    "Johnson",
    "Williams",
    "Brown",
    "Jones",
    "Garcia",
    "Miller",
    "Davis",
    "Rodriguez",
    "Martinez",
    "Hernandez",
    "Lopez",
    "Gonzalez",
    "Wilson",
    "Anderson",
    "Thomas",
    "Taylor",
    "Moore",
    "Jackson",
    "Martin",
    "Lee",
    "Perez",
    "Thompson",
    "White",
    "Harris",
];

function seedUsers(): void {
    const db = getDb();
    const rows = [
        {
            username: "clientlead",
            password: "nova123",
            role: "Client Leadership",
            fullName: "Client Leadership",
        },
        {
            username: "opslead",
            password: "nova123",
            role: "Operations Leadership",
            fullName: "Operations Leadership",
        },
        {
            username: "opsmgr",
            password: "nova123",
            role: "Operations Manager",
            fullName: "Operations Manager",
        },
        {
            username: "teamlead",
            password: "nova123",
            role: "Team Lead",
            fullName: "Team Lead",
        },
        {
            username: "arexec",
            password: "nova123",
            role: "AR Executive",
            fullName: "AR Executive",
        },
        {
            username: "qaauditor",
            password: "nova123",
            role: "QA Auditor",
            fullName: "QA Auditor",
        },
        {
            username: "s.baskaran",
            password: "password123",
            role: "Operations Manager",
            fullName: "S. Baskaran",
        },
        {
            username: "vigneshwaran.d",
            password: "password123",
            role: "AR Executive",
            fullName: "Vigneshwaran D",
        },
        {
            username: "shankara.m",
            password: "password123",
            role: "Team Lead",
            fullName: "Shankara M",
        },
    ];
    for (const u of rows) {
        const existing = db.select().from(users).where(eq(users.username, u.username)).limit(1).all()[0];
        if (!existing) {
            db.insert(users).values(u).run();
        } else if (existing.fullName !== u.fullName) {
            db.update(users).set({ fullName: u.fullName }).where(eq(users.username, u.username)).run();
        }
    }
}

function seedWorkQueues(): void {
    const db = getDb();
    const queues = [
        {
            name: "High Dollar AR",
            description: "Claims with charges over $5,000",
            priority: "Critical",
        },
        {
            name: "Authorization Denials",
            description: "CO-197 and auth-related denials",
            priority: "High",
        },
        {
            name: "Eligibility Issues",
            description: "Coordination of benefits and eligibility",
            priority: "High",
        },
        {
            name: "Aging >120 Days",
            description: "Claims aged over 120 days",
            priority: "Critical",
        },
        {
            name: "Medicaid Claims",
            description: "All Medicaid payer claims",
            priority: "Medium",
        },
        {
            name: "General AR",
            description: "Standard AR follow-up queue",
            priority: "Normal",
        },
    ];
    for (const q of queues) {
        const existing = db.select().from(workQueues).where(eq(workQueues.name, q.name)).limit(1).all()[0];
        if (!existing) {
            db.insert(workQueues).values(q).run();
        }
    }
}

function seedClaims(count = 300): void {
    const db = getDb();
    const existing = (
        getSqlite().prepare("SELECT COUNT(*) as c FROM claims").get() as { c: number }
    ).c;
    if (existing >= count) {
        return;
    }

    const baseDate = new Date("2025-01-01");
    const refDate = new Date("2026-03-06");
    const msPerDay = 86400000;

    const statusChoices = [
        "Created",
        "Submitted",
        "Submitted",
        "Rejected",
        "Received",
        "Received",
        "No Response",
        "In Process",
        "In Process",
        "Paid",
        "Paid",
        "Paid",
        "Appealed",
        "Resolved",
    ];

    for (let i = 1; i <= count; i++) {
        const patientName = `${FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)]} ${
            LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)]
        }`;
        const dosOffset = Math.floor(Math.random() * 341) + 10;
        const dos = new Date(baseDate.getTime() + dosOffset * msPerDay);
        const aging = Math.max(
            0,
            Math.floor((refDate.getTime() - dos.getTime()) / msPerDay),
        );

        const payer = PAYERS[Math.floor(Math.random() * PAYERS.length)]!;
        const specialty = SPECIALTIES[Math.floor(Math.random() * SPECIALTIES.length)]!;
        const provider = PROVIDERS[Math.floor(Math.random() * PROVIDERS.length)]!;
        const cpt = CPT_CODES[Math.floor(Math.random() * CPT_CODES.length)]!;
        const icd = ICD_CODES[Math.floor(Math.random() * ICD_CODES.length)]!;

        const chargeRoll = Math.random();
        let charge: number;
        if (chargeRoll < 0.25) {
            charge = Math.round((150 + Math.random() * 350) * 100) / 100;
        } else if (chargeRoll < 0.5) {
            charge = Math.round((500 + Math.random() * 1500) * 100) / 100;
        } else if (chargeRoll < 0.75) {
            charge = Math.round((2000 + Math.random() * 4000) * 100) / 100;
        } else {
            charge = Math.round((6000 + Math.random() * 19000) * 100) / 100;
        }

        const scenarioRoll = Math.random();
        let denialCode: string | null = null;
        let denialDesc: string | null = null;
        let authRequired = false;
        let authStatus: string | null = null;

        if (scenarioRoll < 0.22) {
            denialCode = "CO-197";
            denialDesc = "Precertification/Authorization Absent";
            authRequired = true;
            authStatus = "Missing";
        } else if (scenarioRoll < 0.35) {
            denialCode = "CO-29";
            denialDesc = "Timely Filing Limit Exceeded";
        } else if (scenarioRoll < 0.46) {
            denialCode = "CO-22";
            denialDesc = "Coordination of Benefits";
        } else if (scenarioRoll < 0.55) {
            denialCode = "CO-96";
            denialDesc = "Non-covered Charge";
        } else if (scenarioRoll < 0.62) {
            const pair = DENIAL_CODES[Math.floor(Math.random() * DENIAL_CODES.length)]!;
            denialCode = pair[0];
            denialDesc = pair[1];
            authRequired = Math.random() > 0.5;
            authStatus = authRequired ? "Present" : null;
        } else {
            authRequired = Math.random() < 0.25;
            authStatus = authRequired ? "Present" : null;
        }

        if (payer.includes("Medicaid")) {
            charge = Math.round(charge * 0.6 * 100) / 100;
        }

        let allowed: number | null = null;
        let paid: number | null = null;
        if (!denialCode) {
            allowed = Math.round(charge * (0.65 + Math.random() * 0.3) * 100) / 100;
            paid =
                Math.random() > 0.4
                    ? Math.round(allowed * (0.8 + Math.random() * 0.2) * 100) / 100
                    : null;
        }

        const elig = ["Verified", "Verified", "Pending", "Not Verified"];
        const claimData = {
            claimId: `CLM-${2025000 + i}`,
            patientName,
            patientDob: `${1940 + Math.floor(Math.random() * 66)}-${String(Math.floor(Math.random() * 12) + 1).padStart(2, "0")}-${String(Math.floor(Math.random() * 28) + 1).padStart(2, "0")}`,
            dos: dos.toISOString().slice(0, 10),
            payer,
            payerId: `PAY-${Math.floor(Math.random() * 9000) + 1000}`,
            cpt,
            icd,
            chargeAmount: charge,
            allowedAmount: allowed,
            paidAmount: paid,
            agingDays: aging,
            denialCode,
            denialDescription: denialDesc,
            provider,
            specialty,
            authRequired,
            authStatus,
            eligibilityStatus: elig[Math.floor(Math.random() * elig.length)],
            insuranceId: `INS${Math.floor(Math.random() * 900000000) + 100000000}`,
            groupNumber: `GRP${Math.floor(Math.random() * 90000) + 10000}`,
            claimStatus: denialCode
                ? "Denied"
                : statusChoices[Math.floor(Math.random() * statusChoices.length)]!,
        };

        const [riskVal, riskCat] = calculateRiskScore({
            aging_days: claimData.agingDays,
            charge_amount: claimData.chargeAmount,
            denial_code: claimData.denialCode,
            auth_required: claimData.authRequired,
            payer: claimData.payer,
        });

        db.insert(claims)
            .values({
                ...claimData,
                riskScoreValue: riskVal,
                riskScore: riskCat,
                recommendedAction: getRecommendedAction({
                    aging_days: claimData.agingDays,
                    denial_code: claimData.denialCode,
                }),
                workQueue: assignWorkQueue({
                    denial_code: claimData.denialCode,
                    aging_days: claimData.agingDays,
                    charge_amount: claimData.chargeAmount,
                    payer: claimData.payer,
                    auth_required: claimData.authRequired,
                }),
            })
            .run();
    }
}

function seedEdiConnections(): void {
    const db = getDb();
    const cnt =
        getSqlite().prepare("SELECT COUNT(*) as c FROM edi_connections").get() as { c: number };
    if (cnt.c > 0) {
        return;
    }
    const now = Date.now();
    for (const [payerName, config] of Object.entries(PAYER_EDI_CONFIGS)) {
        db.insert(ediConnections)
            .values({
                payerName,
                payerId: config.payer_id,
                connectionType: "SFTP/AS2",
                ediFormat: config.format,
                endpointUrl: config.endpoint,
                status: Math.random() < 0.75 ? "Active" : "Maintenance",
                lastTransmission: new Date(
                    now - (Math.floor(Math.random() * 72) + 1) * 3600000,
                ).toISOString(),
                successRate: Math.round((92 + Math.random() * 7.9) * 10) / 10,
                totalTransactions: Math.floor(Math.random() * 451) + 50,
            })
            .run();
    }
}

function seedEdiTransactions(): void {
    const db = getDb();
    const cnt =
        getSqlite().prepare("SELECT COUNT(*) as c FROM edi_transactions").get() as { c: number };
    if (cnt.c > 0) {
        return;
    }
    const txTypes = ["837P", "835", "276/277", "270/271", "999"];
    const directions: Record<string, string> = {
        "837P": "Outbound",
        "835": "Inbound",
        "276/277": "Outbound/Inbound",
        "270/271": "Outbound/Inbound",
        "999": "Inbound",
    };
    const statuses = ["Accepted", "Accepted", "Accepted", "Completed", "Rejected", "Pending"];

    for (let i = 0; i < 40; i++) {
        const txType = txTypes[Math.floor(Math.random() * txTypes.length)]!;
        const payer = PAYERS[Math.floor(Math.random() * PAYERS.length)]!;
        const claimCount = Math.floor(Math.random() * 50) + 1;
        const totalAmt = Math.round((500 + Math.random() * 49500) * 100) / 100;
        const status = statuses[Math.floor(Math.random() * statuses.length)]!;
        const submitted = new Date(
            Date.now() -
                Math.floor(Math.random() * 30) * 86400000 -
                Math.floor(Math.random() * 24) * 3600000,
        );

        db.insert(ediTransactions)
            .values({
                transactionId: `TX-${txType.replace(/\//g, "")}-${Math.floor(Math.random() * 900000) + 100000}`,
                connectionId: Math.floor(Math.random() * PAYERS.length) + 1,
                payerName: payer,
                transactionType: txType,
                direction: directions[txType] ?? "Outbound",
                status,
                claimCount,
                totalAmount: totalAmt,
                fileName: `${txType}_${payer.replace(/\s+/g, "_")}_${submitted.toISOString().slice(0, 10).replace(/-/g, "")}.edi`,
                responseCode: status === "Accepted" ? "TA1" : status === "Rejected" ? "999" : "277",
                responseMessage:
                    status === "Accepted"
                        ? "Batch accepted"
                        : status === "Rejected"
                          ? "Validation error"
                          : "Processing",
                submittedAt: submitted.toISOString(),
                completedAt: status !== "Pending" ? submitted.toISOString() : null,
            })
            .run();
    }
}

function seedRpaBots(): void {
    const db = getDb();
    const cnt = getSqlite().prepare("SELECT COUNT(*) as c FROM rpa_bots").get() as { c: number };
    if (cnt.c > 0) {
        return;
    }

    const botTypes: [string, string][] = [
        ["claim_status_checker", "Claim Status Checker"],
        ["eligibility_verifier", "Eligibility Verifier"],
        ["denial_retriever", "Denial/EOB Retriever"],
        ["prior_auth_submitter", "Prior Auth Submitter"],
        ["payment_poster", "Payment Poster"],
    ];

    const topPayers = [
        "Aetna",
        "Blue Cross Blue Shield",
        "Cigna",
        "UnitedHealthcare",
        "Humana",
        "Medicare",
        "Medicaid - State",
        "Anthem",
    ];

    let botNum = 0;
    for (const payer of topPayers) {
        const k = Math.floor(Math.random() * 3) + 2;
        const shuffled = [...botTypes].sort(() => Math.random() - 0.5);
        for (let j = 0; j < k; j++) {
            const [botType, botName] = shuffled[j]!;
            botNum += 1;
            const totalRuns = Math.floor(Math.random() * 191) + 10;
            const claimsProcessed = totalRuns * (Math.floor(Math.random() * 36) + 15);

            db.insert(rpaBots)
                .values({
                    botId: `BOT-${String(botNum).padStart(3, "0")}`,
                    botName: `${payer} - ${botName}`,
                    payerName: payer,
                    botType,
                    status: ["Idle", "Idle", "Idle", "Scheduled", "Error"][
                        Math.floor(Math.random() * 5)
                    ]!,
                    lastRun: new Date(
                        Date.now() - (Math.floor(Math.random() * 48) + 1) * 3600000,
                    ).toISOString(),
                    nextScheduled: new Date(
                        Date.now() + (Math.floor(Math.random() * 12) + 1) * 3600000,
                    ).toISOString(),
                    totalRuns,
                    successRate: Math.round((88 + Math.random() * 11.5) * 10) / 10,
                    claimsProcessed,
                    avgRunTime: `${Math.floor(Math.random() * 13) + 3}m ${Math.floor(Math.random() * 60)}s`,
                    credentialsStatus: ["Valid", "Valid", "Valid", "Valid", "Expiring Soon"][
                        Math.floor(Math.random() * 5)
                    ]!,
                })
                .run();
        }
    }
}

export function runSeedIfNeeded(): void {
    getSqlite();
    seedUsers();
    seedWorkQueues();
    seedClaims(300);
    seedEdiConnections();
    seedEdiTransactions();
    seedRpaBots();
}
