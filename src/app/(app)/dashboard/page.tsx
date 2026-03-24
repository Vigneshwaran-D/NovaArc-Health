import React, { Suspense } from "react";
import Dashboard from "@/views/Dashboard";

export default function DashboardPage(): React.ReactElement {
    return (
        <Suspense
            fallback={
                <div className="p-8 text-gray-500 text-sm">Loading dashboard…</div>
            }
        >
            <Dashboard />
        </Suspense>
    );
}
