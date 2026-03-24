"use client";

import React, { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import Layout from "@/components/Layout";

export default function AppSectionLayout({
    children,
}: {
    children: React.ReactNode;
}): React.ReactElement | null {
    const { user } = useAuth();
    const router = useRouter();
    const pathname = usePathname();

    useEffect(() => {
        if (!user) {
            router.replace("/login");
        }
    }, [user, router, pathname]);

    if (!user) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50 text-gray-500 text-sm">
                Loading…
            </div>
        );
    }

    return <Layout>{children}</Layout>;
}
