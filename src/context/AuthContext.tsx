"use client";

import React, { createContext, useContext, useState } from "react";

export interface AuthUser {
    id: number;
    username: string;
    role: string;
    full_name: string;
    token?: string;
}

interface AuthContextValue {
    user: AuthUser | null;
    login: (userData: AuthUser) => void;
    logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }): React.ReactElement {
    const [user, setUser] = useState<AuthUser | null>(() => {
        if (typeof window === "undefined") {
            return null;
        }
        const stored = localStorage.getItem("rcm_user");
        return stored ? (JSON.parse(stored) as AuthUser) : null;
    });

    const login = (userData: AuthUser): void => {
        setUser(userData);
        localStorage.setItem("rcm_user", JSON.stringify(userData));
    };

    const logout = (): void => {
        setUser(null);
        localStorage.removeItem("rcm_user");
    };

    return (
        <AuthContext.Provider value={{ user, login, logout }}>{children}</AuthContext.Provider>
    );
}

export function useAuth(): AuthContextValue {
    const ctx = useContext(AuthContext);
    if (!ctx) {
        throw new Error("useAuth must be used within AuthProvider");
    }
    return ctx;
}
