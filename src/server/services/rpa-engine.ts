export const RPA_BOT_TEMPLATES: Record<
    string,
    { name: string; description: string; steps: string[] }
> = {
    claim_status_checker: {
        name: "Claim Status Checker",
        description: "Logs into payer portals to check claim status and download EOBs",
        steps: [
            "Opening browser instance...",
            "Navigating to payer portal login page...",
            "Entering credentials...",
            "Completing multi-factor authentication...",
            "Navigating to Claims section...",
            "Entering claim search criteria...",
            "Extracting claim status data...",
            "Downloading EOB documents...",
            "Updating internal system...",
            "Logging out and closing session...",
        ],
    },
    eligibility_verifier: {
        name: "Eligibility Verifier",
        description: "Verifies patient eligibility and benefits through payer portals",
        steps: [
            "Launching browser automation...",
            "Connecting to payer eligibility portal...",
            "Authenticating with stored credentials...",
            "Searching for member by ID...",
            "Extracting coverage details...",
            "Checking benefit limits and deductibles...",
            "Capturing copay/coinsurance information...",
            "Verifying prior authorization requirements...",
            "Recording results to database...",
            "Session cleanup complete...",
        ],
    },
    denial_retriever: {
        name: "Denial/EOB Retriever",
        description: "Retrieves denial letters and EOB documents from payer portals",
        steps: [
            "Initializing document retrieval bot...",
            "Connecting to payer document center...",
            "Authenticating session...",
            "Searching for unprocessed EOBs...",
            "Filtering by date range...",
            "Downloading PDF documents...",
            "Running OCR on scanned documents...",
            "Extracting denial codes and reasons...",
            "Categorizing documents by type...",
            "Upload complete, session closed...",
        ],
    },
    prior_auth_submitter: {
        name: "Prior Auth Submitter",
        description: "Submits prior authorization requests through payer portals",
        steps: [
            "Starting prior auth submission bot...",
            "Opening payer prior auth portal...",
            "Entering provider credentials...",
            "Navigating to new request form...",
            "Populating patient demographics...",
            "Entering procedure and diagnosis codes...",
            "Attaching clinical documentation...",
            "Submitting authorization request...",
            "Capturing reference number...",
            "Confirmation recorded, closing session...",
        ],
    },
    payment_poster: {
        name: "Payment Poster",
        description: "Downloads 835 remittance files and posts payments to claims",
        steps: [
            "Initializing payment posting bot...",
            "Connecting to clearinghouse portal...",
            "Downloading pending 835 files...",
            "Parsing remittance advice data...",
            "Matching payments to claims...",
            "Posting allowed amounts...",
            "Applying adjustments and write-offs...",
            "Identifying patient responsibility...",
            "Generating posting summary report...",
            "Batch posting complete...",
        ],
    },
};

export function simulateBotRun(
    botType: string,
    payer: string,
    claimCount?: number,
): Record<string, unknown> {
    const template = RPA_BOT_TEMPLATES[botType] ?? RPA_BOT_TEMPLATES.claim_status_checker;
    const numClaims =
        claimCount !== undefined && claimCount > 0
            ? claimCount
            : Math.floor(Math.random() * 71) + 10;
    const successCount = Math.floor(numClaims * (0.85 + Math.random() * 0.15));
    const errorCount = numClaims - successCount;
    const durationSeconds = Math.floor(Math.random() * 781) + 120;
    const durationStr = `${Math.floor(durationSeconds / 60)}m ${durationSeconds % 60}s`;

    const logLines: string[] = [];
    const timestamp = new Date();

    template.steps.forEach((step, i) => {
        const stepTime = new Date(timestamp.getTime() + i * (Math.floor(Math.random() * 23) + 8) * 1000);
        const statusIcon = Math.random() > 0.05 ? "OK" : "WARN";
        logLines.push(
            `[${stepTime.toTimeString().slice(0, 8)}] [${statusIcon}] ${step}`,
        );
        if (i === 5) {
            logLines.push(
                `[${stepTime.toTimeString().slice(0, 8)}] [INFO] Processing ${numClaims} claims for ${payer}...`,
            );
        }
    });

    const doneTime = new Date(timestamp.getTime() + durationSeconds * 1000);
    logLines.push(
        `[${doneTime.toTimeString().slice(0, 8)}] [DONE] Run complete: ${successCount} succeeded, ${errorCount} errors`,
    );

    const errorTypes = [
        "Session timeout during claim lookup",
        "Element not found: claim status field",
        "Portal returned unexpected error page",
        "CAPTCHA challenge encountered",
        "Network timeout connecting to payer",
        "Invalid member ID format detected",
    ];
    const errorDetails: string[] = [];
    for (let i = 0; i < Math.min(errorCount, 3); i++) {
        errorDetails.push(errorTypes[Math.floor(Math.random() * errorTypes.length)]!);
    }

    return {
        run_id: `RUN-${Math.floor(Math.random() * 900000) + 100000}`,
        bot_type: botType,
        bot_name: template.name,
        payer,
        status: errorCount < numClaims * 0.2 ? "Completed" : "Completed with Errors",
        claims_processed: numClaims,
        claims_updated: successCount,
        errors: errorCount,
        duration: durationStr,
        log_output: logLines.join("\n"),
        error_details: errorDetails,
        started_at: timestamp.toISOString(),
        completed_at: doneTime.toISOString(),
    };
}
