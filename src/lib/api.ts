import axios from "axios";

const api = axios.create({
    baseURL: "/api",
    headers: { "Content-Type": "application/json" },
});

export const authAPI = {
    login: (credentials: unknown) => api.post("/auth/login", credentials),
    getUsers: () => api.get("/auth/users"),
};

export const claimsAPI = {
    getClaims: (params: Record<string, unknown>) => api.get("/claims", { params }),
    getClaim: (claimId: string) => api.get(`/claims/${claimId}`),
    investigate: (claimId: string) => api.post(`/claims/${claimId}/investigate`),
    generateAppeal: (claimId: string) => api.post(`/claims/${claimId}/appeal`),
    updateNotes: (claimId: string, notes: string) =>
        api.put(`/claims/${claimId}/notes`, { notes }),
    getFilters: () => api.get("/claims/filters"),
};

export const queuesAPI = {
    getQueues: () => api.get("/queues"),
    getQueueClaims: (queueName: string, params: Record<string, unknown>) =>
        api.get(`/queues/${encodeURIComponent(queueName)}/claims`, { params }),
};

export const analyticsAPI = {
    getSummary: () => api.get("/analytics/summary"),
    getDashboard: () => api.get("/analytics/dashboard"),
    getDrilldown: (dimension: string) => api.get("/analytics/drilldown", { params: { dimension } }),
    getPayerIntelligence: () => api.get("/analytics/payer-intelligence"),
    getRiskIndicators: () => api.get("/analytics/risk-indicators"),
    getAgingDistribution: () => api.get("/analytics/aging-distribution"),
    getDenialBreakdown: () => api.get("/analytics/denial-breakdown"),
    getPayerPerformance: () => api.get("/analytics/payer-performance"),
    getRiskDistribution: () => api.get("/analytics/risk-distribution"),
    getSpecialtyBreakdown: () => api.get("/analytics/specialty-breakdown"),
    getInsights: () => api.get("/analytics/insights"),
    getTeamDashboard: () => api.get("/analytics/team-dashboard"),
};

export const aiAPI = {
    chat: (message: string) => api.post("/ai/chat", { message }),
};

export const uploadAPI = {
    uploadClaims: (file: File) => {
        const formData = new FormData();
        formData.append("file", file);
        return api.post("/upload/claims", formData, {
            headers: { "Content-Type": "multipart/form-data" },
        });
    },
};

export const ediAPI = {
    getConnections: () => api.get("/edi/connections"),
    testConnection: (id: number) => api.get(`/edi/connections/${id}/test`),
    getTransactions: (params: Record<string, unknown>) => api.get("/edi/transactions", { params }),
    getTransaction: (txId: string) => api.get(`/edi/transactions/${txId}`),
    submit837: (data: unknown) => api.post("/edi/submit-837", data),
    submit276: (data: unknown) => api.post("/edi/submit-276", data),
    getTransactionTypes: () => api.get("/edi/transaction-types"),
    getSummary: () => api.get("/edi/summary"),
};

export const rpaAPI = {
    getBots: () => api.get("/rpa/bots"),
    runBot: (botId: string) => api.post(`/rpa/bots/${botId}/run`),
    getBotLogs: (botId: string, limit: number) =>
        api.get(`/rpa/bots/${botId}/logs`, { params: { limit } }),
    getBotTypes: () => api.get("/rpa/bot-types"),
    getSummary: () => api.get("/rpa/summary"),
    updateSchedule: (botId: string, data: unknown) =>
        api.post(`/rpa/bots/${botId}/schedule`, data),
};

export default api;
