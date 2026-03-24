import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const inter = Inter({
    subsets: ["latin"],
    variable: "--font-inter",
});

export const metadata: Metadata = {
    title: "RCM AR Workflow Platform | NovaArc Health",
    description: "AI-Powered RCM Platform",
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>): React.ReactElement {
    return (
        <html lang="en">
            <body className={`${inter.variable} antialiased`}>
                <Providers>{children}</Providers>
            </body>
        </html>
    );
}
