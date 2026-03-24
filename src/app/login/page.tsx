"use client";

import React, { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import Login from "@/views/Login";

export default function LoginPage(): React.ReactElement {
    const { user } = useAuth();
    const router = useRouter();

    useEffect(() => {
        if (user) {
            router.replace("/dashboard");
        }
    }, [user, router]);

    if (user) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50 text-gray-500 text-sm">
                Redirecting…
            </div>
        );
    }

    return <Login />;
}
